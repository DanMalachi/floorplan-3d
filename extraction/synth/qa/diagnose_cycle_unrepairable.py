"""Diagnosis-only: root-cause the `cycle_unrepairable_required` bucket
(44.3% of plans per docs/session-notes/p3a-handoff.md's n=300 sample) —
next-session plan step 1. Samples plans that land in that category, re-runs
the per-room assembly with instrumentation `assemble_rooms`/`rooms.py`
doesn't expose (the pre-repair wall_seq, which consecutive pair broke
`_repair_connectivity`, and the TRUE shortest bridge distance with the
max_depth=3 cap lifted), and classifies each broken pair into one of three
buckets matching the handoff's own candidate causes:

  - genuine_skeleton_disconnection: no path exists in the wall-adjacency
    graph at all, and the two segments' nearest endpoints are geometrically
    far apart (> GAP_CLOSE_MULTIPLIER * mean wall thickness) — a real break
    in the extracted wall network (e.g. from fill_openings_into_wall +
    skeletonization), not something a deeper BFS could fix.
  - wrong_wall_or_snap_miss: no path exists in the graph, but the nearest
    endpoints ARE geometrically close (<= GAP_CLOSE_MULTIPLIER * mean
    thickness) — the walls almost certainly should be adjacent; per-edge
    coverage likely picked the wrong candidate wall, or the two segments'
    endpoints didn't snap together within adjacency_epsilon.
  - bridge_exceeds_depth_cap: a path DOES exist in the graph, just longer
    than max_depth=3 hops — the BFS bridge cap in rooms.py is too shallow
    for this junction cluster.

This module makes no changes to rooms.py or resplan_convert.py — it
duplicates the minimum needed logic (matching the established pattern in
diagnose_area_gap.py) purely to observe what the bounded repair currently
discards. Fixes are explicitly out of scope for this pass.
"""
from __future__ import annotations

import pickle
import sys
from collections import Counter, deque
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from extraction.synth.openings import project_openings
from extraction.synth.qa.diagnose_area_gap import assemble_one_room_cycle
from extraction.synth.qa.diagnose_clean_rate import categorize
from extraction.synth.resplan_convert import CLEAN_REQUIRED_ROOM_TYPES, convert_plan
from extraction.synth.rooms import _build_adjacency, _mitered_face_polygon, _repair_connectivity
from extraction.synth.skeleton import extract_wall_skeleton, fill_openings_into_wall
from extraction.synth.vendor.resplan_utils import get_geometries, normalize_keys

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"
MAX_DEPTH = 3  # must match rooms.py::assemble_rooms's max_bridge_depth default
GAP_CLOSE_MULTIPLIER = 3.0
AREA_MATCH_TOLERANCE = 0.05  # must match rooms.py::assemble_rooms's default
# Priority order for a room's single "primary" histogram bucket when it has
# multiple unbridged gaps of different categories.
_CATEGORY_PRIORITY = ["genuine_skeleton_disconnection", "wrong_wall_or_snap_miss", "bridge_exceeds_depth_cap", "unexpected_within_cap"]


def _endpoint_gap(seg_a, seg_b) -> float:
    pts_a = (seg_a.start, seg_a.end)
    pts_b = (seg_b.start, seg_b.end)
    return min(((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5 for ax, ay in pts_a for bx, by in pts_b)


def _bfs_shortest_distance(adjacency: dict[int, set[int]], start: int, goal: int) -> int | None:
    """Unbounded BFS hop count start->goal (None if genuinely unreachable —
    i.e. different connected components). Distinct from rooms.py's
    `_bfs_bridge`, which gives up past max_depth and doesn't report how far
    the true answer actually was."""
    if start == goal:
        return 0
    visited = {start}
    q = deque([(start, 0)])
    while q:
        node, d = q.popleft()
        for nxt in adjacency.get(node, ()):
            if nxt == goal:
                return d + 1
            if nxt in visited:
                continue
            visited.add(nxt)
            q.append((nxt, d + 1))
    return None


def _diagnose_broken_pairs(wall_seq, segments, adjacency) -> list[dict]:
    """Mirrors rooms.py::_repair_connectivity's walk, but instead of giving
    up at max_depth it records full diagnostics for every gap that the
    real repair couldn't bridge."""
    n = len(wall_seq)
    mean_thickness = sum(segments[w].thickness for w in set(wall_seq)) / len(set(wall_seq))
    breaks = []
    for i in range(n):
        cur, nxt = wall_seq[i], wall_seq[(i + 1) % n]
        if cur == nxt or nxt in adjacency.get(cur, ()):
            continue
        true_dist = _bfs_shortest_distance(adjacency, cur, nxt)
        gap = _endpoint_gap(segments[cur], segments[nxt])
        if true_dist is not None and true_dist <= MAX_DEPTH:
            # Would have been bridged by the real repair — shouldn't occur
            # for a room that actually ended up in cycle_unrepairable_required
            # via a connectivity failure (as opposed to an area-match
            # failure on a successfully-repaired cycle). Recorded, not
            # silently dropped, since a nonzero count here would itself be
            # a diagnostic finding (a bug in _repair_connectivity, or this
            # room's real rejection was the area-match check, not repair).
            category = "unexpected_within_cap"
        elif true_dist is None and gap <= GAP_CLOSE_MULTIPLIER * mean_thickness:
            category = "wrong_wall_or_snap_miss"
        elif true_dist is None:
            category = "genuine_skeleton_disconnection"
        else:
            category = "bridge_exceeds_depth_cap"
        breaks.append(
            dict(
                pair=(f"w{cur}", f"w{nxt}"),
                edge_index=i,
                true_shortest_hops=true_dist,
                endpoint_gap=round(gap, 2),
                mean_wall_thickness=round(mean_thickness, 2),
                category=category,
            )
        )
    return breaks


def analyze_plan(raw_plan: dict) -> list[dict]:
    """Returns one dict per required-room instance that hit a
    `cycle_unrepairable` flag, classified into the two subtypes rooms.py
    can produce:
      - failure_type="connectivity_null": `_repair_connectivity` returned
        None. Sub-categorized per unbridged gap (see module docstring).
      - failure_type="area_match": the repaired cycle's mitered face
        polygon didn't match the source room polygon's area within
        AREA_MATCH_TOLERANCE.
    Rooms that pass both checks (not a cycle_unrepairable case at all) and
    rooms that never even assembled a raw wall_seq (broken_room_cycle, a
    different flag/failure mode) are not returned."""
    p = normalize_keys(dict(raw_plan))
    wall_depth = float(p.get("wall_depth") or 4.0)
    wall_geom = p.get("wall")
    if wall_geom is None or wall_geom.is_empty:
        return []
    filled = fill_openings_into_wall(wall_geom, p.get("door"), p.get("window"), p.get("front_door"))
    skel = extract_wall_skeleton(filled, wall_depth, thickness_source_geom=wall_geom)
    segments = skel.segments
    if not segments:
        return []
    adjacency = _build_adjacency(segments, 0.1)

    results = []
    for rt in CLEAN_REQUIRED_ROOM_TYPES:
        g = p.get(rt)
        if g is None:
            continue
        for inst_idx, poly in enumerate(get_geometries(g)):
            if poly is None or poly.is_empty or poly.geom_type != "Polygon":
                continue
            wall_seq = assemble_one_room_cycle(segments, poly)
            if wall_seq is None:
                continue  # broken_room_cycle, a different failure mode — not in scope here
            repaired = _repair_connectivity(wall_seq, adjacency, MAX_DEPTH)
            if repaired is None or len(set(repaired)) < 3:
                breaks = _diagnose_broken_pairs(wall_seq, segments, adjacency)
                present = {b["category"] for b in breaks}
                primary = next((c for c in _CATEGORY_PRIORITY if c in present), "unexpected_within_cap")
                results.append(
                    dict(
                        resplan_id=raw_plan.get("id"),
                        room=f"{rt}_{inst_idx}",
                        failure_type="connectivity_null",
                        primary_category=primary,
                        wall_seq_before_repair=[f"w{w}" for w in wall_seq],
                        n_breaks=len(breaks),
                        breaks=breaks,
                    )
                )
                continue

            face_poly = _mitered_face_polygon(repaired, segments, (poly.centroid.x, poly.centroid.y))
            implied_area = face_poly.area if face_poly is not None else 0.0
            area_err = abs(implied_area - poly.area) / max(poly.area, 1e-9)
            if implied_area <= 0 or area_err > AREA_MATCH_TOLERANCE:
                # Two qualitatively different failures collapsed into one flag by
                # rooms.py: a marginal overshoot of the 5% gate (consistent with
                # EMPIRICAL_FACE_OFFSET_MULTIPLIER's own measured residual spread,
                # p90=4.86% per the handoff) vs. total construction collapse
                # (face_poly None/degenerate — offset-line intersection failing
                # outright, e.g. on a self-revisiting wall_cycle).
                sub = "area_match_degenerate_face_polygon" if implied_area <= 0 else "area_match_near_miss"
                results.append(
                    dict(
                        resplan_id=raw_plan.get("id"),
                        room=f"{rt}_{inst_idx}",
                        failure_type="area_match",
                        primary_category=sub,
                        wall_cycle=[f"w{w}" for w in repaired],
                        wall_cycle_has_repeats=len(repaired) != len(set(repaired)),
                        source_area=round(poly.area, 1),
                        implied_area=round(implied_area, 1),
                        area_err_pct=round(area_err * 100, 1),
                    )
                )
                # else: this room passed both checks — not a cycle_unrepairable case
    return results


def find_sample(plans: list[dict], target_n: int, scan_limit: int) -> list[dict]:
    """Scans plans in order (deterministic, not random — reproducible
    without a seed) until target_n plans land in cycle_unrepairable_required
    per diagnose_clean_rate.categorize(), or scan_limit plans are exhausted."""
    sample = []
    for p in plans[:scan_limit]:
        _, stats = convert_plan(p)
        if "cycle_unrepairable_required" in categorize(stats):
            sample.append(p)
            if len(sample) >= target_n:
                break
    return sample


def main(target_n: int = 15, scan_limit: int = 2000) -> None:
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)

    sample = find_sample(plans, target_n, scan_limit)
    print(f"Sampled {len(sample)} plans in cycle_unrepairable_required "
          f"(scanned first {scan_limit} of {len(plans)} plans)\n")

    room_primary_hist: Counter = Counter()   # one bucket per FAILING ROOM (what was asked for)
    gap_detail_hist: Counter = Counter()     # finer-grained: one bucket per unbridged GAP within connectivity_null rooms
    n_rooms_diagnosed = 0
    n_plans_with_no_flagged_room = 0

    for raw_plan in sample:
        room_results = analyze_plan(raw_plan)
        if not room_results:
            n_plans_with_no_flagged_room += 1
            print(f"=== plan {raw_plan.get('id')}: no cycle_unrepairable required-room instance "
                  f"reproduced (see caveat below) ===\n")
            continue
        for r in room_results:
            n_rooms_diagnosed += 1
            room_primary_hist[r["primary_category"]] += 1
            if r["failure_type"] == "connectivity_null":
                print(f"=== plan {r['resplan_id']} room={r['room']}: CONNECTIVITY_NULL "
                      f"wall_seq_before_repair={r['wall_seq_before_repair']} "
                      f"({r['n_breaks']} unbridged gap(s)) ===")
                for b in r["breaks"]:
                    gap_detail_hist[b["category"]] += 1
                    dist_str = b["true_shortest_hops"] if b["true_shortest_hops"] is not None else "unreachable"
                    print(
                        f"  gap at edge_index={b['edge_index']} pair={b['pair']}: "
                        f"true_shortest_hops={dist_str} (cap={MAX_DEPTH}) "
                        f"endpoint_gap={b['endpoint_gap']} mean_thickness={b['mean_wall_thickness']} "
                        f"-> {b['category']}"
                    )
            else:
                print(
                    f"=== plan {r['resplan_id']} room={r['room']}: {r['primary_category'].upper()} "
                    f"wall_cycle={r['wall_cycle']}{' [HAS REPEATED WALL IDS]' if r['wall_cycle_has_repeats'] else ''} "
                    f"source_area={r['source_area']} implied_area={r['implied_area']} "
                    f"area_err={r['area_err_pct']}% (tolerance={AREA_MATCH_TOLERANCE * 100:.0f}%) ==="
                )
            print()

    print("=" * 70)
    print(f"Plans sampled: {len(sample)}")
    print(f"Required-room instances reproducing a cycle_unrepairable flag: {n_rooms_diagnosed}")
    if n_plans_with_no_flagged_room:
        print(
            f"CAVEAT: {n_plans_with_no_flagged_room} sampled plan(s) reproduced no matching room "
            f"instance under this script's reimplementation of the per-edge/repair stages — "
            f"either a room type outside CLEAN_REQUIRED_ROOM_TYPES triggered categorize()'s bucket "
            f"indirectly, or a discrepancy between this diagnostic and rooms.py's real assemble_rooms; "
            f"flagged rather than silently dropped."
        )

    print("\nRoot-cause histogram — one bucket per FAILING REQUIRED-ROOM INSTANCE "
          "(what step 1 asked for):")
    total_rooms = sum(room_primary_hist.values()) or 1
    for cat, count in room_primary_hist.most_common():
        print(f"  {cat}: {count} ({100 * count / total_rooms:.1f}%)")

    if gap_detail_hist:
        print("\n(finer detail: per-unbridged-gap breakdown within connectivity_null rooms only, "
              "a room can contribute >1 gap)")
        total_gaps = sum(gap_detail_hist.values())
        for cat, count in gap_detail_hist.most_common():
            print(f"  {cat}: {count} ({100 * count / total_gaps:.1f}%)")


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 15
    scan = int(sys.argv[2]) if len(sys.argv) > 2 else 2000
    main(n, scan)
