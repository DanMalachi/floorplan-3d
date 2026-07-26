"""READ-ONLY population-scale sizing (2026-07-26) of the
`not_notch_diagonal_wall_mismatch` mechanism named in
reports/p3a-audit-57-unaudited.md: ~46/57 of the sampled (newly-relabeled,
non-random) unaudited edges turned out to be a smooth diagonal room-boundary
edge crossing a wall the source draws as an axis-aligned staircase (or a
wall the edge-parallel matching technique otherwise can't align to), with
real wall ink visibly present in the overlay despite the coverage check
scoring it broken.

Per Dan's explicit instruction: this phase was already burned once by
projecting a small sample's recovery fraction into a headline ceiling
estimate (the 96.4% revised-ceiling number, later corrected by the
measurement-bug findings) -- so this mechanism's population-scale share
must be MEASURED, not projected from the 57-edge sample, before it
influences any reachability claim.

Method -- a geometric PROXY signature, not a re-run of the same visual
audit at scale (that would take another full session): for every edge
`classify()` currently puts in `a_genuine_gt_defect_between_rooms`
(post-2026-07-22-fix), test two independent conditions:

1. is_diagonal: the edge's own unit direction has neither component near
   +-1 (i.e., it is NOT axis-aligned) -- a purely geometric test on the
   edge itself, independent of any wall data.
2. ink_band_overlap: the fraction of a thickness-scaled band around the
   edge (same `ink_proximity` band `_edge_covered` already uses) that is
   covered by the FILLED wall polygon (`fill_openings_into_wall`'s output
   -- includes the door/window union restoration, same ink reference the
   audit's own overlays render as the yellow fill every visual verdict
   was made against). This is a raw polygon-AREA overlap test, deliberately
   NOT the same parallel-wall-EDGE-direction matching `_edge_covered` uses
   internally -- it answers "is there wall material here at all" rather
   than "does a wall-polygon EDGE run parallel to this room edge," which
   is exactly the distinction the diagonal/staircase mechanism turns on.

An edge is a MISMATCH CANDIDATE if is_diagonal AND ink_band_overlap >=
INK_OVERLAP_THRESHOLD. This is a candidate signature, not a per-edge human
verdict -- report it explicitly as an upper-bound-ish geometric estimate,
alongside the population's edge/room/plan counts, and flag the caveat that
a diagonal edge running close to (but not actually along) a real door
could inflate the overlap ratio via the same door-fill union that
`fill_openings_into_wall` performs.

No pipeline file touched.
"""
from __future__ import annotations

import pickle
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from shapely.geometry import LineString

from extraction.synth.qa.classify_room_boundary_no_wall_match import analyze_plan, classify
from extraction.synth.qa.measure_clean_at_source import TOLERANCE
from extraction.synth.skeleton import fill_openings_into_wall
from extraction.synth.vendor.resplan_utils import get_geometries, normalize_keys

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"
DEFECT_CATEGORY = "a_genuine_gt_defect_between_rooms"

AXIS_ALIGNED_COS_FLOOR = 0.985   # |ux| or |uy| >= this => treated as axis-aligned, NOT diagonal
INK_OVERLAP_THRESHOLD = 0.5      # fraction of the ink band that must be filled-wall to count as "ink present"
# NOTE (2026-07-26, self-caught bug before this number was reported): a first
# version of this script reused measure_clean_at_source's PROXIMITY_MULTIPLIER
# (3.0x) for this band -- that constant is calibrated for a CANDIDATE-SEARCH
# radius ("look this far for a matching wall edge"), not for an area-overlap
# "is this specific band actually wall material" question. At 3x, the band
# balloons to 2-3x the physical wall thickness, diluting the ratio with open
# room space on both sides even when the wall core is fully covered -- on a
# visually-confirmed case (plan 3313, bedroom_2, edge 4; plan 13746, edge 57)
# the inflated band scored ~0.1-0.35 despite the wall being clearly, fully
# present in the render. Recalibrated to the physical half-thickness (plus a
# small tolerance), which is what the "is there wall material here" question
# actually asks: at this radius the same plan-3313 edge scores 0.65-0.71.
INK_BAND_RADIUS_MULTIPLIER = 1.0  # of wall_depth/2 -- physical half-thickness, not search radius


def edge_endpoints(p, e):
    rt, inst_idx = e["room"].rsplit("_", 1)
    inst_idx = int(inst_idx)
    i = e["edge_index"]
    poly = get_geometries(p.get(rt))[inst_idx]
    coords = list(poly.exterior.coords)
    return coords[i], coords[i + 1]


def main():
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)
    print(f"Sizing not_notch_diagonal_wall_mismatch candidate signature over "
          f"{len(plans)} plans, edges currently classed '{DEFECT_CATEGORY}'.")

    n_a_edges = 0
    n_diagonal = 0
    n_candidate_edges = 0
    rooms_with_candidate = set()
    plans_with_candidate = set()
    rooms_with_a = set()
    plans_with_a = set()
    overlap_ratios = []

    for raw_plan in plans:
        p = normalize_keys(dict(raw_plan))
        old_edges = analyze_plan(raw_plan)
        if not old_edges:
            continue
        a_edges = [e for e in old_edges if classify(e) == DEFECT_CATEGORY]
        if not a_edges:
            continue

        wall_geom = p.get("wall")
        wall_depth = float(p.get("wall_depth") or 4.0)
        filled = fill_openings_into_wall(wall_geom, p.get("door"), p.get("window"), p.get("front_door"))
        ink_band_radius = (wall_depth / 2) * INK_BAND_RADIUS_MULTIPLIER

        pid = raw_plan.get("id")
        plans_with_a.add(pid)
        for e in a_edges:
            n_a_edges += 1
            rooms_with_a.add((pid, e["room"]))
            a, b = edge_endpoints(p, e)
            edge_len = e["edge_len"]
            if edge_len < TOLERANCE:
                continue
            dx, dy = b[0] - a[0], b[1] - a[1]
            ux, uy = dx / edge_len, dy / edge_len
            is_diagonal = abs(ux) < AXIS_ALIGNED_COS_FLOOR and abs(uy) < AXIS_ALIGNED_COS_FLOOR
            if not is_diagonal:
                continue
            n_diagonal += 1

            band = LineString([a, b]).buffer(ink_band_radius)
            band_area = band.area
            if band_area <= 0:
                continue
            overlap = 0.0
            for part in get_geometries(filled):
                if part is None or part.is_empty:
                    continue
                overlap += band.intersection(part).area
            ratio = overlap / band_area
            overlap_ratios.append(ratio)
            if ratio >= INK_OVERLAP_THRESHOLD:
                n_candidate_edges += 1
                rooms_with_candidate.add((pid, e["room"]))
                plans_with_candidate.add(pid)

    print(f"\n{'=' * 70}\nPopulation-scale result:")
    print(f"  {DEFECT_CATEGORY} edges (all): {n_a_edges}")
    print(f"  of those, geometrically diagonal (not axis-aligned): "
          f"{n_diagonal} ({100 * n_diagonal / n_a_edges:.1f}% of all '{DEFECT_CATEGORY}' edges)")
    print(f"  of the diagonal ones, ink-band-overlap >= {INK_OVERLAP_THRESHOLD:.0%} "
          f"(mismatch CANDIDATE, not a human verdict): "
          f"{n_candidate_edges} ({100 * n_candidate_edges / n_diagonal:.1f}% of diagonal edges, "
          f"{100 * n_candidate_edges / n_a_edges:.1f}% of all '{DEFECT_CATEGORY}' edges)")

    print(f"\n  rooms with >=1 '{DEFECT_CATEGORY}' edge: {len(rooms_with_a)}")
    print(f"  rooms with >=1 mismatch-candidate edge: {len(rooms_with_candidate)} "
          f"({100 * len(rooms_with_candidate) / len(rooms_with_a):.1f}% of those rooms)")

    print(f"\n  plans with >=1 '{DEFECT_CATEGORY}' edge: {len(plans_with_a)}")
    print(f"  plans with >=1 mismatch-candidate edge: {len(plans_with_candidate)} "
          f"({100 * len(plans_with_candidate) / len(plans_with_a):.1f}% of those plans)")

    if overlap_ratios:
        overlap_ratios.sort()
        n = len(overlap_ratios)
        print(f"\n  ink-band-overlap distribution among diagonal edges (n={n}): "
              f"median={overlap_ratios[n // 2]:.3f}  "
              f"p10={overlap_ratios[n // 10]:.3f}  "
              f"p90={overlap_ratios[9 * n // 10]:.3f}")


if __name__ == "__main__":
    main()
