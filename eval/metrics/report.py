"""Per-plan HTML report: GT-vs-pred overlay + residual map. Visual diffing
is where most debugging happens (docs/paper.md Section 6.2)."""

from __future__ import annotations

import base64
import io
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from eval.metrics.engine import PlanScore
from eval.metrics.matching import match_walls, plan_diagonal

REPORT_TAU = 0.01


def _plot_walls(ax, walls: list[dict], color: str, style: str, label: str) -> None:
    first = True
    for w in walls:
        xs, ys = zip(w["start"], w["end"])
        ax.plot(
            xs, ys, color=color, linestyle=style,
            linewidth=max(1.0, w["thickness"] / 50), alpha=0.7,
            label=label if first else None,
        )
        first = False


def _fig_to_data_uri(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=110, bbox_inches="tight")
    plt.close(fig)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def render_plan_report(pred: dict, gt: dict, score: PlanScore, out_path: Path) -> None:
    pred_walls, gt_walls = pred.get("walls", []), gt.get("walls", [])
    diagonal = plan_diagonal(gt_walls or pred_walls)
    match = match_walls(pred_walls, gt_walls, REPORT_TAU, diagonal)
    matched_pred = {pred_walls[i]["id"] for i, _ in match.pairs}
    matched_gt = {gt_walls[j]["id"] for _, j in match.pairs}
    missed = [w for w in gt_walls if w["id"] not in matched_gt]  # unexplained (F4)
    hallucinated = [w for w in pred_walls if w["id"] not in matched_pred]  # F1/F2

    fig1, ax1 = plt.subplots(figsize=(6, 6))
    _plot_walls(ax1, gt_walls, "tab:blue", "-", "GT")
    _plot_walls(ax1, pred_walls, "tab:red", "--", "Pred")
    ax1.set_title("GT (blue) vs Pred (red dashed)")
    ax1.set_aspect("equal")
    ax1.legend(loc="upper right", fontsize=8)
    overlay_uri = _fig_to_data_uri(fig1)

    matched_gt_walls = [w for w in gt_walls if w["id"] in matched_gt]

    fig2, ax2 = plt.subplots(figsize=(6, 6))
    _plot_walls(ax2, matched_gt_walls, "lightgray", "-", "matched")
    _plot_walls(ax2, missed, "tab:orange", "-", "missed (unexplained)")
    _plot_walls(ax2, hallucinated, "tab:purple", "--", "hallucinated")
    ax2.set_title(f"Residual @ tau={REPORT_TAU}")
    ax2.set_aspect("equal")
    ax2.legend(loc="upper right", fontsize=8)
    residual_uri = _fig_to_data_uri(fig2)

    rows = "".join(
        f"<tr><td>{tau}</td><td>{s.precision:.3f}</td><td>{s.recall:.3f}</td>"
        f"<td>{s.f1:.3f}</td><td>{'' if s.mean_endpoint_error is None else f'{s.mean_endpoint_error:.1f}'}</td>"
        f"<td>{'' if s.mean_thickness_error is None else f'{s.mean_thickness_error:.1f}'}</td></tr>"
        for tau, s in sorted(score.wall_by_tau.items())
    )
    validity_rows = "".join(f"<li>{e}</li>" for e in score.validity_errors) or "<li>none</li>"

    html = f"""<!doctype html><html><head><meta charset="utf-8">
<title>Phase 0 report — {score.plan_id}</title>
<style>body{{font-family:system-ui,sans-serif;margin:24px}}
table{{border-collapse:collapse}}td,th{{border:1px solid #ccc;padding:4px 10px;text-align:right}}
img{{max-width:100%;border:1px solid #ddd}}.imgs{{display:flex;gap:16px;flex-wrap:wrap}}</style>
</head><body>
<h1>{score.plan_id}</h1>
<div class="imgs">
<div><img src="{overlay_uri}"></div>
<div><img src="{residual_uri}"></div>
</div>
<h2>Wall metrics by tau</h2>
<table><tr><th>tau</th><th>precision</th><th>recall</th><th>f1</th><th>mean endpoint err</th><th>mean thickness err</th></tr>
{rows}</table>
<p>wall_mask_iou: {score.wall_mask_iou:.3f}</p>
<h2>Openings</h2>
<p>precision={score.opening_precision:.3f} recall={score.opening_recall:.3f} f1={score.opening_f1:.3f}</p>
<h2>Rooms</h2>
<p>count_error={score.room_count_error} label_accuracy={score.room_label_accuracy:.3f}
adjacency_edit_distance={score.room_adjacency_edit_distance}</p>
<h2>Validity: {score.valid}</h2>
<ul>{validity_rows}</ul>
</body></html>"""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
