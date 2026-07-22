"""Plots step 3a's predicted walls (native frame) next to GT walls (mm
frame) with each side's top-3 longest walls highlighted, so a hand-picked
similarity-transform anchor correspondence (`analyze_step3a_pinned.py`) can
be *visually* verified rather than assumed from coordinates alone. Not a
pipeline module. Writes `out/pin_check_<plan_id>.png`.
"""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

REPO_ROOT = Path(__file__).resolve().parents[2]
PRED_DIR = REPO_ROOT / "extraction" / "trackv" / "out" / "step3a_predictions"
GT_DIR = REPO_ROOT / "data" / "corpus" / "gt_provisional"
OUT_DIR = REPO_ROOT / "extraction" / "trackv" / "out"

PLAN_IDS = ["15x30-ft-Best-House-Plan-Model", "30x50-Model-landscape"]


def _wall_len(w: dict) -> float:
    return ((w["start"][0] - w["end"][0]) ** 2 + (w["start"][1] - w["end"][1]) ** 2) ** 0.5


def _plot_walls(ax, walls: list[dict], top_n: int, title: str) -> None:
    top_ids = {w["id"] for w in sorted(walls, key=_wall_len, reverse=True)[:top_n]}
    for w in walls:
        x, y = [w["start"][0], w["end"][0]], [w["start"][1], w["end"][1]]
        if w["id"] in top_ids:
            ax.plot(x, y, color="red", linewidth=2.5, zorder=3)
            ax.annotate(f"{w['id']} ({_wall_len(w):.0f})", ((x[0] + x[1]) / 2, (y[0] + y[1]) / 2), fontsize=7, color="red")
        else:
            ax.plot(x, y, color="steelblue", linewidth=1, zorder=1)
    ax.set_title(title)
    ax.set_aspect("equal")
    ax.invert_yaxis()


def main() -> None:
    for plan_id in PLAN_IDS:
        pred = json.loads((PRED_DIR / f"{plan_id}.json").read_text(encoding="utf-8"))
        gt = json.loads((GT_DIR / f"{plan_id}.json").read_text(encoding="utf-8"))

        fig, axes = plt.subplots(1, 2, figsize=(16, 8))
        _plot_walls(axes[0], pred["walls"], 3, f"{plan_id} -- PRED (native, top-3 longest red)")
        _plot_walls(axes[1], gt["walls"], 3, f"{plan_id} -- GT (mm, top-3 longest red)")
        fig.tight_layout()
        safe = plan_id.replace(" ", "_")
        out_path = OUT_DIR / f"pin_check_{safe}.png"
        fig.savefig(out_path, dpi=130)
        plt.close(fig)
        print("wrote", out_path)


if __name__ == "__main__":
    main()
