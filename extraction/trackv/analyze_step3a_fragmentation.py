"""Positive fragmentation confirmation -- Track V milestone 2 step 3a,
third diagnostic round.

Not a pipeline module. For every ABSENT/MISPLACED GT wall (per
`analyze_step3a_pinned.py`'s classification, frozen transform), overlays
`pair.py`'s PRE-MERGE candidate wall fragments (the `pre_merge_walls` field
added to `PairResult` for exactly this purpose -- diagnostic-only, changes
no shipped behavior) against that GT wall's span, transformed into the
native frame via the *inverse* of the same frozen pinned transform. This
answers three separate questions per wall that the residual/overlap
verdict alone conflates:

- TRULY_ABSENT: no candidate fragment (pre- or post-merge) found anywhere
  near this wall's expected line at all -- pairing never fired here.
- FRAGMENTED: multiple candidate pieces exist along the span with real
  gaps between them -- pairing found the wall, in pieces.
- MISPLACED: a single contiguous piece exists, but off-line or off-span.

For FRAGMENTED walls, also checks whether `pair.py`'s existing
collinear-merge (built in 3a) fired on that gap (visible in
`PairResult.opening_candidates`) or not, and whether the gap size
coincides with a GT-recorded opening on that wall (`Wall.openings`,
`center_offset` +/- `width/2`, converted to the same along-wall coordinate
this script already computes).
"""

from __future__ import annotations

import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from eval.registry.registry import load_registry  # noqa: E402
from extraction.trackv.analyze_step3a_pinned import fit_similarity_umeyama, run_15x30, run_30x50  # noqa: E402
from extraction.trackv.dissect import dissect  # noqa: E402
from extraction.trackv.pair import WallCandidate, pair_walls  # noqa: E402
from extraction.trackv.score_align import SimilarityTransform  # noqa: E402
from extraction.trackv.select import select_axis_aligned  # noqa: E402

OUT_PATH = Path(__file__).parent / "out" / "step3a_fragmentation_diagnostic.json"

PERP_TOLERANCE_MULTIPLE = 3.0  # native-frame perpendicular search band, x expected thickness
MIN_GAP_TO_REPORT_MM = 30.0  # ignore sub-30mm gaps as float/snap noise, not real fragmentation


def invert(t: SimilarityTransform) -> SimilarityTransform:
    theta = math.radians(-t.rotation_deg)
    c, s = math.cos(theta), math.sin(theta)
    inv_scale = 1.0 / t.scale
    # inverse of (scale*R(theta)*p + t) is inv_scale*R(-theta)*(q - t)
    tx = -inv_scale * (c * t.tx - s * t.ty)
    ty = -inv_scale * (s * t.tx + c * t.ty)
    return SimilarityTransform(scale=inv_scale, rotation_deg=math.degrees(-math.radians(t.rotation_deg)), tx=tx, ty=ty)


@dataclass
class Frag:
    along_lo: float
    along_hi: float
    perp: float
    thickness: float
    source_idx: tuple


def analyze_wall(gt_wall: dict, gt_id_to_gt: dict, pre_merge: list[WallCandidate], opening_candidates, inv_t: SimilarityTransform, forward_t: SimilarityTransform) -> dict:
    gt_start, gt_end = np.array(gt_wall["start"]), np.array(gt_wall["end"])
    gt_len = float(np.linalg.norm(gt_end - gt_start))

    p0 = inv_t.apply(tuple(gt_start))
    p1 = inv_t.apply(tuple(gt_end))
    along_dir = np.array([p1[0] - p0[0], p1[1] - p0[1]])
    native_len = float(np.linalg.norm(along_dir))
    if native_len == 0:
        return {"verdict": "TRULY_ABSENT", "reason": "degenerate GT wall"}
    along_dir = along_dir / native_len
    perp_dir = np.array([-along_dir[1], along_dir[0]])
    p0v = np.array(p0)

    expected_thickness_native = gt_wall["thickness"] / forward_t.scale
    perp_tol = PERP_TOLERANCE_MULTIPLE * expected_thickness_native

    frags: list[Frag] = []
    for w in pre_merge:
        ws, we = np.array(w.start), np.array(w.end)
        mid = (ws + we) / 2
        perp = float(np.dot(mid - p0v, perp_dir))
        if abs(perp) > perp_tol:
            continue
        along_s = float(np.dot(ws - p0v, along_dir))
        along_e = float(np.dot(we - p0v, along_dir))
        lo, hi = min(along_s, along_e), max(along_s, along_e)
        # require genuine overlap with the [0, native_len] span, not just nearby
        if hi < -0.1 * native_len or lo > 1.1 * native_len:
            continue
        frags.append(Frag(along_lo=lo, along_hi=hi, perp=perp, thickness=w.thickness, source_idx=w.source_segment_indices))

    if not frags:
        return {
            "verdict": "TRULY_ABSENT",
            "native_span": [0.0, round(native_len, 1)],
            "n_fragments_found": 0,
        }

    frags.sort(key=lambda f: f.along_lo)
    merged: list[list[float]] = []
    for f in frags:
        if merged and f.along_lo <= merged[-1][1] + 1e-6:
            merged[-1][1] = max(merged[-1][1], f.along_hi)
        else:
            merged.append([f.along_lo, f.along_hi])
    merged = [[max(0.0, lo), min(native_len, hi)] for lo, hi in merged if hi > 0 and lo < native_len]

    covered = sum(hi - lo for lo, hi in merged)
    coverage_frac = covered / native_len if native_len else 0.0

    gaps_native = []
    for (lo0, hi0), (lo1, hi1) in zip(merged, merged[1:]):
        gap = lo1 - hi0
        if gap * forward_t.scale >= MIN_GAP_TO_REPORT_MM:
            gaps_native.append((hi0, lo1, gap))

    if len(merged) == 1 and coverage_frac < 0.5:
        verdict = "MISPLACED"
    elif gaps_native:
        verdict = "FRAGMENTED"
    elif coverage_frac >= 0.5:
        verdict = "MISPLACED" if abs(frags[0].perp) * forward_t.scale > MIN_GAP_TO_REPORT_MM else "COVERED_BUT_NOT_HUNGARIAN_MATCHED"
    else:
        verdict = "TRULY_ABSENT"

    gt_openings = gt_wall.get("openings") or []
    gap_reports = []
    for lo, hi, gap_native in gaps_native:
        gap_mm = gap_native * forward_t.scale
        gap_center_mm = (lo + hi) / 2 * forward_t.scale
        # does merge's own opening_candidates already cover this gap? (native-frame check)
        merge_fired = any(
            abs((oc.start[0] + oc.end[0]) / 2 - (p0v[0] + (lo + hi) / 2 * along_dir[0])) < expected_thickness_native * 4
            and abs((oc.start[1] + oc.end[1]) / 2 - (p0v[1] + (lo + hi) / 2 * along_dir[1])) < expected_thickness_native * 4
            for oc in opening_candidates
        )
        coincides_with_gt_opening = any(
            abs(gap_center_mm - o["center_offset"]) <= o["width"] / 2 + gap_mm / 2 for o in gt_openings
        )
        gap_reports.append(
            {
                "gap_mm": round(gap_mm, 1),
                "gap_center_along_wall_mm": round(gap_center_mm, 1),
                "merge_already_fired_here": merge_fired,
                "coincides_with_gt_opening": coincides_with_gt_opening,
            }
        )

    return {
        "verdict": verdict,
        "native_span": [0.0, round(native_len, 1)],
        "n_fragments_found": len(frags),
        "n_merged_pieces": len(merged),
        "coverage_fraction": round(coverage_frac, 3),
        "closest_fragment_perp_offset_mm": round(abs(frags[0].perp) * forward_t.scale, 1) if frags else None,
        "gaps": gap_reports,
        "n_gt_openings_on_this_wall": len(gt_openings),
    }


def run_plan(plan_id: str, pinned_result: dict) -> dict:
    entries = {e.plan_id: e for e in load_registry()}
    entry = entries[plan_id]
    dissection = dissect(Path(entry.source_file))[0]
    selection = select_axis_aligned(dissection)
    pair_result = pair_walls(selection, dissection.page_size_px)

    # analyze_step3a_pinned.py's anchors were picked from step3a_predictions/*.json,
    # which are scaled by the SCHEMA's own image_transform (the discredited
    # long-edge=1600px convention -- a flat 1.900238x on both plans, confirmed
    # in out/step3a_report.json). pair_walls() here returns *raw native*,
    # unscaled coordinates. Found by a failed round-trip sanity check before
    # trusting any fragmentation numbers: inverting the pinned transform on a
    # known GT anchor point landed near W13's *schema-scaled* start
    # (255.8, 236.7), not its raw-native start (134.6, 124.5) -- a frame
    # mismatch, not a transform-quality problem. Fixed by scaling pre_merge
    # fragments into the same schema-scaled frame the pinned transform
    # actually operates in, rather than re-deriving a second pinned fit.
    schema_scale = json.loads((Path(__file__).parent / "out" / "step3a_report.json").read_text(encoding="utf-8"))
    schema_scale = next(f["geometry"]["gt_scale_factor"] for f in schema_scale["funnels"] if f["plan_id"] == plan_id)
    pre_merge_schema_scaled = [
        WallCandidate(
            start=(w.start[0] * schema_scale, w.start[1] * schema_scale),
            end=(w.end[0] * schema_scale, w.end[1] * schema_scale),
            thickness=w.thickness * schema_scale,
            axis_bucket=w.axis_bucket,
            source_segment_indices=w.source_segment_indices,
        )
        for w in pair_result.pre_merge_walls
    ]
    opening_candidates_scaled = [
        type(oc)(
            host_wall_index=oc.host_wall_index,
            start=(oc.start[0] * schema_scale, oc.start[1] * schema_scale),
            end=(oc.end[0] * schema_scale, oc.end[1] * schema_scale),
            gap_length=oc.gap_length * schema_scale,
        )
        for oc in pair_result.opening_candidates
    ]

    t = pinned_result["pinned_transform"]
    forward_t = SimilarityTransform(scale=t["scale"], rotation_deg=t["rotation_deg"], tx=t["tx"], ty=t["ty"])
    inv_t = invert(forward_t)

    gt = json.loads((REPO_ROOT / "data" / "corpus" / "gt_provisional" / f"{plan_id}.json").read_text(encoding="utf-8"))
    gt_by_id = {w["id"]: w for w in gt["walls"]}

    targets = [v for v in pinned_result["per_gt_wall_verdict"] if v["verdict"] in ("ABSENT", "MISPLACED")]
    per_wall = {}
    for v in targets:
        gw = gt_by_id[v["gt_id"]]
        per_wall[v["gt_id"]] = {
            "original_verdict": v["verdict"],
            "original_residual_frac_of_tau": v.get("residual_frac_of_tau"),
            **analyze_wall(gw, gt_by_id, pre_merge_schema_scaled, opening_candidates_scaled, inv_t, forward_t),
        }

    counts: dict[str, int] = {}
    for w in per_wall.values():
        counts[w["verdict"]] = counts.get(w["verdict"], 0) + 1

    return {"plan_id": plan_id, "per_wall": per_wall, "counts": counts}


def main() -> None:
    result_15x30 = run_15x30()
    result_30x50_clean = run_30x50(clean_anchors_only=True)

    out = {
        "15x30-ft-Best-House-Plan-Model": run_plan("15x30-ft-Best-House-Plan-Model", result_15x30),
        "30x50-Model-landscape": run_plan("30x50-Model-landscape", result_30x50_clean),
    }
    OUT_PATH.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
