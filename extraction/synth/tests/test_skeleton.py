import math

from extraction.synth.qa.fixtures import WALL_DEPTH, l_junction, t_junction, x_junction
from extraction.synth.skeleton import extract_wall_skeleton


def _degree_counts(result):
    return sorted(len(j.segment_indices) for j in result.junctions)


def test_l_junction_topology():
    result = extract_wall_skeleton(l_junction(), WALL_DEPTH)
    assert len(result.segments) == 2
    assert _degree_counts(result) == [1, 1, 2]  # two ends + one bend
    assert all(s.thickness > 0 for s in result.segments)
    assert result.flags == []


def test_t_junction_topology():
    result = extract_wall_skeleton(t_junction(), WALL_DEPTH)
    assert len(result.segments) == 3
    assert _degree_counts(result) == [1, 1, 1, 3]  # three ends + one T hub


def test_x_junction_topology():
    result = extract_wall_skeleton(x_junction(), WALL_DEPTH)
    assert len(result.segments) == 4
    assert _degree_counts(result) == [1, 1, 1, 1, 4]  # four ends + one X hub


def test_thickness_recovered_close_to_nominal():
    result = extract_wall_skeleton(t_junction(), WALL_DEPTH)
    for s in result.segments:
        assert abs(s.thickness - WALL_DEPTH) < 1.5  # distance-transform approx, generous tolerance


def test_junctions_coincide_with_segment_endpoints():
    result = extract_wall_skeleton(x_junction(), WALL_DEPTH)
    for j in result.junctions:
        for seg_idx in j.segment_indices:
            seg = result.segments[seg_idx]
            d_start = math.hypot(j.point[0] - seg.start[0], j.point[1] - seg.start[1])
            d_end = math.hypot(j.point[0] - seg.end[0], j.point[1] - seg.end[1])
            assert min(d_start, d_end) < 1e-6


def test_empty_geometry_flagged_not_crashed():
    from shapely.geometry import Polygon

    result = extract_wall_skeleton(Polygon(), WALL_DEPTH)
    assert result.segments == []
    assert "empty_wall_geometry" in result.flags
