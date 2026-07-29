"""Assemble ResPlan room polygons into schema-v1 wall_cycle[] id lists, and
derive a per-wall `role` heuristic (external/internal/rail) since ResPlan's
wall blob carries no role signal of its own.

Role decision confirmed with Dan on 2026-07-19: a wall segment whose only
adjacent room type is `balcony` gets role="rail", matching this app's
established tracing convention (docs/DATA_RIGHTS.md) and now part of the
canonical schema's WallRole enum (extraction/schema/models.py).
`partition_low`/`glazing`/`demising` are never emitted — no signal for
them exists in ResPlan.
"""
from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

from shapely.geometry import LineString, Point, Polygon
from shapely.strtree import STRtree

from extraction.synth.notch import (
    NOTCH_LENGTH_MULTIPLE,
    OPENING_COVERAGE_THRESHOLD,
    PERPENDICULARITY_COS_THRESHOLD,
    _cluster_ring_indices,
    _nearest_wall_backed_cos,
    _opening_coverage_and_match,
    _signed_area,
    notch_pocket_points,
)
from extraction.synth.skeleton import WallSegment
from extraction.synth.vendor.resplan_utils import get_geometries

ROOM_LABEL_MAP = {
    "living": "living",
    "bedroom": "bedroom",
    "bathroom": "bathroom",
    "kitchen": "kitchen",
    "storage": "storage",
    "stair": "stair",
    "balcony": "balcony",
}


@dataclass
class RoomAssembly:
    room_type: str
    instance_index: int
    wall_cycle: list[int]  # indices into the segments list, ordered + closed
    area: float


def _build_adjacency(segments: list[WallSegment], epsilon: float) -> dict[int, set[int]]:
    """Two walls are adjacent iff they share an endpoint within epsilon —
    reconstructs the skeleton's junction graph from segment coordinates
    alone (skeleton.py snaps shared junctions to identical float
    coordinates, so this is exact in practice, not just approximate)."""
    grid = max(epsilon, 1e-9)
    point_map: dict[tuple[int, int], list[int]] = {}
    for idx, seg in enumerate(segments):
        for pt in (seg.start, seg.end):
            key = (round(pt[0] / grid), round(pt[1] / grid))
            point_map.setdefault(key, []).append(idx)
    adjacency: dict[int, set[int]] = {i: set() for i in range(len(segments))}
    for idxs in point_map.values():
        for i in idxs:
            for j in idxs:
                if i != j:
                    adjacency[i].add(j)
    return adjacency


def _bfs_bridge(adjacency: dict[int, set[int]], start: int, goal: int, max_depth: int) -> Optional[list[int]]:
    """Shortest path of intermediate wall ids (excluding start/goal) bridging
    start to goal in the wall-adjacency graph, within max_depth hops. Used
    to repair a wall_cycle where two per-edge-matched walls don't directly
    share an endpoint but a short real connector wall exists between them
    (e.g. a tiny corner stub whose room-boundary edge was too short to
    independently pass the coverage threshold)."""
    if goal in adjacency.get(start, ()):
        return []
    visited = {start}
    q = deque([(start, [])])
    while q:
        node, path = q.popleft()
        if len(path) >= max_depth:
            continue
        for nxt in adjacency.get(node, ()):
            if nxt == goal:
                return path
            if nxt in visited:
                continue
            visited.add(nxt)
            q.append((nxt, path + [nxt]))
    return None


def _repair_connectivity(wall_seq: list[int], adjacency: dict[int, set[int]], max_depth: int) -> Optional[list[int]]:
    """Walks the cyclic wall_seq (including the closing edge back to
    wall_seq[0]) and splices in a short bridge wherever two consecutive
    entries don't actually share an endpoint. Returns None if any gap
    can't be bridged within max_depth hops."""
    n = len(wall_seq)
    out = [wall_seq[0]]
    for i in range(n):
        cur, nxt = wall_seq[i], wall_seq[(i + 1) % n]
        if cur == nxt:
            continue
        if nxt in adjacency.get(cur, ()):
            out.append(nxt)
            continue
        bridge = _bfs_bridge(adjacency, cur, nxt, max_depth)
        if bridge is None:
            return None
        out.extend(bridge)
        out.append(nxt)
    if len(out) >= 2 and out[-1] == out[0]:
        out = out[:-1]  # the wraparound pair re-appended wall_seq[0]; drop the duplicate close
    return out


def _offset_line_toward_point(
    seg: WallSegment, distance: float, toward: tuple[float, float]
) -> tuple[tuple[float, float], tuple[float, float]]:
    """The wall's centerline, shifted perpendicular by `distance` toward the
    given point (the room's own centroid) — i.e. the wall's inner FACE line
    for a room offset by exactly that wall's own half-thickness. Using each
    wall's own thickness here (rather than a single mean shrink over the
    whole cycle) matters: real cycles routinely mix a thick exterior wall
    with a thin partition, and a uniform shrink is measurably biased
    (verified: ~8% off on real data, just past a 5% gate) whenever
    thicknesses aren't uniform around the room."""
    x0, y0 = seg.start
    x1, y1 = seg.end
    dx, dy = x1 - x0, y1 - y0
    length = math.hypot(dx, dy)
    if length < 1e-9:
        return seg.start, seg.end
    nx, ny = -dy / length, dx / length
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    tvx, tvy = toward[0] - mx, toward[1] - my
    if (nx * tvx + ny * tvy) < 0:
        nx, ny = -nx, -ny
    ox, oy = nx * distance, ny * distance
    return (x0 + ox, y0 + oy), (x1 + ox, y1 + oy)


# Empirically calibrated centerline-to-room-face offset multiplier, fit
# 2026-07-20 against 107,608 direct per-wall perpendicular measurements
# (cast from the wall centerline to the SOURCE room polygon's own boundary)
# spanning 800 plans / wall_depth 2.76-6.59. ResPlan's room polygons sit
# CLOSER to the wall centerline than a naive full half-thickness offset
# predicts — median measured offset was ~0.84x half-thickness, not 1.0x.
# Two candidate models were fit and compared by residual spread:
#   Model A (fixed constant, ignores thickness): median=1.72, stdev=0.87,
#     residual sigma=0.429
#   Model B (multiplier k on half-thickness): median k=0.838, stdev=0.94,
#     residual sigma=0.417 <- narrow winner, applied here
# Neither model is a tight fit (both carry substantial per-wall noise —
# this looks like real variability in ResPlan's authoring process, not a
# single clean named convention); this constant is a measured empirical
# correction, not a discovered exact convention. If Phase 0 later defines
# an explicit room-polygon-to-wall convention in the labeling spec, this
# should be reconciled against it rather than trusted as ground truth.
EMPIRICAL_FACE_OFFSET_MULTIPLIER = 0.838


def _line_intersect(
    p1: tuple[float, float], p2: tuple[float, float], p3: tuple[float, float], p4: tuple[float, float]
) -> Optional[tuple[float, float]]:
    """Intersection of the infinite lines through p1-p2 and p3-p4 (None if
    parallel/near-parallel)."""
    x1, y1 = p1
    x2, y2 = p2
    x3, y3 = p3
    x4, y4 = p4
    denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(denom) < 1e-9:
        return None
    a, b = x1 * y2 - y1 * x2, x3 * y4 - y3 * x4
    px = (a * (x3 - x4) - (x1 - x2) * b) / denom
    py = (a * (y3 - y4) - (y1 - y2) * b) / denom
    return (px, py)


def _nearest_endpoint(seg: WallSegment, target: tuple[float, float]) -> tuple[float, float]:
    da = math.hypot(seg.start[0] - target[0], seg.start[1] - target[1])
    db = math.hypot(seg.end[0] - target[0], seg.end[1] - target[1])
    return seg.start if da <= db else seg.end


def _shared_centerline_point(seg_a: WallSegment, seg_b: WallSegment) -> tuple[float, float]:
    """The real centerline junction between two adjacent walls — the
    closest pair of their four endpoints, averaged (skeleton.py snaps
    shared junctions to identical float coordinates, so this is exact in
    practice)."""
    pairs = [(a, b) for a in (seg_a.start, seg_a.end) for b in (seg_b.start, seg_b.end)]
    a, b = min(pairs, key=lambda ab: math.hypot(ab[0][0] - ab[1][0], ab[0][1] - ab[1][1]))
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)


# A true corner-line intersection is only trustworthy when it lands close to
# the real centerline junction it's supposed to represent. Past this many
# half-thicknesses away, the "miter" is either from near-parallel offset
# lines (a straight run split into multiple wall ids, e.g. by a thickness
# change or an unrelated T-junction on the far side — the lines barely
# converge at all) or a reflex/concave turn (where naive corner-by-corner
# mitering produces a corner on the wrong side, self-intersecting the
# ring) — both real, measured failure modes, not theoretical. Below the
# limit, fall back to a bevel: two vertices (each wall's own offset
# endpoint nearest the real junction) joined by a short straight edge,
# rather than a fabricated single point.
_MITER_LIMIT = 8.0


def _corner_vertices(
    prev_seg: WallSegment,
    cur_seg: WallSegment,
    prev_offset: tuple[tuple[float, float], tuple[float, float]],
    cur_offset: tuple[tuple[float, float], tuple[float, float]],
    prev_half_thick: float,
    cur_half_thick: float,
) -> list[tuple[float, float]]:
    """One corner's contribution to the face-polygon ring: a single
    mitered vertex if the two offset lines' intersection lands within
    _MITER_LIMIT half-thicknesses of the real centerline junction,
    otherwise a bevel (two vertices — each wall's own offset endpoint
    nearest the junction)."""
    junction = _shared_centerline_point(prev_seg, cur_seg)
    limit = _MITER_LIMIT * max(prev_half_thick, cur_half_thick, 1e-6)
    corner = _line_intersect(*prev_offset, *cur_offset)
    if corner is not None and math.hypot(corner[0] - junction[0], corner[1] - junction[1]) <= limit:
        return [corner]
    prev_p1, prev_p2 = prev_offset
    cur_p1, cur_p2 = cur_offset
    near_prev = prev_p1 if _nearest_endpoint(prev_seg, junction) == prev_seg.start else prev_p2
    near_cur = cur_p1 if _nearest_endpoint(cur_seg, junction) == cur_seg.start else cur_p2
    return [near_prev, near_cur]


def _mitered_face_polygon(
    wall_cycle: list[int], segments: list[WallSegment], centroid: tuple[float, float]
) -> Optional[Polygon]:
    """Per-wall mitered inset: offset each wall's centerline inward by its
    OWN half-thickness (toward the room centroid), scaled by
    EMPIRICAL_FACE_OFFSET_MULTIPLIER — a uniform whole-cycle shrink is
    still wrong whenever the cycle mixes wall thicknesses. What changed
    from the original version is how consecutive offset lines become a
    closed polygon: instead of unconditionally intersecting each pair as
    INFINITE lines (undefined for parallel/collinear neighbors, and
    silently wrong — a corner on the far side, self-intersecting the ring —
    at reflex/concave turns), each corner tries the miter intersection and
    only accepts it if it lands within _MITER_LIMIT half-thicknesses of the
    real centerline junction; otherwise it falls back to a bevel (two
    vertices instead of one). This is the standard fallback CAD/stroking
    offset algorithms use when a true miter isn't well-defined.

    A short wall between two much-thicker neighbors (e.g. a chamfered
    corner) can still produce a hairline self-intersection right at its
    own tiny edge, from ordinary floating-point noise rather than a real
    topology error — `buffer(0)` is shapely's standard fix for exactly this
    (verified: it collapses the sliver without materially changing area,
    e.g. 5939.78 -> 5939.78 on a real case that was off by <0.01%). Only
    trust it when the repaired result is STILL a single Polygon — if
    healing splits the ring into multiple pieces, that's a real topological
    problem, not noise, and this returns None rather than silently picking
    one piece. Note this heal is not a universal safety net for a genuinely
    broken cycle (e.g. one that revisits the same wall id): it can still
    resolve into a single, structurally-valid-but-wrong small polygon
    rather than None (verified on a synthetic repeat case) — the caller's
    area-match comparison against the source room polygon is what actually
    catches that, not this function alone."""
    n = len(wall_cycle)
    if n < 3:
        return None
    offset_lines = [
        _offset_line_toward_point(
            segments[wid], segments[wid].thickness / 2 * EMPIRICAL_FACE_OFFSET_MULTIPLIER, centroid
        )
        for wid in wall_cycle
    ]

    vertices: list[tuple[float, float]] = []
    for i in range(n):
        prev_wid, cur_wid = wall_cycle[i - 1], wall_cycle[i]
        vertices.extend(
            _corner_vertices(
                segments[prev_wid],
                segments[cur_wid],
                offset_lines[i - 1],
                offset_lines[i],
                segments[prev_wid].thickness / 2 * EMPIRICAL_FACE_OFFSET_MULTIPLIER,
                segments[cur_wid].thickness / 2 * EMPIRICAL_FACE_OFFSET_MULTIPLIER,
            )
        )

    if len(vertices) < 3:
        return None
    poly = Polygon(vertices)
    if poly.is_valid and not poly.is_empty:
        return poly
    healed = poly.buffer(0)
    if healed.geom_type == "Polygon" and healed.is_valid and not healed.is_empty:
        return healed
    return None


def _band(seg: WallSegment, tolerance: float):
    # cap_style=2 (flat/butt): a wall's band must not bulge past its own
    # endpoints along its axis (default round caps do), or it spuriously
    # overlaps a perpendicular room edge meeting it at a shared corner.
    return LineString([seg.start, seg.end]).buffer(seg.thickness / 2 + tolerance, cap_style=2)


def assemble_rooms(
    segments: list[WallSegment],
    room_polys_by_type: dict[str, list],
    *,
    tolerance: float = 2.0,
    coverage_threshold: float = 0.5,
    adjacency_epsilon: float = 0.1,
    max_bridge_depth: int = 3,
    area_match_tolerance: float = 0.05,
    openings: dict[str, object] | None = None,
    wall_depth: float = 4.0,
) -> tuple[list[RoomAssembly], dict[int, set[str]], list[str]]:
    """Returns (assembled rooms, {wall_index: {room_type, ...}} for
    successfully-assembled rooms only, batch flags).

    Assembly is two-stage: (1) per-edge spatial coverage picks candidate
    wall ids (a single straight room-boundary edge can span multiple short
    wall segments); (2) the resulting sequence is verified/repaired for
    actual topological connectivity in the wall-adjacency graph (per-edge
    coverage alone doesn't guarantee consecutive picks share an endpoint —
    verified as a real failure mode on production data, not hypothetical).
    A repaired cycle is only accepted if its implied polygon area matches
    the source room polygon within area_match_tolerance — conservative by
    design: reject with "cycle_unrepairable" rather than force a cycle
    closed that doesn't actually represent the room's real shape.

    `openings` (optional {"door"/"window"/"front_door": geom}) and
    `wall_depth` enable doorway-notch handling (lever #1, see
    docs/session-notes/p3a-handoff.md): a room polygon edge that no wall
    band ever backs (by construction — a doorway notch traces the room
    boundary through the door threshold, where no wall exists) is excused
    from the coverage requirement instead of unconditionally breaking the
    room, when it matches the same validated 3-condition discriminator
    `qa/measure_clean_at_source.py::check_plan` already uses for a
    different purpose. The excused edges' own pocket area is then
    subtracted from the source polygon before the area-match gate below,
    so both sides of that comparison exclude the notch. Passing neither
    argument (both defaults) makes this a no-op — every existing caller's
    behavior is unchanged."""
    batch_flags: list[str] = []
    if not segments:
        return [], {}, ["no_wall_segments_for_room_assembly"]

    bands = [_band(s, tolerance) for s in segments]
    tree = STRtree(bands)
    adjacency = _build_adjacency(segments, adjacency_epsilon)

    opening_polys = [
        ((ot, idx), part)
        for ot in ("door", "window", "front_door")
        for idx, part in enumerate(get_geometries((openings or {}).get(ot)))
    ]

    rooms: list[RoomAssembly] = []
    wall_to_room_types: dict[int, set[str]] = {}

    for room_type, polys in room_polys_by_type.items():
        parts = get_geometries(polys)
        for inst_idx, poly in enumerate(parts):
            if poly is None or poly.is_empty or poly.geom_type != "Polygon":
                continue
            coords = list(poly.exterior.coords)
            n = len(coords) - 1

            # Pass 1: per-edge candidate wall coverage — same
            # candidate/overlap/dedupe logic as before, but the
            # accept/reject decision is now DEFERRED to pass 2, because the
            # doorway-notch discriminator's perpendicularity check needs
            # every other ring edge's coverage computed first (including
            # edges later in ring order than the one currently being
            # evaluated — mirrors qa/measure_clean_at_source.py::check_plan's
            # own two-pass structure).
            ring_edges: list[tuple[tuple[float, float], tuple[float, float], float]] = []
            edge_deduped: list[list[int] | None] = [None] * n
            edge_ratio: list[float | None] = [None] * n
            for i in range(n):
                a, b = coords[i], coords[i + 1]
                dx, dy = b[0] - a[0], b[1] - a[1]
                edge_len = (dx * dx + dy * dy) ** 0.5
                ring_edges.append((a, b, edge_len))
                if edge_len < tolerance:
                    # Sub-tolerance edges are corner-transition artifacts
                    # (stair-stepping in the source polygon), not real wall
                    # runs — they can't meaningfully align with any single
                    # wall direction and shouldn't be required to.
                    continue
                edge_line = LineString([a, b])
                candidates = tree.query(edge_line.buffer(tolerance))

                # A single straight room-boundary edge can span MULTIPLE
                # short wall segments (a long wall run subdivided by T
                # junctions from side walls butting into it) — so collect
                # every band the edge meaningfully overlaps, in order along
                # the edge, rather than picking one "best" band.
                overlaps: list[tuple[float, float, int, float]] = []  # (t_start, t_end, idx, length)
                for cand in candidates:
                    idx = int(cand)  # shapely 2.x STRtree.query returns integer indices, not geometries
                    seg = segments[idx]
                    sx, sy = seg.end[0] - seg.start[0], seg.end[1] - seg.start[1]
                    seg_len = (sx * sx + sy * sy) ** 0.5
                    if seg_len < 1e-9:
                        continue
                    # Reject walls that meet this edge at a real angle (e.g.
                    # a perpendicular side wall butting into the corner) —
                    # their band's perpendicular width can bleed a short,
                    # geometrically real overlap into the edge near the
                    # shared corner even with flat caps. Only near-parallel
                    # walls can genuinely BE this edge.
                    cos_angle = abs((dx * sx + dy * sy) / (edge_len * seg_len))
                    if cos_angle < 0.9:
                        continue
                    inter = edge_line.intersection(bands[idx])
                    inter_len = inter.length
                    if inter_len < min(tolerance, edge_len * 0.03):
                        continue
                    pts = list(inter.coords) if inter.geom_type == "LineString" else [
                        c for g in getattr(inter, "geoms", []) for c in g.coords
                    ]
                    if not pts:
                        continue
                    ts = [((px - a[0]) * dx + (py - a[1]) * dy) / (edge_len * edge_len) for px, py in pts]
                    overlaps.append((min(ts), max(ts), idx, inter_len))

                overlaps.sort(key=lambda o: o[0])
                covered = sum(min(t1, 1.0) - max(t0, 0.0) for t0, t1, _, _ in overlaps if t1 > t0) * edge_len
                # merge-order dedupe consecutive duplicate wall ids from
                # overlapping/adjacent bands near junctions
                edge_wall_ids = [idx for _, _, idx, _ in overlaps]
                deduped = [w for j, w in enumerate(edge_wall_ids) if j == 0 or w != edge_wall_ids[j - 1]]

                edge_deduped[i] = deduped
                edge_ratio[i] = covered / edge_len if edge_len else 0.0

            # Pass 2: build wall_seq from cleanly-covered edges; for
            # everything else (today's unconditional broken=True trigger),
            # give the doorway-notch discriminator a chance to excuse the
            # edge first — a notch jamb/crossbar is never backed by any
            # wall band by construction (no wall exists there), so it can
            # never pass the coverage check above no matter how the
            # thresholds are tuned; excusing it is the only way its room
            # ever assembles.
            wall_seq: list[int] = []
            broken = False
            notch_excused_edges: list[tuple[int, tuple]] = []
            for i in range(n):
                a, b, edge_len = ring_edges[i]
                deduped = edge_deduped[i]
                ratio = edge_ratio[i]

                if deduped is None:
                    continue  # sub-tolerance edge, unchanged skip

                if deduped and ratio is not None and ratio >= coverage_threshold:
                    for idx in deduped:
                        if not wall_seq or wall_seq[-1] != idx:
                            wall_seq.append(idx)
                    continue

                if opening_polys:
                    dx, dy = b[0] - a[0], b[1] - a[1]
                    ux, uy = (dx / edge_len, dy / edge_len) if edge_len else (0.0, 0.0)
                    opening_cov, match_key = _opening_coverage_and_match(
                        a, b, edge_len, dx, dy, opening_polys, wall_depth
                    )
                    cos_to_neighbor = _nearest_wall_backed_cos(i, ring_edges, edge_ratio, ux, uy, coverage_threshold)
                    is_notch = (
                        opening_cov >= OPENING_COVERAGE_THRESHOLD
                        and cos_to_neighbor is not None
                        and cos_to_neighbor <= PERPENDICULARITY_COS_THRESHOLD
                        and edge_len <= NOTCH_LENGTH_MULTIPLE * wall_depth
                    )
                    if is_notch and match_key is not None:
                        notch_excused_edges.append((i, match_key))
                        continue

                broken = True
            # dedupe wrap-around repeat (first == last after closing the ring)
            if len(wall_seq) >= 2 and wall_seq[0] == wall_seq[-1]:
                wall_seq = wall_seq[:-1]

            if broken or len(set(wall_seq)) < 3:
                batch_flags.append(f"broken_room_cycle:{room_type}_{inst_idx}")
                continue

            repaired_seq = _repair_connectivity(wall_seq, adjacency, max_bridge_depth)
            if repaired_seq is None or len(set(repaired_seq)) < 3:
                batch_flags.append(f"cycle_unrepairable:{room_type}_{inst_idx}")
                continue

            # The wall_cycle's centerline junctions trace a polygon larger
            # than the room's actual interior face area — each wall's face
            # sits half ITS OWN thickness back from the centerline. Build
            # the proper mitered face polygon (not a uniform shrink, which
            # is measurably biased whenever the cycle mixes wall
            # thicknesses — verified ~8% off on real data) before comparing
            # to the source room polygon's area.
            face_poly = _mitered_face_polygon(repaired_seq, segments, (poly.centroid.x, poly.centroid.y))
            implied_area = face_poly.area if face_poly is not None else 0.0

            # Doorway-notch area-gate normalization (Option C, lever #1).
            # If any ring edge was excused above, the wall_cycle closes
            # across the notch via a straight run, so face_poly is smaller
            # than the source poly by exactly the notch's own area (poly's
            # OWN area INCLUDES the notch — ResPlan traces the room
            # boundary through the door threshold). Normalize poly DOWN
            # (poly.difference(pocket), never union — confirmed against
            # test_doorway_notch_does_not_flag's fixture: 1216 source - 16
            # notch = 1200, matching the straight-run face; see
            # extraction/synth/tests/test_notch.py) so both sides of the
            # gate below are compared on the same convention. Falls back to
            # the raw poly.area if no pocket ends up usable (every
            # candidate cluster degenerate or an outward anomaly) — same
            # semantics as no notch having been excused at all.
            compare_area = poly.area
            notch_applied = False
            if notch_excused_edges:
                verts = coords[:-1]
                groups: dict[tuple, list[int]] = {}
                for edge_idx, key in notch_excused_edges:
                    groups.setdefault(key, []).append(edge_idx)
                # A shared opening key is necessary but not sufficient for
                # "same pocket" — cluster each key-group by ring proximity
                # first (see _cluster_ring_indices's docstring: plan 64 had
                # two unrelated opposite-side notches both best-matching
                # one door).
                clustered_groups: list[list[int]] = []
                for idxs in groups.values():
                    clustered_groups.extend(_cluster_ring_indices(idxs, n))
                parent_signed = _signed_area(verts)
                normalized = poly
                for idxs in clustered_groups:
                    pocket_pts, status = notch_pocket_points(verts, idxs, n, parent_signed)
                    if status == "ok":
                        normalized = normalized.difference(Polygon(pocket_pts))
                if (
                    normalized.is_valid
                    and not normalized.is_empty
                    and normalized.geom_type == "Polygon"
                    and normalized.area < poly.area
                ):
                    compare_area = normalized.area
                    notch_applied = True

            area_err = abs(implied_area - compare_area) / max(compare_area, 1e-9)
            if implied_area <= 0 or area_err > area_match_tolerance:
                batch_flags.append(f"cycle_unrepairable:{room_type}_{inst_idx}")
                continue

            if repaired_seq != wall_seq:
                batch_flags.append(f"cycle_repaired:{room_type}_{inst_idx}")
            if notch_applied:
                batch_flags.append(f"notch_normalized:{room_type}_{inst_idx}")

            rooms.append(
                RoomAssembly(room_type=room_type, instance_index=inst_idx, wall_cycle=repaired_seq, area=poly.area)
            )
            for idx in set(repaired_seq):
                wall_to_room_types.setdefault(idx, set()).add(room_type)

    return rooms, wall_to_room_types, batch_flags


def wall_roles(
    segments: list[WallSegment],
    inner_geom,
    wall_to_room_types: dict[int, set[str]],
    *,
    external_tolerance: float = 3.0,
) -> tuple[list[str], list[list[str]]]:
    """Returns (roles, flags) aligned 1:1 with segments."""
    inner_parts = get_geometries(inner_geom)
    inner_boundary = None
    if inner_parts:
        boundaries = [p.exterior for p in inner_parts if p.geom_type == "Polygon"]
        if boundaries:
            from shapely.ops import unary_union

            inner_boundary = unary_union(boundaries).buffer(external_tolerance)

    roles: list[str] = []
    flags: list[list[str]] = []
    for idx, seg in enumerate(segments):
        mid = ((seg.start[0] + seg.end[0]) / 2, (seg.start[1] + seg.end[1]) / 2)
        seg_flags: list[str] = []
        if inner_boundary is not None and inner_boundary.contains_properly(Point(mid)):
            role = "external"
        else:
            room_types = wall_to_room_types.get(idx, set())
            if room_types == {"balcony"}:
                role = "rail"
                seg_flags.append("resplan_rail_from_balcony")
            else:
                role = "internal"
        roles.append(role)
        flags.append(seg_flags)
    return roles, flags
