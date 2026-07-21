"""Diagnosis-only, population-scale sizing (2026-07-21): of the plans
measure_clean_at_source.py still flags room_boundary_no_wall_match on
POST the 2026-07-21 clamp fix, what fraction of their broken edges match
the doorway-notch signature (a door/window/front_door polygon spans the
edge, `opening_coverage >= 0.8`) — the dominant mechanism found in this
session's 27-plan sample (63.1% of edges / 48.0% of rooms)? Answers "how
much would the ceiling move if doorway-notch suppression (deferred
converter-detection work) landed," without building new classification
machinery — reuses the exact `opening_coverage` projection technique from
`classify_room_boundary_no_wall_match.py::analyze_edge` verbatim, applied
only to the ~20% of plans that are still flagged (not a second full-17K
pass) to stay cheap. No changes to check_plan's own contract, rooms.py,
or skeleton.py.
"""
from __future__ import annotations

import pickle
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from shapely.geometry import LineString
from shapely.strtree import STRtree

from extraction.synth.qa.measure_clean_at_source import (
    COVERAGE_THRESHOLD,
    PROXIMITY_MULTIPLIER,
    TOLERANCE,
    _edge_covered,
    _wall_boundary_edges,
    check_plan,
)
from extraction.synth.resplan_convert import CLEAN_REQUIRED_ROOM_TYPES
from extraction.synth.skeleton import fill_openings_into_wall
from extraction.synth.vendor.resplan_utils import get_geometries, normalize_keys

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"
OPENING_COVERAGE_THRESHOLD = 0.8


def opening_coverage(a, b, edge_len, dx, dy, p, wall_depth) -> float:
    """Same projection technique as classify_room_boundary_no_wall_match.py's
    analyze_edge — how much of this edge is spanned by a door/window/
    front_door footprint, independent of the wall-union's own geometry."""
    edge_band = LineString([a, b]).buffer(TOLERANCE + wall_depth / 2)
    best = 0.0
    for ot in ("door", "window", "front_door"):
        g = p.get(ot)
        if g is None:
            continue
        for part in get_geometries(g):
            inter = part.intersection(edge_band)
            if inter.is_empty or inter.geom_type != "Polygon":
                continue
            pts = list(inter.exterior.coords)
            ts = [((px - a[0]) * dx + (py - a[1]) * dy) / (edge_len * edge_len) for px, py in pts]
            t0, t1 = max(min(ts), 0.0), min(max(ts), 1.0)
            if t1 > t0:
                best = max(best, t1 - t0)
    return best


def main():
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)

    n_flagged_plans = 0
    n_flagged_plans_all_notch = 0
    edge_hist = Counter()
    room_notch = 0
    room_total = 0

    t0 = time.time()
    for i, raw_plan in enumerate(plans):
        result = check_plan(raw_plan)
        if not any(f.startswith("room_boundary_no_wall_match:") for f in result["flags"]):
            continue
        n_flagged_plans += 1

        p = normalize_keys(dict(raw_plan))
        wall_geom = p.get("wall")
        wall_depth = float(p.get("wall_depth") or 4.0)
        filled = fill_openings_into_wall(wall_geom, p.get("door"), p.get("window"), p.get("front_door"))
        wall_edges = _wall_boundary_edges(filled)
        tree = STRtree([LineString([wa, wb]) for wa, wb, _ in wall_edges]) if wall_edges else None
        narrow_prox = (TOLERANCE + wall_depth / 2) * PROXIMITY_MULTIPLIER

        plan_all_notch = True
        for rt in CLEAN_REQUIRED_ROOM_TYPES:
            g = p.get(rt)
            if g is None:
                continue
            for inst_idx, poly in enumerate(get_geometries(g)):
                if poly is None or poly.is_empty or poly.geom_type != "Polygon":
                    continue
                coords = list(poly.exterior.coords)
                room_edges_checked = False
                room_all_notch = True
                for j in range(len(coords) - 1):
                    a, b = coords[j], coords[j + 1]
                    dx, dy = b[0] - a[0], b[1] - a[1]
                    edge_len = (dx * dx + dy * dy) ** 0.5
                    if edge_len < TOLERANCE:
                        continue
                    ratio = _edge_covered(a, b, edge_len, wall_edges, tree, narrow_prox) if tree else 0.0
                    if ratio >= COVERAGE_THRESHOLD:
                        continue
                    room_edges_checked = True
                    cov = opening_coverage(a, b, edge_len, dx, dy, p, wall_depth)
                    is_notch = cov >= OPENING_COVERAGE_THRESHOLD
                    edge_hist["notch" if is_notch else "other"] += 1
                    if not is_notch:
                        room_all_notch = False
                        plan_all_notch = False
                if room_edges_checked:
                    room_total += 1
                    if room_all_notch:
                        room_notch += 1
        if plan_all_notch:
            n_flagged_plans_all_notch += 1

        if n_flagged_plans % 500 == 0:
            elapsed = time.time() - t0
            print(f"  ...{i + 1}/{len(plans)} scanned, {n_flagged_plans} flagged so far ({elapsed:.0f}s)", file=sys.stderr)

    elapsed = time.time() - t0
    print(f"\nN_flagged_plans={n_flagged_plans} ({elapsed:.0f}s)")
    total_edges = sum(edge_hist.values()) or 1
    print(f"Edge-level: notch-signature={edge_hist['notch']} ({100 * edge_hist['notch'] / total_edges:.1f}%) of {total_edges} broken edges")
    print(f"Room-level: all-edges-notch={room_notch}/{room_total} ({100 * room_notch / room_total:.1f}%) of broken rooms")
    print(f"Plan-level: every broken edge is notch-signature={n_flagged_plans_all_notch}/{n_flagged_plans} "
          f"({100 * n_flagged_plans_all_notch / n_flagged_plans:.1f}%) — these plans would become clean_at_source "
          f"if notch suppression alone landed, with no other change")


if __name__ == "__main__":
    main()
