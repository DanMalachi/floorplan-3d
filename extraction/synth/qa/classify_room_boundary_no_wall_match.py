"""Diagnosis-only, EXPLORATORY pass (step 1 of the decomposition): dump raw
signals for every room_boundary_no_wall_match edge in a 25-30 plan sample,
without committing to a bucketing rule yet. Read the printed table before
trusting any taxonomy — this mirrors the discipline of
verify_no_angle_valid_candidate.py's n=3 spot-check before
classify_no_angle_valid_candidate_population.py's full pass: look at real
numbers first, then decide thresholds.

No changes to rooms.py/skeleton.py/measure_clean_at_source.py. Reuses
measure_clean_at_source's wall-ink-edge extraction (imported, not
duplicated) so the flagged edge SET reproduces exactly, but does NOT reuse
its `_edge_covered` for anything beyond reproducing the original flag —
that function has an unclamped-overlap bug (see below), confirmed on real
data (plan 3733, bedroom_1, edge 30): candidate wall-ink edges whose
projected parametric range falls entirely outside the edge's own [0,1]
span (e.g. t=[-5.12,-3.12], genuinely zero overlap) still contribute
`min(t1,1.0) - max(t0,0.0)` = -3.12 to the coverage sum, because the
formula never floors a per-candidate contribution at 0 before summing.
This is a MEASUREMENT bug, not a source-data defect — it fires whenever a
short required-room edge (bathroom/storage edges are frequently 2-5 units)
sits within the proximity band of OTHER, unrelated wall ink nearby (common
in dense clusters of small rooms), producing coverage ratios that go
strongly negative rather than 0, which happens to still correctly clear
`< COVERAGE_THRESHOLD` for genuinely-broken edges but ALSO silently
suppresses a real candidate's positive contribution when it's summed
alongside a spurious negative one — undercounting real coverage for edges
that do have a genuine matching wall. `_edge_covered_clamped` below fixes
this locally (diagnosis-only reimplementation, per this module's own
no-pipeline-changes rule) to get a trustworthy signal for classification.
"""
from __future__ import annotations

import pickle
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

import matplotlib.pyplot as plt
from shapely.geometry import LineString, Point
from shapely.ops import unary_union
from shapely.strtree import STRtree

from extraction.synth.qa.measure_clean_at_source import (
    COVERAGE_THRESHOLD,
    PROXIMITY_MULTIPLIER,
    TOLERANCE,
    _edge_covered,
    _wall_boundary_edges,
)
from extraction.synth.resplan_convert import CLEAN_REQUIRED_ROOM_TYPES, OPEN_PLAN_ROOM_TYPES
from extraction.synth.skeleton import fill_openings_into_wall
from extraction.synth.vendor.resplan_utils import get_geometries, normalize_keys


def _edge_covered_clamped(a, b, edge_len, wall_edges, tree, ink_proximity) -> float:
    """Same candidate search as measure_clean_at_source._edge_covered, but
    each candidate's contribution is clamped to its actual overlap with the
    edge's own [0,1] parametric range before summing — fixes the unclamped-
    negative-contribution bug documented in this module's docstring."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    edge_line = LineString([a, b])
    candidates = tree.query(edge_line.buffer(ink_proximity))
    overlaps = []
    for c in candidates:
        idx = int(c)
        wa, wb, wlen = wall_edges[idx]
        wdx, wdy = wb[0] - wa[0], wb[1] - wa[1]
        cos_a = abs((dx * wdx + dy * wdy) / (edge_len * wlen))
        if cos_a < 0.9:
            continue
        if edge_line.distance(LineString([wa, wb])) > ink_proximity:
            continue
        ts = [((px - a[0]) * dx + (py - a[1]) * dy) / (edge_len * edge_len) for px, py in (wa, wb)]
        t0, t1 = min(ts), max(ts)
        clipped_t0, clipped_t1 = max(t0, 0.0), min(t1, 1.0)
        if clipped_t1 > clipped_t0:
            overlaps.append((clipped_t0, clipped_t1))
    overlaps.sort()
    merged = []
    for t0, t1 in overlaps:
        if merged and t0 <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], t1))
        else:
            merged.append((t0, t1))
    covered = sum(t1 - t0 for t0, t1 in merged) * edge_len
    return covered / edge_len if edge_len else 0.0

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"
REPORTS_DIR = Path(__file__).resolve().parents[1] / "reports"  # extraction/synth/reports/
TARGET_N = 27
SCAN_LIMIT = 1500

ALL_TRACED_ROOM_TYPES = sorted(CLEAN_REQUIRED_ROOM_TYPES | OPEN_PLAN_ROOM_TYPES)
SITE_FEATURE_TYPES = ["garden", "pool", "parking", "land"]
EXTERIOR_TOLERANCE = 3.0  # matches rooms.py::wall_roles's external_tolerance


def find_sample(plans, target_n, scan_limit):
    """Deterministic scan for plans whose measure_clean_at_source check
    flags room_boundary_no_wall_match on a required room."""
    from extraction.synth.qa.measure_clean_at_source import check_plan

    sample = []
    for p in plans[:scan_limit]:
        result = check_plan(p)
        if any(f.startswith("room_boundary_no_wall_match:") for f in result["flags"]):
            sample.append(p)
            if len(sample) >= target_n:
                break
    return sample


def _exterior_boundary(inner_geom):
    inner_parts = get_geometries(inner_geom)
    boundaries = [p.exterior for p in inner_parts if p.geom_type == "Polygon"]
    if not boundaries:
        return None
    return unary_union(boundaries).buffer(EXTERIOR_TOLERANCE)


def _room_polys(p, exclude_type, exclude_idx):
    """(room_type, inst_idx, polygon) for every traced room instance except
    the one under test."""
    out = []
    for rt in ALL_TRACED_ROOM_TYPES:
        g = p.get(rt)
        if g is None:
            continue
        for idx, poly in enumerate(get_geometries(g)):
            if poly is None or poly.is_empty or poly.geom_type != "Polygon":
                continue
            if rt == exclude_type and idx == exclude_idx:
                continue
            out.append((rt, idx, poly))
    return out


def _inner_union(p):
    inner_parts = get_geometries(p.get("inner"))
    polys = [g for g in inner_parts if g.geom_type == "Polygon"]
    if not polys:
        return None
    return unary_union(polys)


def analyze_edge(p, room_type, inst_idx, edge_index, a, b, wall_geom, filled_wall_geom, wall_depth, wall_edges, tree, inner_union):
    dx, dy = b[0] - a[0], b[1] - a[1]
    edge_len = (dx * dx + dy * dy) ** 0.5
    edge_line = LineString([a, b])
    mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)

    narrow_prox = (TOLERANCE + wall_depth / 2) * PROXIMITY_MULTIPLIER
    wide_prox = (TOLERANCE + wall_depth) * PROXIMITY_MULTIPLIER  # test "offset a full thickness, not half" hypothesis

    # original (buggy, unclamped) ratio — what actually produced the flag —
    # kept separately from the corrected ratio to detect false positives.
    ink_ratio_narrow_orig = _edge_covered(a, b, edge_len, wall_edges, tree, narrow_prox)
    ink_ratio_narrow = _edge_covered_clamped(a, b, edge_len, wall_edges, tree, narrow_prox)
    ink_ratio_wide = _edge_covered_clamped(a, b, edge_len, wall_edges, tree, wide_prox)

    # exterior check, same technique as rooms.py::wall_roles
    ext_boundary = _exterior_boundary(p.get("inner"))
    on_exterior = ext_boundary is not None and ext_boundary.contains_properly(Point(mid))

    # outward-normal probe: which side is NOT the room's own interior?
    nx_, ny_ = -dy / edge_len if edge_len else 0.0, dx / edge_len if edge_len else 0.0
    probe_dist = TOLERANCE + wall_depth
    room_poly = get_geometries(p.get(room_type))[inst_idx]
    cand_a = Point(mid[0] + nx_ * probe_dist, mid[1] + ny_ * probe_dist)
    cand_b = Point(mid[0] - nx_ * probe_dist, mid[1] - ny_ * probe_dist)
    outward = cand_a if not room_poly.contains(cand_a) else cand_b
    if room_poly.contains(outward):
        outward = None  # degenerate (concave/self-overlap edge) — flag, don't guess

    neighbor_room = None
    neighbor_site = None
    outward_inside_inner = None
    if outward is not None:
        outward_inside_inner = inner_union is not None and inner_union.contains(outward)
        for rt, idx, poly in _room_polys(p, room_type, inst_idx):
            if poly.contains(outward):
                neighbor_room = f"{rt}_{idx}"
                break
        # 'land' (and garden/pool/parking) commonly CONTAIN the entire
        # building footprint (verified: plan 704238, land.contains(inner)
        # with 100% area overlap) — checking "point in land" alone is
        # meaningless for interior points. Only trust a site-feature hit
        # when the probe is ALSO outside the building envelope; otherwise
        # an interior probe that hit no traced room is an untraced-room/
        # void signal, not exterior, regardless of what land says.
        if neighbor_room is None and not outward_inside_inner:
            for st in SITE_FEATURE_TYPES:
                g = p.get(st)
                if g is None:
                    continue
                for part in get_geometries(g):
                    if part.contains(outward):
                        neighbor_site = st
                        break
                if neighbor_site:
                    break

    # Opening COVERAGE (not a boolean "is a door anywhere nearby" — that
    # false-triggered on small rooms, e.g. a bathroom ~3-4 units across
    # where narrow_prox comfortably reaches a door on the OPPOSITE wall).
    # Projects each opening polygon's intersection with a thin band along
    # the edge onto the edge's own [0,1] parametric range, same technique
    # as _edge_covered_clamped — tells us what fraction of THIS edge is
    # actually spanned by a door/window/front_door footprint, independent
    # of the wall-union's own geometry.
    opening_hit = None
    opening_coverage = 0.0
    edge_band = edge_line.buffer(TOLERANCE + wall_depth / 2)
    for ot in ("door", "window", "front_door"):
        g = p.get(ot)
        if g is None:
            continue
        for part in get_geometries(g):
            inter = part.intersection(edge_band)
            if inter.is_empty:
                continue
            pts = list(inter.exterior.coords) if inter.geom_type == "Polygon" else []
            if not pts:
                continue
            ts = [((px - a[0]) * dx + (py - a[1]) * dy) / (edge_len * edge_len) for px, py in pts]
            t0, t1 = max(min(ts), 0.0), min(max(ts), 1.0)
            if t1 > t0:
                cov = t1 - t0
                if cov > opening_coverage:
                    opening_coverage = cov
                    opening_hit = ot

    return dict(
        room=f"{room_type}_{inst_idx}",
        edge_index=edge_index,
        edge_len=round(edge_len, 2),
        ink_ratio_narrow_orig=round(ink_ratio_narrow_orig, 3),
        ink_ratio_narrow=round(ink_ratio_narrow, 3),
        ink_ratio_wide=round(ink_ratio_wide, 3),
        on_exterior=on_exterior,
        outward_probe_degenerate=outward is None,
        outward_inside_inner=outward_inside_inner,
        neighbor_room=neighbor_room,
        neighbor_site=neighbor_site,
        opening_hit=opening_hit,
        opening_coverage=round(opening_coverage, 3),
        wall_depth=round(wall_depth, 2),
    )


def _cos_to_nearest_backed_neighbor(edge_index, ring_edges, backed_ratio, ux, uy):
    """Own implementation (independent of measure_clean_at_source's
    _nearest_wall_backed_cos -- not imported/aliased, per the 2026-07-22
    resolution session's explicit instruction to keep classify()'s notch
    signal computation separate from check_plan's): cos(angle) between this
    edge's own unit direction and the nearest ring neighbor (searching
    outward in both directions) that IS wall-backed (backed_ratio >=
    COVERAGE_THRESHOLD). Returns None if no wall-backed edge exists
    anywhere in the ring."""
    n = len(ring_edges)
    for offset in range(1, n):
        for sign in (-1, 1):
            cand = (edge_index + sign * offset) % n
            if backed_ratio[cand] is not None and backed_ratio[cand] >= COVERAGE_THRESHOLD:
                wa, wb, wlen = ring_edges[cand]
                if wlen:
                    wdx, wdy = wb[0] - wa[0], wb[1] - wa[1]
                    return abs(ux * (wdx / wlen) + uy * (wdy / wlen))
                return None
    return None


def analyze_plan(raw_plan):
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
            # Build the full ring's wall-backed status up front (not just
            # for edges that turn out broken) -- the perpendicularity signal
            # below needs to look up ANY other edge's backed status,
            # including ones later in the ring than the edge currently
            # under evaluation. Same two-pass shape as check_plan's own
            # loop, independently re-coded here.
            ring_edges = []
            backed_ratio = [None] * n
            for i in range(n):
                a, b = coords[i], coords[i + 1]
                dx, dy = b[0] - a[0], b[1] - a[1]
                edge_len = (dx * dx + dy * dy) ** 0.5
                ring_edges.append((a, b, edge_len))
                if edge_len < TOLERANCE:
                    continue
                backed_ratio[i] = 0.0 if tree is None else _edge_covered(a, b, edge_len, wall_edges, tree, narrow_prox)

            for i in range(n):
                ratio = backed_ratio[i]
                if ratio is None or ratio >= COVERAGE_THRESHOLD:
                    continue
                a, b, edge_len = ring_edges[i]
                r = analyze_edge(p, rt, inst_idx, i, a, b, wall_geom, filled_wall_geom, wall_depth, wall_edges, tree, inner_union)
                dx, dy = b[0] - a[0], b[1] - a[1]
                ux, uy = (dx / edge_len, dy / edge_len) if edge_len else (0.0, 0.0)
                r["cos_to_nearest_backed_neighbor"] = _cos_to_nearest_backed_neighbor(
                    i, ring_edges, backed_ratio, ux, uy)
                r["resplan_id"] = raw_plan.get("id")
                results.append(r)
    return results


# Notch branch, corrected 2026-07-22 per reports/p3a-notch-resolution.md's
# exhaustive 8-edge audit (every a_genuine_gt_defect_between_rooms edge
# with opening_coverage >= 0.65 across the full 17K population -- the only
# band where a single-condition >=0.8 cutoff could ever disagree with a
# real notch). opening_coverage ALONE does not separate notches from
# non-notches in that band: audited notches measured 0.681-0.749, audited
# non-notches measured 0.702-0.794 -- overlapping ranges. Perpendicularity
# to the nearest wall-backed ring neighbor is what actually separates them
# (audited notches: cos<=0.004; audited non-notches: cos>=0.644, a wide,
# clean gap in this sample), with jamb-length-vs-wall-depth as a third,
# corroborating signal (audited notches: ratio in [0.943,1.354]; audited
# non-notches: ratio in [1.658,5.749]). Own thresholds below are chosen
# from THIS audit's own gaps, independently of check_plan's suppression
# predicate (measure_clean_at_source.py) -- not copied from it, and
# computed via a separate, locally re-implemented perpendicularity helper
# (_cos_to_nearest_backed_neighbor above) rather than importing check_plan's
# _nearest_wall_backed_cos. classify() is a labeling oracle, not an
# operational suppression rule, so it is free to be MORE permissive in
# recognizing notches than check_plan needs to be conservative -- e.g. the
# jamb-length threshold here (1.5x) is looser than check_plan's (1.2x),
# because the audit surfaced one genuine notch (plan 11587) that
# check_plan's own tighter bound leaves unsuppressed (a known, accepted,
# conservative recall gap in the OPERATIONAL rule, not something this
# labeling fix should paper over by copying that same tightness into the
# oracle).
OPENING_COVERAGE_THRESHOLD = 0.65  # floor only -- see NOTCH_* below for the full conjunction
NOTCH_PERPENDICULARITY_COS_CEILING = 0.2
NOTCH_JAMB_LENGTH_MULTIPLE = 1.5
SMALL_EDGE_WALL_DEPTH_MULTIPLE = 1.5


def classify(e):
    """Final decision tree, applied only to edges that are STILL broken
    after the arithmetic-bug correction (ink_ratio_narrow < 0.5). Order
    matters — each branch is checked only once the prior ones are ruled
    out, most-confirmed-mechanism first:

    1. measurement_bug_false_positive — handled by the caller before this
       function is ever called (ink_ratio_narrow >= threshold already).
    2. e_opening_doorway_notch — CORRECTED 2026-07-22 (was a single
       opening_coverage>=0.8 condition; see comment above the constants for
       the audit that justified the 3-condition replacement): the room
       polygon steps into a wall_depth-deep notch tracing a door/window
       reveal, not a real wall-line edge at all — CONFIRMED on plans
       7607/9206/3807/10171 (original discovery) and 5683/11576/11587 (this
       session's audit). No further wall-side union step would fix this;
       it needs an edge-classification change (skip edges captured by a
       door polygon), which is fix work, correctly out of scope here.
    3. c_exterior_boundary_or_void — outward probe lands OUTSIDE the
       'inner' building envelope: exterior wall gap, balcony/rail
       frontage, or genuine void beyond the traced footprint.
    4. b_shared_wall_wide_recoverable — outward probe lands inside another
       TRACED room polygon, and widening the search band (half-thickness
       to full-thickness scaled) recovers >=0.5 coverage: real wall ink
       exists, just authored asymmetrically toward the neighbor's side,
       beyond the narrow band's reach.
    5. a_genuine_gt_defect_between_rooms — outward probe lands inside a
       traced room polygon, but even the widened band finds nothing: a
       real partition the source omits.
    6. d_tracing_artifact_small_notch — probe finds no traced room, no
       site feature (i.e. genuinely interior, hits an untraced-room-type
       area or self-overlap), AND the edge is small (<= 1.5x wall_depth,
       notch/artifact scale) — matches the already-documented plan-881
       class from the skeleton-level diagnosis.
    7. f_unexplained_interior_gap — same as 6 but NOT small: a real,
       sizeable interior edge with no identified neighbor of any kind.
       Reported separately rather than forced into 5 or 6 — the taxonomy
       is not assumed closed.
    8. unresolved_degenerate_probe — the outward-normal probe itself was
       degenerate (edge on a concave/self-overlapping part of the
       polygon) — footnoted, not classified.
    """
    if e["outward_probe_degenerate"]:
        return "unresolved_degenerate_probe"
    cos_n = e.get("cos_to_nearest_backed_neighbor")
    if (e["opening_coverage"] >= OPENING_COVERAGE_THRESHOLD
            and cos_n is not None
            and cos_n <= NOTCH_PERPENDICULARITY_COS_CEILING
            and e["edge_len"] <= NOTCH_JAMB_LENGTH_MULTIPLE * e["wall_depth"]):
        return "e_opening_doorway_notch"
    if not e["outward_inside_inner"]:
        return "c_exterior_boundary_or_void"
    if e["neighbor_room"] is not None:
        if e["ink_ratio_wide"] >= COVERAGE_THRESHOLD:
            return "b_shared_wall_wide_recoverable"
        return "a_genuine_gt_defect_between_rooms"
    if e["edge_len"] <= SMALL_EDGE_WALL_DEPTH_MULTIPLE * e["wall_depth"]:
        return "d_tracing_artifact_small_notch"
    return "f_unexplained_interior_gap"


def compute_conditional_clean_rate(n=300):
    """Direct intersection measurement (not dividing two independently-
    measured percentages): among the SAME n plans, what fraction are both
    clean_at_source (measure_clean_at_source.check_plan) AND
    converter-clean (resplan_convert.convert_plan's own `clean` flag)?
    Matches the n=300 sample size the existing 45.0% plan-level clean rate
    was measured on (docs/session-notes/p3a-handoff.md), for an
    apples-to-apples comparison."""
    from extraction.synth.qa.measure_clean_at_source import check_plan
    from extraction.synth.resplan_convert import convert_plan

    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)[:n]

    n_clean_at_source = 0
    n_converter_clean = 0
    n_both = 0
    for p in plans:
        src_clean = check_plan(p)["clean_at_source"]
        _, stats = convert_plan(p)
        conv_clean = bool(stats.get("clean"))
        if src_clean:
            n_clean_at_source += 1
        if conv_clean:
            n_converter_clean += 1
        if src_clean and conv_clean:
            n_both += 1

    print(f"\n{'=' * 70}\nConditional converter clean rate (n={n}, direct intersection):")
    print(f"  clean_at_source: {n_clean_at_source}/{n} ({100 * n_clean_at_source / n:.1f}%)")
    print(f"  converter_clean (all-plans rate): {n_converter_clean}/{n} ({100 * n_converter_clean / n:.1f}%)")
    print(f"  converter_clean AND clean_at_source: {n_both}/{n} ({100 * n_both / n:.1f}% of all plans)")
    if n_clean_at_source:
        print(f"  converter_clean | clean_at_source: {n_both}/{n_clean_at_source} "
              f"({100 * n_both / n_clean_at_source:.1f}%) <- the number the task asked for")


def plot_instance(raw_plan, room_type, inst_idx, edge_index, category, out_path):
    """Source-level overlay (no skeleton — raw wall ink, filled wall,
    inner envelope, all traced room polygons, door/window ink), matching
    verify_no_angle_valid_candidate.py's plotting convention."""
    p = normalize_keys(dict(raw_plan))
    wall_geom = p.get("wall")
    wall_depth = float(p.get("wall_depth") or 4.0)
    filled = fill_openings_into_wall(wall_geom, p.get("door"), p.get("window"), p.get("front_door"))
    poly = get_geometries(p.get(room_type))[inst_idx]
    coords = list(poly.exterior.coords)
    a, b = coords[edge_index], coords[edge_index + 1]
    mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    edge_len = ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5
    zoom = max(edge_len, 8.0) * 4

    fig, ax = plt.subplots(figsize=(9, 9))
    for part in get_geometries(filled):
        xs, ys = part.exterior.xy
        ax.fill(xs, ys, color="#ffd92f", alpha=0.35, edgecolor="#b8960a", linewidth=0.5, label="_nolegend_")
    for part in get_geometries(wall_geom):
        xs, ys = part.exterior.xy
        ax.plot(xs, ys, color="#b8960a", linewidth=0.8, alpha=0.6, label="_nolegend_")
    inner_u = _inner_union(p)
    if inner_u is not None:
        for part in get_geometries(inner_u):
            xs, ys = part.exterior.xy
            ax.plot(xs, ys, color="black", linewidth=1.0, linestyle=":", alpha=0.7, label="inner envelope")
    for rt in ALL_TRACED_ROOM_TYPES:
        g = p.get(rt)
        if g is None:
            continue
        for idx, rp in enumerate(get_geometries(g)):
            if rp.geom_type != "Polygon":
                continue
            rxs, rys = rp.exterior.xy
            style = dict(color="blue", linewidth=2.2) if (rt == room_type and idx == inst_idx) else dict(color="gray", linewidth=0.7, alpha=0.6)
            ax.plot(rxs, rys, **style, label="_nolegend_")
    for ot, color in (("door", "#e78ac3"), ("window", "#a6d854"), ("front_door", "#a63603")):
        g = p.get(ot)
        if g is None:
            continue
        for part in get_geometries(g):
            xs, ys = part.exterior.xy
            ax.fill(xs, ys, color=color, alpha=0.5, edgecolor=color, linewidth=0.5, label="_nolegend_")

    ax.plot([a[0], b[0]], [a[1], b[1]], color="lime", linewidth=3.5, alpha=0.9, label="failing edge")
    ax.plot(mid[0], mid[1], "o", color="black", markersize=6)

    ax.set_xlim(mid[0] - zoom, mid[0] + zoom)
    ax.set_ylim(mid[1] - zoom, mid[1] + zoom)
    ax.set_aspect("equal")
    ax.set_title(
        f"plan={raw_plan.get('id')} room={room_type}_{inst_idx} edge={edge_index}\n"
        f"category={category} edge_len={edge_len:.2f} wall_depth={wall_depth:.2f}",
        fontsize=9,
    )
    ax.legend(loc="upper right", fontsize=7)
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)


EXEMPLARS = [
    # (plan_id, room_type, inst_idx, edge_index) — 2-3 per major category
    (9206, "bathroom", 0, 3, "e_opening_doorway_notch"),
    (7607, "bathroom", 0, 2, "e_opening_doorway_notch"),
    (3807, "bathroom", 0, 0, "e_opening_doorway_notch"),
    (1448, "stair", 0, 9, "c_exterior_boundary_or_void"),
    (15895, "stair", 0, 3, "c_exterior_boundary_or_void"),
    (9206, "stair", 0, 6, "c_exterior_boundary_or_void"),
    (3467, "storage", 0, 0, "a_genuine_gt_defect_between_rooms"),
    (10585, "storage", 0, 0, "a_genuine_gt_defect_between_rooms"),
    (9206, "storage", 0, 1, "a_genuine_gt_defect_between_rooms"),
    (9796, "stair", 0, 0, "b_shared_wall_wide_recoverable"),
    (634, "storage", 0, 2, "b_shared_wall_wide_recoverable"),
    (704238, "bedroom", 0, 0, "d_tracing_artifact_small_notch"),
    (881, "bathroom", 0, 0, "d_tracing_artifact_small_notch"),
    (2642, "bathroom", 0, 5, "d_tracing_artifact_small_notch"),
]


def generate_overlays():
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)
    by_id = {p.get("id"): p for p in plans}
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    for plan_id, room_type, inst_idx, edge_index, category in EXEMPLARS:
        raw_plan = by_id.get(plan_id)
        if raw_plan is None:
            print(f"plan {plan_id} not found — skipping overlay")
            continue
        out_path = REPORTS_DIR / f"no_wall_match_{category}_{plan_id}_{room_type}{inst_idx}_e{edge_index}.png"
        plot_instance(raw_plan, room_type, inst_idx, edge_index, category, out_path)
        print(f"  wrote {out_path}")


def main():
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)

    sample = find_sample(plans, TARGET_N, SCAN_LIMIT)
    print(f"Sample: {len(sample)} plans flagged room_boundary_no_wall_match (scanned first {SCAN_LIMIT} of {len(plans)})\n")

    all_edges = []
    for raw_plan in sample:
        edges = analyze_plan(raw_plan)
        all_edges.extend(edges)
        for e in edges:
            print(
                f"plan={e['resplan_id']} room={e['room']} edge={e['edge_index']} len={e['edge_len']} "
                f"wd={e['wall_depth']} ink_narrow_orig={e['ink_ratio_narrow_orig']} ink_narrow={e['ink_ratio_narrow']} "
                f"ink_wide={e['ink_ratio_wide']} on_exterior={e['on_exterior']} "
                f"degenerate={e['outward_probe_degenerate']} inside_inner={e['outward_inside_inner']} "
                f"neighbor_room={e['neighbor_room']} neighbor_site={e['neighbor_site']} opening_hit={e['opening_hit']}"
            )

    print(f"\nTotal flagged edges: {len(all_edges)} across {len(sample)} plans")

    # How much of the officially-flagged bucket is actually the unclamped-
    # overlap arithmetic bug, not a real coverage gap? An edge is a FALSE
    # POSITIVE of the original flag if its corrected ratio clears the same
    # 0.5 bar the original (buggy) computation failed.
    false_positive_edges = [e for e in all_edges if e["ink_ratio_narrow"] >= COVERAGE_THRESHOLD]
    print(f"\nFALSE-POSITIVE check (arithmetic-bug-only, corrected ratio >= {COVERAGE_THRESHOLD}):")
    print(f"  edges: {len(false_positive_edges)}/{len(all_edges)} ({100 * len(false_positive_edges) / len(all_edges):.1f}%) "
          f"were flagged ONLY because of the unclamped-sum bug — real coverage is fine")

    plans_by_id = {}
    for e in all_edges:
        plans_by_id.setdefault(e["resplan_id"], []).append(e)
    plans_fully_explained_by_bug = 0
    for pid, edges in plans_by_id.items():
        if all(e["ink_ratio_narrow"] >= COVERAGE_THRESHOLD for e in edges):
            plans_fully_explained_by_bug += 1
    print(f"  plans: {plans_fully_explained_by_bug}/{len(plans_by_id)} ({100 * plans_fully_explained_by_bug / len(plans_by_id):.1f}%) "
          f"had EVERY flagged edge clear the bar once corrected — the plan should not have been flagged at all")

    genuine_edges = [e for e in all_edges if e["ink_ratio_narrow"] < COVERAGE_THRESHOLD]
    for e in genuine_edges:
        e["category"] = classify(e)

    print(f"\n{'=' * 70}\nFINAL TAXONOMY — {len(genuine_edges)} genuinely-broken edges "
          f"(post arithmetic-bug correction), edge-level:")
    edge_hist = Counter(e["category"] for e in genuine_edges)
    for cat, count in edge_hist.most_common():
        print(f"  {cat}: {count} ({100 * count / len(genuine_edges):.1f}%)")

    print(f"\nRoom-level (one verdict per broken room instance, worst/most-specific "
          f"category among its own genuinely-broken edges — priority: "
          f"a > f > d > b > c > e, i.e. the least-recoverable finding wins):")
    room_priority = [
        "a_genuine_gt_defect_between_rooms",
        "f_unexplained_interior_gap",
        "d_tracing_artifact_small_notch",
        "b_shared_wall_wide_recoverable",
        "c_exterior_boundary_or_void",
        "e_opening_doorway_notch",
        "unresolved_degenerate_probe",
    ]
    rooms = {}
    for e in genuine_edges:
        key = (e["resplan_id"], e["room"])
        rooms.setdefault(key, set()).add(e["category"])
    room_hist = Counter()
    for key, cats in rooms.items():
        verdict = next((c for c in room_priority if c in cats), "UNKNOWN")
        room_hist[verdict] += 1
    for cat, count in room_hist.most_common():
        print(f"  {cat}: {count} ({100 * count / len(rooms):.1f}% of {len(rooms)} rooms)")

    # Plan-level: a plan counts as STILL genuinely defective only if it has
    # >=1 edge that is NOT explained away (measurement bug, or classes
    # b/c/d/e per the task's own "revised ceiling" definition). a and f are
    # real, unresolved findings; unresolved_degenerate_probe is kept
    # conservatively on the "still defective" side since it wasn't
    # positively explained either.
    NOT_A_REAL_DEFECT = {
        "e_opening_doorway_notch",
        "c_exterior_boundary_or_void",
        "d_tracing_artifact_small_notch",
        "b_shared_wall_wide_recoverable",
    }
    still_defective_plans = 0
    for pid, edges in plans_by_id.items():
        cats = {classify(e) for e in edges if e["ink_ratio_narrow"] < COVERAGE_THRESHOLD}
        if cats and not cats.issubset(NOT_A_REAL_DEFECT):
            still_defective_plans += 1
    recovered_fraction = 1 - still_defective_plans / len(plans_by_id)
    print(f"\n{'=' * 70}\nPLAN-LEVEL rollup ({len(plans_by_id)} sampled plans, all officially "
          f"flagged room_boundary_no_wall_match):")
    print(f"  still genuinely defective (>=1 edge in class a/f, or degenerate): "
          f"{still_defective_plans}/{len(plans_by_id)} ({100 * still_defective_plans / len(plans_by_id):.1f}%)")
    print(f"  recovered (bug-only, or every broken edge explained by b/c/d/e): "
          f"{len(plans_by_id) - still_defective_plans}/{len(plans_by_id)} ({100 * recovered_fraction:.1f}%)")

    base_ceiling = 67.5
    orig_defect_share = 32.5
    revised_ceiling = base_ceiling + orig_defect_share * recovered_fraction
    print(f"\nREVISED true ceiling estimate: {base_ceiling} + {orig_defect_share} * {recovered_fraction:.3f} "
          f"= {revised_ceiling:.1f}%")
    print(f"  (sample n={len(plans_by_id)} plans out of the population's 5,525 "
          f"room_boundary_no_wall_match-flagged plans — a diagnostic-scale estimate, "
          f"not a population-scale measurement like the 67.5% itself)")

    compute_conditional_clean_rate(300)


if __name__ == "__main__":
    main()
