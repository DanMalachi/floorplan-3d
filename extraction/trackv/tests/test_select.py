"""Unit tests for extraction/trackv/select.py's axis-alignment selector.

Covers the regression this module exists to fix (reports/phase-2-gate.md
milestone-2-step-2: hatch and walls share one stroke-width cluster on 15x30
/ 30x50) and a second regression found empirically while building this
selector: a naive length-weighted global argmax for the dominant axis locks
onto the *hatch* angle when hatch outweighs wall strokes in aggregate
length, silently inverting the whole selector. Both are reproduced here with
synthetic fixtures, not just asserted against the real corpus.
"""

from __future__ import annotations

import math
from pathlib import Path

import fitz
import pytest

from extraction.trackv.dissect import dissect
from extraction.trackv.select import select_axis_aligned

PAGE_SIZE = (400.0, 400.0)


def _make_pdf(tmp_path: Path, name: str, draw) -> Path:
    doc = fitz.open()
    page = doc.new_page(width=PAGE_SIZE[0], height=PAGE_SIZE[1])
    draw(page)
    path = tmp_path / name
    doc.save(path)
    doc.close()
    return path


def _draw_wall_rect_with_dense_diagonal_hatch(page: fitz.Page) -> None:
    """A 4-wall rectangle (axis-aligned, long) at the same stroke width as a
    dense field of short 45-deg hatch lines that collectively carry *more*
    total length than the walls -- reproducing the exact failure mode found
    against 15x30/30x50 (hatch dominates aggregate length, not just count)."""
    shape = page.new_shape()
    width = 2.0
    corners = [fitz.Point(50, 50), fitz.Point(350, 50), fitz.Point(350, 350), fitz.Point(50, 350)]
    for a, b in zip(corners, corners[1:] + corners[:1]):
        shape.draw_line(a, b)
    shape.finish(color=(0, 0, 0), width=width, fill=None)
    shape.commit()

    shape = page.new_shape()
    for i in range(150):
        x0 = 60 + (i % 30) * 10
        y0 = 60 + (i // 30) * 10
        shape.draw_line(fitz.Point(x0, y0), fitz.Point(x0 + 8, y0 + 8))
    shape.finish(color=(0, 0, 0), width=width, fill=None)
    shape.commit()


def _draw_rotated_wall_rect(page: fitz.Page, rotation_deg: float) -> None:
    """A wall rectangle rotated by `rotation_deg` about the page center --
    the untested-by-design non-Manhattan path, exercised directly."""
    cx, cy = PAGE_SIZE[0] / 2, PAGE_SIZE[1] / 2
    half = 120.0
    local = [(-half, -half), (half, -half), (half, half), (-half, half)]
    theta = math.radians(rotation_deg)
    cos_t, sin_t = math.cos(theta), math.sin(theta)
    corners = [fitz.Point(cx + x * cos_t - y * sin_t, cy + x * sin_t + y * cos_t) for x, y in local]
    shape = page.new_shape()
    for a, b in zip(corners, corners[1:] + corners[:1]):
        shape.draw_line(a, b)
    shape.finish(color=(0, 0, 0), width=2.0, fill=None)
    shape.commit()


def _draw_rotated_wall_rect_with_dense_hatch(page: fitz.Page, rotation_deg: float) -> None:
    """Same rotated wall rectangle as `_draw_rotated_wall_rect`, plus dense
    hatch drawn at the *architecturally correct* offset (wall rotation + 45
    deg, not a fixed absolute 45) and dominating aggregate length the same
    way `_draw_wall_rect_with_dense_diagonal_hatch` does. Neither existing
    rotation test nor the hatch-dominance test exercises this combination."""
    _draw_rotated_wall_rect(page, rotation_deg)
    shape = page.new_shape()
    hatch_theta = math.radians(rotation_deg + 45.0)
    hct, hst = math.cos(hatch_theta), math.sin(hatch_theta)
    for i in range(150):
        x0 = 40 + (i % 30) * 10
        y0 = 40 + (i // 30) * 10
        shape.draw_line(fitz.Point(x0, y0), fitz.Point(x0 + 8 * hct, y0 + 8 * hst))
    shape.finish(color=(0, 0, 0), width=2.0, fill=None)
    shape.commit()


def _draw_wall_with_curved_segment(page: fitz.Page) -> None:
    shape = page.new_shape()
    shape.draw_line(fitz.Point(50, 50), fitz.Point(200, 50))
    shape.draw_bezier(fitz.Point(200, 50), fitz.Point(220, 50), fitz.Point(240, 70), fitz.Point(240, 100))
    shape.finish(color=(0, 0, 0), width=2.0, fill=None)
    shape.commit()


def test_axis_aligned_walls_selected_over_length_dominant_diagonal_hatch(tmp_path):
    pdf = _make_pdf(tmp_path, "wall_hatch.pdf", _draw_wall_rect_with_dense_diagonal_hatch)
    dissection = dissect(pdf)[0]
    result = select_axis_aligned(dissection)

    assert abs(result.theta_deg) <= 5.0 or abs(result.theta_deg - 90.0) <= 5.0, (
        f"dominant axis should lock onto the wall grid (~0/90), got {result.theta_deg}"
    )
    # exactly the 4 wall segments should survive selection, none of the 150 hatch lines
    assert len(result.candidates) == 4
    for cand in result.candidates:
        assert cand.axis_distance_deg <= result.angular_tolerance_deg


def test_rotated_wall_grid_is_still_selected_as_dominant_axis(tmp_path):
    pdf = _make_pdf(tmp_path, "rotated.pdf", lambda p: _draw_rotated_wall_rect(p, 15.0))
    dissection = dissect(pdf)[0]
    result = select_axis_aligned(dissection)

    # folded mod-90 domain: a 15deg-rotated grid's walls fold to ~15deg
    assert abs(result.theta_deg - 15.0) <= 3.0, f"expected theta near 15 deg, got {result.theta_deg}"
    assert len(result.candidates) == 4


@pytest.mark.xfail(
    reason=(
        "KNOWN DEBT (reports/phase-2-gate.md, step 3a): the 'prefer the local peak "
        "closest to 0' fix for hatch-dominated axis selection reintroduces a 0-deg "
        "Manhattan bias, regressing the non-Manhattan-safe goal (paper Sec. 5.4). At "
        "large enough rotation the hatch peak (rotation + 45 deg, folded mod-90) lands "
        "*closer* to 0 than the true wall peak does, and the heuristic picks the wrong "
        "one. Confirmed empirically: correct at 0/15 deg rotation, wrong at 30 deg "
        "(recovers ~74.5 deg instead of ~30). Acceptable interim only because this "
        "corpus is unrotated (theta ~0.5 deg measured on all three hatched plans) -- "
        "not fixed here, logged honestly via this expected-failing test rather than "
        "silently passing on an untested path. Principled fix for Phase-7 hardening: "
        "weight the axis vote by parallel-pair support (how many candidates actually "
        "find a consistent-offset partner at that orientation), not by peak proximity "
        "to zero -- real walls pair up, coincidentally-aligned hatch mostly doesn't."
    ),
    strict=True,
)
def test_rotated_wall_grid_with_dominant_hatch_is_not_reliably_recovered(tmp_path):
    pdf = _make_pdf(tmp_path, "rotated_hatch.pdf", lambda p: _draw_rotated_wall_rect_with_dense_hatch(p, 30.0))
    dissection = dissect(pdf)[0]
    result = select_axis_aligned(dissection)
    assert abs(result.theta_deg - 30.0) <= 3.0, f"expected theta near 30 deg, got {result.theta_deg}"


def test_curve_segments_in_stroke_population_are_quarantined_not_selected(tmp_path):
    pdf = _make_pdf(tmp_path, "curve_wall.pdf", _draw_wall_with_curved_segment)
    dissection = dissect(pdf)[0]
    result = select_axis_aligned(dissection)

    assert len(result.quarantined_curves) == 1
    for cand in result.candidates:
        assert (cand.primitive_index, cand.subpath_index, cand.segment_index) != (
            result.quarantined_curves[0].primitive_index,
            result.quarantined_curves[0].subpath_index,
            result.quarantined_curves[0].segment_index,
        )


def test_no_stroked_primitives_returns_empty_selection(tmp_path):
    shape_pdf = _make_pdf(tmp_path, "empty.pdf", lambda p: None)
    dissection = dissect(shape_pdf)[0]
    result = select_axis_aligned(dissection)

    assert result.candidates == []
    assert result.theta_deg == 0.0
