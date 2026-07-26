"""Rule-1 visual corroboration for diagnose_notch_area_fraction.py
(2026-07-26 session): the synthetic fixtures confirm the shoelace/grouping
math is correct on constructed geometry; this script confirms the same
code draws a sane pocket shape on REAL ResPlan rooms, by eye. Scans the
first `--scan` plans (default 500) for notch-affected required rooms,
picks up to 3 instances spanning distinct room types where available, and
draws each room's full ring with its computed notch-pocket polygon(s)
filled -- if the fill visibly traces the door/window's own footprint
rather than something unrelated, the area number backing it is trustworthy.

Reuses diagnose_notch_area_fraction.py's own private helpers UNCHANGED
(imported, not duplicated) so this is guaranteed to plot the exact same
pockets the sizing numbers are computed from, not a re-derived
approximation. No changes to that script, check_plan, rooms.py, or
skeleton.py. Output overlays are gitignored (extraction/synth/reports/),
regenerate via this script.
"""
from __future__ import annotations

import pickle
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

import matplotlib.patches as mpatches
import matplotlib.pyplot as plt
from shapely.geometry import LineString
from shapely.strtree import STRtree

from extraction.synth.qa.diagnose_notch_area_fraction import (
    PKL_PATH,
    _circular_span,
    _cluster_ring_indices,
    _nearest_wall_backed_cos,
    _opening_coverage_and_match,
    _signed_area,
)
from extraction.synth.qa.measure_clean_at_source import (
    COVERAGE_THRESHOLD,
    NOTCH_LENGTH_MULTIPLE,
    OPENING_COVERAGE_THRESHOLD,
    PERPENDICULARITY_COS_THRESHOLD,
    PROXIMITY_MULTIPLIER,
    TOLERANCE,
    _edge_covered,
    _wall_boundary_edges,
)
from extraction.synth.resplan_convert import CLEAN_REQUIRED_ROOM_TYPES
from extraction.synth.skeleton import fill_openings_into_wall
from extraction.synth.vendor.resplan_utils import get_geometries, normalize_keys

OUT_DIR = Path(__file__).resolve().parents[1] / "reports"


def find_pockets(raw_plan):
    """Re-derives the same per-room pocket spans diagnose_notch_area_fraction.py
    computes, but also returns the actual pocket vertex lists (dropped by
    that script's summary-only records) for plotting."""
    p = normalize_keys(dict(raw_plan))
    wall_geom = p.get("wall")
    if wall_geom is None or wall_geom.is_empty:
        return []
    wall_parts = get_geometries(wall_geom)
    if not wall_parts or any(part.geom_type != "Polygon" or not part.is_valid or part.area <= 0 for part in wall_parts):
        return []

    filled_wall_geom = fill_openings_into_wall(wall_geom, p.get("door"), p.get("window"), p.get("front_door"))
    wall_depth = float(p.get("wall_depth") or 4.0)
    ink_proximity = (TOLERANCE + wall_depth / 2) * PROXIMITY_MULTIPLIER
    wall_edges = _wall_boundary_edges(filled_wall_geom)
    tree = STRtree([LineString([wa, wb]) for wa, wb, _ in wall_edges]) if wall_edges else None
    if tree is None:
        return []

    opening_polys = [
        ((ot, idx), part)
        for ot in ("door", "window", "front_door")
        for idx, part in enumerate(get_geometries(p.get(ot)))
    ]

    results = []
    for rt in CLEAN_REQUIRED_ROOM_TYPES:
        g = p.get(rt)
        if g is None:
            continue
        for inst_idx, poly in enumerate(get_geometries(g)):
            if poly is None or poly.is_empty or poly.geom_type != "Polygon" or not poly.is_valid or poly.area <= 0:
                continue
            coords = list(poly.exterior.coords)
            verts = coords[:-1]
            n = len(verts)
            if n < 3:
                continue
            ring_edges = []
            backed_ratio = [None] * n
            for i in range(n):
                a, b = verts[i], verts[(i + 1) % n]
                dx, dy = b[0] - a[0], b[1] - a[1]
                edge_len = (dx * dx + dy * dy) ** 0.5
                ring_edges.append((a, b, edge_len))
                if edge_len < TOLERANCE:
                    continue
                backed_ratio[i] = _edge_covered(a, b, edge_len, wall_edges, tree, ink_proximity)

            notch_group_key = {}
            for i in range(n):
                ratio = backed_ratio[i]
                if ratio is None or ratio >= COVERAGE_THRESHOLD:
                    continue
                a, b, edge_len = ring_edges[i]
                dx, dy = b[0] - a[0], b[1] - a[1]
                ux, uy = (dx / edge_len, dy / edge_len) if edge_len else (0.0, 0.0)
                opening_cov, match_key = _opening_coverage_and_match(a, b, edge_len, dx, dy, opening_polys, wall_depth)
                cos_to_neighbor = _nearest_wall_backed_cos(i, ring_edges, backed_ratio, ux, uy)
                is_notch = (
                    opening_cov >= OPENING_COVERAGE_THRESHOLD
                    and cos_to_neighbor is not None
                    and cos_to_neighbor <= PERPENDICULARITY_COS_THRESHOLD
                    and edge_len <= NOTCH_LENGTH_MULTIPLE * wall_depth
                )
                if is_notch and match_key is not None:
                    notch_group_key[i] = match_key

            if not notch_group_key:
                continue
            groups = {}
            for i, key in notch_group_key.items():
                groups.setdefault(key, []).append(i)

            clustered_groups = []
            for edge_indices in groups.values():
                clustered_groups.extend(_cluster_ring_indices(edge_indices, n))

            parent_signed = _signed_area(verts)
            pockets = []
            for edge_indices in clustered_groups:
                start, end = _circular_span(edge_indices, n)
                num_edges = (end - start) % n + 1
                if num_edges >= n - 1:
                    continue
                vertex_idxs = [(start + k) % n for k in range(num_edges + 1)]
                pocket_pts = [verts[j] for j in vertex_idxs]
                pocket_signed = _signed_area(pocket_pts)
                if pocket_signed == 0.0 or (pocket_signed > 0) != (parent_signed > 0):
                    continue
                pockets.append((pocket_pts, abs(pocket_signed)))

            if pockets:
                results.append(dict(room_type=rt, inst_idx=inst_idx, poly=poly, pockets=pockets, verts=verts))
    return results


def plot_instance(raw_plan, entry, out_path):
    poly = entry["poly"]
    centroid = poly.centroid
    span = max(poly.bounds[2] - poly.bounds[0], poly.bounds[3] - poly.bounds[1])
    zoom = max(span * 0.9, 10.0)

    fig, ax = plt.subplots(figsize=(8, 8))
    verts = entry["verts"]
    xs = [v[0] for v in verts] + [verts[0][0]]
    ys = [v[1] for v in verts] + [verts[0][1]]
    ax.plot(xs, ys, color="#3182bd", linewidth=1.4, label="room ring")

    total = 0.0
    for pocket_pts, area in entry["pockets"]:
        pxs = [pt[0] for pt in pocket_pts] + [pocket_pts[0][0]]
        pys = [pt[1] for pt in pocket_pts] + [pocket_pts[0][1]]
        ax.fill(pxs, pys, color="red", alpha=0.45, edgecolor="darkred", linewidth=1.2)
        total += area

    for ot, color in (("door", "#e78ac3"), ("window", "#a6d854"), ("front_door", "#a63603")):
        p = normalize_keys(dict(raw_plan))
        g = p.get(ot)
        if g is None:
            continue
        for part in get_geometries(g):
            gxs, gys = part.exterior.xy
            ax.plot(gxs, gys, color=color, linestyle="--", linewidth=1.0)

    ax.set_xlim(centroid.x - zoom, centroid.x + zoom)
    ax.set_ylim(centroid.y - zoom, centroid.y + zoom)
    ax.set_aspect("equal")
    handles = [
        mpatches.Patch(color="red", alpha=0.45, label="computed notch pocket"),
        mpatches.Patch(facecolor="none", edgecolor="#e78ac3", label="door outline"),
    ]
    ax.legend(handles=handles, loc="upper right", fontsize=7)
    ax.set_title(
        f"plan={raw_plan.get('id')} room={entry['room_type']}_{entry['inst_idx']} "
        f"room_area={poly.area:.1f} notch_area={total:.2f} ({100 * total / poly.area:.2f}%)",
        fontsize=9,
    )
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)


def main(scan: int = 500, n_spotchecks: int = 3) -> None:
    OUT_DIR.mkdir(exist_ok=True)
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)[:scan]

    picked = []
    seen_types = set()
    for raw_plan in plans:
        for entry in find_pockets(raw_plan):
            if entry["room_type"] not in seen_types or len(picked) < n_spotchecks:
                picked.append((raw_plan, entry))
                seen_types.add(entry["room_type"])
            if len(picked) >= n_spotchecks:
                break
        if len(picked) >= n_spotchecks:
            break

    for raw_plan, entry in picked:
        out_path = OUT_DIR / f"notch_area_spotcheck_{raw_plan.get('id')}_{entry['room_type']}{entry['inst_idx']}.png"
        plot_instance(raw_plan, entry, out_path)
        print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
