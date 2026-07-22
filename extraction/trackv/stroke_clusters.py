"""Stroke-width clustering over dissected vector primitives (paper Sec. 3.7 /
5.2 item 1's prefilter hypothesis, made concrete and empirically testable).

Scope: this module clusters the population of per-primitive stroke widths.
It does NOT decide which cluster is "the wall cluster", does not pair
parallel strokes, does not recover centerlines/thickness, and produces no
schema/ExtractionResult output -- that is milestone 2's later step. Filled
primitives with no stroke (PyMuPDF reports `width=None` for a pure fill)
carry no width signal at all; they are counted and reported separately here,
never fed into clustering, since their thickness can only come from a
medial-axis path, not this one.

Clustering method: kernel density estimation over the raw width population,
splitting at valleys between density peaks whose depth is small relative to
the peaks on either side (the standard peak/valley-ratio modality test).
This is deliberately NOT a variance-reduction (elbow/GVF, or plain k-means-
style) criterion -- variance-reduction criteria are known to over-split
unimodal continuous data (an optimal 2-way split of a single Gaussian still
"explains" a large fraction of its variance by construction), which fails
exactly the over-splitting resistance this module is required to have.
Bandwidth uses a robust (IQR-based) scale estimate so one dominant repeated
literal value -- the normal case in these corpus PDFs, e.g. one pen width
shared by thousands of primitives -- doesn't collapse the bandwidth to zero.
A minimum cluster size discards single-point tail artifacts that a KDE will
otherwise occasionally split off from a large, genuinely unimodal sample.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from extraction.trackv.primitives import PageDissection, VectorPrimitive

DEFAULT_VALLEY_RATIO = 0.6
DEFAULT_MIN_CLUSTER_SIZE = 4
DEFAULT_MIN_BANDWIDTH = 1e-4
DEFAULT_GRID_POINTS = 2000


@dataclass
class WidthCluster:
    low: float
    high: float
    mean: float
    count: int


@dataclass
class ClusterResult:
    clusters: list[WidthCluster]
    n_values: int


@dataclass
class PlanStrokeWidthPopulation:
    stroke_widths: list[float]
    stroke_primitive_indices: list[int]
    filled_no_stroke_count: int
    filled_no_stroke_area: float
    total_primitive_count: int
    total_polygon_area: float

    @property
    def filled_no_stroke_fraction_count(self) -> float:
        if self.total_primitive_count == 0:
            return 0.0
        return self.filled_no_stroke_count / self.total_primitive_count

    @property
    def filled_no_stroke_fraction_area(self) -> float:
        if self.total_polygon_area == 0:
            return 0.0
        return self.filled_no_stroke_area / self.total_polygon_area


def _polygon_area(primitive: VectorPrimitive) -> float:
    """Approximate absolute area via the shoelace formula over each subpath's
    segment start points (curves approximated by their chord -- adequate for
    a reporting fraction, not for downstream geometry)."""
    total = 0.0
    for subpath in primitive.subpaths:
        if not subpath:
            continue
        pts = [seg_pts[0] for _op, seg_pts in subpath]
        pts.append(subpath[-1][1][-1])
        if len(pts) < 3:
            continue
        area = 0.0
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            area += x0 * y1 - x1 * y0
        total += abs(area) / 2.0
    return total


def extract_stroke_population(dissection: PageDissection) -> PlanStrokeWidthPopulation:
    """Split a page's primitives into the stroke-width population (fed to
    clustering) and the filled-no-stroke residue (deferred to a later
    medial-axis path, not clustered)."""
    widths: list[float] = []
    stroke_indices: list[int] = []
    filled_no_stroke_count = 0
    filled_no_stroke_area = 0.0
    total_area = 0.0
    for i, prim in enumerate(dissection.primitives):
        area = _polygon_area(prim)
        total_area += area
        if prim.stroke_width is None:
            filled_no_stroke_count += 1
            filled_no_stroke_area += area
            continue
        widths.append(prim.stroke_width)
        stroke_indices.append(i)
    return PlanStrokeWidthPopulation(
        stroke_widths=widths,
        stroke_primitive_indices=stroke_indices,
        filled_no_stroke_count=filled_no_stroke_count,
        filled_no_stroke_area=filled_no_stroke_area,
        total_primitive_count=len(dissection.primitives),
        total_polygon_area=total_area,
    )


def _robust_sigma(values: np.ndarray) -> float:
    std = float(np.std(values))
    q1, q3 = np.percentile(values, [25, 75])
    iqr = float(q3 - q1)
    if iqr > 0:
        return min(std, iqr / 1.349)
    return std


def _kde_density(values: np.ndarray, bandwidth: float, grid: np.ndarray) -> np.ndarray:
    diffs = (grid[:, None] - values[None, :]) / bandwidth
    return np.exp(-0.5 * diffs**2).sum(axis=1) / (len(values) * bandwidth * math.sqrt(2 * math.pi))


def _find_peaks(density: np.ndarray) -> list[int]:
    return [i for i in range(1, len(density) - 1) if density[i] > density[i - 1] and density[i] >= density[i + 1]]


def _merge_undersized(groups: list[list[float]], min_cluster_size: int) -> list[list[float]]:
    changed = True
    while changed and len(groups) > 1:
        changed = False
        for i, g in enumerate(groups):
            if len(g) >= min_cluster_size:
                continue
            center = sum(g) / len(g)
            if i == 0:
                neighbor = 1
            elif i == len(groups) - 1:
                neighbor = i - 1
            else:
                left_center = sum(groups[i - 1]) / len(groups[i - 1])
                right_center = sum(groups[i + 1]) / len(groups[i + 1])
                neighbor = i - 1 if abs(center - left_center) <= abs(center - right_center) else i + 1
            lo, hi = min(i, neighbor), max(i, neighbor)
            merged = sorted(groups[lo] + groups[hi])
            groups = groups[:lo] + [merged] + groups[lo + 1 : hi] + groups[hi + 1 :]
            changed = True
            break
    return groups


def cluster_widths(
    values: list[float],
    valley_ratio: float = DEFAULT_VALLEY_RATIO,
    min_cluster_size: int = DEFAULT_MIN_CLUSTER_SIZE,
    min_bandwidth: float = DEFAULT_MIN_BANDWIDTH,
    grid_points: int = DEFAULT_GRID_POINTS,
) -> ClusterResult:
    """Cluster a population of stroke-width values via KDE peak/valley
    detection. See module docstring for the method and its rationale."""
    if not values:
        return ClusterResult(clusters=[], n_values=0)
    if len(values) == 1:
        v = values[0]
        return ClusterResult(clusters=[WidthCluster(low=v, high=v, mean=v, count=1)], n_values=1)

    arr = np.asarray(values, dtype=float)
    lo, hi = float(arr.min()), float(arr.max())
    if hi - lo < 1e-9:
        mean = float(arr.mean())
        return ClusterResult(clusters=[WidthCluster(low=lo, high=hi, mean=mean, count=len(values))], n_values=len(values))

    sigma = _robust_sigma(arr)
    if sigma <= 0:
        sigma = (hi - lo) / 6.0
    bandwidth = max(0.9 * sigma * len(arr) ** (-0.2), min_bandwidth, (hi - lo) * 0.005)
    pad = 3 * bandwidth
    grid = np.linspace(lo - pad, hi + pad, grid_points)
    density = _kde_density(arr, bandwidth, grid)

    peaks = _find_peaks(density)
    if len(peaks) < 2:
        return ClusterResult(
            clusters=[WidthCluster(low=lo, high=hi, mean=float(arr.mean()), count=len(values))],
            n_values=len(values),
        )

    split_points: list[float] = []
    for left, right in zip(peaks, peaks[1:]):
        segment = density[left : right + 1]
        valley_idx = left + int(np.argmin(segment))
        if density[valley_idx] <= valley_ratio * min(density[left], density[right]):
            split_points.append(float(grid[valley_idx]))

    if not split_points:
        return ClusterResult(
            clusters=[WidthCluster(low=lo, high=hi, mean=float(arr.mean()), count=len(values))],
            n_values=len(values),
        )

    sorted_vals = sorted(values)
    groups: list[list[float]] = []
    current: list[float] = []
    boundary_idx = 0
    for v in sorted_vals:
        while boundary_idx < len(split_points) and v > split_points[boundary_idx]:
            groups.append(current)
            current = []
            boundary_idx += 1
        current.append(v)
    groups.append(current)
    groups = [g for g in groups if g]
    groups = _merge_undersized(groups, min_cluster_size)

    clusters = [
        WidthCluster(low=min(g), high=max(g), mean=sum(g) / len(g), count=len(g)) for g in groups
    ]
    return ClusterResult(clusters=clusters, n_values=len(values))
