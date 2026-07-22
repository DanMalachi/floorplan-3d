"""Unit tests for extraction/trackv/stroke_clusters.py's clustering logic on
synthetic width populations -- the two required behaviors are that a clean
bimodal population splits into two clusters, and a single (unimodal)
population does not get over-split into spurious extra clusters. Random
draws use a fixed seed so results are deterministic across runs.

Also covers the quantized-population shape real corpus PDFs actually have
(one dominant exact-repeated pen width plus a few distinct outlier widths --
see reports/phase-2-gate.md's milestone-2-step-2 findings), and the
filled-primitive-has-no-stroke-width bookkeeping in
extract_stroke_population.
"""

from __future__ import annotations

import random

import fitz
import pytest

from extraction.trackv.dissect import dissect
from extraction.trackv.stroke_clusters import cluster_widths, extract_stroke_population


def _gauss_population(mean: float, std: float, n: int, seed: int) -> list[float]:
    rng = random.Random(seed)
    return [rng.gauss(mean, std) for _ in range(n)]


def test_clean_bimodal_population_splits_into_two_clusters():
    values = _gauss_population(1.0, 0.05, 50, seed=1) + _gauss_population(3.0, 0.05, 50, seed=2)
    result = cluster_widths(values)

    assert len(result.clusters) == 2
    assert result.n_values == 100
    low, high = sorted(result.clusters, key=lambda c: c.mean)
    assert low.count == 50
    assert high.count == 50
    assert low.high < high.low, "the two clusters must not overlap"
    assert 0.8 < low.mean < 1.2
    assert 2.8 < high.mean < 3.2


@pytest.mark.parametrize("n", [30, 100, 300, 1000])
@pytest.mark.parametrize("std", [0.05, 0.1, 0.2])
def test_single_population_does_not_over_split(n, std):
    values = _gauss_population(1.0, std, n, seed=n * 100 + int(std * 1000))
    result = cluster_widths(values)

    assert len(result.clusters) == 1
    assert result.clusters[0].count == n


def test_empty_population_returns_no_clusters():
    result = cluster_widths([])
    assert result.clusters == []
    assert result.n_values == 0


def test_all_identical_values_form_one_cluster():
    result = cluster_widths([0.72] * 500)
    assert len(result.clusters) == 1
    assert result.clusters[0].count == 500
    assert result.clusters[0].low == result.clusters[0].high == 0.72


def test_dominant_repeated_width_plus_far_outliers_splits_off_the_outliers():
    """Mirrors the real corpus shape (reports/phase-2-gate.md): one pen width
    used for the vast majority of strokes, plus a small cluster of clearly
    thicker outlier widths far from the main mass."""
    dominant = [0.715] * 472 + [0.68] * 10 + [0.706] * 8 + [0.628] * 7 + [0.758] * 6
    dominant += [0.499] * 5 + [0.58] * 5 + [0.5] * 3 + [0.728, 0.654, 0.636]
    outliers = [1.008] * 3 + [1.022] * 3 + [0.975]
    values = dominant + outliers

    result = cluster_widths(values)

    assert len(result.clusters) >= 2
    # The far outlier group (>= 0.975) must land in its own cluster, separate
    # from every sub-0.9 pen width -- it must not just merge into whichever
    # cluster happens to be biggest by count.
    outlier_clusters = [c for c in result.clusters if c.low >= 0.9]
    assert len(outlier_clusters) == 1
    assert outlier_clusters[0].count == len(outliers)
    assert all(c.high < 0.9 for c in result.clusters if c is not outlier_clusters[0])


def test_two_exact_pen_widths_separate_cleanly():
    """Mirrors 15x30/30x50: a hairline (0.0) minority and a dominant 0.72
    pen covering nearly every primitive."""
    values = [0.72] * 20737 + [0.0] * 4
    result = cluster_widths(values)

    assert len(result.clusters) == 2
    by_mean = sorted(result.clusters, key=lambda c: c.mean)
    assert by_mean[0].mean == pytest.approx(0.0)
    assert by_mean[0].count == 4
    assert by_mean[1].mean == pytest.approx(0.72)
    assert by_mean[1].count == 20737


def test_three_exact_pen_widths_separate_cleanly():
    """Mirrors 20x45: three distinct exact pen widths, none dominant enough
    to swamp the others entirely."""
    values = [0.72] * 182 + [0.0] * 43 + [0.48] * 26
    result = cluster_widths(values)

    assert len(result.clusters) == 3
    counts = sorted(c.count for c in result.clusters)
    assert counts == [26, 43, 182]


def _make_pdf_with_stroke_and_fill(tmp_path):
    doc = fitz.open()
    page = doc.new_page(width=200, height=200)
    shape = page.new_shape()
    # a stroked line -- carries a real stroke width
    shape.draw_line(fitz.Point(10, 10), fitz.Point(100, 10))
    shape.finish(color=(0, 0, 0), width=0.72)
    # a filled-only rectangle (poche wall convention) -- no stroke at all
    shape.draw_rect(fitz.Rect(20, 40, 80, 60))
    shape.finish(fill=(0, 0, 0), color=None)
    shape.commit()
    path = tmp_path / "mixed.pdf"
    doc.save(path)
    doc.close()
    return path


def test_extract_stroke_population_separates_filled_only_primitives(tmp_path):
    pdf = _make_pdf_with_stroke_and_fill(tmp_path)
    dissection = dissect(pdf)[0]

    population = extract_stroke_population(dissection)

    assert population.stroke_widths == pytest.approx([0.72], abs=1e-4)
    assert population.filled_no_stroke_count == 1
    assert population.total_primitive_count == 2
    assert population.filled_no_stroke_area > 0.0
    assert population.filled_no_stroke_fraction_count == pytest.approx(0.5)
