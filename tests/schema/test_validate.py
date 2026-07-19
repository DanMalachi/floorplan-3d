"""Validator correctness tests (docs/extraction-plan.md Phase 0.2 exit bar):
a hand-built valid fixture must pass; each of five mutation classes
(broken cycle, floating opening, dangling junction, negative thickness,
unresolved ID) must be caught, exercised via hypothesis over which
element the mutation targets so it's not just five fixed cases.
"""

import copy

from hypothesis import given, strategies as st

from extraction.schema.validate import validity


def valid_plan() -> dict:
    walls = [
        {
            "id": "w1", "start": [0.0, 0.0], "end": [4000.0, 0.0],
            "thickness": 200.0, "curvature": 0.0, "role": "external",
            "openings": [
                {
                    "id": "o1", "class": "door", "center_offset": 2000.0, "width": 900.0,
                    "sill_height": 0.0, "head_height": 2100.0, "swing": "left",
                    "confidence": 0.99, "evidence": ["detector"], "flags": [],
                }
            ],
            "confidence": 0.99, "evidence": ["segmentation"], "flags": [],
        },
        {
            "id": "w2", "start": [4000.0, 0.0], "end": [4000.0, 3000.0],
            "thickness": 200.0, "curvature": 0.0, "role": "external",
            "openings": [], "confidence": 0.99, "evidence": ["segmentation"], "flags": [],
        },
        {
            "id": "w3", "start": [4000.0, 3000.0], "end": [0.0, 3000.0],
            "thickness": 200.0, "curvature": 0.0, "role": "external",
            "openings": [], "confidence": 0.99, "evidence": ["segmentation"], "flags": [],
        },
        {
            "id": "w4", "start": [0.0, 3000.0], "end": [0.0, 0.0],
            "thickness": 200.0, "curvature": 0.0, "role": "rail",
            "openings": [], "confidence": 0.99, "evidence": ["segmentation"], "flags": [],
        },
    ]
    junctions = [
        {"id": "j1", "point": [0.0, 0.0], "type": "L", "walls": ["w4", "w1"]},
        {"id": "j2", "point": [4000.0, 0.0], "type": "L", "walls": ["w1", "w2"]},
        {"id": "j3", "point": [4000.0, 3000.0], "type": "L", "walls": ["w2", "w3"]},
        {"id": "j4", "point": [0.0, 3000.0], "type": "L", "walls": ["w3", "w4"]},
    ]
    rooms = [
        {
            "id": "r1", "label": "living_room", "label_confidence": 0.9,
            "wall_cycle": ["w1", "w2", "w3", "w4"], "area": 12.0, "confidence": 0.95,
        }
    ]
    diagnostics = {
        "tier": 1, "unresolved": [],
        "render_agreement": {"wall_iou": 1.0, "unexplained_ink_ratio": 0.0, "hallucinated_ink_ratio": 0.0},
        "kill_log_ref": "none", "pipeline_version": "test", "timings_ms": {}, "cost_usd": 0.0,
    }
    return {
        "schema_version": "1.0",
        "source": {
            "file_sha256": "0" * 64, "filename": "fixture.pdf", "encoding_class": "V",
            "convention_class": "single_stroke", "scope_class": "single", "router_confidence": 0.99,
        },
        "units": {"system": "mm", "mm_per_unit": 1.0, "scale_confidence": 0.99, "scale_source": "dimension_text",
                   "scale_inliers": 4, "scale_outliers": 0},
        "image_transform": {"type": "similarity", "matrix": [[1, 0, 0], [0, 1, 0], [0, 0, 1]], "source_px": [2480, 1754]},
        "walls": walls, "junctions": junctions, "rooms": rooms, "diagnostics": diagnostics,
    }


def test_valid_fixture_passes():
    result = validity(valid_plan())
    assert result.valid, result.errors


def test_rail_role_closes_cycle_like_any_wall():
    # w4 in the fixture is role="rail" and is load-bearing in r1's wall_cycle
    # closure — confirms rails aren't special-cased out of topology checks.
    plan = valid_plan()
    assert plan["walls"][3]["role"] == "rail"
    result = validity(plan)
    assert result.valid, result.errors


def _break_cycle(plan: dict, wall_idx: int) -> dict:
    plan["walls"][wall_idx]["end"] = [
        plan["walls"][wall_idx]["end"][0] + 500.0,
        plan["walls"][wall_idx]["end"][1] + 500.0,
    ]
    return plan


def _float_opening(plan: dict, wall_idx: int) -> dict:
    wall = plan["walls"][wall_idx]
    if not wall["openings"]:
        wall["openings"].append({
            "id": "o_float", "class": "window", "center_offset": 100.0, "width": 400.0,
            "sill_height": 900.0, "head_height": 2100.0, "swing": None,
            "confidence": 0.9, "evidence": ["detector"], "flags": [],
        })
    wall["openings"][0]["center_offset"] = 1_000_000.0  # far outside any wall span
    return plan


def _dangle_junction(plan: dict, junction_idx: int) -> dict:
    j = plan["junctions"][junction_idx]
    j["point"] = [j["point"][0] + 999.0, j["point"][1] + 999.0]
    return plan


def _negative_thickness(plan: dict, wall_idx: int) -> dict:
    plan["walls"][wall_idx]["thickness"] = -50.0
    return plan


def _unresolved_id(plan: dict, room_idx: int) -> dict:
    plan["rooms"][room_idx]["wall_cycle"].append("w_does_not_exist")
    return plan


MUTATIONS = {
    "break_cycle": (_break_cycle, 4),
    "float_opening": (_float_opening, 4),
    "dangle_junction": (_dangle_junction, 4),
    "negative_thickness": (_negative_thickness, 4),
    "unresolved_id": (_unresolved_id, 1),
}


@given(
    mutation=st.sampled_from(list(MUTATIONS.keys())),
    data=st.data(),
)
def test_each_mutation_class_is_caught(mutation, data):
    fn, count = MUTATIONS[mutation]
    idx = data.draw(st.integers(min_value=0, max_value=count - 1))
    plan = fn(copy.deepcopy(valid_plan()), idx)
    result = validity(plan)
    assert not result.valid, f"mutation {mutation!r} (idx={idx}) was not caught"
