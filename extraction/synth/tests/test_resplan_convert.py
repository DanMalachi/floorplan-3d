from shapely.geometry import MultiPolygon, box

from extraction.synth.resplan_convert import convert_plan, summarize


def _synthetic_resplan_plan() -> dict:
    """A minimal hand-built plan dict shaped like a real ResPlan entry: a
    10x10 living room + 10x10 bedroom separated by a real wall_depth-wide
    dividing wall with a door cut into it, a window cut into the bedroom's
    exterior wall, wrapped in a wall polygon with the door/window
    footprints already removed (matches ResPlan's real convention,
    verified: wall.intersection(door).area==0). The two room boxes must
    leave an actual wall_depth gap between them — tiling them edge-to-edge
    leaves no wall material for a dividing wall at all."""
    wall_depth = 0.3
    living = box(0, 0, 10, 10)
    bedroom = box(10 + wall_depth, 0, 20 + wall_depth, 10)
    outer = box(-wall_depth, -wall_depth, 20 + 2 * wall_depth, 10 + wall_depth)
    solid = outer.difference(living).difference(bedroom)

    door = box(10, 4.0, 10 + wall_depth, 6.0)  # in the dividing wall's gap
    window = box(20 + wall_depth, 3.0, 20 + 2 * wall_depth, 7.0)  # in the bedroom's exterior wall
    wall = solid.difference(door).difference(window)

    return {
        "id": 1,
        "wall": wall,
        "door": MultiPolygon([door]),
        "window": MultiPolygon([window]),
        "front_door": None,
        "living": living,
        "bedroom": bedroom,
        "bathroom": None,
        "kitchen": None,
        "storage": None,
        "stair": None,
        "balcony": None,
        "inner": MultiPolygon([outer]),
        "wall_depth": wall_depth,
    }


def test_convert_plan_produces_valid_schema():
    plan_v1, stats = convert_plan(_synthetic_resplan_plan())
    assert stats["ok"] is True
    assert plan_v1 is not None
    assert stats["validator_problems"] == []
    assert stats["n_walls"] > 0
    assert stats["n_openings"] == 2  # door + window
    assert stats["n_rooms"] == 2  # living + bedroom, both wall-enclosed


def test_convert_plan_handles_empty_wall():
    plan_v1, stats = convert_plan({"id": 2, "wall": None, "wall_depth": 4.0})
    assert plan_v1 is None
    assert stats["ok"] is False
    assert stats["reason"] == "empty_wall_geometry"


def test_convert_plan_never_raises_on_garbage_input():
    plan_v1, stats = convert_plan({"id": 3, "wall": "not_a_geometry", "wall_depth": 4.0})
    assert plan_v1 is None
    assert stats["ok"] is False
    assert stats["reason"].startswith("exception:")


def test_summarize_shape():
    _, stats1 = convert_plan(_synthetic_resplan_plan())
    _, stats2 = convert_plan({"id": 2, "wall": None, "wall_depth": 4.0})
    report = summarize([stats1, stats2], elapsed_s=1.0)
    assert report["n_plans"] == 2
    assert report["n_parsed_ok"] == 1
    assert 0.0 <= report["pct_clean"] <= 100.0
    assert "clean_definition" in report
