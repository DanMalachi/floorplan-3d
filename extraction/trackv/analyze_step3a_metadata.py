"""Style-metadata separation diagnostic -- Track V milestone 2 step 3a,
Blocker-1 (candidate over-production) step 1.

Not a pipeline module and it builds NO filter. It answers one question, in
the form fixed in advance by reports/phase-2-m2c-handoff.md: does PDF style
metadata (layer / color / stroke width, plus the two free extra channels
dash-pattern and content-stream sequence number) separate real wall-face
candidates from spurious ones -- measured as a CONFUSION MATRIX OVER THE FULL
CANDIDATE POPULATION, not by re-inspecting the handful of examples
(W2/W26-28/W46-48 vs. W0/W22/W23) that formed the over-production hypothesis
in the first place. Paper Sec. 5.2 item 1 ("layer names ... free,
high-precision evidence") is the claim under test.

Scope decisions, all inherited from the handoff, not re-opened here:

* PRE-SPLIT candidate set. Classification is upstream of junction closure's
  splitting, so the 230-wall post-split view only adds noise. This module
  therefore stops at pair.py's output (54 walls on 30x50) and never calls
  assemble() -- it reuses only `_snap_endpoints` to reproduce the exact
  frame the recorded pinned-transform residuals were measured in (see
  ANCHOR GUARD below). Predictions on disk are never touched.

* 30x50 ONLY for the labeled matrix. 15x30's pinned-transform anchor-fit
  residuals are 3-6 tau (handoff Blocker 2, issue #8), so labeling its
  candidates against GT would be labeling against a transform known to be
  untrustworthy. 15x30 gets a label-free channel-availability report, which
  requires no transform at all and so is unaffected.

* ANCHOR GUARD. The pinned transform is re-fit here (same 4 clean anchors as
  analyze_step3a_pinned.run_30x50), NOT re-derived: the resulting residuals
  are checked against the recorded ones and the run refuses to report a
  matrix if they disagree. A matrix built on a silently-different frame
  would be worse than no matrix.

The REAL/SPURIOUS labeling rule is deliberately NOT eval/metrics/matching.py's
Hungarian criterion, and this difference is the point: a candidate covering
10% of a real GT wall is real *evidence* about that wall (it is a
fragmentation problem), whereas a candidate lying on no GT wall at all is a
genuine false positive. Only the second population is what a metadata filter
would need to remove, so that is what gets labeled SPURIOUS.
"""

from __future__ import annotations

import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from eval.registry.registry import load_registry  # noqa: E402
from extraction.trackv.analyze_step3a_pinned import fit_residuals, fit_similarity_umeyama  # noqa: E402
from extraction.trackv.assemble import _snap_endpoints  # noqa: E402
from extraction.trackv.dissect import dissect  # noqa: E402
from extraction.trackv.pair import pair_walls  # noqa: E402
from extraction.trackv.run_step3a import _gt_scale  # noqa: E402
from extraction.trackv.select import select_axis_aligned  # noqa: E402

GT_DIR = REPO_ROOT / "data" / "corpus" / "gt_provisional"
OUT_PATH = Path(__file__).parent / "out" / "step3a_metadata_confusion.json"

LABELED_PLAN = "30x50-Model-landscape"
AVAILABILITY_ONLY_PLAN = "15x30-ft-Best-House-Plan-Model"

# Recorded in out/step3a_pinned_diagnostic.json for the same 54-wall pre-split
# set and the same 4 clean anchors. Reproducing these is what licenses using
# this frame to label; drifting from them means the frame changed underneath
# the labels and the matrix must not be reported.
RECORDED_ANCHOR_RESIDUALS_MM = [59.1, 60.9, 56.2, 56.1]
ANCHOR_RESIDUAL_TOLERANCE_MM = 5.0

# Labeling rule parameters. tau_frac is swept so the choice of labeling
# threshold is visible in the output rather than buried in this constant.
LABEL_TAU_FRACS = (0.005, 0.01, 0.02)
DEFAULT_LABEL_TAU_FRAC = 0.01
LABEL_ORIENTATION_TOLERANCE_DEG = 15.0
LABEL_MIN_OVERLAP_FRACTION = 0.5  # of the CANDIDATE's own length
# Fraction of GT walls that must have at least one candidate lying on them
# before the REAL/SPURIOUS labels are treated as evidence at all -- see the
# `labels_trustworthy` field for why.
LABEL_MIN_GT_COVERAGE = 0.9

Point2 = tuple[float, float]


# --------------------------------------------------------------------------
# geometry helpers (local; deliberately not matching.py's -- see module docstring)
# --------------------------------------------------------------------------


def _midpoint(a: Point2, b: Point2) -> Point2:
    return ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0)


def _length(a: Point2, b: Point2) -> float:
    return math.hypot(b[0] - a[0], b[1] - a[1])


def _angle_deg(a: Point2, b: Point2) -> float:
    return math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) % 180.0


def _angle_delta(a_deg: float, b_deg: float) -> float:
    d = abs(a_deg - b_deg) % 180.0
    return min(d, 180.0 - d)


def _lies_on(cand: dict, gt: dict, tau: float) -> tuple[bool, float, float]:
    """Does `cand` lie along `gt`? Returns (verdict, perp_distance,
    overlap_fraction_of_candidate_length)."""
    g0, g1 = tuple(gt["start"]), tuple(gt["end"])
    c0, c1 = tuple(cand["start"]), tuple(cand["end"])
    g_len = _length(g0, g1)
    c_len = _length(c0, c1)
    if g_len <= 0 or c_len <= 0:
        return False, float("inf"), 0.0
    if _angle_delta(_angle_deg(c0, c1), _angle_deg(g0, g1)) > LABEL_ORIENTATION_TOLERANCE_DEG:
        return False, float("inf"), 0.0

    ux, uy = (g1[0] - g0[0]) / g_len, (g1[1] - g0[1]) / g_len
    nx, ny = -uy, ux
    cm = _midpoint(c0, c1)
    perp = abs((cm[0] - g0[0]) * nx + (cm[1] - g0[1]) * ny)

    def along(p: Point2) -> float:
        return (p[0] - g0[0]) * ux + (p[1] - g0[1]) * uy

    c_lo, c_hi = sorted((along(c0), along(c1)))
    overlap = max(0.0, min(c_hi, g_len) - max(c_lo, 0.0))
    overlap_frac = overlap / c_len
    ok = perp <= tau and overlap_frac >= LABEL_MIN_OVERLAP_FRACTION
    return ok, perp, overlap_frac


def _gt_diagonal(gt_walls: list[dict]) -> float:
    xs = [c for w in gt_walls for c in (w["start"][0], w["end"][0])]
    ys = [c for w in gt_walls for c in (w["start"][1], w["end"][1])]
    return math.hypot(max(xs) - min(xs), max(ys) - min(ys))


# --------------------------------------------------------------------------
# candidate construction + metadata harvest
# --------------------------------------------------------------------------


def _colour_key(c) -> str:
    if c is None:
        return "none"
    return "#" + "".join(f"{round(v * 255):02x}" for v in c)


def build_candidates(plan_id: str, entry) -> dict:
    """dissect -> select -> pair, stopping before assemble(). Wall i is the
    pre-split id `W{i}` (assemble numbers pair.py's output in order), which
    is the id space analyze_step3a_pinned's anchors were picked in."""
    dissection = dissect(REPO_ROOT / entry.source_file)[0]
    selection = select_axis_aligned(dissection)
    pair_result = pair_walls(selection, dissection.page_size_px)
    scale = _gt_scale(dissection.page_size_px)

    # Same tight endpoint snap the pre-closure prediction applied before
    # scaling; reproduced (not re-invented) so this frame matches the one the
    # recorded anchor residuals were measured in.
    snapped = _snap_endpoints(pair_result.walls, 0.75)

    candidates = []
    for i, (w, (start, end)) in enumerate(zip(pair_result.walls, snapped)):
        members = w.member_source_indices or w.source_segment_indices
        prim_indices = sorted({selection.candidates[si].primitive_index for si in members})
        prims = [dissection.primitives[pi] for pi in prim_indices]
        candidates.append(
            {
                "id": f"W{i}",
                "start": [start[0] * scale, start[1] * scale],
                "end": [end[0] * scale, end[1] * scale],
                "thickness": w.thickness * scale,
                "axis_bucket": w.axis_bucket,
                "n_member_segments": len(members),
                "n_source_primitives": len(prims),
                "meta": {
                    "layer": sorted({str(p.layer) for p in prims}),
                    "stroke_color": sorted({_colour_key(p.stroke_color) for p in prims}),
                    "fill_color": sorted({_colour_key(p.fill_color) for p in prims}),
                    "stroke_width": sorted({str(round(p.stroke_width, 4)) if p.stroke_width is not None else "none" for p in prims}),
                    "dashes": sorted({str(p.dashes) for p in prims}),
                },
                "seqno_min": min((p.seqno for p in prims if p.seqno is not None), default=None),
                "seqno_max": max((p.seqno for p in prims if p.seqno is not None), default=None),
            }
        )
    return {
        "plan_id": plan_id,
        "scale_to_gt_frame": scale,
        "n_candidates": len(candidates),
        "candidates": candidates,
        "n_primitives": len(dissection.primitives),
    }


CHANNELS = ("layer", "stroke_color", "fill_color", "stroke_width", "dashes")


def _channel_value(cand: dict, channel: str) -> str:
    """One value per candidate per channel. A candidate built from primitives
    that disagree on a channel is MIXED -- reported, never silently reduced
    to one of its values: a channel that is mostly MIXED cannot act as a
    filter, and that is a finding about the channel, not a nuisance."""
    values = cand["meta"][channel]
    if len(values) == 1:
        return values[0]
    return "MIXED(" + "|".join(values) + ")"


# --------------------------------------------------------------------------
# labeling + matrix
# --------------------------------------------------------------------------


def label_candidates(candidates: list[dict], gt_walls: list[dict], tau: float) -> tuple[dict[str, str], dict]:
    labels: dict[str, str] = {}
    best_gt: dict[str, str | None] = {}
    covered_gt: set[str] = set()
    for cand in candidates:
        best = None
        for gw in gt_walls:
            ok, perp, overlap_frac = _lies_on(cand, gw, tau)
            if ok and (best is None or perp < best[1]):
                best = (gw["id"], perp, overlap_frac)
        if best is None:
            labels[cand["id"]] = "SPURIOUS"
            best_gt[cand["id"]] = None
        else:
            labels[cand["id"]] = "REAL"
            best_gt[cand["id"]] = best[0]
            covered_gt.add(best[0])
    sanity = {
        "n_real": sum(1 for v in labels.values() if v == "REAL"),
        "n_spurious": sum(1 for v in labels.values() if v == "SPURIOUS"),
        "n_gt_walls": len(gt_walls),
        "n_gt_walls_with_at_least_one_real_candidate": len(covered_gt),
        "gt_walls_with_no_candidate": sorted({w["id"] for w in gt_walls} - covered_gt),
    }
    return labels, {"best_gt": best_gt, **sanity}


def confusion(candidates: list[dict], labels: dict[str, str], channel: str) -> dict:
    rows: dict[str, Counter] = defaultdict(Counter)
    for cand in candidates:
        rows[_channel_value(cand, channel)][labels[cand["id"]]] += 1
    table = []
    for value, counts in sorted(rows.items(), key=lambda kv: -(kv[1]["REAL"] + kv[1]["SPURIOUS"])):
        real, spur = counts["REAL"], counts["SPURIOUS"]
        total = real + spur
        table.append(
            {
                "value": value,
                "REAL": real,
                "SPURIOUS": spur,
                "n": total,
                "purity": round(max(real, spur) / total, 4),
                "majority": "REAL" if real >= spur else "SPURIOUS",
            }
        )
    n_mixed = sum(r["n"] for r in table if r["value"].startswith("MIXED("))
    n_distinct = len(table)
    # A channel separates cleanly only if every value it takes is 100% one
    # class -- the handoff's "clean separation, zero real walls lost" bar.
    clean = n_distinct > 1 and all(r["purity"] == 1.0 for r in table)
    return {
        "channel": channel,
        "n_distinct_values": n_distinct,
        "n_candidates_mixed": n_mixed,
        "table": table,
        "separates_cleanly": clean,
        "verdict": (
            "DEAD (single value across the whole population -- no information)"
            if n_distinct <= 1
            else "CLEAN SEPARATION"
            if clean
            else "PARTIAL (no value is class-pure)"
        ),
    }


def partition_f1_ceiling(candidates: list[dict], channel: str, n_gt: int) -> dict:
    """The best wall-F1 any filter built on this channel could POSSIBLY reach
    -- computed with NO labels and NO coordinate transform, from the channel's
    value distribution alone.

    A metadata filter can only ever select a union of this channel's value
    buckets. For a selection of size k scored against n_gt GT walls under
    matching.py's one-to-one assignment, at most min(k, n_gt) predictions can
    match, so precision <= min(k, n_gt)/k, recall <= min(k, n_gt)/n_gt, and
    therefore F1 <= 2*min(k, n_gt) / (k + n_gt) -- an upper bound that holds
    whatever the truth about which candidates are real.

    This is the transform-independent form of the question, and it is why a
    verdict survives even when the labeled matrix does not: a channel whose
    buckets cannot be combined into a selection of roughly n_gt candidates
    cannot deliver the exit bar no matter how well it correlates with truth.
    """
    counts = Counter(_channel_value(c, channel) for c in candidates)
    items = counts.most_common()
    if len(items) > 12:  # guard: enumeration is exponential; never hit on this corpus
        return {"channel": channel, "error": f"too many distinct values to enumerate ({len(items)})"}

    best = None
    for mask in range(1, 1 << len(items)):
        selected = [items[i] for i in range(len(items)) if mask & (1 << i)]
        k = sum(c for _v, c in selected)
        if k == 0:
            continue
        ceiling = 2.0 * min(k, n_gt) / (k + n_gt)
        if best is None or ceiling > best["f1_ceiling"]:
            best = {
                "f1_ceiling": ceiling,
                "selection_size": k,
                "values_kept": [v for v, _c in selected],
            }
    return {
        "channel": channel,
        "bucket_sizes": {v: c for v, c in items},
        "n_candidates": len(candidates),
        "n_gt_walls": n_gt,
        "best_possible": {**best, "f1_ceiling": round(best["f1_ceiling"], 4)},
        "exit_bar": 0.99,
        "can_reach_exit_bar": best["f1_ceiling"] >= 0.99,
    }


def seqno_distribution(candidates: list[dict], labels: dict[str, str]) -> dict:
    """seqno is ordinal, not categorical -- forcing it into a confusion matrix
    would invent bucket boundaries. Reported as per-class distributions
    instead; a real separation would show as disjoint ranges."""
    out = {}
    for cls in ("REAL", "SPURIOUS"):
        vals = sorted(c["seqno_min"] for c in candidates if labels[c["id"]] == cls and c["seqno_min"] is not None)
        if not vals:
            out[cls] = None
            continue
        out[cls] = {
            "n": len(vals),
            "min": vals[0],
            "p25": vals[len(vals) // 4],
            "median": vals[len(vals) // 2],
            "p75": vals[(3 * len(vals)) // 4],
            "max": vals[-1],
        }
    return out


def frame_contamination_evidence(aligned: list[dict], gt_walls: list[dict], anchor_pts: list[Point2]) -> dict:
    """Why the labels came out the way they did -- measured, not asserted.

    Two independent signatures of a bad *frame* (as opposed to genuinely
    missing walls), both computed here rather than quoted from the earlier
    diagnostic:

    1. LATERAL RESIDUAL vs DISTANCE FROM THE ANCHORS. For each GT wall, take
       the best orientation- and overlap-compatible candidate with NO lateral
       bound applied, and record how far off it sits laterally. If those
       displacements grow with distance from the hand-picked anchor points,
       the transform is locally right and globally wrong -- which is a fit
       problem, not a detection problem.

    2. ENVELOPE ANISOTROPY. The transform is a similarity (one uniform
       scale). If the predicted envelope is short in x and long in y against
       GT's own bbox, no uniform scale can satisfy both axes at once and the
       similarity MODEL is the thing that's wrong -- the falsification
       signature named in reports/phase-2-m2c-handoff.md's Blocker 2.
    """
    def dist_to_anchors(p: Point2) -> float:
        return min(math.hypot(p[0] - a[0], p[1] - a[1]) for a in anchor_pts)

    rows = []
    for gw in gt_walls:
        best = None
        for c in aligned:
            _ok, perp, overlap_frac = _lies_on(c, gw, float("inf"))
            if overlap_frac >= LABEL_MIN_OVERLAP_FRACTION and (best is None or perp < best[1]):
                best = (c["id"], perp, overlap_frac)
        if best is None:
            rows.append({"gt_id": gw["id"], "best_candidate": None, "lateral_mm": None, "anchor_distance_mm": None})
            continue
        gm = _midpoint(tuple(gw["start"]), tuple(gw["end"]))
        gt_angle = _angle_deg(tuple(gw["start"]), tuple(gw["end"]))
        # A wall's lateral direction is perpendicular to itself: a HORIZONTAL
        # wall is displaced along y, a VERTICAL wall along x. So if one axis
        # of the transform is wrong and the other is right, the error must
        # land on one orientation class and spare the other -- which is the
        # test this split exists to run.
        horizontal = _angle_delta(gt_angle, 0.0) <= 45.0
        rows.append(
            {
                "gt_id": gw["id"],
                "best_candidate": best[0],
                "lateral_mm": round(best[1], 1),
                "overlap": round(best[2], 3),
                "anchor_distance_mm": round(dist_to_anchors(gm), 1),
                "gt_orientation": "horizontal" if horizontal else "vertical",
                "displaced_along": "y" if horizontal else "x",
            }
        )

    paired = [(r["anchor_distance_mm"], r["lateral_mm"]) for r in rows if r["lateral_mm"] is not None]
    correlation = None
    if len(paired) >= 3:
        xs = [p[0] for p in paired]
        ys = [p[1] for p in paired]
        mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
        sxy = sum((x - mx) * (y - my) for x, y in paired)
        sxx = sum((x - mx) ** 2 for x in xs)
        syy = sum((y - my) ** 2 for y in ys)
        if sxx > 0 and syy > 0:
            correlation = round(sxy / math.sqrt(sxx * syy), 3)

    px = [c for w in aligned for c in (w["start"][0], w["end"][0])]
    py = [c for w in aligned for c in (w["start"][1], w["end"][1])]
    gx = [c for w in gt_walls for c in (w["start"][0], w["end"][0])]
    gy = [c for w in gt_walls for c in (w["start"][1], w["end"][1])]
    pred_w, pred_h = max(px) - min(px), max(py) - min(py)
    gt_w, gt_h = max(gx) - min(gx), max(gy) - min(gy)

    # Discriminator between the two candidate causes of an x-heavy
    # displacement: a wrong x SCALE displaces every wall proportionally to
    # its own x-coordinate (strong positive correlation, slope ~= the scale
    # error), whereas a prediction envelope merely TRUNCATED at the right
    # edge leaves interior walls where they are (no correlation, error
    # concentrated at the extreme). Regressed on the x-displaced walls only.
    x_rows = [r for r in rows if r["lateral_mm"] is not None and r["displaced_along"] == "x"]
    x_scale_signature = None
    if len(x_rows) >= 3:
        gt_by_id = {w["id"]: w for w in gt_walls}
        pts = []
        for r in x_rows:
            gw = gt_by_id[r["gt_id"]]
            pts.append((_midpoint(tuple(gw["start"]), tuple(gw["end"]))[0], r["lateral_mm"]))
        mx = sum(p[0] for p in pts) / len(pts)
        my = sum(p[1] for p in pts) / len(pts)
        sxy = sum((x - mx) * (y - my) for x, y in pts)
        sxx = sum((x - mx) ** 2 for x, _y in pts)
        syy = sum((y - my) ** 2 for _x, y in pts)
        x_scale_signature = {
            "n_walls": len(pts),
            "correlation_offset_vs_gt_x": round(sxy / math.sqrt(sxx * syy), 3) if sxx > 0 and syy > 0 else None,
            "slope_mm_per_mm": round(sxy / sxx, 4) if sxx > 0 else None,
            # If the slope matches this, the displacement IS the envelope's
            # x error expressed per-wall -- i.e. one wrong x scale, not many
            # independently-wrong walls.
            "envelope_x_error_frac_for_comparison": round(abs(pred_w - gt_w) / gt_w, 4),
        }

    by_axis = {}
    for axis in ("x", "y"):
        vals = sorted(r["lateral_mm"] for r in rows if r["lateral_mm"] is not None and r["displaced_along"] == axis)
        by_axis[axis] = (
            {
                "n": len(vals),
                "min_mm": vals[0],
                "median_mm": vals[len(vals) // 2],
                "max_mm": vals[-1],
            }
            if vals
            else None
        )

    return {
        "SUMMARY": (
            "Walls are DETECTED but laterally DISPLACED: most GT walls have an orientation- and "
            "overlap-compatible candidate, yet few clear the lateral bound, and the displacement is "
            "strongly x-heavy. Two specific mechanisms were tested and BOTH came back negative -- see "
            "lateral_vs_anchor_distance_correlation (local-fit-degrading-with-distance) and "
            "x_displacement_scale_signature (wrong uniform x scale). The mechanism is therefore NOT "
            "established here; what is established is that the labels built on this frame are void."
        ),
        "x_displacement_scale_signature": x_scale_signature,
        "per_gt_wall_lateral_offset": rows,
        "n_gt_walls_with_an_orientation_and_overlap_compatible_candidate": sum(
            1 for r in rows if r["lateral_mm"] is not None
        ),
        "lateral_vs_anchor_distance_correlation": correlation,
        "lateral_offset_by_displacement_axis": by_axis,
        "envelope_anisotropy": {
            "pred_envelope_mm": [round(pred_w, 1), round(pred_h, 1)],
            "gt_bbox_mm": [round(gt_w, 1), round(gt_h, 1)],
            "x_error_pct": round(100.0 * (pred_w - gt_w) / gt_w, 2),
            "y_error_pct": round(100.0 * (pred_h - gt_h) / gt_h, 2),
        },
    }


def run_labeled(entry) -> dict:
    built = build_candidates(LABELED_PLAN, entry)
    candidates = built["candidates"]
    gt = json.loads((GT_DIR / f"{LABELED_PLAN}.json").read_text(encoding="utf-8"))
    gt_walls = gt["walls"]

    by_id = {c["id"]: c for c in candidates}
    src = [
        tuple(by_id["W0"]["start"]),
        tuple(by_id["W23"]["start"]),
        tuple(by_id["W23"]["end"]),
        tuple(by_id["W22"]["start"]),
    ]
    dst = [(4116.6, 4085.3), (4116.6, 4085.3), (4143.0, 11179.7), (4143.0, 11179.7)]
    transform = fit_similarity_umeyama(src, dst)
    residuals = fit_residuals(transform, src, dst)

    drift = [abs(r - rec) for r, rec in zip(residuals, RECORDED_ANCHOR_RESIDUALS_MM)]
    guard_ok = len(residuals) == len(RECORDED_ANCHOR_RESIDUALS_MM) and max(drift) <= ANCHOR_RESIDUAL_TOLERANCE_MM
    guard = {
        "recorded_residuals_mm": RECORDED_ANCHOR_RESIDUALS_MM,
        "reproduced_residuals_mm": [round(r, 1) for r in residuals],
        "max_drift_mm": round(max(drift), 2) if drift else None,
        "tolerance_mm": ANCHOR_RESIDUAL_TOLERANCE_MM,
        "passed": guard_ok,
    }

    aligned = [
        {**c, "start": list(transform.apply(tuple(c["start"]))), "end": list(transform.apply(tuple(c["end"])))}
        for c in candidates
    ]

    diagonal = _gt_diagonal(gt_walls)
    result = {
        "plan_id": LABELED_PLAN,
        "n_candidates": len(candidates),
        "n_gt_walls": len(gt_walls),
        "gt_diagonal_mm": round(diagonal, 1),
        "anchor_guard": guard,
        "labeling_rule": {
            "orientation_tolerance_deg": LABEL_ORIENTATION_TOLERANCE_DEG,
            "min_overlap_fraction_of_candidate": LABEL_MIN_OVERLAP_FRACTION,
            "note": "NOT matching.py's Hungarian criterion -- a fragment covering part of a real "
            "GT wall counts as REAL evidence; SPURIOUS means it lies on no GT wall at all.",
        },
        # Computed FIRST and unconditionally: needs neither the transform nor
        # the labels, so it stands even when everything below it is void.
        "partition_f1_ceiling": {
            ch: partition_f1_ceiling(candidates, ch, len(gt_walls)) for ch in CHANNELS
        },
        "by_tau": {},
    }

    if not guard_ok:
        result["ABORTED"] = (
            "anchor-fit residuals do not reproduce the recorded pinned-transform residuals; "
            "the labeling frame is not the one those numbers were measured in -- no matrix reported"
        )
        return result

    for tau_frac in LABEL_TAU_FRACS:
        tau = tau_frac * diagonal
        labels, sanity = label_candidates(aligned, gt_walls, tau)
        coverage = sanity["n_gt_walls_with_at_least_one_real_candidate"] / max(1, sanity["n_gt_walls"])
        entry_out = {
            "tau_frac": tau_frac,
            "tau_mm": round(tau, 1),
            "sanity": {k: v for k, v in sanity.items() if k != "best_gt"},
            "gt_coverage": round(coverage, 3),
            # The labels are only meaningful if nearly every GT wall has SOME
            # candidate lying on it. Track V's problem is documented excess,
            # not absence, so poor coverage means SPURIOUS is absorbing walls
            # displaced by transform error -- i.e. the label is measuring
            # Blocker 2, not Blocker 1, and the matrix below it is void.
            "labels_trustworthy": coverage >= LABEL_MIN_GT_COVERAGE,
            "void_reason": None
            if coverage >= LABEL_MIN_GT_COVERAGE
            else (
                f"only {sanity['n_gt_walls_with_at_least_one_real_candidate']}/{sanity['n_gt_walls']} GT walls "
                f"have any candidate lying on them (bar: {LABEL_MIN_GT_COVERAGE:.0%}); SPURIOUS here conflates "
                "'not a wall' with 'displaced by coordinate-frame error' -- matrix not reportable as evidence"
            ),
        }
        if tau_frac == DEFAULT_LABEL_TAU_FRAC:
            entry_out["confusion"] = {ch: confusion(aligned, labels, ch) for ch in CHANNELS}
            entry_out["seqno_distribution"] = seqno_distribution(aligned, labels)
            entry_out["per_candidate"] = [
                {
                    "id": c["id"],
                    "label": labels[c["id"]],
                    "best_gt": sanity["best_gt"][c["id"]],
                    "length_mm": round(_length(tuple(c["start"]), tuple(c["end"])), 1),
                    "stroke_color": _channel_value(c, "stroke_color"),
                    "dashes": _channel_value(c, "dashes"),
                    "stroke_width": _channel_value(c, "stroke_width"),
                    "seqno_min": c["seqno_min"],
                    "seqno_max": c["seqno_max"],
                }
                for c in aligned
            ]
        result["by_tau"][str(tau_frac)] = entry_out

    if not result["by_tau"][str(DEFAULT_LABEL_TAU_FRAC)]["labels_trustworthy"]:
        result["frame_contamination_evidence"] = frame_contamination_evidence(aligned, gt_walls, dst)
    return result


def run_availability_only(entry) -> dict:
    """No transform, no labels -- just: what does the metadata look like over
    THIS plan's own wall-candidate population (not the whole page)? Valid on
    15x30 despite its untrustworthy transform, because nothing here is
    measured against GT."""
    built = build_candidates(AVAILABILITY_ONLY_PLAN, entry)
    candidates = built["candidates"]
    return {
        "plan_id": AVAILABILITY_ONLY_PLAN,
        "n_candidates": len(candidates),
        "note": "label-free: 15x30's pinned transform is 3-6 tau (handoff Blocker 2), so its "
        "candidates are not labeled against GT here.",
        "channels": {
            ch: {
                "n_distinct_values": len({_channel_value(c, ch) for c in candidates}),
                "counts": dict(Counter(_channel_value(c, ch) for c in candidates).most_common()),
            }
            for ch in CHANNELS
        },
    }


def _print_summary(labeled: dict, availability: dict) -> None:
    print("=" * 78)
    print(f"{labeled['plan_id']}: {labeled['n_candidates']} pre-split candidates vs {labeled['n_gt_walls']} GT walls")
    g = labeled["anchor_guard"]
    print(f"anchor guard: passed={g['passed']} reproduced={g['reproduced_residuals_mm']} recorded={g['recorded_residuals_mm']}")
    print("\n-- TRANSFORM-FREE BOUND: best wall-F1 any filter on this channel could reach")
    for ch, block in labeled["partition_f1_ceiling"].items():
        bp = block["best_possible"]
        print(
            f"     {ch:<14} buckets={list(block['bucket_sizes'].values())} "
            f"best_f1_ceiling={bp['f1_ceiling']} (keep {bp['selection_size']} of "
            f"{block['n_candidates']}) reaches_0.99={block['can_reach_exit_bar']}"
        )

    if "ABORTED" in labeled:
        print("ABORTED:", labeled["ABORTED"])
        return
    print()
    for tau_frac, block in labeled["by_tau"].items():
        s = block["sanity"]
        print(
            f"  tau={tau_frac}: REAL={s['n_real']} SPURIOUS={s['n_spurious']} | "
            f"GT walls covered {s['n_gt_walls_with_at_least_one_real_candidate']}/{s['n_gt_walls']}"
            f" | labels_trustworthy={block['labels_trustworthy']}"
        )
    main = labeled["by_tau"][str(DEFAULT_LABEL_TAU_FRAC)]
    if not main["labels_trustworthy"]:
        print(f"\n  !! LABELED MATRIX VOID: {main['void_reason']}")
        print("     (printed below for the record only -- not evidence)")
    for ch, block in main["confusion"].items():
        print(f"\n-- {ch}: {block['verdict']} (mixed candidates: {block['n_candidates_mixed']})")
        for row in block["table"]:
            print(f"     {row['value']:<28} REAL={row['REAL']:>3} SPURIOUS={row['SPURIOUS']:>3}  purity={row['purity']}")
    print("\n-- seqno (ordinal, distribution not matrix):")
    for cls, d in main["seqno_distribution"].items():
        print(f"     {cls:<9} {d}")

    fce = labeled.get("frame_contamination_evidence")
    if fce:
        print("\n-- WHY THE LABELS ARE VOID (walls detected but laterally displaced; mechanism NOT established):")
        print(
            f"     GT walls with an orientation+overlap-compatible candidate (no lateral bound): "
            f"{fce['n_gt_walls_with_an_orientation_and_overlap_compatible_candidate']}/{len(fce['per_gt_wall_lateral_offset'])}"
        )
        print(f"     lateral offset vs distance-from-anchors correlation: {fce['lateral_vs_anchor_distance_correlation']}")
        for axis, d in fce["lateral_offset_by_displacement_axis"].items():
            print(f"     displaced along {axis}: {d}")
        ea = fce["envelope_anisotropy"]
        print(f"     envelope: pred={ea['pred_envelope_mm']} gt={ea['gt_bbox_mm']} -> x {ea['x_error_pct']}%, y {ea['y_error_pct']}%")
        print(f"     x-scale signature: {fce['x_displacement_scale_signature']}")
    print("\n" + "=" * 78)
    print(f"{availability['plan_id']}: {availability['n_candidates']} candidates, label-free availability")
    for ch, block in availability["channels"].items():
        print(f"  {ch:<14} {block['n_distinct_values']} distinct: {block['counts']}")


def main() -> None:
    entries = {e.plan_id: e for e in load_registry()}
    labeled = run_labeled(entries[LABELED_PLAN])
    availability = run_availability_only(entries[AVAILABILITY_ONLY_PLAN])
    out = {"labeled": labeled, "availability_only": availability}
    OUT_PATH.write_text(json.dumps(out, indent=2), encoding="utf-8")
    _print_summary(labeled, availability)


if __name__ == "__main__":
    main()
