"""Phase-0 GT audit: recover a per-file px<->mm similarity transform.

Read-only measurement tool. Does not touch extraction/, eval/, or GT files.

GT wall coordinates are real mm (see reports/phase-0-gt-audit.md method
note) but image_transform.matrix in every GT file is an unpopulated
identity placeholder, so this reconstructs px<->mm independently per file:
render the source at the exact pixel grid the legacy tracer worked in
(image_transform.source_px), then find (sx, tx, sy, ty) mapping GT mm ->
render px by maximizing alignment between GT wall-position peaks and
source ink-density peaks, independently per axis (rotation fixed at 0;
verified separately that wall directions cluster at 0/90 degrees).
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path

import fitz
import numpy as np

CORPUS_GT = Path("data/corpus/gt_provisional")
CORPUS_SRC = Path("data/corpus/incoming")


@dataclass
class Calibration:
    plan_id: str
    zoom: float
    img_w: int
    img_h: int
    sx: float
    tx: float
    sy: float
    ty: float
    residual_x: float  # 0..1, higher = better alignment
    residual_y: float
    envelope_quality: float = 0.0  # 0..1, aspect-ratio match of the chosen building-envelope bbox
    consistent: bool = True  # |sx| and |sy| agree within tolerance (similarity-transform sanity gate)
    strategy: str = ""

    def mm_to_px(self, x: float, y: float) -> tuple[float, float]:
        return self.sx * x + self.tx, self.sy * y + self.ty


def load_gt(plan_id: str) -> dict:
    return json.loads((CORPUS_GT / f"{plan_id}.json").read_text(encoding="utf-8"))


def source_path_for(gt: dict) -> Path:
    fn = gt["source"]["filename"]
    return CORPUS_SRC / fn


def render_gray(src_path: Path, source_px: tuple[int, int]) -> np.ndarray:
    """Render page 0 at the exact pixel grid GT's source_px records."""
    doc = fitz.open(src_path)
    page = doc[0]
    w_pt, h_pt = page.rect.width, page.rect.height
    target_w, target_h = source_px
    zoom = ((target_w / w_pt) + (target_h / h_pt)) / 2
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    if pix.n >= 3:
        gray = (0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]).astype(np.float32)
    else:
        gray = arr[:, :, 0].astype(np.float32)
    doc.close()
    return gray, zoom


def ink_mask(gray: np.ndarray) -> np.ndarray:
    """Binary ink mask via Otsu threshold (per-image, handles varying jpg exposure)."""
    import cv2

    g8 = gray.astype(np.uint8)
    thresh, mask = cv2.threshold(g8, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return mask > 0


def wall_angle_deg(w: dict) -> float:
    dx = w["end"][0] - w["start"][0]
    dy = w["end"][1] - w["start"][1]
    return math.degrees(math.atan2(dy, dx)) % 180


def axis_aligned_fraction(walls: list[dict], tol_deg: float = 8.0) -> float:
    if not walls:
        return 0.0
    n_aligned = 0
    for w in walls:
        a = wall_angle_deg(w)
        d0 = min(a, 180 - a)
        d90 = abs(a - 90)
        if d0 <= tol_deg or d90 <= tol_deg:
            n_aligned += 1
    return n_aligned / len(walls)


def gt_axis_peaks(walls: list[dict], axis: str, tol_deg: float = 8.0) -> list[tuple[float, float]]:
    """Peaks (position, weight=length) of walls nearly perpendicular to `axis`.

    axis='x' -> vertical walls (constant-x) contribute an x peak.
    axis='y' -> horizontal walls (constant-y) contribute a y peak.
    """
    out = []
    for w in walls:
        a = wall_angle_deg(w)
        length = math.hypot(w["end"][0] - w["start"][0], w["end"][1] - w["start"][1])
        if length <= 0:
            continue
        if axis == "x":
            # vertical wall: angle near 90
            if abs(a - 90) <= tol_deg:
                pos = (w["start"][0] + w["end"][0]) / 2
                out.append((pos, length))
        else:
            if min(a, 180 - a) <= tol_deg:
                pos = (w["start"][1] + w["end"][1]) / 2
                out.append((pos, length))
    return out


def ink_density_profile(mask: np.ndarray, axis: str) -> np.ndarray:
    """Column (axis='x') or row (axis='y') ink-pixel counts."""
    if axis == "x":
        return mask.sum(axis=0).astype(np.float64)
    return mask.sum(axis=1).astype(np.float64)


_TOL_MM = 15.0  # fixed real-world alignment tolerance -- NOT a fixed pixel
# window. A fixed-px window lets a degenerate near-zero scale collapse many
# distinct GT peaks into one strong ink row and spuriously "match" all of
# them (verified: on a real corpus file this scored a collapsed sy=-0.0186
# solution higher, 0.68, than the true-scale sy=0.0977, 0.25). Scaling the
# window by |s| makes a collapsed scale require near-exact pixel alignment,
# which random ink structure can't satisfy across 20 independent peaks.


def score_transform(peaks: list[tuple[float, float]], profile: np.ndarray, s: float, t: float) -> float:
    total_w = sum(w for _, w in peaks) or 1.0
    score = 0.0
    n = len(profile)
    win = max(1, int(round(abs(s) * _TOL_MM)))
    for pos, w in peaks:
        px = s * pos + t
        i = int(round(px))
        if 0 <= i < n:
            lo, hi = max(0, i - win), min(n, i + win + 1)
            score += w * profile[lo:hi].max()
    max_possible = total_w * profile.max()
    return score / max_possible if max_possible > 0 else 0.0


def fit_axis(peaks: list[tuple[float, float]], profile: np.ndarray, s_guess: float, t_guess: float,
             n_grid: int = 250) -> tuple[float, float, float]:
    """Coarse-to-fine grid search + local refine over (s, t), trying both signs of s.

    s range is an ABSOLUTE physically-plausible band (the drawing may occupy
    anywhere from a small fraction to nearly all of the rendered page --
    margins vary a lot across this corpus), not a multiplicative window
    around a naive full-bbox guess, which was found (15x30 plan) to put the
    true optimum outside the search window and silently return a
    plausible-looking but wrong local optimum.
    """
    best = (s_guess, t_guess, -1.0)
    positions = [p for p, _ in peaks]
    if not positions:
        return best
    pmin, pmax = min(positions), max(positions)
    pspan = max(pmax - pmin, 1.0)
    n = len(profile)

    def refine(s0: float, t0: float, sc0: float, s_win: float, t_win: float, iters: int) -> tuple[float, float, float]:
        s, t, sc = s0, t0, sc0
        for _ in range(iters):
            improved = False
            for ds in (-s_win, 0, s_win):
                for dt in (-t_win, 0, t_win):
                    if ds == 0 and dt == 0:
                        continue
                    sc2 = score_transform(peaks, profile, s + ds, t + dt)
                    if sc2 > sc:
                        s, t, sc = s + ds, t + dt, sc2
                        improved = True
            if not improved:
                s_win *= 0.5
                t_win *= 0.5
                if s_win < abs(s) * 1e-4 and t_win < 0.05:
                    break
        return s, t, sc

    for sign in (1.0, -1.0):
        # s such that the peak span maps to between 20% and 130% of image extent
        s_lo = sign * 0.15 * n / pspan
        s_hi = sign * 1.3 * n / pspan
        s_lo, s_hi = min(s_lo, s_hi), max(s_lo, s_hi)
        for s in np.linspace(s_lo, s_hi, n_grid):
            if s == 0:
                continue
            t_center = n / 2 - s * (pmin + pmax) / 2
            for t in np.linspace(t_center - n * 0.4, t_center + n * 0.4, 40):
                sc = score_transform(peaks, profile, s, t)
                if sc > best[2]:
                    best = (s, t, sc)
    s, t, sc = best
    s, t, sc = refine(s, t, sc, abs(s) * 0.05, n * 0.02, 12)
    return s, t, sc


def envelope_bbox(mask: np.ndarray, gt_aspect: float, iterations: int = 1) -> tuple[float, float, float, float, float]:
    """Largest ink contour whose bbox aspect ratio best matches GT's, after
    dilating to fuse broken wall strokes into one blob. Returns
    (x0,y0,x1,y1,quality) in px; quality in [0,1] = 1 - aspect mismatch."""
    import cv2

    m8 = (mask.astype(np.uint8)) * 255
    # A single dilate pass at ~1% of the image's short side fuses broken
    # wall strokes into one blob without also fusing SEPARATE page regions
    # (floor plan vs. an unrelated elevation drawing / legend table) that
    # sit close together -- verified 2 iterations over-merges those on the
    # 733062873 plan, collapsing everything into one page-spanning contour.
    # `iterations` is swept by calibrate()'s strategy ensemble rather than
    # fixed, since the right amount of fusing is page-layout-dependent.
    k = max(3, int(round(min(mask.shape) * 0.01)))
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (k, k))
    dil = cv2.dilate(m8, kernel, iterations=iterations)
    contours, _ = cv2.findContours(dil, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        h, w = mask.shape
        return 0, 0, w, h, 0.0
    img_area = mask.shape[0] * mask.shape[1]
    candidates = []
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        area = w * h
        # Lower bound only excludes small legend/table blobs. (A full-page
        # candidate is NOT excluded by size: aspect-ratio match already
        # discriminates a genuine tightly-cropped plan, whose bbox
        # legitimately IS ~the whole page -- e.g. 733514932 -- from a
        # page-border artifact that happens to span the page but has the
        # WRONG aspect -- e.g. 733062873. An earlier version hard-excluded
        # anything > 85% of page area to fix the latter and broke the
        # former; aspect-ratio ranking alone handles both correctly.)
        if area < img_area * 0.05:
            continue
        aspect = w / h if h else 0
        mismatch = abs(math.log(aspect / gt_aspect)) if aspect > 0 and gt_aspect > 0 else 99
        candidates.append((mismatch, area, x, y, x + w, y + h))
    if not candidates:
        h, w = mask.shape
        return 0, 0, w, h, 0.0
    # prefer close aspect match, break ties by larger area
    candidates.sort(key=lambda c: (c[0], -c[1]))
    mismatch, area, x0, y0, x1, y1 = candidates[0]
    quality = max(0.0, 1.0 - mismatch)
    return x0, y0, x1, y1, quality


_CONSISTENCY_TOL = 0.35  # |log(|sx|/|sy|)| gate for a similarity transform


def calibrate(plan_id: str) -> tuple[Calibration, np.ndarray, np.ndarray]:
    """Try several independent calibration strategies and pick the best one
    that passes a same-scale sanity gate (|sx|~=|sy|, required by a true
    similarity transform on an axis-aligned plan). Not tuned per file: the
    same fixed strategy list and the same gate run on all 15 files. A file
    where NO strategy passes the gate is marked inconsistent (Calibration
    .consistent=False) rather than silently kept -- callers should exclude
    or separately flag those in aggregate reporting.
    """
    gt = load_gt(plan_id)
    walls = gt["walls"]
    src = source_path_for(gt)
    source_px = tuple(gt["image_transform"]["source_px"])
    gray, zoom = render_gray(src, source_px)
    mask = ink_mask(gray)
    h, w = mask.shape

    xs = [pt[0] for wl in walls for pt in (wl["start"], wl["end"])]
    ys = [pt[1] for wl in walls for pt in (wl["start"], wl["end"])]
    gt_xmin, gt_xmax = min(xs), max(xs)
    gt_ymin, gt_ymax = min(ys), max(ys)
    gt_w = gt_xmax - gt_xmin
    gt_h = gt_ymax - gt_ymin
    gt_aspect = gt_w / gt_h if gt_h else 1.0

    x_peaks = gt_axis_peaks(walls, "x")
    y_peaks = gt_axis_peaks(walls, "y")
    x_profile = ink_density_profile(mask, "x")
    y_profile = ink_density_profile(mask, "y")

    def consistent(sx: float, sy: float) -> bool:
        if sx == 0 or sy == 0:
            return False
        return abs(math.log(abs(sx) / abs(sy))) < _CONSISTENCY_TOL

    envelopes = []  # (sx, tx, sy, ty, rx, ry, equal, name)
    for it in (1, 2):
        ex0, ey0, ex1, ey1, equal = envelope_bbox(mask, gt_aspect, iterations=it)
        sx_env = (ex1 - ex0) / gt_w if gt_w else 1.0
        sy_env = (ey1 - ey0) / gt_h if gt_h else 1.0
        tx_env = ex0 - sx_env * gt_xmin
        ty_env = ey0 - sy_env * gt_ymin
        rx = score_transform(x_peaks, x_profile, sx_env, tx_env)
        ry = score_transform(y_peaks, y_profile, sy_env, ty_env)
        envelopes.append((sx_env, tx_env, sy_env, ty_env, rx, ry, equal, f"envelope(it={it})"))

    # A high-confidence envelope match (bbox aspect ratio near-identical to
    # GT's own) is trusted directly, bypassing score_transform entirely --
    # verified (733062873, 732584435 plans, both containing dense periodic
    # CAD grid / uniform poche fill) that score_transform's peak/profile
    # search reliably converges to the SAME wrong, high-scoring aliased
    # optimum regardless of dilation seed, rating it above the visually-
    # correct envelope match every time. Aspect-ratio match on the outer
    # building envelope is a non-gameable signal that grid aliasing can't
    # fool the same way.
    good_envelopes = [e for e in envelopes if e[6] >= 0.85 and consistent(e[0], e[2])]
    if good_envelopes:
        sx, tx, sy, ty, rx, ry, equal, name = max(good_envelopes, key=lambda e: e[6])
    else:
        candidates = list(envelopes)
        for sx_env, tx_env, sy_env, ty_env, _, _, equal, _ in envelopes:
            sx_f, tx_f, rx_f = fit_axis(x_peaks, x_profile, sx_env, tx_env)
            sy_f, ty_f, ry_f = fit_axis(y_peaks, y_profile, sy_env, ty_env)
            candidates.append((sx_f, tx_f, sy_f, ty_f, rx_f, ry_f, equal, "peakfit"))

        def combined_score(c):
            _, _, _, _, rx, ry, equal, _ = c
            return min(rx, ry) + 0.1 * equal

        gated = [c for c in candidates if consistent(c[0], c[2])]
        pool = gated if gated else candidates
        best = max(pool, key=combined_score)
        sx, tx, sy, ty, rx, ry, equal, name = best

    calib = Calibration(plan_id, zoom, w, h, sx, tx, sy, ty, rx, ry)
    calib.envelope_quality = equal
    calib.consistent = consistent(sx, sy)
    calib.strategy = name
    return calib, mask, gray
