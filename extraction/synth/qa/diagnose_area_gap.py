"""Bounded diagnostic: where does the XOR area between source room polygon
and our reconstructed face polygon actually live? Corners, opening recesses,
a uniform strip, or irregular/unexplained."""
from __future__ import annotations

import pickle
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from shapely.geometry import LineString, Point as ShapelyPoint, Polygon
from shapely.strtree import STRtree

from extraction.synth.openings import project_openings
from extraction.synth.rooms import _band, _build_adjacency, _mitered_face_polygon, _repair_connectivity
from extraction.synth.skeleton import extract_wall_skeleton, fill_openings_into_wall
from extraction.synth.vendor.resplan_utils import get_geometries, normalize_keys

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"


def assemble_one_room_cycle(segments, poly, tolerance=2.0, coverage_threshold=0.5):
    bands = [_band(s, tolerance) for s in segments]
    tree = STRtree(bands)
    coords = list(poly.exterior.coords)
    wall_seq, broken = [], False
    for i in range(len(coords) - 1):
        a, b = coords[i], coords[i + 1]
        dx, dy = b[0] - a[0], b[1] - a[1]
        edge_len = (dx * dx + dy * dy) ** 0.5
        if edge_len < tolerance:
            continue
        edge_line = LineString([a, b])
        cands = tree.query(edge_line.buffer(tolerance))
        overlaps = []
        for c in cands:
            idx = int(c)
            seg = segments[idx]
            sx, sy = seg.end[0] - seg.start[0], seg.end[1] - seg.start[1]
            seg_len = (sx * sx + sy * sy) ** 0.5
            if seg_len < 1e-9:
                continue
            cos_a = abs((dx * sx + dy * sy) / (edge_len * seg_len))
            if cos_a < 0.9:
                continue
            inter = edge_line.intersection(bands[idx])
            if inter.length < min(tolerance, edge_len * 0.03):
                continue
            pts = list(inter.coords) if inter.geom_type == "LineString" else [
                c2 for g in getattr(inter, "geoms", []) for c2 in g.coords
            ]
            if not pts:
                continue
            ts = [((px - a[0]) * dx + (py - a[1]) * dy) / (edge_len * edge_len) for px, py in pts]
            overlaps.append((min(ts), max(ts), idx))
        overlaps.sort()
        covered = sum(min(t1, 1.0) - max(t0, 0.0) for t0, t1, _ in overlaps if t1 > t0) * edge_len
        ids = [x[2] for x in overlaps]
        dd = [w for j, w in enumerate(ids) if j == 0 or w != ids[j - 1]]
        if not dd or covered / edge_len < coverage_threshold:
            broken = True
            continue
        for idx in dd:
            if not wall_seq or wall_seq[-1] != idx:
                wall_seq.append(idx)
    if len(wall_seq) >= 2 and wall_seq[0] == wall_seq[-1]:
        wall_seq = wall_seq[:-1]
    if broken or len(set(wall_seq)) < 3:
        return None
    return wall_seq


def classify_xor(source_poly, face_poly, wall_cycle, segments, opening_positions):
    xor = source_poly.symmetric_difference(face_poly)
    pieces = get_geometries(xor) if xor.geom_type != "Polygon" else [xor]
    pieces = [p for p in pieces if p.geom_type == "Polygon" and p.area > 1e-6]

    # junction points for this cycle
    junction_pts = []
    n = len(wall_cycle)
    for i in range(n):
        a, b = segments[wall_cycle[i]], segments[wall_cycle[(i + 1) % n]]
        for pa in (a.start, a.end):
            for pb in (b.start, b.end):
                if ShapelyPoint(pa).distance(ShapelyPoint(pb)) < 0.5:
                    junction_pts.append(pa)

    results = []
    for piece in pieces:
        c = piece.centroid
        near_junction = any(c.distance(ShapelyPoint(jp)) < 3 * (piece.length or 1) ** 0.5 + 10 for jp in junction_pts)
        # simpler robust junction test: is centroid within ~2x mean thickness of any junction point?
        mean_t = sum(segments[w].thickness for w in set(wall_cycle)) / len(set(wall_cycle))
        near_junction = any(c.distance(ShapelyPoint(jp)) < 2.5 * mean_t for jp in junction_pts)
        near_opening = any(c.distance(ShapelyPoint(op)) < 2.5 * mean_t for op in opening_positions)
        bounds = piece.bounds
        elongation = max(bounds[2] - bounds[0], bounds[3] - bounds[1]) / max(min(bounds[2] - bounds[0], bounds[3] - bounds[1]), 1e-6)
        results.append(
            dict(area=piece.area, centroid=(round(c.x, 1), round(c.y, 1)), near_junction=near_junction,
                 near_opening=near_opening, elongation=round(elongation, 1), bounds=[round(b, 1) for b in bounds])
        )
    return results


def analyze_plan(plan_idx, plans, room_type_filter=None, min_openings=0):
    p = normalize_keys(plans[plan_idx])
    wall_depth = float(p.get("wall_depth") or 4.0)
    filled = fill_openings_into_wall(p["wall"], p.get("door"), p.get("window"), p.get("front_door"))
    skel = extract_wall_skeleton(filled, wall_depth, thickness_source_geom=p["wall"])
    segments = skel.segments
    adjacency = _build_adjacency(segments, 0.1)

    projections, _ = project_openings(segments, p.get("door"), p.get("window"), front_door_geom=p.get("front_door"))
    opening_positions = []
    for proj in projections:
        seg = segments[proj.wall_index]
        dx, dy = seg.end[0] - seg.start[0], seg.end[1] - seg.start[1]
        length = (dx * dx + dy * dy) ** 0.5
        if length < 1e-9:
            continue
        t = proj.center_offset / length
        opening_positions.append((seg.start[0] + dx * t, seg.start[1] + dy * t))

    room_types = [room_type_filter] if room_type_filter else ["bedroom", "bathroom", "storage", "stair", "kitchen", "living"]
    for rt in room_types:
        g = p.get(rt)
        if g is None:
            continue
        for inst_idx, poly in enumerate(get_geometries(g)):
            if poly.geom_type != "Polygon" or poly.is_empty:
                continue
            wall_seq = assemble_one_room_cycle(segments, poly)
            if wall_seq is None:
                continue
            repaired = _repair_connectivity(wall_seq, adjacency, 3)
            if repaired is None:
                continue
            n_openings_on_cycle = sum(
                1 for wid in set(repaired) for op in opening_positions
                if ShapelyPoint(op).distance(LineString([segments[wid].start, segments[wid].end])) < segments[wid].thickness
            )
            if n_openings_on_cycle < min_openings:
                continue
            face = _mitered_face_polygon(repaired, segments, (poly.centroid.x, poly.centroid.y))
            if face is None or face.area <= 0:
                continue
            err = abs(face.area - poly.area) / max(poly.area, 1e-9)
            print(f"\n=== plan {p.get('id')} {rt}_{inst_idx}: wall_cycle={repaired} n_openings_on_cycle={n_openings_on_cycle} ===")
            print(f"source_area={poly.area:.1f} face_area={face.area:.1f} err={err*100:.1f}%")
            xor_pieces = classify_xor(poly, face, repaired, segments, opening_positions)
            total_xor = sum(pc["area"] for pc in xor_pieces)
            print(f"total XOR area={total_xor:.1f} ({len(xor_pieces)} piece(s)):")
            for pc in xor_pieces:
                tag = []
                if pc["near_junction"]:
                    tag.append("CORNER")
                if pc["near_opening"]:
                    tag.append("OPENING")
                if not tag:
                    tag.append("UNIFORM_STRIP" if pc["elongation"] > 3 else "UNEXPLAINED")
                print(f"  area={pc['area']:.1f} centroid={pc['centroid']} elongation={pc['elongation']} bounds={pc['bounds']} -> {'+'.join(tag)}")
            return True
    return False


if __name__ == "__main__":
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)

    print("### Case 1: simple rectangular room (bathroom, plan index 0) ###")
    analyze_plan(0, plans, room_type_filter="bathroom", min_openings=0)

    print("\n\n### Case 2: room with >=2 openings on its cycle ###")
    found = False
    for i in range(len(plans)):
        if analyze_plan(i, plans, min_openings=2):
            found = True
            break
    if not found:
        print("No room with >=2 openings found in scanned range.")
