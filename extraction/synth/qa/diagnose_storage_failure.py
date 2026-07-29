"""Storage failure diagnosis at POPULATION scale (2026-07-29), per Dan's
instruction (task A, cheapest-first, decides scope before sizing lever #2):
does storage share stair's dominant mechanism? Runs the SAME, already-
validated classify() taxonomy `diagnose_stair_failure.py` used for stair,
UNCHANGED, filtered to storage instead. If the profile matches (dominated
by c_exterior_boundary_or_void), one lever could plausibly clear both
failing rows of the gate's per-type survival table; if it differs, they are
two separate levers and that needs to be known before scoping either one.

Reuses analyze_plan/classify UNCHANGED from
classify_room_boundary_no_wall_match.py (no new discriminator, no new
thresholds) — filters its output to storage rooms only. Same two-stage scan
as diagnose_stair_failure.py: (1) check_plan across the full 17K to find
plans with a storage room_boundary_no_wall_match flag, (2) the heavier
analyze_plan only on that filtered subset.

CLI: python -m extraction.synth.qa.diagnose_storage_failure [workers]
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
TOTAL_STORAGE_INSTANCES = 1797  # measured this session, measure_gate_v2_distribution.py


def _has_storage_flag(raw_plan: dict) -> bool:
    result = check_plan(raw_plan)
    return any(f.startswith("room_boundary_no_wall_match:storage") for f in result["flags"])


def main(workers: int = 8) -> None:
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)
    n_total = len(plans)

    t0 = time.time()
    flagged_plans = []
    with ProcessPoolExecutor(max_workers=workers) as ex:
        for i, (p, hit) in enumerate(zip(plans, ex.map(_has_storage_flag, plans, chunksize=64))):
            if hit:
                flagged_plans.append(p)
            if (i + 1) % 2000 == 0:
                print(f"  ...scan {i + 1}/{n_total} ({time.time() - t0:.0f}s)", file=sys.stderr)
    scan_elapsed = time.time() - t0
    print(f"Stage 1: {len(flagged_plans)}/{n_total} plans have >=1 storage room_boundary_no_wall_match "
          f"edge ({scan_elapsed:.0f}s, full population, not a sample)")

    t1 = time.time()
    all_storage_edges = []
    for raw_plan in flagged_plans:
        edges = analyze_plan(raw_plan)
        all_storage_edges.extend(e for e in edges if e["room"].startswith("storage_"))
    analyze_elapsed = time.time() - t1
    print(f"Stage 2: {len(all_storage_edges)} genuinely-flagged storage edges across "
          f"{len(flagged_plans)} plans ({analyze_elapsed:.0f}s)")

    for e in all_storage_edges:
        e["category"] = classify(e)

    print(f"\n{'=' * 70}\nSTORAGE EDGE-LEVEL TAXONOMY (full population, {len(all_storage_edges)} edges):")
    edge_hist = Counter(e["category"] for e in all_storage_edges)
    for cat, count in edge_hist.most_common():
        print(f"  {cat}: {count} ({100 * count / len(all_storage_edges):.1f}%)")

    rooms = {}
    for e in all_storage_edges:
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
    print(f"\nSTORAGE ROOM-LEVEL TAXONOMY (worst/most-specific verdict per instance, "
          f"{len(rooms)} broken storage instances of {TOTAL_STORAGE_INSTANCES} total population-wide):")
    for cat, count in room_hist.most_common():
        print(f"  {cat}: {count} ({100 * count / len(rooms):.1f}% of {len(rooms)} broken storage instances, "
              f"{100 * count / TOTAL_STORAGE_INSTANCES:.1f}% of all {TOTAL_STORAGE_INSTANCES} storage instances)")

    NOT_A_REAL_DEFECT = {
        "e_opening_doorway_notch",
        "c_exterior_boundary_or_void",
        "d_tracing_artifact_small_notch",
        "b_shared_wall_wide_recoverable",
    }
    recoverable_rooms = sum(1 for cats in rooms.values() if cats.issubset(NOT_A_REAL_DEFECT))
    print(f"\n{'=' * 70}\nRecoverability ceiling (rooms where EVERY broken edge is in class b/c/d/e, "
          f"i.e. not a genuine GT defect per this taxonomy): "
          f"{recoverable_rooms}/{len(rooms)} broken storage instances "
          f"({100 * recoverable_rooms / len(rooms):.1f}% of broken, "
          f"{100 * recoverable_rooms / TOTAL_STORAGE_INSTANCES:.1f}% of all {TOTAL_STORAGE_INSTANCES} storage instances)")
    print("NOTE: 'recoverable per this taxonomy' is NOT the same as 'a converter fix would "
          "actually recover it' -- same caution as the stair diagnosis. Upper bound to "
          "pre-register against, not a promise.")

    print(f"\n{'=' * 70}\nComparison vs. stair's own profile (diagnose_stair_failure.py, this session):")
    print("  stair room-level: c_exterior_boundary_or_void 79.2% of broken / 72.9% of all 757")
    print("  stair room-level: a_genuine_gt_defect_between_rooms 15.1% of broken / 13.9% of all 757")
    dominant_cat, dominant_count = room_hist.most_common(1)[0] if room_hist else (None, 0)
    same_mechanism = dominant_cat == "c_exterior_boundary_or_void"
    print(f"  storage's own dominant mechanism: {dominant_cat} "
          f"({100 * dominant_count / len(rooms):.1f}% of broken storage instances)")
    print(f"  SAME dominant mechanism as stair (c_exterior_boundary_or_void)? {'YES' if same_mechanism else 'NO'}")


if __name__ == "__main__":
    wk = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else 8
    main(wk)
