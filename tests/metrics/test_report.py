from pathlib import Path

from eval.metrics.engine import score_plan
from eval.metrics.report import render_plan_report
from tests.schema.test_validate import valid_plan


def test_render_plan_report(tmp_path: Path):
    gt = valid_plan()
    score = score_plan(gt, gt, "fixture")
    out = tmp_path / "fixture.html"
    render_plan_report(gt, gt, score, out)
    assert out.exists()
    html = out.read_text(encoding="utf-8")
    assert "fixture" in html
    assert "data:image/png;base64," in html
