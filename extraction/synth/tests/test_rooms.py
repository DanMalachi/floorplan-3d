import pytest
from shapely.geometry import MultiPolygon, Polygon, box

from extraction.synth.rooms import _MITER_LIMIT, _corner_vertices, _mitered_face_polygon, assemble_rooms, wall_roles
from extraction.synth.skeleton import WallSegment

# -- Doorway-notch (lever #1) fixture geometry --------------------------
# A single 40x30 room, wall thickness = notch depth = wall_depth = 4.0 —
# same scale as test_measure_clean_at_source.py's
# test_doorway_notch_does_not_flag and test_diagnose_notch_area_fraction.py's
# fixtures, deliberately NOT decoupled: the wall's own band radius
# (thickness/2 + assemble_rooms's default tolerance=2.0) must comfortably
# reach the notch's crossbar edge (parallel to the wall run, sits `notch
# depth - thickness/2` away from the centerline) for the crossbar to heal
# via ordinary wall coverage on its own, exactly like the real converter
# path — a thinner/decoupled wall leaves the crossbar itself unbacked, and
# since it isn't perpendicular it can never pass the notch discriminator
# either, breaking the room for a DIFFERENT reason than the one under test.
# The jamb edge length (== notch depth == wall_depth here) must also be >=
# assemble_rooms's own default `tolerance` (2.0) or it's silently treated
# as a sub-tolerance corner-transition artifact and never reaches the
# discriminator at all (rooms.py's own skip, matching
# qa/measure_clean_at_source.py::check_plan's identical TOLERANCE-gated
# skip) — 4.0 clears that with margin.
_NOTCH_T = 4.0
_NOTCH_H = _NOTCH_T / 2
_NOTCH_WALL_DEPTH = 4.0


def _notch_room_segments():
    return [
        WallSegment(start=(-_NOTCH_H, -_NOTCH_H), end=(40 + _NOTCH_H, -_NOTCH_H), thickness=_NOTCH_T),  # 0: bottom
        WallSegment(start=(40 + _NOTCH_H, -_NOTCH_H), end=(40 + _NOTCH_H, 30 + _NOTCH_H), thickness=_NOTCH_T),  # 1
        WallSegment(start=(40 + _NOTCH_H, 30 + _NOTCH_H), end=(-_NOTCH_H, 30 + _NOTCH_H), thickness=_NOTCH_T),  # 2
        WallSegment(start=(-_NOTCH_H, 30 + _NOTCH_H), end=(-_NOTCH_H, -_NOTCH_H), thickness=_NOTCH_T),  # 3: left
    ]

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


def test_doorway_notch_room_assembles_with_normalization():
    # A door 30 wide, notch depth 4 (== wall thickness == wall_depth),
    # centered on the bottom wall (margins of 5 on each side). Two things
    # must both hold for this room to assemble at all: (1) stage 1 must
    # excuse the two perpendicular jamb edges instead of unconditionally
    # marking the room broken (no wall band ever backs a notch jamb, by
    # construction — the crossbar between them heals via ordinary wall
    # coverage on its own, same as the real converter path); (2) the area
    # gate must compare against the notch-normalized source area
    # (poly.difference(pocket)), not the raw source area which INCLUDES the
    # 120-unit notch pocket. Hand-verified: face_poly ~= 1245.78 (the
    # EMPIRICAL_FACE_OFFSET_MULTIPLIER's own ~3.8% baseline slack vs. the
    # 1200 straight-run area); raw comparison against source=1320
    # (1200+120) gives area_err ~= 5.62% > the 5% gate (FAILS); normalized
    # comparison against 1200 gives ~= 3.815% (PASSES). Before this build,
    # this exact room was unconditionally `broken_room_cycle` at stage 1,
    # before ever reaching the area gate.
    segments = _notch_room_segments()
    ring = [(0, 0), (5, 0), (5, -4), (35, -4), (35, 0), (40, 0), (40, 30), (0, 30)]
    room = Polygon(ring)
    door = box(5, -4, 35, 0)

    rooms, wall_to_types, flags = assemble_rooms(
        segments,
        {"bedroom": MultiPolygon([room])},
        openings={"door": MultiPolygon([door])},
        wall_depth=_NOTCH_WALL_DEPTH,
    )

    assert not any(f.startswith("broken_room_cycle") for f in flags)
    assert not any(f.startswith("cycle_unrepairable") for f in flags)
    assert len(rooms) == 1
    bedroom = rooms[0]
    assert bedroom.room_type == "bedroom"
    assert set(bedroom.wall_cycle) == {0, 1, 2, 3}
    assert "notch_normalized:bedroom_0" in flags


def test_doorway_notch_room_without_openings_kwarg_stays_broken():
    # Same geometry as above, but called the way every pre-lever-#1 caller
    # does (no openings/wall_depth passed) -- confirms the defaults are a
    # true no-op, not just "usually fine": this room MUST still fail exactly
    # as it did before this build, since the discriminator can't run at all
    # without opening geometry.
    segments = _notch_room_segments()
    ring = [(0, 0), (5, 0), (5, -4), (35, -4), (35, 0), (40, 0), (40, 30), (0, 30)]
    room = Polygon(ring)

    rooms, wall_to_types, flags = assemble_rooms(segments, {"bedroom": MultiPolygon([room])})
    assert rooms == []
    assert any(f.startswith("broken_room_cycle") for f in flags)


def test_notch_exemption_length_guardrail_not_wrongly_excused():
    # Same perpendicular jamb shape and high opening_cov (door bbox matches
    # the notch exactly) as the passing case above, but depth=6 against the
    # SAME wall_depth=4.0 -- edge_len (6) > NOTCH_LENGTH_MULTIPLE * wall_depth
    # (4.8), so the length condition alone must block exemption even though
    # perpendicularity and opening coverage both still hold. This is the
    # required positive guardrail: a genuinely broken edge with incidental
    # opening proximity must not be wrongly excused.
    #
    # Known limitation (inherited from qa/measure_clean_at_source.py's own
    # guardrail, see its "Important limit on the guardrail test" note): a
    # STRAIGHT-run defect with incidental opening proximity can't be
    # isolated in a test like this, because fill_openings_into_wall-style
    # healing (and here, simple wall-band coverage) tends to heal a
    # straight-run edge's own coverage before the notch check is ever
    # reached -- only a corner-shaped (jamb) anomaly decouples opening
    # proximity from wall coverage, which is exactly what this fixture is
    # (deliberately) built as. This guardrail proves the LENGTH condition
    # works, not that every geometry shape is safe from false suppression.
    segments = _notch_room_segments()
    ring = [(0, 0), (15, 0), (15, -6), (25, -6), (25, 0), (40, 0), (40, 30), (0, 30)]
    room = Polygon(ring)
    door = box(15, -6, 25, 0)

    rooms, wall_to_types, flags = assemble_rooms(
        segments,
        {"bedroom": MultiPolygon([room])},
        openings={"door": MultiPolygon([door])},
        wall_depth=_NOTCH_WALL_DEPTH,
    )

    assert rooms == []
    assert any(f.startswith("broken_room_cycle") for f in flags)
    assert not any(f.startswith("notch_normalized") for f in flags)
