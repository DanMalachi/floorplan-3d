"""Throwaway dev QA tool: dumps mask + skeleton + recovered wall segments +
junctions overlaid over the source ResPlan polygons, for eyeball review.
matplotlib is fine here (it's a one-off dev tool, not the renderer)."""
from __future__ import annotations

import pickle
import sys
from pathlib import Path

import matplotlib.pyplot as plt

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from extraction.synth.skeleton import extract_wall_skeleton
from extraction.synth.vendor.resplan_utils import get_geometries, normalize_keys

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"


def plot_plan_skeleton(plan, ax):
    plan = normalize_keys(plan)
    wall = plan.get("wall")
    wall_depth = float(plan.get("wall_depth") or 4.0)

    for part in get_geometries(wall):
        xs, ys = part.exterior.xy
        ax.fill(xs, ys, color="#ffd92f", alpha=0.4, edgecolor="none")

    result = extract_wall_skeleton(wall, wall_depth)
    for seg in result.segments:
        ax.plot([seg.start[0], seg.end[0]], [seg.start[1], seg.end[1]], color="red", linewidth=1.2)
    for j in result.junctions:
        color = {1: "green", 2: "gray", 3: "blue", 4: "purple"}.get(len(j.segment_indices), "black")
        ax.plot(j.point[0], j.point[1], "o", color=color, markersize=4)

    ax.set_aspect("equal")
    ax.set_title(
        f"id={plan.get('id')} segs={len(result.segments)} juncs={len(result.junctions)} flags={result.flags}",
        fontsize=7,
    )
    ax.set_axis_off()


def main(n: int = 20, out_path: str = "extraction/synth/reports/skeleton_overlay_qa.png"):
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)

    sample = plans[:n]
    cols = 5
    rows = (len(sample) + cols - 1) // cols
    fig, axes = plt.subplots(rows, cols, figsize=(cols * 4, rows * 4))
    axes = axes.flatten()
    for ax, plan in zip(axes, sample):
        try:
            plot_plan_skeleton(plan, ax)
        except Exception as e:
            ax.set_title(f"id={plan.get('id')} EXCEPTION: {e}", fontsize=7, color="red")
            ax.set_axis_off()
    for ax in axes[len(sample):]:
        ax.set_axis_off()

    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(out, dpi=120)
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
