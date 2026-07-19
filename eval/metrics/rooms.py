"""Room metrics (docs/paper.md Section 1.3): count error, label accuracy on
matched rooms, adjacency-graph edit distance.

Room matching is by wall_cycle overlap (Jaccard over member wall IDs) rather
than full graph isomorphism — cheap, deterministic, and sufficient once
walls are already matched upstream by the solver/topology layer. Adjacency
edit distance is the symmetric difference between the two adjacency-edge
sets once rooms are matched, not full graph-edit-distance search (NP-hard
and overkill at plan scale — a few dozen rooms, not thousands).
"""

from __future__ import annotations

from dataclasses import dataclass


def _jaccard(a: set, b: set) -> float:
    if not a and not b:
        return 1.0
    return len(a & b) / len(a | b) if (a | b) else 0.0


@dataclass
class RoomMatch:
    pairs: list[tuple[int, int]]  # (pred_index, gt_index)
    pred_rooms: list[dict]
    gt_rooms: list[dict]


def match_rooms(pred_rooms: list[dict], gt_rooms: list[dict], min_overlap: float = 0.5) -> RoomMatch:
    pairs: list[tuple[int, int]] = []
    used_gt: set[int] = set()
    scored = []
    for i, p in enumerate(pred_rooms):
        for j, g in enumerate(gt_rooms):
            score = _jaccard(set(p["wall_cycle"]), set(g["wall_cycle"]))
            if score >= min_overlap:
                scored.append((score, i, j))
    for score, i, j in sorted(scored, reverse=True):
        if j in used_gt or any(i == pi for pi, _ in pairs):
            continue
        pairs.append((i, j))
        used_gt.add(j)
    return RoomMatch(pairs, pred_rooms, gt_rooms)


def room_count_error(pred_rooms: list[dict], gt_rooms: list[dict]) -> int:
    return len(pred_rooms) - len(gt_rooms)


def room_label_accuracy(match: RoomMatch) -> float:
    if not match.pairs:
        return 1.0 if not match.gt_rooms else 0.0
    correct = sum(
        1 for i, j in match.pairs if match.pred_rooms[i].get("label") == match.gt_rooms[j].get("label")
    )
    return correct / len(match.pairs)


def _adjacency_edges(rooms: list[dict]) -> set[frozenset[str]]:
    """Two rooms are adjacent iff their wall_cycles share a wall id
    (a shared partition or opening host)."""
    edges = set()
    for i, a in enumerate(rooms):
        for b in rooms[i + 1 :]:
            if set(a["wall_cycle"]) & set(b["wall_cycle"]):
                edges.add(frozenset((a["id"], b["id"])))
    return edges


def adjacency_graph_edit_distance(match: RoomMatch) -> int:
    """Symmetric difference between predicted and GT adjacency edges, after
    remapping predicted room ids to their matched GT room id (unmatched
    predicted rooms keep their own id, so their edges always count against
    the edit distance)."""
    id_map = {match.pred_rooms[i]["id"]: match.gt_rooms[j]["id"] for i, j in match.pairs}
    pred_edges = set()
    for edge in _adjacency_edges(match.pred_rooms):
        a, b = tuple(edge)
        pred_edges.add(frozenset((id_map.get(a, a), id_map.get(b, b))))
    gt_edges = _adjacency_edges(match.gt_rooms)
    return len(pred_edges ^ gt_edges)
