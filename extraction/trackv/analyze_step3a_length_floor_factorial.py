"""Track V milestone 2 step 3a -- Blocker 1: joint simulation of L-window
(physical search-window prior, prior commit) and L-length-floor (physical
minimum wall-face-length prior, this script), alone and combined. Same
factorial discipline as `analyze_step3a_pairing_factorial.py`: simulation
only, `pair.py`/`assemble.py`/`eval/` unmodified, baseline cell must
reproduce the shipped pipeline exactly.

PRE-REGISTERED EXPECTATION, stated BEFORE running because the length-floor
test already makes it derivable: for the 6 target walls, EVERY opposite-
side segment found was either absent at any length (NEVER_PRESENT, 3
walls) or already longer than the CURRENT, unmodified length floor
(PRESENT_AND_KEPT, 3 walls, shortest surviving example 2442mm against a
163-253mm floor). Loosening the floor cannot help a segment that already
clears it, and cannot help where nothing exists at any length. Expect
L-length-floor alone to recover ZERO of these 6 walls and to move pooled
recall on this corpus little or not at all -- if it moves recall
non-trivially, that recall is coming from OTHER walls this investigation
has not examined, not from the diagnosed 6, and that must be said plainly
rather than credited to this hypothesis.

THE PHYSICAL PRIOR, stated so it can be checked without reference to
15x30/30x50 -- same discipline as the L-window prior:

    MIN_WALL_FACE_LENGTH_MM = 200

  The shortest common freestanding architectural wall element -- a pier
  between two openings, a short return at a corner, a jamb stub -- rarely
  measures under roughly 200mm in residential construction. Below that, a
  line is far more likely a dimension tick, arrowhead, or hatch remnant --
  exactly the population `pair.py`'s own comment on `MIN_CANDIDATE_LENGTH_
  FRAC` already names as the reason a floor exists at all. This mirrors
  the existing rationale; it changes only WHERE the bound comes from (an
  absolute physical minimum, not a page-relative fraction of diagonal).
"""

from __future__ import annotations

import itertools
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
from extraction.trackv.pair import (  # noqa: E402
    MAX_THICKNESS_SEARCH_FRAC,
    MIN_CANDIDATE_LENGTH_FRAC,
    PairFunnel,
    PairResult,
    WallCandidate,
    _axis_frame,
    _bucket_for,
    _bucket_wall,
    _collinear_merge,
    _greedy_select_pairs,
    _project_bucket,
    _raw_pairs_in_bucket,
    _thickness_in_plausible_cluster,
    _thickness_plausible_clusters,
)
from extraction.trackv.select import select_axis_aligned  # noqa: E402

OUT_DIR = Path(__file__).parent / "out"
GT_DIR = REPO_ROOT / "data" / "corpus" / "gt_provisional"

TARGET_PLAN_IDS = ["15x30-ft-Best-House-Plan-Model", "30x50-Model-landscape"]

LEGACY_METERS_PER_PIXEL = {
    "15x30-ft-Best-House-Plan-Model": 0.008323667459886908,
    "30x50-Model-landscape": 0.012918215560344833,
}
MM_PER_PRED_UNIT = {k: v * 1000.0 for k, v in LEGACY_METERS_PER_PIXEL.items()}

WALL_THICKNESS_MAX_MM = 500.0  # L-window prior, unchanged from the prior factorial
MIN_WALL_FACE_LENGTH_MM = 200.0  # L-length-floor prior, new this script

TAUS = (0.01, 0.005)


def pair_walls_variant(selection, page_size_px, mm_per_native, use_window, use_length_floor):
    diagonal = math.hypot(*page_size_px)
    funnel = PairFunnel()

    if use_length_floor:
        length_floor = MIN_WALL_FACE_LENGTH_MM / mm_per_native
    else:
        length_floor = MIN_CANDIDATE_LENGTH_FRAC * diagonal

    long_enough = [i for i, seg in enumerate(selection.candidates) if seg.length >= length_floor]
    funnel.n_candidates_below_length_floor = len(selection.candidates) - len(long_enough)

    bucket_of = {i: _bucket_for(selection.candidates[i].angle_deg, selection.theta_deg) for i in long_enough}
    indices_a = [i for i in long_enough if bucket_of[i] == "A"]
    indices_b = [i for i in long_enough if bucket_of[i] == "B"]

    d_a, n_a = _axis_frame(selection.theta_deg)

    if use_window:
        max_search_window = WALL_THICKNESS_MAX_MM / mm_per_native
    else:
        max_search_window = MAX_THICKNESS_SEARCH_FRAC * diagonal

    proj_a = _project_bucket(indices_a, selection.candidates, d_a, n_a)
    proj_b = _project_bucket(indices_b, selection.candidates, n_a, d_a)
    raw_a = _raw_pairs_in_bucket(proj_a, max_search_window)
    raw_b = _raw_pairs_in_bucket(proj_b, max_search_window)
    funnel.n_raw_pairs_formed = len(raw_a) + len(raw_b)

    accepted_a = _greedy_select_pairs(raw_a)
    accepted_b = _greedy_select_pairs(raw_b)
    funnel.n_pairs_accepted_greedy = len(accepted_a) + len(accepted_b)

    all_accepted = [("A", p) for p in accepted_a] + [("B", p) for p in accepted_b]
    thicknesses = [p[1] for _bucket, p in all_accepted]
    plausible_clusters = _thickness_plausible_clusters(thicknesses, diagonal)
    funnel.thickness_clusters = plausible_clusters

    walls: list[WallCandidate] = []
    for bucket, (overlap_len, thickness, i_idx, j_idx, lo, hi, perp_mid) in all_accepted:
        if not _thickness_in_plausible_cluster(thickness, plausible_clusters):
            funnel.n_pairs_rejected_thickness_outlier += 1
            continue
        along_dir, perp_dir = (d_a, n_a) if bucket == "A" else (n_a, d_a)
        start, end = _bucket_wall(along_dir, perp_dir, lo, hi, perp_mid, bucket)
        walls.append(
            WallCandidate(
                start=start, end=end, thickness=abs(thickness), axis_bucket=bucket,
                source_segment_indices=(i_idx, j_idx), member_source_indices=tuple(sorted((i_idx, j_idx))),
            )
        )

    merged_walls, opening_candidates = _collinear_merge(walls, d_a, n_a, diagonal)
    funnel.n_merges_applied = len(walls) - len(merged_walls) + len(opening_candidates)
    funnel.n_opening_candidates = len(opening_candidates)

    return PairResult(walls=merged_walls, opening_candidates=opening_candidates, funnel=funnel, pre_merge_walls=walls)


def run_cell(plan_id, dissection, selection, gt, use_window, use_length_floor):
    raster_scale = _gt_scale(dissection.page_size_px)
    mm_per_native = raster_scale * MM_PER_PRED_UNIT[plan_id]
    pair_result = pair_walls_variant(selection, dissection.page_size_px, mm_per_native, use_window, use_length_floor)
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
    diagonal_gt = plan_diagonal(gt["walls"])
    per_tau = {}
    for tau in TAUS:
        m = match_walls(walls_mm, gt["walls"], tau, diagonal_gt)
        matched_gt = {gt["walls"][j]["id"] for _, j in m.pairs}
        per_tau[str(tau)] = {"tp": m.tp, "n_pred": m.n_pred, "n_gt": m.n_gt, "matched_gt_ids": sorted(matched_gt)}
    return {"n_candidates": len(walls_mm), "per_tau": per_tau}


def main() -> None:
    entries = {e.plan_id: e for e in load_registry()}
    loaded = {}
    for plan_id in TARGET_PLAN_IDS:
        dissection = dissect(REPO_ROOT / entries[plan_id].source_file)[0]
        selection = select_axis_aligned(dissection)
        gt = json.loads((GT_DIR / f"{plan_id}.json").read_text(encoding="utf-8"))
        loaded[plan_id] = {"dissection": dissection, "selection": selection, "gt": gt}

    cells = {}
    for use_window, use_length_floor in itertools.product([False, True], repeat=2):
        name = "+".join(n for n, on in zip(("window", "length_floor"), (use_window, use_length_floor)) if on) or "baseline(none)"
        per_plan = {
            pid: run_cell(pid, loaded[pid]["dissection"], loaded[pid]["selection"], loaded[pid]["gt"], use_window, use_length_floor)
            for pid in TARGET_PLAN_IDS
        }
        pooled = {}
        for tau in TAUS:
            tp = sum(per_plan[p]["per_tau"][str(tau)]["tp"] for p in TARGET_PLAN_IDS)
            n_pred = sum(per_plan[p]["per_tau"][str(tau)]["n_pred"] for p in TARGET_PLAN_IDS)
            n_gt = sum(per_plan[p]["per_tau"][str(tau)]["n_gt"] for p in TARGET_PLAN_IDS)
            precision = tp / n_pred if n_pred else 0.0
            recall = tp / n_gt if n_gt else 0.0
            f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
            pooled[str(tau)] = {"tp": tp, "precision": round(precision, 4), "recall": round(recall, 4), "f1": round(f1, 4)}
        cells[name] = {"pooled": pooled, "per_plan": per_plan}

    # which of the 6 diagnosed walls does each cell recover, at tau=0.01?
    target_walls = [
        ("15x30-ft-Best-House-Plan-Model", "w_s2"), ("15x30-ft-Best-House-Plan-Model", "w_s4"),
        ("15x30-ft-Best-House-Plan-Model", "w_s6"), ("30x50-Model-landscape", "w_s111"),
        ("30x50-Model-landscape", "w_s117"), ("30x50-Model-landscape", "w_s142"),
    ]
    recovered_by_cell = {}
    for name, c in cells.items():
        recovered = []
        for plan_id, wid in target_walls:
            if wid in c["per_plan"][plan_id]["per_tau"]["0.01"]["matched_gt_ids"]:
                recovered.append(f"{plan_id.split('-')[0]}:{wid}")
        recovered_by_cell[name] = recovered

    out = {
        "physical_priors": {"window_max_mm": WALL_THICKNESS_MAX_MM, "min_wall_face_length_mm": MIN_WALL_FACE_LENGTH_MM},
        "cells": cells,
        "recovered_of_6_diagnosed_walls_at_tau_0_01": recovered_by_cell,
    }
    (OUT_DIR / "step3a_length_floor_factorial.json").write_text(json.dumps(out, indent=2), encoding="utf-8")

    print(f"{'cell':22} {'cand':>5} {'P@.01':>7} {'R@.01':>7} {'F1@.01':>7} {'P@.005':>7} {'R@.005':>7} {'F1@.005':>8}   recovered(of 6)")
    for name, c in cells.items():
        p = c["pooled"]
        n_cand = sum(c["per_plan"][x]["n_candidates"] for x in TARGET_PLAN_IDS)
        rec = recovered_by_cell[name]
        print(
            f"{name:22} {n_cand:5} {p['0.01']['precision']:7.4f} {p['0.01']['recall']:7.4f} {p['0.01']['f1']:7.4f} "
            f"{p['0.005']['precision']:7.4f} {p['0.005']['recall']:7.4f} {p['0.005']['f1']:8.4f}   {len(rec)} {rec}"
        )


if __name__ == "__main__":
    main()
