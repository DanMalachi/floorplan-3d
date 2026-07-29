"""Track V milestone 2 step 3a -- Blocker 2 (issue #8) frame derivation.

Diagnostic, not a pipeline module. Answers the handoff's factual question
(does a page-unit/px form of this corpus's GT exist upstream of its mm
conversion?) and tests the zero-fitted-parameter hypothesis that follows
from it: mm = pred_unit * (metersPerPixel * 1000), rotation = 0,
translation = 0.

Derivation chain (each link independently checkable, not assumed):
  1. `run_step3a.py`'s own `_gt_scale` already rescales predictions into a
     1600px-long-edge raster frame (GT_LONG_EDGE_PX). This is not new --
     it is documented in that file's header and already wired.
  2. That raster frame is bit-identical to the legacy hand-trace tool's
     frame: `legacy/data/floorplan-gt/*.gt.json`'s `imageSize` equals
     `round(page.rect.w * zoom), round(page.rect.h * zoom)` for
     `zoom = min(1600/rect.w, 1600/rect.h)` computed directly from the
     real source PDFs -- confirmed numerically for both plans, not
     assumed from either file's own claims.
  3. `convert_legacy_gt.py:44-47` converts that same px frame to the GT's
     mm frame with a pure scalar, `[p.x * scale, p.y * scale]`,
     `scale = metersPerPixel * 1000` -- no offset term, no axis flip.
  4. `run_step3a.py:124`'s `image_transform.matrix` and `assemble()`'s
     `scale_to_gt_frame` are likewise scale-only -- no offset term either.

Both frames therefore assert origin (0,0), y-down, with NO free
parameters: `mm_per_pred_unit = metersPerPixel * 1000`, rotation = 0,
translation = 0. This script renders the overlay and measures the
full-population nearest-GT-endpoint residual to test that claim, rather
than trusting the chain of assertions alone.
"""

from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

PRED_DIR = Path(__file__).parent / "out" / "step3a_predictions"
GT_DIR = REPO_ROOT / "data" / "corpus" / "gt_provisional"
OUT_DIR = Path(__file__).parent / "out"

# metersPerPixel recorded by the legacy hand-trace tool at export time
# (legacy/data/floorplan-gt/*.gt.json) -- the calibration constant a human
# set once, independent of anything Track V predicts.
LEGACY_METERS_PER_PIXEL = {
    "15x30-ft-Best-House-Plan-Model": 0.008323667459886908,
    "30x50-Model-landscape": 0.012918215560344833,
}

MM_PER_PRED_UNIT = {k: v * 1000.0 for k, v in LEGACY_METERS_PER_PIXEL.items()}

TARGET_PLAN_IDS = list(MM_PER_PRED_UNIT.keys())


def _wall_points(walls: list[dict], scale: float = 1.0) -> list[tuple[float, float]]:
    return [(p[0] * scale, p[1] * scale) for w in walls for p in (w["start"], w["end"])]


def render_overlay() -> Path:
    fig, axes = plt.subplots(1, 2, figsize=(16, 9))
    for ax, plan_id in zip(axes, TARGET_PLAN_IDS):
        scale = MM_PER_PRED_UNIT[plan_id]
        pred = json.loads((PRED_DIR / f"{plan_id}.json").read_text(encoding="utf-8"))
        gt = json.loads((GT_DIR / f"{plan_id}.json").read_text(encoding="utf-8"))
        for i, w in enumerate(gt["walls"]):
            ax.plot(
                [w["start"][0], w["end"][0]], [w["start"][1], w["end"][1]],
                color="tab:green", linewidth=2.5, alpha=0.6,
                label="GT" if i == 0 else None,
            )
        for i, w in enumerate(pred["walls"]):
            ax.plot(
                [w["start"][0] * scale, w["end"][0] * scale],
                [w["start"][1] * scale, w["end"][1] * scale],
                color="tab:red", linewidth=1.0, alpha=0.8,
                label="pred (scale-only, rotation=0, translation=0)" if i == 0 else None,
            )
        ax.set_title(plan_id)
        ax.set_aspect("equal")
        ax.invert_yaxis()
        ax.legend()
    fig.tight_layout()
    out_path = OUT_DIR / "step3a_frame_overlay.png"
    fig.savefig(out_path, dpi=140)
    plt.close(fig)
    return out_path


def nearest_endpoint_residuals() -> dict:
    summary = {}
    fig, axes = plt.subplots(1, 2, figsize=(14, 6))
    for ax, plan_id in zip(axes, TARGET_PLAN_IDS):
        scale = MM_PER_PRED_UNIT[plan_id]
        pred = json.loads((PRED_DIR / f"{plan_id}.json").read_text(encoding="utf-8"))
        gt = json.loads((GT_DIR / f"{plan_id}.json").read_text(encoding="utf-8"))
        gt_pts = _wall_points(gt["walls"])
        recs = []
        for w in pred["walls"]:
            for p in (w["start"], w["end"]):
                px, py = p[0] * scale, p[1] * scale
                bestd = bestdx = bestdy = None
                for gx, gy in gt_pts:
                    dx, dy = px - gx, py - gy
                    d = (dx * dx + dy * dy) ** 0.5
                    if bestd is None or d < bestd:
                        bestd, bestdx, bestdy = d, dx, dy
                recs.append((bestd, bestdx, bestdy))
        dists = [r[0] for r in recs]
        by_radius = {}
        for radius in (50, 100, 150, 200, 300, 500):
            near = [r for r in recs if r[0] < radius]
            by_radius[radius] = {
                "n_near": len(near),
                "frac": round(len(near) / len(recs), 4),
                "median_dx": statistics.median(r[1] for r in near) if near else None,
                "median_dy": statistics.median(r[2] for r in near) if near else None,
            }
        summary[plan_id] = {
            "n_pred_endpoints": len(recs),
            "median_dist_all": statistics.median(dists),
            "iqr_dist_all": list(statistics.quantiles(dists, n=4)[::2]),
            "by_radius_mm": by_radius,
        }
        ax.scatter([r[1] for r in recs], [r[2] for r in recs], s=8, alpha=0.5)
        ax.axhline(0, color="k", lw=0.5)
        ax.axvline(0, color="k", lw=0.5)
        ax.set_xlim(-3000, 3000)
        ax.set_ylim(-3000, 3000)
        ax.set_title(plan_id)
        ax.set_xlabel("dx (mm)")
        ax.set_ylabel("dy (mm)")
        ax.set_aspect("equal")
    fig.tight_layout()
    scatter_path = OUT_DIR / "step3a_endpoint_residual_scatter.png"
    fig.savefig(scatter_path, dpi=140)
    plt.close(fig)
    summary["_scatter_path"] = str(scatter_path.relative_to(REPO_ROOT))
    return summary


def main() -> None:
    overlay_path = render_overlay()
    residuals = nearest_endpoint_residuals()
    result = {
        "mm_per_pred_unit": MM_PER_PRED_UNIT,
        "overlay_path": str(overlay_path.relative_to(REPO_ROOT)),
        "endpoint_residuals": residuals,
    }
    out_path = OUT_DIR / "step3a_frame_derivation.json"
    out_path.write_text(json.dumps(result, indent=2, default=str), encoding="utf-8")
    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
