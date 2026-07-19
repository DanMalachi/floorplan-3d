"""Bipartite matching core (docs/paper.md Appendix C). Hungarian assignment
for corners (absolute tau) and wall centerlines (symmetric mean distance +
overlap ratio), per Section 1.3.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from scipy.optimize import linear_sum_assignment

# Cost sentinel for "cannot match" cells. Must be finite (linear_sum_assignment
# chokes on all-inf rows/cols) but far larger than any real cost.
NO_MATCH = 1e9


@dataclass
class MatchResult:
    pairs: list[tuple[int, int]]  # (pred_index, gt_index)
    n_pred: int
    n_gt: int

    @property
    def tp(self) -> int:
        return len(self.pairs)

    @property
    def precision(self) -> float:
        return self.tp / self.n_pred if self.n_pred else 1.0

    @property
    def recall(self) -> float:
        return self.tp / self.n_gt if self.n_gt else 1.0

    @property
    def f1(self) -> float:
        p, r = self.precision, self.recall
        return 2 * p * r / (p + r) if (p + r) else 0.0


def _solve(cost: np.ndarray) -> list[tuple[int, int]]:
    if cost.size == 0:
        return []
    row_idx, col_idx = linear_sum_assignment(cost)
    return [(int(r), int(c)) for r, c in zip(row_idx, col_idx) if cost[r, c] < NO_MATCH]


def match_corners(pred_points: list[tuple[float, float]], gt_points: list[tuple[float, float]], tau_abs: float) -> MatchResult:
    n, m = len(pred_points), len(gt_points)
    cost = np.full((n, m), NO_MATCH)
    for i, p in enumerate(pred_points):
        for j, g in enumerate(gt_points):
            d = math.hypot(p[0] - g[0], p[1] - g[1])
            if d < tau_abs:
                cost[i, j] = d
    return MatchResult(_solve(cost), n, m)


def _wall_length(w: dict) -> float:
    return math.hypot(w["end"][0] - w["start"][0], w["end"][1] - w["start"][1])


def _project_scalar(point: tuple[float, float], origin: tuple[float, float], axis: tuple[float, float]) -> float:
    return (point[0] - origin[0]) * axis[0] + (point[1] - origin[1]) * axis[1]


def _sym_mean_dist(p: dict, g: dict, samples: int = 9) -> float:
    """Mean of point-to-segment distance, sampled along p onto g and along g
    onto p, averaged (symmetric)."""

    def point_to_segment(pt, a, b) -> float:
        ax, ay = a
        bx, by = b
        px, py = pt
        dx, dy = bx - ax, by - ay
        length_sq = dx * dx + dy * dy
        if length_sq == 0:
            return math.hypot(px - ax, py - ay)
        t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_sq))
        return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

    def sample(seg_a, seg_b, other_a, other_b) -> float:
        total = 0.0
        for k in range(samples):
            t = k / (samples - 1)
            pt = (seg_a[0] + t * (seg_b[0] - seg_a[0]), seg_a[1] + t * (seg_b[1] - seg_a[1]))
            total += point_to_segment(pt, other_a, other_b)
        return total / samples

    d1 = sample(p["start"], p["end"], g["start"], g["end"])
    d2 = sample(g["start"], g["end"], p["start"], p["end"])
    return (d1 + d2) / 2


def _overlap_ratio(p: dict, g: dict) -> float:
    """Fraction of g's span covered by p's projection onto g's axis."""
    g_len = _wall_length(g)
    if g_len == 0:
        return 0.0
    axis = ((g["end"][0] - g["start"][0]) / g_len, (g["end"][1] - g["start"][1]) / g_len)
    t0 = _project_scalar(tuple(p["start"]), tuple(g["start"]), axis)
    t1 = _project_scalar(tuple(p["end"]), tuple(g["start"]), axis)
    lo, hi = max(0.0, min(t0, t1)), min(g_len, max(t0, t1))
    return max(0.0, hi - lo) / g_len


def centerline_cost(p: dict, g: dict, tau: float) -> float:
    d = _sym_mean_dist(p, g)
    ov = _overlap_ratio(p, g)
    return d if (d < tau and ov > 0.8) else NO_MATCH


@dataclass
class WallMatchResult(MatchResult):
    pred_walls: list[dict] = None
    gt_walls: list[dict] = None

    def endpoint_errors(self) -> list[float]:
        errs = []
        for i, j in self.pairs:
            p, g = self.pred_walls[i], self.gt_walls[j]
            d_direct = math.hypot(p["start"][0] - g["start"][0], p["start"][1] - g["start"][1]) + math.hypot(
                p["end"][0] - g["end"][0], p["end"][1] - g["end"][1]
            )
            d_flipped = math.hypot(p["start"][0] - g["end"][0], p["start"][1] - g["end"][1]) + math.hypot(
                p["end"][0] - g["start"][0], p["end"][1] - g["start"][1]
            )
            errs.append(min(d_direct, d_flipped) / 2)
        return errs

    def thickness_errors(self) -> list[float]:
        return [abs(self.pred_walls[i]["thickness"] - self.gt_walls[j]["thickness"]) for i, j in self.pairs]


def plan_diagonal(walls: list[dict]) -> float:
    xs = [pt[0] for w in walls for pt in (w["start"], w["end"])]
    ys = [pt[1] for w in walls for pt in (w["start"], w["end"])]
    if not xs:
        return 1.0
    return math.hypot(max(xs) - min(xs), max(ys) - min(ys)) or 1.0


def match_walls(pred_walls: list[dict], gt_walls: list[dict], tau_frac: float, diagonal: float | None = None) -> WallMatchResult:
    diagonal = diagonal if diagonal is not None else plan_diagonal(gt_walls or pred_walls)
    tau = tau_frac * diagonal
    n, m = len(pred_walls), len(gt_walls)
    cost = np.full((n, m), NO_MATCH)
    for i, p in enumerate(pred_walls):
        for j, g in enumerate(gt_walls):
            cost[i, j] = centerline_cost(p, g, tau)
    pairs = _solve(cost)
    return WallMatchResult(pairs, n, m, pred_walls, gt_walls)
