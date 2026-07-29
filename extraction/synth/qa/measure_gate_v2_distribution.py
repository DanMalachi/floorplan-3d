"""P3a gate v2 measurement (2026-07-29), per Dan's retargeted bar — the old
monolithic "90% clean conversion" target is RETIRED (see
docs/extraction-plan.md's P3a "Done when" line and
reports/p3a-gate-v2-retarget.md for the ruling and reasoning). Volume was
never the binding constraint; the real risk is that the converter-clean
subset is a distorted sample of the full 17K, which would quietly poison
Phase 3b's training set. Two parts, one population pass:

  1. Volume floor: converter_clean count against a ~6,700-plan floor
     (20K-image set at 3 renders/plan). Already known to pass (8,226); this
     script re-confirms it from the same pass that measures part 2, it does
     not re-argue it.
  2. Distribution match, converter_clean subset vs. the full 17K:
     a. Scalar axes (doors/plan, rooms/plan, wall-count/plan) within 2%
        relative — 2% is not an arbitrary bar, it's the figure lever #1's
        own doors/plan gap already demonstrated achievable (measure_
        distribution_shift.py: +1.4% -> +0.5%), grounded, not invented.
     b. Per-room-type survival rate (clean-subset instance count / full-
        population instance count, for each of the 7 traced room types),
        PASS/FAIL at SURVIVAL_THRESHOLD_RELATIVE_PCT below (RATIFIED,
        see the constant's own comment for the justification).

Reuses measure_distribution_shift.py's exact per-plan scan pattern (raw
source door/room counts via get_geometries/ROOM_LABEL_MAP, converter's own
`clean` flag) — one population pass, not three separate ones.

**wall-count/plan is SOURCE-derived, permanently** (corrected 2026-07-29,
3rd session, see reports/p3a-discriminator-disagreement-and-corrections.md
§3): `len(get_geometries(plan["wall"]))` — ResPlan's raw wall MultiPolygon's
own disjoint-part count (confirmed already multi-part at the source level,
4-11 parts/plan spot-checked), zero converter involvement in the value.
The original version of this script used the converter's own post-
skeletonization segment count (`stats["n_walls"]`) instead, which FAILED at
+4.94% relative — Dan flagged this as potentially circular (converter-
derived value AND converter-derived subset membership), and the
source-derived recomputation confirmed it: PASSES at -0.59%, sign flipped.
The converter-derived path is deliberately not left in this file in any
form (not commented out, not a fallback) so the gate cannot silently
revert to the retracted metric.

CLI: python -m extraction.synth.qa.measure_gate_v2_distribution [limit] [workers]
"""
from __future__ import annotations

import pickle
import sys
import time
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from extraction.synth.resplan_convert import ROOM_LABEL_MAP, convert_plan
from extraction.synth.vendor.resplan_utils import get_geometries, normalize_keys

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"
VOLUME_FLOOR = 6700
SCALAR_AXIS_TOLERANCE_PCT = 2.0

# RATIFIED by Dan, 2026-07-29 (3rd session). Justification for the record
# (this matters more than the number itself): the observed per-type
# survival distribution is BIMODAL with a 53-point gap between the worst
# PASSING type (bathroom, -3.1% relative) and the best FAILING type
# (storage, -56.5% relative). Any threshold chosen between roughly 5% and
# 50% relative deviation produces the IDENTICAL PASS/FAIL verdict on every
# type measured so far -- the value is not load-bearing and does not need
# defending later; 15% was picked as a round number comfortably inside that
# range (5x margin above the tightest real cluster), not tuned to a close
# call. If a future room type's survival ever lands inside the 5-50% gap,
# that would be the first genuinely close case this threshold has to
# adjudicate -- revisit the number then, not before.
SURVIVAL_THRESHOLD_RELATIVE_PCT = 15.0


def _score_one(raw_plan: dict) -> dict:
    p = normalize_keys(dict(raw_plan))
    n_doors = len(get_geometries(p.get("door")))
    n_wall_parts = len(get_geometries(p.get("wall")))
    room_types = []
    for rt in ROOM_LABEL_MAP:
        room_types.extend([rt] * len(get_geometries(p.get(rt))))
    _, stats = convert_plan(raw_plan)
    return dict(
        id=raw_plan.get("id"),
        n_doors=n_doors,
        n_rooms=len(room_types),
        room_types=room_types,
        n_walls=n_wall_parts,
        converter_clean=bool(stats.get("clean")),
    )


def _mean(key: str, records: list[dict]) -> float:
    return sum(r[key] for r in records) / len(records) if records else 0.0


def main(limit: int | None = None, workers: int = 8) -> None:
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
    n_clean = len(clean)

    print(f"\n{'=' * 70}")
    print(f"N={n_total} plans scanned ({elapsed:.0f}s, {workers} workers)")
    print(f"converter_clean (unconditional): {n_clean}/{n_total} ({100 * n_clean / n_total:.1f}%)")

    print(f"\n{'=' * 70}\n1. VOLUME FLOOR")
    status = "PASS" if n_clean >= VOLUME_FLOOR else "FAIL"
    print(f"  converter_clean={n_clean}  floor={VOLUME_FLOOR}  -> {status}")

    print(f"\n{'=' * 70}\n2a. SCALAR AXES (tolerance: {SCALAR_AXIS_TOLERANCE_PCT}% relative)")
    for key, label in (("n_doors", "doors/plan"), ("n_rooms", "rooms/plan"), ("n_walls", "wall-count/plan")):
        full_mean = _mean(key, records)
        clean_mean = _mean(key, clean)
        gap = full_mean - clean_mean
        gap_pct = 100 * gap / full_mean if full_mean else 0.0
        axis_status = "PASS" if abs(gap_pct) <= SCALAR_AXIS_TOLERANCE_PCT else "FAIL"
        print(f"  {label:16s} full={full_mean:.3f}  clean={clean_mean:.3f}  "
              f"gap={gap:+.3f} ({gap_pct:+.2f}% relative)  -> {axis_status}")

    print(f"\n{'=' * 70}\n2b. PER-ROOM-TYPE SURVIVAL RATE (RATIFIED threshold: "
          f"{SURVIVAL_THRESHOLD_RELATIVE_PCT}% relative deviation)")
    full_mix = Counter()
    clean_mix = Counter()
    for r in records:
        full_mix.update(r["room_types"])
    for r in clean:
        clean_mix.update(r["room_types"])

    overall_survival = 100 * n_clean / n_total
    print(f"  overall unconditional survival (== converter_clean rate): {overall_survival:.1f}%")
    survivals = []
    any_fail = False
    for rt in sorted(ROOM_LABEL_MAP):
        full_n = full_mix.get(rt, 0)
        clean_n = clean_mix.get(rt, 0)
        surv = 100 * clean_n / full_n if full_n else float("nan")
        dev = surv - overall_survival
        rel_dev = 100 * dev / overall_survival if overall_survival else 0.0
        rt_status = "PASS" if abs(rel_dev) <= SURVIVAL_THRESHOLD_RELATIVE_PCT else "FAIL"
        any_fail = any_fail or rt_status == "FAIL"
        survivals.append((rt, full_n, clean_n, surv, rel_dev, rt_status))
        print(f"    {rt:10s} full_n={full_n:6d}  clean_n={clean_n:6d}  survival={surv:5.1f}%  "
              f"deviation={dev:+6.1f}pp  ({rel_dev:+.0f}% relative)  -> {rt_status}")

    print("\n  sorted ascending by survival rate:")
    for rt, full_n, clean_n, surv, rel_dev, rt_status in sorted(survivals, key=lambda t: t[3]):
        print(f"    {surv:5.1f}%  {rt:10s} {rt_status}")

    print(f"\n  2b overall: {'FAIL' if any_fail else 'PASS'} "
          f"({'at least one room type exceeds the threshold' if any_fail else 'all room types within threshold'})")


if __name__ == "__main__":
    lim = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else None
    wk = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] else 8
    main(lim, wk)
