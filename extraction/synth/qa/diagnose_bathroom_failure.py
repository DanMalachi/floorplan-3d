"""Bathroom failure diagnosis at POPULATION scale (2026-07-30), completing
task C's prerequisite: stair and storage both have a classify()-taxonomy
recoverability ceiling (72.4% and 8.4% of all instances respectively,
`diagnose_stair_failure.py` / `diagnose_storage_failure.py`), but bathroom
never got the same treatment -- only discriminator-disagreement EDGE counts
(measure_discriminator_disagreement.py: 1,307 over-recognition / 469
under-recognition) and an isolated-broken-plan count (3,923/6,603, 85.0%,
measure_defect_cooccurrence.py). Those are not the same measurement as
stair/storage's ceiling and are not comparable to the 33.9%-calibrated stair
number. This script closes that gap: same classify() taxonomy, UNCHANGED,
filtered to bathroom instead of stair/storage, so a like-for-like lever #2
comparison is possible before Dan picks.

Reuses analyze_plan/classify UNCHANGED from
classify_room_boundary_no_wall_match.py (no new discriminator, no new
thresholds) -- filters its output to bathroom rooms only. Same two-stage
scan as diagnose_stair_failure.py / diagnose_storage_failure.py: (1)
check_plan across the full 17K to find plans with a bathroom
room_boundary_no_wall_match flag, (2) the heavier analyze_plan only on that
filtered subset.

CLI: python -m extraction.synth.qa.diagnose_bathroom_failure [workers]
"""
from __future__ import annotations

import pickle
import sys
import time
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from extraction.synth.qa.classify_room_boundary_no_wall_match import analyze_plan, classify
from extraction.synth.qa.measure_clean_at_source import check_plan

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"
TOTAL_BATHROOM_INSTANCES = 40413  # measured 2026-07-29, p3a-gate-v2-retarget.md survival table


def _has_bathroom_flag(raw_plan: dict) -> bool:
    result = check_plan(raw_plan)
    return any(f.startswith("room_boundary_no_wall_match:bathroom") for f in result["flags"])


def main(workers: int = 8) -> None:
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)
    n_total = len(plans)

    t0 = time.time()
    flagged_plans = []
    with ProcessPoolExecutor(max_workers=workers) as ex:
        for i, (p, hit) in enumerate(zip(plans, ex.map(_has_bathroom_flag, plans, chunksize=64))):
            if hit:
                flagged_plans.append(p)
            if (i + 1) % 2000 == 0:
                print(f"  ...scan {i + 1}/{n_total} ({time.time() - t0:.0f}s)", file=sys.stderr)
    scan_elapsed = time.time() - t0
    print(f"Stage 1: {len(flagged_plans)}/{n_total} plans have >=1 bathroom room_boundary_no_wall_match "
          f"edge ({scan_elapsed:.0f}s, full population, not a sample)")

    t1 = time.time()
    all_bathroom_edges = []
    for raw_plan in flagged_plans:
        edges = analyze_plan(raw_plan)
        all_bathroom_edges.extend(e for e in edges if e["room"].startswith("bathroom_"))
    analyze_elapsed = time.time() - t1
    print(f"Stage 2: {len(all_bathroom_edges)} genuinely-flagged bathroom edges across "
          f"{len(flagged_plans)} plans ({analyze_elapsed:.0f}s)")

    for e in all_bathroom_edges:
        e["category"] = classify(e)

    print(f"\n{'=' * 70}\nBATHROOM EDGE-LEVEL TAXONOMY (full population, {len(all_bathroom_edges)} edges):")
    edge_hist = Counter(e["category"] for e in all_bathroom_edges)
    for cat, count in edge_hist.most_common():
        print(f"  {cat}: {count} ({100 * count / len(all_bathroom_edges):.1f}%)")

    rooms = {}
    for e in all_bathroom_edges:
        key = (e["resplan_id"], e["room"])
        rooms.setdefault(key, set()).add(e["category"])
    room_priority = [
        "a_genuine_gt_defect_between_rooms",
        "f_unexplained_interior_gap",
        "d_tracing_artifact_small_notch",
        "b_shared_wall_wide_recoverable",
        "c_exterior_boundary_or_void",
        "e_opening_doorway_notch",
        "unresolved_degenerate_probe",
    ]
    room_hist = Counter()
    for key, cats in rooms.items():
        verdict = next((c for c in room_priority if c in cats), "UNKNOWN")
        room_hist[verdict] += 1
    print(f"\nBATHROOM ROOM-LEVEL TAXONOMY (worst/most-specific verdict per instance, "
          f"{len(rooms)} broken bathroom instances of {TOTAL_BATHROOM_INSTANCES} total population-wide):")
    for cat, count in room_hist.most_common():
        print(f"  {cat}: {count} ({100 * count / len(rooms):.1f}% of {len(rooms)} broken bathroom instances, "
              f"{100 * count / TOTAL_BATHROOM_INSTANCES:.1f}% of all {TOTAL_BATHROOM_INSTANCES} bathroom instances)")

    NOT_A_REAL_DEFECT = {
        "e_opening_doorway_notch",
        "c_exterior_boundary_or_void",
        "d_tracing_artifact_small_notch",
        "b_shared_wall_wide_recoverable",
    }
    recoverable_rooms = sum(1 for cats in rooms.values() if cats.issubset(NOT_A_REAL_DEFECT))
    print(f"\n{'=' * 70}\nRecoverability ceiling (rooms where EVERY broken edge is in class b/c/d/e, "
          f"i.e. not a genuine GT defect per this taxonomy): "
          f"{recoverable_rooms}/{len(rooms)} broken bathroom instances "
          f"({100 * recoverable_rooms / len(rooms):.1f}% of broken, "
          f"{100 * recoverable_rooms / TOTAL_BATHROOM_INSTANCES:.1f}% of all {TOTAL_BATHROOM_INSTANCES} bathroom instances)")
    print("NOTE: 'recoverable per this taxonomy' is NOT the same as 'a converter fix would "
          "actually recover it' -- same caution as the stair/storage diagnoses. Upper bound to "
          "pre-register against, not a promise. Apply the 0.468 calibration factor "
          "(calibrate_lever1_prediction.py) before treating this as a sizing estimate.")

    print(f"\n{'=' * 70}\nComparison vs. stair/storage's own profiles (this session's predecessors):")
    print("  stair room-level: c_exterior_boundary_or_void 79.2% of broken / 72.9% of all 757")
    print("  storage room-level: a_genuine_gt_defect_between_rooms 81.5% of broken / 38.8% of all 1,797")
    dominant_cat, dominant_count = room_hist.most_common(1)[0] if room_hist else (None, 0)
    print(f"  bathroom's own dominant mechanism: {dominant_cat} "
          f"({100 * dominant_count / len(rooms):.1f}% of broken bathroom instances)")


if __name__ == "__main__":
    wk = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else 8
    main(wk)
