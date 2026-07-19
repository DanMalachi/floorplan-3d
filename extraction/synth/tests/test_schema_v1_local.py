import pytest
from pydantic import ValidationError

from extraction.synth.schema_v1_local import (
    Diagnostics,
    ImageTransform,
    Junction,
    Opening,
    PlanV1,
    RenderAgreement,
    Room,
    SourceInfo,
    Units,
    Wall,
    validate_plan_v1,
)


def _diagnostics(**overrides) -> Diagnostics:
    base = dict(
        tier=1,
        unresolved=[],
        render_agreement=RenderAgreement(
            wall_iou=1.0, unexplained_ink_ratio=0.0, hallucinated_ink_ratio=0.0
        ),
        pipeline_version="test",
    )
    base.update(overrides)
    return Diagnostics(**base)


def _source() -> SourceInfo:
    return SourceInfo(
        file_sha256="0" * 64,
        filename="fixture.pkl",
        encoding_class="V",
        convention_class="single_stroke",
        scope_class="single",
        router_confidence=1.0,
    )


def _units() -> Units:
    return Units(system="plan_units", scale_confidence=0.0)


def _identity_transform() -> ImageTransform:
    return ImageTransform(
        type="similarity",
        matrix=[[1, 0, 0], [0, 1, 0], [0, 0, 1]],
        source_px=(256, 256),
    )


def _square_room_plan(*, door_offset: float = 5.0, door_width: float = 1.0) -> PlanV1:
    """A closed 10x10 square room, four walls, one door on the bottom wall."""
    walls = [
        Wall(
            id="w_000", start=(0, 0), end=(10, 0), thickness=0.3, role="external",
            confidence=1.0,
            openings=[
                Opening(
                    id="o_000", **{"class": "door"}, center_offset=door_offset,
                    width=door_width, confidence=1.0,
                )
            ],
        ),
        Wall(id="w_001", start=(10, 0), end=(10, 10), thickness=0.3, role="external", confidence=1.0),
        Wall(id="w_002", start=(10, 10), end=(0, 10), thickness=0.3, role="external", confidence=1.0),
        Wall(id="w_003", start=(0, 10), end=(0, 0), thickness=0.3, role="external", confidence=1.0),
    ]
    junctions = [
        Junction(id="j_000", point=(0, 0), type="L", walls=["w_000", "w_003"]),
        Junction(id="j_001", point=(10, 0), type="L", walls=["w_000", "w_001"]),
        Junction(id="j_002", point=(10, 10), type="L", walls=["w_001", "w_002"]),
        Junction(id="j_003", point=(0, 10), type="L", walls=["w_002", "w_003"]),
    ]
    rooms = [
        Room(
            id="r_000", label="living", label_confidence=1.0,
            wall_cycle=["w_000", "w_001", "w_002", "w_003"], area=100.0, confidence=1.0,
        )
    ]
    return PlanV1(
        source=_source(), units=_units(), image_transform=_identity_transform(),
        walls=walls, junctions=junctions, rooms=rooms, diagnostics=_diagnostics(),
    )


def test_valid_plan_round_trips_and_validates_clean():
    plan = _square_room_plan()
    dumped = plan.model_dump(by_alias=True)
    reloaded = PlanV1.model_validate(dumped)
    assert reloaded == plan
    assert validate_plan_v1(plan) == []


def test_rail_role_accepted():
    walls = [
        Wall(id="w_000", start=(0, 0), end=(10, 0), thickness=0.2, role="rail", confidence=1.0),
    ]
    # role="rail" must not raise — it's the P3a addition beyond Appendix A's enum.
    assert walls[0].role == "rail"


def test_invalid_role_rejected():
    with pytest.raises(ValidationError):
        Wall(id="w_000", start=(0, 0), end=(10, 0), thickness=0.2, role="not_a_real_role", confidence=1.0)


def test_zero_thickness_rejected():
    with pytest.raises(ValidationError):
        Wall(id="w_000", start=(0, 0), end=(10, 0), thickness=0.0, role="internal", confidence=1.0)


def test_opening_exceeding_wall_bounds_flagged():
    plan = _square_room_plan(door_offset=9.8, door_width=1.0)  # hi = 10.3 > wall_length=10
    problems = validate_plan_v1(plan)
    assert any("exceeds wall_length" in p for p in problems)


def test_sibling_opening_overlap_flagged():
    walls = [
        Wall(
            id="w_000", start=(0, 0), end=(10, 0), thickness=0.3, role="external", confidence=1.0,
            openings=[
                Opening(id="o_000", **{"class": "door"}, center_offset=4.0, width=2.0, confidence=1.0),
                Opening(id="o_001", **{"class": "window"}, center_offset=5.0, width=2.0, confidence=1.0),
            ],
        ),
    ]
    plan = PlanV1(
        source=_source(), units=_units(), image_transform=_identity_transform(),
        walls=walls,
        junctions=[Junction(id="j_000", point=(0, 0), type="end", walls=["w_000"])],
        rooms=[],
        diagnostics=_diagnostics(),
    )
    problems = validate_plan_v1(plan)
    assert any("overlap" in p for p in problems)


def test_junction_not_at_wall_endpoint_flagged():
    walls = [Wall(id="w_000", start=(0, 0), end=(10, 0), thickness=0.3, role="external", confidence=1.0)]
    junctions = [Junction(id="j_000", point=(5, 5), type="end", walls=["w_000"])]  # not an endpoint
    plan = PlanV1(
        source=_source(), units=_units(), image_transform=_identity_transform(),
        walls=walls, junctions=junctions, rooms=[], diagnostics=_diagnostics(),
    )
    problems = validate_plan_v1(plan)
    assert any("does not coincide" in p for p in problems)


def test_broken_room_cycle_flagged():
    walls = [
        Wall(id="w_000", start=(0, 0), end=(10, 0), thickness=0.3, role="external", confidence=1.0),
        Wall(id="w_001", start=(20, 20), end=(30, 20), thickness=0.3, role="external", confidence=1.0),
        Wall(id="w_002", start=(30, 20), end=(20, 30), thickness=0.3, role="external", confidence=1.0),
    ]
    rooms = [
        Room(
            id="r_000", label=None, label_confidence=0.0,
            wall_cycle=["w_000", "w_001", "w_002"], area=1.0, confidence=1.0,
        )
    ]
    plan = PlanV1(
        source=_source(), units=_units(), image_transform=_identity_transform(),
        walls=walls, junctions=[], rooms=rooms, diagnostics=_diagnostics(),
    )
    problems = validate_plan_v1(plan)
    assert any("not closed" in p for p in problems)


def test_unknown_wall_reference_flagged():
    walls = [Wall(id="w_000", start=(0, 0), end=(10, 0), thickness=0.3, role="external", confidence=1.0)]
    junctions = [Junction(id="j_000", point=(0, 0), type="end", walls=["w_999"])]
    plan = PlanV1(
        source=_source(), units=_units(), image_transform=_identity_transform(),
        walls=walls, junctions=junctions, rooms=[], diagnostics=_diagnostics(),
    )
    problems = validate_plan_v1(plan)
    assert any("unknown wall w_999" in p for p in problems)


def test_tier1_requires_empty_unresolved():
    with pytest.raises(ValidationError):
        _diagnostics(tier=1, unresolved=[{"element": "w_000", "question_id": "q1", "crop_bbox_px": [0, 0, 1, 1]}])


def test_units_mm_requires_ratio():
    with pytest.raises(ValidationError):
        Units(system="mm", scale_confidence=0.5)
