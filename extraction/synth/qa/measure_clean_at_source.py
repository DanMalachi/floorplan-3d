"""Population measurement, READ-ONLY: how much of ResPlan is even
internally self-consistent BEFORE any conversion step touches it — the
ceiling on Phase 3a's 90% clean-conversion bar. No skeletonization, no
wall_cycle assembly, no offset calibration, no corner-mitre solving; just
direct geometric checks against the raw source polygons. Runs the FULL
17K population by default, not a sample — this is meant to answer
"is 90% clean conversion even arithmetically reachable against this GT,"
which a sample can't settle.

Three checks, each independently flaggable per plan:

  1. wall_invalid — the raw `wall` polygon itself is missing, empty, or
     geometrically invalid (self-intersecting / zero area) per shapely's
     own `is_valid`.
  2. room_geometry_invalid — any CLEAN_REQUIRED_ROOM_TYPES room instance
     polygon is missing, empty, or geometrically invalid.
  3. room_boundary_no_wall_match — any required room has an edge that
     doesn't correspond to real wall ink at all. Reuses the coverage-ratio
     technique validated in verify_no_angle_valid_candidate.py
     (2026-07-21): project nearby wall-ink boundary edges (angle within
     cos>=0.9 of the room edge, within a wall-thickness-scaled proximity)
     onto the room edge's own parametric range and sum coverage; the room
     edge is "backed" if coverage clears the SAME 0.5 threshold
     rooms.py's real per-edge check uses. Checked directly against the
     RAW wall polygon (not a derived skeleton) — so this is a hard
     ceiling: no amount of skeleton-extraction or room-assembly
     engineering can ever make an edge with zero real backing ink pass,
     because the defect is in the source data, not the pipeline.

A plan is "clean_at_source" only if it fails none of the three. This is
NOT the same thing as the converter's own "clean" bar (opening-attach
rate, ink-coverage ratio, area-match tolerance are converter-QUALITY
questions) — it is specifically the GT-INTEGRITY ceiling those checks can
never exceed, regardless of how good the converter gets.

One deliberate exception to "no conversion": `fill_openings_into_wall` IS
called before the room_boundary_no_wall_match check. This restores
door/window/front_door cutouts into the wall polygon via a deterministic
union with geometry ResPlan's own format already provides (each opening
polygon exactly spans the wall gap it was cut from — verified on real
data, see skeleton.py's docstring); it involves no skeletonization, no
calibration, no judgment call, and loses no information. It is not
optional: omitting it produces a ceiling BELOW the real converter's
measured clean rate (34.5% vs. the converter's actual 45% on the same
first-200 plans), which is incoherent for a true ceiling — every doorway
edge was being counted as a source defect simply because ResPlan cuts
openings out of the wall polygon by convention, not because anything is
actually wrong with the source data. Does NOT call extract_wall_skeleton
or assemble_rooms — no skeleton, no wall_cycle, no offset multiplier, no
mitre solving.
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

from extraction.synth.resplan_convert import CLEAN_REQUIRED_ROOM_TYPES
from extraction.synth.skeleton import fill_openings_into_wall
from extraction.synth.vendor.resplan_utils import get_geometries, normalize_keys

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"

TOLERANCE = 2.0  # matches rooms.py::assemble_rooms's default tolerance
MIN_INK_EDGE_LEN = TOLERANCE  # matches rooms.py's own sub-tolerance-edge skip
PROXIMITY_MULTIPLIER = 3.0  # matches verify_no_angle_valid_candidate.py
COVERAGE_THRESHOLD = 0.5  # matches rooms.py::assemble_rooms's default


def _wall_boundary_edges(wall_geom) -> list[tuple[tuple[float, float], tuple[float, float], float]]:
    edges = []
    for part in get_geometries(wall_geom):
        if part is None or part.is_empty or part.geom_type != "Polygon":
            continue
        rings = [part.exterior.coords] + [interior.coords for interior in part.interiors]
        for ring in rings:
            ring = list(ring)
            for wa, wb in zip(ring, ring[1:]):
                wdx, wdy = wb[0] - wa[0], wb[1] - wa[1]
                wlen = (wdx * wdx + wdy * wdy) ** 0.5
                if wlen < MIN_INK_EDGE_LEN:
                    continue
                edges.append((wa, wb, wlen))
    return edges


def _edge_covered(a, b, edge_len, wall_edges, tree, ink_proximity) -> float:
    """Coverage ratio of room edge (a,b) by nearby, plausibly-angled wall
    ink — same projection-onto-parametric-range technique as
    verify_no_angle_valid_candidate.py, generalized to a full room cycle.

    Each candidate's contribution is clamped to its actual overlap with the
    edge's own [0,1] parametric range before summing (fixed 2026-07-21).
    The previous `min(t1,1.0) - max(t0,0.0)` was unclamped: a candidate
    whose projected range falls entirely outside [0,1] (t1<0 or t0>1 —
    genuinely zero overlap, common for short required-room edges sitting
    near OTHER unrelated wall ink in a dense cluster of small rooms) still
    contributed a large NEGATIVE number to the sum, capable of swamping a
    real candidate's positive contribution. Confirmed on plan 3733
    (bedroom_1, edge 30): a candidate with t-range [-5.12,-3.12] — no
    overlap with [0,1] at all — contributed -3.12. Visually confirmed on
    plan 704238 (bedroom_0, edge 16): scored -6.35 by the old formula while
    sitting in solid, unambiguous wall ink on both sides; the clamped
    formula correctly scores it 1.0. See
    docs/session-notes/p3a-handoff.md's 2026-07-21 decomposition session
    for the full population-impact measurement (this bug alone accounted
    for 40.4% of a 27-plan sample's flagged edges)."""
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
    covered = sum(t1 - t0 for t0, t1 in overlaps) * edge_len
    return covered / edge_len if edge_len else 0.0


def check_plan(raw_plan: dict) -> dict:
    p = normalize_keys(dict(raw_plan))
    flags: list[str] = []
    wall_geom = p.get("wall")

    if wall_geom is None or wall_geom.is_empty:
        flags.append("wall_invalid:missing_or_empty")
        return dict(resplan_id=raw_plan.get("id"), flags=flags, clean_at_source=False)
    wall_parts = get_geometries(wall_geom)
    if not wall_parts or any(part.geom_type != "Polygon" or not part.is_valid or part.area <= 0 for part in wall_parts):
        flags.append("wall_invalid:degenerate_or_self_intersecting")

    # Fill door/window/front_door cutouts back into the wall polygon before
    # the boundary-match check. This is NOT a conversion step in the
    # lossy/judgment sense (skeletonization, offset calibration, corner
    # mitring) — it's a deterministic union with geometry ResPlan's own
    # format already provides (each opening polygon exactly spans the wall
    # gap it was cut from, verified on real data — skeleton.py's own
    # docstring). Omitting this fill produced a false ceiling BELOW the
    # real converter's measured clean rate (34.5% vs. the converter's 45%
    # on the same first-200 plans) — impossible for a true ceiling, since
    # every doorway edge was being counted as "no wall match" simply
    # because ResPlan cuts openings out of the wall polygon by convention.
    filled_wall_geom = fill_openings_into_wall(wall_geom, p.get("door"), p.get("window"), p.get("front_door"))
    wall_depth = float(p.get("wall_depth") or 4.0)
    ink_proximity = (TOLERANCE + wall_depth / 2) * PROXIMITY_MULTIPLIER
    wall_edges = _wall_boundary_edges(filled_wall_geom)
    tree = STRtree([LineString([wa, wb]) for wa, wb, _ in wall_edges]) if wall_edges else None

    any_room_geom_invalid = False
    any_room_boundary_unmatched = False
    for rt in CLEAN_REQUIRED_ROOM_TYPES:
        g = p.get(rt)
        if g is None:
            continue
        for inst_idx, poly in enumerate(get_geometries(g)):
            if poly is None or poly.is_empty or poly.geom_type != "Polygon" or not poly.is_valid or poly.area <= 0:
                any_room_geom_invalid = True
                flags.append(f"room_geometry_invalid:{rt}_{inst_idx}")
                continue
            if tree is None:
                any_room_boundary_unmatched = True
                flags.append(f"room_boundary_no_wall_match:{rt}_{inst_idx}")
                continue
            coords = list(poly.exterior.coords)
            room_broken = False
            for i in range(len(coords) - 1):
                a, b = coords[i], coords[i + 1]
                dx, dy = b[0] - a[0], b[1] - a[1]
                edge_len = (dx * dx + dy * dy) ** 0.5
                if edge_len < TOLERANCE:
                    continue
                ratio = _edge_covered(a, b, edge_len, wall_edges, tree, ink_proximity)
                if ratio < COVERAGE_THRESHOLD:
                    room_broken = True
            if room_broken:
                any_room_boundary_unmatched = True
                flags.append(f"room_boundary_no_wall_match:{rt}_{inst_idx}")

    clean_at_source = not flags
    return dict(resplan_id=raw_plan.get("id"), flags=flags, clean_at_source=clean_at_source)


def main(limit: int | None = None) -> None:
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)
    if limit:
        plans = plans[:limit]

    n_total = len(plans)
    n_clean = 0
    plan_level_defects = Counter()  # one bucket per DEFECT TYPE, a plan may hit >1
    n_wall_invalid = 0
    n_room_geometry_invalid = 0
    n_room_boundary_unmatched = 0

    t0 = time.time()
    for i, raw_plan in enumerate(plans):
        result = check_plan(raw_plan)
        if result["clean_at_source"]:
            n_clean += 1
        else:
            cats = {f.split(":", 1)[0] for f in result["flags"]}
            for cat in cats:
                plan_level_defects[cat] += 1
            if "wall_invalid" in cats:
                n_wall_invalid += 1
            if "room_geometry_invalid" in cats:
                n_room_geometry_invalid += 1
            if "room_boundary_no_wall_match" in cats:
                n_room_boundary_unmatched += 1
        if (i + 1) % 2000 == 0:
            elapsed = time.time() - t0
            print(f"  ...{i + 1}/{n_total} ({elapsed:.0f}s elapsed, {elapsed / (i + 1) * n_total:.0f}s projected total)", file=sys.stderr)

    elapsed = time.time() - t0
    print(f"\nN={n_total}  clean_at_source={n_clean} ({100 * n_clean / n_total:.1f}%)  ({elapsed:.0f}s)")
    print("\nDefect-type breakdown (plan-level, a plan may hit more than one):")
    for cat, count in plan_level_defects.most_common():
        print(f"  {cat}: {count} ({100 * count / n_total:.1f}% of all plans)")
    print(f"\n  wall_invalid: {n_wall_invalid} ({100 * n_wall_invalid / n_total:.1f}%)")
    print(f"  room_geometry_invalid: {n_room_geometry_invalid} ({100 * n_room_geometry_invalid / n_total:.1f}%)")
    print(f"  room_boundary_no_wall_match: {n_room_boundary_unmatched} ({100 * n_room_boundary_unmatched / n_total:.1f}%)")


if __name__ == "__main__":
    lim = int(sys.argv[1]) if len(sys.argv) > 1 else None
    main(lim)
