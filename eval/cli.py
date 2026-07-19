"""Eval harness CLI. `run` scores predictions against GT and writes
per-plan + per-stratum HTML reports. `selftest` is the harness's own
correctness check (docs/extraction-plan.md Phase 0 exit bar): GT-vs-GT
must score perfect on every metric, and a deliberately corrupted GT copy
must score specific, correct penalties.
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path

from eval.metrics.engine import CorpusReport, score_corpus, score_plan
from eval.metrics.report import render_plan_report


def _load_plans(dir_path: Path) -> dict[str, dict]:
    return {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(dir_path.glob("*.json"))}


def cmd_run(args: argparse.Namespace) -> int:
    pred_dir, gt_dir, out_dir = Path(args.pred), Path(args.gt), Path(args.out)
    preds, gts = _load_plans(pred_dir), _load_plans(gt_dir)
    missing = set(gts) - set(preds)
    if missing:
        print(f"warning: {len(missing)} GT plans have no matching prediction: {sorted(missing)}", file=sys.stderr)

    report: CorpusReport = score_corpus(preds, gts)
    out_dir.mkdir(parents=True, exist_ok=True)
    for plan_id, score in report.per_plan.items():
        render_plan_report(preds[plan_id], gts[plan_id], score, out_dir / f"{plan_id}.html")

    summary = {
        "n_plans": len(report.per_plan),
        "strata": {
            "|".join(key): report.stratum_summary(key)
            for key in report.by_stratum
        },
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return 0


def _corrupt(plan: dict) -> dict:
    """One mutation of each kind the schema validator is tested against
    (tests/schema/test_validate.py), applied together so selftest exercises
    the metric engine's response to a genuinely broken plan, not just the
    validator in isolation."""
    p = copy.deepcopy(plan)
    if p["walls"]:
        p["walls"][0]["end"] = [p["walls"][0]["end"][0] + 500.0, p["walls"][0]["end"][1] + 500.0]
    if p["walls"] and p["walls"][0]["openings"]:
        p["walls"][0]["openings"][0]["center_offset"] = 1_000_000.0
    return p


def cmd_selftest(args: argparse.Namespace) -> int:
    from tests.schema.test_validate import valid_plan

    ok = True
    gt = valid_plan()

    identical = score_plan(gt, gt, "selftest-identical")
    perfect = (
        all(s.f1 == 1.0 and s.precision == 1.0 and s.recall == 1.0 for s in identical.wall_by_tau.values())
        and identical.wall_mask_iou == 1.0
        and identical.opening_f1 == 1.0
        and identical.valid is True
        and identical.room_count_error == 0
        and identical.room_label_accuracy == 1.0
    )
    print(f"[selftest] GT-vs-GT perfect: {'PASS' if perfect else 'FAIL'}")
    ok &= perfect

    corrupted = _corrupt(gt)
    corrupted_score = score_plan(corrupted, gt, "selftest-corrupted")
    penalized = (
        corrupted_score.valid is False
        and corrupted_score.wall_by_tau[0.01].f1 < 1.0
        and corrupted_score.opening_f1 < 1.0
    )
    print(f"[selftest] corrupted-GT correct penalties: {'PASS' if penalized else 'FAIL'}")
    print(f"  validity_errors: {corrupted_score.validity_errors}")
    print(f"  wall f1@1%: {corrupted_score.wall_by_tau[0.01].f1:.3f}")
    print(f"  opening f1: {corrupted_score.opening_f1:.3f}")
    ok &= penalized

    return 0 if ok else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m eval.cli")
    sub = parser.add_subparsers(dest="command", required=True)

    run_p = sub.add_parser("run", help="score predictions against ground truth")
    run_p.add_argument("--pred", required=True)
    run_p.add_argument("--gt", required=True)
    run_p.add_argument("--strata", required=False, default=None)
    run_p.add_argument("--out", required=True)
    run_p.set_defaults(func=cmd_run)

    selftest_p = sub.add_parser("selftest", help="harness correctness check (GT-vs-GT + corrupted-GT)")
    selftest_p.set_defaults(func=cmd_selftest)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
