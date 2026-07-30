"""Per-wall ink-edge distance measurement (Measurement 1 core).

For a GT wall centerline, build a perpendicular ink-density profile
(fraction of along-wall samples that hit ink, at each perpendicular offset
v from the GT line) and read off the near/far edge of the ink band
containing (or nearest to) v=0 on each side independently. Centerline
convention -> both sides ~thickness/2, roughly equal. Edge convention ->
one side ~0, other side ~full thickness.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np


@dataclass
class WallEdgeMeasurement:
    wall_id: str
    length_mm: float
    d_neg: float | None  # mm, distance to nearest ink/blank TRANSITION on the "-v" side (M1's "nearest edge")
    d_neg_on_ink: bool  # whether v=0 itself started inside ink for this side's read
    d_pos: float | None
    d_pos_on_ink: bool
    n_samples: int
    cover_at_zero: float  # fraction of u-samples with ink exactly at v=0
    # Fallback far-boundary reads: distance to where the SAME contiguous ink
    # run (the one that produced d_neg / d_pos) ends, continuing outward.
    # Equals d_neg / d_pos when that run's near edge (the on_ink=True case)
    # already IS v=0's own run; used only when a wall's whole thickness
    # sits on one side of v=0 (one direction's scan finds nothing at all),
    # so M2 thickness reconstruction has a fallback beyond "sum the two
    # sides" (which requires both sides to be non-None).
    d_neg_far: float | None
    d_pos_far: float | None


def _exclude_intervals(wall: dict, length: float, end_pad: float) -> list[tuple[float, float]]:
    """u-intervals (mm along wall) to exclude from profiling: near both ends
    (junction/corner contamination from crossing walls) and around each
    opening (door/window swing ink interrupts + contaminates the band)."""
    intervals = [(-1.0, end_pad), (length - end_pad, length + 1.0)]
    for o in wall.get("openings", []):
        c = o["center_offset"]
        w = o["width"]
        pad = max(w * 0.25, 100.0)
        intervals.append((c - w / 2 - pad, c + w / 2 + pad))
    return intervals


def _u_allowed(u: float, excluded: list[tuple[float, float]]) -> bool:
    return not any(lo <= u <= hi for lo, hi in excluded)


def measure_wall(calib, mask: np.ndarray, wall: dict, *, v_max: float = 400.0, v_step: float = 2.0,
                  u_step: float = 8.0, end_pad: float = 160.0, cover_thresh: float = 0.4) -> WallEdgeMeasurement:
    sx, sy = wall["start"], wall["end"]
    length = math.hypot(sy[0] - sx[0], sy[1] - sx[1])
    if length <= 0:
        return WallEdgeMeasurement(wall["id"], 0.0, None, False, None, False, 0, 0.0, None, None)
    ux, uy = (sy[0] - sx[0]) / length, (sy[1] - sx[1]) / length
    vx, vy = -uy, ux  # +90 deg rotation (mm space, GT axes)

    excluded = _exclude_intervals(wall, length, end_pad)
    u_vals = np.arange(0.0, length, u_step)
    u_vals = np.array([u for u in u_vals if _u_allowed(u, excluded)])
    if len(u_vals) < 3:
        return WallEdgeMeasurement(wall["id"], length, None, False, None, False, 0, 0.0, None, None)

    v_vals = np.arange(-v_max, v_max + v_step, v_step)
    h, w = mask.shape
    profile = np.zeros(len(v_vals))
    for vi, v in enumerate(v_vals):
        hit = 0
        for u in u_vals:
            mx = sx[0] + u * ux + v * vx
            my = sx[1] + u * uy + v * vy
            px, py = calib.mm_to_px(mx, my)
            ix, iy = int(round(px)), int(round(py))
            if 0 <= iy < h and 0 <= ix < w and mask[iy, ix]:
                hit += 1
        profile[vi] = hit / len(u_vals)

    ink = profile > cover_thresh
    i0 = int(np.argmin(np.abs(v_vals)))
    cover_at_zero = float(profile[i0])

    def scan(direction: int) -> tuple[float | None, bool, float | None]:
        # direction=+1 -> increasing v index; -1 -> decreasing.
        # Returns (near_dist, started_on_ink, far_dist) where far_dist walks
        # through the contiguous run (whether entered immediately or after
        # a blank gap) to its far boundary -- the M2 fallback.
        i = i0
        n = len(v_vals)
        on_ink_at_start = bool(ink[i0])
        if on_ink_at_start:
            j = i
            while 0 <= j + direction < n and ink[j + direction]:
                j += direction
            far = abs(v_vals[j] - v_vals[i0])
            return far, True, far
        else:
            j = i
            found = None
            while 0 <= j + direction < n:
                j += direction
                if ink[j]:
                    found = j
                    break
            if found is None:
                return None, False, None
            near = abs(v_vals[found] - v_vals[i0])
            k = found
            while 0 <= k + direction < n and ink[k + direction]:
                k += direction
            far = abs(v_vals[k] - v_vals[i0])
            return near, False, far

    d_neg, neg_on, d_neg_far = scan(-1)
    d_pos, pos_on, d_pos_far = scan(+1)

    return WallEdgeMeasurement(wall["id"], length, d_neg, neg_on, d_pos, pos_on, len(u_vals), cover_at_zero,
                                d_neg_far, d_pos_far)
