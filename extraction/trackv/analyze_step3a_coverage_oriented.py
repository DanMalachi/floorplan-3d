"""Track V milestone 2 step 3a -- Blocker 1, CORRECTED coverage measurement.

Supersedes `analyze_step3a_coverage.py` / `out/step3a_coverage.json`.
Reason: that script's `_coverage_fraction` matched each GT-wall centerline
sample to the nearest candidate SEGMENT REGARDLESS OF ORIENTATION. Every
wall endpoint sits at a junction where a crossing wall's corner is trivially
within tau -- confirmed directly on 15x30's `w_s23` (bucket c): ~30% real
same-orientation coverage near one end, a real gap in the middle, then
false "coverage" from an unrelated perpendicular candidate near the other
end. The old metric could not tell real same-line ink from an incidental
nearby crossing wall. Do not use the old numbers; they are retired, not
merely caveated.

PRE-REGISTERED EXPECTATION (Dan's, written before running): bucket (c)
shrinks substantially, (a)+(b) grow, and select-stage coverage falls
materially below the old 0.887. Rationale: cross-axis contamination
inflates coverage most for walls with NO real same-line ink -- exactly the
population the old metric sorted into (c). If (c) survives roughly intact,
the model of the failure is wrong again and that must be stated plainly,
not massaged.

Fix: a candidate counts toward a GT wall's coverage ONLY if (i) its
direction is within `selection.angular_tolerance_deg` of that wall's
direction (mod 180 -- undirected lines) AND (ii) its perpendicular offset
from the wall's own centerline (infinite line through the wall, not the
segment) is within tau. Reuses `selection.angular_tolerance_deg` -- already
computed by `select.py`, already surfaced in the step3a funnel report --
rather than inventing a second tolerance. Nearest-candidate-any-orientation
is never used as a fallback: a wall with zero orientation-and-offset-
compatible candidates gets coverage 0, full stop.

Also reports, per stage, how much of the old metric's coverage number was
contamination (old minus corrected) -- the number that justifies retiring
the old table rather than merely footnoting it.
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

TAUS_REPORTED = (0.01, 0.005)  # both requested explicitly this round
CENTERLINE_SAMPLES = 21
COVERAGE_BUCKET_THRESHOLD = 0.5  # unchanged from the retired script -- same named split point


def _wall_angle_mod180(a, b) -> float:
    return math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) % 180.0


def _circular_dist_mod180(x: float, y: float) -> float:
    d = abs(x - y) % 180.0
    return min(d, 180.0 - d)


def _perp_offset(pt, origin, unit_perp) -> float:
    return (pt[0] - origin[0]) * unit_perp[0] + (pt[1] - origin[1]) * unit_perp[1]


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


def _oriented_coverage(
    gt_start, gt_end, segments: list[tuple[tuple[float, float], tuple[float, float]]], tau: float, angular_tol_deg: float
) -> float:
    wall_angle = _wall_angle_mod180(gt_start, gt_end)
    wall_len = math.hypot(gt_end[0] - gt_start[0], gt_end[1] - gt_start[1])
    if wall_len == 0:
        return 0.0
    unit_perp = (-(gt_end[1] - gt_start[1]) / wall_len, (gt_end[0] - gt_start[0]) / wall_len)

    accepted = []
    for a, b in segments:
        seg_angle = _wall_angle_mod180(a, b)
        if _circular_dist_mod180(seg_angle, wall_angle) > angular_tol_deg:
            continue
        mid = ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0)
        if abs(_perp_offset(mid, gt_start, unit_perp)) > tau:
            continue
        accepted.append((a, b))

    if not accepted:
        return 0.0

    covered = 0
    for k in range(CENTERLINE_SAMPLES):
        t = k / (CENTERLINE_SAMPLES - 1)
        pt = (gt_start[0] + t * (gt_end[0] - gt_start[0]), gt_start[1] + t * (gt_end[1] - gt_start[1]))
        best = min(_point_to_segment_dist(pt, a, b) for a, b in accepted)
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
    angular_tol = selection.angular_tolerance_deg
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

    m = match_walls(pair_walls_mm, gt["walls"], 0.01, diagonal)
    matched_gt_ids = {gt["walls"][j]["id"] for _, j in m.pairs}

    rows = []
    for gw in gt["walls"]:
        gs, ge = tuple(gw["start"]), tuple(gw["end"])
        matched = gw["id"] in matched_gt_ids
        row = {"gt_wall_id": gw["id"], "matched_one_to_one_tau_0_01": matched}
        for tau_frac in TAUS_REPORTED:
            tau_abs = tau_frac * diagonal
            cov_select = _oriented_coverage(gs, ge, select_segs_mm, tau_abs, angular_tol)
            cov_pair = _oriented_coverage(gs, ge, pair_segs_mm, tau_abs, angular_tol)
            key = str(tau_frac).replace(".", "_")
            row[f"coverage_select_tau_{key}"] = round(cov_select, 3)
            row[f"coverage_pair_tau_{key}"] = round(cov_pair, 3)
            if tau_frac == 0.01 and not matched:
                if cov_pair >= COVERAGE_BUCKET_THRESHOLD:
                    row["death_bucket"] = "c_match_failure_despite_coverage"
                elif cov_select >= COVERAGE_BUCKET_THRESHOLD:
                    row["death_bucket"] = "b_pair_dropped_it"
                else:
                    row["death_bucket"] = "a_dissect_select_blind"
        rows.append(row)

    return {
        "plan_id": plan_id,
        "angular_tolerance_deg": angular_tol,
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


# Old (superseded, orientation-agnostic) per-GT-wall numbers from
# out/step3a_coverage.json, inlined so contamination = old - new can be
# reported without re-deriving the retired metric.
OLD_COVERAGE_PATH = OUT_DIR / "step3a_coverage.json"


def main() -> None:
    entries = {e.plan_id: e for e in load_registry()}
    per_plan = {pid: run_plan(pid, entries[pid]) for pid in TARGET_PLAN_IDS}

    all_rows = [({**r, "plan_id": pid}) for pid, p in per_plan.items() for r in p["rows"]]

    dist_select_001 = _dist_stats([r["coverage_select_tau_0_01"] for r in all_rows])
    dist_pair_001 = _dist_stats([r["coverage_pair_tau_0_01"] for r in all_rows])
    dist_select_0005 = _dist_stats([r["coverage_select_tau_0_005"] for r in all_rows])
    dist_pair_0005 = _dist_stats([r["coverage_pair_tau_0_005"] for r in all_rows])

    unmatched = [r for r in all_rows if not r["matched_one_to_one_tau_0_01"]]
    death_histogram = {}
    for bucket in ("a_dissect_select_blind", "b_pair_dropped_it", "c_match_failure_despite_coverage"):
        bucket_rows = [r for r in unmatched if r.get("death_bucket") == bucket]
        death_histogram[bucket] = {
            "n": len(bucket_rows),
            "share_of_unmatched": round(len(bucket_rows) / len(unmatched), 4) if unmatched else None,
            "gt_wall_ids": [f"{r['plan_id']}:{r['gt_wall_id']}" for r in bucket_rows],
        }

    # Contamination: old orientation-agnostic coverage minus corrected, at
    # tau=0.01/pair-stage, matched up by (plan_id, gt_wall_id).
    contamination = None
    if OLD_COVERAGE_PATH.exists():
        old = json.loads(OLD_COVERAGE_PATH.read_text(encoding="utf-8"))
        old_by_key = {
            (pid, r["gt_wall_id"]): r
            for pid, p in old["per_plan"].items()
            for r in p["rows"]
        }
        deltas_pair = []
        deltas_select = []
        for r in all_rows:
            key = (r["plan_id"], r["gt_wall_id"])
            if key in old_by_key:
                deltas_pair.append(old_by_key[key]["coverage_pair_tau_0_01"] - r["coverage_pair_tau_0_01"])
                deltas_select.append(old_by_key[key]["coverage_select_tau_0_01"] - r["coverage_select_tau_0_01"])
        contamination = {
            "pair_stage_tau_0_01": _dist_stats(deltas_pair),
            "select_stage_tau_0_01": _dist_stats(deltas_select),
            "note": "old_coverage - corrected_coverage, per GT wall; positive = old metric overstated coverage",
        }

    out = {
        "pre_registered_expectation": "bucket (c) shrinks substantially, (a)+(b) grow, select-stage coverage falls materially below old 0.887",
        "coverage_select_distribution_tau_0_01": dist_select_001,
        "coverage_pair_distribution_tau_0_01": dist_pair_001,
        "coverage_select_distribution_tau_0_005": dist_select_0005,
        "coverage_pair_distribution_tau_0_005": dist_pair_0005,
        "n_gt_walls_total": len(all_rows),
        "n_matched_total": len(all_rows) - len(unmatched),
        "n_unmatched_total": len(unmatched),
        "death_bucket_histogram": death_histogram,
        "contamination_old_minus_corrected": contamination,
        "per_plan": per_plan,
    }
    out_path = OUT_DIR / "step3a_coverage_oriented.json"
    out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "coverage_select_distribution_tau_0_01": dist_select_001,
                "coverage_pair_distribution_tau_0_01": dist_pair_001,
                "coverage_select_distribution_tau_0_005": dist_select_0005,
                "coverage_pair_distribution_tau_0_005": dist_pair_0005,
                "death_bucket_histogram": death_histogram,
                "contamination_old_minus_corrected": contamination,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
