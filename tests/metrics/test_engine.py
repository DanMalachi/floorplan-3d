"""Metric engine correctness — this IS the Phase 0 exit bar (docs/
extraction-plan.md): GT-vs-GT must score perfect on every metric, and a
deliberately corrupted copy must score specific, correct penalties."""

import copy

from eval.metrics.engine import score_plan
from tests.schema.test_validate import valid_plan


def test_gt_vs_itself_is_perfect():
    gt = valid_plan()
    score = score_plan(gt, gt, "fixture")

    for tau, s in score.wall_by_tau.items():
        assert s.precision == 1.0, tau
        assert s.recall == 1.0, tau
        assert s.f1 == 1.0, tau
        assert s.mean_endpoint_error == 0.0, tau
        assert s.mean_thickness_error == 0.0, tau

    assert score.wall_mask_iou == 1.0
    assert score.opening_precision == 1.0
    assert score.opening_recall == 1.0
    assert score.opening_f1 == 1.0
    assert score.valid is True
    assert score.validity_errors == []
    assert score.room_count_error == 0
    assert score.room_label_accuracy == 1.0
    assert score.room_adjacency_edit_distance == 0


def test_missing_wall_penalizes_recall_not_precision():
    gt = valid_plan()
    pred = copy.deepcopy(gt)
    dropped = pred["walls"].pop()  # drop w4 (a rail wall)
    pred["rooms"][0]["wall_cycle"] = [w["id"] for w in pred["walls"]]  # keep room self-consistent
    score = score_plan(pred, gt, "fixture")

    s = score.wall_by_tau[0.01]
    assert s.recall < 1.0
    assert s.precision == 1.0  # everything predicted was correct, just incomplete
    assert score.wall_mask_iou < 1.0


def test_extra_hallucinated_wall_penalizes_precision_not_recall():
    gt = valid_plan()
    pred = copy.deepcopy(gt)
    pred["walls"].append({
        "id": "w_fake", "start": [9000.0, 9000.0], "end": [9500.0, 9000.0],
        "thickness": 100.0, "curvature": 0.0, "role": "internal",
        "openings": [], "confidence": 0.5, "evidence": ["detector"], "flags": [],
    })
    score = score_plan(pred, gt, "fixture")

    s = score.wall_by_tau[0.01]
    assert s.precision < 1.0
    assert s.recall == 1.0


def test_wrong_host_wall_opening_is_miss_and_false_positive():
    gt = valid_plan()
    pred = copy.deepcopy(gt)
    door = pred["walls"][0]["openings"].pop()
    door["center_offset"] = 1500.0  # keep it within w2's [0, 3000] span
    pred["walls"][1]["openings"].append(door)
    score = score_plan(pred, gt, "fixture")

    assert score.opening_precision < 1.0
    assert score.opening_recall < 1.0


def test_broken_cycle_fails_validity_with_specific_reason():
    gt = valid_plan()
    pred = copy.deepcopy(gt)
    pred["walls"][0]["end"] = [4500.0, 500.0]  # detach w1 from w2
    score = score_plan(pred, gt, "fixture")

    assert score.valid is False
    assert any("does not close" in e or "does not terminate" in e for e in score.validity_errors)
