"""Regression test for the milestone-1 multi-subpath flattening bug
(reports/phase-2-gate.md's Matterport-watermark finding).

A compound filled path -- a shape with an outer contour *and* an inner hole,
like a glyph with a counter ('o', 'e', 'p') or a wall polygon with a
courtyard -- is one PyMuPDF drawing whose "items" list concatenates multiple
subpaths with no move-to marker. The old `_flatten_items` joined every
subpath into one continuous polyline, corrupting the redraw with a spurious
edge connecting the outer ring's last point to the inner ring's first point.
This fixture reproduces that shape directly (not just via the real Matterport
PDF) so the failure mode has a minimal, deterministic unit test.
"""

from __future__ import annotations

from pathlib import Path

import fitz

from extraction.trackv.coverage import measure_coverage
from extraction.trackv.dissect import dissect

PAGE_SIZE = (200.0, 200.0)


def _make_pdf(tmp_path: Path, name: str, draw) -> Path:
    doc = fitz.open()
    page = doc.new_page(width=PAGE_SIZE[0], height=PAGE_SIZE[1])
    draw(page)
    path = tmp_path / name
    doc.save(path)
    doc.close()
    return path


def _draw_rect_with_hole(page: fitz.Page) -> None:
    """One compound fill, two subpaths: an outer square ring and an inner
    square hole -- the same 'outer contour + inner counter' structure as a
    glyph, built from straight lines only."""
    shape = page.new_shape()
    outer = [fitz.Point(20, 20), fitz.Point(180, 20), fitz.Point(180, 180), fitz.Point(20, 180)]
    inner = [fitz.Point(60, 60), fitz.Point(140, 60), fitz.Point(140, 140), fitz.Point(60, 140)]
    shape.draw_polyline(outer + [outer[0]])
    shape.draw_polyline(inner + [inner[0]])
    shape.finish(fill=(0, 0, 0), color=None, even_odd=True)
    shape.commit()


def _draw_glyph_like_hole(page: fitz.Page) -> None:
    """Same two-subpath hole structure, but the inner ring mixes line and
    curve segments -- matching the real Matterport watermark glyphs, which
    interleave 'l' and 'c' ops *within* a single subpath (verified directly
    against the corpus PDF's raw items)."""
    shape = page.new_shape()
    outer = [fitz.Point(20, 20), fitz.Point(180, 20), fitz.Point(180, 180), fitz.Point(20, 180)]
    shape.draw_polyline(outer + [outer[0]])
    shape.draw_line(fitz.Point(60, 100), fitz.Point(70, 60))
    shape.draw_bezier(
        fitz.Point(70, 60), fitz.Point(120, 40), fitz.Point(140, 70), fitz.Point(140, 100)
    )
    shape.draw_bezier(
        fitz.Point(140, 100), fitz.Point(140, 130), fitz.Point(120, 150), fitz.Point(90, 150)
    )
    shape.draw_line(fitz.Point(90, 150), fitz.Point(60, 100))
    shape.finish(fill=(0, 0, 0), color=None, even_odd=True)
    shape.commit()


def test_compound_path_with_hole_round_trips_at_near_full_coverage(tmp_path):
    pdf = _make_pdf(tmp_path, "rect_with_hole.pdf", _draw_rect_with_hole)
    dissection = dissect(pdf)
    [prim] = dissection[0].primitives

    # The fix's core claim: two disjoint subpaths, not one merged polyline.
    assert len(prim.subpaths) == 2, "outer ring and inner hole must stay separate subpaths"

    [result] = measure_coverage(pdf, dissection)
    assert result.coverage >= 0.98, f"compound-path redraw should round-trip near-fully, got {result.coverage}"
    assert result.routes_to == "track_v"


def test_glyph_like_compound_path_with_curves_round_trips_at_near_full_coverage(tmp_path):
    pdf = _make_pdf(tmp_path, "glyph_hole.pdf", _draw_glyph_like_hole)
    dissection = dissect(pdf)
    [prim] = dissection[0].primitives

    assert len(prim.subpaths) == 2, "outer ring and curved inner hole must stay separate subpaths"

    [result] = measure_coverage(pdf, dissection)
    assert result.coverage >= 0.98, f"compound-path redraw should round-trip near-fully, got {result.coverage}"
    assert result.routes_to == "track_v"
