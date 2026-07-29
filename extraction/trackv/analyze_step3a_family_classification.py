"""Track V milestone 2 step 3a -- Blocker 1, classification step (Dan's
direct instruction): label every pre-split over-produced candidate into
{sheet_border, dimension, furniture_fixture, other} across BOTH plans and
report the FULL confusion matrix (family x matched/spurious) with
population shares, before any kill rule is written.

Runs on the pre-split candidate set (`enable_splitting=False`) per the
handoff's standing convention -- classification is upstream of closure, and
post-split fragments would only add noise (each real wall's post-split
pieces would need re-collapsing before this question even makes sense).

Matched/spurious status is now computed under the DERIVED zero-fitted-
parameter transform (Blocker 2 closed), not the old anchor fit -- see
analyze_step3a_blocker1_baseline.py. tau=0.01 (plan-diagonal fraction) is
the primary threshold, matching that script and eval/metrics.engine.TAUS.

Family rules are geometric and named -- explicitly NOT thresholds fit to
make these two plans' numbers look good (the trap this project already fell
into once). Same formula, same constants, both plans; every constant is
expressed as a fraction of that plan's own page or GT-envelope diagonal, not
a raw pixel/mm number, so it does not encode either plan's specific scale.
These are first-pass classification thresholds, not kill rules -- refining
them after this matrix is reviewed is in scope; deciding what to DROP from
the candidate set on the strength of this label is explicitly not (that is
next session's job, gated on this report).
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from eval.metrics.matching import match_walls, plan_diagonal  # noqa: E402
from eval.registry.registry import load_registry  # noqa: E402
from extraction.trackv.run_step3a import _gt_scale  # noqa: E402
from extraction.trackv.assemble import assemble  # noqa: E402
from extraction.trackv.dissect import dissect  # noqa: E402
from extraction.trackv.pair import pair_walls  # noqa: E402
from extraction.trackv.select import select_axis_aligned  # noqa: E402

OUT_DIR = Path(__file__).parent / "out"
GT_DIR = REPO_ROOT / "data" / "corpus" / "gt_provisional"

TARGET_PLAN_IDS = ["15x30-ft-Best-House-Plan-Model", "30x50-Model-landscape"]

LEGACY_METERS_PER_PIXEL = {
    "15x30-ft-Best-House-Plan-Model": 0.008323667459886908,
    "30x50-Model-landscape": 0.012918215560344833,
}
MM_PER_PRED_UNIT = {k: v * 1000.0 for k, v in LEGACY_METERS_PER_PIXEL.items()}

TAU_PRIMARY = 0.01

# Named thresholds, each a fraction of a diagonal -- see module docstring.
PAGE_EDGE_TOL_FRAC = 0.01       # "near the page's own perimeter"
BORDER_MIN_LEN_FRAC = 0.5       # "spans most of one page dimension" (physical page-edge variant)
BORDER_ENVELOPE_SPAN_FRAC = 0.7  # "spans most of the GT envelope's matching dimension" (envelope-tracing-loop variant)
BORDER_OFFSET_MAX_FRAC = 0.2     # how far outside the GT envelope a tracing frame may sit and still count as one loop
OUTSIDE_ENVELOPE_BUFFER_FRAC = 0.02  # tolerance around GT bbox before counting a point "outside"
DIMENSION_OUTSIDE_FRAC = 0.8     # "mostly outside the building envelope"
FURNITURE_INSIDE_FRAC = 0.8      # "mostly inside the building envelope"
FURNITURE_MAX_LEN_FRAC = 0.12    # "short-stroke field"
SAMPLES = 9


def _bbox(points):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return min(xs), min(ys), max(xs), max(ys)


def _outside_fraction(start, end, bbox, buffer):
    x0, y0, x1, y1 = bbox
    x0, y0, x1, y1 = x0 - buffer, y0 - buffer, x1 + buffer, y1 + buffer
    n_outside = 0
    for k in range(SAMPLES):
        t = k / (SAMPLES - 1)
        px = start[0] + t * (end[0] - start[0])
        py = start[1] + t * (end[1] - start[1])
        if px < x0 or px > x1 or py < y0 or py > y1:
            n_outside += 1
    return n_outside / SAMPLES


def _near_page_edge(p, page_bbox, tol):
    x0, y0, x1, y1 = page_bbox
    return (
        abs(p[0] - x0) <= tol
        or abs(p[0] - x1) <= tol
        or abs(p[1] - y0) <= tol
        or abs(p[1] - y1) <= tol
    )


def _envelope_tracing_loop_side(start, end, gt_bbox) -> bool:
    """True if this axis-aligned candidate is a near-full-span parallel
    offset just outside one of the GT bbox's four edges -- one side of a
    closed loop tracing the building envelope (found directly against
    30x50: W0/W22/W23/W38 form exactly this, offset ~1000mm outside GT
    bbox on all four sides -- NOT touching the physical page edge, which
    is why the page-edge-only rule below missed it entirely on first pass).
    """
    x0, y0, x1, y1 = gt_bbox
    gt_w, gt_h = x1 - x0, y1 - y0
    dx, dy = end[0] - start[0], end[1] - start[1]
    horizontal = abs(dx) >= abs(dy)
    length = math.hypot(dx, dy)

    if horizontal:
        span_ok = length >= BORDER_ENVELOPE_SPAN_FRAC * gt_w
        y_const = (start[1] + end[1]) / 2.0
        offset = min(abs(y_const - y0), abs(y_const - y1))
        outside = y_const < y0 or y_const > y1
        x_overlaps = min(start[0], end[0]) < x1 and max(start[0], end[0]) > x0
        return span_ok and outside and x_overlaps and offset <= BORDER_OFFSET_MAX_FRAC * gt_h
    else:
        span_ok = length >= BORDER_ENVELOPE_SPAN_FRAC * gt_h
        x_const = (start[0] + end[0]) / 2.0
        offset = min(abs(x_const - x0), abs(x_const - x1))
        outside = x_const < x0 or x_const > x1
        y_overlaps = min(start[1], end[1]) < y1 and max(start[1], end[1]) > y0
        return span_ok and outside and y_overlaps and offset <= BORDER_OFFSET_MAX_FRAC * gt_w


def classify(wall, page_bbox, page_diag, gt_bbox, gt_diag) -> str:
    start, end = tuple(wall["start"]), tuple(wall["end"])
    length = math.hypot(end[0] - start[0], end[1] - start[1])

    both_near_edge = _near_page_edge(start, page_bbox, PAGE_EDGE_TOL_FRAC * page_diag) and _near_page_edge(
        end, page_bbox, PAGE_EDGE_TOL_FRAC * page_diag
    )
    if both_near_edge and length >= BORDER_MIN_LEN_FRAC * page_diag:
        return "sheet_border"

    if _envelope_tracing_loop_side(start, end, gt_bbox):
        return "sheet_border"

    outside_frac = _outside_fraction(start, end, gt_bbox, OUTSIDE_ENVELOPE_BUFFER_FRAC * gt_diag)
    if outside_frac >= DIMENSION_OUTSIDE_FRAC:
        return "dimension"

    inside_frac = 1.0 - outside_frac
    if inside_frac >= FURNITURE_INSIDE_FRAC and length <= FURNITURE_MAX_LEN_FRAC * gt_diag:
        return "furniture_fixture"

    return "other"


def run_plan(plan_id: str, entry) -> dict:
    pdf_path = REPO_ROOT / entry.source_file
    sha256 = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
    dissection = dissect(pdf_path)[0]
    raster_scale = _gt_scale(dissection.page_size_px)
    combined_scale = raster_scale * MM_PER_PRED_UNIT[plan_id]

    selection = select_axis_aligned(dissection)
    pair_result = pair_walls(selection, dissection.page_size_px)
    assemble_result = assemble(pair_result, scale_to_gt_frame=raster_scale, enable_splitting=False)

    walls_mm = [
        {
            "id": w.id,
            "start": [w.start[0] * MM_PER_PRED_UNIT[plan_id], w.start[1] * MM_PER_PRED_UNIT[plan_id]],
            "end": [w.end[0] * MM_PER_PRED_UNIT[plan_id], w.end[1] * MM_PER_PRED_UNIT[plan_id]],
            "thickness": w.thickness * MM_PER_PRED_UNIT[plan_id],
        }
        for w in assemble_result.walls
    ]

    gt = json.loads((GT_DIR / f"{plan_id}.json").read_text(encoding="utf-8"))
    diagonal = plan_diagonal(gt["walls"])
    m = match_walls(walls_mm, gt["walls"], TAU_PRIMARY, diagonal)
    matched_ids = {walls_mm[i]["id"] for i, _ in m.pairs}

    page_bbox = (0.0, 0.0, dissection.page_size_px[0] * combined_scale, dissection.page_size_px[1] * combined_scale)
    page_diag = math.hypot(page_bbox[2] - page_bbox[0], page_bbox[3] - page_bbox[1])
    gt_bbox = _bbox([pt for w in gt["walls"] for pt in (w["start"], w["end"])])
    gt_diag = math.hypot(gt_bbox[2] - gt_bbox[0], gt_bbox[3] - gt_bbox[1])

    rows = []
    for w in walls_mm:
        family = classify(w, page_bbox, page_diag, gt_bbox, gt_diag)
        rows.append(
            {
                "id": w["id"],
                "family": family,
                "matched": w["id"] in matched_ids,
                "length_mm": round(math.hypot(w["end"][0] - w["start"][0], w["end"][1] - w["start"][1]), 1),
                "start": [round(w["start"][0], 1), round(w["start"][1], 1)],
                "end": [round(w["end"][0], 1), round(w["end"][1], 1)],
            }
        )

    return {
        "plan_id": plan_id,
        "n_candidates": len(rows),
        "n_gt_walls": len(gt["walls"]),
        "n_matched_tau_0_01": len(matched_ids),
        "page_bbox_mm": page_bbox,
        "gt_bbox_mm": gt_bbox,
        "rows": rows,
    }


def build_confusion_matrix(all_rows: list[dict]) -> dict:
    families = ["sheet_border", "dimension", "furniture_fixture", "other"]
    total = len(all_rows)
    matrix = {}
    for fam in families:
        fam_rows = [r for r in all_rows if r["family"] == fam]
        n = len(fam_rows)
        n_matched = sum(1 for r in fam_rows if r["matched"])
        n_spurious = n - n_matched
        matrix[fam] = {
            "n": n,
            "share_of_total": round(n / total, 4) if total else 0.0,
            "n_matched": n_matched,
            "n_spurious": n_spurious,
            "spurious_share_within_family": round(n_spurious / n, 4) if n else None,
        }
    return {"total_candidates": total, "by_family": matrix}


def main() -> None:
    entries = {e.plan_id: e for e in load_registry()}
    per_plan = {}
    all_rows_tagged = []
    for plan_id in TARGET_PLAN_IDS:
        result = run_plan(plan_id, entries[plan_id])
        per_plan[plan_id] = result
        for r in result["rows"]:
            all_rows_tagged.append({**r, "plan_id": plan_id})

    confusion_overall = build_confusion_matrix(all_rows_tagged)
    confusion_by_plan = {
        plan_id: build_confusion_matrix([r for r in all_rows_tagged if r["plan_id"] == plan_id])
        for plan_id in TARGET_PLAN_IDS
    }

    out = {
        "thresholds": {
            "tau_primary": TAU_PRIMARY,
            "page_edge_tol_frac": PAGE_EDGE_TOL_FRAC,
            "border_min_len_frac": BORDER_MIN_LEN_FRAC,
            "outside_envelope_buffer_frac": OUTSIDE_ENVELOPE_BUFFER_FRAC,
            "dimension_outside_frac": DIMENSION_OUTSIDE_FRAC,
            "furniture_inside_frac": FURNITURE_INSIDE_FRAC,
            "furniture_max_len_frac": FURNITURE_MAX_LEN_FRAC,
        },
        "confusion_matrix_overall": confusion_overall,
        "confusion_matrix_by_plan": confusion_by_plan,
        "per_plan": per_plan,
    }
    out_path = OUT_DIR / "step3a_family_classification.json"
    out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps({"confusion_matrix_overall": confusion_overall, "confusion_matrix_by_plan": confusion_by_plan}, indent=2))


if __name__ == "__main__":
    main()
