"""Raw vector-primitive intermediate for Track V dissection.

Deliberately distinct from extraction/schema/models.py's Wall/ExtractionResult
-- this is unlabeled, uninterpreted PDF vector-layer output, not extraction
schema output. Nothing here classifies a primitive as a wall or anything else.
"""

from __future__ import annotations

from dataclasses import dataclass, field

Point2 = tuple[float, float]

# One drawing command within a subpath: a straight line ("l", (p0, p1)) or a
# cubic bezier ("c", (p0, c1, c2, p3)). Kept un-flattened (rather than reduced
# to bare points) so a subpath with interleaved line/curve segments -- e.g. a
# glyph's rounded counter -- redraws faithfully instead of collapsing to a
# single spurious bezier.
Segment = tuple[str, tuple[Point2, ...]]

# PyMuPDF's own drawing op codes, one primitive per get_drawings() entry:
# "line" (op 'l'), "curve" (op 'c', bezier), "rect" (op 're'), "quad" (op 'qu').
PrimitiveKind = str


@dataclass
class VectorPrimitive:
    kind: PrimitiveKind
    # A drawing's raw "items" list is one or more subpaths concatenated with
    # no move-to marker; each inner list here is one subpath's segments, kept
    # separate so compound paths (glyphs with counters, filled door-swings,
    # wall polygons with courtyard holes) preserve their true contour
    # structure through dissection and redraw.
    subpaths: list[list[Segment]]
    stroke_width: float | None
    stroke_color: tuple[float, float, float] | None
    fill_color: tuple[float, float, float] | None
    closed: bool
    # PDF fill-rule bit (nonzero winding vs even-odd) -- governs whether an
    # inner subpath renders as a hole. Carried through so compound-fill
    # redraws match the source's actual hole semantics.
    even_odd: bool
    layer: str | None


@dataclass
class PageDissection:
    page_index: int
    page_size_px: tuple[float, float]
    primitives: list[VectorPrimitive] = field(default_factory=list)
    n_images: int = 0
    source_kind: str = "pdf"  # "pdf" | "image"
