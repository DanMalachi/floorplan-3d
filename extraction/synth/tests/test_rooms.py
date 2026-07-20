import pytest
from shapely.geometry import MultiPolygon, Polygon, box

from extraction.synth.rooms import _MITER_LIMIT, _corner_vertices, _mitered_face_polygon, assemble_rooms, wall_roles
from extraction.synth.skeleton import WallSegment

# A 10x10 living room + 10x10 balcony stacked with a real wall_depth (0.3)
# gap between them, matching the physically-correct model used everywhere
# else: every wall's centerline sits half-thickness back from EACH face it
# borders (exterior walls are offset outward from their room; the shared
# dividing wall's centerline sits in the middle of the gap between the two
# rooms it separates) — never exactly on a room's boundary. Placing a
# wall's centerline exactly at a room edge (as an earlier version of this
# fixture did) doesn't match real ResPlan geometry and breaks the
# face-area sanity check in assemble_rooms.
_T = 0.3  # thickness
_H = _T / 2
SEGMENTS = [
    WallSegment(start=(-_H, -_H), end=(10 + _H, -_H), thickness=_T),  # 0: living bottom (external)
    WallSegment(start=(10 + _H, -_H), end=(10 + _H, 10 + _H), thickness=_T),  # 1: living right (external)
    WallSegment(start=(10 + _H, 10 + _H), end=(-_H, 10 + _H), thickness=_T),  # 2: shared middle wall
    WallSegment(start=(-_H, 10 + _H), end=(-_H, -_H), thickness=_T),  # 3: living left (external)
    WallSegment(start=(10 + _H, 10 + _H), end=(10 + _H, 20 + _T + _H), thickness=_T),  # 4: balcony right (external)
    WallSegment(start=(10 + _H, 20 + _T + _H), end=(-_H, 20 + _T + _H), thickness=_T),  # 5: balcony top (external)
    WallSegment(start=(-_H, 20 + _T + _H), end=(-_H, 10 + _H), thickness=_T),  # 6: balcony left (external)
]

LIVING_POLY = box(0, 0, 10, 10)
BALCONY_POLY = box(0, 10 + _T, 10, 20 + _T)
INNER = box(-_H, -_H, 10 + _H, 20 + _T + _H)  # outer building envelope, matches exterior wall centerlines


def test_room_wall_cycle_assembles_closed():
    rooms, wall_to_types, flags = assemble_rooms(
        SEGMENTS, {"living": MultiPolygon([LIVING_POLY]), "balcony": MultiPolygon([BALCONY_POLY])}
    )
    assert len(rooms) == 2
    living = next(r for r in rooms if r.room_type == "living")
    assert set(living.wall_cycle) == {0, 1, 2, 3}
    balcony = next(r for r in rooms if r.room_type == "balcony")
    assert set(balcony.wall_cycle) == {2, 4, 5, 6}


def test_wall_to_room_types_correct():
    rooms, wall_to_types, flags = assemble_rooms(
        SEGMENTS, {"living": MultiPolygon([LIVING_POLY]), "balcony": MultiPolygon([BALCONY_POLY])}
    )
    assert wall_to_types[2] == {"living", "balcony"}  # shared wall
    assert wall_to_types[0] == {"living"}
    assert wall_to_types[5] == {"balcony"}


def test_broken_cycle_flagged_and_excluded():
    # A tiny disjoint triangle that doesn't align with any wall band.
    stray = box(500, 500, 501, 501)
    rooms, wall_to_types, flags = assemble_rooms(SEGMENTS, {"kitchen": MultiPolygon([stray])})
    assert rooms == []
    assert any("broken_room_cycle" in f for f in flags)


def test_mitered_face_polygon_bevels_collinear_different_thickness_walls():
    # A straight run split into two collinear wall ids of very different
    # thickness (a thin partition continuing a thick wall's line — a real
    # ResPlan pattern, not hypothetical: plan 1448's left wall does exactly
    # this). Their offset lines are PARALLEL at different perpendicular
    # positions and never intersect no matter how far extended — the old
    # pairwise infinite-line intersection returned None here (implied_area
    # collapsed to 0). This must resolve via a bevel (two vertices) instead.
    segs = [
        WallSegment(start=(0, 0), end=(10, 0), thickness=1.0),
        WallSegment(start=(10, 0), end=(10, 10), thickness=1.0),
        WallSegment(start=(10, 10), end=(0, 10), thickness=1.0),
        WallSegment(start=(0, 10), end=(0, 5), thickness=1.0),
        WallSegment(start=(0, 5), end=(0, 0), thickness=0.2),  # collinear w/ the one above, thinner
    ]
    face = _mitered_face_polygon([0, 1, 2, 3, 4], segs, (5, 5))
    assert face is not None
    assert face.is_valid and not face.is_empty
    # strictly inside the 10x10 centerline envelope, comfortably more than
    # a degenerate sliver
    assert 50 < face.area < 100


def test_mitered_face_polygon_handles_concave_l_shape():
    # A reflex (concave) corner — common for L-shaped bathrooms/storage.
    # A naive corner-by-corner miter join assumes every turn is convex and
    # silently produces a self-intersecting ring here; this must still
    # return a single valid polygon tracing the real L-shape.
    segs = [
        WallSegment(start=(0, 0), end=(10, 0), thickness=0.4),
        WallSegment(start=(10, 0), end=(10, 5), thickness=0.4),
        WallSegment(start=(10, 5), end=(5, 5), thickness=0.4),
        WallSegment(start=(5, 5), end=(5, 10), thickness=0.4),
        WallSegment(start=(5, 10), end=(0, 10), thickness=0.4),
        WallSegment(start=(0, 10), end=(0, 0), thickness=0.4),
    ]
    outer = Polygon([(0, 0), (10, 0), (10, 5), (5, 5), (5, 10), (0, 10)])
    face = _mitered_face_polygon([0, 1, 2, 3, 4, 5], segs, (outer.centroid.x, outer.centroid.y))
    assert face is not None
    assert face.is_valid and not face.is_empty
    # inset from the 75-unit outer envelope, but not collapsed
    assert 60 < face.area < 75


def test_corner_vertices_boundary_miter_vs_bevel():
    # Directly exercises the _MITER_LIMIT accept/reject boundary in
    # isolation (bypassing wall-cycle geometry so the intersection
    # distance from the junction is exact and controlled): two offset
    # lines crossing at (D, 0), junction pinned at (0, 0), half-thickness
    # 1.0 on both sides -> limit = _MITER_LIMIT * 1.0 = 8.0 exactly. Just
    # under the limit must accept the true miter point (1 vertex); just
    # over must fall back to a bevel (2 vertices) instead of trusting a
    # corner that's drifted too far from the real junction.
    assert _MITER_LIMIT == 8.0  # this test's D values are picked against this exact value
    prev_seg = WallSegment(start=(-5, 0), end=(0, 0), thickness=1.0)
    cur_seg = WallSegment(start=(0, 0), end=(0, 5), thickness=1.0)

    just_inside = _corner_vertices(
        prev_seg, cur_seg, ((-10.0, 0.0), (10.0, 0.0)), ((7.99, -10.0), (7.99, 10.0)), 1.0, 1.0
    )
    assert len(just_inside) == 1
    assert just_inside[0] == pytest.approx((7.99, 0.0))

    just_outside = _corner_vertices(
        prev_seg, cur_seg, ((-10.0, 0.0), (10.0, 0.0)), ((8.01, -10.0), (8.01, 10.0)), 1.0, 1.0
    )
    assert len(just_outside) == 2


def test_mitered_face_polygon_heals_chamfered_corner_self_intersection():
    # Reproduces plan 13572's bedroom_0 (a real ResPlan case that was
    # AREA_MATCH_DEGENERATE_FACE_POLYGON pre-fix, per the diagnostic
    # sample): a short, much-thinner diagonal wall chamfering one corner
    # between three long, thick walls. The naive mitered ring is
    # technically self-intersecting right at that short wall's own tiny
    # edge — verified this is floating-point noise, not a real topology
    # error — so buffer(0) must heal it into a single valid polygon
    # (matching the source room's ~6047 area within the 5% gate) rather
    # than returning None.
    segments = [
        WallSegment(
            start=(163.29327666151468, 96.87258500772798),
            end=(163.29327666151468, 8.997585007727976),
            thickness=4.748,
        ),
        WallSegment(
            start=(163.29327666151468, 8.997585007727976),
            end=(88.54327666151468, 8.997585007727976),
            thickness=4.748,
        ),
        WallSegment(
            start=(88.54327666151468, 95.43508500772798),
            end=(88.54327666151468, 8.997585007727976),
            thickness=4.748,
        ),
        WallSegment(
            start=(93.29327666151468, 96.93508500772798),
            end=(88.54327666151468, 95.43508500772798),
            thickness=2.500,
        ),  # the chamfer: short + much thinner than its 3 neighbors
        WallSegment(
            start=(163.29327666151468, 96.87258500772798),
            end=(93.29327666151468, 96.93508500772798),
            thickness=4.748,
        ),
    ]
    centroid = (125.30267549682439, 52.11156038356493)
    face = _mitered_face_polygon([0, 1, 2, 3, 4], segments, centroid)
    assert face is not None
    assert face.is_valid and not face.is_empty
    source_area = 6047.155068333456
    assert abs(face.area - source_area) / source_area < 0.05  # within the 5% area gate


def test_mitered_face_polygon_repeated_wall_id_cycle_stays_type_safe():
    # A wall_cycle that revisits the same wall id is a genuine topological
    # problem (from upstream per-edge coverage picking a wrong wall), not
    # floating-point noise. The buffer(0) heal is NOT a universal safety
    # net for this — verified it can still resolve into a single,
    # structurally-valid-but-wrong small polygon rather than None. The
    # real backstop is assemble_rooms's area-match check against the
    # source room polygon, not this function alone — so all this function
    # itself must guarantee is the type contract: never raise, and never
    # return something invalid/empty pretending to be usable.
    segs = [
        WallSegment(start=(0, 0), end=(10, 0), thickness=0.4),
        WallSegment(start=(10, 0), end=(10, 10), thickness=0.4),
        WallSegment(start=(10, 10), end=(0, 10), thickness=0.4),
    ]
    face = _mitered_face_polygon([0, 1, 2, 0, 1], segs, (5, 5))
    assert face is None or (face.is_valid and not face.is_empty)


def test_wall_roles_external_vs_rail_vs_internal():
    rooms, wall_to_types, _ = assemble_rooms(
        SEGMENTS, {"living": MultiPolygon([LIVING_POLY]), "balcony": MultiPolygon([BALCONY_POLY])}
    )
    roles, flags = wall_roles(SEGMENTS, MultiPolygon([INNER]), wall_to_types)
    assert roles[0] == "external"  # living bottom, on inner boundary
    assert roles[2] == "internal"  # shared wall: adjacent to living AND balcony, not balcony-only
    assert roles[5] == "external"  # balcony top, on inner boundary
    # Force a balcony-only, non-boundary wall to check the rail path directly.
    lone_wall = [WallSegment(start=(3, 10), end=(6, 10), thickness=0.3)]
    lone_roles, lone_flags = wall_roles(lone_wall, MultiPolygon([INNER]), {0: {"balcony"}})
    assert lone_roles[0] == "rail"
    assert "resplan_rail_from_balcony" in lone_flags[0]
