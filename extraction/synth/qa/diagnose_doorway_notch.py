"""Diagnosis-only, step 1 of the doorway-notch converter work (2026-07-22):
positively confirm the e_opening_doorway_notch mechanism on 4-6 fresh
instances beyond the 3 already-classified exemplars (plans 9206/7607/3807,
all bathroom), characterize how uniform the signature is, and spec (not
build) the discriminator the eventual check_plan suppression rule would
use.

Reuses classify_room_boundary_no_wall_match.py's find_sample/analyze_plan/
classify UNCHANGED (imported, not duplicated) to reproduce the exact same
27-plan sample and classification decisions from the prior session — this
script adds no new classification logic, only:

  1. A room-level enumerator that surfaces every e_opening_doorway_notch
     instance in the sample (the prior session's script only ever printed
     4 hand-picked EXEMPLARS; the rest of the ~12 room-level e-instances
     were never individually listed).
  2. A discriminator report per notch edge: perpendicularity to the
     nearest wall-backed neighbor edge in the same ring, distance from the
     edge's own endpoints to the associated opening polygon's bounding
     box, edge length vs. wall_depth, and opening_coverage (already
     computed by the imported analyze_edge).
  3. A richer overlay than plot_instance's single-edge view: draws the
     FULL room ring with every edge colored by its own status (wall-backed
     / notch / other-broken), the associated door/window polygon, and its
     bounding box, so the notch shape is visible as a whole, not just the
     one flagged edge in isolation.

No changes to rooms.py, skeleton.py, check_plan, or any existing
measurement script. Output overlays are gitignored
(extraction/synth/reports/).
"""
from __future__ import annotations

import pickle
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from shapely.geometry import LineString, Point, box

from extraction.synth.qa.classify_room_boundary_no_wall_match import (
    ALL_TRACED_ROOM_TYPES,
    PKL_PATH,
    SCAN_LIMIT,
    TARGET_N,
    _inner_union,
    analyze_edge,
    analyze_plan,
    classify,
    find_sample,
)
from extraction.synth.qa.measure_clean_at_source import (
    COVERAGE_THRESHOLD,
    PROXIMITY_MULTIPLIER,
    TOLERANCE,
    _wall_boundary_edges,
)
from extraction.synth.resplan_convert import CLEAN_REQUIRED_ROOM_TYPES
from extraction.synth.skeleton import fill_openings_into_wall
from extraction.synth.vendor.resplan_utils import get_geometries, normalize_keys

REPORTS_DIR = Path(__file__).resolve().parents[1] / "reports"


def _ring_edges(poly):
    coords = list(poly.exterior.coords)
    return [(coords[i], coords[i + 1], i) for i in range(len(coords) - 1)]


def _edge_dir(a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = (dx * dx + dy * dy) ** 0.5
    return (dx / L, dy / L) if L else (0.0, 0.0)


def enumerate_room_instances(plans, target_n=TARGET_N, scan_limit=SCAN_LIMIT):
    """Reproduce the prior session's exact 27-plan sample and classify
    every genuinely-broken edge, but this time keep ALL room-level detail
    (not just the printed histograms) so we can select real instances for
    fresh overlays instead of relying on the 4 hand-picked EXEMPLARS."""
    sample = find_sample(plans, target_n, scan_limit)
    room_records = {}  # (resplan_id, room) -> dict(edges=[...])
    for raw_plan in sample:
        edges = analyze_plan(raw_plan)
        for e in edges:
            if e["ink_ratio_narrow"] >= COVERAGE_THRESHOLD:
                continue  # arithmetic-bug false positive, not genuinely broken
            e["category"] = classify(e)
            key = (e["resplan_id"], e["room"])
            room_records.setdefault(key, dict(edges=[], raw_plan=raw_plan))
            room_records[key]["edges"].append(e)
    return room_records


def discriminator_signals(raw_plan, room_type, inst_idx, edge_index):
    """Compute the candidate discriminator signals for ONE flagged edge:
    perpendicularity to the nearest wall-backed neighbor in the same ring,
    endpoint distance to the associated opening's bounding box, edge
    length vs wall_depth. Independent of analyze_edge's opening_coverage
    (recomputed here just for the perpendicularity/endpoint pieces)."""
    p = normalize_keys(dict(raw_plan))
    wall_geom = p.get("wall")
    wall_depth = float(p.get("wall_depth") or 4.0)
    filled = fill_openings_into_wall(wall_geom, p.get("door"), p.get("window"), p.get("front_door"))
    wall_edges = _wall_boundary_edges(filled)
    poly = get_geometries(p.get(room_type))[inst_idx]
    ring = _ring_edges(poly)
    n = len(ring)
    a, b, _ = ring[edge_index]
    dx_e, dy_e = _edge_dir(a, b)
    edge_len = ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5

    narrow_prox = (TOLERANCE + wall_depth / 2) * PROXIMITY_MULTIPLIER

    def edge_is_wall_backed(idx):
        aa, bb, _ = ring[idx % n]
        ln = ((bb[0] - aa[0]) ** 2 + (bb[1] - aa[1]) ** 2) ** 0.5
        if ln < TOLERANCE:
            return False, 0.0
        from extraction.synth.qa.measure_clean_at_source import _edge_covered
        from shapely.strtree import STRtree
        tree = STRtree([LineString([wa, wb]) for wa, wb, _ in wall_edges]) if wall_edges else None
        if tree is None:
            return False, 0.0
        ratio = _edge_covered(aa, bb, ln, wall_edges, tree, narrow_prox)
        return ratio >= COVERAGE_THRESHOLD, ratio

    # nearest wall-backed neighbor, searching outward from this edge in the ring
    neighbor_dir = None
    neighbor_offset = None
    for offset in range(1, n):
        for sign in (-1, 1):
            cand = (edge_index + sign * offset) % n
            backed, ratio = edge_is_wall_backed(cand)
            if backed:
                aa, bb, _ = ring[cand]
                neighbor_dir = _edge_dir(aa, bb)
                neighbor_offset = sign * offset
                break
        if neighbor_dir is not None:
            break

    cos_to_neighbor = None
    if neighbor_dir is not None:
        cos_to_neighbor = abs(dx_e * neighbor_dir[0] + dy_e * neighbor_dir[1])

    # distance from edge endpoints to nearest opening bounding box
    best_opening = None
    best_bbox_dist = None
    for ot in ("door", "window", "front_door"):
        g = p.get(ot)
        if g is None:
            continue
        for part in get_geometries(g):
            bbox = box(*part.bounds)
            d = max(Point(a).distance(bbox), Point(b).distance(bbox))
            if best_bbox_dist is None or d < best_bbox_dist:
                best_bbox_dist = d
                best_opening = ot

    return dict(
        edge_len=round(edge_len, 2),
        wall_depth=round(wall_depth, 2),
        len_over_wall_depth=round(edge_len / wall_depth, 2) if wall_depth else None,
        cos_to_nearest_wall_backed_neighbor=round(cos_to_neighbor, 3) if cos_to_neighbor is not None else None,
        neighbor_ring_offset=neighbor_offset,
        nearest_opening_type=best_opening,
        endpoint_to_opening_bbox_dist=round(best_bbox_dist, 3) if best_bbox_dist is not None else None,
    )


def plot_room_notch_overlay(raw_plan, room_type, inst_idx, edges, out_path):
    """Full-room overlay: every ring edge colored by status, the room's
    OWN broken edges highlighted (notch=red, other-broken=orange), the
    door/window/front_door polygons filled, and their bounding boxes
    outlined, so the notch shape reads as a whole rather than one
    isolated edge."""
    p = normalize_keys(dict(raw_plan))
    wall_geom = p.get("wall")
    wall_depth = float(p.get("wall_depth") or 4.0)
    filled = fill_openings_into_wall(wall_geom, p.get("door"), p.get("window"), p.get("front_door"))
    poly = get_geometries(p.get(room_type))[inst_idx]
    ring = _ring_edges(poly)

    cat_by_idx = {e["edge_index"]: e["category"] for e in edges}
    centroid = poly.centroid
    span = max(poly.bounds[2] - poly.bounds[0], poly.bounds[3] - poly.bounds[1])
    zoom = max(span * 0.9, 10.0)

    fig, ax = plt.subplots(figsize=(9, 9))
    for part in get_geometries(filled):
        xs, ys = part.exterior.xy
        ax.fill(xs, ys, color="#ffd92f", alpha=0.3, edgecolor="#b8960a", linewidth=0.5)
    inner_u = _inner_union(p)
    if inner_u is not None:
        for part in get_geometries(inner_u):
            xs, ys = part.exterior.xy
            ax.plot(xs, ys, color="black", linewidth=1.0, linestyle=":", alpha=0.6)
    for rt in ALL_TRACED_ROOM_TYPES:
        g = p.get(rt)
        if g is None:
            continue
        for idx, rp in enumerate(get_geometries(g)):
            if rp.geom_type != "Polygon" or (rt == room_type and idx == inst_idx):
                continue
            rxs, rys = rp.exterior.xy
            ax.plot(rxs, rys, color="gray", linewidth=0.6, alpha=0.5)

    color_map = {
        "e_opening_doorway_notch": "red",
        None: "#3182bd",  # wall-backed, not in the broken-edge set
    }
    for a, b, idx in ring:
        cat = cat_by_idx.get(idx)
        color = color_map.get(cat, "darkorange")  # any other broken category
        lw = 3.2 if cat is not None else 1.4
        ax.plot([a[0], b[0]], [a[1], b[1]], color=color, linewidth=lw, alpha=0.95)

    for ot, color in (("door", "#e78ac3"), ("window", "#a6d854"), ("front_door", "#a63603")):
        g = p.get(ot)
        if g is None:
            continue
        for part in get_geometries(g):
            xs, ys = part.exterior.xy
            ax.fill(xs, ys, color=color, alpha=0.55, edgecolor=color, linewidth=0.8)
            bx0, by0, bx1, by1 = part.bounds
            ax.add_patch(mpatches.Rectangle((bx0, by0), bx1 - bx0, by1 - by0,
                                             fill=False, edgecolor=color, linestyle="--", linewidth=1.0))

    ax.set_xlim(centroid.x - zoom, centroid.x + zoom)
    ax.set_ylim(centroid.y - zoom, centroid.y + zoom)
    ax.set_aspect("equal")
    handles = [
        mpatches.Patch(color="red", label="notch edge (e_opening_doorway_notch)"),
        mpatches.Patch(color="darkorange", label="other broken category"),
        mpatches.Patch(color="#3182bd", label="wall-backed edge"),
        mpatches.Patch(color="#e78ac3", label="door"),
        mpatches.Patch(color="#a6d854", label="window"),
    ]
    ax.legend(handles=handles, loc="upper right", fontsize=7)
    ax.set_title(f"plan={raw_plan.get('id')} room={room_type}_{inst_idx} (wall_depth={wall_depth:.2f})", fontsize=9)
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)


def main():
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)

    room_records = enumerate_room_instances(plans)

    e_rooms = []
    for (pid, room), rec in room_records.items():
        cats = {e["category"] for e in rec["edges"]}
        if "e_opening_doorway_notch" in cats:
            e_rooms.append((pid, room, rec, cats))

    print(f"Sample: {len(room_records)} broken room instances across the 27-plan sample")
    print(f"Rooms with >=1 e_opening_doorway_notch edge: {len(e_rooms)}")
    pure = [r for r in e_rooms if r[3] == {"e_opening_doorway_notch"}]
    print(f"  of which ALL genuinely-broken edges are notch (pure): {len(pure)}")
    mixed = [r for r in e_rooms if r[3] != {"e_opening_doorway_notch"}]
    for pid, room, rec, cats in mixed:
        print(f"  MIXED: plan={pid} room={room} categories={cats}")

    print(f"\n{'=' * 70}\nAll e_opening_doorway_notch room instances in sample:")
    for pid, room, rec, cats in sorted(e_rooms):
        room_type, inst_idx = room.rsplit("_", 1)
        notch_edges = [e for e in rec["edges"] if e["category"] == "e_opening_doorway_notch"]
        for e in notch_edges:
            sig = discriminator_signals(rec["raw_plan"], room_type, int(inst_idx), e["edge_index"])
            print(f"  plan={pid} room={room} edge={e['edge_index']} len={e['edge_len']} "
                  f"opening_hit={e['opening_hit']} opening_cov={e['opening_coverage']} "
                  f"cos_to_neighbor={sig['cos_to_nearest_wall_backed_neighbor']} "
                  f"neighbor_offset={sig['neighbor_ring_offset']} "
                  f"len/wall_depth={sig['len_over_wall_depth']} "
                  f"endpoint_to_opening_bbox_dist={sig['endpoint_to_opening_bbox_dist']}")

    # Pick up to 6 instances for fresh overlays, preferring diversity of
    # room_type and preferring pure rooms (cleaner signal), but including
    # any mixed ones found since those matter for the false-positive read.
    chosen = []
    seen_room_types = set()
    for pid, room, rec, cats in sorted(pure, key=lambda r: r[1].rsplit("_", 1)[0]):
        rt = room.rsplit("_", 1)[0]
        if rt not in seen_room_types or len(chosen) < 4:
            chosen.append((pid, room, rec))
            seen_room_types.add(rt)
        if len(chosen) >= 6:
            break
    for pid, room, rec, cats in mixed:
        if len(chosen) >= 6:
            break
        if (pid, room, rec) not in chosen:
            chosen.append((pid, room, rec))

    print(f"\n{'=' * 70}\nGenerating overlays for {len(chosen)} chosen instances:")
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    for pid, room, rec in chosen:
        room_type, inst_idx = room.rsplit("_", 1)
        out_path = REPORTS_DIR / f"notch_diag_{pid}_{room}.png"
        plot_room_notch_overlay(rec["raw_plan"], room_type, int(inst_idx), rec["edges"], out_path)
        print(f"  wrote {out_path}")


if __name__ == "__main__":
    main()
