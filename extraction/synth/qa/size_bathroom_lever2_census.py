"""Full blocking-edge census for bathroom's ONLY-defect broken population
(2026-07-30), per Dan's explicit rejection of scoping a bathroom lever #2
ceiling to the 469-edge under-recognition set alone: 469 edges vs. 3,923
bathroom-ONLY-broken plans caps a maximally generous one-edge-rescues-one-
plan ceiling at 469/3,923 = 12.0% -- and a plan needs EVERY blocking edge
fixed, not one, so the real overlap can only be smaller. See
reports/p3a-bathroom-lever2-census.md for the pre-registered expectation
(written before this script was run) and the full write-up.

Population: EXACT match to measure_defect_cooccurrence.py's own
_defect_classes() (reused unchanged) -- clean_at_source AND NOT
converter_clean, defect-class set == exactly {"room_broken:bathroom"}
(isolated, per lever #1's own "only-defect population" lesson, not
"contains this defect").

Method, full population, no sampling:
  1. For each qualifying plan's bathroom room instance(s), run
     diagnose_broken_room_cycle.analyze_plan (stage-1 per-edge coverage
     taxonomy, REUSED UNCHANGED) and diagnose_cycle_unrepairable.analyze_plan
     (stage-2 connectivity/area-match taxonomy, REUSED UNCHANGED) -- the
     two disjoint, exhaustive mechanisms resplan_convert.py's own clean bar
     actually checks (a room failing stage 1 never reaches stage 2).
  2. For every stage-1 blocking edge, additionally tags it with the
     under-recognition boolean from measure_discriminator_disagreement.py's
     own per-edge check (_skeleton_edge_ratio + notch.py's conjunction,
     REUSED UNCHANGED -- only the edge-index bookkeeping is new, since the
     predecessor script only needed a population total and discarded which
     edge a disagreement belonged to).
  3. Plan-level reconciliation ceiling: a plan counts only if EVERY stage-1
     blocking edge across every bathroom instance in it is
     under-recognition-tagged AND the plan has zero stage-2 bathroom
     failures at all (reconciling the stage-1 discriminator does nothing
     for a stage-2 connectivity/area-match break).
  4. The 0.468 calibration factor (calibrate_lever1_prediction.py) is
     reported as a SEPARATE line, never folded into the raw ceiling.

No changes to rooms.py, assemble_rooms, or any gate threshold.

CLI: python -m extraction.synth.qa.size_bathroom_lever2_census [workers]
"""
from __future__ import annotations

import pickle
import sys
import time
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from shapely.geometry import LineString

from extraction.synth.notch import (
    NOTCH_LENGTH_MULTIPLE,
    OPENING_COVERAGE_THRESHOLD,
    PERPENDICULARITY_COS_THRESHOLD,
    _nearest_wall_backed_cos,
    _opening_coverage,
    _opening_coverage_and_match,
)
from extraction.synth.qa.diagnose_broken_room_cycle import analyze_plan as stage1_analyze_plan
from extraction.synth.qa.diagnose_cycle_unrepairable import analyze_plan as stage2_analyze_plan
from extraction.synth.qa.measure_clean_at_source import (
    COVERAGE_THRESHOLD,
    PROXIMITY_MULTIPLIER,
    TOLERANCE,
    _edge_covered,
    _wall_boundary_edges,
    check_plan,
)
from extraction.synth.qa.measure_defect_cooccurrence import _defect_classes
from extraction.synth.qa.measure_discriminator_disagreement import ASSEMBLE_TOLERANCE, _skeleton_edge_ratio
from extraction.synth.resplan_convert import convert_plan
from extraction.synth.rooms import _band
from extraction.synth.skeleton import extract_wall_skeleton, fill_openings_into_wall
from extraction.synth.vendor.resplan_utils import get_geometries, normalize_keys

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"
CALIBRATION_FACTOR = 0.468  # calibrate_lever1_prediction.py, 2026-07-29 -- reported separately, never folded in


def _is_isolated_bathroom(raw_plan: dict) -> bool:
    src_clean = check_plan(raw_plan)["clean_at_source"]
    _, stats = convert_plan(raw_plan)
    conv_clean = bool(stats.get("clean"))
    if not src_clean or conv_clean:
        return False
    return _defect_classes(stats) == {"room_broken:bathroom"}


def _under_recognition_tags(raw_plan: dict, room_key_to_edge_indices: dict[str, set[int]]) -> dict[tuple[str, int], bool]:
    """Recomputes check_excuses/assemble_excuses (measure_discriminator_
    disagreement.py's exact per-edge logic, reused unchanged) for the
    specific (room, edge_index) pairs stage 1 flagged as blocking, keeping
    the identity the predecessor script discarded. Returns True only for
    edges where check_excuses AND NOT assemble_excuses (under-recognition)."""
    p = normalize_keys(dict(raw_plan))
    wall_geom = p.get("wall")
    tags: dict[tuple[str, int], bool] = {}
    if wall_geom is None or wall_geom.is_empty:
        return tags
    wall_depth = float(p.get("wall_depth") or 4.0)
    filled = fill_openings_into_wall(wall_geom, p.get("door"), p.get("window"), p.get("front_door"))

    ink_proximity = (TOLERANCE + wall_depth / 2) * PROXIMITY_MULTIPLIER
    raw_wall_edges = _wall_boundary_edges(filled)
    from shapely.strtree import STRtree
    raw_tree = STRtree([LineString([wa, wb]) for wa, wb, _ in raw_wall_edges]) if raw_wall_edges else None

    skel = extract_wall_skeleton(filled, wall_depth, thickness_source_geom=wall_geom)
    if not skel.segments:
        return tags
    bands = [_band(s, ASSEMBLE_TOLERANCE) for s in skel.segments]
    skel_tree = STRtree(bands)
    opening_polys = [
        ((ot, idx), part)
        for ot in ("door", "window", "front_door")
        for idx, part in enumerate(get_geometries(p.get(ot)))
    ]

    for rt in ("bathroom",):
        g = p.get(rt)
        if g is None:
            continue
        for inst_idx, poly in enumerate(get_geometries(g)):
            room_key = f"{rt}_{inst_idx}"
            wanted = room_key_to_edge_indices.get(room_key)
            if not wanted or poly is None or poly.is_empty or poly.geom_type != "Polygon":
                continue
            coords = list(poly.exterior.coords)
            n = len(coords) - 1
            ring_edges = []
            raw_ratio = [None] * n
            skel_ratio = [None] * n
            for i in range(n):
                a, b = coords[i], coords[i + 1]
                dx, dy = b[0] - a[0], b[1] - a[1]
                edge_len = (dx * dx + dy * dy) ** 0.5
                ring_edges.append((a, b, edge_len))
                if edge_len < TOLERANCE:
                    continue
                raw_ratio[i] = 0.0 if raw_tree is None else _edge_covered(a, b, edge_len, raw_wall_edges, raw_tree, ink_proximity)
                skel_ratio[i] = _skeleton_edge_ratio(a, b, edge_len, dx, dy, skel.segments, bands, skel_tree)

            for i in wanted:
                if i >= n:
                    continue
                rr, sr = raw_ratio[i], skel_ratio[i]
                if rr is None or sr is None:
                    tags[(room_key, i)] = False
                    continue
                a, b, edge_len = ring_edges[i]
                dx, dy = b[0] - a[0], b[1] - a[1]
                ux, uy = (dx / edge_len, dy / edge_len) if edge_len else (0.0, 0.0)

                check_excuses = False
                if rr < COVERAGE_THRESHOLD:
                    opening_cov = _opening_coverage(a, b, edge_len, dx, dy, p, wall_depth)
                    cos_n = _nearest_wall_backed_cos(i, ring_edges, raw_ratio, ux, uy)
                    check_excuses = (
                        opening_cov >= OPENING_COVERAGE_THRESHOLD
                        and cos_n is not None
                        and cos_n <= PERPENDICULARITY_COS_THRESHOLD
                        and edge_len <= NOTCH_LENGTH_MULTIPLE * wall_depth
                    )

                assemble_excuses = False
                if sr < COVERAGE_THRESHOLD:
                    opening_cov2, match_key = _opening_coverage_and_match(a, b, edge_len, dx, dy, opening_polys, wall_depth)
                    cos_n2 = _nearest_wall_backed_cos(i, ring_edges, skel_ratio, ux, uy)
                    assemble_excuses = (
                        opening_cov2 >= OPENING_COVERAGE_THRESHOLD
                        and cos_n2 is not None
                        and cos_n2 <= PERPENDICULARITY_COS_THRESHOLD
                        and edge_len <= NOTCH_LENGTH_MULTIPLE * wall_depth
                        and match_key is not None
                    )
                tags[(room_key, i)] = check_excuses and not assemble_excuses

    return tags


def _census_one(raw_plan: dict) -> dict | None:
    if not _is_isolated_bathroom(raw_plan):
        return None

    stage1_rooms = [r for r in stage1_analyze_plan(raw_plan) if r["room"].startswith("bathroom_")]
    stage2_rooms = [r for r in stage2_analyze_plan(raw_plan) if r["room"].startswith("bathroom_")]

    room_key_to_edge_indices = {
        r["room"]: {e["edge_index"] for e in r["broken_edges"]} for r in stage1_rooms
    }
    tags = _under_recognition_tags(raw_plan, room_key_to_edge_indices) if room_key_to_edge_indices else {}

    edge_records = []
    for r in stage1_rooms:
        for e in r["broken_edges"]:
            edge_records.append(
                dict(
                    room=r["room"],
                    edge_index=e["edge_index"],
                    stage1_category=e["category"],
                    under_recognition=tags.get((r["room"], e["edge_index"]), False),
                )
            )

    stage2_categories = [f"stage2:{r['failure_type']}:{r['primary_category']}" for r in stage2_rooms]

    all_stage1_under_recognition = bool(edge_records) and all(e["under_recognition"] for e in edge_records)
    reconciliation_clears = all_stage1_under_recognition and not stage2_rooms
    no_mechanism_reproduced = not edge_records and not stage2_rooms

    return dict(
        resplan_id=raw_plan.get("id"),
        edge_records=edge_records,
        stage2_categories=stage2_categories,
        reconciliation_clears=reconciliation_clears,
        no_mechanism_reproduced=no_mechanism_reproduced,
    )


def main(workers: int = 8) -> None:
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)
    n_total = len(plans)

    t0 = time.time()
    results = []
    with ProcessPoolExecutor(max_workers=workers) as ex:
        for i, r in enumerate(ex.map(_census_one, plans, chunksize=32)):
            if r is not None:
                results.append(r)
            if (i + 1) % 2000 == 0:
                print(f"  ...{i + 1}/{n_total} ({time.time() - t0:.0f}s)", file=sys.stderr)
    elapsed = time.time() - t0

    n_plans = len(results)
    print(f"\n{'=' * 70}")
    print(f"N={n_total} plans scanned ({elapsed:.0f}s, {workers} workers)")
    print(f"Bathroom-ONLY-broken population reproduced: {n_plans} plans "
          f"(2026-07-29 measurement: 3,923/6,603 -- confirms/updates that count)")

    caveat = sum(1 for r in results if r["no_mechanism_reproduced"])
    if caveat:
        print(f"CAVEAT: {caveat}/{n_plans} plans reproduced NO stage-1 or stage-2 bathroom mechanism "
              f"under this script's reimplementation -- flagged, not silently dropped (see analogous "
              f"caveats in diagnose_broken_room_cycle.py/diagnose_cycle_unrepairable.py).")

    print(f"\n{'=' * 70}\n1. FULL BLOCKING-EDGE CENSUS (stage-1 edges, all bathroom rooms in the population)")
    all_edges = [e for r in results for e in r["edge_records"]]
    edge_hist = Counter(e["stage1_category"] for e in all_edges)
    print(f"  total stage-1 blocking edges: {len(all_edges)}")
    for cat, count in edge_hist.most_common():
        print(f"  {cat}: {count} ({100 * count / len(all_edges):.1f}%)" if all_edges else f"  {cat}: {count}")
    under_rec_edges = sum(1 for e in all_edges if e["under_recognition"])
    print(f"  of which UNDER-RECOGNITION-tagged (candidate for reconciliation): "
          f"{under_rec_edges}/{len(all_edges)} "
          f"({100 * under_rec_edges / len(all_edges):.1f}%)" if all_edges else "")

    print(f"\n  STAGE-2 (connectivity/area-match) bathroom room failures, "
          f"a mechanism the stage-1 edge census above does NOT cover at all:")
    stage2_hist = Counter(c for r in results for c in r["stage2_categories"])
    n_stage2_rooms = sum(stage2_hist.values())
    print(f"  total stage-2 bathroom room failures: {n_stage2_rooms}")
    for cat, count in stage2_hist.most_common():
        print(f"  {cat}: {count}")

    n_plans_with_stage1_only = sum(1 for r in results if r["edge_records"] and not r["stage2_categories"])
    n_plans_with_stage2_any = sum(1 for r in results if r["stage2_categories"])
    n_plans_with_both = sum(1 for r in results if r["edge_records"] and r["stage2_categories"])
    print(f"\n  plans with >=1 stage-1 bathroom edge: {sum(1 for r in results if r['edge_records'])}/{n_plans}")
    print(f"  plans with >=1 stage-2 bathroom failure: {n_plans_with_stage2_any}/{n_plans}")
    print(f"  plans with BOTH stage-1 and stage-2 bathroom failures: {n_plans_with_both}/{n_plans}")

    print(f"\n{'=' * 70}\n2. PLAN-LEVEL RECONCILIATION CEILING "
          f"(every stage-1 edge under-recognition-tagged, AND zero stage-2 bathroom failures)")
    n_clears = sum(1 for r in results if r["reconciliation_clears"])
    print(f"  RAW ceiling: {n_clears}/{n_plans} bathroom-ONLY-broken plans "
          f"({100 * n_clears / n_plans:.1f}%)")
    naive_cap_pct = 100 * 469 / n_plans
    print(f"  (pre-registered naive cap from the 469-edge population count, for comparison: "
          f"469/{n_plans} = {naive_cap_pct:.1f}%)")
    print(f"\n  CALIBRATED (0.468 factor, reported SEPARATELY, not folded into the raw ceiling above):")
    print(f"  {n_clears} x {CALIBRATION_FACTOR} = {n_clears * CALIBRATION_FACTOR:.1f} plans "
          f"({100 * n_clears * CALIBRATION_FACTOR / n_plans:.2f}% of the {n_plans}-plan population)")

    print(f"\n{'=' * 70}\nFor comparison, stair's own numbers (2026-07-29, already calibrated):")
    print(f"  stair ONLY-defect population: 23/6,603 broken plans (0.3%)")
    print(f"  stair calibrated ceiling: 33.9% of 757 instances (~8 plans population-wide effect)")


if __name__ == "__main__":
    wk = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else 8
    main(wk)
