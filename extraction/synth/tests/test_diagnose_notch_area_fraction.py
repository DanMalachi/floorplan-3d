"""Rule-1 corroboration (this phase's standing discipline: no newly-derived
QA number is trusted until corroborated or spot-checked) for
diagnose_notch_area_fraction.py, added alongside the lever #1 diagnose
step (2026-07-26 session). Two fixtures:

- test_single_clean_notch_area_matches_analytic: a simple one-notch room,
  checked against the exact analytic notch-area/room-area ratio.
- test_zigzag_grouping_collapses_crossbar_correctly: the SAME adversarial
  geometry as test_measure_clean_at_source.py's
  test_zigzag_multi_edge_notch_all_suppress_and_room_closes (plan 12017's
  real pattern -- two doors, each producing a riser/crossbar/riser triple
  where the crossbar independently heals above COVERAGE_THRESHOLD and so
  is never itself notch-flagged). A single clean-notch fixture would never
  exercise the matched-opening grouping logic at all -- it's the part most
  likely to be wrong, since ring-adjacency-of-flagged-edges alone would
  silently drop the healed crossbar and fragment each notch in two.
"""
from shapely.geometry import MultiPolygon, Polygon, box

from extraction.synth.qa.diagnose_notch_area_fraction import check_plan

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


def test_single_clean_notch_area_matches_analytic():
    # One rectangular notch (width 4, depth WALL_DEPTH) on the bottom wall
    # of a 40x30 room -- room area = 1200 (base rectangle) + 16 (notch
    # pocket, 4 wide x 4 deep) = 1216. The notch pocket's own area exactly
    # equals the door's own footprint (a purely rectangular cut by
    # construction here), so this is a clean analytic check, not just an
    # internally-consistent one.
    # Room is 40x30 (not smaller) for the same reason
    # test_measure_clean_at_source.py's fixtures needed widening: at
    # ink_proximity=12 (TOLERANCE+wall_depth/2, x3), a smaller room's
    # opposite walls fall within proximity range of the notch risers and
    # spuriously "cover" them (documented small-room/thick-wall
    # proximity-bleed pattern, docs/session-notes/p3a-handoff.md issue #5).
    ring = [(0, 0), (16, 0), (16, -WALL_DEPTH), (20, -WALL_DEPTH), (20, 0), (40, 0), (40, 30), (0, 30), (0, 0)]
    room = Polygon(ring)
    door = box(16, -WALL_DEPTH, 20, 0)
    outer = box(-WALL_DEPTH, -WALL_DEPTH, 40 + WALL_DEPTH, 30 + WALL_DEPTH)
    wall = outer.difference(room).difference(door)
    plan = _plan(wall, room, door=MultiPolygon([door]), inner=MultiPolygon([outer]))

    records = check_plan(plan)
    assert len(records) == 1
    rec = records[0]
    assert rec["room_type"] == "bedroom"
    assert rec["n_notch_runs"] == 1
    assert rec["n_outward_anomaly"] == 0
    assert rec["n_degenerate"] == 0
    assert rec["other_broken"] is False

    expected_room_area = 1216.0
    expected_notch_area = door.area  # 16.0
    assert rec["room_area"] == expected_room_area
    assert abs(rec["total_notch_area"] - expected_notch_area) < 1e-6
    assert abs(rec["fraction"] - expected_notch_area / expected_room_area) < 1e-6


def test_zigzag_grouping_collapses_crossbar_correctly():
    # Identical geometry to test_measure_clean_at_source.py's
    # test_zigzag_multi_edge_notch_all_suppress_and_room_closes: two doors
    # close together on the same wall run, each producing 2 riser edges
    # (perpendicular, stay unbacked -> notch-flagged) plus 1 crossbar edge
    # (parallel to the wall run -> healed by fill_openings_into_wall's
    # union, backed on its own, never itself a notch candidate). Correct
    # grouping must still pull each door's crossbar into that door's own
    # pocket span (via the shared matched-opening key, not ring-adjacency
    # of flagged edges) and must NOT merge the two doors into one pocket.
    ring = [
        (0, 0), (10, 0), (10, -WALL_DEPTH), (16, -WALL_DEPTH), (16, 0),
        (26, 0), (26, -WALL_DEPTH), (32, -WALL_DEPTH), (32, 0),
        (50, 0), (50, 30), (0, 30), (0, 0),
    ]
    room = Polygon(ring)
    door1 = box(10, -WALL_DEPTH, 16, 0)
    door2 = box(26, -WALL_DEPTH, 32, 0)
    outer = box(-WALL_DEPTH, -WALL_DEPTH, 50 + WALL_DEPTH, 30 + WALL_DEPTH)
    wall = outer.difference(room).difference(door1).difference(door2)
    plan = _plan(wall, room, door=MultiPolygon([door1, door2]), inner=MultiPolygon([outer]))

    records = check_plan(plan)
    assert len(records) == 1
    rec = records[0]
    # Two separate pockets (one per door), not one merged run and not four
    # fragmented single-edge runs.
    assert rec["n_notch_runs"] == 2
    assert rec["n_outward_anomaly"] == 0
    assert rec["n_degenerate"] == 0
    assert rec["other_broken"] is False

    expected_notch_area = door1.area + door2.area  # 24 + 24 = 48
    assert abs(rec["total_notch_area"] - expected_notch_area) < 1e-6
    assert abs(rec["fraction"] - expected_notch_area / rec["room_area"]) < 1e-6
