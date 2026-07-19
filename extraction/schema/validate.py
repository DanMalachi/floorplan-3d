"""Independent validator for extraction_v1 plans (docs/paper.md Appendix A/C).

Deliberately separate from the pydantic models in models.py: models.py
enforces per-field shape (types, ranges) at parse time; this module
re-derives the topological/semantic rules from the raw dict, so a bug in
one isn't hidden by the other. Mirrors Appendix C's validity() pseudocode:
cycles_closed, openings_in_span, junctions_consistent, no_self_intersections,
thickness_positive, ids_resolve — plus the tier-1 contract check.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

EPSILON = 1e-3  # plan-frame units; junction/cycle endpoint snap tolerance


@dataclass
class ValidationResult:
    errors: list[str] = field(default_factory=list)

    @property
    def valid(self) -> bool:
        return not self.errors

    def add(self, msg: str) -> None:
        self.errors.append(msg)


def _dist(a: list[float], b: list[float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _wall_length(wall: dict) -> float:
    return _dist(wall["start"], wall["end"])


def thickness_positive(plan: dict, result: ValidationResult) -> None:
    for w in plan.get("walls", []):
        if w["thickness"] <= 0:
            result.add(f"wall {w['id']}: thickness {w['thickness']} is not > 0")


def ids_resolve(plan: dict, result: ValidationResult) -> None:
    wall_ids = {w["id"] for w in plan.get("walls", [])}
    for j in plan.get("junctions", []):
        for wid in j["walls"]:
            if wid not in wall_ids:
                result.add(f"junction {j['id']}: references unknown wall {wid}")
    for r in plan.get("rooms", []):
        for wid in r["wall_cycle"]:
            if wid not in wall_ids:
                result.add(f"room {r['id']}: wall_cycle references unknown wall {wid}")


def junctions_consistent(plan: dict, result: ValidationResult) -> None:
    walls_by_id = {w["id"]: w for w in plan.get("walls", [])}
    for j in plan.get("junctions", []):
        for wid in j["walls"]:
            w = walls_by_id.get(wid)
            if w is None:
                continue  # already reported by ids_resolve
            if _dist(j["point"], w["start"]) > EPSILON and _dist(j["point"], w["end"]) > EPSILON:
                result.add(
                    f"junction {j['id']}: wall {wid} does not terminate at junction point within {EPSILON}"
                )


def openings_in_span(plan: dict, result: ValidationResult) -> None:
    for w in plan.get("walls", []):
        length = _wall_length(w)
        spans: list[tuple[float, float, str]] = []
        for o in w.get("openings", []):
            lo = o["center_offset"] - o["width"] / 2
            hi = o["center_offset"] + o["width"] / 2
            if not (0 < lo and hi < length):
                result.add(
                    f"wall {w['id']} opening {o['id']}: span [{lo}, {hi}] not strictly within "
                    f"wall span [0, {length}]"
                )
            spans.append((lo, hi, o["id"]))
        spans.sort(key=lambda s: s[0])
        for (lo_a, hi_a, id_a), (lo_b, hi_b, id_b) in zip(spans, spans[1:]):
            if hi_a > lo_b:
                result.add(f"wall {w['id']}: openings {id_a} and {id_b} overlap")


def cycles_closed(plan: dict, result: ValidationResult) -> None:
    walls_by_id = {w["id"]: w for w in plan.get("walls", [])}
    for r in plan.get("rooms", []):
        cycle = r["wall_cycle"]
        walls = [walls_by_id.get(wid) for wid in cycle]
        if any(w is None for w in walls):
            continue  # already reported by ids_resolve
        n = len(walls)
        broken = False
        for i in range(n):
            a, b = walls[i], walls[(i + 1) % n]
            a_ends = (a["start"], a["end"])
            b_ends = (b["start"], b["end"])
            if not any(_dist(p, q) <= EPSILON for p in a_ends for q in b_ends):
                broken = True
                result.add(
                    f"room {r['id']}: walls {cycle[i]} and {cycle[(i + 1) % n]} do not "
                    f"share an endpoint within {EPSILON} — cycle does not close"
                )
        if broken:
            continue


def _room_polygon(walls: list[dict]) -> list[list[float]] | None:
    """Walk a room's wall_cycle into an ordered polygon of the shared
    junction points between consecutive walls (centerline-based, matching
    how the rest of this module treats walls). Returns None if the cycle
    doesn't actually close — cycles_closed() reports that case on its own,
    so callers should skip zone checks rather than double-report it."""
    n = len(walls)
    if n < 3:
        return None
    poly = []
    for i in range(n):
        a, b = walls[i], walls[(i + 1) % n]
        a_ends = (a["start"], a["end"])
        b_ends = (b["start"], b["end"])
        best_pt, best_d = None, math.inf
        for p in a_ends:
            for q in b_ends:
                d = _dist(p, q)
                if d < best_d:
                    best_d, best_pt = d, p
        if best_d > EPSILON:
            return None
        poly.append(best_pt)
    return poly


def _point_in_polygon(pt: list[float], polygon: list[list[float]]) -> bool:
    """Standard ray-casting point-in-polygon test."""
    x, y = pt
    inside = False
    n = len(polygon)
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if (yi > y) != (yj > y):
            x_intersect = (xj - xi) * (y - yi) / (yj - yi) + xi
            if x < x_intersect:
                inside = not inside
        j = i
    return inside


def zones_within_room(plan: dict, result: ValidationResult) -> None:
    walls_by_id = {w["id"]: w for w in plan.get("walls", [])}
    for r in plan.get("rooms", []):
        zones = r.get("zones") or []
        if not zones:
            continue
        cycle = r["wall_cycle"]
        walls = [walls_by_id.get(wid) for wid in cycle]
        if any(w is None for w in walls):
            continue  # already reported by ids_resolve
        polygon = _room_polygon(walls)
        if polygon is None:
            continue  # already reported by cycles_closed
        for z in zones:
            for pt in z["polygon"]:
                if not _point_in_polygon(pt, polygon):
                    result.add(
                        f"room {r['id']} zone {z['label']}: point {pt} lies outside the room's wall_cycle face"
                    )
                    break


def no_self_intersections(plan: dict, result: ValidationResult) -> None:
    for w in plan.get("walls", []):
        curvature = w.get("curvature", 0.0)
        if curvature == 0.0:
            continue  # a straight segment cannot self-intersect
        chord = _wall_length(w)
        if chord == 0:
            result.add(f"wall {w['id']}: zero-length curved wall")
            continue
        radius = abs(1.0 / curvature)
        # chord = 2 * r * sin(theta / 2); self-intersecting iff the implied
        # sweep would need to exceed a full turn, i.e. chord/(2r) > 1.
        ratio = chord / (2 * radius)
        if ratio > 1:
            result.add(f"wall {w['id']}: curvature {curvature} inconsistent with chord length {chord}")


def validity(plan: dict) -> ValidationResult:
    result = ValidationResult()
    ids_resolve(plan, result)
    thickness_positive(plan, result)
    openings_in_span(plan, result)
    junctions_consistent(plan, result)
    cycles_closed(plan, result)
    zones_within_room(plan, result)
    no_self_intersections(plan, result)
    return result


def tier1_contract(plan: dict, operating_points: dict[str, float] | None = None) -> ValidationResult:
    """Tier 1 requires empty diagnostics.unresolved and every element's
    confidence above its class's calibrated operating point. Operating
    points are a Phase 6 deliverable (isotonic calibration); until then,
    callers pass explicit thresholds or accept the permissive default (0.0,
    i.e. this check degrades to 'unresolved must be empty')."""
    ops = operating_points or {}
    result = ValidationResult()
    diag = plan.get("diagnostics", {})
    if diag.get("tier") != 1:
        return result
    if diag.get("unresolved"):
        result.add("tier 1 requires an empty diagnostics.unresolved list")
    for w in plan.get("walls", []):
        threshold = ops.get("wall", 0.0)
        if w["confidence"] < threshold:
            result.add(f"wall {w['id']}: confidence {w['confidence']} below tier-1 operating point {threshold}")
        for o in w.get("openings", []):
            threshold = ops.get("opening", 0.0)
            if o["confidence"] < threshold:
                result.add(
                    f"opening {o['id']}: confidence {o['confidence']} below tier-1 operating point {threshold}"
                )
    for r in plan.get("rooms", []):
        threshold = ops.get("room", 0.0)
        if r["confidence"] < threshold:
            result.add(f"room {r['id']}: confidence {r['confidence']} below tier-1 operating point {threshold}")
    return result
