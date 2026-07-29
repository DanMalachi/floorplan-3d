"""Track V milestone 2 step 3a -- Blocker 1, segmentation-convention-mismatch
test (Dan's direct instruction, correcting both the prior session's and this
session's over-production framing).

The family-classification matrix showed sheet_border+dimension are only
7.2% of candidates by count -- killing them perfectly is not worth a
session. The real gap is RECALL: only 10/29 GT walls across both plans have
ANY one-to-one match at tau=0.01. Dan's prime hypothesis: a single GT wall
(long, continuous, human-traced) is being covered by several short pred
fragments, which simultaneously (a) inflates candidate count, (b) fails
strict one-to-one matching, (c) depresses precision -- one mechanism, three
symptoms, and it would explain why both full-population distortion
hypotheses from the frame-derivation session came back null (there was
never a distortion to find).

PRE-REGISTERED EXPECTATION (written before this script is run): coverage
will be HIGH (~0.7-0.9), not low (~0.35) -- per paper 5.2's framing that
Track V's geometric error is essentially zero and its risk is purely
semantic/representational, and per the over-production finding itself
(more pred fragments than GT walls only makes sense as a covering
explanation if the ink is mostly there, just chopped up). A low-coverage
result would falsify this and point upstream to dissect/select instead.

Method: segmentation-invariant coverage. For each GT wall, sample its
centerline and, for each sample, test whether ANY candidate in a given
population (buffer/union, not one-to-one Hungarian assignment) lies within
tau. Run this against TWO populations per GT wall to localize a miss:
  - select-stage segments (single raw strokes, pre-pairing) -- "did we even
    see ink here"
  - pair-stage candidates (paired, pre-split walls) -- "did a wall
    candidate form here"
Then, for GT walls with no one-to-one match, bucket by where coverage first
drops: (a) low at both stages = dissect/select never saw it; (b) high at
select but low at pair = pairing dropped it; (c) high at pair despite no
one-to-one match = it exists but fragmentation/overlap-ratio matching is
rejecting it -- the segmentation-mismatch mechanism itself.
"""

from __future__ import annotations

import hashlib
import json
import math
import statistics
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

TAU_PRIMARY = 0.01   # matches family-classification / baseline scripts
TAU_EXIT_BAR = 0.005  # Phase 2's actual exit-bar tau -- tighter, reported for context
CENTERLINE_SAMPLES = 21
COVERAGE_BUCKET_THRESHOLD = 0.5  # named split point for the death-bucket histogram, not a kill rule


def _point_to_segment_dist(pt, a, b) -> float:
    ax, ay = a
    bx, by = b
    px, py = pt
    dx, dy = bx - ax, by - ay
    length_sq = dx * dx + dy * dy
    if length_sq == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_sq))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def _coverage_fraction(gt_start, gt_end, segments: list[tuple[tuple[float, float], tuple[float, float]]], tau: float) -> float:
    covered = 0
    for k in range(CENTERLINE_SAMPLES):
        t = k / (CENTERLINE_SAMPLES - 1)
        pt = (gt_start[0] + t * (gt_end[0] - gt_start[0]), gt_start[1] + t * (gt_end[1] - gt_start[1]))
        best = min((_point_to_segment_dist(pt, a, b) for a, b in segments), default=math.inf)
        if best < tau:
            covered += 1
    return covered / CENTERLINE_SAMPLES


def run_plan(plan_id: str, entry) -> dict:
    pdf_path = REPO_ROOT / entry.source_file
    sha256 = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
    dissection = dissect(pdf_path)[0]
    raster_scale = _gt_scale(dissection.page_size_px)
    combined_scale = raster_scale * MM_PER_PRED_UNIT[plan_id]

    selection = select_axis_aligned(dissection)
    pair_result = pair_walls(selection, dissection.page_size_px)
    assemble_result = assemble(pair_result, scale_to_gt_frame=raster_scale, enable_splitting=False)

    select_segs_mm = [
        (
            (s.p0[0] * combined_scale, s.p0[1] * combined_scale),
            (s.p1[0] * combined_scale, s.p1[1] * combined_scale),
        )
        for s in selection.candidates
    ]
    pair_walls_mm = [
        {
            "id": w.id,
            "start": [w.start[0] * MM_PER_PRED_UNIT[plan_id], w.start[1] * MM_PER_PRED_UNIT[plan_id]],
            "end": [w.end[0] * MM_PER_PRED_UNIT[plan_id], w.end[1] * MM_PER_PRED_UNIT[plan_id]],
        }
        for w in assemble_result.walls
    ]
    pair_segs_mm = [(tuple(w["start"]), tuple(w["end"])) for w in pair_walls_mm]

    gt = json.loads((GT_DIR / f"{plan_id}.json").read_text(encoding="utf-8"))
    diagonal = plan_diagonal(gt["walls"])
    tau_primary_abs = TAU_PRIMARY * diagonal
    tau_exit_abs = TAU_EXIT_BAR * diagonal

    m = match_walls(pair_walls_mm, gt["walls"], TAU_PRIMARY, diagonal)
    matched_gt_ids = {gt["walls"][j]["id"] for _, j in m.pairs}

    rows = []
    for gw in gt["walls"]:
        gs, ge = tuple(gw["start"]), tuple(gw["end"])
        cov_select = _coverage_fraction(gs, ge, select_segs_mm, tau_primary_abs)
        cov_pair = _coverage_fraction(gs, ge, pair_segs_mm, tau_primary_abs)
        cov_pair_tight = _coverage_fraction(gs, ge, pair_segs_mm, tau_exit_abs)
        matched = gw["id"] in matched_gt_ids

        bucket = None
        if not matched:
            if cov_pair >= COVERAGE_BUCKET_THRESHOLD:
                bucket = "c_match_failure_despite_coverage"
            elif cov_select >= COVERAGE_BUCKET_THRESHOLD:
                bucket = "b_pair_dropped_it"
            else:
                bucket = "a_dissect_select_blind"

        rows.append(
            {
                "gt_wall_id": gw["id"],
                "matched_one_to_one_tau_0_01": matched,
                "coverage_select_tau_0_01": round(cov_select, 3),
                "coverage_pair_tau_0_01": round(cov_pair, 3),
                "coverage_pair_tau_0_005": round(cov_pair_tight, 3),
                "death_bucket": bucket,
            }
        )

    return {
        "plan_id": plan_id,
        "n_gt_walls": len(gt["walls"]),
        "n_matched": len(matched_gt_ids),
        "rows": rows,
    }


def _dist_stats(values: list[float]) -> dict:
    if not values:
        return {"n": 0}
    sorted_v = sorted(values)
    return {
        "n": len(values),
        "mean": round(statistics.mean(values), 3),
        "median": round(statistics.median(values), 3),
        "min": round(sorted_v[0], 3),
        "max": round(sorted_v[-1], 3),
        "q1": round(sorted_v[len(sorted_v) // 4], 3),
        "q3": round(sorted_v[(3 * len(sorted_v)) // 4], 3),
    }


def main() -> None:
    entries = {e.plan_id: e for e in load_registry()}
    per_plan = {}
    all_rows = []
    for plan_id in TARGET_PLAN_IDS:
        result = run_plan(plan_id, entries[plan_id])
        per_plan[plan_id] = result
        for r in result["rows"]:
            all_rows.append({**r, "plan_id": plan_id})

    coverage_pair_dist = _dist_stats([r["coverage_pair_tau_0_01"] for r in all_rows])
    coverage_select_dist = _dist_stats([r["coverage_select_tau_0_01"] for r in all_rows])
    coverage_pair_tight_dist = _dist_stats([r["coverage_pair_tau_0_005"] for r in all_rows])

    unmatched = [r for r in all_rows if not r["matched_one_to_one_tau_0_01"]]
    death_histogram = {}
    for bucket in ("a_dissect_select_blind", "b_pair_dropped_it", "c_match_failure_despite_coverage"):
        bucket_rows = [r for r in unmatched if r["death_bucket"] == bucket]
        death_histogram[bucket] = {
            "n": len(bucket_rows),
            "share_of_unmatched": round(len(bucket_rows) / len(unmatched), 4) if unmatched else None,
            "gt_wall_ids": [f"{r['plan_id']}:{r['gt_wall_id']}" for r in bucket_rows],
        }

    out = {
        "pre_registered_expectation": "coverage HIGH (~0.7-0.9), pointing to representation/merging defect, not upstream blindness",
        "tau_primary": TAU_PRIMARY,
        "tau_exit_bar": TAU_EXIT_BAR,
        "coverage_bucket_threshold": COVERAGE_BUCKET_THRESHOLD,
        "coverage_pair_distribution_tau_0_01": coverage_pair_dist,
        "coverage_select_distribution_tau_0_01": coverage_select_dist,
        "coverage_pair_distribution_tau_0_005": coverage_pair_tight_dist,
        "n_gt_walls_total": len(all_rows),
        "n_matched_total": len(all_rows) - len(unmatched),
        "n_unmatched_total": len(unmatched),
        "death_bucket_histogram": death_histogram,
        "per_plan": per_plan,
    }
    out_path = OUT_DIR / "step3a_coverage.json"
    out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "coverage_pair_distribution_tau_0_01": coverage_pair_dist,
                "coverage_select_distribution_tau_0_01": coverage_select_dist,
                "coverage_pair_distribution_tau_0_005": coverage_pair_tight_dist,
                "death_bucket_histogram": death_histogram,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
