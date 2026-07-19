"""Validator correctness tests (docs/extraction-plan.md Phase 0.2 exit bar):
a hand-built valid fixture must pass; each of eight mutation classes
(broken cycle, floating opening, dangling junction, negative thickness,
unresolved ID, zone outside its room face, zero thickness on a
non-portal wall, floating portal) must be caught, exercised via
hypothesis over which element the mutation targets so it's not just
eight fixed cases.
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
            "zones": [
                {"label": "living", "polygon": [[500.0, 500.0], [1500.0, 500.0], [1500.0, 1500.0], [500.0, 1500.0]]},
                {"label": "dining", "polygon": [[2000.0, 500.0], [3500.0, 500.0], [3500.0, 2500.0], [2000.0, 2500.0]]},
            ],
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


def test_zones_within_room_face_pass():
    # r1's two zones (living, dining) are both fully inside the room's
    # wall_cycle face — an open-plan sub-area tagging must not be rejected.
    plan = valid_plan()
    assert len(plan["rooms"][0]["zones"]) == 2
    result = validity(plan)
    assert result.valid, result.errors


def triangle_plan_with_portal() -> dict:
    """A minimal, self-contained plan (not derived from valid_plan(), so it
    can't disturb the shared rectangle fixture) whose room closes via two
    real walls and one portal — the positive case for 'portals may close
    cycles'."""
    walls = [
        {
            "id": "wA", "start": [0.0, 0.0], "end": [3000.0, 0.0],
            "thickness": 200.0, "curvature": 0.0, "role": "external",
            "openings": [], "confidence": 0.95, "evidence": ["segmentation"], "flags": [],
        },
        {
            "id": "wB", "start": [3000.0, 0.0], "end": [1500.0, 2000.0],
            "thickness": 200.0, "curvature": 0.0, "role": "external",
            "openings": [], "confidence": 0.95, "evidence": ["segmentation"], "flags": [],
        },
        {
            # portal: closes the triangle back to wA's start with zero
            # thickness; both endpoints coincide with real (non-portal)
            # wall endpoints — wB's end and wA's start respectively.
            "id": "wC", "start": [1500.0, 2000.0], "end": [0.0, 0.0],
            "thickness": 0.0, "curvature": 0.0, "role": "portal",
            "openings": [], "confidence": 0.8, "evidence": ["topology"], "flags": [],
        },
    ]
    junctions = [
        {"id": "j1", "point": [0.0, 0.0], "type": "L", "walls": ["wC", "wA"]},
        {"id": "j2", "point": [3000.0, 0.0], "type": "L", "walls": ["wA", "wB"]},
        {"id": "j3", "point": [1500.0, 2000.0], "type": "L", "walls": ["wB", "wC"]},
    ]
    rooms = [
        {
            "id": "r_open", "label": "open_area", "label_confidence": 0.7,
            "wall_cycle": ["wA", "wB", "wC"], "area": 3.0, "confidence": 0.85, "zones": [],
        }
    ]
    diagnostics = {
        "tier": 2, "unresolved": [],
        "render_agreement": {"wall_iou": 1.0, "unexplained_ink_ratio": 0.0, "hallucinated_ink_ratio": 0.0},
        "kill_log_ref": "none", "pipeline_version": "test", "timings_ms": {}, "cost_usd": 0.0,
    }
    return {
        "schema_version": "1.0",
        "source": {
            "file_sha256": "1" * 64, "filename": "triangle.pdf", "encoding_class": "V",
            "convention_class": "single_stroke", "scope_class": "single", "router_confidence": 0.9,
        },
        "units": {"system": "mm", "mm_per_unit": 1.0, "scale_confidence": 0.9, "scale_source": "dimension_text",
                   "scale_inliers": 2, "scale_outliers": 0},
        "image_transform": {"type": "similarity", "matrix": [[1, 0, 0], [0, 1, 0], [0, 0, 1]], "source_px": [1000, 1000]},
        "walls": walls, "junctions": junctions, "rooms": rooms, "diagnostics": diagnostics,
    }


def test_portal_role_closes_cycle_like_any_wall():
    # wC is role="portal" (thickness 0) and is load-bearing in r_open's
    # wall_cycle closure — confirms portals aren't special-cased out of
    # topology checks, same guarantee as the rail test above.
    plan = triangle_plan_with_portal()
    assert plan["walls"][2]["role"] == "portal"
    result = validity(plan)
    assert result.valid, result.errors


def test_standalone_portal_touching_real_geometry_passes():
    # A portal whose endpoints exactly coincide with an existing real
    # wall's endpoints (here, w2's) is properly terminated even when it
    # isn't referenced by any junction or room — portals_terminate_on_
    # real_geometry checks the portal's own geometry, not its membership.
    plan = valid_plan()
    plan["walls"].append({
        "id": "w_portal", "start": [4000.0, 0.0], "end": [4000.0, 3000.0],
        "thickness": 0.0, "curvature": 0.0, "role": "portal",
        "openings": [], "confidence": 0.8, "evidence": ["topology"], "flags": [],
    })
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


def _zone_outside_room(plan: dict, zone_idx: int) -> dict:
    # push one vertex of the targeted zone polygon far outside the room's
    # wall_cycle face (the fixture room spans roughly x:[0,4000] y:[0,3000])
    plan["rooms"][0]["zones"][zone_idx]["polygon"][0] = [99999.0, 99999.0]
    return plan


def _zero_thickness_non_portal(plan: dict, wall_idx: int) -> dict:
    # all 4 walls in the base fixture are non-portal (external x3, rail x1)
    # — zero thickness is only legal for role="portal".
    plan["walls"][wall_idx]["thickness"] = 0.0
    return plan


def _float_portal(plan: dict, _idx: int) -> dict:
    # append a portal correctly terminated on w2's real endpoints, then
    # detach one end so it no longer touches any non-portal wall.
    plan["walls"].append({
        "id": "w_portal", "start": [4000.0, 0.0], "end": [4000.0, 3000.0],
        "thickness": 0.0, "curvature": 0.0, "role": "portal",
        "openings": [], "confidence": 0.8, "evidence": ["topology"], "flags": [],
    })
    plan["walls"][-1]["end"] = [9000.0, 9000.0]  # no longer coincides with anything real
    return plan


MUTATIONS = {
    "break_cycle": (_break_cycle, 4),
    "float_opening": (_float_opening, 4),
    "dangle_junction": (_dangle_junction, 4),
    "negative_thickness": (_negative_thickness, 4),
    "unresolved_id": (_unresolved_id, 1),
    "zone_outside_room": (_zone_outside_room, 2),
    "zero_thickness_non_portal": (_zero_thickness_non_portal, 4),
    "float_portal": (_float_portal, 1),
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
