"""Unit tests for extraction/synth/notch.py's low-level helpers, moved here
2026-07-29 (lever #1 build) from the two QA modules that used to each carry
their own copy. Mirrors how rooms.py's own private helpers
(_mitered_face_polygon, _corner_vertices) are unit-tested directly in
test_rooms.py rather than only exercised through a public entry point.

test_pocket_subtraction_matches_difference_not_union_convention is the one
that matters most: it pins the exact 1216/1200/16 numbers from
test_measure_clean_at_source.py's test_doorway_notch_does_not_flag fixture
as literals, so the union-vs-difference sign convention this build depends
on (poly.difference(pocket), NOT poly.union(pocket) -- see rooms.py's area
gate and the corrected diagnose_notch_area_fraction.py docstring) cannot
silently invert without a test failing.
"""
from shapely.geometry import MultiPolygon, Polygon, box

from extraction.synth.notch import (
    _circular_span,
    _cluster_ring_indices,
    _nearest_wall_backed_cos,
    _opening_coverage_and_match,
    _signed_area,
    notch_pocket_points,
)

WALL_DEPTH = 4.0


def test_signed_area_orientation():
    ccw_square = [(0, 0), (4, 0), (4, 4), (0, 4)]
    cw_square = list(reversed(ccw_square))
    assert _signed_area(ccw_square) == 16.0
    assert _signed_area(cw_square) == -16.0


def test_cluster_ring_indices_splits_unrelated_notches_sharing_one_opening():
    # Plan 64 (bedroom_1, 16-edge ring): edges 0/2 and 8/10, two real,
    # physically UNRELATED notches on opposite sides of the room, both
    # best-matched the same door polygon. A naive same-key grouping would
    # merge them into one "pocket" spanning half the ring; clustering by
    # ring proximity (gap > MAX_NOTCH_SPAN_EDGES=4) must keep them apart.
    clusters = _cluster_ring_indices([0, 2, 8, 10], 16)
    assert sorted(clusters) == [[0, 2], [8, 10]]


def test_cluster_ring_indices_merges_one_real_notch():
    # A single notch's jamb/crossbar/jamb edges (all within MAX_NOTCH_SPAN_EDGES
    # of each other) must stay one cluster, not fragment.
    clusters = _cluster_ring_indices([3, 4, 5], 20)
    assert clusters == [[3, 4, 5]]


def test_circular_span_wraparound():
    # Indices straddling index 0 on a 10-edge ring: the smallest contiguous
    # arc covering {8, 9, 0, 1} wraps around, not the "flat" [0, 9] reading.
    assert _circular_span([8, 9, 0, 1], 10) == (8, 1)


def test_notch_pocket_points_rejects_degenerate_span():
    # A 5-edge ring where the candidate span covers 4 of 5 edges (>= n-1) --
    # a same-key grouping mistake, not a real notch.
    verts = [(0, 0), (4, 0), (4, 4), (2, 6), (0, 4)]
    pocket_pts, status = notch_pocket_points(verts, [0, 1, 2, 3], 5, parent_signed_area=1.0)
    assert status == "degenerate"
    assert pocket_pts is None


def test_notch_pocket_points_rejects_outward_anomaly_sign():
    # A normal jamb-crossbar-jamb pocket on a CCW room ring (positive signed
    # area, matching the pocket's own winding). Passing an artificially
    # FLIPPED parent sign here is a direct unit test of the sign-comparison
    # branch itself (per this module's docstring, a real outward anomaly
    # should never occur on genuine ResPlan data -- this isn't reproducing a
    # naturally-occurring case, it's exercising the guard that would catch
    # one).
    verts = [(0, 0), (18, 0), (18, -WALL_DEPTH), (22, -WALL_DEPTH), (22, 0), (40, 0), (40, 30), (0, 30)]
    parent_signed = _signed_area(verts)
    assert parent_signed > 0  # CCW, sanity check on the fixture itself

    pocket_pts, status = notch_pocket_points(verts, [1, 2, 3], len(verts), parent_signed_area=parent_signed)
    assert status == "ok"

    pocket_pts_flipped, status_flipped = notch_pocket_points(
        verts, [1, 2, 3], len(verts), parent_signed_area=-parent_signed
    )
    assert status_flipped == "outward_anomaly"
    assert pocket_pts_flipped is None


def test_pocket_subtraction_matches_difference_not_union_convention():
    # Exact fixture from test_measure_clean_at_source.py's
    # test_doorway_notch_does_not_flag: room polygon area = 1216 (40x30 body
    # = 1200, plus the 4x4 notch = 16). Pins the load-bearing convention
    # this whole build depends on: normalizing the source polygon means
    # poly.difference(pocket) = 1200 (matching the wall-cycle's straight-run
    # face), NOT poly.union(pocket) (which would be a no-op here since the
    # pocket is already inside poly, or 1216 if applied to a straight-run
    # rectangle -- either way, the wrong direction). If this convention ever
    # silently inverts, this test fails instead of a converter regression
    # showing up only as a mysteriously-worse conditional clean rate.
    verts = [(0, 0), (18, 0), (18, -WALL_DEPTH), (22, -WALL_DEPTH), (22, 0), (40, 0), (40, 30), (0, 30)]
    poly = Polygon(verts)
    assert poly.area == 1216.0

    parent_signed = _signed_area(verts)
    pocket_pts, status = notch_pocket_points(verts, [1, 2, 3], len(verts), parent_signed_area=parent_signed)
    assert status == "ok"
    pocket = Polygon(pocket_pts)
    assert abs(pocket.area - 16.0) < 1e-9

    normalized = poly.difference(pocket)
    assert normalized.geom_type == "Polygon"
    assert abs(normalized.area - 1200.0) < 1e-9

    # The wrong direction, pinned explicitly so a future edit that swaps
    # difference<->union is obviously wrong against this same assertion
    # block, not just silently different.
    wrongly_unioned = poly.union(pocket)
    assert abs(wrongly_unioned.area - 1216.0) < 1e-9  # no-op: pocket already inside poly


def test_opening_coverage_and_match_returns_stable_key():
    # Regression for "Python object identity across MultiPolygon.geoms
    # isn't stable" (diagnose_notch_area_fraction.py's original docstring
    # concern): the match key must be a plain, by-value-comparable tuple,
    # not something that depends on object identity surviving repeated
    # MultiPolygon.geoms access.
    door = box(18, -WALL_DEPTH, 22, 0)
    doors = MultiPolygon([door])

    def opening_polys():
        from extraction.synth.vendor.resplan_utils import get_geometries

        return [(("door", idx), part) for idx, part in enumerate(get_geometries(doors))]

    a, b = (18, 0), (18, -WALL_DEPTH)
    edge_len = WALL_DEPTH
    dx, dy = b[0] - a[0], b[1] - a[1]

    cov1, key1 = _opening_coverage_and_match(a, b, edge_len, dx, dy, opening_polys(), WALL_DEPTH)
    cov2, key2 = _opening_coverage_and_match(a, b, edge_len, dx, dy, opening_polys(), WALL_DEPTH)
    assert key1 == key2 == ("door", 0)
    assert cov1 == cov2
    assert cov1 > 0.0


def test_nearest_wall_backed_cos_finds_perpendicular_neighbor():
    # A 4-edge ring alternating backed/unbacked: edge 0 unbacked
    # (perpendicular target), edge 1 backed (horizontal neighbor) -- cos
    # between them should be ~0 (perpendicular).
    ring_edges = [
        ((0, 0), (0, 4), 4.0),   # edge 0: vertical, unbacked
        ((0, 4), (4, 4), 4.0),  # edge 1: horizontal, backed
        ((4, 4), (4, 0), 4.0),  # edge 2: vertical, unbacked
        ((4, 0), (0, 0), 4.0),  # edge 3: horizontal, unbacked
    ]
    backed_ratio = [None, 1.0, None, None]
    ux, uy = 0.0, 1.0  # edge 0's own unit direction (vertical)
    cos = _nearest_wall_backed_cos(0, ring_edges, backed_ratio, ux, uy)
    assert cos is not None
    assert abs(cos) < 1e-9


def test_nearest_wall_backed_cos_none_when_nothing_backed():
    ring_edges = [((0, 0), (0, 4), 4.0), ((0, 4), (4, 4), 4.0)]
    backed_ratio = [None, None]
    assert _nearest_wall_backed_cos(0, ring_edges, backed_ratio, 0.0, 1.0) is None
