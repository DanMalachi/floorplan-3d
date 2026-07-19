"""Pydantic mirror of extraction_v1.schema.json (docs/paper.md Appendix A).

Kept in lockstep with the JSON Schema by hand — both are exercised by
tests/schema/test_validate.py. If they drift, that test's round-trip
comparison is where it will surface.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Point2 = tuple[float, float]

EncodingClass = Literal["V", "R", "P", "S"]
ConventionClass = Literal["poche", "double_line", "single_stroke", "colored", "hatched", "mixed"]
ScopeClass = Literal["single", "unit_in_plate", "plate", "multi_floor"]
UnitSystem = Literal["mm", "plan_units"]
ScaleSource = Literal["dimension_text", "scale_bar", "stated_ratio", "door_prior"] | None
TransformType = Literal["similarity", "homography"]

# 'rail' mirrors the product schema's Wall.kind (see docs/PROTECTED_PATHS.md /
# src/schema/scene.ts): a low, see-through boundary (balcony railing, glass
# balustrade, low parapet). Rails participate in junctions and wall_cycles
# exactly like any other role — closure is topology, not construction. A
# balcony is a closed cycle of rail walls + the building wall it attaches to,
# room-labeled "balcony". Never conflate with a portal (no wall element at
# all) even though both close rooms the same way.
WallRole = Literal["external", "internal", "partition_low", "glazing", "demising", "unconfirmed", "rail"]

OpeningClass = Literal["door", "window", "passage"]
Swing = Literal["left", "right", "double", "sliding", "folding", "unknown"] | None
JunctionType = Literal["L", "T", "X", "I", "end"]
EvidenceSource = Literal[
    "segmentation", "vector", "topology", "render_check", "detector", "seg_gap", "vlm", "classical"
]
Tier = Literal[1, 2, 3, 4]


class Source(BaseModel):
    file_sha256: str
    filename: str
    encoding_class: EncodingClass
    convention_class: ConventionClass
    scope_class: ScopeClass
    router_confidence: float = Field(ge=0, le=1)


class Units(BaseModel):
    system: UnitSystem
    mm_per_unit: float | None = Field(default=None, gt=0)
    scale_confidence: float = Field(ge=0, le=1)
    scale_source: ScaleSource = None
    scale_inliers: int = Field(default=0, ge=0)
    scale_outliers: int = Field(default=0, ge=0)


class ImageTransform(BaseModel):
    type: TransformType
    matrix: tuple[
        tuple[float, float, float],
        tuple[float, float, float],
        tuple[float, float, float],
    ]
    source_px: tuple[int, int]


class Opening(BaseModel):
    id: str
    class_: OpeningClass = Field(alias="class")
    center_offset: float
    width: float = Field(gt=0)
    sill_height: float | None = None
    head_height: float | None = None
    swing: Swing = None
    confidence: float = Field(ge=0, le=1)
    evidence: list[EvidenceSource] = Field(default_factory=list)
    flags: list[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class Wall(BaseModel):
    id: str
    start: Point2
    end: Point2
    thickness: float = Field(gt=0)
    curvature: float = 0.0
    role: WallRole
    openings: list[Opening] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)
    evidence: list[EvidenceSource] = Field(default_factory=list)
    flags: list[str] = Field(default_factory=list)


class Junction(BaseModel):
    id: str
    point: Point2
    type: JunctionType
    walls: list[str] = Field(min_length=1)


class Room(BaseModel):
    id: str
    label: str | None = None
    label_confidence: float = Field(ge=0, le=1)
    wall_cycle: list[str] = Field(min_length=3)
    area: float = Field(ge=0)
    confidence: float = Field(ge=0, le=1)


class UnresolvedItem(BaseModel):
    element: str
    question_id: str
    crop_bbox_px: tuple[float, float, float, float]


class RenderAgreement(BaseModel):
    wall_iou: float = Field(ge=0, le=1)
    unexplained_ink_ratio: float = Field(ge=0, le=1)
    hallucinated_ink_ratio: float = Field(ge=0, le=1)


class Diagnostics(BaseModel):
    tier: Tier
    unresolved: list[UnresolvedItem] = Field(default_factory=list)
    render_agreement: RenderAgreement
    kill_log_ref: str
    pipeline_version: str
    timings_ms: dict[str, float] = Field(default_factory=dict)
    cost_usd: float = Field(ge=0)


class ExtractionResult(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    source: Source
    units: Units
    image_transform: ImageTransform
    walls: list[Wall] = Field(default_factory=list)
    junctions: list[Junction] = Field(default_factory=list)
    rooms: list[Room] = Field(default_factory=list)
    diagnostics: Diagnostics
