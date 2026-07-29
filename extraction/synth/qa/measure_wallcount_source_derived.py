"""Wall-count/plan axis, RECOMPUTED from source geometry only (2026-07-29),
per Dan's objection to measure_gate_v2_distribution.py's original version:
that script's wall-count/plan axis used stats["n_walls"] -- the CONVERTER's
own post-skeletonization segment count -- for both the full population and
the clean subset. Even though both sides used the identical converter-
derived quantity (not literally comparing two different sources across the
two populations), the metric itself is still converter output, not a raw
source measurement like doors/rooms -- if skeletonization complexity
correlates with room-assembly success, the "gap" could partly reflect
skeletonization artifacts rather than true source wall complexity, making
the bias test partially self-referential.

Fix: wall-count/plan here is len(get_geometries(p.get("wall"))) -- ResPlan's
own raw wall MultiPolygon's disjoint-part count, verified directly (see this
session's commit) to already be multi-part at the SOURCE level (4-11 parts
on a 5-plan spot check, zero skeletonization involved) -- computed
identically to how doors/rooms are already counted
(measure_distribution_shift.py's own pattern), with ZERO converter
involvement in the VALUE itself. convert_plan is still used, unavoidably,
to determine clean-subset MEMBERSHIP (which plans are converter_clean) --
that is not what Dan's objection was about; every axis (doors, rooms,
wall-count) needs convert_plan for that, or there is no "clean subset" to
define at all.

Also reports the OLD converter-derived n_walls figure alongside, so the two
can be compared directly and any material difference stated, not silently
dropped.

CLI: python -m extraction.synth.qa.measure_wallcount_source_derived [limit] [workers]
"""
from __future__ import annotations

import pickle
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from extraction.synth.resplan_convert import convert_plan
from extraction.synth.vendor.resplan_utils import get_geometries, normalize_keys

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"
SCALAR_AXIS_TOLERANCE_PCT = 2.0


def _score_one(raw_plan: dict) -> dict:
    p = normalize_keys(dict(raw_plan))
    n_wall_parts_source = len(get_geometries(p.get("wall")))
    _, stats = convert_plan(raw_plan)
    ok = bool(stats.get("ok"))
    return dict(
        id=raw_plan.get("id"),
        n_wall_parts_source=n_wall_parts_source,
        n_walls_converter=stats.get("n_walls", 0) if ok else 0,
        converter_clean=bool(stats.get("clean")),
    )


def _mean(key: str, records: list[dict]) -> float:
    return sum(r[key] for r in records) / len(records) if records else 0.0


def main(limit: int | None = None, workers: int = 6) -> None:
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)
    if limit:
        plans = plans[:limit]
    n_total = len(plans)

    t0 = time.time()
    records = []
    with ProcessPoolExecutor(max_workers=workers) as ex:
        for i, rec in enumerate(ex.map(_score_one, plans, chunksize=32)):
            records.append(rec)
            if (i + 1) % 2000 == 0:
                print(f"  ...{i + 1}/{n_total} ({time.time() - t0:.0f}s)", file=sys.stderr)
    elapsed = time.time() - t0

    clean = [r for r in records if r["converter_clean"]]
    print(f"\n{'=' * 70}")
    print(f"N={n_total} plans scanned ({elapsed:.0f}s, {workers} workers)")
    print(f"converter_clean: {len(clean)}/{n_total} ({100 * len(clean) / n_total:.1f}%)")

    print(f"\n{'=' * 70}\nSOURCE-DERIVED wall-count/plan (len(get_geometries(wall)), zero converter involvement in the value)")
    full_mean = _mean("n_wall_parts_source", records)
    clean_mean = _mean("n_wall_parts_source", clean)
    gap = full_mean - clean_mean
    gap_pct = 100 * gap / full_mean if full_mean else 0.0
    status = "PASS" if abs(gap_pct) <= SCALAR_AXIS_TOLERANCE_PCT else "FAIL"
    print(f"  full={full_mean:.3f}  clean={clean_mean:.3f}  gap={gap:+.3f} ({gap_pct:+.2f}% relative)  -> {status}")

    print(f"\n{'=' * 70}\nFor comparison, the OLD converter-derived n_walls (measure_gate_v2_distribution.py's original axis):")
    old_full_mean = _mean("n_walls_converter", records)
    old_clean_mean = _mean("n_walls_converter", clean)
    old_gap = old_full_mean - old_clean_mean
    old_gap_pct = 100 * old_gap / old_full_mean if old_full_mean else 0.0
    old_status = "PASS" if abs(old_gap_pct) <= SCALAR_AXIS_TOLERANCE_PCT else "FAIL"
    print(f"  full={old_full_mean:.3f}  clean={old_clean_mean:.3f}  gap={old_gap:+.3f} ({old_gap_pct:+.2f}% relative)  -> {old_status}")

    print(f"\n{'=' * 70}\nDid the fix move the conclusion?")
    if status != old_status:
        print(f"  YES -- source-derived axis is {status}, converter-derived axis was {old_status}. Material difference.")
    else:
        print(f"  NO -- both source-derived and converter-derived axes are {status}. "
              f"Gap magnitude: source={gap_pct:+.2f}% vs converter={old_gap_pct:+.2f}%.")


if __name__ == "__main__":
    lim = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else None
    wk = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] else 6
    main(lim, wk)
