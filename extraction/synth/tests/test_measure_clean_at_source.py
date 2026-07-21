"""Validation suite for measure_clean_at_source.py, added 2026-07-21 after
the unclamped-overlap coverage bug (see _edge_covered's docstring) was
found to explain 40.4% of a 27-plan sample's room_boundary_no_wall_match
flags — a second measurement bug in this script, following the earlier
fill_openings_into_wall omission. Per Dan's instruction: this script does
not get a third pass without its own known-answer tests."""
import pytest
from shapely.geometry import LineString, MultiPolygon, Polygon, box
from shapely.strtree import STRtree

from extraction.synth.qa.measure_clean_at_source import _edge_covered, check_plan

WALL_DEPTH = 4.0


def _plan(wall, bedroom, door=None, window=None, front_door=None, inner=None):
    return {
        "id": 1,
        "wall": wall,
        "door": door,
        "window": window,
        "front_door": front_door,
        "bedroom": bedroom,
        "bathroom": None,
        "kitchen": None,
        "storage": None,
        "stair": None,
        "balcony": None,
        "living": None,
        "inner": inner,
        "wall_depth": WALL_DEPTH,
    }


def test_fully_clean_plan_scores_clean():
    # A single bedroom fully enclosed by a uniform wall ring, no openings.
    bedroom = box(0, 0, 10, 10)
    outer = box(-WALL_DEPTH, -WALL_DEPTH, 10 + WALL_DEPTH, 10 + WALL_DEPTH)
    wall = outer.difference(bedroom)
    plan = _plan(wall, bedroom, inner=MultiPolygon([outer]))

    result = check_plan(plan)
    assert result["flags"] == []
    assert result["clean_at_source"] is True


def test_genuinely_missing_wall_must_flag():
    # Same enclosure, but the entire right-side wall segment is removed —
    # a real gap, not a doorway: nothing (no door/window geometry either)
    # explains the missing ink. Room is 30 units wide (not 10) so the
    # LEFT wall's parallel inner face — 30 units from the missing right
    # edge — falls outside ink_proximity (12 units at wall_depth=4) and
    # can't spuriously "cover" it; at 10 units wide the two opposite walls
    # sit inside each other's proximity band and the test doesn't
    # reproduce a flag at all (this is an existing, pre-clamp-fix
    # characteristic of the coverage check for small rooms, not something
    # this session's fix touches — sized the fixture around it instead).
    bedroom = box(0, 0, 30, 10)
    outer = box(-WALL_DEPTH, -WALL_DEPTH, 30 + WALL_DEPTH, 10 + WALL_DEPTH)
    missing_strip = box(30, -1, 30 + WALL_DEPTH, 11)
    wall = outer.difference(bedroom).difference(missing_strip)
    plan = _plan(wall, bedroom, inner=MultiPolygon([outer]))

    result = check_plan(plan)
    assert any(f.startswith("room_boundary_no_wall_match:bedroom_0") for f in result["flags"])
    assert result["clean_at_source"] is False


def test_simple_doorway_cut_into_wall_does_not_flag():
    # A door cut straight into an exterior wall, room-polygon edge stays a
    # single straight line (no notch) — the ALREADY-WORKING case
    # fill_openings_into_wall exists to handle. Distinct from the room-
    # polygon notch pattern below: this validates the MEASUREMENT
    # property (a real doorway gap in otherwise-present wall ink must not
    # read as a source defect), not the separate notch-detection logic
    # that stays deferred converter work.
    bedroom = box(0, 0, 10, 10)
    outer = box(-WALL_DEPTH, -WALL_DEPTH, 10 + WALL_DEPTH, 10 + WALL_DEPTH)
    door = box(4.0, -WALL_DEPTH, 6.0, 0.0)  # cut into the bottom wall, straight, door width 2
    wall = outer.difference(bedroom).difference(door)
    plan = _plan(wall, bedroom, door=MultiPolygon([door]), inner=MultiPolygon([outer]))

    result = check_plan(plan)
    assert not any(f.startswith("room_boundary_no_wall_match") for f in result["flags"])
    assert result["clean_at_source"] is True


def test_edge_covered_never_negative_for_candidate_entirely_outside_span():
    """Regression for the unclamped-overlap bug (2026-07-21): a candidate
    wall-ink edge collinear with the room edge but entirely outside its
    [0,1] parametric span used to contribute a large NEGATIVE number to
    the coverage sum instead of 0. Confirmed pre-fix: this exact setup
    returned ratio=-24.0."""
    a, b = (0.0, 0.0), (0.0, 2.0)  # a 2-unit vertical room edge
    edge_len = 2.0
    far = ((0.0, 50.0), (0.0, 60.0), 10.0)  # collinear, entirely outside [0,1] along the edge
    wall_edges = [far]
    tree = STRtree([LineString([far[0], far[1]])])

    ratio = _edge_covered(a, b, edge_len, wall_edges, tree, ink_proximity=100.0)
    assert ratio == 0.0


@pytest.mark.xfail(
    reason="Room-polygon notch tracing a door's own footprint (this session's dominant "
    "'e_opening_doorway_notch' finding, 63% of edges / 48% of rooms in the 27-plan sample) "
    "still flags — suppressing it needs check_plan to recognize an edge captured by a door "
    "polygon's footprint as an opening, not just the clamp fix. That's converter-detection "
    "logic, deferred to next session's doorway-notch handling work (docs/session-notes/"
    "p3a-handoff.md). This test is the tripwire: it should flip to passing once that lands.",
    strict=True,
)
def test_doorway_notch_does_not_flag():
    # The room polygon itself steps DOWN by wall_depth into the door's own
    # footprint (matches the confirmed real pattern: plans 9206/7607/3807/
    # 10171 — notch edge coordinates land exactly on the door polygon's
    # bounding box). Room sized 40x30 (not the door's own ~4-unit scale)
    # for the same opposite-wall-bleed reason as the missing-wall fixture
    # above — otherwise the far wall spuriously "covers" the notch jambs
    # and the test wouldn't reproduce the real flagging behavior at all.
    notch = Polygon(
        [(0, 0), (18, 0), (18, -WALL_DEPTH), (22, -WALL_DEPTH), (22, 0), (40, 0), (40, 30), (0, 30), (0, 0)]
    )
    door = box(18, -WALL_DEPTH, 22, 0)
    outer = box(-WALL_DEPTH, -WALL_DEPTH, 40 + WALL_DEPTH, 30 + WALL_DEPTH)
    wall = outer.difference(notch).difference(door)
    plan = _plan(wall, notch, door=MultiPolygon([door]), inner=MultiPolygon([outer]))

    result = check_plan(plan)
    assert not any(f.startswith("room_boundary_no_wall_match") for f in result["flags"])
