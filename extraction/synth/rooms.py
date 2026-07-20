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


def _line_intersect(
    p1: tuple[float, float], p2: tuple[float, float], p3: tuple[float, float], p4: tuple[float, float]
) -> Optional[tuple[float, float]]:
    """Intersection of the infinite lines through p1-p2 and p3-p4."""
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


def _mitered_face_polygon(
    wall_cycle: list[int], segments: list[WallSegment], centroid: tuple[float, float]
) -> Optional[Polygon]:
    """Proper per-wall mitered inset: offset each wall's centerline inward
    by its OWN half-thickness (toward the room centroid), scaled by the
    empirically-calibrated EMPIRICAL_FACE_OFFSET_MULTIPLIER, then intersect
    consecutive offset lines to get each face-polygon corner. This is the
    correct construction (matches how a real wall's inner face relates to
    its centerline) — a single uniform shrink over the whole cycle is only
    correct when every wall in it happens to share the same thickness."""
    offset_lines = [
        _offset_line_toward_point(
            segments[wid], segments[wid].thickness / 2 * EMPIRICAL_FACE_OFFSET_MULTIPLIER, centroid
        )
        for wid in wall_cycle
    ]
    n = len(offset_lines)
    vertices = []
    for i in range(n):
        p1, p2 = offset_lines[i - 1]
        p3, p4 = offset_lines[i]
        pt = _line_intersect(p1, p2, p3, p4)
        if pt is None:
            return None
        vertices.append(pt)
    if len(vertices) < 3:
        return None
    poly = Polygon(vertices)
    return poly if poly.is_valid and not poly.is_empty else None


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
    closed that doesn't actually represent the room's real shape."""
    batch_flags: list[str] = []
    if not segments:
        return [], {}, ["no_wall_segments_for_room_assembly"]

    bands = [_band(s, tolerance) for s in segments]
    tree = STRtree(bands)
    adjacency = _build_adjacency(segments, adjacency_epsilon)

    rooms: list[RoomAssembly] = []
    wall_to_room_types: dict[int, set[str]] = {}

    for room_type, polys in room_polys_by_type.items():
        parts = get_geometries(polys)
        for inst_idx, poly in enumerate(parts):
            if poly is None or poly.is_empty or poly.geom_type != "Polygon":
                continue
            coords = list(poly.exterior.coords)
            wall_seq: list[int] = []
            broken = False
            for i in range(len(coords) - 1):
                a, b = coords[i], coords[i + 1]
                dx, dy = b[0] - a[0], b[1] - a[1]
                edge_len = (dx * dx + dy * dy) ** 0.5
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

                if not deduped or covered / edge_len < coverage_threshold:
                    broken = True
                    continue
                for idx in deduped:
                    if not wall_seq or wall_seq[-1] != idx:
                        wall_seq.append(idx)
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
            area_err = abs(implied_area - poly.area) / max(poly.area, 1e-9)
            if implied_area <= 0 or area_err > area_match_tolerance:
                batch_flags.append(f"cycle_unrepairable:{room_type}_{inst_idx}")
                continue

            if repaired_seq != wall_seq:
                batch_flags.append(f"cycle_repaired:{room_type}_{inst_idx}")

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
