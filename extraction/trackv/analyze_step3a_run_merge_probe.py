"""Track V milestone 2 step 3a -- Blocker 1, Step 1 (Dan's instruction):
size bucket (c) ("candidate coverage exists, one-to-one match still fails")
as a MEASUREMENT before touching any production code.

GUARDRAIL, enforced by construction: this script does NOT import or touch
anything under eval/ (the matcher/Hungarian one-to-one logic stays exactly
as frozen), and does NOT modify extraction/trackv/pair.py or assemble.py.
It only reuses pair.py's existing PURE grouping helpers (`_axis_frame`,
`_cluster_by_perp`, `_bucket_wall`, `COLLINEAR_GROUPING_TOLERANCE_FRAC`) to
build an offline, throwaway "run-merged" candidate set and re-score it
through the unmodified frozen harness. Nothing here is wired into any
pipeline path; it exists to answer one question and then be read, not run
again as part of a build.

Why this is the right offline test: pair.py's own `_collinear_merge`
already merges same-line fragments, but ONLY across gaps up to
`OPENING_GAP_MULTIPLIER * local_thickness` -- door/window-sized gaps. GT's
convention is different: a wall spans multiple JUNCTIONS (10 walls for an
entire 15x30 house), i.e. it stays one wall record even where a full
perpendicular partition wall crosses it -- a gap far larger than any
opening. This script tests the hypothesis directly: re-group pair.py's
ALREADY-merged pre-split candidates by the exact same axis-bucket + tight
perpendicular tolerance it already uses, but span each group's FULL
min-to-max projection regardless of gap size (no opening-gap bound at all).

PRE-REGISTERED EXPECTATION (written before running): this should mostly
close bucket (c) specifically -- expect meaningful recall improvement
(perhaps roughly +25 to +35 percentage points, landing somewhere around
0.55-0.65 overall) and a sharp precision improvement (candidate count should
drop noticeably back toward GT's own count, since same-line fragments
collapse into one run). It should NOT touch bucket (a) or (b) at all (no
new ink, no pairing recovery) and should NOT get anywhere close to the 0.99
exit bar on its own -- if it does either of those things, the mechanism is
not what Dan's hypothesis says it is.
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
from extraction.trackv.pair import (  # noqa: E402
    COLLINEAR_GROUPING_TOLERANCE_FRAC,
    WallCandidate,
    _axis_frame,
    _bucket_wall,
    _cluster_by_perp,
    _dot,
    _midpoint,
    _weighted_median,
    pair_walls,
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

TAUS_REPORTED = (0.005, 0.01, 0.02)


def _run_merge_no_gap_bound(walls: list[WallCandidate], diagonal: float, theta_deg: float) -> list[WallCandidate]:
    """Offline-only variant of pair.py's `_collinear_merge`: same grouping
    (axis bucket + `_cluster_by_perp` at the same tight tolerance), but
    spans each group's full min-to-max along-axis projection unconditionally
    -- no `OPENING_GAP_MULTIPLIER` gap bound, so a group merges straight
    through a crossing wall's junction, matching GT's one-wall-per-run
    convention. Diagnostic only; never called by the real pipeline.

    `theta_deg` MUST be the same `selection.theta_deg` pair_walls() used to
    assign each wall's `axis_bucket` in the first place -- the A/B labels
    are only meaningful relative to that frame, not an arbitrary one.
    """
    if not walls:
        return []

    d_a, n_a = _axis_frame(theta_deg)

    def frame_for(bucket: str) -> tuple:
        return (d_a, n_a) if bucket == "A" else (n_a, d_a)

    perp_of: dict[int, float] = {}
    by_bucket: dict[str, list[int]] = {"A": [], "B": []}
    for wi, w in enumerate(walls):
        _along_dir, perp_dir = frame_for(w.axis_bucket)
        perp_of[wi] = _dot(_midpoint(w.start, w.end), perp_dir)
        by_bucket[w.axis_bucket].append(wi)

    tolerance = COLLINEAR_GROUPING_TOLERANCE_FRAC * diagonal
    merged: list[WallCandidate] = []

    for bucket in ("A", "B"):
        along_dir, perp_dir = frame_for(bucket)

        def along_lo(wi: int) -> float:
            w = walls[wi]
            return min(_dot(w.start, along_dir), _dot(w.end, along_dir))

        def along_hi(wi: int) -> float:
            w = walls[wi]
            return max(_dot(w.start, along_dir), _dot(w.end, along_dir))

        for idxs in _cluster_by_perp(by_bucket[bucket], perp_of, tolerance):
            chain_lo = min(along_lo(wi) for wi in idxs)
            chain_hi = max(along_hi(wi) for wi in idxs)
            perp_mid = sum(perp_of[wi] for wi in idxs) / len(idxs)
            thickness = _weighted_median([(walls[wi].thickness, along_hi(wi) - along_lo(wi)) for wi in idxs])
            start, end = _bucket_wall(along_dir, perp_dir, chain_lo, chain_hi, perp_mid, bucket)
            merged.append(
                WallCandidate(
                    start=start,
                    end=end,
                    thickness=thickness,
                    axis_bucket=bucket,
                    source_segment_indices=walls[idxs[0]].source_segment_indices,
                    member_source_indices=tuple(sorted({si for wi in idxs for si in walls[wi].member_source_indices})),
                )
            )

    return merged


def run_plan(plan_id: str, entry) -> dict:
    pdf_path = REPO_ROOT / entry.source_file
    sha256 = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
    dissection = dissect(pdf_path)[0]
    raster_scale = _gt_scale(dissection.page_size_px)

    selection = select_axis_aligned(dissection)
    pair_result = pair_walls(selection, dissection.page_size_px)
    diagonal = math.hypot(*dissection.page_size_px)

    run_merged = _run_merge_no_gap_bound(pair_result.walls, diagonal, selection.theta_deg)

    def to_mm(walls: list[WallCandidate], prefix: str) -> list[dict]:
        scale = MM_PER_PRED_UNIT[plan_id]
        out = []
        for i, w in enumerate(walls):
            out.append(
                {
                    "id": f"{prefix}{i}",
                    "start": [w.start[0] * raster_scale * scale, w.start[1] * raster_scale * scale],
                    "end": [w.end[0] * raster_scale * scale, w.end[1] * raster_scale * scale],
                    "thickness": w.thickness * raster_scale * scale,
                }
            )
        return out

    today_mm = to_mm(pair_result.walls, "PRE")
    run_merged_mm = to_mm(run_merged, "RUN")

    gt = json.loads((GT_DIR / f"{plan_id}.json").read_text(encoding="utf-8"))
    diagonal_gt = plan_diagonal(gt["walls"])

    def score(pred_mm: list[dict]) -> dict:
        by_tau = {}
        for tau in TAUS_REPORTED:
            m = match_walls(pred_mm, gt["walls"], tau, diagonal_gt)
            by_tau[str(tau)] = {
                "n_pred": m.n_pred,
                "n_gt": m.n_gt,
                "tp": m.tp,
                "precision": round(m.precision, 4),
                "recall": round(m.recall, 4),
                "f1": round(m.f1, 4),
            }
        return by_tau

    return {
        "plan_id": plan_id,
        "n_gt_walls": len(gt["walls"]),
        "n_candidates_today": len(today_mm),
        "n_candidates_run_merged": len(run_merged_mm),
        "today": score(today_mm),
        "run_merged": score(run_merged_mm),
    }


def main() -> None:
    entries = {e.plan_id: e for e in load_registry()}
    per_plan = {pid: run_plan(pid, entries[pid]) for pid in TARGET_PLAN_IDS}

    n_gt_total = sum(r["n_gt_walls"] for r in per_plan.values())
    n_today_total = sum(r["n_candidates_today"] for r in per_plan.values())
    n_run_merged_total = sum(r["n_candidates_run_merged"] for r in per_plan.values())
    tp_today_001 = sum(r["today"]["0.01"]["tp"] for r in per_plan.values())
    tp_run_001 = sum(r["run_merged"]["0.01"]["tp"] for r in per_plan.values())

    summary = {
        "n_gt_total": n_gt_total,
        "n_candidates_today_total": n_today_total,
        "n_candidates_run_merged_total": n_run_merged_total,
        "recall_today_tau_0_01": round(tp_today_001 / n_gt_total, 4),
        "recall_run_merged_tau_0_01": round(tp_run_001 / n_gt_total, 4),
    }

    out = {"pre_registered_expectation": "recall +25 to +35pp (land ~0.55-0.65), precision improves sharply via candidate-count drop, still far short of 0.99 -- and should NOT move bucket (a)/(b) walls",
           "summary": summary, "per_plan": per_plan}
    out_path = OUT_DIR / "step3a_run_merge_probe.json"
    out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
