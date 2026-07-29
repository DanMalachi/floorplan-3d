"""Population-scale (not n=300 sample) conditional converter clean rate,
post lever #1 build (2026-07-29). classify_room_boundary_no_wall_match.py's
compute_conditional_clean_rate(n=300) is a fixed-size sample; this phase
has hit a sample-vs-population gap four times already (handoff Rule 2), so
the final number this build is judged on should be re-measured at full
population scale before being trusted, per the build plan's explicit
requirement. Reuses check_plan/convert_plan unchanged; only difference
from compute_conditional_clean_rate is running the FULL 17K in parallel
and reporting the same containment invariant.

CLI: python -m extraction.synth.qa.population_conditional_clean_rate [limit] [workers]
"""
from __future__ import annotations

import pickle
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from extraction.synth.qa.measure_clean_at_source import check_plan
from extraction.synth.resplan_convert import convert_plan

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"


def _score_one(raw_plan: dict) -> tuple:
    src_clean = check_plan(raw_plan)["clean_at_source"]
    _, stats = convert_plan(raw_plan)
    conv_clean = bool(stats.get("clean"))
    return raw_plan.get("id"), src_clean, conv_clean


def main(limit: int | None = None, workers: int = 6) -> None:
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)
    if limit:
        plans = plans[:limit]
    n = len(plans)

    t0 = time.time()
    n_src_clean = 0
    n_conv_clean = 0
    n_both = 0
    violations = []
    with ProcessPoolExecutor(max_workers=workers) as ex:
        for i, (pid, src_clean, conv_clean) in enumerate(ex.map(_score_one, plans, chunksize=32)):
            if conv_clean and not src_clean:
                violations.append(pid)
            n_src_clean += src_clean
            n_conv_clean += conv_clean
            n_both += src_clean and conv_clean
            if (i + 1) % 2000 == 0:
                print(f"  ...{i + 1}/{n} ({time.time() - t0:.0f}s)", file=sys.stderr)

    elapsed = time.time() - t0
    print(f"\n{'=' * 70}")
    print(f"Population conditional clean rate (n={n}, {elapsed:.0f}s, {workers} workers):")
    print(f"  clean_at_source: {n_src_clean}/{n} ({100 * n_src_clean / n:.1f}%)")
    print(f"  converter_clean (unconditional): {n_conv_clean}/{n} ({100 * n_conv_clean / n:.1f}%)")
    print(f"  converter_clean AND clean_at_source: {n_both}/{n}")
    if n_src_clean:
        print(f"  converter_clean | clean_at_source: {n_both}/{n_src_clean} "
              f"({100 * n_both / n_src_clean:.1f}%) <- the population-scale number")
    print(f"  containment invariant violations (converter_clean but NOT clean_at_source): {len(violations)}")
    if violations:
        print(f"    {violations[:20]}{'...' if len(violations) > 20 else ''}")


if __name__ == "__main__":
    lim = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else None
    wk = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] else 6
    main(lim, wk)
