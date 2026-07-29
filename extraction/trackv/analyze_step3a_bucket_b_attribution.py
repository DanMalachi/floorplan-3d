"""Track V milestone 2 step 3a -- Blocker 1, bucket (b) attribution
("select saw it, pair dropped it" -- 10/19 unmatched GT walls, the single
largest identified loss). Bisects into Dan's two named suspects PLUS
whatever the data actually shows, before any `pair.py` logic changes.

PRE-REGISTERED SPLIT (Dan's, written before running, moderate confidence --
one over-prediction already logged this phase): no-parallel-partner-found
DOMINATES thickness-outlier-rejection, at least 60/40. Reasoning: a face
whose partner is coincident, shared with an adjacent wall, or outside the
search band yields no pair at all, and those walls remain stuck at
face-offset geometry -- consistent with the select/pair tau-crossover.

Method: replicates `pair_walls()`'s internal stages up to (but not
including) `_collinear_merge` by importing its PURE, already-tested helper
functions directly -- does not modify pair.py, does not touch eval/. For
every select-stage segment covering a bucket-(b) GT wall (same
orientation+centerline-offset+along-span acceptance test as
`analyze_step3a_coverage_oriented.py`), attributes its fate to exactly one
of:
  - below_length_floor    -- excluded by pair.py's own MIN_CANDIDATE_LENGTH_FRAC
                              before pairing is even attempted (a third path,
                              not one of Dan's two named suspects -- reported
                              honestly if it appears, not folded into either)
  - no_raw_partner_found  -- never entered a raw pair at all within the
                              search window (Dan's "no parallel partner found")
  - lost_greedy_competition -- had a raw candidate, but greedy one-to-one
                              assignment gave the partner to a better-fitting
                              face elsewhere (also "no parallel partner
                              found" from this wall's perspective -- tracked
                              as its own sub-count for transparency)
  - thickness_outlier_rejected -- survived to an accepted pair, then
                              rejected at pair.py's plausible-thickness-
                              cluster check (Dan's other named suspect)
  - survived_unexplained  -- reached the wall-candidate stage clean; if this
                              appears for a bucket-(b) wall, the drop must be
                              downstream (collinear-merge or beyond) and
                              neither named suspect explains it -- reported,
                              not hidden.

Per-wall attribution, not an aggregate, per Dan's instruction.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from eval.registry.registry import load_registry  # noqa: E402
from extraction.trackv.run_step3a import _gt_scale  # noqa: E402
from extraction.trackv.dissect import dissect  # noqa: E402
from extraction.trackv.pair import (  # noqa: E402
    MAX_THICKNESS_SEARCH_FRAC,
    MIN_CANDIDATE_LENGTH_FRAC,
    _axis_frame,
    _bucket_for,
    _greedy_select_pairs,
    _project_bucket,
    _raw_pairs_in_bucket,
    _thickness_in_plausible_cluster,
    _thickness_plausible_clusters,
)
from extraction.trackv.select import select_axis_aligned  # noqa: E402

OUT_DIR = Path(__file__).parent / "out"
GT_DIR = REPO_ROOT / "data" / "corpus" / "gt_provisional"
COVERAGE_PATH = OUT_DIR / "step3a_coverage_oriented.json"

TARGET_PLAN_IDS = ["15x30-ft-Best-House-Plan-Model", "30x50-Model-landscape"]

LEGACY_METERS_PER_PIXEL = {
    "15x30-ft-Best-House-Plan-Model": 0.008323667459886908,
    "30x50-Model-landscape": 0.012918215560344833,
}
MM_PER_PRED_UNIT = {k: v * 1000.0 for k, v in LEGACY_METERS_PER_PIXEL.items()}
TAU_PRIMARY = 0.01


def _wall_angle_mod180(a, b) -> float:
    return math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) % 180.0


def _circular_dist_mod180(x: float, y: float) -> float:
    d = abs(x - y) % 180.0
    return min(d, 180.0 - d)


def _segment_status_map(selection, page_size_px) -> dict[int, str]:
    """Re-derives pair_walls()'s internal per-segment fate using its own
    pure helpers, without calling pair_walls() itself (which discards this
    detail) and without modifying pair.py."""
    diagonal = math.hypot(*page_size_px)
    length_floor = MIN_CANDIDATE_LENGTH_FRAC * diagonal
    long_enough = {i for i, seg in enumerate(selection.candidates) if seg.length >= length_floor}

    bucket_of = {i: _bucket_for(selection.candidates[i].angle_deg, selection.theta_deg) for i in long_enough}
    indices_a = [i for i in long_enough if bucket_of[i] == "A"]
    indices_b = [i for i in long_enough if bucket_of[i] == "B"]

    d_a, n_a = _axis_frame(selection.theta_deg)
    max_search_window = MAX_THICKNESS_SEARCH_FRAC * diagonal

    proj_a = _project_bucket(indices_a, selection.candidates, d_a, n_a)
    proj_b = _project_bucket(indices_b, selection.candidates, n_a, d_a)
    raw_a = _raw_pairs_in_bucket(proj_a, max_search_window)
    raw_b = _raw_pairs_in_bucket(proj_b, max_search_window)

    accepted_a = _greedy_select_pairs(raw_a)
    accepted_b = _greedy_select_pairs(raw_b)
    all_accepted = [p for p in accepted_a] + [p for p in accepted_b]
    thicknesses = [p[1] for p in all_accepted]
    plausible_clusters = _thickness_plausible_clusters(thicknesses, diagonal)

    raw_paired_indices = set()
    for p in raw_a + raw_b:
        _overlap_len, _thickness, i_idx, j_idx, _lo, _hi, _perp_mid = p
        raw_paired_indices.add(i_idx)
        raw_paired_indices.add(j_idx)

    accepted_thickness_of: dict[int, float] = {}
    for p in all_accepted:
        _overlap_len, thickness, i_idx, j_idx, _lo, _hi, _perp_mid = p
        accepted_thickness_of[i_idx] = thickness
        accepted_thickness_of[j_idx] = thickness

    status: dict[int, str] = {}
    for i in range(len(selection.candidates)):
        if i not in long_enough:
            status[i] = "below_length_floor"
        elif i not in raw_paired_indices:
            status[i] = "no_raw_partner_found"
        elif i not in accepted_thickness_of:
            status[i] = "lost_greedy_competition"
        elif not _thickness_in_plausible_cluster(accepted_thickness_of[i], plausible_clusters):
            status[i] = "thickness_outlier_rejected"
        else:
            status[i] = "survived_unexplained"
    return status


def main() -> None:
    coverage = json.loads(COVERAGE_PATH.read_text(encoding="utf-8"))
    entries = {e.plan_id: e for e in load_registry()}

    per_wall_results = []

    for plan_id in TARGET_PLAN_IDS:
        rows_by_id = {r["gt_wall_id"]: r for r in coverage["per_plan"][plan_id]["rows"]}
        bucket_b_ids = [wid for wid, r in rows_by_id.items() if r.get("death_bucket") == "b_pair_dropped_it"]
        if not bucket_b_ids:
            continue

        entry = entries[plan_id]
        dissection = dissect(REPO_ROOT / entry.source_file)[0]
        raster_scale = _gt_scale(dissection.page_size_px)
        combined_scale = raster_scale * MM_PER_PRED_UNIT[plan_id]
        selection = select_axis_aligned(dissection)
        angular_tol = selection.angular_tolerance_deg

        status_map = _segment_status_map(selection, dissection.page_size_px)

        gt = json.loads((GT_DIR / f"{plan_id}.json").read_text(encoding="utf-8"))
        gt_by_id = {w["id"]: w for w in gt["walls"]}
        diagonal = math.hypot(
            max(pt[0] for w in gt["walls"] for pt in (w["start"], w["end"]))
            - min(pt[0] for w in gt["walls"] for pt in (w["start"], w["end"])),
            max(pt[1] for w in gt["walls"] for pt in (w["start"], w["end"]))
            - min(pt[1] for w in gt["walls"] for pt in (w["start"], w["end"])),
        )
        tau_abs = TAU_PRIMARY * diagonal

        for wid in bucket_b_ids:
            gw = gt_by_id[wid]
            gs, ge = tuple(gw["start"]), tuple(gw["end"])
            wall_len = math.hypot(ge[0] - gs[0], ge[1] - gs[1])
            wall_angle = _wall_angle_mod180(gs, ge)
            unit_along = ((ge[0] - gs[0]) / wall_len, (ge[1] - gs[1]) / wall_len)
            unit_perp = (-unit_along[1], unit_along[0])

            covering_indices = []
            for i, s in enumerate(selection.candidates):
                a = (s.p0[0] * combined_scale, s.p0[1] * combined_scale)
                b = (s.p1[0] * combined_scale, s.p1[1] * combined_scale)
                seg_angle = _wall_angle_mod180(a, b)
                if _circular_dist_mod180(seg_angle, wall_angle) > angular_tol:
                    continue
                mid = ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0)
                offset = (mid[0] - gs[0]) * unit_perp[0] + (mid[1] - gs[1]) * unit_perp[1]
                if abs(offset) > tau_abs:
                    continue
                along_proj = (mid[0] - gs[0]) * unit_along[0] + (mid[1] - gs[1]) * unit_along[1]
                if along_proj < -tau_abs or along_proj > wall_len + tau_abs:
                    continue
                covering_indices.append(i)

            statuses = [status_map[i] for i in covering_indices]
            counts = {}
            for st in statuses:
                counts[st] = counts.get(st, 0) + 1
            primary = max(counts, key=counts.get) if counts else "no_covering_segments_found"

            per_wall_results.append(
                {
                    "plan_id": plan_id,
                    "gt_wall_id": wid,
                    "n_covering_select_segments": len(covering_indices),
                    "status_counts": counts,
                    "primary_reason": primary,
                }
            )

    reason_totals: dict[str, int] = {}
    for r in per_wall_results:
        reason_totals[r["primary_reason"]] = reason_totals.get(r["primary_reason"], 0) + 1

    n_total = len(per_wall_results)
    no_partner_total = reason_totals.get("no_raw_partner_found", 0) + reason_totals.get("lost_greedy_competition", 0)
    thickness_total = reason_totals.get("thickness_outlier_rejected", 0)
    split_denominator = no_partner_total + thickness_total

    out = {
        "pre_registered_split": "no-parallel-partner-found dominates thickness-outlier-rejection, at least 60/40",
        "n_bucket_b_walls": n_total,
        "primary_reason_totals": reason_totals,
        "no_parallel_partner_total_(raw+greedy)": no_partner_total,
        "thickness_outlier_total": thickness_total,
        "observed_split_no_partner_vs_thickness": (
            {
                "no_partner_pct": round(100 * no_partner_total / split_denominator, 1),
                "thickness_outlier_pct": round(100 * thickness_total / split_denominator, 1),
            }
            if split_denominator
            else None
        ),
        "per_wall": per_wall_results,
    }
    out_path = OUT_DIR / "step3a_bucket_b_attribution.json"
    out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
