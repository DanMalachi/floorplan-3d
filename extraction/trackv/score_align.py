"""Scoring-only coordinate-frame adapter -- Track V milestone 2 step 3a,
Dan's coordinate-frame ruling.

Not a pipeline component and not part of `extraction/schema` output: this
exists purely so `eval/metrics` (frozen, unmodified, imported as-is) can be
called at all on Track V predictions against this corpus's real-world-mm GT,
per reports/phase-2-gate.md's finding that Track V's uncalibrated
`plan_units` predictions and this GT's mm frame are not otherwise
comparable under `matching.py`'s pure absolute-distance cost. Interim: the
real fix is a harness-level frame-normalization convention (filed as a
Phase-0 amendment item), not this adapter -- this module is meant to be
superseded, not extended.

Fits ONE global similarity transform (scale + rotation + translation only;
deliberately no affine/shear, no per-wall correction) in two stages:

1. Coarse seed from the single longest pred/GT wall pair. The longest wall
   in a floor plan is robustly a real, unbroken exterior wall run, not one
   of pairing's spurious short fragments -- unlike a raw bounding-box ratio,
   which this step's own ~7x wall over-production (reports/phase-2-gate.md)
   directly inflates and corrupts (a large volume of short spurious walls
   pushes the pred bbox outward without pushing the true building envelope
   outward by anything close to the same amount).
2. One refine pass: apply the coarse transform, nearest-centerline-match
   pred to GT walls within a generous radius, then recompute scale
   (median), rotation (circular median), and translation (median) from that
   *whole* coarse-matched population rather than the single seed pair --
   robust to individual bad coarse matches, per Dan's explicit instruction
   not to trust a raw single-ratio estimate.

This is a directional read, not a precision metric -- one refine iteration,
no iterative ICP loop.
"""

from __future__ import annotations

import copy
import math
import statistics
from dataclasses import dataclass

Point2 = tuple[float, float]


@dataclass
class SimilarityTransform:
    scale: float
    rotation_deg: float
    tx: float
    ty: float

    def apply(self, p: Point2) -> Point2:
        theta = math.radians(self.rotation_deg)
        c, s = math.cos(theta), math.sin(theta)
        x, y = p
        rx = c * x - s * y
        ry = s * x + c * y
        return (self.scale * rx + self.tx, self.scale * ry + self.ty)


def _wall_length(w: dict) -> float:
    return math.hypot(w["end"][0] - w["start"][0], w["end"][1] - w["start"][1])


def _wall_angle_deg(w: dict) -> float:
    dx, dy = w["end"][0] - w["start"][0], w["end"][1] - w["start"][1]
    return math.degrees(math.atan2(dy, dx)) % 180.0


def _wall_midpoint(w: dict) -> Point2:
    return ((w["start"][0] + w["end"][0]) / 2.0, (w["start"][1] + w["end"][1]) / 2.0)


def _circular_mean_deg_180(angles: list[float]) -> float:
    """Mean of small *signed* rotation deltas (each already wrapped into
    (-90, 90] by the caller -- undirected-line ambiguity is resolved before
    this function ever sees them). Uses the double-angle trick so deltas
    near +90/-90 don't cancel, then halves back -- but must NOT re-wrap the
    result into [0, 180) with a plain `% 180.0`: Python's `%` returns a
    result with the divisor's sign, so a legitimate small negative delta
    (e.g. -2 deg) would silently become +178 deg. Found exactly this way,
    against real data: predicted rotation locked at ~179 deg on plans
    confirmed elsewhere (select.py's theta) to be within 1 deg of
    unrotated. Wraps into (-90, 90] instead, matching the caller's own
    convention for what a "delta" means.
    """
    xs = sum(math.cos(math.radians(2 * a)) for a in angles)
    ys = sum(math.sin(math.radians(2 * a)) for a in angles)
    result = math.degrees(math.atan2(ys, xs)) / 2.0
    if result > 90.0:
        result -= 180.0
    elif result <= -90.0:
        result += 180.0
    return result


def _seed_transform(pred_walls: list[dict], gt_walls: list[dict]) -> SimilarityTransform:
    pred_longest = max(pred_walls, key=_wall_length)
    gt_longest = max(gt_walls, key=_wall_length)

    scale = _wall_length(gt_longest) / _wall_length(pred_longest)
    # rotation ambiguous mod 180 (undirected line) -- pick the delta, sign
    # resolved later isn't needed since we only ever compare mod-180 angles
    rotation = (_wall_angle_deg(gt_longest) - _wall_angle_deg(pred_longest)) % 180.0
    if rotation > 90.0:
        rotation -= 180.0  # shortest rotation, not the long way around

    theta = math.radians(rotation)
    c, s = math.cos(theta), math.sin(theta)
    pm = _wall_midpoint(pred_longest)
    gm = _wall_midpoint(gt_longest)
    rx = scale * (c * pm[0] - s * pm[1])
    ry = scale * (s * pm[0] + c * pm[1])
    tx, ty = gm[0] - rx, gm[1] - ry
    return SimilarityTransform(scale=scale, rotation_deg=rotation, tx=tx, ty=ty)


ORIENTATION_TOLERANCE_DEG = 15.0
MAX_LENGTH_RATIO = 3.0  # a coarse match's pred/gt length ratio can't be more than this off the seed scale


def _nearest_neighbor_matches(transformed_pred: list[dict], gt_walls: list[dict], radius: float) -> list[tuple[int, int]]:
    """Greedy nearest-centroid matching within `radius`, one-to-one -- but
    ONLY among orientation-compatible, length-plausible candidates.

    Found necessary directly against the real corpus: with ~7x more
    predicted walls than GT walls (reports/phase-2-gate.md's
    over-production finding), pure midpoint-distance matching lets a short
    spurious wall sitting near a real GT wall's midpoint out-compete the
    correct match, corrupting the whole refine stage (first attempt
    recovered a 89 deg rotation on an unrotated plan and a scale spread
    from 4x to 144x -- symptomatic of matching walls that don't actually
    correspond at all). Orientation and length-ratio filters are cheap,
    principled discriminators a spurious short cross-axis fragment can't
    pass by geometric accident the way a bare distance threshold can.

    Coarse correspondence only -- the real matched pairs used for
    reporting come from frozen matching.py's Hungarian assignment later.
    """
    pairs = []
    used_gt: set[int] = set()
    candidates = []
    for i, p in enumerate(transformed_pred):
        pm = _wall_midpoint(p)
        p_angle = _wall_angle_deg(p)
        p_len = _wall_length(p)
        for j, g in enumerate(gt_walls):
            g_angle = _wall_angle_deg(g)
            angle_d = abs(p_angle - g_angle) % 180.0
            angle_d = min(angle_d, 180.0 - angle_d)
            if angle_d > ORIENTATION_TOLERANCE_DEG:
                continue
            g_len = _wall_length(g)
            if p_len <= 0 or g_len <= 0:
                continue
            # p is already seed-transformed, so both lengths are already in
            # the same rough scale -- a straight ratio, no re-scaling
            length_ratio = g_len / p_len
            if not (1.0 / MAX_LENGTH_RATIO <= length_ratio <= MAX_LENGTH_RATIO):
                continue
            gm = _wall_midpoint(g)
            d = math.hypot(pm[0] - gm[0], pm[1] - gm[1])
            if d <= radius:
                candidates.append((d, i, j))
    candidates.sort(key=lambda c: c[0])
    used_pred: set[int] = set()
    for d, i, j in candidates:
        if i in used_pred or j in used_gt:
            continue
        used_pred.add(i)
        used_gt.add(j)
        pairs.append((i, j))
    return pairs


def fit_similarity_transform(pred_walls: list[dict], gt_walls: list[dict]) -> tuple[SimilarityTransform, dict]:
    """Returns the fitted transform plus a diagnostics dict: seed transform,
    number of coarse matches, and the per-parameter spread across the
    coarse-matched population (the "consistency" of the recovered scale)."""
    if not pred_walls or not gt_walls:
        return SimilarityTransform(1.0, 0.0, 0.0, 0.0), {"error": "empty wall list"}

    seed = _seed_transform(pred_walls, gt_walls)
    gt_diagonal = math.hypot(
        max(pt[0] for w in gt_walls for pt in (w["start"], w["end"]))
        - min(pt[0] for w in gt_walls for pt in (w["start"], w["end"])),
        max(pt[1] for w in gt_walls for pt in (w["start"], w["end"]))
        - min(pt[1] for w in gt_walls for pt in (w["start"], w["end"])),
    )
    coarse_radius = 0.15 * gt_diagonal

    transformed = [
        {**w, "start": seed.apply(tuple(w["start"])), "end": seed.apply(tuple(w["end"]))} for w in pred_walls
    ]
    coarse_pairs = _nearest_neighbor_matches(transformed, gt_walls, coarse_radius)

    if len(coarse_pairs) < 2:
        # too little correspondence to refine responsibly -- ship the seed,
        # flagged, rather than fabricate a "refined" number off noise
        return seed, {
            "seed": {"scale": seed.scale, "rotation_deg": seed.rotation_deg, "tx": seed.tx, "ty": seed.ty},
            "n_coarse_matches": len(coarse_pairs),
            "refined": False,
            "note": "fewer than 2 coarse matches -- refine skipped, seed transform used as-is",
        }

    scale_ratios = []
    angle_deltas = []
    for i, j in coarse_pairs:
        p, g = pred_walls[i], gt_walls[j]
        scale_ratios.append(_wall_length(g) / _wall_length(p))
        d = (_wall_angle_deg(g) - _wall_angle_deg(p)) % 180.0
        if d > 90.0:
            d -= 180.0
        angle_deltas.append(d)

    refined_scale = statistics.median(scale_ratios)
    refined_rotation = _circular_mean_deg_180(angle_deltas)  # small spread expected -- mean is fine, median-anchored below

    theta = math.radians(refined_rotation)
    c, s = math.cos(theta), math.sin(theta)
    tx_samples, ty_samples = [], []
    for i, j in coarse_pairs:
        pm = _wall_midpoint(pred_walls[i])
        gm = _wall_midpoint(gt_walls[j])
        rx = refined_scale * (c * pm[0] - s * pm[1])
        ry = refined_scale * (s * pm[0] + c * pm[1])
        tx_samples.append(gm[0] - rx)
        ty_samples.append(gm[1] - ry)
    refined = SimilarityTransform(
        scale=refined_scale,
        rotation_deg=refined_rotation,
        tx=statistics.median(tx_samples),
        ty=statistics.median(ty_samples),
    )

    scale_spread = (
        statistics.pstdev(scale_ratios) / refined_scale if len(scale_ratios) > 1 and refined_scale else 0.0
    )
    diagnostics = {
        "seed": {"scale": seed.scale, "rotation_deg": seed.rotation_deg, "tx": seed.tx, "ty": seed.ty},
        "n_coarse_matches": len(coarse_pairs),
        "refined": True,
        "refined_scale": refined_scale,
        "refined_rotation_deg": refined_rotation,
        "scale_ratio_relative_stdev": scale_spread,
        "scale_ratio_min": min(scale_ratios),
        "scale_ratio_max": max(scale_ratios),
    }
    return refined, diagnostics


def apply_transform_to_plan(plan: dict, transform: SimilarityTransform) -> dict:
    """Returns a deep copy of `plan` with every wall's start/end/thickness
    transformed -- the plan dict itself (source/units/diagnostics/etc.) is
    otherwise untouched, so the frozen `eval/metrics` code can score it as
    though it were an ordinary prediction."""
    out = copy.deepcopy(plan)
    for w in out.get("walls", []):
        w["start"] = list(transform.apply(tuple(w["start"])))
        w["end"] = list(transform.apply(tuple(w["end"])))
        w["thickness"] = w["thickness"] * transform.scale
    return out
