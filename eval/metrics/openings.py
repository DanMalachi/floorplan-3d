"""Opening detection F1 (docs/paper.md Appendix C opening_tp): an opening
counts as TP only if class matches, it's attached to the matched host wall,
its center is within tau, and its width is within 15%. Attachment
correctness is part of the definition — wrong-wall is a miss + a false
positive, not a near-hit.
"""

from __future__ import annotations

import math

import numpy as np

from eval.metrics.matching import NO_MATCH, MatchResult, _solve, _wall_length, plan_diagonal


def flatten_openings(walls: list[dict]) -> list[dict]:
    flat = []
    for w in walls:
        length = _wall_length(w)
        if length == 0:
            continue
        ux = (w["end"][0] - w["start"][0]) / length
        uy = (w["end"][1] - w["start"][1]) / length
        for o in w.get("openings", []):
            cx = w["start"][0] + ux * o["center_offset"]
            cy = w["start"][1] + uy * o["center_offset"]
            flat.append({**o, "host_wall_id": w["id"], "center_world": (cx, cy)})
    return flat


def opening_tp(po: dict, go: dict, wall_match: dict[str, str], tau: float) -> bool:
    if po["class"] != go["class"]:
        return False
    if wall_match.get(po["host_wall_id"]) != go["host_wall_id"]:
        return False
    d = math.hypot(po["center_world"][0] - go["center_world"][0], po["center_world"][1] - go["center_world"][1])
    if d >= tau:
        return False
    if go["width"] == 0 or abs(po["width"] - go["width"]) > 0.15 * go["width"]:
        return False
    return True


def match_openings(
    pred_walls: list[dict], gt_walls: list[dict], wall_match: dict[str, str], tau_frac: float, diagonal: float | None = None
) -> MatchResult:
    diagonal = diagonal if diagonal is not None else plan_diagonal(gt_walls or pred_walls)
    tau = tau_frac * diagonal
    pred_o = flatten_openings(pred_walls)
    gt_o = flatten_openings(gt_walls)
    n, m = len(pred_o), len(gt_o)
    cost = np.full((n, m), NO_MATCH)
    for i, po in enumerate(pred_o):
        for j, go in enumerate(gt_o):
            if opening_tp(po, go, wall_match, tau):
                d = math.hypot(po["center_world"][0] - go["center_world"][0], po["center_world"][1] - go["center_world"][1])
                cost[i, j] = d
    pairs = _solve(cost)
    return MatchResult(pairs, n, m)
