"""Diagnosis-only (2026-07-22, doorway-notch follow-up #2): measure what
the PROPOSED three-condition suppression discriminator would actually do
across 200-300 flagged plans (not the 48-edge, 27-plan sample the
discriminator was designed against) — specifically, how many genuinely
non-notch edges (real defects, exterior/void, unrecoverable interior gaps)
it would wrongly suppress. This is the number that decides whether the
rule is safe to build, per Dan's explicit ask: "measuring what the rule
would do, not applying it."

The proposed rule (spec from the prior diagnostic session, NOT implemented
anywhere in rooms.py/check_plan): suppress a required-room boundary edge
from the wall-match check when ALL THREE hold:
  1. opening_coverage >= OPENING_THRESHOLD (door/window/front_door
     footprint spans this fraction of the edge's own parametric range)
  2. cos_to_nearest_wall_backed_neighbor <= PERPENDICULARITY_THRESHOLD
     (edge is perpendicular to the nearest wall-backed ring neighbor)
  3. edge_len <= LENGTH_MULTIPLE * wall_depth

Swept across OPENING_THRESHOLD in {0.60, 0.65, 0.70, 0.75, 0.80} to compare
recall (how much of the already-validated e_opening_doorway_notch bucket,
per the EXISTING classify() taxonomy, the rule would actually catch)
against false-positive rate (how many edges classify() puts in a
different, non-notch category the rule would ALSO suppress).

classify()'s own taxonomy (a/b/c/d/f/unresolved, all confirmed on real
overlays across two prior sessions) is used as ground truth here — this
script does not re-derive categories, it cross-tabulates the proposed
rule's verdict against that already-trusted classification.

Reuses _wall_boundary_edges/_edge_covered/COVERAGE_THRESHOLD/TOLERANCE/
PROXIMITY_MULTIPLIER (measure_clean_at_source.py), CLEAN_REQUIRED_ROOM_TYPES
(resplan_convert.py), fill_openings_into_wall (skeleton.py), analyze_edge/
classify/find_sample (classify_room_boundary_no_wall_match.py) — all
UNCHANGED. No new classification logic; this only adds the rule-simulation
and cross-tab. No changes to rooms.py/skeleton.py/check_plan/any existing
measurement script.
"""
from __future__ import annotations

import pickle
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from shapely.strtree import STRtree
from shapely.geometry import LineString

from extraction.synth.qa.classify_room_boundary_no_wall_match import (
    PKL_PATH,
    _inner_union,
    analyze_edge,
    classify,
    find_sample,
)
from extraction.synth.qa.measure_clean_at_source import (
    COVERAGE_THRESHOLD,
    PROXIMITY_MULTIPLIER,
    TOLERANCE,
    _edge_covered,
    _wall_boundary_edges,
)
from extraction.synth.resplan_convert import CLEAN_REQUIRED_ROOM_TYPES
from extraction.synth.skeleton import fill_openings_into_wall
from extraction.synth.vendor.resplan_utils import get_geometries, normalize_keys

TARGET_N = 300
SCAN_LIMIT = 3000  # ~19.8% flag rate post clamp-fix -> ~300 flagged within ~1600; margin kept

OPENING_THRESHOLDS = [0.60, 0.65, 0.70, 0.75, 0.80]
PERPENDICULARITY_THRESHOLD = 0.15  # cos_angle <= this counts as "perpendicular"
LENGTH_MULTIPLE = 1.2


def analyze_plan_with_neighbor_check(raw_plan):
    """Like classify_room_boundary_no_wall_match.analyze_plan, but builds
    wall_edges/tree ONCE per plan and reuses them both for analyze_edge
    (existing, unchanged) and for a same-ring nearest-wall-backed-neighbor
    perpendicularity check (new, but same technique as
    diagnose_doorway_notch.py's discriminator_signals — reimplemented here
    to share the tree instead of rebuilding it per candidate, which is
    what makes this tractable at 300-plan scale instead of 27)."""
    p = normalize_keys(dict(raw_plan))
    wall_geom = p.get("wall")
    wall_depth = float(p.get("wall_depth") or 4.0)
    filled_wall_geom = fill_openings_into_wall(wall_geom, p.get("door"), p.get("window"), p.get("front_door"))
    wall_edges = _wall_boundary_edges(filled_wall_geom)
    tree = STRtree([LineString([wa, wb]) for wa, wb, _ in wall_edges]) if wall_edges else None
    narrow_prox = (TOLERANCE + wall_depth / 2) * PROXIMITY_MULTIPLIER
    inner_union = _inner_union(p)

    results = []
    for rt in CLEAN_REQUIRED_ROOM_TYPES:
        g = p.get(rt)
        if g is None:
            continue
        for inst_idx, poly in enumerate(get_geometries(g)):
            if poly is None or poly.is_empty or poly.geom_type != "Polygon":
                continue
            coords = list(poly.exterior.coords)
            n = len(coords) - 1
            if n < 3:
                continue

            backed_ratio = [None] * n
            for i in range(n):
                a, b = coords[i], coords[i + 1]
                dx, dy = b[0] - a[0], b[1] - a[1]
                edge_len = (dx * dx + dy * dy) ** 0.5
                if edge_len < TOLERANCE:
                    continue
                backed_ratio[i] = _edge_covered(a, b, edge_len, wall_edges, tree, narrow_prox) if tree else 0.0

            for i in range(n):
                ratio = backed_ratio[i]
                if ratio is None or ratio >= COVERAGE_THRESHOLD:
                    continue
                a, b = coords[i], coords[i + 1]
                r = analyze_edge(p, rt, inst_idx, i, a, b, wall_geom, filled_wall_geom, wall_depth, wall_edges, tree, inner_union)
                r["resplan_id"] = raw_plan.get("id")
                r["category"] = classify(r)

                dx_e, dy_e = b[0] - a[0], b[1] - a[1]
                L_e = (dx_e * dx_e + dy_e * dy_e) ** 0.5
                ux, uy = (dx_e / L_e, dy_e / L_e) if L_e else (0.0, 0.0)
                cos_to_neighbor = None
                for offset in range(1, n):
                    hit = False
                    for sign in (-1, 1):
                        cand = (i + sign * offset) % n
                        if backed_ratio[cand] is not None and backed_ratio[cand] >= COVERAGE_THRESHOLD:
                            aa, bb = coords[cand], coords[cand + 1]
                            wdx, wdy = bb[0] - aa[0], bb[1] - aa[1]
                            wl = (wdx * wdx + wdy * wdy) ** 0.5
                            if wl:
                                cos_to_neighbor = abs(ux * (wdx / wl) + uy * (wdy / wl))
                            hit = True
                            break
                    if hit:
                        break
                r["cos_to_neighbor"] = cos_to_neighbor
                r["wall_depth"] = wall_depth
                results.append(r)
    return results


def rule_says_suppress(e, opening_threshold):
    if e["opening_coverage"] < opening_threshold:
        return False
    if e["cos_to_neighbor"] is None or e["cos_to_neighbor"] > PERPENDICULARITY_THRESHOLD:
        return False
    if e["edge_len"] > LENGTH_MULTIPLE * e["wall_depth"]:
        return False
    return True


def main():
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)

    sample = find_sample(plans, TARGET_N, SCAN_LIMIT)
    print(f"Sample: {len(sample)} plans flagged room_boundary_no_wall_match "
          f"(scanned first {SCAN_LIMIT} of {len(plans)})")

    t0 = time.time()
    all_edges = []
    for i, raw_plan in enumerate(sample):
        all_edges.extend(analyze_plan_with_neighbor_check(raw_plan))
        if (i + 1) % 50 == 0:
            print(f"  ...{i + 1}/{len(sample)} plans analyzed ({time.time() - t0:.0f}s)", file=sys.stderr)
    elapsed = time.time() - t0
    print(f"Analyzed {len(sample)} plans, {len(all_edges)} genuinely-broken edges, {elapsed:.0f}s\n")

    ground_truth = Counter(e["category"] for e in all_edges)
    print(f"{'=' * 70}\nGround-truth category breakdown (classify(), unchanged) over these edges:")
    for cat, count in ground_truth.most_common():
        print(f"  {cat}: {count} ({100 * count / len(all_edges):.1f}%)")

    n_true_notch = ground_truth.get("e_opening_doorway_notch", 0)

    print(f"\n{'=' * 70}\nProposed conjunction rule swept over opening_coverage threshold "
          f"(perpendicularity<={PERPENDICULARITY_THRESHOLD}, len<={LENGTH_MULTIPLE}x wall_depth held fixed):\n")
    header = f"{'threshold':>9} | {'suppressed':>10} | {'true_pos(e)':>11} | {'recall':>7} | {'false_pos':>9} | {'FP categories'}"
    print(header)
    print("-" * len(header))
    for thr in OPENING_THRESHOLDS:
        suppressed = [e for e in all_edges if rule_says_suppress(e, thr)]
        tp = sum(1 for e in suppressed if e["category"] == "e_opening_doorway_notch")
        fp_edges = [e for e in suppressed if e["category"] != "e_opening_doorway_notch"]
        fp = len(fp_edges)
        recall = tp / n_true_notch if n_true_notch else 0.0
        fp_cats = Counter(e["category"] for e in fp_edges)
        fp_str = ", ".join(f"{c}:{n}" for c, n in fp_cats.most_common())
        print(f"{thr:>9.2f} | {len(suppressed):>10} | {tp:>11} | {recall:>6.1%} | {fp:>9} | {fp_str}")

    # Detail dump of every false positive at the two boundary thresholds
    # requested (0.65 lean vs 0.80 status quo), so specific edges can be
    # inspected/overlaid if the count is nonzero.
    for thr in (0.65, 0.80):
        fps = [e for e in all_edges if rule_says_suppress(e, thr) and e["category"] != "e_opening_doorway_notch"]
        print(f"\n{'=' * 70}\nFalse positives at threshold {thr}: {len(fps)}")
        for e in fps:
            print(f"  plan={e['resplan_id']} room={e['room']} edge={e['edge_index']} category={e['category']} "
                  f"len={e['edge_len']} wall_depth={e['wall_depth']:.2f} opening_cov={e['opening_coverage']} "
                  f"cos_to_neighbor={e['cos_to_neighbor']}")


if __name__ == "__main__":
    main()
