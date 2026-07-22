"""Ink-coverage test: does the extracted vector layer explain the page's ink?

Method (paper Sec. 3.7's router check, made concrete): rasterize the real
page and binarize to an ink mask; separately re-render *only* the extracted
primitives and binarize that. Two corrections on top of the naive AND:

- Text ink is never captured by get_drawings(), so it is detected via
  get_text() and *subtracted from the denominator* (never credited to the
  numerator) -- otherwise text-heavy-but-genuinely-vector plans (dimension
  chains, title blocks) would be unfairly punished. The 95% bar means "of
  the non-text ink, how much do extracted paths explain."
- The vector-render mask is dilated by a couple of pixels before the AND:
  a raw AND between two independently anti-aliased rasterizations of the
  same geometry shaves a few percent of edge noise off every plan, and that
  noise band overlaps the 95% decision line.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import cv2
import fitz
import numpy as np

from extraction.trackv.primitives import PageDissection

TRACK_V_COVERAGE_BAR = 0.95
DEFAULT_DPI = 150
DEFAULT_DILATE_PX = 2


@dataclass
class CoverageResult:
    page_index: int
    coverage: float
    text_ink_fraction: float
    ink_pixel_count: int
    explained_pixel_count: int
    routes_to: str
    flags: list[str] = field(default_factory=list)


def _binarize_ink(arr: np.ndarray) -> np.ndarray:
    _, mask = cv2.threshold(arr, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return mask > 0


def _rasterize_ink_mask(page: fitz.Page, dpi: int) -> np.ndarray:
    pix = page.get_pixmap(dpi=dpi, colorspace=fitz.csGRAY, alpha=False)
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
    return _binarize_ink(arr)


def _rasterize_text_mask(page: fitz.Page, dpi: int, shape: tuple[int, int]) -> np.ndarray:
    """Fill each text span's bbox -- coarser than glyph shape but a safe
    superset, matching the "never credited to the numerator" requirement
    (over-excluding non-text ink near a text span costs a few pixels of
    denominator, never affects correctness of the exclusion)."""
    scale = dpi / 72.0
    h, w = shape
    mask = np.zeros((h, w), dtype=bool)
    text = page.get_text("rawdict")
    for block in text.get("blocks", []):
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                x0, y0, x1, y1 = span["bbox"]
                px0 = max(0, min(w, round(x0 * scale)))
                px1 = max(0, min(w, round(x1 * scale)))
                py0 = max(0, min(h, round(y0 * scale)))
                py1 = max(0, min(h, round(y1 * scale)))
                px0, px1 = sorted((px0, px1))
                py0, py1 = sorted((py0, py1))
                if px1 > px0 and py1 > py0:
                    mask[py0:py1, px0:px1] = True
    return mask


def _rasterize_vector_mask(dissection: PageDissection, dpi: int, dilate_px: int) -> np.ndarray:
    doc = fitz.open()
    page = doc.new_page(width=dissection.page_size_px[0], height=dissection.page_size_px[1])
    shape = page.new_shape()
    for prim in dissection.primitives:
        if not prim.subpaths:
            continue
        # "rect"/"quad" are structurally closed by definition (4 corners of
        # a rectangle always bound a closed shape) regardless of the source
        # drawing's closePath flag, which describes how the path was
        # authored, not whether its boundary is visually open.
        should_close = prim.closed or prim.kind in ("rect", "quad")
        for subpath in prim.subpaths:
            if not subpath:
                continue
            for op, seg_pts in subpath:
                if op == "c":
                    shape.draw_bezier(*(fitz.Point(*p) for p in seg_pts))
                else:
                    shape.draw_line(fitz.Point(*seg_pts[0]), fitz.Point(*seg_pts[1]))
            # Close *this* subpath specifically -- each contour of a
            # compound path (e.g. a glyph's outer ring and its inner hole)
            # closes independently, not just the drawing's last one.
            first_point = subpath[0][1][0]
            last_point = subpath[-1][1][-1]
            if should_close and first_point != last_point:
                shape.draw_line(fitz.Point(*last_point), fitz.Point(*first_point))
        shape.finish(
            width=prim.stroke_width if prim.stroke_width else 0.75,
            color=(0, 0, 0) if prim.stroke_color is not None else None,
            fill=(0, 0, 0) if prim.fill_color is not None else None,
            closePath=prim.closed,
            even_odd=prim.even_odd,
        )
    shape.commit()
    pix = page.get_pixmap(dpi=dpi, colorspace=fitz.csGRAY, alpha=False)
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
    doc.close()
    mask = _binarize_ink(arr)
    if dilate_px > 0:
        kernel = np.ones((2 * dilate_px + 1, 2 * dilate_px + 1), np.uint8)
        mask = cv2.dilate(mask.astype(np.uint8), kernel).astype(bool)
    return mask


def _common_crop(*masks: np.ndarray) -> list[np.ndarray]:
    h = min(m.shape[0] for m in masks)
    w = min(m.shape[1] for m in masks)
    return [m[:h, :w] for m in masks]


def measure_coverage(
    path: Path,
    dissection: list[PageDissection],
    dpi: int = DEFAULT_DPI,
    dilate_px: int = DEFAULT_DILATE_PX,
) -> list[CoverageResult]:
    doc = fitz.open(path)
    results: list[CoverageResult] = []
    for pd in dissection:
        page = doc[pd.page_index]
        ink_mask = _rasterize_ink_mask(page, dpi)
        text_mask = _rasterize_text_mask(page, dpi, ink_mask.shape)
        vector_mask = _rasterize_vector_mask(pd, dpi, dilate_px)
        ink_mask, text_mask, vector_mask = _common_crop(ink_mask, text_mask, vector_mask)

        ink_count = int(ink_mask.sum())
        text_ink_count = int((ink_mask & text_mask).sum())
        text_ink_fraction = (text_ink_count / ink_count) if ink_count else 0.0

        denominator_mask = ink_mask & ~text_mask
        denom_count = int(denominator_mask.sum())

        flags: list[str] = []
        if denom_count == 0:
            coverage = 1.0
            explained_count = 0
            flags.append("empty_denominator_nothing_non_text_to_explain")
        else:
            explained_count = int((denominator_mask & vector_mask).sum())
            coverage = explained_count / denom_count

        routes_to = "track_v" if coverage >= TRACK_V_COVERAGE_BAR else "track_r"
        results.append(
            CoverageResult(
                page_index=pd.page_index,
                coverage=coverage,
                text_ink_fraction=text_ink_fraction,
                ink_pixel_count=ink_count,
                explained_pixel_count=explained_count,
                routes_to=routes_to,
                flags=flags,
            )
        )
    doc.close()
    return results
