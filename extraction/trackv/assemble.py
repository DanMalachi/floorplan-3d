"""Assembly into a schema-valid, wall-only ExtractionResult -- Track V
milestone 2 step 3a, item 4.

Scope, deliberately narrow (approved 3a scope, "wall-only output"):
endpoint-snap pair.py's recovered wall centerlines into a junction graph,
and emit `walls` + `junctions` with `rooms=[]`. Reading validate.py closely
before building this: every room/cycle-closure check
(`cycles_closed`, `zones_within_room`) iterates `plan.get("rooms", [])` --
an *empty* rooms list is schema-valid by construction, and "wall-only" is
exactly what this milestone approved. Room-cycle assembly (planar face
tracing into `rooms`) is real, separate, harder work correctly deferred
past this step, not a shortcut taken to dodge it.

Cycle-detection IS still run here, but only to produce the per-stage
diagnostic report's open-cycle localization (gate report item 3 / item 4:
"use the open cycle to localize the missing wall"), never to populate the
schema's `rooms`. It uses `networkx.cycle_basis` (fundamental cycle basis
from a spanning tree), not a true planar-embedding face tracer -- a known,
documented simplification. On this step's already-noisy pairing output
(more predicted walls than GT, see pair.py's own gate-report findings), a
rigorous face tracer would not produce meaningfully cleaner rooms than this
does; building one is better spent once pairing precision is worth it.

Opening candidates from pair.py's collinear-merge step are NOT serialized
into `Wall.openings` -- the schema's `OpeningClass` has no "unclassified"
value (`door`/`window`/`passage` only), and step 3a does not classify.
They are consumed internally by pair.py (to keep wall recall through a
gap) and reported diagnostically here, never emitted as schema Openings.

JUNCTION CLOSURE (Gap A fix, second 3a session): the endpoint-snap above
only ever merges wall endpoints that are *already* within
`SNAP_TOLERANCE_NATIVE` of each other -- it cannot close a real gap
between a wall's true endpoint and where it should meet a perpendicular
partner. `_resolve_junction_closure` runs first, in native units, before
that snap: for every wall-end still dangling after the cheap tolerance
pass, it looks for a cross-orientation (near-perpendicular) partner wall,
computes the exact intersection of their infinite centerlines (both wall
types are analytically axis-aligned within one global theta frame -- see
pair.py's `_bucket_wall` -- so this intersection is exact, never
approximate), and either SPLITS the partner (if the intersection falls
strictly inside its own drawn span -- a T-junction) or MOVES the dangling
end out to meet it (if the partner's span falls short too -- an L-corner),
subject to bounds documented on the constants below. This is a closure
operation on existing evidence, not a correction of any upstream bias:
diagnosed directly against 15x30/30x50 (reports/phase-2-gate.md) that the
axial/lateral split is close to zero-mean scatter, not a systematic
under-extension -- there is nothing to fix in pair.py.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import networkx as nx

from extraction.trackv.pair import PairResult, WallCandidate

Point2 = tuple[float, float]

# Junction/endpoint snap tolerance, in *native PDF-point* units, applied
# before scaling to the GT pixel frame. Track V geometry is analytically
# exact (unlike Track R's noisy raster candidates), so this stays tiny --
# not the opening-gap scale, which is architecture-sized off wall
# thickness (see pair.py's _collinear_merge docstring for why these two
# scales must not be conflated). This is the cheap, tight, endpoint-to-
# endpoint pass; `_resolve_junction_closure` (below) runs *before* this to
# close real gaps this tolerance is deliberately too tight to touch.
SNAP_TOLERANCE_NATIVE = 0.75

# --- Junction closure (extend-to-intersection) ---
#
# Two distinct, deliberately different-sized bounds, both scaled to the
# *specific wall's own* recovered thickness, not a single shared constant:
#
# AXIAL_EXTENSION_BOUND_FRAC (generous, ~1.5x thickness): how far a wall's
# own endpoint may be moved outward along its own axis to reach a
# candidate junction. Only ever applied to an end that is *already
# dangling* (degree 1 after the cheap snap) -- an end with no existing
# commitment, safe to relocate. Chosen generous because extending a wall's
# centerline by roughly its own thickness is architecturally ordinary (it
# is approximately the depth needed to butt into a perpendicular wall's
# face).
#
# STATIONARY_OVERHANG_FRAC (tight, 0.5x thickness): how far a candidate
# intersection point may fall *outside* a wall's own drawn span and still
# be treated as "close enough" to that wall's own true endpoint -- used
# only when that end is NOT dangling (already structurally settled
# elsewhere). Never moves that wall; the OTHER side of the pair, if
# flexible, targets this wall's true existing endpoint, not the
# theoretical intersection point. This is the required third gate: without
# it, two walls whose extended lines cross somewhere neither is actually
# drawn ("pointing at each other across empty space") would otherwise
# close into an invented corner once each wall's own extension happened to
# individually clear the (generous) axial bound. Kept deliberately smaller
# than the axial bound and NOT independently calibrated against this
# corpus -- an estimate honoring the spec's "small," open to revision.
AXIAL_EXTENSION_BOUND_FRAC = 1.5
STATIONARY_OVERHANG_FRAC = 0.5

# Cross-orientation eligibility: two walls are candidates for intersection
# only if their unit directions are close to perpendicular. Structurally
# inert under the current single-global-theta construction (every wall's
# line is *exactly* axis-aligned in the shared (d_a, n_a) frame -- see
# pair.py's `_bucket_wall` -- so any two cross-bucket walls are exactly
# perpendicular, dot == 0 to float precision, and any two same-bucket
# walls are exactly parallel, dot == +/-1). Kept as a live, named epsilon
# check rather than trusting `axis_bucket` directly so this doesn't
# silently break if that single-theta assumption is ever relaxed (Phase 7
# multi-axis hardening) -- same assumption the strict-xfail Manhattan-bias
# test in tests/test_select.py depends on; do not delete either as dead
# code because it currently never fires.
PERPENDICULARITY_DOT_EPS = 0.05

# Below this, a required extension/overshoot is treated as exactly zero
# (float-precision noise, not a real gap) and a computed interior split
# point is treated as landing exactly at a wall's own true endpoint
# instead of an internal breakpoint -- avoids manufacturing degenerate
# near-zero-length sub-wall slivers.
JUNCTION_EPS = 1e-3


@dataclass
class JunctionNode:
    id: str
    point: Point2
    wall_ids: list[str] = field(default_factory=list)
    junction_type: str = "end"


@dataclass
class AssembledWall:
    id: str
    start: Point2
    end: Point2
    thickness: float
    source_segment_indices: tuple[int, int]
    # Set only when this piece resulted from splitting an original
    # WallCandidate at a T- or X-junction (see `_resolve_junction_closure`);
    # None for walls that were never split. Kept so the funnel and any
    # future kill-log can attribute a split piece back to its origin wall
    # without re-deriving it from id-string parsing.
    parent_wall_id: str | None = None


@dataclass
class OpenCycleDiagnostic:
    """One dangling wall endpoint -- a wall that terminates without meeting
    another wall, i.e. a point where a room cycle cannot close. Directly
    localizes recall gaps back to pair/select for a human to chase, per the
    approved scope's item 4."""

    wall_id: str
    dangling_point: Point2


@dataclass
class RejectedJunctionCandidate:
    """A candidate junction between two walls that was considered and
    refused, with the bound it failed -- the kill-chain audit trail (paper
    5.4 / 6.5) that lets a human tell a correct refusal (a genuine free end,
    or two walls that don't actually meet) apart from a real miss, without
    re-running anything."""

    wall_a_id: str
    wall_b_id: str
    reason: str
    magnitude: float
    bound: float


@dataclass
class ClosureStats:
    n_candidates_considered: int = 0
    n_accepted_l: int = 0  # both sides moved (mutual extension, no split)
    n_accepted_t: int = 0  # exactly one side split
    n_accepted_x: int = 0  # both sides split (both interior) -- expected ~0
    n_noop_touch: int = 0  # both sides already coincide; nothing changed
    n_rejected: int = 0
    n_walls_split: int = 0  # count of ORIGINAL walls that ended up split
    rejected: list[RejectedJunctionCandidate] = field(default_factory=list)


@dataclass
class AssembleResult:
    walls: list[AssembledWall]
    junctions: list[JunctionNode]
    open_cycle_diagnostics: list[OpenCycleDiagnostic]
    n_cycle_basis_found: int
    n_connected_components: int
    n_degenerate_zero_length_walls: int = 0
    closure: ClosureStats = field(default_factory=ClosureStats)


def _dist(a: Point2, b: Point2) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _snap_endpoints(walls: list[WallCandidate], tolerance: float) -> list[tuple[Point2, Point2]]:
    """Union-find clustering of all wall endpoints within `tolerance`,
    replacing each endpoint with its cluster's centroid so that walls
    sharing a corner coincide exactly (well under the validator's own
    EPSILON), not just approximately."""
    points: list[Point2] = []
    for w in walls:
        points.append(w.start)
        points.append(w.end)
    n = len(points)
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)  # deterministic: lower root index wins

    for i in range(n):
        for j in range(i + 1, n):
            if _dist(points[i], points[j]) <= tolerance:
                union(i, j)

    clusters: dict[int, list[int]] = {}
    for i in range(n):
        clusters.setdefault(find(i), []).append(i)

    centroid_by_root: dict[int, Point2] = {}
    for root, idxs in clusters.items():
        cx = sum(points[i][0] for i in idxs) / len(idxs)
        cy = sum(points[i][1] for i in idxs) / len(idxs)
        centroid_by_root[root] = (cx, cy)

    snapped_points = [centroid_by_root[find(i)] for i in range(n)]
    return [(snapped_points[2 * k], snapped_points[2 * k + 1]) for k in range(len(walls))]


def _find_dangling_ends(walls: list[WallCandidate], tolerance: float) -> set[tuple[int, str]]:
    """Which (wall_index, "start"|"end") endpoints are still degree-1 after
    the cheap tolerance-only snap -- the candidate population for junction
    closure. Reuses `_snap_endpoints` rather than re-implementing the
    clustering, so this is guaranteed consistent with what the final
    assembly's own snap pass would find."""
    if not walls:
        return set()
    snapped = _snap_endpoints(walls, tolerance)
    degree: dict[Point2, int] = {}
    for start, end in snapped:
        if start == end:
            continue  # degenerate zero-length wall after snap; not real topology
        degree[start] = degree.get(start, 0) + 1
        degree[end] = degree.get(end, 0) + 1
    dangling: set[tuple[int, str]] = set()
    for wi, (start, end) in enumerate(snapped):
        if start == end:
            continue
        if degree.get(start, 0) == 1:
            dangling.add((wi, "start"))
        if degree.get(end, 0) == 1:
            dangling.add((wi, "end"))
    return dangling


def _unit_dir_len(w: WallCandidate) -> tuple[Point2, float]:
    dx, dy = w.end[0] - w.start[0], w.end[1] - w.start[1]
    length = math.hypot(dx, dy)
    if length == 0:
        return (0.0, 0.0), 0.0
    return (dx / length, dy / length), length


def _param(w: WallCandidate, point: Point2, unit_dir: Point2) -> float:
    """Position of `point` projected onto w's own axis, 0 at w.start."""
    return (point[0] - w.start[0]) * unit_dir[0] + (point[1] - w.start[1]) * unit_dir[1]


def _line_intersection(p0: Point2, p1: Point2, q0: Point2, q1: Point2) -> Point2 | None:
    """Exact intersection of the infinite lines through (p0,p1) and
    (q0,q1). None if parallel (should not occur for the perpendicularity-
    filtered pairs this is called on, guarded anyway)."""
    x1, y1 = p0
    x2, y2 = p1
    x3, y3 = q0
    x4, y4 = q1
    denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(denom) < 1e-9:
        return None
    px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denom
    py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denom
    return (px, py)


@dataclass
class _Side:
    op: str  # "SPLIT" | "MOVE" | "TOUCH"
    end: str | None  # "start"/"end" -- which end this concerns (None only for pure-interior SPLIT)


@dataclass
class _Candidate:
    a: int
    b: int
    point: Point2
    side_a: _Side
    side_b: _Side


def _evaluate_side(
    wi: int, w: WallCandidate, s: float, length: float, dangling: set[tuple[int, str]]
) -> tuple[_Side, tuple[str, float, float] | None]:
    """Classifies one wall's participation in a candidate junction at
    parameter `s` along its own axis. Returns (side, rejection) where
    rejection is None on success or (reason, magnitude, bound) on failure.

    SPLIT: s lands strictly inside the wall's own span -- always safe,
    never touches either of the wall's true endpoints.
    TOUCH: s lands at (within JUNCTION_EPS of) the wall's own true
    endpoint already -- a no-op, that endpoint doesn't move.
    MOVE: s lands beyond one true endpoint by `ext`, and that specific end
    is currently dangling (no existing commitment) -- safe to relocate,
    gated by the generous AXIAL_EXTENSION_BOUND_FRAC bound.
    A non-dangling end that falls short by more than JUNCTION_EPS is
    allowed a single further concession -- TOUCH at its true endpoint
    (never moved) if within the tight STATIONARY_OVERHANG_FRAC bound --
    before the whole candidate is rejected.
    """
    if JUNCTION_EPS <= s <= length - JUNCTION_EPS:
        return _Side(op="SPLIT", end=None), None

    end = "start" if s < length / 2 else "end"
    ext = max(0.0, -s, s - length)
    if ext <= JUNCTION_EPS:
        return _Side(op="TOUCH", end=end), None

    if (wi, end) in dangling:
        bound = AXIAL_EXTENSION_BOUND_FRAC * w.thickness
        if ext <= bound:
            return _Side(op="MOVE", end=end), None
        return None, ("axial_bound_exceeded", ext, bound)

    bound = STATIONARY_OVERHANG_FRAC * w.thickness
    if ext <= bound:
        return _Side(op="TOUCH", end=end), None
    return None, ("overhang_bound_exceeded", ext, bound)


def _true_endpoint(w: WallCandidate, end: str) -> Point2:
    return w.start if end == "start" else w.end


def _resolve_pair(
    ai: int, wa: WallCandidate, bi: int, wb: WallCandidate, dangling: set[tuple[int, str]]
) -> _Candidate | RejectedJunctionCandidate | None:
    ua, la = _unit_dir_len(wa)
    ub, lb = _unit_dir_len(wb)
    if la == 0 or lb == 0:
        return None
    if abs(ua[0] * ub[0] + ua[1] * ub[1]) > PERPENDICULARITY_DOT_EPS:
        return None  # parallel-ish; not this mechanism's concern

    x = _line_intersection(wa.start, wa.end, wb.start, wb.end)
    if x is None:
        return None

    sa = _param(wa, x, ua)
    sb = _param(wb, x, ub)

    wall_a_id, wall_b_id = f"W{ai}", f"W{bi}"
    side_a, rej_a = _evaluate_side(ai, wa, sa, la, dangling)
    if rej_a is not None:
        reason, mag, bound = rej_a
        return RejectedJunctionCandidate(wall_a_id, wall_b_id, f"{reason}_a", round(mag, 4), round(bound, 4))
    side_b, rej_b = _evaluate_side(bi, wb, sb, lb, dangling)
    if rej_b is not None:
        reason, mag, bound = rej_b
        return RejectedJunctionCandidate(wall_a_id, wall_b_id, f"{reason}_b", round(mag, 4), round(bound, 4))

    # reconcile to a single shared point: a fixed side (SPLIT/TOUCH) uses
    # its own true geometry as authoritative; a flexible side (MOVE)
    # targets whichever fixed point is available, or the raw intersection
    # if both sides are flexible.
    fixed_a = side_a.op != "MOVE"
    fixed_b = side_b.op != "MOVE"
    anchor_a = x if side_a.op == "SPLIT" else (_true_endpoint(wa, side_a.end) if fixed_a else None)
    anchor_b = x if side_b.op == "SPLIT" else (_true_endpoint(wb, side_b.end) if fixed_b else None)

    if fixed_a and fixed_b:
        # Both fixed: if either is TOUCH (an immovable existing endpoint),
        # that one is authoritative -- the SPLIT side's cut point should
        # land exactly there, not at the raw (slightly different)
        # intersection. If both are SPLIT (X-case), anchor_a == anchor_b
        # == x already (both interior to the same computed crossing), no
        # conflict.
        point = anchor_a if side_a.op == "TOUCH" else anchor_b
    elif fixed_a:
        point = anchor_a
    elif fixed_b:
        point = anchor_b
    else:
        point = x

    if side_a.op == "TOUCH" and side_b.op == "TOUCH":
        return None  # both sides already satisfied; nothing to do

    return _Candidate(a=ai, b=bi, point=point, side_a=side_a, side_b=side_b)


def _resolve_junction_closure(
    walls: list[WallCandidate],
    enable_splitting: bool = True,
) -> tuple[list[tuple[str, WallCandidate, str | None]], ClosureStats]:
    """Batch closure: enumerate every cross-orientation candidate touching
    at least one dangling end, gate them all, THEN apply -- never
    pairwise-in-sequence (A-extends-to-B followed by B-extends-to-A would
    double-count and can oscillate). Splits on a single original wall are
    batched: every accepted interior point on that wall is collected,
    sorted along its own axis, and it is cut once into N+1 pieces.

    `enable_splitting=False` refuses (logs, does not silently drop) any
    candidate where either side would SPLIT -- i.e. only mutual-extension
    L-corners are ever applied, and the wall COUNT never changes from the
    input population. Exists so an over-production diagnostic can compare
    against the exact pre-split candidate set (reports/phase-2-gate.md's
    Track V candidate-count-vs-GT finding) without reverting this module;
    it is a diagnostic switch, not a quality knob -- do not flip it to
    "fix" a bad wall count, that would suppress the measurement this
    milestone's own headline finding depends on."""
    stats = ClosureStats()
    if not walls:
        return [], stats

    dangling = _find_dangling_ends(walls, SNAP_TOLERANCE_NATIVE)
    dangling_walls = sorted({wi for wi, _end in dangling})

    accepted: list[_Candidate] = []
    seen_pairs: set[tuple[int, int]] = set()
    for ai in dangling_walls:
        for bi in range(len(walls)):
            if bi == ai:
                continue
            pair_key = (min(ai, bi), max(ai, bi))
            if pair_key in seen_pairs:
                continue
            seen_pairs.add(pair_key)
            stats.n_candidates_considered += 1
            outcome = _resolve_pair(ai, walls[ai], bi, walls[bi], dangling)
            if outcome is None:
                stats.n_noop_touch += 1
            elif isinstance(outcome, RejectedJunctionCandidate):
                stats.n_rejected += 1
                stats.rejected.append(outcome)
            elif not enable_splitting and (outcome.side_a.op == "SPLIT" or outcome.side_b.op == "SPLIT"):
                stats.n_rejected += 1
                stats.rejected.append(
                    RejectedJunctionCandidate(f"W{ai}", f"W{bi}", "splitting_disabled", 0.0, 0.0)
                )
            else:
                accepted.append(outcome)
                n_split_sides = (outcome.side_a.op == "SPLIT") + (outcome.side_b.op == "SPLIT")
                if n_split_sides == 2:
                    stats.n_accepted_x += 1
                elif n_split_sides == 1:
                    stats.n_accepted_t += 1
                else:
                    stats.n_accepted_l += 1

    # collect, per original wall index: interior split points, and accepted
    # move-targets per end (with deterministic tie-break on smallest
    # required extension, then partner wall id, if more than one candidate
    # claims the same end -- paper 6.5).
    split_points: dict[int, list[Point2]] = {}
    move_targets: dict[tuple[int, str], tuple[float, int, Point2]] = {}  # (ext, partner_idx) -> point

    def _register(wi: int, w: WallCandidate, side: _Side, point: Point2, partner: int, ext: float) -> None:
        if side.op == "SPLIT":
            split_points.setdefault(wi, []).append(point)
        elif side.op == "MOVE":
            key = (wi, side.end)
            candidate_rank = (ext, f"W{partner}")
            if key not in move_targets or candidate_rank < (move_targets[key][0], f"W{move_targets[key][1]}"):
                move_targets[key] = (ext, partner, point)

    for c in accepted:
        wa, wb = walls[c.a], walls[c.b]
        ua, la = _unit_dir_len(wa)
        ub, lb = _unit_dir_len(wb)
        ext_a = abs(_param(wa, c.point, ua) - (0.0 if c.side_a.end == "start" else la)) if c.side_a.op == "MOVE" else 0.0
        ext_b = abs(_param(wb, c.point, ub) - (0.0 if c.side_b.end == "start" else lb)) if c.side_b.op == "MOVE" else 0.0
        _register(c.a, wa, c.side_a, c.point, c.b, ext_a)
        _register(c.b, wb, c.side_b, c.point, c.a, ext_b)

    result: list[tuple[str, WallCandidate, str | None]] = []
    for wi, w in enumerate(walls):
        base_id = f"W{wi}"
        unit_dir, length = _unit_dir_len(w)
        eff_start = w.start
        eff_end = w.end
        if length > 0:
            if (wi, "start") in move_targets:
                eff_start = move_targets[(wi, "start")][2]
            if (wi, "end") in move_targets:
                eff_end = move_targets[(wi, "end")][2]

        pts = split_points.get(wi, [])
        if not pts:
            result.append(
                (
                    base_id,
                    WallCandidate(
                        eff_start,
                        eff_end,
                        w.thickness,
                        w.axis_bucket,
                        w.source_segment_indices,
                        w.member_source_indices,
                    ),
                    None,
                )
            )
            continue

        stats.n_walls_split += 1
        ordered = sorted(pts, key=lambda p: _param(w, p, unit_dir))
        chain = [eff_start] + ordered + [eff_end]
        for k in range(len(chain) - 1):
            piece_start, piece_end = chain[k], chain[k + 1]
            if _dist(piece_start, piece_end) <= JUNCTION_EPS:
                continue  # degenerate sliver from a split landing at/near an original endpoint
            result.append(
                (
                    f"{base_id}_{k}",
                    WallCandidate(
                        piece_start,
                        piece_end,
                        w.thickness,
                        w.axis_bucket,
                        w.source_segment_indices,
                        w.member_source_indices,
                    ),
                    base_id,
                )
            )

    return result, stats


def _junction_type(degree: int, incident_angles: list[float]) -> str:
    if degree == 1:
        return "end"
    if degree == 2:
        a, b = incident_angles
        d = abs(a - b) % 180.0
        d = min(d, 180.0 - d)
        return "I" if d <= 10.0 else "L"
    if degree == 3:
        return "T"
    return "X"


def assemble(pair_result: PairResult, scale_to_gt_frame: float, enable_splitting: bool = True) -> AssembleResult:
    closed, closure_stats = _resolve_junction_closure(pair_result.walls, enable_splitting=enable_splitting)
    ids = [cid for cid, _w, _p in closed]
    parents = [p for _cid, _w, p in closed]
    walls_in = [w for _cid, w, _p in closed]

    snapped_endpoints = _snap_endpoints(walls_in, SNAP_TOLERANCE_NATIVE)

    assembled_walls: list[AssembledWall] = []
    graph = nx.Graph()
    point_to_node: dict[Point2, str] = {}
    node_points: dict[str, Point2] = {}

    def node_id_for(p: Point2) -> str:
        if p not in point_to_node:
            nid = f"J{len(point_to_node)}"
            point_to_node[p] = nid
            node_points[nid] = p
            graph.add_node(nid)
        return point_to_node[p]

    for wi, (w, (start, end)) in enumerate(zip(walls_in, snapped_endpoints)):
        wall_id = ids[wi]
        # Junction points and wall endpoints must live in the *same* frame
        # -- scale before building the graph, not after, or junctions end
        # up in native units while walls end up in GT-frame units and no
        # wall ever appears to terminate at its own junction.
        start_scaled = (start[0] * scale_to_gt_frame, start[1] * scale_to_gt_frame)
        end_scaled = (end[0] * scale_to_gt_frame, end[1] * scale_to_gt_frame)
        thickness_scaled = w.thickness * scale_to_gt_frame
        assembled_walls.append(
            AssembledWall(
                id=wall_id,
                start=start_scaled,
                end=end_scaled,
                thickness=thickness_scaled,
                source_segment_indices=w.source_segment_indices,
                parent_wall_id=parents[wi],
            )
        )
        n0, n1 = node_id_for(start_scaled), node_id_for(end_scaled)
        if n0 != n1:  # a zero-length wall after snapping would self-loop; not a real wall, skip the edge
            graph.add_edge(n0, n1, wall_id=wall_id)

    junctions: list[JunctionNode] = []
    open_cycle_diagnostics: list[OpenCycleDiagnostic] = []
    n_degenerate_zero_length_walls = 0
    for nid in sorted(graph.nodes):
        neighbors = list(graph.neighbors(nid))
        degree = len(neighbors)
        if degree == 0:
            # both endpoints of some wall snapped to the same point -- a
            # zero-length wall post-snap, not real topology; excluded from
            # junctions (schema requires walls: min_length=1 per junction)
            n_degenerate_zero_length_walls += 1
            continue
        wall_ids = [graph.edges[nid, nb]["wall_id"] for nb in neighbors]
        angles = []
        p0 = node_points[nid]
        for nb in neighbors:
            p1 = node_points[nb]
            angles.append(math.degrees(math.atan2(p1[1] - p0[1], p1[0] - p0[0])) % 180.0)
        jtype = _junction_type(degree, angles)
        junctions.append(JunctionNode(id=f"J_{nid}", point=p0, wall_ids=sorted(wall_ids), junction_type=jtype))
        if degree == 1:
            open_cycle_diagnostics.append(OpenCycleDiagnostic(wall_id=wall_ids[0], dangling_point=p0))

    try:
        cycle_basis = nx.cycle_basis(graph)
    except Exception:
        cycle_basis = []

    return AssembleResult(
        walls=assembled_walls,
        junctions=junctions,
        open_cycle_diagnostics=sorted(open_cycle_diagnostics, key=lambda d: d.wall_id),
        n_cycle_basis_found=len(cycle_basis),
        n_connected_components=nx.number_connected_components(graph) if graph.number_of_nodes() else 0,
        n_degenerate_zero_length_walls=n_degenerate_zero_length_walls,
        closure=closure_stats,
    )
