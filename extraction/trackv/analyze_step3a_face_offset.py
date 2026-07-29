"""Track V milestone 2 step 3a -- Blocker 1, face-vs-centerline offset test
(Dan's hypothesis, from the select-vs-pair tau-crossover in the corrected
coverage table: select 0.870@tau0.01 -> 0.488@tau0.005, pair 0.586@tau0.01
-> 0.516@tau0.005 -- pair is below select at the looser tau but above it at
the tighter one).

Hypothesis: raw select-stage ink is wall FACES (the two pen strokes either
side of a wall), offset from the GT centerline by ~half the local wall
thickness. tau=0.01 (~100-250mm on this corpus) forgives that offset;
tau=0.005 (~50-125mm) does not. pair.py's parallel-pair-to-centerline
recovery removes the offset (explaining pair's better tight-tolerance
coverage) while simultaneously rejecting/dropping some faces outright
(explaining pair's worse loose-tolerance coverage, i.e. bucket b/c).

PRE-REGISTERED EXPECTATION (Dan's, written before running, calibrated down
after one over-prediction already this phase): a BIMODAL distribution of
normalized signed offset (raw offset / (local GT thickness / 2)) at
approximately +/-1, not a zero-centered spread. A zero-centered result
falsifies this hypothesis outright and must be reported as such.

Scope: qualifying GT walls = matched walls (one-to-one at tau=0.01) UNION
bucket-(c) walls (coverage exists, one-to-one match still fails) from the
corrected `out/step3a_coverage_oriented.json`. Bucket (a)/(b) walls are
excluded on purpose -- they have little or no orientation-compatible select
ink near them at all, so there is nothing to measure an offset from.

Diagnostic only. Does not touch eval/, pair.py, or assemble.py -- reuses
select.py's raw output and re-derives geometry inline.
"""

from __future__ import annotations

import json
import math
import statistics
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from eval.registry.registry import load_registry  # noqa: E402
from extraction.trackv.run_step3a import _gt_scale  # noqa: E402
from extraction.trackv.dissect import dissect  # noqa: E402
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

CAPTURE_WINDOW_THICKNESS_MULT = 1.5  # generous capture band around a ~half-thickness offset, named not tuned


def _wall_angle_mod180(a, b) -> float:
    return math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) % 180.0


def _circular_dist_mod180(x: float, y: float) -> float:
    d = abs(x - y) % 180.0
    return min(d, 180.0 - d)


def main() -> None:
    coverage = json.loads(COVERAGE_PATH.read_text(encoding="utf-8"))
    entries = {e.plan_id: e for e in load_registry()}

    all_normalized = []
    all_raw_mm = []
    per_wall_summary = []

    for plan_id in TARGET_PLAN_IDS:
        rows_by_id = {r["gt_wall_id"]: r for r in coverage["per_plan"][plan_id]["rows"]}
        qualifying_ids = {
            wid
            for wid, r in rows_by_id.items()
            if r["matched_one_to_one_tau_0_01"] or r.get("death_bucket") == "c_match_failure_despite_coverage"
        }

        entry = entries[plan_id]
        dissection = dissect(REPO_ROOT / entry.source_file)[0]
        raster_scale = _gt_scale(dissection.page_size_px)
        combined_scale = raster_scale * MM_PER_PRED_UNIT[plan_id]
        selection = select_axis_aligned(dissection)
        angular_tol = selection.angular_tolerance_deg

        select_segs_mm = [
            (
                (s.p0[0] * combined_scale, s.p0[1] * combined_scale),
                (s.p1[0] * combined_scale, s.p1[1] * combined_scale),
            )
            for s in selection.candidates
        ]

        gt = json.loads((GT_DIR / f"{plan_id}.json").read_text(encoding="utf-8"))
        for gw in gt["walls"]:
            if gw["id"] not in qualifying_ids:
                continue
            gs, ge = tuple(gw["start"]), tuple(gw["end"])
            thickness = gw["thickness"]
            wall_len = math.hypot(ge[0] - gs[0], ge[1] - gs[1])
            if wall_len == 0 or thickness <= 0:
                continue
            wall_angle = _wall_angle_mod180(gs, ge)
            unit_along = ((ge[0] - gs[0]) / wall_len, (ge[1] - gs[1]) / wall_len)
            unit_perp = (-unit_along[1], unit_along[0])
            capture_window = CAPTURE_WINDOW_THICKNESS_MULT * thickness
            along_margin = capture_window  # generous slack past the nominal endpoints for corner treatment

            wall_offsets = []
            for a, b in select_segs_mm:
                seg_angle = _wall_angle_mod180(a, b)
                if _circular_dist_mod180(seg_angle, wall_angle) > angular_tol:
                    continue
                mid = ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0)
                offset = (mid[0] - gs[0]) * unit_perp[0] + (mid[1] - gs[1]) * unit_perp[1]
                if abs(offset) > capture_window:
                    continue
                along_proj = (mid[0] - gs[0]) * unit_along[0] + (mid[1] - gs[1]) * unit_along[1]
                if along_proj < -along_margin or along_proj > wall_len + along_margin:
                    continue
                wall_offsets.append(offset)

            if not wall_offsets:
                continue
            normalized = [o / (thickness / 2.0) for o in wall_offsets]
            all_normalized.extend(normalized)
            all_raw_mm.extend(wall_offsets)
            per_wall_summary.append(
                {
                    "plan_id": plan_id,
                    "gt_wall_id": gw["id"],
                    "thickness_mm": thickness,
                    "n_segments_captured": len(normalized),
                    "raw_offsets_mm": [round(o, 1) for o in wall_offsets],
                    "normalized_offsets": [round(n, 3) for n in normalized],
                    "has_positive_side": any(n > 0.3 for n in normalized),
                    "has_negative_side": any(n < -0.3 for n in normalized),
                    "has_near_zero": any(abs(n) < 0.3 for n in normalized),
                }
            )

    n_total = len(all_normalized)
    near_zero = sum(1 for n in all_normalized if abs(n) < 0.3)
    near_pos_one = sum(1 for n in all_normalized if 0.7 <= n <= 1.3)
    near_neg_one = sum(1 for n in all_normalized if -1.3 <= n <= -0.7)
    other = n_total - near_zero - near_pos_one - near_neg_one

    both_faces_walls = sum(1 for w in per_wall_summary if w["has_positive_side"] and w["has_negative_side"])
    one_face_walls = sum(
        1 for w in per_wall_summary if (w["has_positive_side"] or w["has_negative_side"]) and not (w["has_positive_side"] and w["has_negative_side"])
    )

    summary = {
        "pre_registered_expectation": "bimodal at approximately +/-1 (normalized = raw_offset / (thickness/2)), NOT zero-centered",
        "n_qualifying_walls": len(per_wall_summary),
        "n_segments_total": n_total,
        "distribution_normalized_by_thickness": {
            "mean": round(statistics.mean(all_normalized), 3) if all_normalized else None,
            "median": round(statistics.median(all_normalized), 3) if all_normalized else None,
            "stdev": round(statistics.pstdev(all_normalized), 3) if len(all_normalized) > 1 else None,
        },
        "distribution_raw_mm": {
            "mean": round(statistics.mean(all_raw_mm), 2) if all_raw_mm else None,
            "median": round(statistics.median(all_raw_mm), 2) if all_raw_mm else None,
            "stdev": round(statistics.pstdev(all_raw_mm), 2) if len(all_raw_mm) > 1 else None,
            "n_near_zero_lt_20mm": sum(1 for o in all_raw_mm if abs(o) < 20),
            "note": "GT thickness is a default 150mm on most walls (legacy_default_thickness flag) -- raw mm is reported because normalizing by that assumed-uniform value can smear a real constant offset across a range if true thickness actually varies wall-to-wall.",
        },
        "bucket_shares": {
            "near_zero_(-0.3,0.3)": round(near_zero / n_total, 4) if n_total else None,
            "near_plus_one_(0.7,1.3)": round(near_pos_one / n_total, 4) if n_total else None,
            "near_minus_one_(-1.3,-0.7)": round(near_neg_one / n_total, 4) if n_total else None,
            "other": round(other / n_total, 4) if n_total else None,
        },
        "per_wall_face_presence": {
            "n_walls_both_faces_detected": both_faces_walls,
            "n_walls_one_face_only": one_face_walls,
            "n_walls_zero_captured": len(per_wall_summary) - both_faces_walls - one_face_walls,
        },
    }

    out = {"summary": summary, "per_wall": per_wall_summary}
    out_path = OUT_DIR / "step3a_face_offset.json"
    out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
