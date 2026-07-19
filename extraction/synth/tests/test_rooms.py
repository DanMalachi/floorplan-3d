from shapely.geometry import MultiPolygon, Polygon, box

from extraction.synth.rooms import assemble_rooms, wall_roles
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
