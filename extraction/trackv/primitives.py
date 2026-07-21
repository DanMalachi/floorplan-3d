"""Raw vector-primitive intermediate for Track V dissection.

Deliberately distinct from extraction/schema/models.py's Wall/ExtractionResult
-- this is unlabeled, uninterpreted PDF vector-layer output, not extraction
schema output. Nothing here classifies a primitive as a wall or anything else.
"""

from __future__ import annotations

from dataclasses import dataclass, field

Point2 = tuple[float, float]

# PyMuPDF's own drawing op codes, one primitive per get_drawings() entry:
# "line" (op 'l'), "curve" (op 'c', bezier), "rect" (op 're'), "quad" (op 'qu').
PrimitiveKind = str


@dataclass
class VectorPrimitive:
    kind: PrimitiveKind
    points: list[Point2]
    stroke_width: float | None
    stroke_color: tuple[float, float, float] | None
    fill_color: tuple[float, float, float] | None
    closed: bool
    layer: str | None


@dataclass
class PageDissection:
    page_index: int
    page_size_px: tuple[float, float]
    primitives: list[VectorPrimitive] = field(default_factory=list)
    n_images: int = 0
    source_kind: str = "pdf"  # "pdf" | "image"
