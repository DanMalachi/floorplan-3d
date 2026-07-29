"""Stair failure diagnosis at POPULATION scale (2026-07-29), per Dan's
instruction: stair is lever #2's priority (6/757 instances, 0.8%, survive
conversion — the worst-recovered required room type, and unlike the notch
mechanism it has never had its own diagnose-before-build pass). Starts from
the two stair instances the handoff's own taxonomy work already named —
plan 1448 stair_0 (c_exterior_boundary_or_void) and plan 9796 stair_0
(b_shared_wall_wide_recoverable), both already EXEMPLARS in
classify_room_boundary_no_wall_match.py — and extends the same,
already-validated classify() taxonomy to every stair instance in the full
17K, not a diagnostic-scale sample. Stair is cheap enough to do this way:
only 757 instances total population-wide, vs. the 27/1500-plan samples the
general room_boundary_no_wall_match decomposition used.

Reuses analyze_plan/classify UNCHANGED from
classify_room_boundary_no_wall_match.py (no new discriminator, no new
thresholds) — filters its output to stair rooms only. Two-stage scan to
stay cheap: (1) check_plan across the full 17K (cheap) to find plans with a
stair room_boundary_no_wall_match flag, (2) the heavier analyze_plan only on
that filtered subset.

CLI: python -m extraction.synth.qa.diagnose_stair_failure [workers]
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


def _has_stair_flag(raw_plan: dict) -> bool:
    result = check_plan(raw_plan)
    return any(f.startswith("room_boundary_no_wall_match:stair") for f in result["flags"])


def main(workers: int = 8) -> None:
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)
    n_total = len(plans)

    t0 = time.time()
    flagged_plans = []
    with ProcessPoolExecutor(max_workers=workers) as ex:
        for i, (p, hit) in enumerate(zip(plans, ex.map(_has_stair_flag, plans, chunksize=64))):
            if hit:
                flagged_plans.append(p)
            if (i + 1) % 2000 == 0:
                print(f"  ...scan {i + 1}/{n_total} ({time.time() - t0:.0f}s)", file=sys.stderr)
    scan_elapsed = time.time() - t0
    print(f"Stage 1: {len(flagged_plans)}/{n_total} plans have >=1 stair room_boundary_no_wall_match "
          f"edge ({scan_elapsed:.0f}s, full population, not a sample)")

    t1 = time.time()
    all_stair_edges = []
    for raw_plan in flagged_plans:
        edges = analyze_plan(raw_plan)
        all_stair_edges.extend(e for e in edges if e["room"].startswith("stair_"))
    analyze_elapsed = time.time() - t1
    print(f"Stage 2: {len(all_stair_edges)} genuinely-flagged stair edges across "
          f"{len(flagged_plans)} plans ({analyze_elapsed:.0f}s)")

    for e in all_stair_edges:
        e["category"] = classify(e)

    print(f"\n{'=' * 70}\nSTAIR EDGE-LEVEL TAXONOMY (full population, {len(all_stair_edges)} edges):")
    edge_hist = Counter(e["category"] for e in all_stair_edges)
    for cat, count in edge_hist.most_common():
        print(f"  {cat}: {count} ({100 * count / len(all_stair_edges):.1f}%)")

    rooms = {}
    for e in all_stair_edges:
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
    print(f"\nSTAIR ROOM-LEVEL TAXONOMY (worst/most-specific verdict per instance, "
          f"{len(rooms)} broken stair instances of 757 total population-wide):")
    for cat, count in room_hist.most_common():
        print(f"  {cat}: {count} ({100 * count / len(rooms):.1f}% of {len(rooms)} broken stair instances, "
              f"{100 * count / 757:.1f}% of all 757 stair instances)")

    print(f"\n{'=' * 70}\nNamed exemplars (from EXEMPLARS in classify_room_boundary_no_wall_match.py):")
    print("  plan 1448 stair_0 edge 9  -> expected c_exterior_boundary_or_void")
    print("  plan 15895 stair_0 edge 3 -> expected c_exterior_boundary_or_void")
    print("  plan 9206 stair_0 edge 6  -> expected c_exterior_boundary_or_void")
    print("  plan 9796 stair_0 edge 0  -> expected b_shared_wall_wide_recoverable")
    for key, cats in rooms.items():
        pid, room = key
        if pid in (1448, 15895, 9206, 9796) and room == "stair_0":
            verdict = next((c for c in room_priority if c in cats), "UNKNOWN")
            print(f"    actual: plan {pid} {room} -> {verdict} (all categories seen: {sorted(cats)})")

    # Recoverable-by-classify()-alone fraction: categories b/c/d/e are NOT
    # real GT defects per this taxonomy's own definition (see NOT_A_REAL_DEFECT
    # in classify_room_boundary_no_wall_match.py) -- a converter-side fix
    # COULD in principle recover these; a/f are real source-data gaps no
    # converter fix can ever close.
    NOT_A_REAL_DEFECT = {
        "e_opening_doorway_notch",
        "c_exterior_boundary_or_void",
        "d_tracing_artifact_small_notch",
        "b_shared_wall_wide_recoverable",
    }
    recoverable_rooms = sum(1 for cats in rooms.values() if cats.issubset(NOT_A_REAL_DEFECT))
    print(f"\n{'=' * 70}\nRecoverability ceiling (rooms where EVERY broken edge is in class b/c/d/e, "
          f"i.e. not a genuine GT defect per this taxonomy): "
          f"{recoverable_rooms}/{len(rooms)} broken stair instances "
          f"({100 * recoverable_rooms / len(rooms):.1f}% of broken, "
          f"{100 * recoverable_rooms / 757:.1f}% of all 757 stair instances)")
    print("NOTE: 'recoverable per this taxonomy' is NOT the same as 'a converter fix would "
          "actually recover it' -- b/c/d each still require real, unbuilt converter work "
          "(the exact caution this session's own lever #1 finding demonstrated for notches: "
          "an edge being classify()-recoverable in principle does not mean assemble_rooms's "
          "actual discriminator recognizes it, per the 16% under-recognition rate found this "
          "session). Treat this number as an upper bound to pre-register against, not a promise.")


if __name__ == "__main__":
    wk = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else 8
    main(wk)
