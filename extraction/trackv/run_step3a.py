"""Track V milestone 2 step 3a -- corpus runner.

Wires select.py -> pair.py -> assemble.py into a schema-valid, wall-only
ExtractionResult for 15x30 and 30x50 (step 3a's approved target plans --
the two where milestone-2-step-2 found stroke-width clustering alone fails),
writes predictions, scores them via the frozen eval harness, and writes a
per-stage funnel report (gate report item 3: a validity/precision issue must
be attributable to select vs. pair vs. assemble from this report alone).

GT coordinate frame: reports/phase-2-gate.md's GT files are authored in a
raster-pixel space with the page's *long edge scaled to 1600px*, confirmed
directly against all 4 track_v plans' `image_transform.source_px` (identity
similarity matrix, no rotation/translation) -- not PyMuPDF's native
page-point space that dissect/select/pair/assemble operate in throughout.
This was not caught by any prior milestone (none of them emitted geometry
against GT) and would have silently produced meaningless F1 scores -- every
predicted coordinate off by the scale factor -- had it gone unnoticed.
Discovered and confirmed here, not assumed.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from eval.metrics.engine import score_corpus  # noqa: E402
from eval.registry.registry import load_registry  # noqa: E402
from extraction.schema.validate import validity  # noqa: E402
from extraction.trackv.assemble import assemble  # noqa: E402
from extraction.trackv.dissect import dissect  # noqa: E402
from extraction.trackv.pair import pair_walls  # noqa: E402
from extraction.trackv.select import select_axis_aligned  # noqa: E402

OUT_DIR = Path(__file__).parent / "out"
PRED_DIR = OUT_DIR / "step3a_predictions"
REPORT_PATH = OUT_DIR / "step3a_report.json"
EVAL_OUT_DIR = OUT_DIR / "step3a_eval"
GT_DIR = REPO_ROOT / "data" / "corpus" / "gt_provisional"

TARGET_PLAN_IDS = ["15x30-ft-Best-House-Plan-Model", "30x50-Model-landscape"]
GT_LONG_EDGE_PX = 1600.0


def _gt_scale(page_size_px: tuple[float, float]) -> float:
    return GT_LONG_EDGE_PX / max(page_size_px)


def _build_extraction_result(plan_id: str, entry, walls, junctions, sha256: str) -> dict:
    return {
        "schema_version": "1.0",
        "source": {
            "file_sha256": sha256,
            "filename": Path(entry.source_file).name,
            "encoding_class": entry.encoding_class,
            "convention_class": entry.convention_class,
            "scope_class": entry.scope_class,
            "router_confidence": entry.router_confidence,
        },
        "units": {
            "system": "plan_units",
            "mm_per_unit": None,
            "scale_confidence": 0.0,
            "scale_source": None,
            "scale_inliers": 0,
            "scale_outliers": 0,
        },
        "image_transform": {
            "type": "similarity",
            "matrix": [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
            "source_px": [0, 0],  # set by caller once page size is known
        },
        "walls": [
            {
                "id": w.id,
                "start": list(w.start),
                "end": list(w.end),
                "thickness": w.thickness,
                "curvature": 0.0,
                "role": "unconfirmed",
                "openings": [],
                "confidence": 0.5,
                "evidence": ["vector"],
                "flags": ["geometric_only_unverified"],
            }
            for w in walls
        ],
        "junctions": [
            {"id": j.id, "point": list(j.point), "type": j.junction_type, "walls": j.wall_ids} for j in junctions
        ],
        "rooms": [],
        "diagnostics": {
            "tier": 4,
            "unresolved": [],
            # NOT measurements -- Phase 6 (render-and-compare) owns this;
            # these three floats exist only to satisfy the schema's
            # mandatory field before that layer is built. Flagged here so
            # they are never mistaken for real numbers downstream.
            "render_agreement": {"wall_iou": 0.0, "unexplained_ink_ratio": 1.0, "hallucinated_ink_ratio": 0.0},
            "kill_log_ref": "extraction/trackv/out/step3a_report.json",
            "pipeline_version": "trackv-step3a",
            "timings_ms": {},
            "cost_usd": 0.0,
        },
    }


def run_plan(plan_id: str, entry) -> dict:
    pdf_path = REPO_ROOT / entry.source_file
    sha256 = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
    dissection = dissect(pdf_path)[0]
    diagonal = math.hypot(*dissection.page_size_px)
    scale = _gt_scale(dissection.page_size_px)

    selection = select_axis_aligned(dissection)
    pair_result = pair_walls(selection, dissection.page_size_px)
    assemble_result = assemble(pair_result, scale_to_gt_frame=scale)

    plan = _build_extraction_result(plan_id, entry, assemble_result.walls, assemble_result.junctions, sha256)
    plan["image_transform"]["matrix"] = [[scale, 0.0, 0.0], [0.0, scale, 0.0], [0.0, 0.0, 1.0]]
    plan["image_transform"]["source_px"] = [
        round(dissection.page_size_px[0] * scale),
        round(dissection.page_size_px[1] * scale),
    ]

    validation = validity(plan)

    funnel = {
        "plan_id": plan_id,
        "select": {
            "theta_deg": round(selection.theta_deg, 3),
            "angular_tolerance_deg": selection.angular_tolerance_deg,
            "n_line_segments_considered": selection.n_line_segments_considered,
            "n_candidates": len(selection.candidates),
            "n_quarantined_curves": len(selection.quarantined_curves),
            "cluster_axis_reports": [
                {
                    "low": round(c.low, 4),
                    "high": round(c.high, 4),
                    "count": c.count,
                    "axis_aligned_fraction": round(c.axis_aligned_fraction, 4)
                    if c.axis_aligned_fraction is not None
                    else None,
                }
                for c in selection.cluster_reports
            ],
        },
        "pair": {
            "n_candidates_below_length_floor": pair_result.funnel.n_candidates_below_length_floor,
            "n_candidates_by_bucket": pair_result.funnel.n_candidates_by_bucket,
            "n_raw_pairs_formed": pair_result.funnel.n_raw_pairs_formed,
            "n_pairs_accepted_greedy": pair_result.funnel.n_pairs_accepted_greedy,
            "n_pairs_rejected_thickness_outlier": pair_result.funnel.n_pairs_rejected_thickness_outlier,
            "thickness_clusters_native_units": [
                {"low": round(c.low, 3), "high": round(c.high, 3), "count": c.count}
                for c in pair_result.funnel.thickness_clusters
            ],
            "n_merges_applied": pair_result.funnel.n_merges_applied,
            "n_opening_candidates": pair_result.funnel.n_opening_candidates,
            "n_walls_before_assemble": len(pair_result.walls),
        },
        "assemble": {
            "n_walls_final": len(assemble_result.walls),
            "n_junctions": len(assemble_result.junctions),
            "n_connected_components": assemble_result.n_connected_components,
            "n_cycle_basis_found": assemble_result.n_cycle_basis_found,
            "n_open_cycle_dangling_ends": len(assemble_result.open_cycle_diagnostics),
            "open_cycle_wall_ids": [d.wall_id for d in assemble_result.open_cycle_diagnostics],
            "n_degenerate_zero_length_walls": assemble_result.n_degenerate_zero_length_walls,
        },
        "schema_validity": {
            "valid": validation.valid,
            "errors": validation.errors[:20],
            "n_errors": len(validation.errors),
        },
        "geometry": {
            "page_size_native_pt": list(dissection.page_size_px),
            "diagonal_native_pt": round(diagonal, 2),
            "gt_scale_factor": round(scale, 6),
        },
    }

    PRED_DIR.mkdir(parents=True, exist_ok=True)
    (PRED_DIR / f"{plan_id}.json").write_text(json.dumps(plan, indent=2), encoding="utf-8")
    return funnel


def main() -> None:
    entries = {e.plan_id: e for e in load_registry()}
    funnels = [run_plan(pid, entries[pid]) for pid in TARGET_PLAN_IDS]

    preds = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in PRED_DIR.glob("*.json")}
    gts = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in GT_DIR.glob("*.json")}
    report = score_corpus(preds, gts)

    EVAL_OUT_DIR.mkdir(parents=True, exist_ok=True)
    eval_summary = {}
    for plan_id, score in report.per_plan.items():
        eval_summary[plan_id] = {
            "valid": score.valid,
            "validity_errors": score.validity_errors[:20],
            "wall_f1_by_tau": {str(tau): round(s.f1, 4) for tau, s in score.wall_by_tau.items()},
            "wall_precision_by_tau": {str(tau): round(s.precision, 4) for tau, s in score.wall_by_tau.items()},
            "wall_recall_by_tau": {str(tau): round(s.recall, 4) for tau, s in score.wall_by_tau.items()},
        }

    out = {"funnels": funnels, "eval": eval_summary}
    REPORT_PATH.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
