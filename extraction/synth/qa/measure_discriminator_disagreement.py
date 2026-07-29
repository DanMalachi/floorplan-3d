"""Both-directions, per-edge discriminator disagreement measurement
(2026-07-29), per Dan's explicit rejection of "cause already found": the
13/17,000 containment-invariant violations only measure ONE direction
(assemble_rooms's skeleton-band discriminator excuses an edge that
check_plan's raw-ink discriminator does NOT) and only at PLAN granularity,
requiring every OTHER edge in the plan to also be clean -- a plan with a
second unrelated problem elsewhere never surfaces there even if this exact
disagreement is present on one of its edges. The opposite direction (raw-ink
excuses, skeleton-band does not) violates no invariant at all and was never
counted anywhere. This script measures BOTH directions, per EDGE, full
population, so the true size of the disagreement can be compared against
the ~15-25pp (thousands of plans) conditional-rate shortfall it's a
candidate explanation for.

PRE-REGISTERED PREDICTION (written before running this script, per Dan's
instruction): the "check excuses, assemble does not" direction (under-
recognition) will be substantially larger than "assemble excuses, check
does not" (over-recognition/containment-violation direction) -- the lever
#1 report's own 1500-plan sample found 13/80 (16%) pure-notch rooms hit
under-recognition, a much higher rate than the 13/17,000-PLAN over-
recognition count, and bathroom/bedroom (the two notch-driven required
room types) make up ~70% of the currently-broken population per this
session's co-occurrence measurement. Expect the under-recognition edge
count to land in the low thousands (same order of magnitude as the
currently-broken bathroom/bedroom population) and the over-recognition
edge count to land in the low hundreds at most. If both directions instead
land small (order 10s-100s), the discriminator-disagreement hypothesis
itself is in trouble as an explanation for a shortfall of this size, and
that must be reported as plainly as the co-occurrence hypothesis's own
falsification was.

Method: for each required-room ring edge that at least one of the two
coverage checks (raw wall ink via check_plan's own helpers, skeleton wall
bands via assemble_rooms's own pass-1 logic, REIMPLEMENTED here unchanged --
no changes to rooms.py/measure_clean_at_source.py, same no-pipeline-changes
convention classify_room_boundary_no_wall_match.py already established)
finds "not genuinely wall-backed" (ratio < COVERAGE_THRESHOLD=0.5), apply
the SAME shared notch.py conjunction (OPENING_COVERAGE_THRESHOLD=0.65,
PERPENDICULARITY_COS_THRESHOLD=0.15, NOTCH_LENGTH_MULTIPLE=1.2) to each
side's own ratio/cos_to_neighbor signal independently, producing two
booleans per edge: check_excuses, assemble_excuses. Cross-tabulate.

CLI: python -m extraction.synth.qa.measure_discriminator_disagreement [limit] [workers]
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
from shapely.strtree import STRtree

from extraction.synth.notch import (
    NOTCH_LENGTH_MULTIPLE,
    OPENING_COVERAGE_THRESHOLD,
    PERPENDICULARITY_COS_THRESHOLD,
    _nearest_wall_backed_cos,
    _opening_coverage,
    _opening_coverage_and_match,
)
from extraction.synth.qa.measure_clean_at_source import (
    COVERAGE_THRESHOLD,
    PROXIMITY_MULTIPLIER,
    TOLERANCE,
    _edge_covered,
    _wall_boundary_edges,
)
from extraction.synth.resplan_convert import CLEAN_REQUIRED_ROOM_TYPES
from extraction.synth.rooms import _band
from extraction.synth.skeleton import extract_wall_skeleton, fill_openings_into_wall
from extraction.synth.vendor.resplan_utils import get_geometries, normalize_keys

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"
ASSEMBLE_TOLERANCE = 2.0  # assemble_rooms's own default `tolerance` kwarg


def _skeleton_edge_ratio(a, b, edge_len, dx, dy, segments, bands, tree) -> float:
    """Reimplements assemble_rooms's pass-1 per-edge coverage against
    SKELETON wall bands (rooms.py lines ~391-447), unchanged logic, read-only
    diagnostic copy -- no import from rooms.py's private loop (it's not a
    standalone function there), so re-derived here exactly, same as
    classify_room_boundary_no_wall_match.py's own precedent of reimplementing
    check_plan's loop independently rather than modifying core code."""
    edge_line = LineString([a, b])
    candidates = tree.query(edge_line.buffer(ASSEMBLE_TOLERANCE))
    overlaps = []
    for cand in candidates:
        idx = int(cand)
        seg = segments[idx]
        sx, sy = seg.end[0] - seg.start[0], seg.end[1] - seg.start[1]
        seg_len = (sx * sx + sy * sy) ** 0.5
        if seg_len < 1e-9:
            continue
        cos_angle = abs((dx * sx + dy * sy) / (edge_len * seg_len))
        if cos_angle < 0.9:
            continue
        inter = edge_line.intersection(bands[idx])
        inter_len = inter.length
        if inter_len < min(ASSEMBLE_TOLERANCE, edge_len * 0.03):
            continue
        pts = list(inter.coords) if inter.geom_type == "LineString" else [
            c for g in getattr(inter, "geoms", []) for c in g.coords
        ]
        if not pts:
            continue
        ts = [((px - a[0]) * dx + (py - a[1]) * dy) / (edge_len * edge_len) for px, py in pts]
        overlaps.append((min(ts), max(ts)))
    overlaps.sort()
    covered = sum(min(t1, 1.0) - max(t0, 0.0) for t0, t1 in overlaps if t1 > max(t0, 0.0))
    return covered if edge_len else 0.0  # covered already scaled by edge_len via the t-parametrization


def _analyze_plan(raw_plan: dict) -> list[tuple[bool, bool]]:
    """Returns a (check_excuses, assemble_excuses) tuple for every
    required-room ring edge where at least one side's own coverage check
    finds it not genuinely wall-backed."""
    p = normalize_keys(dict(raw_plan))
    wall_geom = p.get("wall")
    if wall_geom is None or wall_geom.is_empty:
        return []
    wall_depth = float(p.get("wall_depth") or 4.0)
    filled = fill_openings_into_wall(wall_geom, p.get("door"), p.get("window"), p.get("front_door"))

    # raw-ink side (check_plan's own machinery, unchanged)
    ink_proximity = (TOLERANCE + wall_depth / 2) * PROXIMITY_MULTIPLIER
    raw_wall_edges = _wall_boundary_edges(filled)
    raw_tree = STRtree([LineString([wa, wb]) for wa, wb, _ in raw_wall_edges]) if raw_wall_edges else None

    # skeleton-band side (assemble_rooms's own machinery, reimplemented read-only)
    skel = extract_wall_skeleton(filled, wall_depth, thickness_source_geom=wall_geom)
    if not skel.segments:
        return []
    bands = [_band(s, ASSEMBLE_TOLERANCE) for s in skel.segments]
    skel_tree = STRtree(bands)
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
        for poly in get_geometries(g):
            if poly is None or poly.is_empty or poly.geom_type != "Polygon":
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

            for i in range(n):
                rr, sr = raw_ratio[i], skel_ratio[i]
                if rr is None or sr is None:
                    continue
                if rr >= COVERAGE_THRESHOLD and sr >= COVERAGE_THRESHOLD:
                    continue  # both sides agree it's genuinely wall-backed -- not a disagreement candidate
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

                results.append((check_excuses, assemble_excuses))
    return results


def main(limit: int | None = None, workers: int = 6) -> None:
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)
    if limit:
        plans = plans[:limit]
    n_total = len(plans)

    t0 = time.time()
    cell_counts = Counter()
    with ProcessPoolExecutor(max_workers=workers) as ex:
        for i, edges in enumerate(ex.map(_analyze_plan, plans, chunksize=32)):
            for check_excuses, assemble_excuses in edges:
                cell_counts[(check_excuses, assemble_excuses)] += 1
            if (i + 1) % 2000 == 0:
                print(f"  ...{i + 1}/{n_total} ({time.time() - t0:.0f}s)", file=sys.stderr)
    elapsed = time.time() - t0

    total_edges = sum(cell_counts.values())
    print(f"\n{'=' * 70}")
    print(f"N={n_total} plans scanned ({elapsed:.0f}s, {workers} workers)")
    print(f"Total edges considered (not genuinely wall-backed on at least one side): {total_edges}")

    both = cell_counts[(True, True)]
    check_only = cell_counts[(True, False)]
    assemble_only = cell_counts[(False, True)]
    neither = cell_counts[(False, False)]

    print(f"\n2x2 (rows=check_plan raw-ink discriminator, cols=assemble_rooms skeleton-band discriminator):")
    print(f"{'':30s}{'assemble EXCUSES':>20s}{'assemble does NOT':>20s}")
    print(f"{'check EXCUSES':30s}{both:20d}{check_only:20d}")
    print(f"{'check does NOT':30s}{assemble_only:20d}{neither:20d}")

    print(f"\n  both excuse (agree, notch handled cleanly): {both} ({100 * both / total_edges:.1f}%)")
    print(f"  UNDER-recognition (check excuses, assemble does NOT -- leaves plan broken, "
          f"violates no invariant, never counted before): {check_only} ({100 * check_only / total_edges:.1f}%)")
    print(f"  OVER-recognition (assemble excuses, check does NOT -- the containment-invariant "
          f"direction, previously only counted at 13/17,000 PLAN level): {assemble_only} "
          f"({100 * assemble_only / total_edges:.1f}%)")
    print(f"  neither excuses (both agree broken -- genuine defect or shared mechanism): "
          f"{neither} ({100 * neither / total_edges:.1f}%)")

    print(f"\n{'=' * 70}\nPre-registered prediction check:")
    print(f"  predicted: under-recognition >> over-recognition, under-recognition in the low thousands")
    print(f"  actual: under-recognition={check_only}, over-recognition={assemble_only}, "
          f"ratio={check_only / assemble_only if assemble_only else float('inf'):.1f}x")


if __name__ == "__main__":
    lim = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else None
    wk = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] else 6
    main(lim, wk)
