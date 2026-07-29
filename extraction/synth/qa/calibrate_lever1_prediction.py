"""Calibrate lever #1's sizing method against its own actual outcome
(2026-07-29, task B, per Dan's instruction): the same estimating method that
predicted lever #1's conditional-rate gain (52.5% -> 70-80%, missed by ~5x)
also produced stair's 72.4% recoverability ceiling this session. If the
method runs optimistic by a knowable factor, that factor should be applied
to the stair estimate BEFORE proposing lever #2 -- not theorized about,
measured directly by tracing what actually happened to the exact population
the method predicted would clear.

No new hypothesis, no investigation into WHY -- pure bookkeeping, per
explicit instruction. Population definition, precise and reproducible from
check_plan's own return value: a plan "entered clean_at_source via the
notch-suppression fix" iff `notch_suppressions` is non-empty AND `flags` is
empty. This is necessarily true: check_plan's pass-2 loop only reaches the
notch-discriminator branch for an edge that is NOT already wall-backed
(ratio < COVERAGE_THRESHOLD) -- so a plan with >=1 suppression AND zero
flags had >=1 edge that would have set `room_broken=True` (and therefore
flagged room_boundary_no_wall_match) had the suppression not fired. This is
the exact, full-population generalization of the lever #1 build report's
own "roughly 66 plans (of the 300-sample denominator)" figure --
reproduced here at 17K scale instead of n=300.

For every plan in that population, traces its CURRENT (post-lever-1-build)
`convert_plan` outcome: converter_clean, or still broken with which flag.
Calibration factor = actually-cleared / predicted-population.

CLI: python -m extraction.synth.qa.calibrate_lever1_prediction [limit] [workers]
"""
from __future__ import annotations

import pickle
import sys
import time
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from extraction.synth.qa.measure_clean_at_source import check_plan
from extraction.synth.resplan_convert import convert_plan

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"

# This session's stair recoverability ceiling (diagnose_stair_failure.py):
# rooms where every broken edge is in classify()'s non-genuine-defect
# classes (b/c/d/e), as a fraction of all 757 stair instances.
STAIR_CEILING_PCT = 72.4


def _score_one(raw_plan: dict) -> dict | None:
    src = check_plan(raw_plan)
    entered_via_notch = bool(src["notch_suppressions"]) and not src["flags"]
    if not entered_via_notch:
        return None
    _, stats = convert_plan(raw_plan)
    conv_clean = bool(stats.get("clean"))
    flags = stats.get("flags", []) if stats.get("ok") else ["hard_failure"]
    return dict(id=raw_plan.get("id"), converter_clean=conv_clean, flags=flags)


def main(limit: int | None = None, workers: int = 6) -> None:
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)
    if limit:
        plans = plans[:limit]
    n_total = len(plans)

    t0 = time.time()
    predicted = []
    with ProcessPoolExecutor(max_workers=workers) as ex:
        for i, result in enumerate(ex.map(_score_one, plans, chunksize=32)):
            if result is not None:
                predicted.append(result)
            if (i + 1) % 2000 == 0:
                print(f"  ...{i + 1}/{n_total} ({time.time() - t0:.0f}s)", file=sys.stderr)
    elapsed = time.time() - t0

    n_predicted = len(predicted)
    cleared = [r for r in predicted if r["converter_clean"]]
    still_broken = [r for r in predicted if not r["converter_clean"]]

    print(f"\n{'=' * 70}")
    print(f"N={n_total} plans scanned ({elapsed:.0f}s, {workers} workers)")
    print(f"Predicted-to-fully-clear population (entered clean_at_source via notch "
          f"suppression, i.e. would need the converter-side fix to also recover them): "
          f"{n_predicted}/{n_total} ({100 * n_predicted / n_total:.2f}%)")
    print(f"  (the exact full-population version of the build report's own "
          f"'roughly 66 plans of the 300-sample denominator')")

    print(f"\nActual outcome, post-lever-1-build:")
    print(f"  cleared (converter_clean): {len(cleared)}/{n_predicted} "
          f"({100 * len(cleared) / n_predicted:.1f}%)")
    print(f"  still broken: {len(still_broken)}/{n_predicted} "
          f"({100 * len(still_broken) / n_predicted:.1f}%)")

    flag_hist = Counter()
    for r in still_broken:
        room_flags = [f for f in r["flags"] if f.startswith("room:")]
        if room_flags:
            for f in room_flags:
                # normalize instance suffix away (bedroom_2 -> bedroom) for a
                # readable histogram, keep the mechanism prefix intact
                parts = f.split(":")
                if len(parts) >= 3:
                    mech = parts[1]
                    room_type = parts[2].rsplit("_", 1)[0]
                    flag_hist[f"{mech}:{room_type}"] += 1
        else:
            flag_hist["no_room_flag_other_cause"] += 1

    print(f"\nStill-broken breakdown, by flag (a plan can carry >1):")
    for flag, count in flag_hist.most_common():
        print(f"  {flag}: {count}")

    calibration_factor = len(cleared) / n_predicted if n_predicted else 0.0
    print(f"\n{'=' * 70}\nCALIBRATION FACTOR: {calibration_factor:.3f} "
          f"({len(cleared)}/{n_predicted})")
    print(f"Applied to this session's stair recoverability ceiling ({STAIR_CEILING_PCT}%, "
          f"diagnose_stair_failure.py):")
    calibrated_stair = STAIR_CEILING_PCT * calibration_factor
    print(f"  calibrated stair estimate: {STAIR_CEILING_PCT}% * {calibration_factor:.3f} "
          f"= {calibrated_stair:.1f}%")
    print(f"  (of all 757 stair instances, this many would ACTUALLY be expected to clear, "
          f"per this session's own build's calibration factor, NOT the raw taxonomy ceiling)")


if __name__ == "__main__":
    lim = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else None
    wk = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] else 6
    main(lim, wk)
