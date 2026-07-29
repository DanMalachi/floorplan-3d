"""Doorway-notch discriminator and pocket-polygon geometry, shared by the
core converter (`rooms.py::assemble_rooms`) and QA diagnostics
(`qa/measure_clean_at_source.py`, `qa/diagnose_notch_area_fraction.py`).

ResPlan traces a required room's boundary through the door/window/
front_door threshold rather than flush with the wall face, producing a
small rectangular pocket (jamb-crossbar-jamb, occasionally a multi-edge
zigzag) that no wall backs at all. The discriminator below (conjunction of
opening-footprint coverage, perpendicularity to the nearest wall-backed
ring neighbor, and edge length relative to wall thickness) identifies the
individual ring edges that make up such a pocket; the clustering +
pocket-construction helpers turn a set of matched edge indices into the
actual polygon vertices of the notch.

Moved here 2026-07-29 from `qa/measure_clean_at_source.py` (the discriminator
constants + `_opening_coverage`/`_nearest_wall_backed_cos`, validated
2026-07-21/22) and `qa/diagnose_notch_area_fraction.py` (the pocket-matching
+ clustering helpers, validated 2026-07-26) so `rooms.py` — core converter
code, which must never import from `qa/` — can reuse the exact same,
already-validated logic for lever #1 (see docs/session-notes/p3a-handoff.md)
instead of re-deriving it. Both QA modules re-import these names from here
so their existing importers are unaffected.
"""
from __future__ import annotations

from typing import Optional

from shapely.geometry import LineString

from extraction.synth.vendor.resplan_utils import get_geometries

# Doorway-notch suppression discriminator (validated 2026-07-21/22
# diagnostic sessions — see docs/session-notes/p3a-handoff.md's "Doorway-notch
# discriminator" section for the population-scale justification of each
# value).
OPENING_COVERAGE_THRESHOLD = 0.65
PERPENDICULARITY_COS_THRESHOLD = 0.15
NOTCH_LENGTH_MULTIPLE = 1.2

# A same-opening match does NOT by itself guarantee two notch-flagged edges
# belong to the same physical pocket -- population-scale running surfaced
# plan 64 (bedroom_1, 16-edge ring): edges 0/2 and 8/10 (two real,
# physically UNRELATED notches on opposite sides of the room) both
# best-matched the same door polygon, and grouping by key alone merged them
# into one "pocket" spanning half the ring (fraction=100.51%, an impossible
# number caught precisely because Rule 1 treats every newly-derived figure
# as provisional until corroborated). A real pocket (jamb-crossbar-jamb, or
# the validated 12017 zigzag's up to ~4 short edges) never spans more than a
# handful of ring edges -- this cap is deliberately generous relative to
# that (validated zigzag gap is 2) while excluding plan 64's gap of 6
# (exactly half its 16-edge ring).
MAX_NOTCH_SPAN_EDGES = 4

# Shared with rooms.py::assemble_rooms's own TOLERANCE-shaped edge-band
# constant; kept as a plain default here (not imported from rooms.py, to
# avoid a core<->core circular import) since qa/ callers already relied on
# this exact value.
_OPENING_BAND_TOLERANCE = 2.0


def _opening_coverage(a, b, edge_len, dx, dy, p, wall_depth) -> float:
    """How much of THIS edge's own [0,1] parametric span is spanned by a
    door/window/front_door footprint, independent of wall-ink geometry.
    Same projection technique as _edge_covered (qa/measure_clean_at_source.py),
    applied to opening polygons instead -- validated in
    classify_room_boundary_no_wall_match.py's analyze_edge and
    diagnose_doorway_notch.py (2026-07-21/22 diagnostic sessions, both
    unchanged by this move)."""
    edge_band = LineString([a, b]).buffer(_OPENING_BAND_TOLERANCE + wall_depth / 2)
    best = 0.0
    for ot in ("door", "window", "front_door"):
        g = p.get(ot)
        if g is None:
            continue
        for part in get_geometries(g):
            inter = part.intersection(edge_band)
            if inter.is_empty or inter.geom_type != "Polygon":
                continue
            pts = list(inter.exterior.coords)
            ts = [((px - a[0]) * dx + (py - a[1]) * dy) / (edge_len * edge_len) for px, py in pts]
            t0, t1 = max(min(ts), 0.0), min(max(ts), 1.0)
            if t1 > t0:
                best = max(best, t1 - t0)
    return best


def _opening_coverage_and_match(a, b, edge_len, dx, dy, opening_polys, wall_depth):
    """Same projection technique as _opening_coverage, but also returns
    WHICH opening (by stable (type, index) key, not Python object identity
    -- shapely's MultiPolygon.geoms is not guaranteed to hand back the same
    object across repeated accesses) produced the best coverage, so
    notch-flagged edges sharing a door/window/front_door instance can be
    grouped into one pocket."""
    edge_band = LineString([a, b]).buffer(_OPENING_BAND_TOLERANCE + wall_depth / 2)
    best = 0.0
    best_key = None
    for key, part in opening_polys:
        inter = part.intersection(edge_band)
        if inter.is_empty or inter.geom_type != "Polygon":
            continue
        pts = list(inter.exterior.coords)
        ts = [((px - a[0]) * dx + (py - a[1]) * dy) / (edge_len * edge_len) for px, py in pts]
        t0, t1 = max(min(ts), 0.0), min(max(ts), 1.0)
        if t1 > t0 and (t1 - t0) > best:
            best = t1 - t0
            best_key = key
    return best, best_key


def _nearest_wall_backed_cos(edge_index, ring_edges, backed_ratio, ux, uy, coverage_threshold=0.5):
    """Perpendicularity signal for the notch discriminator: cos(angle)
    between this edge's own unit direction (ux, uy) and the nearest ring
    neighbor (searching outward from edge_index in both directions) that IS
    wall-backed (backed_ratio >= coverage_threshold). Returns None if no
    wall-backed edge exists anywhere in the ring (degenerate room).
    Perpendicularity is checked against the nearest REAL wall, not just the
    immediately-adjacent ring edge, so a chain of several broken edges (e.g.
    a multi-step notch) doesn't block each other's lookup.

    coverage_threshold defaults to 0.5 (matches both
    qa/measure_clean_at_source.py's COVERAGE_THRESHOLD and
    rooms.py::assemble_rooms's own default) -- exposed as a parameter, not a
    module constant, so callers with a locally-scoped threshold (e.g.
    assemble_rooms's own configurable coverage_threshold kwarg) can pass it
    through explicitly instead of relying on a shared global."""
    n = len(ring_edges)
    for offset in range(1, n):
        for sign in (-1, 1):
            cand = (edge_index + sign * offset) % n
            if backed_ratio[cand] is not None and backed_ratio[cand] >= coverage_threshold:
                wa, wb, wlen = ring_edges[cand]
                if wlen:
                    wdx, wdy = wb[0] - wa[0], wb[1] - wa[1]
                    return abs(ux * (wdx / wlen) + uy * (wdy / wlen))
                return None
    return None


def _signed_area(pts: list[tuple[float, float]]) -> float:
    """Shoelace signed area of the closed loop pts[0]->pts[1]->...->pts[-1]
    ->pts[0] (pts given WITHOUT a repeated closing point -- closure is
    implicit via the modulo index). Sign follows the winding direction of
    pts itself, so comparing signs between two calls is only meaningful when
    both loops are traversed in a consistent (ring-inherited) order, which
    is how every caller here invokes it."""
    n = len(pts)
    s = 0.0
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        s += x1 * y2 - x2 * y1
    return s / 2.0


def _cluster_ring_indices(indices: list[int], n: int, max_gap: int = MAX_NOTCH_SPAN_EDGES) -> list[list[int]]:
    """Splits a same-opening-key index set into circularly-local clusters,
    breaking wherever the circular gap between consecutive (sorted) indices
    exceeds max_gap. Each returned cluster is safe to hand to _circular_span
    on its own (guaranteed locally close, not just "closer than the single
    largest gap in the whole set")."""
    s = sorted(set(indices))
    if len(s) <= 1:
        return [s]
    gaps = [((s[(k + 1) % len(s)] - s[k]) % n, k) for k in range(len(s))]
    break_ks = {k for gap, k in gaps if gap > max_gap}
    if not break_ks:
        return [s]
    clusters: list[list[int]] = []
    cur = [s[0]]
    for k in range(len(s) - 1):
        if k in break_ks:
            clusters.append(cur)
            cur = []
        cur.append(s[k + 1])
    clusters.append(cur)
    # The break between the LAST and FIRST element (circular wraparound) was
    # already accounted for via break_ks over k in range(len(s)) above only
    # for k < len(s)-1; if index len(s)-1 (the wrap gap) also broke, the
    # first and last clusters are actually separate (already true by
    # construction since we never merge across it) -- otherwise merge the
    # wraparound pair back into one cluster.
    if len(clusters) > 1 and (len(s) - 1) not in break_ks:
        clusters[0] = clusters[-1] + clusters[0]
        clusters.pop()
    return clusters


def _circular_span(indices: list[int], n: int) -> tuple[int, int]:
    """The smallest contiguous circular arc [start, end] (ring-edge indices,
    inclusive) covering every index in `indices`. Picks the largest circular
    gap between consecutive (sorted) indices as the arc's break point.
    Callers must pre-cluster via _cluster_ring_indices first if `indices`
    might span multiple unrelated pockets sharing one opening key -- this
    function alone cannot tell "one notch with a wide interstitial gap"
    apart from "two unrelated notches," it just closes whatever indices it's
    given."""
    s = sorted(set(indices))
    if len(s) == 1:
        return s[0], s[0]
    gaps = []
    for k in range(len(s)):
        cur, nxt = s[k], s[(k + 1) % len(s)]
        gap = (nxt - cur) % n
        gaps.append((gap, k))
    gaps.sort(reverse=True)
    _, k = gaps[0]
    start = s[(k + 1) % len(s)]
    end = s[k]
    return start, end


def notch_pocket_points(
    verts: list[tuple[float, float]], edge_indices: list[int], n: int, parent_signed_area: float
) -> tuple[Optional[list[tuple[float, float]]], str]:
    """Given one cluster of ring-edge indices (already circularly-local, see
    _cluster_ring_indices) belonging to a single notch, returns
    (pocket_points, status). `status` is one of:
      - "ok": pocket_points is the pocket polygon's vertex list -- the
        ring-vertex span from the cluster's earliest edge to its latest edge
        INCLUSIVE of any interstitial edge (e.g. a notch's own crossbar,
        which typically heals to wall-backed on its own and so is never
        itself edge-flagged, but still sits geometrically between the two
        jamb edges that stay flagged).
      - "degenerate": the span covers almost the whole ring (>= n-1 edges,
        a same-key grouping mistake, not a real notch) or the pocket's own
        signed area is exactly zero. pocket_points is None.
      - "outward_anomaly": the pocket polygon's signed area has the
        OPPOSITE winding sign from the parent ring's own signed area
        (`parent_signed_area`) -- per this module's own docstring, a notch
        can only ever be a pocket the room polygon dips INTO (adding
        interior area vs. a straight-run reconstruction); ResPlan's
        room-boundary-through-the-threshold convention has no mechanism to
        produce the opposite, so this is an anomaly to exclude, not a
        normal notch. pocket_points is None.

    Callers that only care whether a usable pocket came out (e.g.
    rooms.py::assemble_rooms, which just needs pockets to subtract from the
    source polygon) can check `status == "ok"`; callers that need the
    degenerate/anomaly breakdown for reporting (e.g.
    diagnose_notch_area_fraction.py) get it without re-deriving the
    classification.

    Ported unchanged (classification logic) from
    qa/diagnose_notch_area_fraction.py::analyze_room's inline
    pocket-construction block (2026-07-26) -- both that script and
    rooms.py::assemble_rooms now call this one implementation instead of
    each carrying its own copy of the circular-indexing logic."""
    start, end = _circular_span(edge_indices, n)
    num_edges = (end - start) % n + 1
    if num_edges >= n - 1:
        return None, "degenerate"
    vertex_idxs = [(start + k) % n for k in range(num_edges + 1)]
    pocket_pts = [verts[j] for j in vertex_idxs]
    pocket_signed = _signed_area(pocket_pts)
    if pocket_signed == 0.0:
        return None, "degenerate"
    if (pocket_signed > 0) == (parent_signed_area > 0):
        return pocket_pts, "ok"
    return None, "outward_anomaly"
