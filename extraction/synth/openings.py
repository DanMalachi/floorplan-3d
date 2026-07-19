"""Project ResPlan door/window polygons onto host wall centerline segments
(extraction-plan.md line 72: "window/door polygons -> host-wall projection
with center_offset/width").

ResPlan has no `passage` class, no swing/sill/head signal — those are
documented limitations, not bugs (flagged on each Opening).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

from shapely.geometry import LineString
from shapely.strtree import STRtree

from extraction.synth.skeleton import WallSegment
from extraction.synth.vendor.resplan_utils import get_geometries

Point = tuple[float, float]


@dataclass
class OpeningProjection:
    wall_index: int
    center_offset: float
    width: float
    opening_class: str  # "door" | "window"
    flags: list[str] = field(default_factory=list)


def _point_to_segment_t(p: Point, a: Point, b: Point) -> tuple[float, float]:
    """Returns (t, perpendicular_distance) where t is the clamped [0,1]
    parametric position of p's projection onto segment a->b."""
    ax, ay = a
    bx, by = b
    px, py = p
    dx, dy = bx - ax, by - ay
    seg_len2 = dx * dx + dy * dy
    if seg_len2 < 1e-12:
        return 0.0, math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / seg_len2
    t_clamped = max(0.0, min(1.0, t))
    proj_x, proj_y = ax + t_clamped * dx, ay + t_clamped * dy
    dist = math.hypot(px - proj_x, py - proj_y)
    return t_clamped, dist


def project_openings(
    segments: list[WallSegment],
    door_geom,
    window_geom,
    *,
    front_door_geom=None,
    tolerance: float = 2.0,
) -> tuple[list[OpeningProjection], list[str]]:
    """Projects every door/window/front_door polygon onto its nearest host
    wall segment. Returns (projections, batch_flags) — projections list is
    aligned 1:1 with input polygons in iteration order (door, then
    front_door, then window), skipping ones that couldn't attach (counted
    in batch_flags instead of silently vanishing)."""
    batch_flags: list[str] = []

    if not segments:
        return [], ["no_wall_segments_for_opening_projection"]

    lines = [LineString([s.start, s.end]) for s in segments]
    tree = STRtree(lines)

    projections: list[OpeningProjection] = []

    sources: list[tuple[object, str]] = []
    for poly in get_geometries(door_geom):
        sources.append((poly, "door"))
    for poly in get_geometries(front_door_geom):
        sources.append((poly, "door"))
    for poly in get_geometries(window_geom):
        sources.append((poly, "window"))

    for poly, cls in sources:
        if poly is None or poly.is_empty:
            continue
        centroid = poly.centroid
        rect = poly.minimum_rotated_rectangle
        rect_coords = list(rect.exterior.coords)[:4] if rect.geom_type == "Polygon" else None
        if rect_coords and len(rect_coords) == 4:
            side_a = math.hypot(rect_coords[1][0] - rect_coords[0][0], rect_coords[1][1] - rect_coords[0][1])
            side_b = math.hypot(rect_coords[2][0] - rect_coords[1][0], rect_coords[2][1] - rect_coords[1][1])
            width, depth = max(side_a, side_b), min(side_a, side_b)
        else:
            b = poly.bounds
            width, depth = max(b[2] - b[0], b[3] - b[1]), min(b[2] - b[0], b[3] - b[1])
        width = max(width, 1e-3)
        depth = max(depth, 1e-3)

        search_radius = width / 2 + depth / 2 + tolerance + 5.0
        candidate_lines = tree.query(centroid.buffer(search_radius))

        best_idx: Optional[int] = None
        best_dist = float("inf")
        best_t = 0.0
        for cand in candidate_lines:
            idx = int(cand)  # shapely 2.x STRtree.query returns integer indices, not geometries
            seg = segments[idx]
            t, dist = _point_to_segment_t((centroid.x, centroid.y), seg.start, seg.end)
            allowed = seg.thickness / 2 + depth / 2 + tolerance
            if dist <= allowed and dist < best_dist:
                best_idx, best_dist, best_t = idx, dist, t

        if best_idx is None:
            batch_flags.append(f"unattached_opening:{cls}")
            continue

        seg = segments[best_idx]
        seg_len = math.hypot(seg.end[0] - seg.start[0], seg.end[1] - seg.start[1])
        center_offset = best_t * seg_len
        flags: list[str] = []

        half_w = width / 2
        if center_offset - half_w <= 0 or center_offset + half_w >= seg_len:
            # Clamp so the opening stays inside the wall span, but flag it —
            # the schema validator would otherwise reject this span.
            center_offset = min(max(center_offset, half_w + 1e-6), max(seg_len - half_w - 1e-6, half_w + 1e-6))
            if width >= seg_len:
                flags.append("opening_wider_than_wall")
            else:
                flags.append("opening_clamped_to_wall_span")

        flags.append("swing_unknown") if cls == "door" else None
        projections.append(
            OpeningProjection(wall_index=best_idx, center_offset=center_offset, width=width, opening_class=cls, flags=flags)
        )

    _resolve_sibling_overlaps(projections, segments, batch_flags)
    return projections, batch_flags


def _resolve_sibling_overlaps(
    projections: list[OpeningProjection], segments: list[WallSegment], batch_flags: list[str]
) -> None:
    by_wall: dict[int, list[OpeningProjection]] = {}
    for p in projections:
        by_wall.setdefault(p.wall_index, []).append(p)

    for wall_idx, group in by_wall.items():
        if len(group) < 2:
            continue
        group.sort(key=lambda p: p.center_offset)
        for a, b in zip(group, group[1:]):
            a_hi = a.center_offset + a.width / 2
            b_lo = b.center_offset - b.width / 2
            if a_hi > b_lo:
                overlap = a_hi - b_lo
                # Try a small mutual shrink (<=5% of each width) before giving up.
                shrink_budget = 0.05 * (a.width + b.width)
                if overlap <= shrink_budget:
                    shrink_each = overlap / 2 + 1e-6
                    a.width = max(a.width - 2 * shrink_each, 1e-3)
                    b.width = max(b.width - 2 * shrink_each, 1e-3)
                    a.flags.append("sibling_overlap_shrunk")
                    b.flags.append("sibling_overlap_shrunk")
                else:
                    a.flags.append("sibling_overlap")
                    b.flags.append("sibling_overlap")
                    batch_flags.append(f"sibling_overlap:wall_{wall_idx}")
