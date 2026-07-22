"""Unit tests for extraction/trackv/assemble.py's endpoint-snap + junction
assembly and open-cycle localization.

Builds PairResult fixtures directly (assemble.py's actual input type).
"""

from __future__ import annotations

from extraction.trackv.assemble import assemble
from extraction.trackv.pair import OpeningCandidate, PairFunnel, PairResult, WallCandidate


def _wall(start, end, thickness=10.0, bucket="A", src=(0, 1)):
    return WallCandidate(start=start, end=end, thickness=thickness, axis_bucket=bucket, source_segment_indices=src)


def _pair_result(walls, openings=None):
    return PairResult(walls=walls, opening_candidates=openings or [], funnel=PairFunnel())


def test_closed_rectangle_snaps_into_four_junctions_and_one_cycle():
    walls = [
        _wall((0, 0), (100, 0.2)),  # slightly off, must snap to a shared corner
        _wall((100, 0), (100, 80)),
        _wall((100.1, 80), (0, 80)),
        _wall((0, 80.1), (0, 0)),
    ]
    result = assemble(_pair_result(walls), scale_to_gt_frame=1.0)

    assert len(result.walls) == 4
    assert len(result.junctions) == 4
    assert all(j.junction_type == "L" for j in result.junctions)
    assert result.open_cycle_diagnostics == []
    assert result.n_cycle_basis_found == 1
    assert result.n_connected_components == 1


def test_dangling_wall_end_is_localized_as_open_cycle():
    walls = [
        _wall((0, 0), (100, 0)),
        _wall((100, 0), (100, 80)),
        _wall((100, 80), (0, 80)),
        # missing 4th wall closing back to (0, 0) -- (0, 80) dangles
    ]
    result = assemble(_pair_result(walls), scale_to_gt_frame=1.0)

    assert len(result.open_cycle_diagnostics) == 2  # both (0,0) and (0,80) dangle
    dangling_points = {d.dangling_point for d in result.open_cycle_diagnostics}
    assert (0.0, 0.0) in dangling_points
    assert (0.0, 80.0) in dangling_points
    assert result.n_cycle_basis_found == 0


def test_scale_to_gt_frame_is_applied_to_geometry():
    walls = [_wall((0, 0), (10, 0), thickness=2.0)]
    result = assemble(_pair_result(walls), scale_to_gt_frame=2.0)
    w = result.walls[0]
    assert w.start == (0.0, 0.0)
    assert w.end == (20.0, 0.0)
    assert abs(w.thickness - 4.0) < 1e-9


def test_junction_requires_at_least_one_wall_no_degenerate_entries():
    # a zero-length wall after snap (start == end) must not produce a
    # junction with an empty walls list (schema requires min_length=1)
    walls = [_wall((5.0, 5.0), (5.0, 5.0 + 1e-4))]
    result = assemble(_pair_result(walls), scale_to_gt_frame=1.0)
    assert all(len(j.wall_ids) >= 1 for j in result.junctions)
    assert result.n_degenerate_zero_length_walls == 1
