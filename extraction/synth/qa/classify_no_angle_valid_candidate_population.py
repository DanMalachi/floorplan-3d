"""Diagnosis-only: classify ALL no_angle_valid_candidate instances in
diagnose_broken_room_cycle.py's 15-plan sample (11 room instances, 27
edges — matching that script's own reported 55.0%/57.4% split), not just
the 3-instance spot-check verify_no_angle_valid_candidate.py did. That
spot-check proved the bucket is heterogeneous (3 different mechanisms on
3 instances) but said nothing about the MIX — and the mix is the whole
decision: if missing_from_skeleton dominates, a skeleton-simplification
fix is worth building; if the source-side mechanisms dominate, this is a
labeling-spec/GT-convention question and a skeleton fix would barely move
the clean rate.

Reuses (no duplicated logic, no redefinition):
  - diagnose_broken_room_cycle.find_sample / analyze_plan — same 15-plan
    sample (scan_limit=2000), same per-edge broken_room_cycle categories.
  - verify_no_angle_valid_candidate.analyze_instance — same wall-ink /
    skeleton confirmation logic validated on the 3-instance spot-check
    (wall-thickness-scaled proximity, ink coverage ratio).

For every edge tagged no_angle_valid_candidate by diagnose_broken_room_cycle,
runs analyze_instance and tags the result with a coarse ATTRIBUTION bucket
(the question the next fix decision actually turns on):
  - converter_bug: missing_from_skeleton / present_outside_band /
    present_within_band_UNEXPECTED — real wall ink or a real skeleton
    segment exists; our pipeline failed to use it. Fixable in rooms.py or
    skeleton.py.
  - gt_error: no_ink_at_all — the room polygon's own edge/notch has zero
    supporting wall ink anywhere nearby; most plausibly a ResPlan
    room-polygon tracing artifact, not something a converter fix can
    address.
  - convention_mismatch: partial_ink_partial_gap — the edge is only
    partly wall-backed. Genuinely ambiguous (flagged, not resolved, in
    docs/session-notes/p3a-handoff.md): could be a valid ResPlan
    modeling convention (e.g. a partial partition) our room-assembly's
    "edge must be mostly wall-backed" assumption doesn't fit, OR a GT
    boundary error. Bucketed under convention_mismatch as the more
    likely reading, but reported separately so it isn't silently folded
    into either extreme.

No changes to rooms.py/skeleton.py. Prints room-level (11) and edge-level
(27) proportions, plus the attribution-bucket rollup.
"""
from __future__ import annotations

import pickle
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from extraction.synth.qa.diagnose_broken_room_cycle import analyze_plan as drc_analyze_plan
from extraction.synth.qa.diagnose_broken_room_cycle import find_sample as drc_find_sample
from extraction.synth.qa.verify_no_angle_valid_candidate import analyze_instance

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"
TARGET_N = 15
SCAN_LIMIT = 2000  # must match diagnose_broken_room_cycle.py's default, for the same sample

ATTRIBUTION = {
    "missing_from_skeleton": "converter_bug",
    "present_outside_band": "converter_bug",
    "present_within_band_UNEXPECTED": "converter_bug",
    "no_ink_at_all": "gt_error",
    "partial_ink_partial_gap": "convention_mismatch",
}
# Room-level verdict priority when a room's no_angle_valid_candidate edges
# disagree: surface the most-actionable finding first — if ANY edge in the
# room is a converter bug, that alone justifies fix work on the room,
# regardless of what its other edges show.
_ROOM_PRIORITY = ["converter_bug", "convention_mismatch", "gt_error"]


def main():
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)

    sample = drc_find_sample(plans, TARGET_N, SCAN_LIMIT)
    print(f"Sample: {len(sample)} plans (broken_room_cycle-only, room_assembly_failed_required, "
          f"scan_limit={SCAN_LIMIT}) — same sample as diagnose_broken_room_cycle.py\n")

    edge_class_hist = Counter()
    edge_attr_hist = Counter()
    room_verdict_hist = Counter()
    n_rooms_checked = 0
    footnote_rooms = []  # rooms with a no_angle_valid_candidate edge but a DIFFERENT primary category

    for raw_plan in sample:
        room_results = drc_analyze_plan(raw_plan)
        for r in room_results:
            navc_edges = [e for e in r["broken_edges"] if e["category"] == "no_angle_valid_candidate"]
            if not navc_edges:
                continue  # no no_angle_valid_candidate edge in this room at all
            if r["primary_category"] != "no_angle_valid_candidate":
                # Has a no_angle_valid_candidate edge, but a higher-priority
                # category (e.g. no_candidate_band) wins as this room's
                # overall label in diagnose_broken_room_cycle.py's own
                # room-level histogram — so it's NOT one of "the 11."
                # Reported separately, not silently dropped.
                footnote_rooms.append((r["resplan_id"], r["room"], r["primary_category"], len(navc_edges)))
                continue
            n_rooms_checked += 1
            room_type, inst_idx = r["room"].rsplit("_", 1)
            print(f"=== plan {r['resplan_id']} room={r['room']} ({len(navc_edges)} no_angle_valid_candidate edge(s)) ===")

            room_attrs = set()
            for e in navc_edges:
                result = analyze_instance(raw_plan, room_type, int(inst_idx), e["edge_index"])
                cls = result["classification"]
                attr = ATTRIBUTION.get(cls, "UNCLASSIFIED_NEW_CASE")
                edge_class_hist[cls] += 1
                edge_attr_hist[attr] += 1
                room_attrs.add(attr)
                print(
                    f"  edge_index={e['edge_index']} len={e['edge_len']}: "
                    f"ink_coverage_ratio={result['ink_coverage_ratio']} "
                    f"skel_dist={result['nearest_plausible_skeleton_dist']} "
                    f"-> {cls} [{attr}]"
                )

            room_verdict = next((p for p in _ROOM_PRIORITY if p in room_attrs), "UNCLASSIFIED_NEW_CASE")
            room_verdict_hist[room_verdict] += 1
            print(f"  ROOM VERDICT: {room_verdict} (edge attributions present: {sorted(room_attrs)})")
            print()

    print("=" * 70)
    print(f"Rooms checked: {n_rooms_checked} (expected 11 per diagnose_broken_room_cycle.py's own count)")
    if footnote_rooms:
        print(f"\nFootnote — {len(footnote_rooms)} additional room(s) contain a no_angle_valid_candidate edge "
              f"but a DIFFERENT category won room-level priority (not counted in the 11 above):")
        for plan_id, room, primary, n in footnote_rooms:
            print(f"  plan {plan_id} room={room}: primary={primary}, {n} no_angle_valid_candidate edge(s) present too")

    print("\nEdge-level classification (fine-grained, matches verify_no_angle_valid_candidate.py's categories):")
    total_edges = sum(edge_class_hist.values()) or 1
    for cat, count in edge_class_hist.most_common():
        print(f"  {cat}: {count} ({100 * count / total_edges:.1f}% of {total_edges} no_angle_valid_candidate edges)")

    print("\nEdge-level ATTRIBUTION (the fixability question):")
    for attr, count in edge_attr_hist.most_common():
        print(f"  {attr}: {count} ({100 * count / total_edges:.1f}%)")

    print("\nROOM-level verdict (one per room, most-actionable-wins priority — this is the number the fix decision should use):")
    total_rooms = sum(room_verdict_hist.values()) or 1
    for verdict, count in room_verdict_hist.most_common():
        print(f"  {verdict}: {count} ({100 * count / total_rooms:.1f}% of {total_rooms} no_angle_valid_candidate rooms)")


if __name__ == "__main__":
    main()
