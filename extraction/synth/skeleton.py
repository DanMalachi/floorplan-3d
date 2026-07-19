"""Decompose a ResPlan-style unified wall polygon into wall centerline
segments + junctions, via rasterize -> skeletonize -> pixel graph -> prune ->
simplify -> map back to plan space.

ResPlan's plan["wall"] is one Polygon/MultiPolygon covering ALL wall ink in
the plan (no pre-segmented wall runs) — this module is the medial-axis step
called out explicitly in extraction-plan.md line 72.

IMPORTANT: ResPlan cuts door/window openings out of the wall polygon (the
opening footprint has zero overlap with plan["wall"] — verified directly:
wall.intersection(door_poly).area == 0.0 on real data). Skeletonizing
plan["wall"] alone therefore breaks the wall network at every opening,
which then makes opening-projection nearly impossible (the "nearest wall"
is the far side of a real gap, tens of units away). Callers MUST first
call `fill_openings_into_wall()` to restore a continuous wall network
before calling `extract_wall_skeleton()`, and should still pass the
*original* wall geometry as `thickness_source_geom` so thickness sampling
reflects real wall material, not opening-fill artifacts.

Known, deliberate simplifications (flagged in the converter-stats/gate
report, not hidden):
  - curvature is never recovered; every wall is straight (ResPlan carries no
    arc signal for walls).
  - thickness is measured directly against the source vector geometry
    (perpendicular chord sampling, junction-excluded — see
    _measure_thickness_vector), falling back to a distance-transform
    raster estimate only for segments too short to have an interior
    sampling zone (flagged as "thickness_raster_fallback_N" when this
    happens). The raster method alone was found to be measurably biased —
    traced a concrete case where it implied a 2.5-unit centerline-to-face
    gap when the true gap was 0.74 units, driving ~6.6% median room-area
    error in rooms.py's face-polygon match against source data.
  - a wall-network component that is a pure, unbranched cycle (no true
    branch point) collapses to a single self-loop edge and is dropped with a
    flag rather than guessed at — rare in practice (would require a fully
    enclosed corridor with no side branches).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

import cv2
import networkx as nx
import numpy as np
from shapely import affinity
from shapely.geometry import LineString
from shapely.geometry import Point as ShapelyPoint
from shapely.ops import unary_union
from skimage.morphology import skeletonize

from extraction.synth.vendor.resplan_utils import geometry_to_mask, get_geometries

Point = tuple[float, float]


@dataclass
class WallSegment:
    start: Point
    end: Point
    thickness: float


@dataclass
class SkeletonJunction:
    point: Point
    segment_indices: list[int] = field(default_factory=list)


@dataclass
class SkeletonResult:
    segments: list[WallSegment]
    junctions: list[SkeletonJunction]
    flags: list[str] = field(default_factory=list)


_OFFSETS_8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def fill_openings_into_wall(wall_geom, *opening_geoms):
    """Restores wall continuity through door/window cutouts by unioning the
    wall polygon with every opening polygon (each opening's footprint
    already spans exactly the wall gap it was cut from — verified on real
    data). Pass ALL opening geometries (door, window, front_door, ...) that
    exist for this plan. Returns the union; pass the ORIGINAL wall_geom
    separately as extract_wall_skeleton's thickness_source_geom so
    thickness sampling isn't biased by opening-fill regions."""
    parts = [wall_geom] if (wall_geom is not None and not wall_geom.is_empty) else []
    for og in opening_geoms:
        parts.extend(get_geometries(og))
    if not parts:
        return wall_geom
    return unary_union(parts)


def _rasterize(geom, minx: float, miny: float, scale: float, pad: int = 4, output_shape: tuple[int, int] | None = None):
    matrix = [scale, 0, 0, scale, -minx * scale + pad, -miny * scale + pad]
    raster_geom = affinity.affine_transform(geom, matrix)
    if output_shape is not None:
        h, w = output_shape
    else:
        maxx, maxy = geom.bounds[2], geom.bounds[3]
        w = int(math.ceil((maxx - minx) * scale)) + 2 * pad
        h = int(math.ceil((maxy - miny) * scale)) + 2 * pad
    mask = geometry_to_mask(raster_geom, shape=(h, w), line_thickness=0)
    return mask


def _pixel_graph(skel: np.ndarray) -> nx.Graph:
    G = nx.Graph()
    ys, xs = np.nonzero(skel)
    pts = set(zip(ys.tolist(), xs.tolist()))
    G.add_nodes_from(pts)
    for (y, x) in pts:
        for dy, dx in _OFFSETS_8:
            n = (y + dy, x + dx)
            if n in pts and not G.has_edge((y, x), n):
                G.add_edge((y, x), n, weight=math.hypot(dy, dx))
    return G


def _prune_spurs(G: nx.Graph, min_len_px: float, max_passes: int = 5) -> None:
    """Remove degree-1 pendant paths shorter than min_len_px that terminate
    at a real branch point (degree>=3) — skeletonization artifacts near
    T/X junctions. Never eats an isolated short wall run down to nothing
    (those terminate at another degree-1 node, not a branch point)."""
    for _ in range(max_passes):
        leaves = [n for n in G.nodes if G.degree(n) == 1]
        if not leaves:
            return
        removed_any = False
        for leaf in leaves:
            if leaf not in G or G.degree(leaf) != 1:
                continue
            path = [leaf]
            prev, cur, length = None, leaf, 0.0
            while True:
                nbrs = [n for n in G.neighbors(cur) if n != prev]
                if len(nbrs) != 1:
                    break
                nxt = nbrs[0]
                length += G[cur][nxt]["weight"]
                path.append(nxt)
                prev, cur = cur, nxt
                if G.degree(cur) != 2:
                    break
            if length < min_len_px and G.degree(cur) >= 3:
                G.remove_nodes_from(path[:-1])
                removed_any = True
        if not removed_any:
            return


def _cluster_hubs(hubs: list[Point], merge_dist_px: float) -> dict[Point, int]:
    """Union-find clustering of hub pixels within merge_dist_px of each other
    (collapses skeletonization's tendency to produce a small blob of nearby
    branch pixels at real T/X junctions into one junction)."""
    parent = {h: h for h in hubs}

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for i, a in enumerate(hubs):
        for b in hubs[i + 1 :]:
            if math.hypot(a[0] - b[0], a[1] - b[1]) <= merge_dist_px:
                union(a, b)

    roots = {h: find(h) for h in hubs}
    root_to_id = {r: i for i, r in enumerate(sorted(set(roots.values())))}
    return {h: root_to_id[r] for h, r in roots.items()}


def _extract_raw_edges(G: nx.Graph, hubs: set[Point]):
    """Walk from each hub along degree-2 chains to the next hub; returns raw
    pixel paths (list of (hub_a, hub_b, [pixel...]))."""
    visited_directed: set[tuple] = set()
    edges = []
    for hub in hubs:
        for nbr in G.neighbors(hub):
            if (hub, nbr) in visited_directed:
                continue
            path = [hub, nbr]
            prev, cur = hub, nbr
            while cur not in hubs:
                nbrs = [n for n in G.neighbors(cur) if n != prev]
                if not nbrs:
                    break
                nxt = nbrs[0]
                path.append(nxt)
                prev, cur = cur, nxt
            for i in range(len(path) - 1):
                visited_directed.add((path[i], path[i + 1]))
                visited_directed.add((path[i + 1], path[i]))
            if cur in hubs:
                edges.append((hub, cur, path))
    return edges


def _sample_thickness(dist: np.ndarray, p0: Point, p1: Point, n: int = 5, edge_margin: float = 0.15) -> Optional[float]:
    x0, y0 = p0
    x1, y1 = p1
    h, w = dist.shape
    samples = []
    for i in range(n):
        t = edge_margin + (1 - 2 * edge_margin) * i / max(n - 1, 1)
        x = x0 + (x1 - x0) * t
        y = y0 + (y1 - y0) * t
        xi, yi = int(round(x)), int(round(y))
        if 0 <= yi < h and 0 <= xi < w and dist[yi, xi] > 0:
            samples.append(float(dist[yi, xi]))
    if not samples:
        return None
    samples.sort()
    return samples[len(samples) // 2]


def _measure_thickness_vector(
    seg: WallSegment,
    source_geom,
    exclude_radius: float,
    chord_half_len: float,
    n_samples: int = 7,
) -> Optional[float]:
    """Direct vector-geometry thickness measurement: cast perpendicular
    chords across the wall at points along its INTERIOR run (excluding
    exclude_radius from each end, so no sample falls near a junction where
    a side wall could widen the apparent cross-section), intersect each
    chord with the source wall polygon, thickness = median chord length.

    Replaces distance-transform raster sampling, which was found to be
    measurably biased on real data (traced a concrete case: estimated
    thickness implied a 2.5-unit centerline-to-face gap when the true gap
    was 0.74 units) — median area error against source room polygons was
    ~6.6%, well past a 5% gate. Direct measurement against the actual
    source vector geometry has no such raster/distance-transform bias.
    Returns None (caller falls back to the raster estimate) if the segment
    is too short to have any interior sampling zone, or no chord finds
    wall material.
    """
    x0, y0 = seg.start
    x1, y1 = seg.end
    dx, dy = x1 - x0, y1 - y0
    length = math.hypot(dx, dy)
    if length < 1e-9:
        return None
    ux, uy = dx / length, dy / length
    nx, ny = -uy, ux
    lo, hi = exclude_radius, length - exclude_radius
    if hi <= lo:
        return None

    samples = []
    for i in range(n_samples):
        t = lo + (hi - lo) * i / max(n_samples - 1, 1)
        px, py = x0 + ux * t, y0 + uy * t
        chord = LineString(
            [(px - nx * chord_half_len, py - ny * chord_half_len), (px + nx * chord_half_len, py + ny * chord_half_len)]
        )
        inter = chord.intersection(source_geom)
        if inter.is_empty:
            continue
        pieces = [inter] if inter.geom_type == "LineString" else get_geometries(inter)
        pieces = [pc for pc in pieces if pc.geom_type == "LineString" and pc.length > 0]
        if not pieces:
            continue
        ref = ShapelyPoint(px, py)
        best = min(pieces, key=lambda pc: ref.distance(pc))
        samples.append(best.length)

    if not samples:
        return None
    samples.sort()
    return samples[len(samples) // 2]


def extract_wall_skeleton(
    wall_geom,
    wall_depth: float,
    *,
    thickness_source_geom=None,
    min_scale: float = 4.0,
    target_thickness_px: float = 8.0,
    simplify_tol_factor: float = 0.15,
    spur_prune_factor: float = 0.6,
    junction_merge_factor: float = 1.0,
) -> SkeletonResult:
    """Decompose a unified wall polygon into WallSegments + SkeletonJunctions.

    wall_depth is the plan's nominal wall thickness (ResPlan's
    plan["wall_depth"]), used to size the raster scale and all the pixel
    tolerances (spur pruning, junction clustering, simplify tolerance) so
    they scale correctly across plans of different coordinate magnitudes.

    wall_geom should already have openings filled in (see
    fill_openings_into_wall) so the skeleton is topologically continuous
    through doors/windows. thickness_source_geom, if given, is rasterized
    separately in the same frame and used only for the distance-transform
    thickness sampling — pass the ORIGINAL (un-filled) wall geometry there
    so an opening's fill region doesn't get mistaken for real wall material
    when estimating thickness. Defaults to wall_geom if not given.
    """
    if wall_geom is None or wall_geom.is_empty:
        return SkeletonResult(segments=[], junctions=[], flags=["empty_wall_geometry"])

    minx, miny = wall_geom.bounds[0], wall_geom.bounds[1]
    scale = max(target_thickness_px / max(wall_depth, 1e-6), min_scale)

    mask = _rasterize(wall_geom, minx, miny, scale)
    kernel = np.ones((3, 3), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    skel = skeletonize(mask.astype(bool))

    thickness_mask = (
        _rasterize(thickness_source_geom, minx, miny, scale, output_shape=mask.shape)
        if thickness_source_geom is not None and not thickness_source_geom.is_empty
        else mask
    )
    dist = cv2.distanceTransform((thickness_mask > 0).astype(np.uint8), cv2.DIST_L2, 5)

    G = _pixel_graph(skel)
    if G.number_of_nodes() == 0:
        return SkeletonResult(segments=[], junctions=[], flags=["no_skeleton_pixels"])

    thickness_px_nominal = wall_depth * scale
    _prune_spurs(G, min_len_px=spur_prune_factor * thickness_px_nominal)

    segments: list[WallSegment] = []
    junctions: list[SkeletonJunction] = []
    flags: list[str] = []

    for component_nodes in nx.connected_components(G):
        comp = G.subgraph(component_nodes).copy()
        if comp.number_of_nodes() < 2:
            flags.append("dropped_degenerate_component")
            continue

        hubs = [n for n in comp.nodes if comp.degree(n) != 2]
        is_pure_cycle = not hubs
        if is_pure_cycle:
            hubs = [next(iter(comp.nodes))]  # pure cycle, break arbitrarily

        cluster_map = _cluster_hubs(hubs, merge_dist_px=junction_merge_factor * thickness_px_nominal)
        n_clusters = len(set(cluster_map.values()))
        cluster_pixels: list[list[Point]] = [[] for _ in range(n_clusters)]
        for h, cid in cluster_map.items():
            cluster_pixels[cid].append(h)
        cluster_centroid_px = [
            (sum(p[0] for p in pix) / len(pix), sum(p[1] for p in pix) / len(pix)) for pix in cluster_pixels
        ]

        local_base = len(junctions)
        for (py, px) in cluster_centroid_px:
            plan_pt = (px / scale + minx, py / scale + miny)
            junctions.append(SkeletonJunction(point=plan_pt))

        for hub_a, hub_b, path in _extract_raw_edges(comp, set(hubs)):
            cid_a, cid_b = cluster_map[hub_a], cluster_map[hub_b]
            if cid_a == cid_b:
                # Two cases collapse here: (a) harmless noise from a real
                # branch point spanning multiple pixels, where several raw
                # edges connect hub pixels that all merge into the same
                # final junction — expected, not worth flagging per
                # occurrence; (b) a genuine pure, unbranched wall cycle
                # (e.g. a fully enclosed corridor loop with no side
                # branches), which really does lose that ring's topology
                # and deserves exactly one flag per component.
                if is_pure_cycle:
                    flags.append("dropped_pure_cycle_component")
                continue

            line = LineString([(x, y) for (y, x) in path])  # (x,y) order for shapely
            tol = max(1.5, simplify_tol_factor * thickness_px_nominal)
            simplified = line.simplify(tol, preserve_topology=False)
            coords = list(simplified.coords)
            if len(coords) < 2:
                continue

            cy_a, cx_a = cluster_centroid_px[cid_a]
            cy_b, cx_b = cluster_centroid_px[cid_b]
            coords[0] = (cx_a, cy_a)
            coords[-1] = (cx_b, cy_b)

            junction_chain = [local_base + cid_a]
            for i in range(1, len(coords) - 1):
                x, y = coords[i]
                mid_plan = (x / scale + minx, y / scale + miny)
                junctions.append(SkeletonJunction(point=mid_plan))
                junction_chain.append(len(junctions) - 1)
            junction_chain.append(local_base + cid_b)

            for i in range(len(coords) - 1):
                x0, y0 = coords[i]
                x1, y1 = coords[i + 1]
                if math.hypot(x1 - x0, y1 - y0) < 1e-6:
                    continue
                sample = _sample_thickness(dist, (x0, y0), (x1, y1))
                thickness_plan = (2 * sample / scale) if sample is not None else wall_depth

                start_plan = (x0 / scale + minx, y0 / scale + miny)
                end_plan = (x1 / scale + minx, y1 / scale + miny)
                segments.append(WallSegment(start=start_plan, end=end_plan, thickness=thickness_plan))
                seg_idx = len(segments) - 1
                junctions[junction_chain[i]].segment_indices.append(seg_idx)
                junctions[junction_chain[i + 1]].segment_indices.append(seg_idx)

    orphans = sum(1 for j in junctions if not j.segment_indices)
    if orphans:
        # A hub cluster whose every raw edge collapsed into a same-cluster
        # self-loop (see the cid_a==cid_b branch above) never got attached
        # to a real segment — it's a dangling artifact of junction
        # clustering, not real topology. Drop it rather than emit a
        # degree-0 junction the schema validator would reject anyway.
        junctions = [j for j in junctions if j.segment_indices]
        flags.append(f"dropped_{orphans}_orphan_junction(s)")

    # Re-measure thickness directly against the source vector geometry
    # (see _measure_thickness_vector) — the raster distance-transform
    # estimate above is kept only as a fallback for segments too short to
    # have an interior sampling zone.
    vector_source = thickness_source_geom if (thickness_source_geom is not None and not thickness_source_geom.is_empty) else wall_geom
    exclude_radius = wall_depth  # one full nominal thickness from each end, per spec
    chord_half_len = max(wall_depth * 6, 20.0)
    n_vector_measured = 0
    for seg in segments:
        measured = _measure_thickness_vector(seg, vector_source, exclude_radius, chord_half_len)
        if measured is not None and measured > 0:
            seg.thickness = measured
            n_vector_measured += 1
    if segments and n_vector_measured < len(segments):
        flags.append(f"thickness_raster_fallback_{len(segments) - n_vector_measured}")

    return SkeletonResult(segments=segments, junctions=junctions, flags=flags)
