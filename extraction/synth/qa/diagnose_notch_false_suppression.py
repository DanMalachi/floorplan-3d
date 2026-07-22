"""READ-ONLY diagnostic (2026-07-22): investigate the single defect-flip
found by measure_suppression_population.py's acceptance gate — plan 5683,
the one plan whose classify_room_boundary_no_wall_match.py-labeled
'a_genuine_gt_defect_between_rooms' edge now scores clean_at_source under
the doorway-notch suppression built in check_plan (measure_clean_at_source.py,
committed 1881b8a).

Makes NO changes to check_plan, classify(), any threshold/constant, or any
other pipeline file. Everything here is read/measure/print. Per Dan's task
spec, this script:

  STEP 0 — prints the real interfaces (predicate source, classify()
  assignment source, one raw ResPlan record's geometry field structure) so
  nothing downstream is guessed from field names.
  STEP 1 — probes plan 5683 directly for the five requested facts.
  STEP 2 — generalizes: of every edge classify() ever put in
  'a_genuine_gt_defect_between_rooms' across the population (not just the
  1100 PLANS, since a plan can flip clean on the strength of edges the
  plan-level flip-count silently ignores once ANY other edge in the same
  plan also clears), how many are independently touched by a notch
  suppression, and what do fact-1 (door witness) / fact-3 (residual gap
  beyond door span) look like across that set — not just on 5683.

Report written by hand afterward to reports/p3a-notch-diagnosis.md; this
script only prints the raw numbers that report is built from.
"""
from __future__ import annotations

import inspect
import pickle
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from shapely.geometry import Point, Polygon
from shapely.ops import unary_union

from extraction.synth.qa.measure_clean_at_source import (
    COVERAGE_THRESHOLD,
    NOTCH_LENGTH_MULTIPLE,
    OPENING_COVERAGE_THRESHOLD,
    PERPENDICULARITY_COS_THRESHOLD,
    PROXIMITY_MULTIPLIER,
    TOLERANCE,
    _edge_covered,
    _nearest_wall_backed_cos,
    _opening_coverage,
    _wall_boundary_edges,
    check_plan,
)
from extraction.synth.qa.classify_room_boundary_no_wall_match import (
    OPENING_COVERAGE_THRESHOLD as CLASSIFY_OPENING_COVERAGE_THRESHOLD,
    analyze_edge,
    analyze_plan,
    classify,
)
from extraction.synth.resplan_convert import CLEAN_REQUIRED_ROOM_TYPES
from extraction.synth.skeleton import fill_openings_into_wall
from extraction.synth.vendor.resplan_utils import get_geometries, normalize_keys

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"
FLIP_PLAN_ID = 5683
DEFECT_CATEGORY = "a_genuine_gt_defect_between_rooms"


def step0_interfaces(sample_plan):
    print("=" * 70)
    print("STEP 0a — suppression predicate in check_plan (measure_clean_at_source.py)")
    print("=" * 70)
    src = inspect.getsource(check_plan)
    # Print only the notch-decision block, verbatim, with its constants.
    start = src.index("opening_cov = _opening_coverage")
    end = src.index("room_broken = True", start) + len("room_broken = True")
    print(src[start:end])
    print(f"\nConstants: OPENING_COVERAGE_THRESHOLD={OPENING_COVERAGE_THRESHOLD}  "
          f"PERPENDICULARITY_COS_THRESHOLD={PERPENDICULARITY_COS_THRESHOLD}  "
          f"NOTCH_LENGTH_MULTIPLE={NOTCH_LENGTH_MULTIPLE}  COVERAGE_THRESHOLD={COVERAGE_THRESHOLD}")
    print("\nONE-LINE GEOMETRIC CONDITION: an edge that fails the wall-ink "
          "coverage check (coverage < 0.5) is suppressed (not flagged) iff it is "
          "short (edge_len <= 1.2x wall_depth), nearly perpendicular to the "
          "nearest wall-backed ring neighbor (|cos| <= 0.15), AND >=65% of its "
          "own [0,1] parametric span is spanned by a door/window/front_door "
          "footprint.")

    print("\n" + "=" * 70)
    print("STEP 0b — a_genuine_gt_defect_between_rooms assignment "
          "(classify_room_boundary_no_wall_match.py)")
    print("=" * 70)
    print(inspect.getsource(classify))
    print(f"CLASSIFY's own opening-coverage cutoff (branch 2, 'e_opening_doorway_notch'): "
          f"{CLASSIFY_OPENING_COVERAGE_THRESHOLD}  vs. the suppression rule's: "
          f"{OPENING_COVERAGE_THRESHOLD}")
    print("\nLabel granularity: classify() is called PER EDGE (see analyze_plan — "
          "one dict per genuinely-broken ring edge). measure_suppression_population.py "
          "rolls this up to PER PLAN via `{classify(e) for e in old_edges}` — a plan "
          "counts as 'a_classed' if ANY of its edges lands in that bucket.")
    print("clean_at_source (check_plan) is per-plan: `clean_at_source = not flags` — "
          "yes, it requires ZERO flags of any kind across every required room's every "
          "edge, not just zero 'a'-classed ones. A plan can therefore flip to "
          "clean_at_source even if only ONE of several originally-broken edges was "
          "notch-suppressed, as long as no other edge (in this or any other required "
          "room) remains flagged.")
    print("\nProvenance: purely heuristic/code-derived. No human-audit or annotation "
          "file is consulted anywhere in classify_room_boundary_no_wall_match.py — "
          "grep confirms no CSV/JSON/label-file read besides the ResPlan.pkl geometry "
          "itself. The 1100 'a_genuine_gt_defect_between_rooms' plan-level labels used "
          "for the flip gate are 100% classifier output, not ground truth in the "
          "annotated sense.")

    print("\n" + "=" * 70)
    print("STEP 0c — one raw ResPlan record's structure")
    print("=" * 70)
    p = normalize_keys(dict(sample_plan))
    print(f"Top-level keys: {sorted(p.keys())}")
    for k, v in sorted(p.items()):
        if hasattr(v, "geom_type"):
            parts = get_geometries(v)
            print(f"  {k}: {type(v).__name__} geom_type={v.geom_type} "
                  f"n_parts={len(parts)} first_part_type={parts[0].geom_type if parts else None}")
        else:
            print(f"  {k}: {type(v).__name__} = {v!r}")
    door_g = p.get("door")
    print(f"\nConfirm per-door geometry accessible: p['door'] -> {type(door_g).__name__}, "
          f"{len(get_geometries(door_g))} individual door polygon(s) on this sample plan "
          f"(id={sample_plan.get('id')}) — each is a Polygon with its own bounds, usable "
          "as a direct witness geometry for the probe below.")


def _gap_profile(a, b, edge_len, current_room, neighbor_room, filled_wall_geom,
                  opening_t0, opening_t1, probe_dist, n_samples=41):
    """Sample gap_width(t) = perpendicular distance from a point on the edge
    to the union of (current_room, neighbor_room, filled_wall_geom) — i.e.
    literally unclaimed space — at n_samples points along [0,1]. Reports the
    door-covered span [opening_t0, opening_t1] separately from the residual.
    Also returns 'touching_frac': fraction of samples within TOLERANCE of
    zero gap (room boundaries coincide / genuinely share a line there)."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    nx, ny = (-dy / edge_len, dx / edge_len) if edge_len else (0.0, 0.0)
    claimed = unary_union([current_room, neighbor_room, filled_wall_geom])

    profile = []
    for i in range(n_samples):
        t = i / (n_samples - 1)
        px, py = a[0] + dx * t, a[1] + dy * t
        # cast outward along the normal up to probe_dist, find first point
        # NOT covered by claimed geometry (binary search on the segment).
        lo, hi = 0.0, probe_dist
        if claimed.contains(Point(px + nx * hi, py + ny * hi)):
            gap = 0.0  # even the far end is still claimed -> no gap detected in range
        elif not claimed.contains(Point(px + nx * lo, py + ny * lo)):
            gap = 0.0  # already unclaimed right at the edge itself
        else:
            for _ in range(24):
                mid = (lo + hi) / 2
                if claimed.contains(Point(px + nx * mid, py + ny * mid)):
                    lo = mid
                else:
                    hi = mid
            gap = lo
        profile.append((t, gap))
    return profile


def step1_probe_5683(raw_plan):
    print("\n" + "=" * 70)
    print(f"STEP 1 — probe plan {FLIP_PLAN_ID}")
    print("=" * 70)

    p = normalize_keys(dict(raw_plan))
    wall_geom = p.get("wall")
    wall_depth = float(p.get("wall_depth") or 4.0)
    filled_wall_geom = fill_openings_into_wall(wall_geom, p.get("door"), p.get("window"), p.get("front_door"))
    wall_edges = _wall_boundary_edges(filled_wall_geom)

    # Reproduce exactly which edge(s) classify() called 'a_genuine_gt_defect_between_rooms'
    # for this plan, and cross-check against check_plan's own suppression output.
    old_edges = analyze_plan(raw_plan)
    a_edges = [e for e in old_edges if classify(e) == DEFECT_CATEGORY]
    print(f"Edges classify() put in '{DEFECT_CATEGORY}' for plan {FLIP_PLAN_ID}: {len(a_edges)}")

    result = check_plan(raw_plan)
    print(f"check_plan: clean_at_source={result['clean_at_source']}  flags={result['flags']}")
    print(f"check_plan: notch_suppressions={result['notch_suppressions']}")

    for e in a_edges:
        rt, inst_idx = e["room"].rsplit("_", 1)
        inst_idx = int(inst_idx)
        i = e["edge_index"]
        poly = get_geometries(p.get(rt))[inst_idx]
        coords = list(poly.exterior.coords)
        a, b = coords[i], coords[i + 1]
        edge_len = e["edge_len"]
        dx, dy = b[0] - a[0], b[1] - a[1]

        print(f"\n--- edge: room={e['room']} edge_index={i}  a={a}  b={b}  edge_len={edge_len} ---")
        print(f"  classify()'s own recorded fields: opening_coverage={e['opening_coverage']} "
              f"(classify 'e' cutoff={CLASSIFY_OPENING_COVERAGE_THRESHOLD}) "
              f"ink_ratio_narrow={e['ink_ratio_narrow']} ink_ratio_wide={e['ink_ratio_wide']} "
              f"neighbor_room={e['neighbor_room']} on_exterior={e['on_exterior']} "
              f"outward_inside_inner={e['outward_inside_inner']} opening_hit={e['opening_hit']}")

        # Fact 5 (do first — determines whether the suppression predicate's
        # own fields even apply to this edge the same way classify() saw it).
        opening_cov_supp = _opening_coverage(a, b, edge_len, dx, dy, p, wall_depth)
        n = len(coords) - 1
        ring_edges = []
        backed_ratio = [None] * n
        for j in range(n):
            aj, bj = coords[j], coords[j + 1]
            djx, djy = bj[0] - aj[0], bj[1] - aj[1]
            elen = (djx * djx + djy * djy) ** 0.5
            ring_edges.append((aj, bj, elen))
            if elen < TOLERANCE:
                continue
            ink_proximity = (TOLERANCE + wall_depth / 2) * PROXIMITY_MULTIPLIER
            tree_local = None
        # need STRtree for backed_ratio / neighbor cos -> reuse check_plan's own tree build
        from shapely.geometry import LineString
        from shapely.strtree import STRtree
        tree = STRtree([LineString([wa, wb]) for wa, wb, _ in wall_edges]) if wall_edges else None
        ink_proximity = (TOLERANCE + wall_depth / 2) * PROXIMITY_MULTIPLIER
        for j in range(n):
            aj, bj, elen = ring_edges[j]
            if elen < TOLERANCE or tree is None:
                continue
            backed_ratio[j] = _edge_covered(aj, bj, elen, wall_edges, tree, ink_proximity)
        ux, uy = (dx / edge_len, dy / edge_len) if edge_len else (0.0, 0.0)
        cos_to_neighbor = _nearest_wall_backed_cos(i, ring_edges, backed_ratio, ux, uy)
        is_notch_per_predicate = (
            opening_cov_supp >= OPENING_COVERAGE_THRESHOLD
            and cos_to_neighbor is not None
            and cos_to_neighbor <= PERPENDICULARITY_COS_THRESHOLD
            and edge_len <= NOTCH_LENGTH_MULTIPLE * wall_depth
        )
        print(f"\n  FACT 5 — suppression predicate's own field values for this exact edge:")
        print(f"    opening_coverage (suppression's calc) = {opening_cov_supp:.3f}  "
              f"(threshold {OPENING_COVERAGE_THRESHOLD})")
        print(f"    cos_to_neighbor = {cos_to_neighbor}  (threshold <= {PERPENDICULARITY_COS_THRESHOLD})")
        print(f"    edge_len={edge_len:.2f}  wall_depth={wall_depth:.2f}  "
              f"1.2x wall_depth={NOTCH_LENGTH_MULTIPLE * wall_depth:.2f}")
        print(f"    -> predicate fires: {is_notch_per_predicate}")
        print(f"    classify()'s opening_coverage for the SAME edge = {e['opening_coverage']} "
              f"(computed with a slightly different band; classify()'s own 'e' bucket "
              f"needs >= {CLASSIFY_OPENING_COVERAGE_THRESHOLD} and did NOT fire, routing "
              f"this edge to 'a' instead — the two functions used different opening-"
              f"coverage thresholds on what looks like the same underlying signal.)")

        # Fact 1: door polygon witness.
        print(f"\n  FACT 1 — door/window/front_door polygon witnessing the gap:")
        edge_band = poly.__class__  # noop, keep import tidy
        from shapely.geometry import LineString as _LS
        band = _LS([a, b]).buffer(TOLERANCE + wall_depth / 2)
        witness = None
        for ot in ("door", "window", "front_door"):
            g = p.get(ot)
            if g is None:
                continue
            for part in get_geometries(g):
                if part.intersects(band):
                    witness = (ot, part)
                    print(f"    {ot} polygon intersects edge band: bounds={part.bounds}  "
                          f"area={part.area:.2f}  "
                          f"width_along_edge_dir=~{edge_len:.2f} (edge_len itself)")
        if witness is None:
            print("    NO door/window/front_door polygon intersects this edge's band.")

        # Fact 2: suppressed-gap width vs door-width band.
        print(f"\n  FACT 2 — edge_len vs. door-width band:")
        print(f"    edge_len = {edge_len:.2f}")
        if witness is not None:
            ot, part = witness
            wx0, wy0, wx1, wy1 = part.bounds
            door_w = max(wx1 - wx0, wy1 - wy0)
            door_w_minor = min(wx1 - wx0, wy1 - wy0)
            print(f"    {ot} bbox major dim = {door_w:.2f}  minor dim (~jamb depth) = {door_w_minor:.2f}")
            print(f"    edge_len / door_minor_dim = {edge_len / door_w_minor if door_w_minor else float('nan'):.3f} "
                  f"(near 1.0 means the edge is exactly the door's own jamb depth)")

        # Fact 3: coincident vs. genuine wedge — sampled gap profile.
        print(f"\n  FACT 3 — room-polygon coincidence vs. residual unassigned wedge:")
        if e["neighbor_room"] is None:
            print("    No neighbor_room identified by analyze_edge's outward probe — "
                  "cannot compute a gap profile against a specific neighbor polygon.")
        else:
            nrt, nidx = e["neighbor_room"].rsplit("_", 1)
            neighbor_poly = get_geometries(p.get(nrt))[int(nidx)]
            probe_dist = TOLERANCE + wall_depth
            opening_t0, opening_t1 = 0.0, 0.0
            if witness is not None:
                ot, part = witness
                inter = part.intersection(_LS([a, b]).buffer(TOLERANCE + wall_depth / 2))
                if not inter.is_empty and inter.geom_type == "Polygon":
                    pts = list(inter.exterior.coords)
                    ts = [((px - a[0]) * dx + (py - a[1]) * dy) / (edge_len * edge_len) for px, py in pts]
                    opening_t0, opening_t1 = max(min(ts), 0.0), min(max(ts), 1.0)
            profile = _gap_profile(a, b, edge_len, poly, neighbor_poly, filled_wall_geom,
                                    opening_t0, opening_t1, probe_dist)
            touching = sum(1 for t, gap in profile if gap <= TOLERANCE)
            print(f"    door/window span on this edge (parametric): t=[{opening_t0:.3f}, {opening_t1:.3f}] "
                  f"-> {(opening_t1 - opening_t0) * edge_len:.2f} units of {edge_len:.2f}")
            print(f"    sampled gap_width(t) (0=touching/claimed, else distance to nearest "
                  f"claimed geometry): touching_or_claimed {touching}/{len(profile)} samples")
            residual = [(t, gap) for t, gap in profile if gap > TOLERANCE and not (opening_t0 <= t <= opening_t1)]
            print(f"    residual samples OUTSIDE the door span with gap > {TOLERANCE}: "
                  f"{len(residual)}/{len(profile)}")
            if residual:
                max_gap = max(gap for _, gap in residual)
                print(f"    max residual gap width (beyond door span): {max_gap:.2f}")
                print(f"    residual sample detail: {[(round(t,3), round(g,2)) for t, g in residual]}")
            else:
                print("    -> every sample outside the door span is touching/claimed: "
                      "no residual wedge found beyond the door footprint.")
            print(f"    shared-boundary length estimate (edge_len * touching_frac): "
                  f"{edge_len * touching / len(profile):.2f} / {edge_len:.2f}")

        # Fact 4: notch depth vs local wall thickness.
        print(f"\n  FACT 4 — notch depth vs. wall thickness:")
        print(f"    edge_len (jamb candidate depth) = {edge_len:.2f}  plan wall_depth = {wall_depth:.2f}  "
              f"ratio = {edge_len / wall_depth:.3f}  (a true notch jamb should be close to a single "
              f"wall-thickness pass, i.e. ratio near/under {NOTCH_LENGTH_MULTIPLE})")
        print(f"    NOTE: wall_depth here is the plan's single global scalar (ResPlan does not "
              f"expose a per-wall-segment thickness field on the raw record) — this is the same "
              f"limitation the suppression predicate itself lives with, not something this probe "
              f"can improve on without a different source field.")


def step2_population(plans):
    print("\n" + "=" * 70)
    print("STEP 2 — population-scale edge-level false-suppression measurement")
    print("=" * 70)
    n_a_edges_total = 0
    n_a_edges_suppressed = 0
    fact1_present = 0
    fact1_absent = 0
    fact3_residual = 0
    fact3_no_residual = 0
    fact3_no_neighbor = 0
    examples = []
    # classify()'s own 'e_opening_doorway_notch' bucket only checks
    # opening_coverage >= 0.8 (one condition, no perpendicularity/edge_len
    # check at all). Every a-classed edge with opening_coverage already in
    # [0.65, 0.8) sits in classify()'s blind spot regardless of whether it
    # ALSO clears the suppression rule's other two conditions — this bounds
    # how many of the 1100/1800 'a' labels are at risk from classify()'s own
    # cruder, single-condition, unvalidated-at-0.8 cutoff, independent of
    # whether check_plan's fuller conjunction actually suppresses them.
    opening_cov_hist_a_edges = Counter()

    for idx, raw_plan in enumerate(plans):
        old_edges = analyze_plan(raw_plan)
        if not old_edges:
            continue
        a_edges = [e for e in old_edges if classify(e) == DEFECT_CATEGORY]
        if not a_edges:
            continue
        n_a_edges_total += len(a_edges)
        for e in a_edges:
            oc = e["opening_coverage"]
            if oc >= 0.8:
                opening_cov_hist_a_edges["impossible(would be e-classed)"] += 1
            elif oc >= 0.65:
                opening_cov_hist_a_edges["[0.65,0.8)_classify_blind_spot"] += 1
            elif oc >= 0.3:
                opening_cov_hist_a_edges["[0.3,0.65)_below_suppression_threshold"] += 1
            else:
                opening_cov_hist_a_edges["[0,0.3)_clearly_no_opening"] += 1

        result = check_plan(raw_plan)
        suppressed_keys = set()
        for s in result["notch_suppressions"]:
            # format: room_boundary_notch_suppressed:{rt}_{inst_idx}:edge{i}:...
            parts = s.split(":")
            room_key = parts[1]
            edge_key = parts[2]  # 'edgeN'
            suppressed_keys.add((room_key, int(edge_key[4:])))

        p = None
        for e in a_edges:
            key = (e["room"], e["edge_index"])
            if key in suppressed_keys:
                n_a_edges_suppressed += 1
                if p is None:
                    p = normalize_keys(dict(raw_plan))
                rt, inst_idx = e["room"].rsplit("_", 1)
                poly = get_geometries(p.get(rt))[int(inst_idx)]
                coords = list(poly.exterior.coords)
                a, b = coords[e["edge_index"]], coords[e["edge_index"] + 1]
                wall_depth = float(p.get("wall_depth") or 4.0)
                dx, dy = b[0] - a[0], b[1] - a[1]
                edge_len = e["edge_len"]
                from shapely.geometry import LineString as _LS
                band = _LS([a, b]).buffer(TOLERANCE + wall_depth / 2)
                has_witness = False
                for ot in ("door", "window", "front_door"):
                    g = p.get(ot)
                    if g is None:
                        continue
                    for part in get_geometries(g):
                        if part.intersects(band):
                            has_witness = True
                if has_witness:
                    fact1_present += 1
                else:
                    fact1_absent += 1

                if e["neighbor_room"] is None:
                    fact3_no_neighbor += 1
                else:
                    filled_wall_geom = fill_openings_into_wall(
                        p.get("wall"), p.get("door"), p.get("window"), p.get("front_door"))
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
                                            opening_t0, opening_t1, probe_dist, n_samples=21)
                    residual = [(t, gap) for t, gap in profile
                                if gap > TOLERANCE and not (opening_t0 <= t <= opening_t1)]
                    if residual:
                        fact3_residual += 1
                        if len(examples) < 15:
                            examples.append((raw_plan.get("id"), e["room"], e["edge_index"],
                                              has_witness, max(g for _, g in residual)))
                    else:
                        fact3_no_residual += 1
                        if len(examples) < 15:
                            examples.append((raw_plan.get("id"), e["room"], e["edge_index"],
                                              has_witness, 0.0))
        if (idx + 1) % 2000 == 0:
            print(f"  ...{idx + 1}/{len(plans)}", file=sys.stderr)

    print(f"Total edges classify() put in '{DEFECT_CATEGORY}' across the population: {n_a_edges_total}")
    print(f"Of those, touched by a notch suppression: {n_a_edges_suppressed} "
          f"({100 * n_a_edges_suppressed / n_a_edges_total:.2f}% of a-classed edges)"
          if n_a_edges_total else "")
    print(f"\nFact-1 (door/window/front_door witness present) among the "
          f"{n_a_edges_suppressed} suppressed a-classed edges:")
    print(f"  witness present: {fact1_present}  witness absent: {fact1_absent}")
    print(f"\nFact-3 (residual gap beyond door span, sampled) among the same set:")
    print(f"  residual gap found: {fact3_residual}  no residual (fully explained by door span): "
          f"{fact3_no_residual}  no neighbor_room identified: {fact3_no_neighbor}")
    print(f"\nExample rows (plan, room, edge_index, has_door_witness, max_residual_gap):")
    for row in examples:
        print(f"  {row}")

    print(f"\nopening_coverage distribution across ALL {n_a_edges_total} a-classed edges "
          f"(classify()'s field, independent of whether check_plan's fuller conjunction "
          f"also suppresses them — bounds classify()'s own blind-spot exposure):")
    for bucket, count in opening_cov_hist_a_edges.most_common():
        print(f"  {bucket}: {count} ({100 * count / n_a_edges_total:.2f}%)")


def main(limit: int | None = None):
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)
    by_id = {pl.get("id"): pl for pl in plans}

    step0_interfaces(plans[0])

    flip_plan = by_id.get(FLIP_PLAN_ID)
    if flip_plan is None:
        print(f"plan {FLIP_PLAN_ID} not found in population!")
        return
    step1_probe_5683(flip_plan)

    step2_population(plans if limit is None else plans[:limit])


if __name__ == "__main__":
    lim = int(sys.argv[1]) if len(sys.argv) > 1 else None
    main(lim)
