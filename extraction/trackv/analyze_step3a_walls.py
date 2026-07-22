"""One-off diagnostic: categorize step 3a's over-produced walls by likely
origin (hatch / dimension-line / near-duplicate / other), per Dan's request
to confirm the over-production + zero-cycle-closure finding is one problem
(hatch leaking through selection into phantom pairs) before proposing a fix.

Not a pipeline module -- reruns select+pair directly (not the schema-scaled
predictions, which lose per-segment provenance) to inspect each final
wall's two source candidate segments and their parent primitives' cluster
membership.

Heuristic, not ground truth -- reported as such.
"""

from __future__ import annotations

import statistics
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from eval.registry.registry import load_registry  # noqa: E402
from extraction.trackv.dissect import dissect  # noqa: E402
from extraction.trackv.pair import pair_walls  # noqa: E402
from extraction.trackv.select import select_axis_aligned  # noqa: E402
from extraction.trackv.stroke_clusters import cluster_widths, extract_stroke_population  # noqa: E402

TARGET_PLAN_IDS = ["15x30-ft-Best-House-Plan-Model", "30x50-Model-landscape"]

NEAR_DUPLICATE_THICKNESS_MULTIPLE = 3.0  # thickness < this many stroke-widths -> near-duplicate remnant
DIMENSION_LINE_THICKNESS_MULTIPLE = 3.0  # thickness > this many times the median final thickness -> outlier-shaped


def _cluster_axis_aligned_fraction_for_width(width, cluster_reports):
    for c in cluster_reports:
        if c.low - 1e-6 <= width <= c.high + 1e-6:
            return c.axis_aligned_fraction
    return None


def categorize_plan(plan_id: str, entry) -> dict:
    pdf_path = REPO_ROOT / entry.source_file
    dissection = dissect(pdf_path)[0]
    selection = select_axis_aligned(dissection)
    pair_result = pair_walls(selection, dissection.page_size_px)

    thicknesses = [w.thickness for w in pair_result.walls]
    median_thickness = statistics.median(thicknesses) if thicknesses else 0.0

    categories = {"near_duplicate": 0, "dimension_line": 0, "hatch_cluster_uninformative": 0, "other": 0}
    examples = {"near_duplicate": [], "dimension_line": [], "hatch_cluster_uninformative": [], "other": []}

    for wi, w in enumerate(pair_result.walls):
        i_idx, j_idx = w.source_segment_indices
        seg_i, seg_j = selection.candidates[i_idx], selection.candidates[j_idx]

        frac_i = _cluster_axis_aligned_fraction_for_width(seg_i.stroke_width, selection.cluster_reports)
        frac_j = _cluster_axis_aligned_fraction_for_width(seg_j.stroke_width, selection.cluster_reports)
        hatch_like = (frac_i is not None and frac_i < 0.5) or (frac_j is not None and frac_j < 0.5)

        pen_width = max(seg_i.stroke_width, seg_j.stroke_width)
        near_dup = pen_width > 0 and w.thickness < NEAR_DUPLICATE_THICKNESS_MULTIPLE * pen_width
        dim_line = median_thickness > 0 and w.thickness > DIMENSION_LINE_THICKNESS_MULTIPLE * median_thickness

        # near_dup/dim_line checked first: these are geometric (thickness-
        # shape) signals with real discriminating power. "hatch_like" (width
        # cluster membership) is checked last because it turned out
        # uninformative on this corpus -- real wall-boundary strokes and
        # hatch share the exact literal pen width (the step-2 finding this
        # whole step exists to work around), so a segment's cluster alone
        # doesn't distinguish genuine wall edges from coincidentally
        # axis-aligned hatch; confirmed directly, not assumed (see report).
        if near_dup:
            cat = "near_duplicate"
        elif dim_line:
            cat = "dimension_line"
        elif hatch_like:
            cat = "hatch_cluster_uninformative"
        else:
            cat = "other"

        categories[cat] += 1
        if len(examples[cat]) < 3:
            examples[cat].append(
                {
                    "wall_index": wi,
                    "thickness": round(w.thickness, 3),
                    "length": round(((w.start[0] - w.end[0]) ** 2 + (w.start[1] - w.end[1]) ** 2) ** 0.5, 2),
                    "axis_aligned_fraction_i": frac_i,
                    "axis_aligned_fraction_j": frac_j,
                }
            )

    return {
        "plan_id": plan_id,
        "n_final_walls": len(pair_result.walls),
        "median_thickness": round(median_thickness, 3),
        "category_counts": categories,
        "category_examples": examples,
    }


def main() -> None:
    entries = {e.plan_id: e for e in load_registry()}
    for plan_id in TARGET_PLAN_IDS:
        result = categorize_plan(plan_id, entries[plan_id])
        print(f"\n=== {plan_id} ===")
        print(f"n_final_walls={result['n_final_walls']} median_thickness={result['median_thickness']}")
        for cat, count in result["category_counts"].items():
            print(f"  {cat}: {count}")
        for cat, exs in result["category_examples"].items():
            if exs:
                print(f"  {cat} examples: {exs}")


if __name__ == "__main__":
    main()
