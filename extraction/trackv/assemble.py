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
# scales must not be conflated).
SNAP_TOLERANCE_NATIVE = 0.75


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


@dataclass
class OpenCycleDiagnostic:
    """One dangling wall endpoint -- a wall that terminates without meeting
    another wall, i.e. a point where a room cycle cannot close. Directly
    localizes recall gaps back to pair/select for a human to chase, per the
    approved scope's item 4."""

    wall_id: str
    dangling_point: Point2


@dataclass
class AssembleResult:
    walls: list[AssembledWall]
    junctions: list[JunctionNode]
    open_cycle_diagnostics: list[OpenCycleDiagnostic]
    n_cycle_basis_found: int
    n_connected_components: int
    n_degenerate_zero_length_walls: int = 0


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


def assemble(pair_result: PairResult, scale_to_gt_frame: float) -> AssembleResult:
    walls_in = pair_result.walls
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
        wall_id = f"W{wi}"
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
    )
