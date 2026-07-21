"""Shared helpers for the Phase 1 throwaway baselines (docs/extraction-plan.md
Phase 1). Deliberately lives outside extraction/schema|synth|trackv|trackr —
none of this is durable pipeline code, it exists to produce schema-v1-shaped
JSON from four disposable baselines so the eval harness can score them.

Every baseline funnels its wall list through `infer_junctions` before
`write_prediction` so junction/corner metrics compare geometry uniformly
across baselines (a/b/c/d1/d2), never a baseline's own idea of junctions.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from skimage.morphology import skeletonize
from scipy.ndimage import distance_transform_edt

from extraction.schema.validate import validity

SNAP_RADIUS_PX = 6.0  # endpoint-merge tolerance; validator needs exact (1e-3) coincidence
MIN_SEGMENT_PX = 10.0


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def make_wall(
    wall_id: str,
    start: tuple[float, float],
    end: tuple[float, float],
    thickness: float,
    role: str = "unconfirmed",
    confidence: float = 0.5,
    evidence: list[str] | None = None,
) -> dict:
    return {
        "id": wall_id,
        "start": [float(start[0]), float(start[1])],
        "end": [float(end[0]), float(end[1])],
        "thickness": max(float(thickness), 1.0),
        "curvature": 0.0,
        "role": role,
        "openings": [],
        "confidence": confidence,
        "evidence": evidence or [],
        "flags": [],
    }


# ---------------------------------------------------------------------------
# Endpoint snapping + junction inference (uniform across every baseline)
# ---------------------------------------------------------------------------

def _cluster_endpoints(points: list[tuple[float, float]], radius: float) -> list[list[int]]:
    """Simple union-find clustering by mutual distance <= radius. O(n^2), fine
    for baseline wall counts (tens to low hundreds per plan)."""
    n = len(points)
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for i in range(n):
        for j in range(i + 1, n):
            dx = points[i][0] - points[j][0]
            dy = points[i][1] - points[j][1]
            if math.hypot(dx, dy) <= radius:
                union(i, j)

    clusters: dict[int, list[int]] = {}
    for i in range(n):
        clusters.setdefault(find(i), []).append(i)
    return list(clusters.values())


def infer_junctions(walls: list[dict], snap_radius: float = SNAP_RADIUS_PX) -> list[dict]:
    """Snaps nearby wall endpoints together (mutates `walls` in place — the
    validator requires endpoints to coincide within 1e-3, which raw detector
    output never does bit-for-bit) and derives a junctions list from wall
    degree at each snapped point. Called uniformly on every baseline's wall
    list right before `write_prediction`, discarding whatever junctions a
    baseline itself proposed, so corner/junction metrics compare geometry
    rather than each baseline's own notion of completeness."""
    endpoint_refs: list[tuple[str, str]] = []  # (wall_id, "start"|"end")
    points: list[tuple[float, float]] = []
    for w in walls:
        for side in ("start", "end"):
            endpoint_refs.append((w["id"], side))
            points.append(tuple(w[side]))

    clusters = _cluster_endpoints(points, snap_radius)
    walls_by_id = {w["id"]: w for w in walls}

    junctions: list[dict] = []
    for cluster_idx, member_indices in enumerate(clusters):
        cx = sum(points[i][0] for i in member_indices) / len(member_indices)
        cy = sum(points[i][1] for i in member_indices) / len(member_indices)
        canonical = [cx, cy]

        wall_ids: list[str] = []
        for i in member_indices:
            wid, side = endpoint_refs[i]
            walls_by_id[wid][side] = canonical
            wall_ids.append(wid)

        degree = len(member_indices)
        if degree == 1:
            jtype = "end"
        elif degree == 2:
            (wid_a, side_a), (wid_b, side_b) = (endpoint_refs[i] for i in member_indices)
            wa, wb = walls_by_id[wid_a], walls_by_id[wid_b]
            other_a = wa["end"] if side_a == "start" else wa["start"]
            other_b = wb["end"] if side_b == "start" else wb["start"]
            ang_a = math.atan2(canonical[1] - other_a[1], canonical[0] - other_a[0])
            ang_b = math.atan2(canonical[1] - other_b[1], canonical[0] - other_b[0])
            diff = abs((ang_a - ang_b + math.pi) % (2 * math.pi) - math.pi)
            jtype = "I" if diff > math.radians(165) else "L"
        elif degree == 3:
            jtype = "T"
        else:
            jtype = "X"

        junctions.append({
            "id": f"j{cluster_idx}",
            "point": canonical,
            "type": jtype,
            "walls": wall_ids,
        })

    return junctions


# ---------------------------------------------------------------------------
# Raster mask -> naive wall segments (shared by baseline (a) and (c))
# ---------------------------------------------------------------------------

def _neighbor_counts(skel: np.ndarray) -> np.ndarray:
    """8-connected neighbor count for every skeleton pixel (0 elsewhere)."""
    from scipy.ndimage import convolve

    kernel = np.array([[1, 1, 1], [1, 0, 1], [1, 1, 1]])
    counts = convolve(skel.astype(np.uint8), kernel, mode="constant", cval=0)
    return counts * skel


def mask_to_wall_segments(binary_mask: np.ndarray, min_length_px: float = MIN_SEGMENT_PX) -> list[dict]:
    """Naive vectorization: skeletonize a binary wall mask, cut it at branch
    points (pixels with >=3 skeleton neighbors) so each remaining piece is a
    simple arm, walk each arm via actual pixel adjacency (not nearest-neighbor
    over the point cloud — that misorders anything with a real junction),
    Douglas-Peucker-simplify into straight segments, and estimate thickness
    from the distance transform of the ORIGINAL mask sampled at each
    segment's midpoint. No junction typing here — that's `infer_junctions`'s
    job once all baselines' walls are collected."""
    import cv2

    mask = (binary_mask > 0).astype(np.uint8)
    if mask.sum() == 0:
        return []

    skel = skeletonize(mask.astype(bool))
    dist = distance_transform_edt(mask)
    counts = _neighbor_counts(skel)

    arms = skel & (counts < 3)  # cut out branch pixels; endpoints (count<=1) stay
    n_labels, labels = cv2.connectedComponents(arms.astype(np.uint8), connectivity=8)

    segments: list[dict] = []
    seg_counter = 0

    for label in range(1, n_labels):
        arm_mask = labels == label
        pixel_set = {(int(y), int(x)) for y, x in zip(*np.where(arm_mask))}
        if len(pixel_set) < 2:
            continue

        def arm_neighbors(p: tuple[int, int]) -> list[tuple[int, int]]:
            y, x = p
            out = []
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dy == 0 and dx == 0:
                        continue
                    q = (y + dy, x + dx)
                    if q in pixel_set:
                        out.append(q)
            return out

        endpoints = [p for p in pixel_set if len(arm_neighbors(p)) <= 1]
        start_px = endpoints[0] if endpoints else next(iter(pixel_set))

        chain = [start_px]
        visited = {start_px}
        current = start_px
        while True:
            nbrs = [q for q in arm_neighbors(current) if q not in visited]
            if not nbrs:
                break
            nxt = nbrs[0]
            chain.append(nxt)
            visited.add(nxt)
            current = nxt

        chain_pts = np.array([[x, y] for (y, x) in chain], dtype=np.float32).reshape(-1, 1, 2)
        if len(chain_pts) < 2:
            continue
        approx = cv2.approxPolyDP(chain_pts, epsilon=3.0, closed=False).reshape(-1, 2)
        if approx.ndim == 1:
            approx = approx.reshape(1, 2)

        for i in range(len(approx) - 1):
            p0, p1 = approx[i], approx[i + 1]
            length = float(np.hypot(*(p1 - p0)))
            if length < min_length_px:
                continue
            mid = ((p0 + p1) / 2).astype(int)
            my, mx = min(mid[1], dist.shape[0] - 1), min(mid[0], dist.shape[1] - 1)
            thickness = float(dist[my, mx]) * 2.0
            segments.append({
                "id": f"w{seg_counter}",
                "start": [float(p0[0]), float(p0[1])],
                "end": [float(p1[0]), float(p1[1])],
                "thickness": max(thickness, 1.0),
            })
            seg_counter += 1

    return segments


# ---------------------------------------------------------------------------
# Envelope + write
# ---------------------------------------------------------------------------

def build_envelope(
    *,
    source_path: Path,
    encoding_class: str,
    convention_class: str,
    scope_class: str,
    router_confidence: float,
    pipeline_version: str,
    walls: list[dict],
    source_px: tuple[int, int],
    rooms: list[dict] | None = None,
    cost_usd: float = 0.0,
    timings_ms: dict[str, float] | None = None,
    diagnostics_extra: dict | None = None,
) -> dict:
    junctions = infer_junctions(walls)
    diag = {
        "tier": 4,
        "unresolved": [],
        "render_agreement": {"wall_iou": 0.0, "unexplained_ink_ratio": 1.0, "hallucinated_ink_ratio": 0.0},
        "kill_log_ref": "n/a-phase1-baseline",
        "pipeline_version": pipeline_version,
        "timings_ms": timings_ms or {},
        "cost_usd": cost_usd,
    }
    if diagnostics_extra:
        diag.update(diagnostics_extra)

    return {
        "schema_version": "1.0",
        "source": {
            "file_sha256": file_sha256(source_path) if source_path.exists() else "",
            "filename": source_path.name,
            "encoding_class": encoding_class,
            "convention_class": convention_class,
            "scope_class": scope_class,
            "router_confidence": router_confidence,
        },
        "units": {
            "system": "plan_units",
            "mm_per_unit": None,
            "scale_confidence": 0.0,
            "scale_source": None,
            "scale_inliers": 0,
            "scale_outliers": 0,
        },
        "image_transform": {
            "type": "similarity",
            "matrix": [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
            "source_px": [int(source_px[0]), int(source_px[1])],
        },
        "walls": walls,
        "junctions": junctions,
        "rooms": rooms or [],
        "diagnostics": diag,
    }


def write_prediction(plan: dict, out_path: Path) -> list[str]:
    """Writes the prediction JSON regardless of validity (an invalid baseline
    output is itself a Phase-1 finding, not something to suppress). Returns
    the validator's error list (empty if valid); also written to a sidecar
    `<name>.errors.json` so failures are inspectable without re-running
    the validator."""
    result = validity(plan)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(plan, indent=2), encoding="utf-8")
    errors_path = out_path.with_suffix(".errors.json")
    errors_path.write_text(json.dumps(result.errors, indent=2), encoding="utf-8")
    return result.errors


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
