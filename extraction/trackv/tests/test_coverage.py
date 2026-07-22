"""Coverage-test sanity checks on synthetic PDFs (not corpus files) -- proves
the redraw-and-compare logic, text-ink subtraction, and dilation each do what
they claim, independent of real-corpus quirks.
"""

from __future__ import annotations

import dataclasses
from pathlib import Path

import fitz

from extraction.trackv.coverage import measure_coverage
from extraction.trackv.dissect import dissect

PAGE_SIZE = (400.0, 300.0)


def _make_pdf(tmp_path: Path, name: str, draw) -> Path:
    doc = fitz.open()
    page = doc.new_page(width=PAGE_SIZE[0], height=PAGE_SIZE[1])
    draw(page)
    path = tmp_path / name
    doc.save(path)
    doc.close()
    return path


def _draw_rect(page: fitz.Page) -> None:
    shape = page.new_shape()
    shape.draw_rect(fitz.Rect(50, 50, 250, 150))
    shape.finish(width=1.5, color=(0, 0, 0))
    shape.commit()


def _draw_rect_and_text(page: fitz.Page) -> None:
    _draw_rect(page)
    page.insert_text(fitz.Point(60, 200), "LIVING ROOM 3.4 x 2.9", fontsize=14)


def _shift_primitives(dissection, dx: float, dy: float):
    """Simulate a small sub-pixel coordinate discrepancy between a page's
    real content-stream geometry and its re-parsed/redrawn primitives --
    the same class of small registration slack Phase 1 documented in real
    baseline output (GitHub issue #5), here scoped down to Track V's own
    redraw step rather than a cross-baseline rescale."""
    def _shift_segment(op, pts):
        return (op, tuple((x + dx, y + dy) for x, y in pts))

    shifted = []
    for pd in dissection:
        prims = [
            dataclasses.replace(
                p,
                subpaths=[
                    [_shift_segment(op, pts) for op, pts in subpath]
                    for subpath in p.subpaths
                ],
            )
            for p in pd.primitives
        ]
        shifted.append(dataclasses.replace(pd, primitives=prims))
    return shifted


def test_rectangle_scores_near_full_coverage(tmp_path):
    pdf = _make_pdf(tmp_path, "rect.pdf", _draw_rect)
    dissection = dissect(pdf)
    assert len(dissection[0].primitives) == 1

    [result] = measure_coverage(pdf, dissection)
    assert result.coverage >= 0.95
    assert result.routes_to == "track_v"
    assert result.text_ink_fraction == 0.0


def test_blank_page_scores_full_coverage_with_flag(tmp_path):
    pdf = _make_pdf(tmp_path, "blank.pdf", lambda page: None)
    dissection = dissect(pdf)
    assert dissection[0].primitives == []

    [result] = measure_coverage(pdf, dissection)
    assert result.coverage == 1.0
    assert "empty_denominator_nothing_non_text_to_explain" in result.flags


def test_text_ink_excluded_from_denominator(tmp_path):
    """Amendment (a): get_drawings() never captures text, so a page with a
    fully-explained rectangle *plus* a text label must still score ~100% --
    text ink must be subtracted from the denominator, not held against the
    extracted paths."""
    pdf = _make_pdf(tmp_path, "rect_and_text.pdf", _draw_rect_and_text)
    dissection = dissect(pdf)

    [result] = measure_coverage(pdf, dissection)
    assert result.text_ink_fraction > 0.0, "test fixture should actually contain text ink"
    assert result.coverage >= 0.95
    assert result.routes_to == "track_v"


def test_dilation_recovers_small_registration_offset(tmp_path):
    """Amendment (b): redrawing extracted primitives is a second, independent
    rasterization pass and real corpus PDFs do not reproduce pixel-perfectly
    (curve flattening, compound paths, coordinate rounding all introduce
    sub-pixel slack -- the smaller, same-track sibling of the cross-baseline
    registration offset Phase 1 measured in issue #5). Simulate that slack
    directly with a sub-pixel shift on the redrawn primitives: a raw AND
    (dilate_px=0) must lose real coverage to it, while the default dilation
    recovers most or all of it."""
    pdf = _make_pdf(tmp_path, "rect.pdf", _draw_rect)
    dissection = dissect(pdf)
    shifted = _shift_primitives(dissection, dx=0.6, dy=0.6)

    [no_dilate] = measure_coverage(pdf, shifted, dilate_px=0)
    [dilated] = measure_coverage(pdf, shifted, dilate_px=2)

    assert no_dilate.coverage < 0.95, "fixture should actually demonstrate a real gap pre-dilation"
    assert dilated.explained_pixel_count > no_dilate.explained_pixel_count
    assert dilated.coverage > no_dilate.coverage
    assert dilated.coverage >= 0.95
