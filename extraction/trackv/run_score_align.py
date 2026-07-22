"""Applies score_align.py's scoring-only adapter to step 3a's predictions
and scores them via frozen eval/metrics -- a directional read, not a
pipeline artifact. Writes extraction/trackv/out/step3a_aligned_score.json.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from eval.metrics.engine import score_plan  # noqa: E402
from extraction.trackv.score_align import apply_transform_to_plan, fit_similarity_transform  # noqa: E402

PRED_DIR = Path(__file__).parent / "out" / "step3a_predictions"
GT_DIR = REPO_ROOT / "data" / "corpus" / "gt_provisional"
OUT_PATH = Path(__file__).parent / "out" / "step3a_aligned_score.json"

TARGET_PLAN_IDS = ["15x30-ft-Best-House-Plan-Model", "30x50-Model-landscape"]


def main() -> None:
    results = {}
    for plan_id in TARGET_PLAN_IDS:
        pred = json.loads((PRED_DIR / f"{plan_id}.json").read_text(encoding="utf-8"))
        gt = json.loads((GT_DIR / f"{plan_id}.json").read_text(encoding="utf-8"))

        transform, diag = fit_similarity_transform(pred["walls"], gt["walls"])
        aligned_pred = apply_transform_to_plan(pred, transform)

        score = score_plan(aligned_pred, gt, plan_id)

        matched_pred_ids = set()
        matched_gt_ids = set()
        tau_primary = 0.01
        from eval.metrics.matching import match_walls, plan_diagonal

        diagonal = plan_diagonal(gt["walls"])
        m = match_walls(aligned_pred["walls"], gt["walls"], tau_primary, diagonal)
        for i, j in m.pairs:
            matched_pred_ids.add(aligned_pred["walls"][i]["id"])
            matched_gt_ids.add(gt["walls"][j]["id"])

        results[plan_id] = {
            "transform": {
                "scale": transform.scale,
                "rotation_deg": transform.rotation_deg,
                "tx": transform.tx,
                "ty": transform.ty,
            },
            "transform_diagnostics": diag,
            "n_pred_walls": len(pred["walls"]),
            "n_gt_walls": len(gt["walls"]),
            "n_matched_at_tau_1pct": len(m.pairs),
            "matched_pred_ids": sorted(matched_pred_ids),
            "unmatched_pred_ids": sorted(set(w["id"] for w in pred["walls"]) - matched_pred_ids),
            "unmatched_gt_ids": sorted(set(w["id"] for w in gt["walls"]) - matched_gt_ids),
            "wall_f1_by_tau": {str(t): round(s.f1, 4) for t, s in score.wall_by_tau.items()},
            "wall_precision_by_tau": {str(t): round(s.precision, 4) for t, s in score.wall_by_tau.items()},
            "wall_recall_by_tau": {str(t): round(s.recall, 4) for t, s in score.wall_by_tau.items()},
            "mean_endpoint_error_by_tau": {
                str(t): (round(s.mean_endpoint_error, 2) if s.mean_endpoint_error is not None else None)
                for t, s in score.wall_by_tau.items()
            },
            "mean_thickness_error_by_tau": {
                str(t): (round(s.mean_thickness_error, 2) if s.mean_thickness_error is not None else None)
                for t, s in score.wall_by_tau.items()
            },
            "wall_mask_iou": round(score.wall_mask_iou, 4),
        }

    OUT_PATH.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
