"""Diagnosis-only: root-cause the `broken_room_cycle` failure mode on
required rooms — issue #4 in docs/session-notes/p3a-handoff.md, 21.0% of
plans exclusively (63/300). Per rooms.py::assemble_rooms, a room edge is
flagged broken when its per-edge spatial coverage stage finds either no
usable wall band at all, or an insufficient one (`covered / edge_len <
coverage_threshold`, 0.5) — BEFORE stage 2 (connectivity repair) ever
runs, so this is a distinct failure point from `cycle_unrepairable`.

Samples plans that hit broken_room_cycle on a required room and carry NO
cycle_unrepairable flag anywhere in the plan (the handoff's "exclusively"
population), re-runs the per-edge loop with the instrumentation
rooms.py/assemble_one_room_cycle don't expose (raw STRtree broad-phase
candidate count, per-candidate angle-filter outcome, and what coverage
each rejected candidate would have contributed), and classifies each
broken edge into one of the handoff's three named hypotheses (or a new
category if the data doesn't fit):

  - no_candidate_band: tree.query(edge_line.buffer(tolerance)) — the
    broad geometric-overlap phase, before any filtering — returned zero
    candidates. Nothing to match against at all.
  - coverage_below_threshold: at least one candidate survived the angle
    filter and contributed real overlap, but the summed covered fraction
    of the edge still fell under 0.5.
  - angle_filter_rejected_real_match: a broad-phase candidate was
    rejected by `cos_angle < 0.9` but at only a MODERATE tilt (cos_angle
    >= 0.5, i.e. within ~60 degrees of parallel — a plausible diagonal or
    chamfered wall run), and had it been admitted its hypothetical
    overlap would have been enough (alone or combined with what did
    survive) to clear the 0.5 coverage threshold — i.e. the angle filter,
    not an absence of matching geometry, is what broke this edge.
  - no_angle_valid_candidate: a fourth category the data forced, distinct
    from the three named hypotheses. A broad-phase candidate exists, but
    every one is near-perpendicular (cos_angle < 0.5, i.e. within ~30
    degrees of a right angle — a side wall butting into the corner) and
    none survives even hypothetically. This is exactly the case
    rooms.py's own angle-filter comment describes as intentional to
    reject (band-width "bleed" near a shared corner) — treating it as a
    wrongly-rejected match would be circular. Functionally it behaves
    like no_candidate_band (nothing usable exists for this edge) but the
    mechanism differs: something IS spatially near, just never at a
    plausible angle.

This module makes no changes to rooms.py or resplan_convert.py — it
duplicates the minimum needed logic (matching the established pattern in
diagnose_area_gap.py / diagnose_cycle_unrepairable.py) purely to observe
what the per-edge stage currently discards. Fixes are explicitly out of
scope for this pass.
"""
from __future__ import annotations

import pickle
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from shapely.geometry import LineString
from shapely.strtree import STRtree

from extraction.synth.qa.diagnose_clean_rate import categorize
from extraction.synth.resplan_convert import CLEAN_REQUIRED_ROOM_TYPES, convert_plan
from extraction.synth.rooms import _band
from extraction.synth.skeleton import extract_wall_skeleton, fill_openings_into_wall
from extraction.synth.vendor.resplan_utils import get_geometries, normalize_keys

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"
TOLERANCE = 2.0  # must match rooms.py::assemble_rooms's default
COVERAGE_THRESHOLD = 0.5  # must match rooms.py::assemble_rooms's default
PLAUSIBLE_COS_ANGLE_FLOOR = 0.5  # cos(60deg) — see _diagnose_edges for rationale
_CATEGORY_PRIORITY = [
    "no_candidate_band",
    "no_angle_valid_candidate",
    "angle_filter_rejected_real_match",
    "coverage_below_threshold",
]


def _diagnose_edges(segments, poly, tolerance=TOLERANCE, coverage_threshold=COVERAGE_THRESHOLD) -> list[dict]:
    """Mirrors diagnose_area_gap.assemble_one_room_cycle's per-edge loop,
    but records full diagnostics for every edge that ends up broken
    instead of just returning None for the whole room."""
    bands = [_band(s, tolerance) for s in segments]
    tree = STRtree(bands)
    coords = list(poly.exterior.coords)
    broken_edges = []

    for i in range(len(coords) - 1):
        a, b = coords[i], coords[i + 1]
        dx, dy = b[0] - a[0], b[1] - a[1]
        edge_len = (dx * dx + dy * dy) ** 0.5
        if edge_len < tolerance:
            continue
        edge_line = LineString([a, b])
        raw_candidates = list(tree.query(edge_line.buffer(tolerance)))

        overlaps = []  # candidates that actually pass the real filter (t0, t1)
        rejected_by_angle = []  # (idx, cos_angle, hypothetical_t0, hypothetical_t1)
        for c in raw_candidates:
            idx = int(c)
            seg = segments[idx]
            sx, sy = seg.end[0] - seg.start[0], seg.end[1] - seg.start[1]
            seg_len = (sx * sx + sy * sy) ** 0.5
            if seg_len < 1e-9:
                continue
            cos_angle = abs((dx * sx + dy * sy) / (edge_len * seg_len))

            inter = edge_line.intersection(bands[idx])
            inter_len = inter.length
            pts = list(inter.coords) if inter.geom_type == "LineString" else [
                p for g in getattr(inter, "geoms", []) for p in g.coords
            ]
            ts = [((px - a[0]) * dx + (py - a[1]) * dy) / (edge_len * edge_len) for px, py in pts] if pts else []

            if cos_angle < 0.9:
                if ts:
                    rejected_by_angle.append((idx, cos_angle, min(ts), max(ts)))
                continue
            if inter_len < min(tolerance, edge_len * 0.03) or not ts:
                continue
            overlaps.append((min(ts), max(ts), idx))

        overlaps.sort()
        covered = sum(min(t1, 1.0) - max(t0, 0.0) for t0, t1, _ in overlaps if t1 > t0) * edge_len
        ids = [x[2] for x in overlaps]
        deduped = [w for j, w in enumerate(ids) if j == 0 or w != ids[j - 1]]

        if deduped and covered / edge_len >= coverage_threshold:
            continue  # this edge is fine — not broken

        # Edge is broken. Classify.
        #
        # cos_angle alone doesn't tell you WHY a rejected candidate was
        # rejected — a candidate near cos_angle=0 is essentially
        # perpendicular to the edge (a side wall butting into the corner,
        # exactly the case the 0.9 filter exists to reject per rooms.py's
        # own comment: its band's width can "bleed" a short, geometrically
        # real overlap into the edge near a shared corner even though it
        # is NOT the wall that IS this edge). Treating that as a wrongly-
        # rejected "real match" would be circular: the corner-bleed overlap
        # is the false signal the filter is designed to suppress, not
        # evidence the filter is wrong. Only a candidate with a *moderate*
        # tilt (PLAUSIBLE_COS_ANGLE_FLOOR <= cos_angle < 0.9 — i.e. within
        # ~60 degrees of parallel, not ~90) is a plausible genuine near-miss
        # (e.g. a diagonal/chamfered wall run) worth attributing to the
        # angle filter itself.
        plausible_rejected = [r for r in rejected_by_angle if r[1] >= PLAUSIBLE_COS_ANGLE_FLOOR]
        perpendicular_rejected = [r for r in rejected_by_angle if r[1] < PLAUSIBLE_COS_ANGLE_FLOOR]

        if not raw_candidates:
            category = "no_candidate_band"
        elif plausible_rejected:
            # Would admitting the best plausible angle-rejected candidate(s),
            # combined with whatever already survived, clear the threshold?
            combined = [(t0, t1) for t0, t1, _ in overlaps] + [(t0, t1) for _, cos, t0, t1 in plausible_rejected]
            combined.sort()
            hypothetical_covered = sum(
                min(t1, 1.0) - max(t0, 0.0) for t0, t1 in combined if t1 > t0
            ) * edge_len
            if hypothetical_covered / edge_len >= coverage_threshold:
                category = "angle_filter_rejected_real_match"
            else:
                category = "coverage_below_threshold"
        elif not overlaps and perpendicular_rejected:
            # Only near-perpendicular candidates exist anywhere near this
            # edge — nothing correctly oriented was even found by the
            # broad phase. Distinct from no_candidate_band (something WAS
            # spatially near) but functionally the same absence: there is
            # no genuinely-angled wall to match against, so forcing a
            # match here would be wrong, not merely filtered.
            category = "no_angle_valid_candidate"
        else:
            category = "coverage_below_threshold"

        broken_edges.append(
            dict(
                edge_index=i,
                edge_len=round(edge_len, 2),
                n_raw_candidates=len(raw_candidates),
                n_rejected_by_angle=len(rejected_by_angle),
                best_rejected_cos_angle=round(max((c for _, c, _, _ in rejected_by_angle), default=0.0), 3),
                covered_ratio=round(covered / edge_len, 3),
                category=category,
            )
        )

    return broken_edges


def analyze_plan(raw_plan: dict) -> list[dict]:
    """Returns one dict per required-room instance carrying a
    broken_room_cycle flag, with per-edge diagnostics. Rooms that assemble
    fine are skipped."""
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

    results = []
    for rt in CLEAN_REQUIRED_ROOM_TYPES:
        g = p.get(rt)
        if g is None:
            continue
        for inst_idx, poly in enumerate(get_geometries(g)):
            if poly is None or poly.is_empty or poly.geom_type != "Polygon":
                continue
            broken_edges = _diagnose_edges(segments, poly)
            if not broken_edges:
                continue  # this room instance assembled fine
            present = {e["category"] for e in broken_edges}
            primary = next((c for c in _CATEGORY_PRIORITY if c in present), broken_edges[0]["category"])
            results.append(
                dict(
                    resplan_id=raw_plan.get("id"),
                    room=f"{rt}_{inst_idx}",
                    primary_category=primary,
                    n_broken_edges=len(broken_edges),
                    broken_edges=broken_edges,
                )
            )
    return results


def find_sample(plans: list[dict], target_n: int, scan_limit: int) -> list[dict]:
    """Scans plans in order (deterministic) for the handoff's "exclusively"
    population: hits room_assembly_failed_required via categorize(), with
    NO cycle_unrepairable flag anywhere in the plan (any room type)."""
    sample = []
    for p in plans[:scan_limit]:
        _, stats = convert_plan(p)
        cats = categorize(stats)
        if "room_assembly_failed_required" not in cats:
            continue
        flags = stats.get("flags", [])
        if any(f.startswith("room:cycle_unrepairable:") for f in flags):
            continue
        sample.append(p)
        if len(sample) >= target_n:
            break
    return sample


def main(target_n: int = 15, scan_limit: int = 2000) -> None:
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)

    sample = find_sample(plans, target_n, scan_limit)
    print(f"Sampled {len(sample)} plans in broken_room_cycle-only (room_assembly_failed_required, "
          f"no cycle_unrepairable anywhere) (scanned first {scan_limit} of {len(plans)} plans)\n")

    room_primary_hist: Counter = Counter()
    edge_detail_hist: Counter = Counter()
    n_rooms_diagnosed = 0
    n_plans_with_no_flagged_room = 0

    for raw_plan in sample:
        room_results = analyze_plan(raw_plan)
        if not room_results:
            n_plans_with_no_flagged_room += 1
            print(f"=== plan {raw_plan.get('id')}: no broken_room_cycle required-room instance "
                  f"reproduced (see caveat below) ===\n")
            continue
        for r in room_results:
            n_rooms_diagnosed += 1
            room_primary_hist[r["primary_category"]] += 1
            print(f"=== plan {r['resplan_id']} room={r['room']}: {r['primary_category'].upper()} "
                  f"({r['n_broken_edges']} broken edge(s)) ===")
            for e in r["broken_edges"]:
                edge_detail_hist[e["category"]] += 1
                print(
                    f"  edge_index={e['edge_index']} len={e['edge_len']}: "
                    f"n_raw_candidates={e['n_raw_candidates']} "
                    f"n_rejected_by_angle={e['n_rejected_by_angle']} "
                    f"best_rejected_cos_angle={e['best_rejected_cos_angle']} "
                    f"covered_ratio={e['covered_ratio']} (threshold={COVERAGE_THRESHOLD}) "
                    f"-> {e['category']}"
                )
            print()

    print("=" * 70)
    print(f"Plans sampled: {len(sample)}")
    print(f"Required-room instances reproducing a broken_room_cycle flag: {n_rooms_diagnosed}")
    if n_plans_with_no_flagged_room:
        print(
            f"CAVEAT: {n_plans_with_no_flagged_room} sampled plan(s) reproduced no matching room "
            f"instance under this script's reimplementation of the per-edge stage — either a "
            f"discrepancy between this diagnostic and rooms.py's real assemble_rooms, or the flag "
            f"came from a room-type edge case; flagged rather than silently dropped."
        )

    print("\nRoot-cause histogram — one bucket per FAILING REQUIRED-ROOM INSTANCE (primary cause):")
    total_rooms = sum(room_primary_hist.values()) or 1
    for cat, count in room_primary_hist.most_common():
        print(f"  {cat}: {count} ({100 * count / total_rooms:.1f}%)")

    if edge_detail_hist:
        print("\n(finer detail: per-broken-edge breakdown, a room can contribute >1 edge)")
        total_edges = sum(edge_detail_hist.values())
        for cat, count in edge_detail_hist.most_common():
            print(f"  {cat}: {count} ({100 * count / total_edges:.1f}%)")


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 15
    scan = int(sys.argv[2]) if len(sys.argv) > 2 else 2000
    main(n, scan)
