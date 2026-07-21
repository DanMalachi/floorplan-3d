"""Phase 1 gate summary: scores all five baselines (a, b, c, d1, d2) against
data/corpus/gt_provisional with eval.metrics.engine.score_corpus, writes a
per-baseline HTML report via eval.cli's renderer, and prints one consolidated
per-stratum markdown table plus overall validity/wall/opening numbers for
reports/phase-1-gate.md.

Usage: python -m extraction.baselines.summarize
"""

from __future__ import annotations

import copy
import json
import math
from pathlib import Path
from statistics import mean

from eval.metrics.engine import score_corpus
from eval.metrics.report import render_plan_report
from eval.registry.registry import load_registry

REPO_ROOT = Path(__file__).resolve().parents[2]
GT_DIR = REPO_ROOT / "data" / "corpus" / "gt_provisional"
BASELINES = {
    "a_cubicasa": REPO_ROOT / "data" / "baselines_out" / "a_cubicasa",
    "b_vlm": REPO_ROOT / "data" / "baselines_out" / "b_vlm",
    "c_opencv": REPO_ROOT / "data" / "baselines_out" / "c_opencv",
    "d1_legacy_free": REPO_ROOT / "data" / "baselines_out" / "d1_legacy_free",
    "d2_legacy_vlm": REPO_ROOT / "data" / "baselines_out" / "d2_legacy_vlm",
}
REPORTS_ROOT = REPO_ROOT / "reports" / "phase-1"


def _load_plans(dir_path: Path) -> dict[str, dict]:
    return {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(dir_path.glob("*.json")) if not p.name.endswith(".errors.json")}


def _bbox_diagonal(walls: list[dict]) -> float:
    xs = [pt[0] for w in walls for pt in (w["start"], w["end"])]
    ys = [pt[1] for w in walls for pt in (w["start"], w["end"])]
    if not xs:
        return 0.0
    return math.hypot(max(xs) - min(xs), max(ys) - min(ys))


def _rescale_to_gt_extent(pred: dict, gt: dict) -> dict:
    """None of the Phase-1 baselines (a/c/d1/d2) attempt scale calibration —
    they emit raw render-pixel coordinates (units.system="plan_units"),
    while every provisional GT plan is calibrated to millimeters
    (units.system="mm"). The metric engine matches on raw absolute
    coordinate distance with no unit conversion, so comparing pixel-space
    predictions against millimeter-space GT directly would score every
    wall as unmatched regardless of geometric quality — conflating "no
    scale" (Phase 5's job, not Phase 1's) with "wrong shape" (what Phase 1
    is actually trying to measure).

    Fix: rescale the WHOLE prediction uniformly so its wall bounding-box
    diagonal matches GT's. This assumes both point clouds describe the same
    plan at different unknown scales (true here, since every baseline reads
    the same source image the GT was traced from) — it does not give any
    baseline credit for scale it didn't actually recover; baseline (b) is
    exempt in practice since its own prompt already targets a real-world-ish
    coordinate frame, but is rescaled by this same uniform rule for
    consistency."""
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
    return rescaled


def main() -> None:
    gts = _load_plans(GT_DIR)
    print(f"GT plans: {len(gts)}")

    # score_corpus's own by_stratum reads encoding/convention/scope from each
    # GT plan's "source" block — but every provisional GT plan (all produced
    # by the same Phase-0 legacy-GT conversion script) carries the SAME
    # placeholder values there regardless of true style, so it collapses to
    # one stratum. eval/registry/registry.csv is the actual source of truth
    # (assigned manually in Phase 0) — use it instead.
    registry_strata = {e.plan_id: (e.encoding_class, e.convention_class, e.scope_class) for e in load_registry()}

    all_reports = {}
    for name, pred_dir in BASELINES.items():
        if not pred_dir.exists():
            print(f"[summarize] {name}: MISSING output dir, skipped")
            continue
        raw_preds = _load_plans(pred_dir)
        preds = {pid: _rescale_to_gt_extent(p, gts[pid]) for pid, p in raw_preds.items() if pid in gts}
        missing = set(gts) - set(preds)
        if missing:
            print(f"[summarize] {name}: {len(missing)} GT plans have no prediction: {sorted(missing)}")
        report = score_corpus(preds, gts)
        all_reports[name] = report

        out_dir = REPORTS_ROOT / name
        out_dir.mkdir(parents=True, exist_ok=True)
        for plan_id, score in report.per_plan.items():
            render_plan_report(preds[plan_id], gts[plan_id], score, out_dir / f"{plan_id}.html")

        n = len(report.per_plan)
        validity_rate = mean(1.0 if s.valid else 0.0 for s in report.per_plan.values()) if n else 0.0
        wall_f1 = mean(s.wall_by_tau[0.01].f1 for s in report.per_plan.values()) if n else 0.0
        opening_f1 = mean(s.opening_f1 for s in report.per_plan.values()) if n else 0.0
        room_label_acc = mean(s.room_label_accuracy for s in report.per_plan.values()) if n else 0.0
        print(f"[summarize] {name}: n={n} validity={validity_rate:.2f} wallF1@1%={wall_f1:.3f} "
              f"openingF1={opening_f1:.3f} roomLabelAcc={room_label_acc:.3f}")

    # ---- per-stratum table (registry-derived strata) -----------------------
    def stratum_summary(report, stratum: tuple[str, str, str]) -> dict:
        plan_ids = [pid for pid in report.per_plan if registry_strata.get(pid) == stratum]
        scores = [report.per_plan[pid] for pid in plan_ids]
        if not scores:
            return {}
        return {
            "n_plans": len(scores),
            "wall_f1": mean(s.wall_by_tau[0.01].f1 for s in scores),
            "wall_precision": mean(s.wall_by_tau[0.01].precision for s in scores),
            "wall_recall": mean(s.wall_by_tau[0.01].recall for s in scores),
            "wall_mask_iou": mean(s.wall_mask_iou for s in scores),
            "opening_f1": mean(s.opening_f1 for s in scores),
            "validity_rate": mean(1.0 if s.valid else 0.0 for s in scores),
        }

    all_strata = sorted(set(registry_strata.values()))
    print("\n=== PER-STRATUM TABLE (wall F1 @ tau=1%, rescaled-to-GT-extent) ===")
    header = "stratum".ljust(28) + "".join(name.ljust(18) for name in BASELINES)
    print(header)
    for stratum in all_strata:
        row = "/".join(stratum).ljust(28)
        for name in BASELINES:
            report = all_reports.get(name)
            summary = stratum_summary(report, stratum) if report else {}
            cell = f"{summary.get('wall_f1', float('nan')):.2f}" if summary else "—"
            row += cell.ljust(18)
        print(row)

    # ---- dump raw summary json for the report writer -----------------------
    summary_path = REPORTS_ROOT / "summary.json"
    REPORTS_ROOT.mkdir(parents=True, exist_ok=True)
    dump = {}
    for name, report in all_reports.items():
        dump[name] = {
            "n_plans": len(report.per_plan),
            "strata": {
                "|".join(key): stratum_summary(report, key)
                for key in all_strata
            },
            "per_plan": {
                pid: {
                    "valid": s.valid,
                    "validity_errors": s.validity_errors,
                    "wall_f1_1pct": s.wall_by_tau[0.01].f1,
                    "wall_precision_1pct": s.wall_by_tau[0.01].precision,
                    "wall_recall_1pct": s.wall_by_tau[0.01].recall,
                    "wall_mask_iou": s.wall_mask_iou,
                    "opening_f1": s.opening_f1,
                    "room_count_error": s.room_count_error,
                    "room_label_accuracy": s.room_label_accuracy,
                }
                for pid, s in report.per_plan.items()
            },
        }
    summary_path.write_text(json.dumps(dump, indent=2), encoding="utf-8")
    print(f"\nwrote {summary_path}")


if __name__ == "__main__":
    main()
