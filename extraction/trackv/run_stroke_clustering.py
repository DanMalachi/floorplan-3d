"""Corpus-wide stroke-width clustering sweep over the track_v plans.

Runs `stroke_clusters.cluster_widths` over each genuinely-vector plan's
stroke-width population and characterizes what geometry actually falls into
each resulting cluster (segment length/angle composition), to answer the
milestone-2-step-2 question directly: does a wall-stroke cluster separate
from hatching/dimension/furniture strokes, or does clustering alone conflate
them? This script produces the report's evidence; it does not select walls,
does not output a schema/ExtractionResult, and touches eval/ only to read
the frozen registry (same discipline as run_corpus.py).

Writes extraction/trackv/out/stroke_cluster_results.json (tracked) and, if
matplotlib is available, one histogram PNG per plan under
extraction/trackv/out/stroke_hist/ (gitignored -- diagnostic images, not a
durable artifact).
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from eval.registry.registry import load_registry  # noqa: E402
from extraction.trackv.dissect import dissect  # noqa: E402
from extraction.trackv.primitives import PageDissection, VectorPrimitive  # noqa: E402
from extraction.trackv.stroke_clusters import (  # noqa: E402
    WidthCluster,
    cluster_widths,
    extract_stroke_population,
)

OUT_DIR = Path(__file__).parent / "out"
HIST_DIR = OUT_DIR / "stroke_hist"
OUT_PATH = OUT_DIR / "stroke_cluster_results.json"

# A segment within this many degrees of 0/90 (mod 180) is treated as
# axis-aligned (wall/dimension-like); the real corpus's hatch fills sit
# close to 45 deg, so this is a conservative, wide axis-aligned band.
AXIS_ALIGNED_TOLERANCE_DEG = 20.0


def _seg_angle_length(op: str, pts: tuple) -> tuple[float, float]:
    (x0, y0), (x1, y1) = pts[0], pts[-1]
    dx, dy = x1 - x0, y1 - y0
    length = math.hypot(dx, dy)
    angle = math.degrees(math.atan2(dy, dx)) % 180.0
    return angle, length


def _is_axis_aligned(angle_deg: float) -> bool:
    dist_to_0 = min(angle_deg, 180.0 - angle_deg)
    dist_to_90 = abs(angle_deg - 90.0)
    return min(dist_to_0, dist_to_90) <= AXIS_ALIGNED_TOLERANCE_DEG


def _cluster_geometry(primitives: list[VectorPrimitive]) -> dict:
    lengths: list[float] = []
    axis_aligned = 0
    diagonal = 0
    n_fill_and_stroke = 0
    kind_counts: dict[str, int] = {}
    for prim in primitives:
        kind_counts[prim.kind] = kind_counts.get(prim.kind, 0) + 1
        if prim.fill_color is not None:
            n_fill_and_stroke += 1
        for subpath in prim.subpaths:
            for op, pts in subpath:
                angle, length = _seg_angle_length(op, pts)
                lengths.append(length)
                if _is_axis_aligned(angle):
                    axis_aligned += 1
                else:
                    diagonal += 1
    lengths.sort()
    n_segs = len(lengths)
    return {
        "n_primitives": len(primitives),
        "n_segments": n_segs,
        "kind_counts": kind_counts,
        "n_fill_and_stroke": n_fill_and_stroke,
        "median_segment_length": lengths[n_segs // 2] if n_segs else None,
        "axis_aligned_segment_fraction": (axis_aligned / n_segs) if n_segs else None,
        "diagonal_segment_fraction": (diagonal / n_segs) if n_segs else None,
    }


def _assign_primitive_indices(
    stroke_indices: list[int], stroke_widths: list[float], clusters: list[WidthCluster]
) -> list[list[int]]:
    """Map each stroke-carrying primitive back to the cluster whose [low,
    high] range contains its width -- ClusterResult itself is index-free
    (pure value clustering), this is report-only bookkeeping."""
    assigned: list[list[int]] = [[] for _ in clusters]
    eps = 1e-6
    for prim_idx, width in zip(stroke_indices, stroke_widths):
        for ci, c in enumerate(clusters):
            if c.low - eps <= width <= c.high + eps:
                assigned[ci].append(prim_idx)
                break
    return assigned


def _plot_histogram(plan_id: str, widths: list[float], clusters: list[WidthCluster]) -> None:
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        return
    HIST_DIR.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(8, 4))
    ax.hist(widths, bins=min(100, max(10, len(set(widths)))), color="steelblue")
    for c in clusters:
        ax.axvspan(c.low, c.high, alpha=0.15, color="orange")
    ax.set_title(f"{plan_id} -- stroke width population (n={len(widths)}, {len(clusters)} cluster(s))")
    ax.set_xlabel("stroke width (pt)")
    ax.set_ylabel("count")
    fig.tight_layout()
    safe_name = plan_id.replace(" ", "_").replace("/", "_")
    fig.savefig(HIST_DIR / f"{safe_name}.png", dpi=120)
    plt.close(fig)


def analyze_plan(plan_id: str, pdf_path: Path) -> dict:
    dissection: PageDissection = dissect(pdf_path)[0]
    population = extract_stroke_population(dissection)
    result = cluster_widths(population.stroke_widths)
    assigned = _assign_primitive_indices(
        population.stroke_primitive_indices, population.stroke_widths, result.clusters
    )

    clusters_report = []
    for c, idxs in zip(result.clusters, assigned):
        prims = [dissection.primitives[i] for i in idxs]
        clusters_report.append(
            {
                "low": round(c.low, 4),
                "high": round(c.high, 4),
                "mean": round(c.mean, 4),
                "count": c.count,
                "fraction_of_stroked": round(c.count / len(population.stroke_widths), 4)
                if population.stroke_widths
                else None,
                "geometry": _cluster_geometry(prims),
            }
        )
    clusters_report.sort(key=lambda c: c["mean"])

    _plot_histogram(plan_id, population.stroke_widths, result.clusters)

    return {
        "plan_id": plan_id,
        "total_primitives": population.total_primitive_count,
        "n_stroked_primitives": len(population.stroke_widths),
        "n_filled_no_stroke_primitives": population.filled_no_stroke_count,
        "filled_no_stroke_fraction_count": round(population.filled_no_stroke_fraction_count, 4),
        "filled_no_stroke_fraction_area": round(population.filled_no_stroke_fraction_area, 4),
        "n_clusters": len(result.clusters),
        "clusters": clusters_report,
    }


def main() -> None:
    entries = {e.plan_id: e for e in load_registry()}
    track_v_plan_ids = [
        "15x30-ft-Best-House-Plan-Model",
        "20x45-Model",
        "30x50-Model-landscape",
        "Matterport Sample_BW",
    ]

    report = {"plans": []}
    for plan_id in track_v_plan_ids:
        entry = entries[plan_id]
        pdf_path = REPO_ROOT / entry.source_file
        report["plans"].append(analyze_plan(plan_id, pdf_path))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
