"""Track V milestone 2 step 3a -- Blocker 1, bucket (b) priority lead:
chain-clustering drift in `_collinear_merge`'s grouping stage
(`_cluster_by_perp`), verified at population scale before any fix is sized.

Context: bucket (b) attribution found neither of the two originally-named
suspects (thickness-outlier rejection, no-parallel-partner-found) explains
the dominant "survived_unexplained" case (8/10). Tracing ONE example
(w_s111, 30x50) by hand found a final merged candidate with matching
orientation and near-correct recovered thickness (~149mm vs GT's 150mm --
the pairing geometry itself is fine) but centered ~900mm off from the true
GT wall, with 10 source segments folded into it. `_cluster_by_perp` chains
by comparing each new element to the PREVIOUS element already in the
cluster, not to the cluster's own extent -- a classic single-linkage
chaining defect: a slow drift of several locally-close-but-not-globally-
close parallel lines can accumulate into one group whose overall
perpendicular spread far exceeds the tolerance that's supposed to bound it.
That is ONE traced example, not yet population evidence -- this script is
that population check.

PRE-REGISTERED EXPECTATION (mine -- Dan has explicitly handed hypothesis-
authorship on pair.py internals back to me after three straight misses of
his own on this file, so this prediction is mine and is scored as such):
moderate confidence, based on exactly one traced case. If chaining actually
drives bucket (b), the spread/threshold ratio distribution should be
right-skewed with a non-trivial tail of groups exceeding 1.0 (chains of 3+
members can only exceed a single hop's tolerance by chaining), and those
high-spread groups' resulting candidates should show a higher spurious/
unmatched rate than low-spread (near-single-hop) groups. If spread stays
tightly bounded at or below the tolerance across the population, or if high
spread does not correlate with unmatched status, the chain-drift hypothesis
is wrong and w_s111 was a one-off.

Guardrails observed: eval/ untouched. No tolerance is being widened or
tightened here -- the grouping RULE is the suspect. The counterfactual at
the bottom changes ONLY the neighbor-vs-extent comparison in clustering,
touching nothing about how a group's thickness/geometry is computed
afterward (w_s111 showed that part already works).
"""

from __future__ import annotations

import hashlib
import json
import math
import statistics
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from eval.metrics.engine import score_plan  # noqa: E402
from eval.metrics.matching import match_walls, plan_diagonal  # noqa: E402
from eval.registry.registry import load_registry  # noqa: E402
from extraction.trackv.run_step3a import _build_extraction_result, _gt_scale  # noqa: E402
from extraction.trackv.dissect import dissect  # noqa: E402
from extraction.trackv.pair import (  # noqa: E402
    COLLINEAR_GROUPING_TOLERANCE_FRAC,
    OPENING_GAP_MULTIPLIER,
    SNAP_TOLERANCE_ABS,
    WallCandidate,
    _axis_frame,
    _bucket_wall,
    _cluster_by_perp,
    _dot,
    _midpoint,
    _weighted_median,
    pair_walls,
)
from extraction.trackv.select import select_axis_aligned  # noqa: E402

OUT_DIR = Path(__file__).parent / "out"
GT_DIR = REPO_ROOT / "data" / "corpus" / "gt_provisional"

TARGET_PLAN_IDS = ["15x30-ft-Best-House-Plan-Model", "30x50-Model-landscape"]

LEGACY_METERS_PER_PIXEL = {
    "15x30-ft-Best-House-Plan-Model": 0.008323667459886908,
    "30x50-Model-landscape": 0.012918215560344833,
}
MM_PER_PRED_UNIT = {k: v * 1000.0 for k, v in LEGACY_METERS_PER_PIXEL.items()}


def _frame_for(bucket: str, d_a, n_a):
    return (d_a, n_a) if bucket == "A" else (n_a, d_a)


def _perp_groups(walls: list[WallCandidate], d_a, n_a, tolerance: float) -> list[list[int]]:
    """Reproduces `_collinear_merge`'s grouping stage exactly (same
    `_cluster_by_perp` call, same per-bucket split) -- read-only, no
    changes to pair.py's actual behavior."""
    perp_of: dict[int, float] = {}
    by_bucket: dict[str, list[int]] = {"A": [], "B": []}
    for wi, w in enumerate(walls):
        _along_dir, perp_dir = _frame_for(w.axis_bucket, d_a, n_a)
        perp_of[wi] = _dot(_midpoint(w.start, w.end), perp_dir)
        by_bucket[w.axis_bucket].append(wi)

    groups = []
    for bucket in ("A", "B"):
        for idxs in _cluster_by_perp(by_bucket[bucket], perp_of, tolerance):
            groups.append((bucket, idxs, perp_of))
    return groups


def _cluster_by_perp_bounded_diameter(idxs: list[int], perp_of: dict[int, float], tolerance: float) -> list[list[int]]:
    """Counterfactual clustering: a new element joins the OPEN cluster only
    if doing so keeps the cluster's own diameter (max-min) within
    tolerance -- compares to the cluster's first (= min, since sorted
    ascending) element, not to the previous element added. This is the only
    change from `_cluster_by_perp`; single-hop-only groups are identical
    under both rules, so this cannot merge anything the original rule
    wouldn't also merge, only refuse chains the original rule accepted."""
    ordered = sorted(idxs, key=lambda i: (perp_of[i], i))
    clusters: list[list[int]] = []
    for i in ordered:
        if clusters and perp_of[i] - perp_of[clusters[-1][0]] <= tolerance:
            clusters[-1].append(i)
        else:
            clusters.append([i])
    return clusters


def _collinear_merge_bounded_diameter(
    walls: list[WallCandidate], d_a, n_a, diagonal: float
) -> list[WallCandidate]:
    """Same as pair.py's `_collinear_merge`, with ONLY the clustering
    function swapped for the bounded-diameter variant above. Opening-
    candidate bookkeeping is dropped (not needed for this measurement);
    everything else -- gap bound, thickness recovery, chain-flush logic --
    is unchanged from the real function."""
    if not walls:
        return []

    perp_of: dict[int, float] = {}
    by_bucket: dict[str, list[int]] = {"A": [], "B": []}
    for wi, w in enumerate(walls):
        _along_dir, perp_dir = _frame_for(w.axis_bucket, d_a, n_a)
        perp_of[wi] = _dot(_midpoint(w.start, w.end), perp_dir)
        by_bucket[w.axis_bucket].append(wi)

    tolerance = COLLINEAR_GROUPING_TOLERANCE_FRAC * diagonal
    merged: list[WallCandidate] = []
    consumed: set[int] = set()

    for bucket in ("A", "B"):
        along_dir, perp_dir = _frame_for(bucket, d_a, n_a)

        def along_lo(wi: int) -> float:
            w = walls[wi]
            return min(_dot(w.start, along_dir), _dot(w.end, along_dir))

        def along_hi(wi: int) -> float:
            w = walls[wi]
            return max(_dot(w.start, along_dir), _dot(w.end, along_dir))

        for idxs in _cluster_by_perp_bounded_diameter(by_bucket[bucket], perp_of, tolerance):
            if len(idxs) == 1:
                continue
            idxs_sorted = sorted(idxs, key=lambda wi: (along_lo(wi), wi))
            chain_lo = along_lo(idxs_sorted[0])
            chain_hi = along_hi(idxs_sorted[0])
            chain_thick_weighted = [(walls[idxs_sorted[0]].thickness, chain_hi - chain_lo)]
            chain_members = [idxs_sorted[0]]

            def flush_chain():
                perp_mid = sum(perp_of[wi] for wi in chain_members) / len(chain_members)
                thickness = _weighted_median(chain_thick_weighted)
                start, end = _bucket_wall(along_dir, perp_dir, chain_lo, chain_hi, perp_mid, bucket)
                merged.append(
                    WallCandidate(
                        start=start,
                        end=end,
                        thickness=thickness,
                        axis_bucket=bucket,
                        source_segment_indices=walls[chain_members[0]].source_segment_indices,
                        member_source_indices=tuple(
                            sorted({si for wi in chain_members for si in walls[wi].member_source_indices})
                        ),
                    )
                )
                for wi in chain_members:
                    consumed.add(wi)

            for wi in idxs_sorted[1:]:
                gap = along_lo(wi) - chain_hi
                local_thickness = _weighted_median(chain_thick_weighted + [(walls[wi].thickness, along_hi(wi) - along_lo(wi))])
                gap_bound = OPENING_GAP_MULTIPLIER * local_thickness
                frag_len = along_hi(wi) - along_lo(wi)
                if gap <= gap_bound:
                    chain_hi = max(chain_hi, along_hi(wi))
                    chain_thick_weighted.append((walls[wi].thickness, frag_len))
                    chain_members.append(wi)
                else:
                    flush_chain()
                    chain_lo = along_lo(wi)
                    chain_hi = along_hi(wi)
                    chain_thick_weighted = [(walls[wi].thickness, frag_len)]
                    chain_members = [wi]
            flush_chain()

    for wi, w in enumerate(walls):
        if wi not in consumed:
            merged.append(w)

    return merged


def _to_mm(walls: list[WallCandidate], plan_id: str, raster_scale: float) -> list[dict]:
    scale = raster_scale * MM_PER_PRED_UNIT[plan_id]
    out = []
    for i, w in enumerate(walls):
        out.append(
            {
                "id": f"W{i}",
                "start": [w.start[0] * scale, w.start[1] * scale],
                "end": [w.end[0] * scale, w.end[1] * scale],
                "thickness": w.thickness * scale,
            }
        )
    return out


def run_plan(plan_id: str, entry) -> dict:
    pdf_path = REPO_ROOT / entry.source_file
    sha256 = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
    dissection = dissect(pdf_path)[0]
    raster_scale = _gt_scale(dissection.page_size_px)
    diagonal_native = math.hypot(*dissection.page_size_px)
    tolerance = COLLINEAR_GROUPING_TOLERANCE_FRAC * diagonal_native

    selection = select_axis_aligned(dissection)
    pair_result = pair_walls(selection, dissection.page_size_px)
    d_a, n_a = _axis_frame(selection.theta_deg)

    # --- Step 1/2: spread measurement on the REAL (chain-based) grouping ---
    groups = _perp_groups(pair_result.pre_merge_walls, d_a, n_a, tolerance)
    group_records = []
    for bucket, idxs, perp_of in groups:
        vals = [perp_of[wi] for wi in idxs]
        spread = max(vals) - min(vals)
        source_set = set()
        for wi in idxs:
            source_set.update(pair_result.pre_merge_walls[wi].member_source_indices)
        group_records.append(
            {"member_count": len(idxs), "spread": spread, "ratio": spread / tolerance, "source_set": source_set}
        )

    gt = json.loads((GT_DIR / f"{plan_id}.json").read_text(encoding="utf-8"))
    diagonal_gt = plan_diagonal(gt["walls"])
    real_pred_mm = _to_mm(pair_result.walls, plan_id, raster_scale)
    m = match_walls(real_pred_mm, gt["walls"], 0.01, diagonal_gt)
    matched_pred_idx = {i for i, _ in m.pairs}

    # attribute each final (real) wall to its originating group by member-set containment
    final_wall_records = []
    for i, w in enumerate(pair_result.walls):
        w_members = set(w.member_source_indices)
        owning = next((g for g in group_records if w_members <= g["source_set"]), None)
        final_wall_records.append(
            {
                "wall_id": f"W{i}",
                "matched": i in matched_pred_idx,
                "group_member_count": owning["member_count"] if owning else None,
                "group_spread_ratio": owning["ratio"] if owning else None,
            }
        )

    # --- Step 3: counterfactual (bounded-diameter clustering) ---
    counterfactual_walls = _collinear_merge_bounded_diameter(pair_result.pre_merge_walls, d_a, n_a, diagonal_native)
    counterfactual_mm = _to_mm(counterfactual_walls, plan_id, raster_scale)

    def score(pred_mm):
        by_tau = {}
        for tau in (0.01, 0.005):
            mm = match_walls(pred_mm, gt["walls"], tau, diagonal_gt)
            by_tau[str(tau)] = {
                "n_pred": mm.n_pred,
                "n_gt": mm.n_gt,
                "tp": mm.tp,
                "precision": round(mm.precision, 4),
                "recall": round(mm.recall, 4),
                "f1": round(mm.f1, 4),
            }
        return by_tau

    return {
        "plan_id": plan_id,
        "tolerance_native": tolerance,
        "n_groups": len(group_records),
        "group_records": [{"member_count": g["member_count"], "spread": round(g["spread"], 4), "ratio": round(g["ratio"], 4)} for g in group_records],
        "final_wall_records": final_wall_records,
        "today_score": score(real_pred_mm),
        "counterfactual_score": score(counterfactual_mm),
        "n_pred_today": len(real_pred_mm),
        "n_pred_counterfactual": len(counterfactual_mm),
    }


def _dist_stats(values):
    if not values:
        return {"n": 0}
    sorted_v = sorted(values)
    return {
        "n": len(values),
        "mean": round(statistics.mean(values), 3),
        "median": round(statistics.median(values), 3),
        "min": round(sorted_v[0], 3),
        "max": round(sorted_v[-1], 3),
        "q3": round(sorted_v[(3 * len(sorted_v)) // 4], 3),
        "n_over_1_0": sum(1 for v in values if v > 1.0),
        "n_over_1_5": sum(1 for v in values if v > 1.5),
    }


def _point_biserial(values, labels_bool):
    # labels_bool True = unmatched (spurious)
    n = len(values)
    if n < 2:
        return None
    mean_all = statistics.mean(values)
    std_all = statistics.pstdev(values)
    if std_all == 0:
        return None
    g1 = [v for v, lab in zip(values, labels_bool) if lab]
    g0 = [v for v, lab in zip(values, labels_bool) if not lab]
    if not g1 or not g0:
        return None
    m1, m0 = statistics.mean(g1), statistics.mean(g0)
    p = len(g1) / n
    q = 1 - p
    return round((m1 - m0) / std_all * math.sqrt(p * q), 4)


def main() -> None:
    entries = {e.plan_id: e for e in load_registry()}
    per_plan = {pid: run_plan(pid, entries[pid]) for pid in TARGET_PLAN_IDS}

    all_ratios_multimember = []
    for p in per_plan.values():
        all_ratios_multimember.extend(g["ratio"] for g in p["group_records"] if g["member_count"] > 1)

    all_final_with_group = []
    for p in per_plan.values():
        for r in p["final_wall_records"]:
            if r["group_spread_ratio"] is not None:
                all_final_with_group.append(r)

    high_spread = [r for r in all_final_with_group if r["group_member_count"] > 1]
    ratios = [r["group_spread_ratio"] for r in high_spread]
    unmatched_flags = [not r["matched"] for r in high_spread]
    corr = _point_biserial(ratios, unmatched_flags)

    low = [r for r in high_spread if r["group_spread_ratio"] <= 1.0]
    high = [r for r in high_spread if r["group_spread_ratio"] > 1.0]
    unmatched_rate_low = round(sum(1 for r in low if not r["matched"]) / len(low), 4) if low else None
    unmatched_rate_high = round(sum(1 for r in high if not r["matched"]) / len(high), 4) if high else None

    n_gt_total = sum(len(json.loads((GT_DIR / f"{pid}.json").read_text(encoding="utf-8"))["walls"]) for pid in TARGET_PLAN_IDS)
    tp_today = {tau: sum(p["today_score"][tau]["tp"] for p in per_plan.values()) for tau in ("0.01", "0.005")}
    tp_cf = {tau: sum(p["counterfactual_score"][tau]["tp"] for p in per_plan.values()) for tau in ("0.01", "0.005")}
    n_pred_today = sum(p["n_pred_today"] for p in per_plan.values())
    n_pred_cf = sum(p["n_pred_counterfactual"] for p in per_plan.values())

    summary = {
        "pre_registered_expectation": "right-skewed ratio distribution with a non-trivial tail over 1.0; high-spread groups' candidates show a higher unmatched rate than low-spread groups (moderate confidence, one traced example)",
        "spread_ratio_distribution_multimember_groups": _dist_stats(all_ratios_multimember),
        "point_biserial_correlation_ratio_vs_unmatched": corr,
        "unmatched_rate_low_spread_(ratio<=1.0)": unmatched_rate_low,
        "unmatched_rate_high_spread_(ratio>1.0)": unmatched_rate_high,
        "n_candidates_from_multimember_groups": len(high_spread),
        "counterfactual_recall_precision_f1": {
            "today": {tau: {"recall": round(tp_today[tau] / n_gt_total, 4), "precision": round(tp_today[tau] / n_pred_today, 4)} for tau in ("0.01", "0.005")},
            "bounded_diameter": {tau: {"recall": round(tp_cf[tau] / n_gt_total, 4), "precision": round(tp_cf[tau] / n_pred_cf, 4)} for tau in ("0.01", "0.005")},
            "n_pred_today": n_pred_today,
            "n_pred_counterfactual": n_pred_cf,
        },
    }

    out = {"summary": summary, "per_plan": per_plan}
    out_path = OUT_DIR / "step3a_chain_spread.json"
    out_path.write_text(json.dumps(out, indent=2, default=list), encoding="utf-8")
    print(json.dumps(summary, indent=2, default=list))


if __name__ == "__main__":
    main()
