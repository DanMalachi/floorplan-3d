"""Unit tests for extraction/trackv/score_align.py's scoring-only similarity
fit. Synthetic fixtures with a *known* ground-truth transform, so recovery
can be checked exactly rather than just "did it run"."""

from __future__ import annotations

import math

from extraction.trackv.score_align import SimilarityTransform, apply_transform_to_plan, fit_similarity_transform


def _wall(wid, start, end, thickness=10.0):
    return {"id": wid, "start": list(start), "end": list(end), "thickness": thickness}


def _make_gt_walls():
    # a simple rectangle-ish set of walls, varied lengths so "longest" is unambiguous
    return [
        _wall("g0", (0, 0), (1000, 0), 15.0),
        _wall("g1", (1000, 0), (1000, 400), 15.0),
        _wall("g2", (1000, 400), (0, 400), 15.0),
        _wall("g3", (0, 400), (0, 0), 15.0),
        _wall("g4", (400, 0), (400, 400), 15.0),
    ]


def _apply_known_transform(walls, scale, rotation_deg, tx, ty):
    known = SimilarityTransform(scale=scale, rotation_deg=rotation_deg, tx=tx, ty=ty)
    inv_scale = 1.0 / scale
    theta = math.radians(-rotation_deg)
    c, s = math.cos(theta), math.sin(theta)

    def inverse(p):
        x, y = (p[0] - tx) * inv_scale, (p[1] - ty) * inv_scale
        # undo forward rotation: forward was R(theta_fwd) then scale; here we
        # already divided by scale, now undo rotation by -rotation_deg
        rx = c * x - s * y
        ry = s * x + c * y
        return (rx, ry)

    out = []
    for w in walls:
        out.append(_wall(w["id"] + "_pred", inverse(tuple(w["start"])), inverse(tuple(w["end"])), w["thickness"] * inv_scale))
    return out, known


def test_recovers_pure_scale():
    gt = _make_gt_walls()
    pred, known = _apply_known_transform(gt, scale=2.0, rotation_deg=0.0, tx=0.0, ty=0.0)
    transform, diag = fit_similarity_transform(pred, gt)
    assert abs(transform.scale - known.scale) / known.scale < 0.05
    assert diag["refined"] is True


def test_recovers_scale_rotation_and_translation():
    gt = _make_gt_walls()
    pred, known = _apply_known_transform(gt, scale=0.37, rotation_deg=12.0, tx=500.0, ty=-300.0)
    transform, diag = fit_similarity_transform(pred, gt)

    assert abs(transform.scale - known.scale) / known.scale < 0.05
    assert abs(transform.rotation_deg - known.rotation_deg) < 2.0

    # apply and check every wall lands back near its GT counterpart
    plan = {"walls": pred}
    aligned = apply_transform_to_plan(plan, transform)
    for w, g in zip(aligned["walls"], gt):
        d0 = math.hypot(w["start"][0] - g["start"][0], w["start"][1] - g["start"][1])
        d1 = math.hypot(w["end"][0] - g["end"][0], w["end"][1] - g["end"][1])
        assert d0 < 20.0 and d1 < 20.0


def test_too_few_coarse_matches_skips_refine():
    gt = _make_gt_walls()
    # a single, wildly-offset pred wall -- coarse matching should find < 2
    pred = [_wall("p0", (100000, 100000), (100050, 100000), 5.0)]
    transform, diag = fit_similarity_transform(pred, gt)
    assert diag["refined"] is False
    assert diag["n_coarse_matches"] < 2


def test_small_negative_rotation_delta_does_not_wrap_to_near_180():
    # regression test: a small negative rotation must not be silently
    # reported as ~180 deg by Python's %-always-positive-sign behavior
    gt = _make_gt_walls()
    pred, known = _apply_known_transform(gt, scale=1.0, rotation_deg=-3.0, tx=0.0, ty=0.0)
    transform, _diag = fit_similarity_transform(pred, gt)
    assert abs(transform.rotation_deg - (-3.0)) < 2.0, (
        f"expected rotation near -3 deg, got {transform.rotation_deg} (likely wrapped to ~177/183)"
    )


def test_scale_ratio_consistency_is_reported():
    gt = _make_gt_walls()
    pred, _ = _apply_known_transform(gt, scale=1.5, rotation_deg=0.0, tx=0.0, ty=0.0)
    _, diag = fit_similarity_transform(pred, gt)
    assert "scale_ratio_relative_stdev" in diag
    assert diag["scale_ratio_relative_stdev"] < 0.01  # exact synthetic transform -- near-zero spread
