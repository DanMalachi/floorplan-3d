"""Axis-alignment selection -- Track V milestone 2 step 3a, item 1.

Milestone 2 step 2 (reports/phase-2-gate.md) found that stroke-width
clustering alone cannot separate wall strokes from hatching on 15x30 and
30x50: the dominant 0.72pt cluster is 78.5% diagonal-angled segments, i.e.
hatch and wall geometry share the literal same pen width. This module
implements the orientation-based selector that finding calls for: reject
diagonally-angled strokes (hatching) *before* parallel-pair matching runs,
independent of which width cluster a segment's parent primitive fell into.

Deliberately segment-level, not cluster-level. An earlier draft of this
selector gated whole width clusters on their axis-aligned fraction -- wrong,
because it would have discarded 15x30's entire dominant cluster (only 21.5%
axis-aligned) and, with it, the ~21.5% of that cluster's segments that *are*
axis-aligned and are the plan's actual wall-face candidates. Rejecting a
cluster wholesale throws out real wall signal along with the hatch majority
sharing its pen width. The selector below tests every line segment on its
own orientation; per-cluster axis-aligned fractions are computed only for
the diagnostic report (per-stage attribution, gate report item 3), not used
as a gate.

Does not pair segments, does not decide wall thickness, does not touch
schema/ExtractionResult -- that is pair.py and assemble.py.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from extraction.trackv.primitives import PageDissection, Point2, Segment, VectorPrimitive
from extraction.trackv.stroke_clusters import (
    PlanStrokeWidthPopulation,
    WidthCluster,
    cluster_widths,
    extract_stroke_population,
)

DEFAULT_ANGULAR_TOLERANCE_DEG = 20.0  # matches step 2's own diagnostic band
DEFAULT_HISTOGRAM_BIN_DEG = 1.0


@dataclass
class SelectedSegment:
    primitive_index: int
    subpath_index: int
    segment_index: int
    p0: Point2
    p1: Point2
    length: float
    angle_deg: float  # raw angle mod 180
    axis_distance_deg: float  # distance from theta in the folded mod-90 space
    stroke_width: float


@dataclass
class QuarantinedCurve:
    """A curve ("c") segment inside the stroke population that axis-alignment
    cannot classify (no single well-defined orientation). Flagged, not
    silently dropped and not silently included -- pair.py must not consume
    these; they are reported so a reviewer can see how much of the stroke
    population this affects."""

    primitive_index: int
    subpath_index: int
    segment_index: int


@dataclass
class ClusterAxisReport:
    low: float
    high: float
    mean: float
    count: int
    axis_aligned_segment_count: int
    diagonal_segment_count: int

    @property
    def axis_aligned_fraction(self) -> float | None:
        total = self.axis_aligned_segment_count + self.diagonal_segment_count
        return (self.axis_aligned_segment_count / total) if total else None


@dataclass
class SelectionResult:
    theta_deg: float
    angular_tolerance_deg: float
    n_line_segments_considered: int
    candidates: list[SelectedSegment] = field(default_factory=list)
    quarantined_curves: list[QuarantinedCurve] = field(default_factory=list)
    cluster_reports: list[ClusterAxisReport] = field(default_factory=list)
    population: PlanStrokeWidthPopulation | None = None


def _seg_angle_length(op: str, pts: tuple[Point2, ...]) -> tuple[float, float]:
    (x0, y0), (x1, y1) = pts[0], pts[-1]
    dx, dy = x1 - x0, y1 - y0
    length = math.hypot(dx, dy)
    angle = math.degrees(math.atan2(dy, dx)) % 180.0
    return angle, length


def _fold_mod_90(angle_mod_180: float) -> float:
    return angle_mod_180 % 90.0


def _circular_dist_mod_90(a: float, b: float) -> float:
    d = abs(a - b) % 90.0
    return min(d, 90.0 - d)


def _dominant_axis(
    line_segments: list[tuple[int, int, int, Segment, float, float]],
    bin_deg: float,
) -> float:
    """Length-weighted histogram over the folded mod-90 orientation domain,
    picking the *local peak closest to 0* rather than the global argmax.

    This is not the first thing tried. A plain global argmax was checked
    directly against the real 15x30 and 30x50 dissections before writing any
    test for it, and it fails outright: hatching outweighs wall strokes in
    *aggregate length* on both (15x30's folded bin 44-45 carries ~164k units
    of length vs. ~15k at bin 0; 30x50's is ~163k vs. ~48k), so a raw argmax
    locks theta onto the hatch angle (~45 deg) instead of the wall grid --
    which silently inverts the whole selector (keeps hatch, rejects walls,
    with no error signal). Both plans do carry a clear, strong local maximum
    at bin 0 -- just not the biggest one.

    The fix encodes a real drafting convention, not an arbitrary tiebreak:
    architectural hatch fill is conventionally drawn at ~45 deg specifically
    to read as visually distinct from structural (wall) lines, which are
    conventionally axis-aligned. So among genuine local peaks (bins that
    locally dominate both circular neighbors -- this alone screens out
    noise bins without needing an arbitrary prominence cutoff), the one
    closest to 0 in this folded, circular-mod-90 domain is preferred as the
    wall grid's rotation, regardless of whether it is the global maximum.
    This still generalizes to a genuinely rotated plan (not just a hardcoded
    0/90 assumption) as long as the plan's own rotation is under ~45 deg
    from the hatch peak's offset -- true of every corpus plan, and true of
    essentially any real building. Not exercised on an actually-rotated
    plan by this corpus (see reports/phase-2-gate.md's untested-path note).

    Deterministic: local maxima are scanned low-to-high bin index; ties in
    distance-to-zero are broken by the smaller bin index (paper Sec. 6.5's
    lexicographic tie-breaking).
    """
    n_bins = max(1, round(90.0 / bin_deg))
    weights = [0.0] * n_bins
    for *_rest, angle, length in line_segments:
        folded = _fold_mod_90(angle)
        b = min(n_bins - 1, int(folded / 90.0 * n_bins))
        weights[b] += length

    def bin_center(b: int) -> float:
        return (b + 0.5) * (90.0 / n_bins)

    def dist_to_zero(b: int) -> float:
        c = bin_center(b)
        return min(c, 90.0 - c)

    if n_bins == 1:
        return bin_center(0)

    peaks = [
        b
        for b in range(n_bins)
        if weights[b] > 0
        and weights[b] >= weights[(b - 1) % n_bins]
        and weights[b] >= weights[(b + 1) % n_bins]
    ]
    if not peaks:
        return 0.0

    best = peaks[0]
    best_dist = dist_to_zero(best)
    for b in peaks[1:]:
        d = dist_to_zero(b)
        if d < best_dist:
            best, best_dist = b, d
    return bin_center(best)


def _cluster_index_for_value(value: float, clusters: list[WidthCluster], eps: float = 1e-6) -> int | None:
    for i, c in enumerate(clusters):
        if c.low - eps <= value <= c.high + eps:
            return i
    return None


def select_axis_aligned(
    dissection: PageDissection,
    angular_tolerance_deg: float = DEFAULT_ANGULAR_TOLERANCE_DEG,
    histogram_bin_deg: float = DEFAULT_HISTOGRAM_BIN_DEG,
) -> SelectionResult:
    """Select axis-aligned line segments from the stroke-width population as
    parallel-pairing candidates, rejecting diagonal (hatch-like) segments.
    Filled-no-stroke primitives (the medial-axis/poche population) are
    excluded entirely -- that is step 3c's input, not this selector's."""
    population = extract_stroke_population(dissection)
    cluster_result = cluster_widths(population.stroke_widths)

    # (primitive_index, subpath_index, segment_index, segment, angle, length)
    line_segments: list[tuple[int, int, int, Segment, float, float]] = []
    curve_entries: list[tuple[int, int, int]] = []
    prim_width_by_index = {i: dissection.primitives[i].stroke_width for i in population.stroke_primitive_indices}

    for prim_idx in population.stroke_primitive_indices:
        prim: VectorPrimitive = dissection.primitives[prim_idx]
        for sp_idx, subpath in enumerate(prim.subpaths):
            for seg_idx, (op, pts) in enumerate(subpath):
                if op == "l":
                    angle, length = _seg_angle_length(op, pts)
                    line_segments.append((prim_idx, sp_idx, seg_idx, (op, pts), angle, length))
                elif op == "c":
                    curve_entries.append((prim_idx, sp_idx, seg_idx))

    theta = _dominant_axis(line_segments, histogram_bin_deg) if line_segments else 0.0

    candidates: list[SelectedSegment] = []
    # per-cluster diagnostic counters, indexed like cluster_result.clusters
    aligned_counts = [0] * len(cluster_result.clusters)
    diagonal_counts = [0] * len(cluster_result.clusters)

    for prim_idx, sp_idx, seg_idx, (op, pts), angle, length in line_segments:
        folded = _fold_mod_90(angle)
        dist = _circular_dist_mod_90(folded, theta)
        width = prim_width_by_index[prim_idx]
        ci = _cluster_index_for_value(width, cluster_result.clusters)
        is_aligned = dist <= angular_tolerance_deg
        if ci is not None:
            if is_aligned:
                aligned_counts[ci] += 1
            else:
                diagonal_counts[ci] += 1
        if is_aligned:
            candidates.append(
                SelectedSegment(
                    primitive_index=prim_idx,
                    subpath_index=sp_idx,
                    segment_index=seg_idx,
                    p0=pts[0],
                    p1=pts[-1],
                    length=length,
                    angle_deg=angle,
                    axis_distance_deg=dist,
                    stroke_width=width,
                )
            )

    cluster_reports = [
        ClusterAxisReport(
            low=c.low,
            high=c.high,
            mean=c.mean,
            count=c.count,
            axis_aligned_segment_count=aligned_counts[i],
            diagonal_segment_count=diagonal_counts[i],
        )
        for i, c in enumerate(cluster_result.clusters)
    ]

    quarantined = [
        QuarantinedCurve(primitive_index=p, subpath_index=s, segment_index=g) for p, s, g in curve_entries
    ]

    return SelectionResult(
        theta_deg=theta,
        angular_tolerance_deg=angular_tolerance_deg,
        n_line_segments_considered=len(line_segments),
        candidates=candidates,
        quarantined_curves=quarantined,
        cluster_reports=cluster_reports,
        population=population,
    )
