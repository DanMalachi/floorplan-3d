"""Diagnosis-only: positively confirm (not just infer) the no_angle_valid_candidate
finding from diagnose_broken_room_cycle.py. That script inferred "no genuinely
angled wall exists near this edge" from absence in an STRtree query bounded to
a tight tolerance band. This script checks the actual GT wall ink (pre-skeleton)
and the extracted skeleton segments near each failing edge directly — with a
proximity bounded by wall thickness (not edge length — an early version scaled
by edge length and "found" unrelated parallel walls 11-22 units away in an
axis-aligned building, misclassifying all three instances) and an ink
COVERAGE RATIO (projected onto the edge's own parametric range, same 0.5 bar
rooms.py's real per-edge check uses — not a boolean "is there any qualifying
ink nearby," which conflated a genuine full-length wall match with a short
unrelated ledge that happened to be parallel and close). Classifies into:

  - missing_from_skeleton: GT wall ink backs >=50% of the edge at a
    plausible angle, but no skeleton segment was extracted there at all —
    an extraction bug, not a room-assembly issue.
  - partial_ink_partial_gap: GT wall ink backs SOME but <50% of the edge —
    the room-polygon edge runs partly along a real short wall feature and
    partly through open space with no ink at all.
  - no_ink_at_all: no qualifying wall ink anywhere near the edge — the
    room polygon's own edge/notch doesn't correspond to any real wall
    feature (a room-polygon vertex/tracing artifact).
  - present_outside_band: a skeleton segment at a plausible angle exists,
    just geometrically farther from the edge than the coverage band's
    tolerance — a band-width/tolerance issue, not a missing-segment one.

No changes to rooms.py/skeleton.py. Saves an overlay PNG per instance to
extraction/synth/reports/ (gitignored, matches overlay_debug.py's
convention) and prints the classification + supporting measurements.
"""
from __future__ import annotations

import pickle
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

import matplotlib.pyplot as plt
from shapely.geometry import LineString

from extraction.synth.skeleton import extract_wall_skeleton, fill_openings_into_wall
from extraction.synth.vendor.resplan_utils import get_geometries, normalize_keys

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"
REPORTS_DIR = Path(__file__).resolve().parents[1] / "reports"  # extraction/synth/reports/
TOLERANCE = 2.0

# Three instances pulled straight from diagnose_broken_room_cycle.py's
# no_angle_valid_candidate sample (15-plan run, scan_limit=2000):
#   plan 881  bathroom_0 edge_index=0  (len=4.8,  best_rejected_cos_angle=0.006)
#   plan 634  storage_0  edge_index=2  (len=17.47, best_rejected_cos_angle=0.001)
#   plan 3807 bathroom_0 edge_index=0  (len=3.3,  best_rejected_cos_angle=0.001)
INSTANCES = [
    dict(plan_id=881, room_type="bathroom", inst_idx=0, edge_index=0),
    dict(plan_id=634, room_type="storage", inst_idx=0, edge_index=2),
    dict(plan_id=3807, room_type="bathroom", inst_idx=0, edge_index=0),
]


def _find_plan(plans, plan_id):
    for p in plans:
        if p.get("id") == plan_id:
            return p
    return None


def _edge_and_context(raw_plan, room_type, inst_idx, edge_index):
    p = normalize_keys(dict(raw_plan))
    wall_depth = float(p.get("wall_depth") or 4.0)
    wall_geom = p.get("wall")
    filled = fill_openings_into_wall(wall_geom, p.get("door"), p.get("window"), p.get("front_door"))
    skel = extract_wall_skeleton(filled, wall_depth, thickness_source_geom=wall_geom)
    segments = skel.segments

    polys = get_geometries(p.get(room_type))
    poly = polys[inst_idx]
    coords = list(poly.exterior.coords)
    a, b = coords[edge_index], coords[edge_index + 1]
    return dict(p=p, wall_geom=wall_geom, segments=segments, poly=poly, a=a, b=b, wall_depth=wall_depth)


# How far a candidate (ink edge or skeleton segment) may sit from the
# failing edge and still count as "near" it. Deliberately NOT scaled by
# edge_len (a first pass that did this "found" segments 11-22 units away
# for a 17-unit edge and misclassified all three instances as
# present_outside_band — those were unrelated parallel walls elsewhere in
# an axis-aligned building, not a real near-miss on THIS edge). Scaled
# instead by the plan's own wall thickness via PROXIMITY_MULTIPLIER, same
# quantity rooms.py's real band uses.
PROXIMITY_MULTIPLIER = 3.0
MIN_INK_EDGE_LEN = TOLERANCE  # matches rooms.py's own sub-tolerance-edge skip
COVERAGE_THRESHOLD = 0.5  # must match rooms.py::assemble_rooms's default


def analyze_instance(raw_plan, room_type, inst_idx, edge_index):
    ctx = _edge_and_context(raw_plan, room_type, inst_idx, edge_index)
    a, b, segments, wall_geom = ctx["a"], ctx["b"], ctx["segments"], ctx["wall_geom"]
    dx, dy = b[0] - a[0], b[1] - a[1]
    edge_len = (dx * dx + dy * dy) ** 0.5
    edge_line = LineString([a, b])

    ink_band_limit = TOLERANCE + ctx["wall_depth"] / 2
    ink_proximity = ink_band_limit * PROXIMITY_MULTIPLIER

    # 1. Is there GT wall ink (pre-skeleton raw polygon) near this edge at
    # a plausible angle? Line-to-line distance (not point-to-point to the
    # midpoint, which lets diagonally-offset noise through) against every
    # wall-ink boundary edge, excluding sub-tolerance edges (digitization
    # noise — e.g. a 0.35-unit polygon-vertex jog is not a real wall
    # feature, even if it happens to be collinear with the failing edge).
    # A boolean "is there SOME qualifying ink nearby" hides the difference
    # between "wall ink backs the whole edge" (a genuine missing-segment
    # skeleton bug) and "a short ledge near one end happens to be parallel
    # and close" (verified case: a 3.49-unit ledge counted as a match for
    # a 17.47-unit edge, when the other ~14 units of the edge run through
    # open space with no ink at all). Project matching ink onto the edge's
    # own parametric [0,1] range and sum coverage, exactly like rooms.py's
    # real per-edge coverage_threshold check, so "how much of the edge is
    # actually backed by ink" is measured, not just "is any backed."
    nearby_wall_ink = False
    ink_plausible_angle = False
    best_ink_cos = 0.0
    nearest_ink_dist = float("inf")
    ink_overlaps = []  # (t0, t1)
    for part in get_geometries(wall_geom):
        ring = list(part.exterior.coords)
        for i in range(len(ring) - 1):
            wa, wb = ring[i], ring[i + 1]
            wdx, wdy = wb[0] - wa[0], wb[1] - wa[1]
            wlen = (wdx * wdx + wdy * wdy) ** 0.5
            if wlen < MIN_INK_EDGE_LEN:
                continue
            dist = edge_line.distance(LineString([wa, wb]))
            if dist > ink_proximity:
                continue
            cos_a = abs((dx * wdx + dy * wdy) / (edge_len * wlen))
            if cos_a < 0.9:
                continue
            nearby_wall_ink = True
            ink_plausible_angle = True
            best_ink_cos = max(best_ink_cos, cos_a)
            nearest_ink_dist = min(nearest_ink_dist, dist)
            ts = [((px - a[0]) * dx + (py - a[1]) * dy) / (edge_len * edge_len) for px, py in (wa, wb)]
            ink_overlaps.append((min(ts), max(ts)))

    ink_overlaps.sort()
    ink_covered = sum(min(t1, 1.0) - max(t0, 0.0) for t0, t1 in ink_overlaps if t1 > t0) * edge_len
    ink_coverage_ratio = ink_covered / edge_len if edge_len else 0.0

    # 2. Is there a skeleton segment near this edge at a plausible angle?
    # Same bounded proximity, same line-to-line distance.
    nearest_plausible_seg = None
    nearest_plausible_dist = float("inf")
    nearest_plausible_band_limit = None
    for seg in segments:
        sx, sy = seg.end[0] - seg.start[0], seg.end[1] - seg.start[1]
        slen = (sx * sx + sy * sy) ** 0.5
        if slen < 1e-6:
            continue
        cos_a = abs((dx * sx + dy * sy) / (edge_len * slen))
        if cos_a < 0.9:
            continue
        seg_line = LineString([seg.start, seg.end])
        dist = edge_line.distance(seg_line)
        band_limit = TOLERANCE + seg.thickness / 2
        if dist > band_limit * PROXIMITY_MULTIPLIER:
            continue
        if dist < nearest_plausible_dist:
            nearest_plausible_dist = dist
            nearest_plausible_seg = seg
            nearest_plausible_band_limit = band_limit

    default_band_limit = TOLERANCE + max((s.thickness for s in segments), default=0.0) / 2
    if nearest_plausible_seg is not None:
        band_limit = nearest_plausible_band_limit
        if nearest_plausible_dist <= band_limit * 1.2:
            # would've been within/near the actual band — contradicts the
            # broad-phase STRtree finding, flag as a discrepancy
            classification = "present_within_band_UNEXPECTED"
        else:
            classification = "present_outside_band"
    elif ink_coverage_ratio >= COVERAGE_THRESHOLD:
        # Same 0.5 bar rooms.py's own per-edge coverage check uses — most
        # or all of the edge is genuinely backed by real wall ink, but no
        # skeleton segment exists there at all.
        classification = "missing_from_skeleton"
        band_limit = default_band_limit
    elif ink_coverage_ratio > 0.0:
        # A NEW category the data forced: ink backs only PART of the edge
        # (verified case: a 3.49-unit ledge "matching" a 17.47-unit edge —
        # 20% coverage). The room polygon's edge runs partly along a real
        # short wall feature and partly through open space; not a missing
        # segment (there's nothing missing over most of the edge) and not
        # "no ink at all" either.
        classification = "partial_ink_partial_gap"
        band_limit = default_band_limit
    else:
        classification = "no_ink_at_all"  # genuinely no matching ink anywhere near the edge
        band_limit = default_band_limit

    return dict(
        edge=(a, b),
        edge_len=round(edge_len, 2),
        ink_proximity=round(ink_proximity, 2),
        nearby_wall_ink=nearby_wall_ink,
        ink_plausible_angle=ink_plausible_angle,
        ink_coverage_ratio=round(ink_coverage_ratio, 3),
        best_ink_cos_angle=round(best_ink_cos, 3),
        nearest_ink_dist=None if nearest_ink_dist == float("inf") else round(nearest_ink_dist, 2),
        nearest_plausible_skeleton_dist=None if nearest_plausible_seg is None else round(nearest_plausible_dist, 2),
        band_limit=round(band_limit, 2),
        classification=classification,
        ctx=ctx,
    )


def plot_instance(result, plan_id, room_type, inst_idx, edge_index, out_path):
    ctx = result["ctx"]
    a, b = result["edge"]
    mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    zoom = max(result["edge_len"], 10.0) * 3

    fig, ax = plt.subplots(figsize=(8, 8))
    for part in get_geometries(ctx["wall_geom"]):
        xs, ys = part.exterior.xy
        ax.fill(xs, ys, color="#ffd92f", alpha=0.4, edgecolor="#b8960a", linewidth=0.5, label="_nolegend_")

    rxs, rys = ctx["poly"].exterior.xy
    ax.plot(rxs, rys, color="blue", linewidth=1.0, alpha=0.6, label="room polygon")

    for seg in ctx["segments"]:
        ax.plot([seg.start[0], seg.end[0]], [seg.start[1], seg.end[1]], color="red", linewidth=1.5, alpha=0.8)

    ax.plot([a[0], b[0]], [a[1], b[1]], color="lime", linewidth=3.5, alpha=0.9, label="failing edge")
    ax.plot(mid[0], mid[1], "o", color="black", markersize=6)

    ax.set_xlim(mid[0] - zoom, mid[0] + zoom)
    ax.set_ylim(mid[1] - zoom, mid[1] + zoom)
    ax.set_aspect("equal")
    ax.set_title(
        f"plan={plan_id} room={room_type}_{inst_idx} edge={edge_index}\n"
        f"class={result['classification']} ink_coverage={result['ink_coverage_ratio']} "
        f"skel_dist={result['nearest_plausible_skeleton_dist']} band_limit={result['band_limit']}",
        fontsize=9,
    )
    ax.legend(loc="upper right", fontsize=7)
    fig.tight_layout()
    fig.savefig(out_path, dpi=150)
    plt.close(fig)


def main():
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Verifying {len(INSTANCES)} no_angle_valid_candidate instances against raw GT wall ink + skeleton\n")

    summary = []
    for inst in INSTANCES:
        raw_plan = _find_plan(plans, inst["plan_id"])
        if raw_plan is None:
            print(f"plan {inst['plan_id']} not found in first {len(plans)} plans — skipping")
            continue
        result = analyze_instance(raw_plan, inst["room_type"], inst["inst_idx"], inst["edge_index"])
        out_path = REPORTS_DIR / f"no_angle_candidate_{inst['plan_id']}_{inst['room_type']}{inst['inst_idx']}_e{inst['edge_index']}.png"
        plot_instance(result, inst["plan_id"], inst["room_type"], inst["inst_idx"], inst["edge_index"], out_path)

        print(f"=== plan {inst['plan_id']} room={inst['room_type']}_{inst['inst_idx']} edge={inst['edge_index']} ===")
        print(f"  edge_len={result['edge_len']} ink_proximity={result['ink_proximity']}")
        print(f"  nearby_wall_ink={result['nearby_wall_ink']} ink_coverage_ratio={result['ink_coverage_ratio']} (threshold={COVERAGE_THRESHOLD}) best_ink_cos_angle={result['best_ink_cos_angle']} nearest_ink_dist={result['nearest_ink_dist']}")
        print(f"  nearest_plausible_skeleton_segment_dist={result['nearest_plausible_skeleton_dist']} (band_limit={result['band_limit']})")
        print(f"  -> CLASSIFICATION: {result['classification']}")
        print(f"  overlay saved: {out_path}")
        print()
        summary.append((inst, result["classification"]))

    print("=" * 70)
    print("Summary:")
    for inst, cls in summary:
        print(f"  plan={inst['plan_id']} room={inst['room_type']}_{inst['inst_idx']} edge={inst['edge_index']}: {cls}")


if __name__ == "__main__":
    main()
