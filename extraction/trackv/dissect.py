"""PyMuPDF vector-layer dissection -- faithful structural extraction only.

No interpretation happens here: this module never decides what is or is not
a wall. It turns a PDF/image's raw drawing operations into VectorPrimitive
records (paper Sec. 3.7 / 5.2 item 1's "parse all primitives with exact
coordinates" step, before any classification).
"""

from __future__ import annotations

from pathlib import Path

import fitz

from extraction.trackv.primitives import PageDissection, VectorPrimitive

_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp"}


def _flatten_items(items: list) -> tuple[list[tuple[float, float]], set[str]]:
    points: list[tuple[float, float]] = []
    kinds: set[str] = set()
    for it in items:
        op = it[0]
        kinds.add(op)
        if op == "l":
            points.append((it[1].x, it[1].y))
            points.append((it[2].x, it[2].y))
        elif op == "c":
            for p in it[1:5]:
                points.append((p.x, p.y))
        elif op == "re":
            r = it[1]
            points.extend([(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)])
        elif op == "qu":
            q = it[1]
            points.extend([(q.ul.x, q.ul.y), (q.ur.x, q.ur.y), (q.lr.x, q.lr.y), (q.ll.x, q.ll.y)])
    return points, kinds


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
            points, kinds = _flatten_items(dr.get("items", []))
            if not points:
                continue
            primitives.append(
                VectorPrimitive(
                    kind=_classify_kind(kinds),
                    points=points,
                    stroke_width=dr.get("width"),
                    stroke_color=dr.get("color"),
                    fill_color=dr.get("fill"),
                    closed=bool(dr.get("closePath")),
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
