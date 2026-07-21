"""DIAGNOSTIC ONLY — not part of the Phase 1 deliverable, does not touch
eval/ (the harness) or reports/phase-1-gate.md (the signed report), and
does not overwrite reports/phase-1/summary.json (the gate report's data
source). Requested by Dan mid-review of the gate report: measure how much
of the wall-F1/IoU gap is closed by adding a CANONICAL (not F1-fit)
translation correction to the existing scale-only rescale shim
(extraction/baselines/summarize.py::_rescale_to_gt_extent).

Canonical = align wall bounding-box centers after the existing diagonal
scale correction. This is a geometric-only correction (uses only each
plan's own bbox, never GT-vs-pred distance), so it cannot inflate F1 by
fitting to the metric — it's testing whether the ORIGIN mismatch the
identity round-trip diagnostic proved exists in principle is large enough
in the REAL data to matter, across the whole corpus, not just the 3 plans
spot-checked by hand.

Usage: python -m extraction.baselines.diagnostic_centroid_rescale
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from statistics import mean

from eval.metrics.engine import score_corpus
from extraction.baselines.summarize import BASELINES, GT_DIR, _bbox_diagonal, _load_plans

REPO_ROOT = Path(__file__).resolve().parents[2]


def _bbox(walls: list[dict]) -> tuple[float, float, float, float] | None:
    xs = [pt[0] for w in walls for pt in (w["start"], w["end"])]
    ys = [pt[1] for w in walls for pt in (w["start"], w["end"])]
    if not xs:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def rescale_and_recenter(pred: dict, gt: dict) -> dict:
    """Existing scale-only correction, PLUS: translate so the prediction's
    wall bounding-box CENTER coincides with GT's bounding-box center. Order:
    scale first (matches the existing shim exactly), then translate — so
    any F1/IoU delta vs the scale-only shim is attributable purely to the
    added translation term, not a different scale computation."""
    pred_diag = _bbox_diagonal(pred.get("walls", []))
    gt_diag = _bbox_diagonal(gt.get("walls", []))
    if pred_diag <= 0 or gt_diag <= 0:
        return pred
    scale = gt_diag / pred_diag

    rescaled = copy.deepcopy(pred)
    for w in rescaled.get("walls", []):
        w["start"] = [w["start"][0] * scale, w["start"][1] * scale]
        w["end"] = [w["end"][0] * scale, w["end"][1] * scale]
        w["thickness"] = w["thickness"] * scale
        for o in w.get("openings", []):
            o["center_offset"] = o["center_offset"] * scale
            o["width"] = o["width"] * scale
    for j in rescaled.get("junctions", []):
        j["point"] = [j["point"][0] * scale, j["point"][1] * scale]

    pred_bbox = _bbox(rescaled.get("walls", []))
    gt_bbox = _bbox(gt.get("walls", []))
    if pred_bbox is None or gt_bbox is None:
        return rescaled
    pred_cx, pred_cy = (pred_bbox[0] + pred_bbox[2]) / 2, (pred_bbox[1] + pred_bbox[3]) / 2
    gt_cx, gt_cy = (gt_bbox[0] + gt_bbox[2]) / 2, (gt_bbox[1] + gt_bbox[3]) / 2
    dx, dy = gt_cx - pred_cx, gt_cy - pred_cy

    for w in rescaled.get("walls", []):
        w["start"] = [w["start"][0] + dx, w["start"][1] + dy]
        w["end"] = [w["end"][0] + dx, w["end"][1] + dy]
    for j in rescaled.get("junctions", []):
        j["point"] = [j["point"][0] + dx, j["point"][1] + dy]

    return rescaled, (dx, dy, scale)


def main() -> None:
    gts = _load_plans(GT_DIR)
    print(f"GT plans: {len(gts)}\n")
    print(f"{'baseline':18s} {'meanF1(old)':>12s} {'meanF1(centroid)':>17s} {'delta':>8s}   "
          f"{'meanIoU(old)':>13s} {'meanIoU(centroid)':>18s} {'delta':>8s}")

    old_summary = json.loads((REPO_ROOT / "reports" / "phase-1" / "summary.json").read_text(encoding="utf-8"))

    for name, pred_dir in BASELINES.items():
        if not pred_dir.exists():
            continue
        raw_preds = _load_plans(pred_dir)
        recentered = {}
        deltas = []
        for pid, p in raw_preds.items():
            if pid not in gts:
                continue
            rescaled, (dx, dy, scale) = rescale_and_recenter(p, gts[pid])
            recentered[pid] = rescaled
            diag = _bbox_diagonal(gts[pid]["walls"])
            if diag > 0:
                import math
                deltas.append(100 * math.hypot(dx, dy) / diag)

        report = score_corpus(recentered, gts)
        n = len(report.per_plan)
        new_f1 = mean(s.wall_by_tau[0.01].f1 for s in report.per_plan.values()) if n else 0.0
        new_iou = mean(s.wall_mask_iou for s in report.per_plan.values()) if n else 0.0

        old_plans = old_summary[name]["per_plan"]
        old_f1 = mean(s["wall_f1_1pct"] for s in old_plans.values())
        old_iou = mean(s["wall_mask_iou"] for s in old_plans.values())

        print(f"{name:18s} {old_f1:12.3f} {new_f1:17.3f} {new_f1-old_f1:+8.3f}   "
              f"{old_iou:13.3f} {new_iou:18.3f} {new_iou-old_iou:+8.3f}")
        if deltas:
            print(f"{'':18s} translation applied: mean {mean(deltas):.2f}% of GT diagonal, "
                  f"max {max(deltas):.2f}%, min {min(deltas):.2f}% (n={len(deltas)} plans)")


if __name__ == "__main__":
    main()
