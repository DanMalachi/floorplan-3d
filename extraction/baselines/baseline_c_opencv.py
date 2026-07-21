"""Baseline (c) — classical-only OpenCV pipeline (docs/extraction-plan.md
Phase 1): binarize -> morphological open -> HoughLinesP -> heuristic
clustering into wall centerlines + thickness. No ML, no downloads, no API
calls. Deliberately does not detect openings or reconstruct rooms — that is
an honest Phase-1 finding (Phase 4/5 own that work), not a bug.

Usage: python -m extraction.baselines.baseline_c_opencv
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import cv2
import fitz  # PyMuPDF
import numpy as np

from eval.registry.registry import load_registry
from extraction.baselines.common import build_envelope, write_prediction

PIPELINE_VERSION = "baseline-c-opencv-v1"
OUT_DIR = Path("data/baselines_out/c_opencv")


def load_image(source_file: Path) -> np.ndarray:
    """Returns a grayscale uint8 image. Rasterizes page 0 at 150 DPI for
    PDFs; loads raster files directly."""
    if source_file.suffix.lower() == ".pdf":
        doc = fitz.open(source_file)
        page = doc[0]
        pix = page.get_pixmap(dpi=150)
        arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        if pix.n >= 3:
            gray = cv2.cvtColor(arr[:, :, :3], cv2.COLOR_RGB2GRAY)
        else:
            gray = arr[:, :, 0]
        return gray
    img = cv2.imread(str(source_file), cv2.IMREAD_GRAYSCALE)
    if img is None:
        raise ValueError(f"could not load image: {source_file}")
    return img


def binarize(gray: np.ndarray) -> np.ndarray:
    """Union of global Otsu and local adaptive threshold — catches both
    solid poche fills (global) and thin single-stroke lines on uneven
    scan backgrounds (adaptive). Output: 1 = ink, 0 = background."""
    _, otsu = cv2.threshold(gray, 0, 1, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    adaptive = cv2.adaptiveThreshold(
        gray, 1, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, blockSize=35, C=10
    )
    return np.clip(otsu.astype(np.uint8) + adaptive.astype(np.uint8), 0, 1)


def estimate_stroke_radius(mask: np.ndarray) -> float:
    from scipy.ndimage import distance_transform_edt

    dist = distance_transform_edt(mask)
    nonzero = dist[mask > 0]
    if nonzero.size == 0:
        return 2.0
    return float(np.median(nonzero))


def morphological_clean(mask: np.ndarray, stroke_radius: float) -> np.ndarray:
    ksize = max(1, round(stroke_radius))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ksize, ksize))
    opened = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, kernel)
    return opened


def hough_lines(mask: np.ndarray) -> list[tuple[float, float, float, float]]:
    lines = cv2.HoughLinesP(
        mask * 255, rho=1, theta=math.pi / 180, threshold=30, minLineLength=15, maxLineGap=8
    )
    if lines is None:
        return []
    return [tuple(map(float, np.asarray(line).ravel())) for line in lines]


def cluster_lines_to_walls(
    lines: list[tuple[float, float, float, float]], dist_transform: np.ndarray, angle_bin_deg: float = 5.0, offset_tol_px: float = 6.0
) -> list[dict]:
    """Heuristic clustering: bin by orientation, then merge lines within
    `offset_tol_px` perpendicular distance of each other in the same bin
    into one wall centerline spanning their combined projection extent."""
    groups: dict[tuple[int, int], list[tuple[float, float, float, float]]] = {}
    for (x1, y1, x2, y2) in lines:
        angle = math.degrees(math.atan2(y2 - y1, x2 - x1)) % 180
        bin_idx = round(angle / angle_bin_deg)
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy)
        if length == 0:
            continue
        nx, ny = -dy / length, dx / length  # unit perpendicular
        offset = nx * x1 + ny * y1
        offset_bin = round(offset / offset_tol_px)
        groups.setdefault((bin_idx, offset_bin), []).append((x1, y1, x2, y2))

    walls: list[dict] = []
    for wid, (key, group) in enumerate(groups.items()):
        angle_bin, _ = key
        theta = math.radians(angle_bin * angle_bin_deg)
        dirv = np.array([math.cos(theta), math.sin(theta)])
        pts = []
        for (x1, y1, x2, y2) in group:
            pts.append(np.array([x1, y1]))
            pts.append(np.array([x2, y2]))
        pts = np.array(pts)
        centroid = pts.mean(axis=0)
        projections = (pts - centroid) @ dirv
        p_min, p_max = projections.min(), projections.max()
        start = centroid + dirv * p_min
        end = centroid + dirv * p_max
        length = float(np.hypot(*(end - start)))
        if length < 10.0:
            continue
        mid = ((start + end) / 2).astype(int)
        my = min(max(mid[1], 0), dist_transform.shape[0] - 1)
        mx = min(max(mid[0], 0), dist_transform.shape[1] - 1)
        thickness = float(dist_transform[my, mx]) * 2.0
        walls.append({
            "id": f"w{wid}",
            "start": [float(start[0]), float(start[1])],
            "end": [float(end[0]), float(end[1])],
            "thickness": max(thickness, 1.0),
            "curvature": 0.0,
            "role": "unconfirmed",
            "openings": [],
            "confidence": 0.4,
            "evidence": ["classical"],
            "flags": [],
        })
    return walls


def run_one(source_file: Path, entry) -> dict:
    from scipy.ndimage import distance_transform_edt

    gray = load_image(source_file)
    mask = binarize(gray)
    radius = estimate_stroke_radius(mask)
    cleaned = morphological_clean(mask, radius)
    lines = hough_lines(cleaned)
    dist = distance_transform_edt(cleaned)
    walls = cluster_lines_to_walls(lines, dist)

    return build_envelope(
        source_path=source_file,
        encoding_class=entry.encoding_class,
        convention_class=entry.convention_class,
        scope_class=entry.scope_class,
        router_confidence=entry.router_confidence,
        pipeline_version=PIPELINE_VERSION,
        walls=walls,
        source_px=(gray.shape[1], gray.shape[0]),
    )


def main() -> int:
    entries = [e for e in load_registry() if e.gt_status != "none"]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    n_ok, n_invalid = 0, 0
    for entry in entries:
        source_file = Path(entry.source_file)
        try:
            plan = run_one(source_file, entry)
        except Exception as exc:  # noqa: BLE001 - a baseline that crashes on one plan should not kill the run
            print(f"[baseline-c] FAILED {entry.plan_id}: {exc}", file=sys.stderr)
            continue
        errors = write_prediction(plan, OUT_DIR / f"{entry.plan_id}.json")
        if errors:
            n_invalid += 1
            print(f"[baseline-c] {entry.plan_id}: INVALID ({len(errors)} errors) — {len(plan['walls'])} walls")
        else:
            n_ok += 1
            print(f"[baseline-c] {entry.plan_id}: valid — {len(plan['walls'])} walls")
    print(f"[baseline-c] done: {n_ok} valid, {n_invalid} invalid, {len(entries)} total")
    return 0


if __name__ == "__main__":
    sys.exit(main())
