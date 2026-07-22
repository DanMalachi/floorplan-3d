"""Parallel-pair centerline + thickness recovery -- Track V milestone 2 step
3a, items 1 (recovery) and the two required guards from the step-3 scope
approval:

1. A thickness-plausibility guard (Layer-2 geometric prior): axis-alignment
   alone still lets stacked dimension/witness lines through (they are long,
   axis-aligned, parallel, consistent-offset pairs too) -- reject any paired
   offset that is not a plausible wall thickness, using the plan's own
   recovered-thickness population (reusing stroke_clusters' KDE clustering
   on a *different* population -- thickness instead of stroke width -- no
   new clustering algorithm needed).
2. Collinear-merge across opening gaps: a wall drawn as two stubs flanking
   a door/window would otherwise leave the room cycle unable to close in
   assemble.py -- and that is an opening-recovery bug (P5's job) surfacing
   as a P2 validity failure, not a pairing bug. Two collinear wall
   centerlines whose end gap sits in (snap tolerance, opening-width bound]
   are joined into one wall; the merged-over span is recorded as an
   unclassified opening candidate (evidence=["vector"] only).

Deliberately a greedy deterministic matcher, not a solver -- Track V's
candidates are exact (unlike Track R's noisy raster ones), so exhaustive
constraint solving over them is out of scope here; that machinery belongs
to Phase 4 on Track R's harder problem.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from extraction.trackv.select import SelectedSegment, SelectionResult
from extraction.trackv.stroke_clusters import DEFAULT_MIN_CLUSTER_SIZE, WidthCluster, cluster_widths

Point2 = tuple[float, float]

MAX_THICKNESS_SEARCH_FRAC = 0.25  # of plan diagonal -- pair-search cutoff; kept wider than the outlier
# ceiling below on purpose, so implausible-thickness pairs are actually found and then explicitly
# rejected (visible in PairFunnel.n_pairs_rejected_thickness_outlier) rather than silently invisible
# because the search window itself happened to exclude them first.
OUTLIER_THICKNESS_FRAC = 0.15  # of plan diagonal -- final plausibility ceiling
MIN_OVERLAP_FRACTION = 0.6  # of the shorter candidate's along-axis span
MIN_CANDIDATE_LENGTH_FRAC = 0.01  # of plan diagonal -- floor below which a candidate can't be a wall face
MIN_THICKNESS_STROKE_MULTIPLE = 1.0  # thickness must exceed the pair's own pen width, else it's a near-duplicate
OPENING_GAP_MULTIPLIER = 20.0  # gap <= this many multiples of local thickness merges as an opening
SNAP_TOLERANCE_ABS = 1e-2  # plan units; below this a gap is "touching", not a real opening
COLLINEAR_GROUPING_TOLERANCE_FRAC = 0.005  # of plan diagonal -- tight, thickness-INDEPENDENT perpendicular
# tolerance for "these fragments sit on the same physical centerline". Replaces an earlier design
# (round(perp / thickness * 4)) that keyed grouping off each fragment's own recovered thickness --
# found, by direct fragmentation diagnosis against 15x30/30x50 (reports/phase-2-gate.md), to scatter
# real same-wall fragments into different bins whenever their individually-recovered thickness was
# noisy (the same over-production/precision problem documented earlier), which is most fragments.


@dataclass
class WallCandidate:
    start: Point2
    end: Point2
    thickness: float
    axis_bucket: str  # "A" or "B"
    source_segment_indices: tuple[int, int]  # indices into SelectionResult.candidates


@dataclass
class OpeningCandidate:
    host_wall_index: int  # index into PairResult.walls, set after merge
    start: Point2
    end: Point2
    gap_length: float


@dataclass
class PairFunnel:
    """Per-stage counts through the pairing pipeline -- required for the
    per-stage attribution report (gate report item 3): a validity failure
    must be attributable to select vs. pair vs. assemble from the report
    alone, not by re-running with print statements."""

    n_candidates_by_bucket: dict[str, int] = field(default_factory=dict)
    n_candidates_below_length_floor: int = 0
    n_raw_pairs_formed: int = 0
    n_pairs_accepted_greedy: int = 0
    n_pairs_rejected_thickness_outlier: int = 0
    thickness_clusters: list[WidthCluster] = field(default_factory=list)
    n_merges_applied: int = 0
    n_opening_candidates: int = 0


@dataclass
class PairResult:
    walls: list[WallCandidate]
    opening_candidates: list[OpeningCandidate]
    funnel: PairFunnel
    # Diagnostic-only: the accepted, thickness-plausible wall list *before*
    # _collinear_merge runs. Doesn't affect `walls`/`opening_candidates`
    # (the shipped output) at all -- exists so a diagnostic can tell
    # "the merge never fired here" apart from "the merge fired but
    # under-reached" apart from "nothing was ever paired here."
    pre_merge_walls: list[WallCandidate] = field(default_factory=list)


def _deg2rad(d: float) -> float:
    return d * math.pi / 180.0


def _axis_frame(theta_deg: float) -> tuple[Point2, Point2]:
    t = _deg2rad(theta_deg)
    d_a = (math.cos(t), math.sin(t))
    n_a = (-math.sin(t), math.cos(t))
    return d_a, n_a


def _dot(u: Point2, v: Point2) -> float:
    return u[0] * v[0] + u[1] * v[1]


def _midpoint(p0: Point2, p1: Point2) -> Point2:
    return ((p0[0] + p1[0]) / 2.0, (p0[1] + p1[1]) / 2.0)


def _circular_dist_mod_180(a: float, b: float) -> float:
    d = abs(a - b) % 180.0
    return min(d, 180.0 - d)


def _bucket_for(angle_deg: float, theta_deg: float) -> str:
    dist_a = _circular_dist_mod_180(angle_deg, theta_deg)
    dist_b = _circular_dist_mod_180(angle_deg, (theta_deg + 90.0) % 180.0)
    return "A" if dist_a <= dist_b else "B"


@dataclass
class _Projected:
    idx: int
    seg: SelectedSegment
    perp: float
    along_lo: float
    along_hi: float


def _project_bucket(indices: list[int], candidates: list[SelectedSegment], along_dir: Point2, perp_dir: Point2) -> list[_Projected]:
    out = []
    for idx in indices:
        seg = candidates[idx]
        perp = _dot(_midpoint(seg.p0, seg.p1), perp_dir)
        a0, a1 = _dot(seg.p0, along_dir), _dot(seg.p1, along_dir)
        out.append(_Projected(idx=idx, seg=seg, perp=perp, along_lo=min(a0, a1), along_hi=max(a0, a1)))
    return out


def _raw_pairs_in_bucket(projected: list[_Projected], max_search_window: float) -> list[tuple]:
    """Returns tuples (overlap_len, thickness, i_idx, j_idx, along_lo, along_hi, perp_mid).

    Requires thickness (perp offset) to exceed the pair's own average pen
    width (MIN_THICKNESS_STROKE_MULTIPLE). Found necessary directly against
    15x30/30x50: without it, greedy pairing's own sort order (longest
    overlap first, thinnest second) *prefers* near-duplicate candidate
    lines -- two axis-aligned strokes sitting almost exactly on top of each
    other, offset by float/rendering noise well under one pen width, which
    trivially have ~100% overlap and near-zero thickness -- consuming
    segments into these degenerate pairs before real wall-face pairs (whose
    offset is a real multi-point wall thickness) ever get a chance. A wall
    cannot be thinner than the pen used to draw its boundary.
    """
    ordered = sorted(projected, key=lambda p: p.perp)
    pairs = []
    for i in range(len(ordered)):
        pi = ordered[i]
        for j in range(i + 1, len(ordered)):
            pj = ordered[j]
            if pj.perp - pi.perp > max_search_window:
                break
            lo = max(pi.along_lo, pj.along_lo)
            hi = min(pi.along_hi, pj.along_hi)
            overlap_len = hi - lo
            if overlap_len <= 0:
                continue
            shorter = min(pi.along_hi - pi.along_lo, pj.along_hi - pj.along_lo)
            if shorter <= 0 or overlap_len / shorter < MIN_OVERLAP_FRACTION:
                continue
            thickness = pj.perp - pi.perp
            min_thickness = MIN_THICKNESS_STROKE_MULTIPLE * max(pi.seg.stroke_width, pj.seg.stroke_width)
            if thickness < min_thickness:
                continue
            perp_mid = (pi.perp + pj.perp) / 2.0
            pairs.append((overlap_len, thickness, pi.idx, pj.idx, lo, hi, perp_mid))
    return pairs


def _greedy_select_pairs(raw_pairs: list[tuple]) -> list[tuple]:
    # sort: longest overlap first, then thinnest (more plausible) first, then
    # lexicographic on (i,j) for full determinism on exact ties
    ordered = sorted(raw_pairs, key=lambda p: (-p[0], p[1], p[2], p[3]))
    used: set[int] = set()
    accepted = []
    for overlap_len, thickness, i_idx, j_idx, lo, hi, perp_mid in ordered:
        if i_idx in used or j_idx in used:
            continue
        used.add(i_idx)
        used.add(j_idx)
        accepted.append((overlap_len, thickness, i_idx, j_idx, lo, hi, perp_mid))
    return accepted


def _thickness_plausible_clusters(thicknesses: list[float], diagonal: float) -> list[WidthCluster]:
    """Clusters the *log* of thickness, not the raw value, then reports
    cluster bounds back in linear thickness units.

    Found necessary directly against the real corpus: raw-space clustering
    of the surviving pair population produced one giant undifferentiated
    cluster spanning three orders of magnitude (e.g. 15x30: a single
    [0.001, 130.8] cluster) because the population decays smoothly rather
    than having a sharp linear gap -- the KDE valley test never fires.
    Thickness is a strictly-positive, ratio-scale quantity (a plausible
    wall thickness and a 10x-too-thin artifact differ by *ratio*, not by
    absolute amount), so log-space is the natural domain for finding that
    gap, and did resolve a real split on 15x30 where raw-space found none.
    """
    if not thicknesses:
        return []
    logs = [math.log(t) for t in thicknesses if t > 0]
    result = cluster_widths(logs)
    outlier_ceiling = math.log(OUTLIER_THICKNESS_FRAC * diagonal)
    return [
        WidthCluster(low=math.exp(c.low), high=math.exp(c.high), mean=math.exp(c.mean), count=c.count)
        for c in result.clusters
        if c.count >= DEFAULT_MIN_CLUSTER_SIZE and c.mean <= outlier_ceiling
    ]


def _thickness_in_plausible_cluster(thickness: float, clusters: list[WidthCluster], eps: float = 1e-6) -> bool:
    return any(c.low - eps <= thickness <= c.high + eps for c in clusters)


def _bucket_wall(along_dir: Point2, perp_dir: Point2, lo: float, hi: float, perp_mid: float, axis_bucket: str) -> tuple[Point2, Point2]:
    start = (along_dir[0] * lo + perp_dir[0] * perp_mid, along_dir[1] * lo + perp_dir[1] * perp_mid)
    end = (along_dir[0] * hi + perp_dir[0] * perp_mid, along_dir[1] * hi + perp_dir[1] * perp_mid)
    return start, end


def _weighted_median(values_weights: list[tuple[float, float]]) -> float:
    """Standard weighted median: the value at which cumulative weight first
    reaches half the total. Falls back to the plain middle value if total
    weight is degenerate (e.g. all-zero-length fragments, shouldn't happen
    in practice since pair_walls already enforces a length floor)."""
    ordered = sorted(values_weights, key=lambda vw: vw[0])
    total = sum(w for _v, w in ordered)
    if total <= 0:
        return ordered[len(ordered) // 2][0]
    half = total / 2.0
    cum = 0.0
    for v, w in ordered:
        cum += w
        if cum >= half:
            return v
    return ordered[-1][0]


def _cluster_by_perp(idxs: list[int], perp_of: dict[int, float], tolerance: float) -> list[list[int]]:
    """Chain-clusters indices whose perpendicular coordinate is within
    `tolerance` of a neighbor, sorted ascending -- an absolute, thickness-
    independent tolerance (unlike the old `round(perp / thickness * 4)`
    scheme), so two fragments' own noisy recovered thicknesses can no
    longer decide whether they're considered the same physical line."""
    ordered = sorted(idxs, key=lambda i: (perp_of[i], i))
    clusters: list[list[int]] = []
    for i in ordered:
        if clusters and perp_of[i] - perp_of[clusters[-1][-1]] <= tolerance:
            clusters[-1].append(i)
        else:
            clusters.append([i])
    return clusters


def _collinear_merge(
    walls: list[WallCandidate], d_a: Point2, n_a: Point2, diagonal: float
) -> tuple[list[WallCandidate], list[OpeningCandidate]]:
    """Group same-axis wall stubs that sit on the same physical centerline
    -- a TIGHT, absolute perpendicular tolerance (COLLINEAR_GROUPING_
    TOLERANCE_FRAC * diagonal), not each fragment's own noisy recovered
    thickness -- then merge stubs within a group whose end gap sits in
    (SNAP_TOLERANCE_ABS, OPENING_GAP_MULTIPLIER * local thickness], and
    record the merged-over span as an opening candidate. Two distinct
    scales, deliberately not conflated: SNAP_TOLERANCE_ABS is the near-
    exact junction/endpoint tolerance (Track V geometry is exact, so this
    stays tiny); the opening-gap bound is architecture-scaled off the
    merging pieces' own recovered thickness.

    Grouping and the opening-gap bound are deliberately separate concerns
    now: a tight perpendicular tolerance means two genuinely distinct
    near-parallel walls (a party wall, a narrow void) never even enter the
    same group to be considered for merging, regardless of the gap-bound
    logic -- see tests/test_pair.py's two required guardrail cases. The
    REQUIRED along-axis overlap-or-small-gap check (never plain infinite-
    line collinearity) is what stops two same-line-but-unrelated walls in
    different rooms from merging even when the tight perp tolerance alone
    would have grouped them.

    Thickness is recovered as an OUTPUT of each merged group -- the
    length-weighted median of its member fragments' thicknesses -- not
    required as an input to grouping at all.
    """
    if not walls:
        return [], []

    def frame_for(bucket: str) -> tuple[Point2, Point2]:
        return (d_a, n_a) if bucket == "A" else (n_a, d_a)

    perp_of: dict[int, float] = {}
    by_bucket: dict[str, list[int]] = {"A": [], "B": []}
    for wi, w in enumerate(walls):
        _along_dir, perp_dir = frame_for(w.axis_bucket)
        perp_of[wi] = _dot(_midpoint(w.start, w.end), perp_dir)
        by_bucket[w.axis_bucket].append(wi)

    tolerance = COLLINEAR_GROUPING_TOLERANCE_FRAC * diagonal

    merged: list[WallCandidate] = []
    openings: list[OpeningCandidate] = []
    consumed: set[int] = set()

    for bucket in ("A", "B"):
        along_dir, perp_dir = frame_for(bucket)

        def along_lo(wi: int) -> float:
            w = walls[wi]
            return min(_dot(w.start, along_dir), _dot(w.end, along_dir))

        def along_hi(wi: int) -> float:
            w = walls[wi]
            return max(_dot(w.start, along_dir), _dot(w.end, along_dir))

        for idxs in _cluster_by_perp(by_bucket[bucket], perp_of, tolerance):
            if len(idxs) == 1:
                continue

            idxs_sorted = sorted(idxs, key=lambda wi: (along_lo(wi), wi))
            chain_lo = along_lo(idxs_sorted[0])
            chain_hi = along_hi(idxs_sorted[0])
            chain_thick_weighted: list[tuple[float, float]] = [
                (walls[idxs_sorted[0]].thickness, chain_hi - chain_lo)
            ]
            chain_members = [idxs_sorted[0]]
            chain_openings: list[OpeningCandidate] = []

            def flush_chain():
                perp_mid = sum(perp_of[wi] for wi in chain_members) / len(chain_members)
                thickness = _weighted_median(chain_thick_weighted)
                start, end = _bucket_wall(along_dir, perp_dir, chain_lo, chain_hi, perp_mid, bucket)
                wall_idx = len(merged)
                merged.append(
                    WallCandidate(
                        start=start,
                        end=end,
                        thickness=thickness,
                        axis_bucket=bucket,
                        source_segment_indices=walls[chain_members[0]].source_segment_indices,
                    )
                )
                for oc in chain_openings:
                    oc.host_wall_index = wall_idx
                    openings.append(oc)
                for wi in chain_members:
                    consumed.add(wi)

            for wi in idxs_sorted[1:]:
                gap = along_lo(wi) - chain_hi
                local_thickness = _weighted_median(chain_thick_weighted + [(walls[wi].thickness, along_hi(wi) - along_lo(wi))])
                gap_bound = OPENING_GAP_MULTIPLIER * local_thickness
                frag_len = along_hi(wi) - along_lo(wi)
                if SNAP_TOLERANCE_ABS < gap <= gap_bound:
                    gap_start, gap_end = _bucket_wall(
                        along_dir, perp_dir, chain_hi, along_lo(wi), perp_of[wi], bucket
                    )
                    chain_openings.append(OpeningCandidate(host_wall_index=-1, start=gap_start, end=gap_end, gap_length=gap))
                    chain_hi = along_hi(wi)
                    chain_thick_weighted.append((walls[wi].thickness, frag_len))
                    chain_members.append(wi)
                elif gap <= SNAP_TOLERANCE_ABS:
                    # already touching/overlapping -- treat as continuous, fold in
                    chain_hi = max(chain_hi, along_hi(wi))
                    chain_thick_weighted.append((walls[wi].thickness, frag_len))
                    chain_members.append(wi)
                else:
                    flush_chain()
                    chain_lo = along_lo(wi)
                    chain_hi = along_hi(wi)
                    chain_thick_weighted = [(walls[wi].thickness, frag_len)]
                    chain_members = [wi]
                    chain_openings = []
            flush_chain()

    for wi, w in enumerate(walls):
        if wi not in consumed:
            merged.append(w)

    return merged, openings


def pair_walls(selection: SelectionResult, page_size_px: tuple[float, float]) -> PairResult:
    diagonal = math.hypot(*page_size_px)
    funnel = PairFunnel()

    # Length floor before pairing is even attempted: the axis-aligned
    # candidate population is dominated by sub-percent-of-diagonal noise
    # (accidentally axis-aligned hatch remnants, ticks, symbol edges) --
    # found directly against 15x30/30x50 while building this module (90th
    # percentile candidate length is under 0.34% of diagonal on both, while
    # this corpus's true wall length runs to tens of percent). Without this
    # floor, pairing produces thousands of sub-unit-length "walls" that
    # aren't real wall faces at all.
    length_floor = MIN_CANDIDATE_LENGTH_FRAC * diagonal
    long_enough = [i for i, seg in enumerate(selection.candidates) if seg.length >= length_floor]
    funnel.n_candidates_below_length_floor = len(selection.candidates) - len(long_enough)

    bucket_of = {i: _bucket_for(selection.candidates[i].angle_deg, selection.theta_deg) for i in long_enough}
    indices_a = [i for i in long_enough if bucket_of[i] == "A"]
    indices_b = [i for i in long_enough if bucket_of[i] == "B"]
    funnel.n_candidates_by_bucket = {"A": len(indices_a), "B": len(indices_b)}

    d_a, n_a = _axis_frame(selection.theta_deg)
    max_search_window = MAX_THICKNESS_SEARCH_FRAC * diagonal

    proj_a = _project_bucket(indices_a, selection.candidates, d_a, n_a)
    proj_b = _project_bucket(indices_b, selection.candidates, n_a, d_a)

    raw_a = _raw_pairs_in_bucket(proj_a, max_search_window)
    raw_b = _raw_pairs_in_bucket(proj_b, max_search_window)
    funnel.n_raw_pairs_formed = len(raw_a) + len(raw_b)

    accepted_a = _greedy_select_pairs(raw_a)
    accepted_b = _greedy_select_pairs(raw_b)
    funnel.n_pairs_accepted_greedy = len(accepted_a) + len(accepted_b)

    all_accepted = [("A", p) for p in accepted_a] + [("B", p) for p in accepted_b]
    thicknesses = [p[1] for _bucket, p in all_accepted]
    plausible_clusters = _thickness_plausible_clusters(thicknesses, diagonal)
    funnel.thickness_clusters = plausible_clusters

    walls: list[WallCandidate] = []
    for bucket, (overlap_len, thickness, i_idx, j_idx, lo, hi, perp_mid) in all_accepted:
        if not _thickness_in_plausible_cluster(thickness, plausible_clusters):
            funnel.n_pairs_rejected_thickness_outlier += 1
            continue
        along_dir, perp_dir = (d_a, n_a) if bucket == "A" else (n_a, d_a)
        start, end = _bucket_wall(along_dir, perp_dir, lo, hi, perp_mid, bucket)
        walls.append(
            WallCandidate(
                start=start,
                end=end,
                thickness=abs(thickness),
                axis_bucket=bucket,
                source_segment_indices=(i_idx, j_idx),
            )
        )

    merged_walls, opening_candidates = _collinear_merge(walls, d_a, n_a, diagonal)
    funnel.n_merges_applied = len(walls) - len(merged_walls) + len(opening_candidates)
    funnel.n_opening_candidates = len(opening_candidates)

    return PairResult(
        walls=merged_walls, opening_candidates=opening_candidates, funnel=funnel, pre_merge_walls=walls
    )
