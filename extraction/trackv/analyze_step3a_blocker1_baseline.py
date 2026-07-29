"""Track V milestone 2 step 3a -- Blocker 1 (over-production), fresh session
step 0: wall-level matched baseline via the frozen harness, under the NOW-
DERIVED zero-fitted-parameter transform (Blocker 2 closed, see
analyze_step3a_frame.py / reports/phase-2-gate.md's frame-derivation
section). No similarity fit here -- score_align.py's fit_similarity_transform
is superseded for this corpus and deliberately not called.

Per the handoff's explicit correction: this replaces BOTH the raw 54-vs-19
candidate-count arithmetic (still true, still the headline over-production
number, but not a *matched* baseline) and the vertex-proximity 3.7%/9.4%
figures (a stricter, different test -- a correctly extracted wall merely
split at a different point scores zero on that test and is not what "wall
F1" means here). This script's match_walls-based F1 is the number Blocker 1
actually works against.

Reports both splitting states (pre-split candidates and post-closure walls)
since the classification step downstream operates on the pre-split
population, but Blocker 1's real deliverable is a post-split product number.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from eval.metrics.engine import score_plan  # noqa: E402
from eval.metrics.matching import match_walls, plan_diagonal  # noqa: E402
from eval.registry.registry import load_registry  # noqa: E402
from extraction.trackv.run_step3a import _build_extraction_result, _gt_scale  # noqa: E402
from extraction.trackv.assemble import assemble  # noqa: E402
from extraction.trackv.dissect import dissect  # noqa: E402
from extraction.trackv.pair import pair_walls  # noqa: E402
from extraction.trackv.select import select_axis_aligned  # noqa: E402
import hashlib
import math

OUT_DIR = Path(__file__).parent / "out"
GT_DIR = REPO_ROOT / "data" / "corpus" / "gt_provisional"

TARGET_PLAN_IDS = ["15x30-ft-Best-House-Plan-Model", "30x50-Model-landscape"]

# Same constants as analyze_step3a_frame.py -- derived, not fitted. Do not
# recompute by hand; regenerate from that script if these ever drift.
LEGACY_METERS_PER_PIXEL = {
    "15x30-ft-Best-House-Plan-Model": 0.008323667459886908,
    "30x50-Model-landscape": 0.012918215560344833,
}
MM_PER_PRED_UNIT = {k: v * 1000.0 for k, v in LEGACY_METERS_PER_PIXEL.items()}

TAUS_REPORTED = (0.005, 0.01, 0.02)


def _scale_plan(plan: dict, scale: float) -> dict:
    out = json.loads(json.dumps(plan))
    for w in out["walls"]:
        w["start"] = [w["start"][0] * scale, w["start"][1] * scale]
        w["end"] = [w["end"][0] * scale, w["end"][1] * scale]
        w["thickness"] = w["thickness"] * scale
    return out


def run_one(plan_id: str, entry, enable_splitting: bool) -> dict:
    pdf_path = REPO_ROOT / entry.source_file
    sha256 = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
    dissection = dissect(pdf_path)[0]
    raster_scale = _gt_scale(dissection.page_size_px)

    selection = select_axis_aligned(dissection)
    pair_result = pair_walls(selection, dissection.page_size_px)
    assemble_result = assemble(pair_result, scale_to_gt_frame=raster_scale, enable_splitting=enable_splitting)

    plan = _build_extraction_result(plan_id, entry, assemble_result.walls, assemble_result.junctions, sha256)
    # raster-frame prediction -> derived mm frame. Zero fitted parameters:
    # scale-only, rotation=0, translation=0 (Blocker 2 closed).
    mm_plan = _scale_plan(plan, MM_PER_PRED_UNIT[plan_id])

    gt = json.loads((GT_DIR / f"{plan_id}.json").read_text(encoding="utf-8"))
    score = score_plan(mm_plan, gt, plan_id)

    diagonal = plan_diagonal(gt["walls"])
    matched_at_tau = {}
    for tau in TAUS_REPORTED:
        m = match_walls(mm_plan["walls"], gt["walls"], tau, diagonal)
        matched_at_tau[str(tau)] = {
            "n_pred": m.n_pred,
            "n_gt": m.n_gt,
            "tp": m.tp,
            "precision": round(m.precision, 4),
            "recall": round(m.recall, 4),
            "f1": round(m.f1, 4),
            "matched_pred_ids": sorted(mm_plan["walls"][i]["id"] for i, _ in m.pairs),
            "unmatched_gt_ids": sorted(
                set(w["id"] for w in gt["walls"]) - {gt["walls"][j]["id"] for _, j in m.pairs}
            ),
        }

    return {
        "plan_id": plan_id,
        "enable_splitting": enable_splitting,
        "n_pred_walls": len(mm_plan["walls"]),
        "n_gt_walls": len(gt["walls"]),
        "matched_at_tau": matched_at_tau,
        "wall_f1_by_tau_harness": {str(t): round(s.f1, 4) for t, s in score.wall_by_tau.items()},
        "wall_precision_by_tau_harness": {str(t): round(s.precision, 4) for t, s in score.wall_by_tau.items()},
        "wall_recall_by_tau_harness": {str(t): round(s.recall, 4) for t, s in score.wall_by_tau.items()},
    }


def main() -> None:
    entries = {e.plan_id: e for e in load_registry()}
    results = {"pre_split": {}, "post_split": {}}
    for plan_id in TARGET_PLAN_IDS:
        results["pre_split"][plan_id] = run_one(plan_id, entries[plan_id], enable_splitting=False)
        results["post_split"][plan_id] = run_one(plan_id, entries[plan_id], enable_splitting=True)

    out_path = OUT_DIR / "step3a_blocker1_baseline.json"
    out_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
