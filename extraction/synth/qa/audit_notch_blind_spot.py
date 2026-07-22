"""READ-ONLY audit (2026-07-22): exhaustive risk surface for the
notch-suppression flip diagnosed in reports/p3a-notch-diagnosis.md.

Enumerates EVERY edge classify() puts in 'a_genuine_gt_defect_between_rooms'
with opening_coverage >= 0.65 (the only band suppression can ever touch,
since check_plan's own predicate requires opening_cov >= 0.65 as one of its
three conjuncts). For each: door-witness presence, perpendicularity to the
nearest wall-backed ring neighbor, jamb-length-vs-wall-depth ratio, the
sampled residual-gap profile beyond the door span, whether check_plan's
current suppression rule actually suppresses it, and a rendered overlay for
human visual verdict (doorway notch vs genuine inter-room gap).

Does NOT modify check_plan, classify(), or any constant. Reuses
check_plan/_nearest_wall_backed_cos/_opening_coverage (measure_clean_at_source.py)
and _gap_profile (diagnose_notch_false_suppression.py) verbatim, read-only,
to compute audit signals -- this is the AUDIT script, not the classify()
fix (that's a separate, later, hand-written change per Dan's explicit
'keep it a separate implementation, don't import/alias' instruction for
STEP 4 only).
"""
from __future__ import annotations

import pickle
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from shapely.geometry import LineString
from shapely.strtree import STRtree

from extraction.synth.qa.measure_clean_at_source import (
    OPENING_COVERAGE_THRESHOLD,
    PROXIMITY_MULTIPLIER,
    TOLERANCE,
    _edge_covered,
    _nearest_wall_backed_cos,
    _wall_boundary_edges,
    check_plan,
)
from extraction.synth.qa.classify_room_boundary_no_wall_match import (
    analyze_plan,
    classify,
    plot_instance,
)
from extraction.synth.qa.diagnose_notch_false_suppression import _gap_profile
from extraction.synth.skeleton import fill_openings_into_wall
from extraction.synth.vendor.resplan_utils import get_geometries, normalize_keys

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"
REPORTS_DIR = Path(__file__).resolve().parents[1] / "reports"
DEFECT_CATEGORY = "a_genuine_gt_defect_between_rooms"


def main():
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)
    by_id = {pl.get("id"): pl for pl in plans}

    risk_edges = []  # (raw_plan, e) for every a-classed edge with opening_coverage>=0.65
    for raw_plan in plans:
        old_edges = analyze_plan(raw_plan)
        if not old_edges:
            continue
        for e in old_edges:
            if classify(e) == DEFECT_CATEGORY and e["opening_coverage"] >= 0.65:
                risk_edges.append((raw_plan, e))

    print(f"Exhaustive scan: {len(risk_edges)} edges classed '{DEFECT_CATEGORY}' with "
          f"opening_coverage >= 0.65 across the full {len(plans)}-plan population.")
    if len(risk_edges) != 8:
        print(f"*** COUNT MISMATCH vs prior diagnosis's 8 -- STOP, report this discrepancy "
              f"before proceeding. ***")

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    rows = []
    for idx, (raw_plan, e) in enumerate(risk_edges):
        p = normalize_keys(dict(raw_plan))
        rt, inst_idx = e["room"].rsplit("_", 1)
        inst_idx = int(inst_idx)
        i = e["edge_index"]
        poly = get_geometries(p.get(rt))[inst_idx]
        coords = list(poly.exterior.coords)
        a, b = coords[i], coords[i + 1]
        edge_len = e["edge_len"]
        dx, dy = b[0] - a[0], b[1] - a[1]
        wall_depth = float(p.get("wall_depth") or 4.0)

        # door/window/front_door witness (band intersection, same band as _opening_coverage).
        band = LineString([a, b]).buffer(TOLERANCE + wall_depth / 2)
        witness_type = None
        for ot in ("door", "window", "front_door"):
            g = p.get(ot)
            if g is None:
                continue
            for part in get_geometries(g):
                if part.intersects(band):
                    witness_type = ot
        has_witness = witness_type is not None

        # perpendicularity to nearest wall-backed ring neighbor (check_plan's own
        # helper, read-only reuse for AUDIT signal computation -- not the classify()
        # fix itself).
        wall_geom = p.get("wall")
        filled_wall_geom = fill_openings_into_wall(wall_geom, p.get("door"), p.get("window"), p.get("front_door"))
        wall_edges = _wall_boundary_edges(filled_wall_geom)
        tree = STRtree([LineString([wa, wb]) for wa, wb, _ in wall_edges]) if wall_edges else None
        ink_proximity = (TOLERANCE + wall_depth / 2) * PROXIMITY_MULTIPLIER
        n = len(coords) - 1
        ring_edges = []
        backed_ratio = [None] * n
        for j in range(n):
            aj, bj = coords[j], coords[j + 1]
            djx, djy = bj[0] - aj[0], bj[1] - aj[1]
            elen = (djx * djx + djy * djy) ** 0.5
            ring_edges.append((aj, bj, elen))
            if elen < TOLERANCE or tree is None:
                continue
            backed_ratio[j] = _edge_covered(aj, bj, elen, wall_edges, tree, ink_proximity)
        ux, uy = (dx / edge_len, dy / edge_len) if edge_len else (0.0, 0.0)
        cos_to_neighbor = _nearest_wall_backed_cos(i, ring_edges, backed_ratio, ux, uy)

        jamb_ratio = edge_len / wall_depth if wall_depth else float("nan")

        # residual-gap profile vs neighbor room, beyond door span.
        residual_max = None
        if e["neighbor_room"] is not None:
            nrt, nidx = e["neighbor_room"].rsplit("_", 1)
            neighbor_poly = get_geometries(p.get(nrt))[int(nidx)]
            probe_dist = TOLERANCE + wall_depth
            opening_t0, opening_t1 = 0.0, 0.0
            for ot in ("door", "window", "front_door"):
                g = p.get(ot)
                if g is None:
                    continue
                for part in get_geometries(g):
                    inter = part.intersection(band)
                    if inter.is_empty or inter.geom_type != "Polygon":
                        continue
                    pts = list(inter.exterior.coords)
                    ts = [((px - a[0]) * dx + (py - a[1]) * dy) / (edge_len * edge_len) for px, py in pts]
                    t0, t1 = max(min(ts), 0.0), min(max(ts), 1.0)
                    if t1 - t0 > opening_t1 - opening_t0:
                        opening_t0, opening_t1 = t0, t1
            profile = _gap_profile(a, b, edge_len, poly, neighbor_poly, filled_wall_geom,
                                    opening_t0, opening_t1, probe_dist, n_samples=41)
            residual = [(t, gap) for t, gap in profile
                        if gap > TOLERANCE and not (opening_t0 <= t <= opening_t1)]
            residual_max = max((g for _, g in residual), default=0.0)

        # does check_plan's current rule actually suppress this edge?
        result = check_plan(raw_plan)
        suppressed = any(
            s.split(":")[1] == e["room"] and s.split(":")[2] == f"edge{i}"
            for s in result["notch_suppressions"]
        )

        tag = "SUPPRESSED" if suppressed else "NOT_suppressed"
        out_path = REPORTS_DIR / f"notch_audit_{idx:02d}_{tag}_{raw_plan.get('id')}_{e['room']}_e{i}.png"
        plot_instance(raw_plan, rt, inst_idx, i,
                      f"opening_cov={e['opening_coverage']:.3f} {tag}", out_path)

        row = dict(
            plan_id=raw_plan.get("id"), room=e["room"], edge_index=i,
            opening_coverage=e["opening_coverage"], door_witness=has_witness,
            witness_type=witness_type, cos_to_neighbor=cos_to_neighbor,
            edge_len=round(edge_len, 2), wall_depth=round(wall_depth, 2),
            jamb_ratio=round(jamb_ratio, 3), residual_max_gap=residual_max,
            suppressed=suppressed, overlay=str(out_path),
        )
        rows.append(row)
        print(row)

    print(f"\nSuppressed: {sum(1 for r in rows if r['suppressed'])}  "
          f"Not suppressed: {sum(1 for r in rows if not r['suppressed'])}")


if __name__ == "__main__":
    main()
