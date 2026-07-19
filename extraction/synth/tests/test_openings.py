from shapely.geometry import box

from extraction.synth.openings import project_openings
from extraction.synth.skeleton import WallSegment

# A 10x10 square room: 4 walls, thickness 0.3, wall_depth-scale tolerance.
SEGMENTS = [
    WallSegment(start=(0, 0), end=(10, 0), thickness=0.3),  # bottom
    WallSegment(start=(10, 0), end=(10, 10), thickness=0.3),  # right
    WallSegment(start=(10, 10), end=(0, 10), thickness=0.3),  # top
    WallSegment(start=(0, 10), end=(0, 0), thickness=0.3),  # left
]


def test_door_projects_to_correct_wall_and_offset():
    # Door centered at x=5 on the bottom wall, spanning the wall band.
    door = box(4.5, -0.2, 5.5, 0.2)
    projections, batch_flags = project_openings(SEGMENTS, door, None)
    assert len(projections) == 1
    p = projections[0]
    assert p.wall_index == 0
    assert abs(p.center_offset - 5.0) < 0.2
    assert abs(p.width - 1.0) < 0.2
    assert p.opening_class == "door"
    assert "swing_unknown" in p.flags


def test_window_on_right_wall():
    window = box(9.8, 6.5, 10.2, 7.5)
    projections, _ = project_openings(SEGMENTS, None, window)
    assert len(projections) == 1
    p = projections[0]
    assert p.wall_index == 1
    assert abs(p.center_offset - 7.0) < 0.3
    assert p.opening_class == "window"
    assert "swing_unknown" not in p.flags


def test_unattached_opening_flagged_not_dropped_silently():
    far_away = box(100, 100, 101, 101)
    projections, batch_flags = project_openings(SEGMENTS, far_away, None)
    assert projections == []
    assert any("unattached_opening" in f for f in batch_flags)


def test_sibling_overlap_detected():
    from shapely.geometry import MultiPolygon

    door_a = box(4.0, -0.2, 5.5, 0.2)  # center 4.75, width 1.5
    door_b = box(5.0, -0.2, 6.5, 0.2)  # center 5.75, width 1.5 -> overlaps a
    # MultiPolygon keeps both parts distinct (unlike unary_union, which
    # would merge overlapping polygons into one) so projection sees two
    # separate openings that land with overlapping spans on wall 0.
    projections, batch_flags = project_openings(SEGMENTS, MultiPolygon([door_a, door_b]), None)
    assert len(projections) == 2
    assert any("sibling_overlap" in f for p in projections for f in p.flags)
    assert any("sibling_overlap" in f for f in batch_flags)
