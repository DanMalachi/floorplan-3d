"""Validation suite for measure_clean_at_source.py, added 2026-07-21 after
the unclamped-overlap coverage bug (see _edge_covered's docstring) was
found to explain 40.4% of a 27-plan sample's room_boundary_no_wall_match
flags — a second measurement bug in this script, following the earlier
fill_openings_into_wall omission. Per Dan's instruction: this script does
not get a third pass without its own known-answer tests.

2026-07-22 build session added the doorway-notch suppression rule
(check_plan's docstring has the full spec/justification) plus its own
tests below: the flipped notch test (feature), a genuine-defect-with-
incidental-opening-proximity guardrail (the risk this whole diagnostic
arc exists to bound — a real missing-wall edge must never be suppressed
just because an opening happens to sit nearby), and a multi-edge zigzag
adversarial case (plan 12017's real-world pattern of >2 notch edges per
door)."""
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


def test_doorway_notch_does_not_flag():
    # The room polygon itself steps DOWN by wall_depth into the door's own
    # footprint (matches the confirmed real pattern: plans 9206/7607/3807/
    # 10171 — notch edge coordinates land exactly on the door polygon's
    # bounding box). Room sized 40x30 (not the door's own ~4-unit scale)
    # for the same opposite-wall-bleed reason as the missing-wall fixture
    # above — otherwise the far wall spuriously "covers" the notch jambs
    # and the test wouldn't reproduce the real flagging behavior at all.
    #
    # FORMERLY xfail(strict=True) — this was the pinned tripwire for the
    # doorway-notch suppression rule; flips to a plain passing test now
    # that the rule (check_plan's docstring has the full spec) lands.
    notch = Polygon(
        [(0, 0), (18, 0), (18, -WALL_DEPTH), (22, -WALL_DEPTH), (22, 0), (40, 0), (40, 30), (0, 30), (0, 0)]
    )
    door = box(18, -WALL_DEPTH, 22, 0)
    outer = box(-WALL_DEPTH, -WALL_DEPTH, 40 + WALL_DEPTH, 30 + WALL_DEPTH)
    wall = outer.difference(notch).difference(door)
    plan = _plan(wall, notch, door=MultiPolygon([door]), inner=MultiPolygon([outer]))

    result = check_plan(plan)
    assert not any(f.startswith("room_boundary_no_wall_match") for f in result["flags"])
    assert result["clean_at_source"] is True

    # Audit trail: a suppressed edge must never be silently dropped — it
    # has to show up in notch_suppressions with enough detail (which room,
    # which edge index, the coverage value) to be reviewable later. Both
    # jamb edges (the two perpendicular steps into the door footprint)
    # should be logged; the crossbar edge along the door's own reveal
    # never breaks the wall-ink check in the first place (it's collinear
    # with the filled wall's own boundary), so only 2 suppressions here,
    # not 3.
    assert len(result["notch_suppressions"]) == 2
    for entry in result["notch_suppressions"]:
        assert entry.startswith("room_boundary_notch_suppressed:bedroom_0:")
        assert "opening_cov=" in entry


def test_genuine_defect_with_incidental_opening_proximity_is_not_suppressed():
    # The guardrail this whole diagnostic arc exists for: an edge that has
    # a REAL door right next to it (opening_cov=1.0, well clear of 0.65)
    # and IS perpendicular to its neighbor (true of every corner in an
    # axis-aligned room — confirms perpendicularity alone is non-
    # discriminating, exactly as the diagnostic found) — but the "notch"
    # here is 10 units deep, not a plausible wall reveal (wall_depth is
    # only 4). A door this recessed is a genuine source anomaly (in the
    # spirit of the a_genuine_gt_defect class — a real geometric
    # inconsistency, not a fixable-by-suppression doorway), not a real
    # notch. The ONLY thing that must refuse suppression here is LENGTH:
    # 10 units is far past 1.2x wall_depth (4.8). If this test ever fails,
    # the conjunction has degraded into something a non-notch anomaly can
    # satisfy, which would silently mark a broken plan clean and inflate
    # the exact clean-rate metric the 90% bar gates on.
    #
    # Note on why this isn't built from a simple straight missing-wall
    # edge instead (e.g. test_genuinely_missing_wall_must_flag's shape):
    # fill_openings_into_wall unions ANY nearby door/window polygon back
    # into the wall, so an opening placed close enough to give a straight
    # edge high opening_coverage tends to ALSO heal that same edge's own
    # wall-ink ratio back above COVERAGE_THRESHOLD before suppression logic
    # is ever reached (coupled by construction — both measure the same
    # projected overlap). A corner-shaped anomaly decouples them exactly
    # the way a real notch does (the crossbar heals via the parallel fill,
    # the jambs don't, since they're perpendicular) — this is the
    # legitimate way to get "high opening proximity, still genuinely
    # broken by the pre-existing wall-ink check" so LENGTH is what's
    # actually on trial, not an accident of the fill step.
    DEEP = 10.0
    notch = Polygon(
        [(0, 0), (18, 0), (18, -DEEP), (22, -DEEP), (22, 0), (40, 0), (40, 30), (0, 30), (0, 0)]
    )
    door = box(18, -DEEP, 22, 0)
    # outer's bottom reaches exactly to -DEEP (matching the notch's own
    # depth, same convention as the passing notch test above) so the
    # crossbar still heals via the parallel fill -- only the jambs are
    # the interesting broken edges here.
    outer = box(-WALL_DEPTH, -DEEP, 40 + WALL_DEPTH, 30 + WALL_DEPTH)
    wall = outer.difference(notch).difference(door)
    plan = _plan(wall, notch, door=MultiPolygon([door]), inner=MultiPolygon([outer]))

    result = check_plan(plan)
    assert any(f.startswith("room_boundary_no_wall_match:bedroom_0") for f in result["flags"])
    assert result["clean_at_source"] is False
    assert result["notch_suppressions"] == []


def test_zigzag_multi_edge_notch_all_suppress_and_room_closes():
    # Adversarial case from plan 12017 (real ResPlan data): a room can
    # have MORE than one simple 2-jamb notch along the same wall run (two
    # separate doors close together produced 4 total notch-jamb edges in
    # the real overlay). Reproduced here as two clean notches on the same
    # bottom wall, separated by a wall-backed run, to stress per-edge
    # independence: each of the 4 riser edges must suppress on its OWN
    # geometry (not accidentally reuse a neighbor's coverage/angle), and
    # once all 4 are suppressed the room must have NO remaining broken
    # edge at all -- it "closes" (no room_boundary_no_wall_match flag),
    # not just partially recovers the way a strict 0.8 cutoff left plan
    # 5664 partially broken.
    # Room is 50 (not 40) units wide -- with a 40-unit room the OUTER
    # boundary's own far wall (at x=44) lands exactly at the 12-unit
    # ink_proximity radius from notch 2's right jamb (x=32) and spuriously
    # "covers" it (the same small-room/thick-wall proximity-bleed quirk
    # documented in docs/session-notes/p3a-handoff.md, here triggered by
    # the outer boundary rather than an opposite room wall) -- confirmed
    # empirically while building this fixture. Widening pushes that
    # boundary out of proximity range without changing the pattern being
    # tested.
    ring = [
        (0, 0), (10, 0), (10, -WALL_DEPTH), (16, -WALL_DEPTH), (16, 0),   # notch 1 (2 risers)
        (26, 0), (26, -WALL_DEPTH), (32, -WALL_DEPTH), (32, 0),           # notch 2 (2 risers)
        (50, 0), (50, 30), (0, 30), (0, 0),
    ]
    room = Polygon(ring)
    door1 = box(10, -WALL_DEPTH, 16, 0)
    door2 = box(26, -WALL_DEPTH, 32, 0)
    outer = box(-WALL_DEPTH, -WALL_DEPTH, 50 + WALL_DEPTH, 30 + WALL_DEPTH)
    wall = outer.difference(room).difference(door1).difference(door2)
    plan = _plan(wall, room, door=MultiPolygon([door1, door2]), inner=MultiPolygon([outer]))

    result = check_plan(plan)
    assert not any(f.startswith("room_boundary_no_wall_match") for f in result["flags"])
    assert result["clean_at_source"] is True
    # 4 riser edges total (2 per door) -- all 4 must suppress independently.
    assert len(result["notch_suppressions"]) == 4
