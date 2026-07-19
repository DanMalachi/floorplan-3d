"""Top-level per-plan and per-corpus scoring, composing matching.py,
raster.py, openings.py, rooms.py, topology.py, bookkeeping.py, strata.py
per docs/paper.md Section 1.3."""

from __future__ import annotations

from dataclasses import dataclass
from statistics import mean

from eval.metrics.matching import match_walls, plan_diagonal
from eval.metrics.openings import match_openings
from eval.metrics.raster import wall_mask_iou
from eval.metrics.rooms import (
    RoomMatch,
    adjacency_graph_edit_distance,
    match_rooms,
    room_count_error,
    room_label_accuracy,
)
from eval.metrics.topology import validity

TAUS = (0.005, 0.01, 0.02)  # fractions of plan diagonal, per Section 1.3


@dataclass
class WallTauScore:
    tau: float
    precision: float
    recall: float
    f1: float
    mean_endpoint_error: float | None
    mean_thickness_error: float | None


@dataclass
class PlanScore:
    plan_id: str
    wall_by_tau: dict[float, WallTauScore]
    wall_mask_iou: float
    opening_precision: float
    opening_recall: float
    opening_f1: float
    valid: bool
    validity_errors: list[str]
    room_count_error: int
    room_label_accuracy: float
    room_adjacency_edit_distance: int
    human_edit_count: int | None = None


def score_plan(pred: dict, gt: dict, plan_id: str = "") -> PlanScore:
    pred_walls, gt_walls = pred.get("walls", []), gt.get("walls", [])
    diagonal = plan_diagonal(gt_walls or pred_walls)

    wall_by_tau: dict[float, WallTauScore] = {}
    primary_match = None
    for tau in TAUS:
        m = match_walls(pred_walls, gt_walls, tau, diagonal)
        endpoint_errs = m.endpoint_errors()
        thickness_errs = m.thickness_errors()
        wall_by_tau[tau] = WallTauScore(
            tau=tau,
            precision=m.precision,
            recall=m.recall,
            f1=m.f1,
            mean_endpoint_error=mean(endpoint_errs) if endpoint_errs else None,
            mean_thickness_error=mean(thickness_errs) if thickness_errs else None,
        )
        if tau == 0.01:
            primary_match = m

    iou = wall_mask_iou(pred_walls, gt_walls)

    wall_match_by_id = {
        pred_walls[i]["id"]: gt_walls[j]["id"] for i, j in (primary_match.pairs if primary_match else [])
    }
    opening_match = match_openings(pred_walls, gt_walls, wall_match_by_id, tau_frac=0.01, diagonal=diagonal)

    val = validity(pred)

    pred_rooms, gt_rooms = pred.get("rooms", []), gt.get("rooms", [])
    room_match = match_rooms(pred_rooms, gt_rooms)

    return PlanScore(
        plan_id=plan_id,
        wall_by_tau=wall_by_tau,
        wall_mask_iou=iou,
        opening_precision=opening_match.precision,
        opening_recall=opening_match.recall,
        opening_f1=opening_match.f1,
        valid=val.valid,
        validity_errors=val.errors,
        room_count_error=room_count_error(pred_rooms, gt_rooms),
        room_label_accuracy=room_label_accuracy(room_match),
        room_adjacency_edit_distance=adjacency_graph_edit_distance(room_match),
    )


@dataclass
class CorpusReport:
    per_plan: dict[str, PlanScore]
    by_stratum: dict[tuple[str, str, str], list[str]]  # stratum -> plan_ids

    def stratum_summary(self, stratum: tuple[str, str, str], tau: float = 0.01) -> dict:
        plan_ids = self.by_stratum.get(stratum, [])
        scores = [self.per_plan[pid] for pid in plan_ids]
        if not scores:
            return {}
        return {
            "n_plans": len(scores),
            "wall_f1": mean(s.wall_by_tau[tau].f1 for s in scores),
            "wall_precision": mean(s.wall_by_tau[tau].precision for s in scores),
            "wall_recall": mean(s.wall_by_tau[tau].recall for s in scores),
            "wall_mask_iou": mean(s.wall_mask_iou for s in scores),
            "opening_f1": mean(s.opening_f1 for s in scores),
            "validity_rate": mean(1.0 if s.valid else 0.0 for s in scores),
        }


def score_corpus(preds: dict[str, dict], gts: dict[str, dict]) -> CorpusReport:
    per_plan = {pid: score_plan(preds[pid], gts[pid], pid) for pid in gts if pid in preds}

    by_stratum: dict[tuple[str, str, str], list[str]] = {}
    for pid in per_plan:
        key = tuple(gts[pid]["source"][k] for k in ("encoding_class", "convention_class", "scope_class"))
        by_stratum.setdefault(key, []).append(pid)

    return CorpusReport(per_plan=per_plan, by_stratum=by_stratum)
