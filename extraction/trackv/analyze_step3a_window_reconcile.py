"""Track V milestone 2 step 3a -- settle the window contradiction, then close.

THE CONTRADICTION. `analyze_step3a_greedy_competition.py` measured that every
pair which steals w_s117's and w_s142's correct partner has a recovered
thickness of 3058.6mm / 4730.3mm, and that the pairs which steal their near
faces sit at 792.4-916.1mm. All four are far outside the 500mm physical window
`analyze_step3a_pairing_factorial.py` and `analyze_step3a_length_floor_
factorial.py` simulated (WALL_THICKNESS_MAX_MM = 500). Both walls also clear
the frozen matcher's `overlap_ratio > 0.8` bar. On that evidence the window
lever alone should have recovered them -- yet both factorials record window
alone as recovering 0 of these 6 walls. Both cannot be right as stated.

ALREADY SETTLED BY CODE READ, before running anything: neither factorial
filtered already-selected output. `analyze_step3a_length_floor_factorial.py`
lines 110-117 and `analyze_step3a_pairing_factorial.py` lines 200-212 both
re-run `_project_bucket` -> `_raw_pairs_in_bucket(window)` -> pair.py's own
`_greedy_select_pairs` from scratch under the narrowed window, and attribute
per-wall recovery from `match_walls`'s own `m.pairs` (length-floor factorial
line 165). So the discrepancy is NOT a stale-population simulation bug, and
it is NOT in pair formation or greedy selection. It must lie in a stage
downstream of greedy: the thickness-plausibility guard, `_collinear_merge`,
`assemble`, or the matcher's one-to-one assignment.

This script traces the correct pair through EVERY one of those stages under
the window-alone cell and names the stage that kills it. One run, no
factorial, no lever adopted.

PRE-REGISTERED PREDICTIONS (stated before running; scored plainly after):

  P1 -- w_s142's correct pair (near face 61 / partner 60, thickness 149.6mm)
        IS formed and IS accepted by greedy under the 500mm window. Both
        thieves are outside the window and cannot compete.

  P2 -- it then dies at `_thickness_plausible_clusters`. This is the primary
        prediction and it is a direct consequence of the self-certifying-guard
        anti-pattern already named in this gate report: the window-alone cell
        leaves that guard ON (`use_thickness=False`), and the guard recalibrates
        its KDE clusters on whatever population survives. Narrowing the window
        changes that population wholesale, so the cluster bounds move, and there
        is no reason they should still admit 149.6mm. If true, the window lever
        was never actually tested in isolation -- it was tested through a guard
        that re-derived itself from the window's own output. Secondary
        candidate if P2 is wrong: `_collinear_merge` groups the correct wall
        with a neighbour inside its 126.5mm perpendicular tolerance and the
        plain mean of member perps drags the merged centerline off-position.

  P3 -- ACHIEVED-GEOMETRY CORRECTION (Dan's, and it is right in method):
        the previous section's ceiling check unioned every formed correct pair,
        but `_greedy_select_pairs`'s `used` set forbids co-accepting pairs that
        share a segment, and `_overlap_ratio` scores ONE predicted wall against
        ONE GT wall with no union. Predicted effect of doing it correctly:
        w_s117 (0.903) and w_s142 (0.935) are UNCHANGED, because for each of
        them the union already equals its single largest pair's overlap
        (2135.6mm and 2440.6mm respectively) -- so both remain above the 0.8
        bar and the verdict does not move. w_s111 DOES fall: its 0.344 union
        aggregates two disjoint ~1220mm stretches that need the two duplicate
        copies of partner 41 plus a downstream `_collinear_merge` to become one
        wall; its single-pair achievable coverage is ~0.172. Either way w_s111
        stays far under 0.8, so the 4-of-8-unreachable tally is unaffected.

  P4 -- NEAR-FACE length-floor kills, the side never tested (Dan's correction
        of his own falsified hypothesis, which concerned the PARTNER face):
        4 near-face segments across the two in-reach walls are dropped by the
        253mm floor -- w_s117's 53 (153.2mm), 22463 (153.2mm), 22467 (79.5mm)
        and w_s142's 183 (226.8mm). This RAISES their achievable coverage, but
        cannot change the verdict, because both walls already clear 0.8 without
        those fragments. Reported as a count only; no floor change is built.

Diagnostic only. Imports pair.py / assemble.py / eval helpers read-only.
Modifies nothing in select.py, pair.py, assemble.py, or eval/.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from eval.metrics.matching import (  # noqa: E402
    _overlap_ratio,
    _sym_mean_dist,
    match_walls,
    plan_diagonal,
)
from eval.registry.registry import load_registry  # noqa: E402
from extraction.trackv.assemble import assemble  # noqa: E402
from extraction.trackv.dissect import dissect  # noqa: E402
from extraction.trackv.pair import (  # noqa: E402
    MIN_CANDIDATE_LENGTH_FRAC,
    PairFunnel,
    PairResult,
    WallCandidate,
    _axis_frame,
    _bucket_for,
    _bucket_wall,
    _collinear_merge,
    _greedy_select_pairs,
    _project_bucket,
    _raw_pairs_in_bucket,
    _thickness_in_plausible_cluster,
    _thickness_plausible_clusters,
)
from extraction.trackv.run_step3a import _gt_scale  # noqa: E402
from extraction.trackv.select import select_axis_aligned  # noqa: E402

OUT_DIR = Path(__file__).parent / "out"
GT_DIR = REPO_ROOT / "data" / "corpus" / "gt_provisional"
COMPETITION_PATH = OUT_DIR / "step3a_greedy_competition.json"

LEGACY_METERS_PER_PIXEL = {
    "15x30-ft-Best-House-Plan-Model": 0.008323667459886908,
    "30x50-Model-landscape": 0.012918215560344833,
}
MM_PER_PRED_UNIT = {k: v * 1000.0 for k, v in LEGACY_METERS_PER_PIXEL.items()}

WALL_THICKNESS_MAX_MM = 500.0  # identical to both factorials' L-window prior
PLAN_ID = "30x50-Model-landscape"  # the three PRESENT_AND_KEPT walls are all here
TAU = 0.01


def _trace_window_cell(selection, page_size_px, mm_per_native, target_pairs: set[frozenset]) -> dict:
    """The window-alone cell, reproduced stage for stage, with the fate of each
    target pair recorded at every stage rather than only at the end."""
    diagonal = math.hypot(*page_size_px)
    funnel = PairFunnel()

    length_floor = MIN_CANDIDATE_LENGTH_FRAC * diagonal
    long_enough = [i for i, s in enumerate(selection.candidates) if s.length >= length_floor]
    bucket_of = {
        i: _bucket_for(selection.candidates[i].angle_deg, selection.theta_deg) for i in long_enough
    }
    d_a, n_a = _axis_frame(selection.theta_deg)
    max_search_window = WALL_THICKNESS_MAX_MM / mm_per_native

    proj_a = _project_bucket([i for i in long_enough if bucket_of[i] == "A"], selection.candidates, d_a, n_a)
    proj_b = _project_bucket([i for i in long_enough if bucket_of[i] == "B"], selection.candidates, n_a, d_a)
    raw = {"A": _raw_pairs_in_bucket(proj_a, max_search_window), "B": _raw_pairs_in_bucket(proj_b, max_search_window)}
    funnel.n_raw_pairs_formed = len(raw["A"]) + len(raw["B"])

    formed = {}
    for b in ("A", "B"):
        for p in raw[b]:
            k = frozenset((p[2], p[3]))
            if k in target_pairs:
                formed[k] = {"bucket": b, "overlap_native": p[0], "thickness_native": p[1]}

    accepted = {b: _greedy_select_pairs(raw[b]) for b in ("A", "B")}
    funnel.n_pairs_accepted_greedy = len(accepted["A"]) + len(accepted["B"])
    accepted_keys = {frozenset((p[2], p[3])) for b in ("A", "B") for p in accepted[b]}

    # who consumed each target segment, if the target pair was not accepted
    consumed_by = {}
    for b in ("A", "B"):
        for p in accepted[b]:
            consumed_by[p[2]] = p
            consumed_by[p[3]] = p

    all_accepted = [("A", p) for p in accepted["A"]] + [("B", p) for p in accepted["B"]]
    thicknesses = [p[1] for _b, p in all_accepted]
    clusters = _thickness_plausible_clusters(thicknesses, diagonal)

    walls: list[WallCandidate] = []
    survived_guard = set()
    for bucket, (overlap_len, thickness, i_idx, j_idx, lo, hi, perp_mid) in all_accepted:
        k = frozenset((i_idx, j_idx))
        if not _thickness_in_plausible_cluster(thickness, clusters):
            funnel.n_pairs_rejected_thickness_outlier += 1
            continue
        if k in target_pairs:
            survived_guard.add(k)
        along_dir, perp_dir = (d_a, n_a) if bucket == "A" else (n_a, d_a)
        start, end = _bucket_wall(along_dir, perp_dir, lo, hi, perp_mid, bucket)
        walls.append(
            WallCandidate(
                start=start, end=end, thickness=abs(thickness), axis_bucket=bucket,
                source_segment_indices=(i_idx, j_idx), member_source_indices=tuple(sorted((i_idx, j_idx))),
            )
        )

    pre_merge_walls = list(walls)
    merged_walls, opening_candidates = _collinear_merge(walls, d_a, n_a, diagonal)
    funnel.n_merges_applied = len(walls) - len(merged_walls) + len(opening_candidates)
    funnel.n_opening_candidates = len(opening_candidates)

    return {
        "result": PairResult(
            walls=merged_walls, opening_candidates=opening_candidates, funnel=funnel,
            pre_merge_walls=pre_merge_walls,
        ),
        "window_native": max_search_window,
        "formed": formed,
        "accepted_keys": accepted_keys,
        "consumed_by": consumed_by,
        "survived_guard": survived_guard,
        "clusters": [{"low": c.low, "high": c.high, "count": c.count} for c in clusters],
        "n_rejected_thickness": funnel.n_pairs_rejected_thickness_outlier,
        "n_accepted_greedy": funnel.n_pairs_accepted_greedy,
        "pre_merge_walls": pre_merge_walls,
        "merged_walls": merged_walls,
    }


def main() -> None:
    competition = json.loads(COMPETITION_PATH.read_text(encoding="utf-8"))
    entry = next(e for e in load_registry() if e.plan_id == PLAN_ID)
    dissection = dissect(REPO_ROOT / entry.source_file)[0]
    selection = select_axis_aligned(dissection)
    raster_scale = _gt_scale(dissection.page_size_px)
    mm = raster_scale * MM_PER_PRED_UNIT[PLAN_ID]
    gt = json.loads((GT_DIR / f"{PLAN_ID}.json").read_text(encoding="utf-8"))
    gt_by_id = {w["id"]: w for w in gt["walls"]}

    # every formed correct pair from the competition probe, on this plan
    walls_of_interest = [r for r in competition["per_wall"] if r["plan_id"] == PLAN_ID]
    target_pairs: set[frozenset] = set()
    pair_owner: dict[frozenset, str] = {}
    for r in walls_of_interest:
        for cb in r["combinations"]:
            if cb.get("formed"):
                k = frozenset((cb["near_face_idx"], cb["partner_idx"]))
                target_pairs.add(k)
                pair_owner[k] = r["gt_wall_id"]

    trace = _trace_window_cell(selection, dissection.page_size_px, mm, target_pairs)

    # ---- P1/P2: stage-by-stage fate of every target pair under the window ----
    stage_fate = []
    for k in sorted(target_pairs, key=lambda s: (pair_owner[s], sorted(s))):
        i, j = sorted(k)
        rec = {
            "gt_wall_id": pair_owner[k],
            "pair": [i, j],
            "formed_under_window": k in trace["formed"],
            "accepted_by_greedy": k in trace["accepted_keys"],
            "survived_thickness_guard": k in trace["survived_guard"],
        }
        if k in trace["formed"]:
            rec["thickness_mm"] = round(trace["formed"][k]["thickness_native"] * mm, 1)
            rec["overlap_mm"] = round(trace["formed"][k]["overlap_native"] * mm, 1)
        if not rec["accepted_by_greedy"]:
            for seg in (i, j):
                w = trace["consumed_by"].get(seg)
                rec[f"seg_{seg}_consumed_by"] = (
                    {
                        "pair": [w[2], w[3]],
                        "overlap_mm": round(w[0] * mm, 1),
                        "thickness_mm": round(w[1] * mm, 1),
                    }
                    if w
                    else None
                )
        rec["died_at"] = (
            "not_formed" if not rec["formed_under_window"]
            else "greedy_consumption" if not rec["accepted_by_greedy"]
            else "thickness_plausibility_guard" if not rec["survived_thickness_guard"]
            else "survived_to_merge"
        )
        stage_fate.append(rec)

    # ---- achieved geometry: the actual predicted wall, through assemble + matcher ----
    assembled = assemble(trace["result"], scale_to_gt_frame=raster_scale, enable_splitting=False)
    walls_mm = [
        {
            "id": w.id,
            "start": [w.start[0] * MM_PER_PRED_UNIT[PLAN_ID], w.start[1] * MM_PER_PRED_UNIT[PLAN_ID]],
            "end": [w.end[0] * MM_PER_PRED_UNIT[PLAN_ID], w.end[1] * MM_PER_PRED_UNIT[PLAN_ID]],
            "thickness": w.thickness * MM_PER_PRED_UNIT[PLAN_ID],
        }
        for w in assembled.walls
    ]
    diagonal_gt = plan_diagonal(gt["walls"])
    m = match_walls(walls_mm, gt["walls"], TAU, diagonal_gt)
    matched_gt_ids = sorted(gt["walls"][j]["id"] for _i, j in m.pairs)

    # P3: best achievable overlap_ratio from a SINGLE pre-merge wall carrying a
    # correct pair -- no union, exactly as the frozen matcher scores it.
    # Pre-merge walls are in RAW native units; `assemble` applies raster_scale
    # to the final ones. So a pre-merge wall converts with `mm`
    # (= raster_scale * MM_PER_PRED_UNIT), not MM_PER_PRED_UNIT alone.
    tau_abs = TAU * diagonal_gt
    achieved = []
    for r in walls_of_interest:
        gid = r["gt_wall_id"]
        g = gt_by_id[gid]
        best_single, best_src, best_single_dist = 0.0, None, None
        for w in trace["pre_merge_walls"]:
            k = frozenset(w.source_segment_indices)
            if k not in target_pairs or pair_owner[k] != gid:
                continue
            pw = {
                "start": [w.start[0] * mm, w.start[1] * mm],
                "end": [w.end[0] * mm, w.end[1] * mm],
            }
            ov = _overlap_ratio(pw, g)
            if ov > best_single:
                best_single = ov
                best_src = list(w.source_segment_indices)
                best_single_dist = _sym_mean_dist(pw, g)
        # The FINAL wall that actually carries this correct pair through
        # _collinear_merge, and why the matcher does or does not take it.
        final_rec = None
        for w in trace["merged_walls"]:
            if not any(
                frozenset(w.source_segment_indices) == k or set(best_src or []) <= set(w.member_source_indices)
                for k in target_pairs
                if pair_owner[k] == gid
            ):
                continue
            pw = {"start": [w.start[0] * mm, w.start[1] * mm], "end": [w.end[0] * mm, w.end[1] * mm]}
            cand = {
                "n_members": len(w.member_source_indices),
                "overlap_ratio": round(_overlap_ratio(pw, g), 4),
                "sym_mean_dist_mm": round(_sym_mean_dist(pw, g), 1),
                "length_mm": round(math.hypot(pw["end"][0] - pw["start"][0], pw["end"][1] - pw["start"][1]), 1),
            }
            if final_rec is None or cand["overlap_ratio"] > final_rec["overlap_ratio"]:
                final_rec = cand
        achieved.append(
            {
                "gt_wall_id": gid,
                "union_of_formed_pairs_prev_section": r["ceiling_if_greedy_were_perfect"]["coverage_ratio"],
                "best_single_accepted_pair_overlap_ratio": round(best_single, 4),
                "best_single_pair_source": best_src,
                "best_single_pair_sym_mean_dist_mm": (
                    round(best_single_dist, 1) if best_single_dist is not None else None
                ),
                "tau_abs_mm": round(tau_abs, 1),
                "single_pair_would_match": bool(
                    best_single > 0.8 and best_single_dist is not None and best_single_dist < tau_abs
                ),
                "final_wall_carrying_that_pair_after_collinear_merge": final_rec,
                "matched_by_matcher": gid in matched_gt_ids,
            }
        )

    # ---- P4: near-face segments killed by the length floor ----
    near_face_floor_kills = []
    for r in walls_of_interest:
        killed = [
            {"near_face_idx": cb["near_face_idx"], "length_mm": cb["detail"]["near_face_len_mm"]}
            for cb in r["combinations"]
            if cb.get("killed_by") == "length_floor"
        ]
        uniq = {k["near_face_idx"]: k for k in killed}
        near_face_floor_kills.append(
            {
                "gt_wall_id": r["gt_wall_id"],
                "n_near_faces_total": len(r["near_face_idxs"]),
                "n_killed_by_floor": len(uniq),
                "killed": sorted(uniq.values(), key=lambda d: d["near_face_idx"]),
            }
        )

    out = {
        "pre_registered_predictions": {
            "P1": "w_s142's correct pair (61,60) is formed AND accepted by greedy under the 500mm window.",
            "P2": "It then dies at _thickness_plausible_clusters -- the self-certifying guard recalibrates on the narrowed population and no longer admits 149.6mm. Secondary: _collinear_merge drags the centerline.",
            "P3": "Achieved-geometry correction leaves w_s117 (0.903) and w_s142 (0.935) unchanged (union == largest single pair for both); w_s111 falls from 0.344 to ~0.172. Verdict tally unaffected.",
            "P4": "4 near-face segments are dropped by the 253mm floor across the two in-reach walls; cannot change the verdict since both already clear 0.8.",
        },
        "settled_by_code_read_not_measurement": {
            "question": "Did either factorial's window cell re-run pair formation and greedy, or only filter already-selected output?",
            "answer": "It RE-RAN both, from scratch, in both factorials.",
            "evidence": "analyze_step3a_length_floor_factorial.py:110-117 and analyze_step3a_pairing_factorial.py:200-212 call _project_bucket -> _raw_pairs_in_bucket(narrowed window) -> pair.py's own _greedy_select_pairs; per-wall recovery is attributed from match_walls's own m.pairs at length_floor_factorial.py:165.",
            "implication": "The contradiction is not a simulation bug and not in pair formation or greedy. It lies downstream of greedy.",
        },
        "window_cell": {
            "window_mm": WALL_THICKNESS_MAX_MM,
            "window_native": round(trace["window_native"], 3),
            "n_accepted_greedy": trace["n_accepted_greedy"],
            "n_rejected_thickness_outlier": trace["n_rejected_thickness"],
            "thickness_clusters_mm": [
                {"low": round(c["low"] * mm, 1), "high": round(c["high"] * mm, 1), "count": c["count"]}
                for c in trace["clusters"]
            ],
            "n_final_walls": len(walls_mm),
            "matched_gt_ids": matched_gt_ids,
            "n_matched": len(matched_gt_ids),
        },
        "P1_P2_stage_fate": stage_fate,
        "P3_achieved_geometry": achieved,
        "P4_near_face_length_floor_kills": near_face_floor_kills,
    }
    OUT_DIR.mkdir(exist_ok=True)
    (OUT_DIR / "step3a_window_reconcile.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
