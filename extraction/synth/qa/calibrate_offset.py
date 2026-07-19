"""Direct per-wall calibration: for each wall in a successfully-cycled room,
cast perpendiculars from the centerline and measure the distance to the
SOURCE ROOM POLYGON's own boundary (not the wall polygon) — hundreds of
independent offset measurements, spanning wall_depth diversity and both
interior/exterior walls, to fit the true centerline-to-room-face offset
convention (fixed constant vs multiplier-on-half-thickness)."""
from __future__ import annotations

import pickle
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from shapely.geometry import LineString, Point as ShapelyPoint

from extraction.synth.qa.diagnose_area_gap import assemble_one_room_cycle
from extraction.synth.rooms import ROOM_LABEL_MAP, _build_adjacency, _repair_connectivity
from extraction.synth.skeleton import extract_wall_skeleton, fill_openings_into_wall
from extraction.synth.vendor.resplan_utils import get_geometries, normalize_keys

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"


def measure_wall_offsets(seg, room_poly, centroid, exclude_radius, cast_len, n_samples=5):
    x0, y0 = seg.start
    x1, y1 = seg.end
    dx, dy = x1 - x0, y1 - y0
    length = (dx * dx + dy * dy) ** 0.5
    if length < 1e-9:
        return []
    ux, uy = dx / length, dy / length
    nx, ny = -uy, ux
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    tvx, tvy = centroid[0] - mx, centroid[1] - my
    if nx * tvx + ny * tvy < 0:
        nx, ny = -nx, -ny
    lo, hi = exclude_radius, length - exclude_radius
    if hi <= lo:
        return []

    offsets = []
    for i in range(n_samples):
        t = lo + (hi - lo) * i / max(n_samples - 1, 1)
        px, py = x0 + ux * t, y0 + uy * t
        ray = LineString([(px, py), (px + nx * cast_len, py + ny * cast_len)])
        inter = ray.intersection(room_poly.boundary)
        if inter.is_empty:
            continue
        cand_pts = []
        if inter.geom_type == "Point":
            cand_pts.append(inter)
        else:
            for g in get_geometries(inter):
                if g.geom_type == "Point":
                    cand_pts.append(g)
                elif hasattr(g, "coords"):
                    cand_pts.extend(ShapelyPoint(c) for c in g.coords)
        if not cand_pts:
            continue
        origin = ShapelyPoint(px, py)
        nearest = min(cand_pts, key=lambda pt: origin.distance(pt))
        d = origin.distance(nearest)
        if d < cast_len * 0.95:  # drop rays that basically missed (hit at the far cap)
            offsets.append(d)
    return offsets


def main(n_plans: int = 800):
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)

    rows = []  # (offset, thickness, wall_depth)
    for p in plans[:n_plans]:
        p = normalize_keys(p)
        wall_depth = float(p.get("wall_depth") or 4.0)
        filled = fill_openings_into_wall(p["wall"], p.get("door"), p.get("window"), p.get("front_door"))
        skel = extract_wall_skeleton(filled, wall_depth, thickness_source_geom=p["wall"])
        segments = skel.segments
        if not segments:
            continue
        adjacency = _build_adjacency(segments, 0.1)

        for rt in ROOM_LABEL_MAP:
            g = p.get(rt)
            if g is None:
                continue
            for poly in get_geometries(g):
                if poly.geom_type != "Polygon" or poly.is_empty:
                    continue
                wall_seq = assemble_one_room_cycle(segments, poly)
                if wall_seq is None:
                    continue
                repaired = _repair_connectivity(wall_seq, adjacency, 3)
                if repaired is None:
                    continue
                cast_len = max(wall_depth * 4, 15.0)
                exclude_radius = wall_depth
                for wid in set(repaired):
                    seg = segments[wid]
                    offs = measure_wall_offsets(
                        seg, poly, (poly.centroid.x, poly.centroid.y), exclude_radius, cast_len
                    )
                    for d in offs:
                        rows.append((d, seg.thickness, wall_depth))

    print(f"n measurements: {len(rows)}")
    if not rows:
        return

    offsets = [r[0] for r in rows]
    half_thick_ratios = [r[0] / (r[1] / 2) for r in rows if r[1] > 0]

    offsets.sort()
    half_thick_ratios.sort()

    def pct(vals, p):
        return vals[min(int(len(vals) * p), len(vals) - 1)]

    print("\n--- Model A: fixed offset constant (units) ---")
    print(f"  mean={statistics.mean(offsets):.4f}  median={statistics.median(offsets):.4f}  stdev={statistics.pstdev(offsets):.4f}")
    print(f"  p10={pct(offsets,0.10):.4f}  p50={pct(offsets,0.50):.4f}  p90={pct(offsets,0.90):.4f}")

    print("\n--- Model B: multiplier k on half-thickness (offset = k * thickness/2) ---")
    print(f"  mean_k={statistics.mean(half_thick_ratios):.4f}  median_k={statistics.median(half_thick_ratios):.4f}  stdev_k={statistics.pstdev(half_thick_ratios):.4f}")
    print(f"  p10={pct(half_thick_ratios,0.10):.4f}  p50={pct(half_thick_ratios,0.50):.4f}  p90={pct(half_thick_ratios,0.90):.4f}")

    # residuals for each model, normalized by comparing predicted vs actual offset
    k = statistics.median(half_thick_ratios)
    c = statistics.median(offsets)
    resid_a = [abs(d - c) for d, t, wd in rows]
    resid_b = [abs(d - k * (t / 2)) for d, t, wd in rows]
    print(f"\nResidual sigma, Model A (fixed c={c:.4f}): {statistics.pstdev(resid_a):.4f}")
    print(f"Residual sigma, Model B (k={k:.4f} * half-thickness): {statistics.pstdev(resid_b):.4f}")

    # correlation check: does offset scale with thickness (supports B) or stay flat (supports A)?
    thick_bins: dict[float, list[float]] = {}
    for d, t, wd in rows:
        key = round(t, 1)
        thick_bins.setdefault(key, []).append(d)
    print("\nOffset by thickness bin (supports B if offset scales up with thickness; supports A if flat):")
    for tb in sorted(thick_bins)[:15]:
        vals = thick_bins[tb]
        print(f"  thickness~{tb}: n={len(vals)} mean_offset={statistics.mean(vals):.3f}")


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 800
    main(n)
