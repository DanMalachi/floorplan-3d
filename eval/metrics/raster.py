"""Wall-mask IoU: rasterize both wall sets and compare ink. Blunt but
sensitive to everything at once (docs/paper.md Section 1.3)."""

from __future__ import annotations

import math

import cv2
import numpy as np


def _bounds(walls: list[dict], padding: float) -> tuple[float, float, float, float]:
    xs = [pt[0] for w in walls for pt in (w["start"], w["end"])]
    ys = [pt[1] for w in walls for pt in (w["start"], w["end"])]
    if not xs:
        return (0.0, 0.0, 1.0, 1.0)
    return (min(xs) - padding, min(ys) - padding, max(xs) + padding, max(ys) + padding)


def rasterize_walls(walls: list[dict], bounds: tuple[float, float, float, float], px_per_unit: float) -> np.ndarray:
    x0, y0, x1, y1 = bounds
    w_px = max(1, int(math.ceil((x1 - x0) * px_per_unit)))
    h_px = max(1, int(math.ceil((y1 - y0) * px_per_unit)))
    mask = np.zeros((h_px, w_px), dtype=np.uint8)
    for wall in walls:
        sx = int(round((wall["start"][0] - x0) * px_per_unit))
        sy = int(round((wall["start"][1] - y0) * px_per_unit))
        ex = int(round((wall["end"][0] - x0) * px_per_unit))
        ey = int(round((wall["end"][1] - y0) * px_per_unit))
        thickness_px = max(1, int(round(wall["thickness"] * px_per_unit)))
        cv2.line(mask, (sx, sy), (ex, ey), color=1, thickness=thickness_px)
    return mask.astype(bool)


def wall_mask_iou(pred_walls: list[dict], gt_walls: list[dict], px_per_unit: float = 0.05, padding: float = 500.0) -> float:
    all_walls = pred_walls + gt_walls
    bounds = _bounds(all_walls, padding)
    pred_mask = rasterize_walls(pred_walls, bounds, px_per_unit)
    gt_mask = rasterize_walls(gt_walls, bounds, px_per_unit)
    union = np.logical_or(pred_mask, gt_mask).sum()
    if union == 0:
        return 1.0
    inter = np.logical_and(pred_mask, gt_mask).sum()
    return float(inter) / float(union)
