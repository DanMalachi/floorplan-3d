"""Lever #1 diagnose step (2026-07-26 session), READ-ONLY: before writing
any `rooms.py` converter code for doorway-notch handling, size how big a
notch actually is relative to its own room's area. Per
docs/session-notes/p3a-handoff.md, the converter can't just skip a
notch-flagged edge the way `measure_clean_at_source.py::check_plan`
already does for the clean_at_source ceiling — the source room polygon's
own area INCLUDES the notch (ResPlan traces the room boundary through the
door threshold), so a wall_cycle that closes across the notch via
straight wall runs produces a face polygon that is smaller than the
source polygon by exactly the notch's own area. Whether that shortfall
can simply be eaten against the 5% `area_match_tolerance` gate (option B)
or needs the source polygon normalized to match (option C) is an
empirical question this script answers, reported BY ROOM TYPE (never
pooled -- notches cluster on small required rooms, exactly where the
fraction is largest).

Reuses the exact notch discriminator already validated and built into
`check_plan` (opening_coverage >= 0.65, perpendicular to the nearest
wall-backed ring neighbor, edge_len <= 1.2x wall_depth) -- this script
does not re-derive or re-tune it, only adds an AREA computation on top of
the same per-edge classification.

**Grouping is by matched opening polygon, not ring-adjacency of flagged
edges.** `fill_openings_into_wall` typically heals a notch's own crossbar
edge (parallel to the main wall run) back above COVERAGE_THRESHOLD on its
own -- it isn't perpendicular, so it isn't jamb-shaped -- even though the
crossbar sits geometrically BETWEEN the two riser/jamb edges that stay
unbacked and flagged. A naive "consecutive flagged ring index" grouping
would therefore split one real notch into two disconnected single-edge
fragments and silently drop the crossbar out of the pocket shape. Instead,
every notch-flagged edge records WHICH opening polygon produced its best
`opening_coverage` match; edges sharing the same opening are grouped into
one pocket, whose ring-vertex span runs from the group's earliest edge to
its latest edge INCLUSIVE of any interstitial edges (flagged or not).

**Area is signed, not `abs()`.** A notch can only ever be a pocket the
room polygon dips INTO (adding interior area versus a straight-run
reconstruction) -- ResPlan's own room-boundary-through-the-threshold
convention has no mechanism to produce the opposite (the room polygon
biting a piece out of itself at a doorway). If a candidate group's signed
shoelace area (computed with the same winding convention as the parent
ring, not flipped) has the OPPOSITE sign from the parent ring's own
signed area, that is an anomaly, not a normal notch -- it is excluded from
`total_notch_area` and counted separately (`n_outward_anomaly`).

**Recoverability split**: a notch-affected room where every sub-threshold
edge is notch-flagged is fully recoverable by a lever-#1-only fix (area
permitting); a room with at least one sub-threshold edge that does NOT
satisfy the notch conjunction has a second, independent defect and is NOT
recoverable by lever #1 alone. This is nearly free (same ring walk
`check_plan` already does) and sharpens the handoff's pre-registered
52.5%->70-80% prediction for the eventual converter fix.

**Denominator-convention check** (stated once, not re-derived per run):
this script's `fraction = total_notch_area / poly.area` uses the SAME
denominator (source room polygon area) that `rooms.py::assemble_rooms`'s
own area-match gate uses (`area_err = abs(implied_area - poly.area) /
max(poly.area, 1e-9)`, extraction/synth/rooms.py:430) -- confirmed by
reading the gate directly, not assumed.

**Exceedance is reported against the RESIDUAL gate budget, bracketed, not
against the raw 5% gate alone.** The notch fraction does not consume the
whole 5% budget by itself -- it adds to the room's own pre-existing
face-polygon area error, already measured elsewhere in this phase
(`measure_area_error.py`, 150-plan sample, post corner-fix) at median
2.09% / p90 4.79% against the same 5% gate. Three thresholds are reported,
by room type:
  - fraction > 5.00%  (fails even at zero baseline error)
  - fraction > 2.91%  (5% - 2.09% median baseline)
  - fraction > 0.21%  (5% - 4.79% p90 baseline)
The true "would eating the notch alone blow the gate" figure sits between
the second and third columns -- this script cannot assemble the real face
polygon (that requires the full wall_cycle/skeleton machinery this
diagnose step is deliberately staying out of), so it brackets rather than
pretends precision it doesn't have.

Frame for the report this number feeds: option C (normalize the notch out
of the SOURCE room polygon before the area comparison) is viable
essentially by construction regardless of notch size -- both sides of the
gate end up compared on the same convention either way, and the notch-run
polygon this script builds for the area sum IS the same polygon C would
union into the source, so C costs almost nothing extra once this
diagnostic exists. This measurement's real job is deciding whether B
(skip the edge, eat the resulting error, no source-polygon change needed)
is available as a simpler alternative -- not a symmetric B-vs-C fork.

Full 17K population by default (`--limit`/argv[1] for a fast dev pass) --
the per-notch computation is a cheap shoelace calc on top of work
`check_plan` already does at population scale in reasonable time, and
this phase has already hit a sample-vs-population gap four times (see
handoff Rule 2); there is no reason to risk a fifth on this number.
"""
from __future__ import annotations

import pickle
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

import numpy as np
from shapely.geometry import LineString
from shapely.strtree import STRtree

from extraction.synth.qa.measure_clean_at_source import (
    COVERAGE_THRESHOLD,
    NOTCH_LENGTH_MULTIPLE,
    OPENING_COVERAGE_THRESHOLD,
    PERPENDICULARITY_COS_THRESHOLD,
    PROXIMITY_MULTIPLIER,
    TOLERANCE,
    _edge_covered,
    _nearest_wall_backed_cos,
    _wall_boundary_edges,
)
from extraction.synth.resplan_convert import CLEAN_REQUIRED_ROOM_TYPES
from extraction.synth.skeleton import fill_openings_into_wall
from extraction.synth.vendor.resplan_utils import get_geometries, normalize_keys

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"

# Pre-registered residual-budget brackets (see module docstring): the 5%
# area_match_tolerance gate minus this phase's already-measured baseline
# face-polygon area error (measure_area_error.py, post corner-fix).
AREA_MATCH_TOLERANCE = 0.05
BASELINE_MEDIAN_ERR = 0.0209
BASELINE_P90_ERR = 0.0479
EXCEEDANCE_THRESHOLDS = {
    "vs_zero_baseline (>5.00%)": AREA_MATCH_TOLERANCE,
    "vs_median_baseline (>2.91%)": AREA_MATCH_TOLERANCE - BASELINE_MEDIAN_ERR,
    "vs_p90_baseline (>0.21%)": AREA_MATCH_TOLERANCE - BASELINE_P90_ERR,
}


def _opening_coverage_and_match(a, b, edge_len, dx, dy, opening_polys, wall_depth):
    """Same projection technique as measure_clean_at_source.py's
    _opening_coverage, but also returns WHICH opening (by stable (type,
    index) key, not Python object identity -- shapely's MultiPolygon.geoms
    is not guaranteed to hand back the same object across repeated
    accesses) produced the best coverage, so notch-flagged edges sharing
    a door/window/front_door instance can be grouped into one pocket."""
    edge_band = LineString([a, b]).buffer(TOLERANCE + wall_depth / 2)
    best = 0.0
    best_key = None
    for key, part in opening_polys:
        inter = part.intersection(edge_band)
        if inter.is_empty or inter.geom_type != "Polygon":
            continue
        pts = list(inter.exterior.coords)
        ts = [((px - a[0]) * dx + (py - a[1]) * dy) / (edge_len * edge_len) for px, py in pts]
        t0, t1 = max(min(ts), 0.0), min(max(ts), 1.0)
        if t1 > t0 and (t1 - t0) > best:
            best = t1 - t0
            best_key = key
    return best, best_key


def _signed_area(pts: list[tuple[float, float]]) -> float:
    """Shoelace signed area of the closed loop pts[0]->pts[1]->...->pts[-1]
    ->pts[0] (pts given WITHOUT a repeated closing point -- closure is
    implicit via the modulo index). Sign follows the winding direction of
    pts itself, so comparing signs between two calls is only meaningful
    when both loops are traversed in a consistent (ring-inherited) order,
    which is how this script always calls it."""
    n = len(pts)
    s = 0.0
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        s += x1 * y2 - x2 * y1
    return s / 2.0


# A same-opening match does NOT by itself guarantee two notch-flagged
# edges belong to the same physical pocket -- population-scale running
# surfaced plan 64 (bedroom_1, 16-edge ring): edges 0/2 and 8/10 (two
# real, physically UNRELATED notches on opposite sides of the room) both
# best-matched the same door polygon, and grouping by key alone merged
# them into one "pocket" spanning half the ring (fraction=100.51%, an
# impossible number caught precisely because Rule 1 treats every
# newly-derived figure as provisional until corroborated). A real pocket
# (jamb-crossbar-jamb, or the validated 12017 zigzag's up to ~4 short
# edges) never spans more than a handful of ring edges -- this cap is
# deliberately generous relative to that (validated zigzag gap is 2) while
# excluding plan 64's gap of 6 (exactly half its 16-edge ring).
MAX_NOTCH_SPAN_EDGES = 4


def _cluster_ring_indices(indices: list[int], n: int, max_gap: int = MAX_NOTCH_SPAN_EDGES) -> list[list[int]]:
    """Splits a same-opening-key index set into circularly-local clusters,
    breaking wherever the circular gap between consecutive (sorted)
    indices exceeds max_gap. Each returned cluster is safe to hand to
    _circular_span on its own (guaranteed locally close, not just "closer
    than the single largest gap in the whole set")."""
    s = sorted(set(indices))
    if len(s) <= 1:
        return [s]
    gaps = [((s[(k + 1) % len(s)] - s[k]) % n, k) for k in range(len(s))]
    break_ks = {k for gap, k in gaps if gap > max_gap}
    if not break_ks:
        return [s]
    clusters: list[list[int]] = []
    cur = [s[0]]
    for k in range(len(s) - 1):
        if k in break_ks:
            clusters.append(cur)
            cur = []
        cur.append(s[k + 1])
    clusters.append(cur)
    # The break between the LAST and FIRST element (circular wraparound)
    # was already accounted for via break_ks over k in range(len(s)) above
    # only for k < len(s)-1; if index len(s)-1 (the wrap gap) also broke,
    # the first and last clusters are actually separate (already true by
    # construction since we never merge across it) -- otherwise merge the
    # wraparound pair back into one cluster.
    if len(clusters) > 1 and (len(s) - 1) not in break_ks:
        clusters[0] = clusters[-1] + clusters[0]
        clusters.pop()
    return clusters


def _circular_span(indices: list[int], n: int) -> tuple[int, int]:
    """The smallest contiguous circular arc [start, end] (ring-edge
    indices, inclusive) covering every index in `indices`. Picks the
    largest circular gap between consecutive (sorted) indices as the arc's
    break point. Callers must pre-cluster via _cluster_ring_indices first
    if `indices` might span multiple unrelated pockets sharing one
    opening key -- this function alone cannot tell "one notch with a wide
    interstitial gap" apart from "two unrelated notches," it just closes
    whatever indices it's given."""
    s = sorted(set(indices))
    if len(s) == 1:
        return s[0], s[0]
    gaps = []
    for k in range(len(s)):
        cur, nxt = s[k], s[(k + 1) % len(s)]
        gap = (nxt - cur) % n
        gaps.append((gap, k))
    gaps.sort(reverse=True)
    _, k = gaps[0]
    start = s[(k + 1) % len(s)]
    end = s[k]
    return start, end


def analyze_room(poly, wall_edges, tree, ink_proximity, opening_polys, wall_depth) -> dict | None:
    """Returns None if the room can't be analyzed at all (no wall edges to
    check against). Otherwise a dict with total_notch_area, fraction,
    n_notch_runs, n_outward_anomaly, n_degenerate, other_broken (a
    non-notch sub-threshold edge exists -- a second, independent defect)."""
    if tree is None:
        return None
    coords = list(poly.exterior.coords)
    verts = coords[:-1]
    n = len(verts)
    if n < 3:
        return None

    ring_edges: list[tuple[tuple[float, float], tuple[float, float], float]] = []
    backed_ratio: list[float | None] = [None] * n
    for i in range(n):
        a, b = verts[i], verts[(i + 1) % n]
        dx, dy = b[0] - a[0], b[1] - a[1]
        edge_len = (dx * dx + dy * dy) ** 0.5
        ring_edges.append((a, b, edge_len))
        if edge_len < TOLERANCE:
            continue
        backed_ratio[i] = _edge_covered(a, b, edge_len, wall_edges, tree, ink_proximity)

    notch_group_key: dict[int, tuple] = {}
    other_broken = False
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
        else:
            other_broken = True

    if not notch_group_key:
        return dict(
            total_notch_area=0.0, room_area=poly.area, fraction=0.0, n_notch_runs=0,
            n_outward_anomaly=0, n_degenerate=0, other_broken=other_broken,
        )

    groups: dict[tuple, list[int]] = {}
    for i, key in notch_group_key.items():
        groups.setdefault(key, []).append(i)

    # A shared opening key is necessary but not sufficient for "same
    # pocket" -- cluster each key-group by ring proximity first (see
    # _cluster_ring_indices's docstring: plan 64 had two unrelated
    # opposite-side notches both best-matching one door).
    clustered_groups: list[list[int]] = []
    for edge_indices in groups.values():
        clustered_groups.extend(_cluster_ring_indices(edge_indices, n))

    parent_signed = _signed_area(verts)
    total_notch_area = 0.0
    n_notch_runs = 0
    n_outward_anomaly = 0
    n_degenerate = 0
    for edge_indices in clustered_groups:
        start, end = _circular_span(edge_indices, n)
        num_edges = (end - start) % n + 1
        if num_edges >= n - 1:
            n_degenerate += 1
            continue
        vertex_idxs = [(start + k) % n for k in range(num_edges + 1)]
        pocket_pts = [verts[j] for j in vertex_idxs]
        pocket_signed = _signed_area(pocket_pts)
        if pocket_signed == 0.0:
            n_degenerate += 1
            continue
        if (pocket_signed > 0) == (parent_signed > 0):
            total_notch_area += abs(pocket_signed)
            n_notch_runs += 1
        else:
            n_outward_anomaly += 1

    fraction = total_notch_area / poly.area if poly.area > 0 else 0.0
    return dict(
        total_notch_area=total_notch_area, room_area=poly.area, fraction=fraction,
        n_notch_runs=n_notch_runs, n_outward_anomaly=n_outward_anomaly,
        n_degenerate=n_degenerate, other_broken=other_broken,
    )


def check_plan(raw_plan: dict) -> list[dict]:
    """Returns one record per notch-affected required-room instance
    (n_notch_runs >= 1), each tagged with room_type/resplan_id/instance_idx.
    Rooms with zero notch runs are not recorded (they don't inform the
    by-room-type notch-size distribution this script exists to produce)."""
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

    opening_polys = [
        ((ot, idx), part)
        for ot in ("door", "window", "front_door")
        for idx, part in enumerate(get_geometries(p.get(ot)))
    ]

    records: list[dict] = []
    for rt in CLEAN_REQUIRED_ROOM_TYPES:
        g = p.get(rt)
        if g is None:
            continue
        for inst_idx, poly in enumerate(get_geometries(g)):
            if poly is None or poly.is_empty or poly.geom_type != "Polygon" or not poly.is_valid or poly.area <= 0:
                continue
            result = analyze_room(poly, wall_edges, tree, ink_proximity, opening_polys, wall_depth)
            if result is None or result["n_notch_runs"] < 1:
                continue
            result.update(resplan_id=raw_plan.get("id"), room_type=rt, instance_idx=inst_idx)
            records.append(result)
    return records


def main(limit: int | None = None) -> None:
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)
    if limit:
        plans = plans[:limit]

    n_total = len(plans)
    by_room_type: dict[str, list[dict]] = {rt: [] for rt in CLEAN_REQUIRED_ROOM_TYPES}
    n_outward_anomaly_total = 0
    n_degenerate_total = 0

    t0 = time.time()
    for i, raw_plan in enumerate(plans):
        for rec in check_plan(raw_plan):
            by_room_type[rec["room_type"]].append(rec)
            n_outward_anomaly_total += rec["n_outward_anomaly"]
            n_degenerate_total += rec["n_degenerate"]
        if (i + 1) % 2000 == 0:
            elapsed = time.time() - t0
            print(f"  ...{i + 1}/{n_total} ({elapsed:.0f}s elapsed, {elapsed / (i + 1) * n_total:.0f}s projected total)", file=sys.stderr)

    elapsed = time.time() - t0
    print(f"\nN={n_total} plans scanned ({elapsed:.0f}s)")
    print(f"n_outward_anomaly (total, excluded from area sums): {n_outward_anomaly_total}")
    print(f"n_degenerate (total, span >= n-1 edges or zero-area, excluded): {n_degenerate_total}\n")

    for rt in sorted(CLEAN_REQUIRED_ROOM_TYPES):
        recs = by_room_type[rt]
        n_affected = len(recs)
        print(f"=== {rt} === notch-affected rooms: {n_affected}")
        if n_affected == 0:
            continue
        fractions = np.array([r["fraction"] for r in recs])
        print(f"  fraction of room area: median={100 * np.median(fractions):.2f}%  "
              f"p90={100 * np.percentile(fractions, 90):.2f}%  max={100 * np.max(fractions):.2f}%")
        for label, threshold in EXCEEDANCE_THRESHOLDS.items():
            n_exceed = int((fractions > threshold).sum())
            print(f"  exceeds {label}: {n_exceed}/{n_affected} ({100 * n_exceed / n_affected:.1f}%)")
        n_notch_only = sum(1 for r in recs if not r["other_broken"])
        n_notch_plus_other = n_affected - n_notch_only
        print(f"  recoverability: notch_only={n_notch_only}/{n_affected} "
              f"({100 * n_notch_only / n_affected:.1f}%)  "
              f"notch_plus_other={n_notch_plus_other}/{n_affected} "
              f"({100 * n_notch_plus_other / n_affected:.1f}%)")
        print()


if __name__ == "__main__":
    lim = int(sys.argv[1]) if len(sys.argv) > 1 else None
    main(lim)
