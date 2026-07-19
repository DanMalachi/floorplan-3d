"""Hand-built synthetic wall-blob fixtures with known junction topology
(L/T/X), used to unit-test skeleton.py against ground truth before trusting
it on real ResPlan data."""
from __future__ import annotations

from shapely.geometry import box
from shapely.ops import unary_union

WALL_DEPTH = 4.0


def l_junction():
    """One 90-degree bend: 2 wall runs, 1 bend junction, 2 end junctions."""
    horiz = box(0, 0, 20, WALL_DEPTH)
    vert = box(20 - WALL_DEPTH, 0, 20, 24)
    return unary_union([horiz, vert])


def t_junction():
    """A stem meeting the middle of a run: 3 wall runs, 1 T hub, 3 ends."""
    horiz = box(0, 0, 24, WALL_DEPTH)
    vert = box(10, WALL_DEPTH, 10 + WALL_DEPTH, 20)
    return unary_union([horiz, vert])


def x_junction():
    """Two runs crossing at their midpoints: 4 wall runs, 1 X hub, 4 ends."""
    horiz = box(0, 10, 24, 10 + WALL_DEPTH)
    vert = box(10, 0, 10 + WALL_DEPTH, 24)
    return unary_union([horiz, vert])
