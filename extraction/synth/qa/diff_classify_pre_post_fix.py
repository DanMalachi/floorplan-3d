"""READ-ONLY, one-off: explain the +53 edge / +9 plan delta in
a_genuine_gt_defect_between_rooms after the classify() notch-branch fix.
Re-derives the OLD single-condition rule inline (opening_coverage>=0.8 only)
against the SAME edge dicts the corrected analyze_plan/classify now produce,
to build a transition table -- does not modify or revert
classify_room_boundary_no_wall_match.py."""
from __future__ import annotations

import pickle
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from extraction.synth.qa.classify_room_boundary_no_wall_match import (
    COVERAGE_THRESHOLD,
    SMALL_EDGE_WALL_DEPTH_MULTIPLE,
    analyze_plan,
    classify,
)

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"


def classify_old(e):
    """The PRE-fix rule, reproduced inline for comparison only (single
    condition: opening_coverage >= 0.8)."""
    if e["outward_probe_degenerate"]:
        return "unresolved_degenerate_probe"
    if e["opening_coverage"] >= 0.8:
        return "e_opening_doorway_notch"
    if not e["outward_inside_inner"]:
        return "c_exterior_boundary_or_void"
    if e["neighbor_room"] is not None:
        if e["ink_ratio_wide"] >= COVERAGE_THRESHOLD:
            return "b_shared_wall_wide_recoverable"
        return "a_genuine_gt_defect_between_rooms"
    if e["edge_len"] <= SMALL_EDGE_WALL_DEPTH_MULTIPLE * e["wall_depth"]:
        return "d_tracing_artifact_small_notch"
    return "f_unexplained_interior_gap"


def main():
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)

    transitions = Counter()
    into_a_examples = []
    out_of_a_examples = []
    for raw_plan in plans:
        for e in analyze_plan(raw_plan):
            old = classify_old(e)
            new = classify(e)
            transitions[(old, new)] += 1
            if new == "a_genuine_gt_defect_between_rooms" and old != new:
                if len(into_a_examples) < 10:
                    into_a_examples.append((raw_plan.get("id"), e["room"], e["edge_index"],
                                             old, e["opening_coverage"],
                                             e.get("cos_to_nearest_backed_neighbor"),
                                             round(e["edge_len"] / e["wall_depth"], 3)))
            if old == "a_genuine_gt_defect_between_rooms" and old != new:
                if len(out_of_a_examples) < 10:
                    out_of_a_examples.append((raw_plan.get("id"), e["room"], e["edge_index"],
                                               new, e["opening_coverage"],
                                               e.get("cos_to_nearest_backed_neighbor"),
                                               round(e["edge_len"] / e["wall_depth"], 3)))

    print("Transition table (old_category -> new_category): count, only where changed")
    for (old, new), count in transitions.most_common():
        if old != new:
            print(f"  {old} -> {new}: {count}")

    print(f"\nMoved INTO a_genuine_gt_defect_between_rooms (was something else, now 'a'): "
          f"{sum(c for (o, n), c in transitions.items() if n == 'a_genuine_gt_defect_between_rooms' and o != n)}")
    print("Examples (plan, room, edge, old_category, opening_coverage, cos_to_neighbor, jamb_ratio):")
    for row in into_a_examples:
        print(f"  {row}")

    print(f"\nMoved OUT of a_genuine_gt_defect_between_rooms (was 'a', now something else): "
          f"{sum(c for (o, n), c in transitions.items() if o == 'a_genuine_gt_defect_between_rooms' and o != n)}")
    print("Examples (plan, room, edge, new_category, opening_coverage, cos_to_neighbor, jamb_ratio):")
    for row in out_of_a_examples:
        print(f"  {row}")


if __name__ == "__main__":
    main()
