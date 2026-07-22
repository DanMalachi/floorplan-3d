"""PyMuPDF vector-layer dissection -- faithful structural extraction only.

No interpretation happens here: this module never decides what is or is not
a wall. It turns a PDF/image's raw drawing operations into VectorPrimitive
records (paper Sec. 3.7 / 5.2 item 1's "parse all primitives with exact
coordinates" step, before any classification).
"""

from __future__ import annotations

from pathlib import Path

import fitz

from extraction.trackv.primitives import PageDissection, Point2, Segment, VectorPrimitive

_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp"}

# Two points authored from the same underlying path coordinates compare
# exactly equal in practice (verified against real corpus PDFs); this
# epsilon only guards against incidental float noise, not a real gap.
_CONTINUITY_EPS = 1e-6


def _same_point(a: Point2, b: Point2) -> bool:
    return abs(a[0] - b[0]) <= _CONTINUITY_EPS and abs(a[1] - b[1]) <= _CONTINUITY_EPS


def _rect_loop(r) -> list[Point2]:
    return [(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)]


def _quad_loop(q) -> list[Point2]:
    return [(q.ul.x, q.ul.y), (q.ur.x, q.ur.y), (q.lr.x, q.lr.y), (q.ll.x, q.ll.y)]


def _loop_segments(corners: list[Point2]) -> list[Segment]:
    loop = corners + [corners[0]]
    return [("l", (a, b)) for a, b in zip(loop, loop[1:])]


def _extract_subpaths(items: list) -> tuple[list[list[Segment]], set[str]]:
    """Split a drawing's raw items into subpaths.

    PyMuPDF's get_drawings() "items" list concatenates every subpath of a
    compound path (e.g. a glyph's outer contour + inner counter-hole, or a
    wall polygon with a courtyard hole) with no explicit move-to marker --
    a subpath boundary is a *discontinuity*: the point where one item's end
    doesn't match the next item's start. "re"/"qu" items are each already a
    complete standalone closed loop, so they always start (and end) their
    own subpath rather than joining a neighbor.
    """
    subpaths: list[list[Segment]] = []
    kinds: set[str] = set()
    current: list[Segment] = []
    last_point: Point2 | None = None

    def flush() -> None:
        nonlocal current
        if current:
            subpaths.append(current)
            current = []

    for it in items:
        op = it[0]
        kinds.add(op)
        if op == "l":
            p0, p1 = (it[1].x, it[1].y), (it[2].x, it[2].y)
            if last_point is not None and not _same_point(p0, last_point):
                flush()
            current.append(("l", (p0, p1)))
            last_point = p1
        elif op == "c":
            pts = tuple((p.x, p.y) for p in it[1:5])
            if last_point is not None and not _same_point(pts[0], last_point):
                flush()
            current.append(("c", pts))
            last_point = pts[-1]
        elif op == "re":
            flush()
            subpaths.append(_loop_segments(_rect_loop(it[1])))
            last_point = None
        elif op == "qu":
            flush()
            subpaths.append(_loop_segments(_quad_loop(it[1])))
            last_point = None
    flush()
    return subpaths, kinds


def _classify_kind(kinds: set[str]) -> str:
    if kinds == {"re"}:
        return "rect"
    if kinds == {"qu"}:
        return "quad"
    if "c" in kinds:
        return "curve"
    return "line"


def dissect(path: Path) -> list[PageDissection]:
    """Parse every page of path into its raw vector primitives.

    Works uniformly for PDFs and raster images (PyMuPDF opens an image as a
    1-page document with an empty drawing list) -- no special-cased branch
    for the image case, it falls out of the same code at zero primitives.
    """
    doc = fitz.open(path)
    source_kind = "image" if Path(path).suffix.lower() in _IMAGE_SUFFIXES else "pdf"
    pages: list[PageDissection] = []
    for page_index in range(doc.page_count):
        page = doc[page_index]
        drawings = page.get_drawings()
        n_images = len(page.get_images())
        primitives: list[VectorPrimitive] = []
        for dr in drawings:
            subpaths, kinds = _extract_subpaths(dr.get("items", []))
            if not subpaths:
                continue
            primitives.append(
                VectorPrimitive(
                    kind=_classify_kind(kinds),
                    subpaths=subpaths,
                    stroke_width=dr.get("width"),
                    stroke_color=dr.get("color"),
                    fill_color=dr.get("fill"),
                    closed=bool(dr.get("closePath")),
                    even_odd=bool(dr.get("even_odd")),
                    layer=dr.get("layer") or None,
                )
            )
        pages.append(
            PageDissection(
                page_index=page_index,
                page_size_px=(page.rect.width, page.rect.height),
                primitives=primitives,
                n_images=n_images,
                source_kind=source_kind,
            )
        )
    doc.close()
    return pages
