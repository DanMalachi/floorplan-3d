# TEMPORARY duplicate of extraction/schema/ (Phase 0's job, extraction-plan.md
# §0.2). Phase 3a runs with "no P0 dependency" and is explicitly allowed a
# temporary local copy ("Uses temporary copies of the metric code if P0 isn't
# merged yet; reconcile on rebase" — extraction-plan.md line 76).
#
# Deviation from paper.md Appendix A: wall.role adds "rail" (Appendix A only
# lists external|internal|partition_low|glazing|demising|unconfirmed). This
# was a deliberate decision confirmed with Dan on 2026-07-19: docs/DATA_RIGHTS.md
# documents that this app's established tracing convention treats balcony/
# terrace boundaries as a first-class `rail` category, and ResPlan's `balcony`
# element maps directly onto it. Flag this for Phase 0 to adopt into the
# frozen schema — don't silently let it diverge.
#
# RECONCILE WITH extraction/schema/extraction_v1.schema.json AFTER THE PHASE 0
# GATE. Delete this file (or reduce it to a re-export) once that lands.

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

SCHEMA_VERSION = "1.0"

EncodingClass = Literal["V", "R", "P", "S"]
ConventionClass = Literal["poche", "double_line", "single_stroke", "colored", "hatched", "mixed"]
ScopeClass = Literal["single", "unit_in_plate", "plate", "multi_floor"]
UnitsSystem = Literal["mm", "plan_units"]
ScaleSource = Literal["dimension_text", "scale_bar", "stated_ratio", "door_prior"]
TransformType = Literal["similarity", "homography"]
# NOTE: "rail" is the P3a addition described above — not in paper.md Appendix A.
WallRole = Literal["external", "internal", "partition_low", "glazing", "demising", "unconfirmed", "rail"]
OpeningClass = Literal["door", "window", "passage"]
Swing = Literal["left", "right", "double", "sliding", "folding", "unknown"]
JunctionType = Literal["L", "T", "X", "I", "end"]
Tier = Literal[1, 2, 3, 4]

Point2 = tuple[float, float]


class SourceInfo(BaseModel):
    file_sha256: str
    filename: str
    encoding_class: EncodingClass
    convention_class: ConventionClass
    scope_class: ScopeClass
    router_confidence: float = Field(ge=0.0, le=1.0)


class Units(BaseModel):
    system: UnitsSystem
    mm_per_unit: Optional[float] = None
    scale_confidence: float = Field(ge=0.0, le=1.0)
    scale_source: Optional[ScaleSource] = None
    scale_inliers: int = 0
    scale_outliers: int = 0

    @model_validator(mode="after")
    def _mm_requires_ratio(self) -> "Units":
        if self.system == "mm" and self.mm_per_unit is None:
            raise ValueError("units.mm_per_unit is required when system=='mm'")
        return self


class ImageTransform(BaseModel):
    type: TransformType
    matrix: list[list[float]]  # 3x3 homogeneous
    source_px: tuple[int, int]  # [W, H]

    @model_validator(mode="after")
    def _matrix_shape(self) -> "ImageTransform":
        if len(self.matrix) != 3 or any(len(row) != 3 for row in self.matrix):
            raise ValueError("image_transform.matrix must be 3x3")
        return self


class Opening(BaseModel):
    id: str
    class_: OpeningClass = Field(alias="class")
    center_offset: float
    width: float = Field(gt=0.0)
    sill_height: Optional[float] = None
    head_height: Optional[float] = None
    swing: Optional[Swing] = None
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: list[str] = Field(default_factory=list)
    flags: list[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class Wall(BaseModel):
    id: str
    start: Point2
    end: Point2
    thickness: float = Field(gt=0.0)
    curvature: float = 0.0
    role: WallRole
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: list[str] = Field(default_factory=list)
    flags: list[str] = Field(default_factory=list)
    openings: list[Opening] = Field(default_factory=list)

    @property
    def length(self) -> float:
        (x1, y1), (x2, y2) = self.start, self.end
        return ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5


class Junction(BaseModel):
    id: str
    point: Point2
    type: JunctionType
    walls: list[str] = Field(default_factory=list)


class Room(BaseModel):
    id: str
    label: Optional[str] = None
    label_confidence: float = Field(ge=0.0, le=1.0)
    wall_cycle: list[str] = Field(min_length=3)
    area: float = Field(ge=0.0)
    confidence: float = Field(ge=0.0, le=1.0)


class RenderAgreement(BaseModel):
    wall_iou: float = Field(ge=0.0, le=1.0)
    unexplained_ink_ratio: float = Field(ge=0.0, le=1.0)
    hallucinated_ink_ratio: float = Field(ge=0.0, le=1.0)


class Diagnostics(BaseModel):
    tier: Tier
    unresolved: list[dict] = Field(default_factory=list)
    render_agreement: RenderAgreement
    kill_log_ref: Optional[str] = None
    pipeline_version: str
    timings_ms: dict[str, float] = Field(default_factory=dict)
    cost_usd: float = 0.0

    @model_validator(mode="after")
    def _tier1_requires_clean(self) -> "Diagnostics":
        if self.tier == 1 and self.unresolved:
            raise ValueError("diagnostics.tier==1 requires unresolved==[]")
        return self


class PlanV1(BaseModel):
    schema_version: str = SCHEMA_VERSION
    source: SourceInfo
    units: Units
    image_transform: ImageTransform
    walls: list[Wall]
    junctions: list[Junction]
    rooms: list[Room]
    diagnostics: Diagnostics


# ---------------------------------------------------------------------------
# Independent validator — mirrors the subset of Appendix A's validator rules
# that matter for P3a's synthetic GT. Not a substitute for Phase 0's real
# extraction/schema/validate.py; reconcile after the P0 gate.
# ---------------------------------------------------------------------------

_EPS_DEFAULT = 1e-3


def _dist(a: Point2, b: Point2) -> float:
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5


def validate_plan_v1(plan: PlanV1, *, junction_eps: float = _EPS_DEFAULT) -> list[str]:
    """Returns a list of human-readable validation problems (empty == valid).

    Checks implemented (subset of Appendix A's footer rules relevant to P3a):
      - thickness > 0 (enforced by pydantic Field already; re-checked for clarity)
      - every opening: 0 < center_offset ± width/2 < wall_length
      - sibling openings on the same wall do not overlap
      - every junction's walls actually terminate at its point within eps
      - all wall_cycle / junction.walls ids resolve to real walls
      - room wall_cycle forms a closed chain (each consecutive pair, incl.
        wrap-around, shares an endpoint within eps)
    """
    problems: list[str] = []
    wall_by_id = {w.id: w for w in plan.walls}

    # --- openings: bounds + sibling overlap ---
    for w in plan.walls:
        spans: list[tuple[float, float, str]] = []
        for o in w.openings:
            lo = o.center_offset - o.width / 2
            hi = o.center_offset + o.width / 2
            if lo <= 0 or hi >= w.length:
                problems.append(
                    f"opening {o.id} on wall {w.id}: span [{lo:.3f},{hi:.3f}] "
                    f"exceeds wall_length={w.length:.3f}"
                )
            spans.append((lo, hi, o.id))
        spans.sort()
        for (lo1, hi1, id1), (lo2, hi2, id2) in zip(spans, spans[1:]):
            if hi1 > lo2:
                problems.append(f"openings {id1} and {id2} on wall {w.id} overlap")

    # --- junctions: ids resolve + walls terminate at the junction point ---
    for j in plan.junctions:
        for wid in j.walls:
            w = wall_by_id.get(wid)
            if w is None:
                problems.append(f"junction {j.id} references unknown wall {wid}")
                continue
            if _dist(j.point, w.start) > junction_eps and _dist(j.point, w.end) > junction_eps:
                problems.append(
                    f"junction {j.id} at {j.point} does not coincide with an "
                    f"endpoint of wall {wid} (start={w.start}, end={w.end})"
                )

    # --- rooms: wall_cycle ids resolve + forms a closed chain ---
    for r in plan.rooms:
        walls_in_cycle = []
        for wid in r.wall_cycle:
            w = wall_by_id.get(wid)
            if w is None:
                problems.append(f"room {r.id} wall_cycle references unknown wall {wid}")
            else:
                walls_in_cycle.append(w)
        if len(walls_in_cycle) != len(r.wall_cycle):
            continue  # already reported unresolved ids above

        n = len(walls_in_cycle)
        for i in range(n):
            a = walls_in_cycle[i]
            b = walls_in_cycle[(i + 1) % n]
            a_ends = (a.start, a.end)
            b_ends = (b.start, b.end)
            shares_endpoint = any(
                _dist(pa, pb) <= junction_eps for pa in a_ends for pb in b_ends
            )
            if not shares_endpoint:
                problems.append(
                    f"room {r.id} wall_cycle not closed: {a.id} and "
                    f"{b.id} (positions {i},{(i + 1) % n}) share no endpoint"
                )

    return problems
