"""Track V milestone 2 step 3a -- Blocker 1: FULL FACTORIAL SIMULATION of
three candidate fixes for the established root cause (`pair.py` pairs wall
faces with distant unrelated parallel lines; see reports/phase-2-gate.md,
"Step 3a Blocker 1 -- ROOT CAUSE FOUND").

SIMULATION ONLY. `pair.py`, `assemble.py` and `eval/` are all unmodified --
their pure helpers are imported read-only and the three levers are applied
in local reimplementations of the two functions that carry them. Nothing
here is wired into any pipeline path. Per the standing simulate-before-
building rule, which has now stopped three fixes that would have been
wasted or harmful.

THE THREE LEVERS
  L-window    : `MAX_THICKNESS_SEARCH_FRAC * diagonal` (0.25 x diagonal =
                4077mm / 6327mm against a real wall thickness of ~150mm,
                i.e. 27-42x oversized) replaced by a window derived from a
                PHYSICAL prior (below). Wrong-partner pairs never form.
  L-thickness : `_thickness_plausible_clusters` -- which calibrates on the
                very population it filters, and therefore rejects nothing
                (0 rejections on both plans) -- replaced by an absolute
                physical band. Wrong pairs form, then are rejected.
  L-greedy    : `_greedy_select_pairs` sorts longest-overlap-first, letting
                a long face beat the correct local pair. Replaced by
                nearest-partner-first (thinnest), ties broken by overlap.

Run as a full 2^3 factorial (each alone, then every combination) because a
combined-only result hides a lever that does nothing and one that does
everything.

=========================== THE PHYSICAL PRIOR ===========================
Stated explicitly, and deliberately derivable WITHOUT reference to 15x30 or
30x50 -- per-plan tuning is the trap this project has already been caught by
once, and a constant that cannot be justified without those two plans is not
acceptable even if it scores well on them.

    WALL_THICKNESS_MIN_MM = 50
    WALL_THICKNESS_MAX_MM = 500

  Lower bound 50mm: the thinnest thing built as a wall in residential
  practice -- stud/glass partitions run ~50-75mm. Below that, two parallel
  strokes are not a wall's two faces; they are a drafting artifact (a
  double-drawn edge, a hatch line pair, a rendering duplicate).

  Upper bound 500mm: comfortably above every normal residential wall --
  half-brick partition ~115mm, full-brick ~230mm, insulated/cavity exterior
  ~300mm, and this project's own domain note records Israeli MAMAD
  safe-room walls at 250-400mm. Stone and retaining walls reach ~500mm.
  A single wall in a residential floor plan is not thicker than this.

  Neither bound was chosen by trying values against this corpus. Both are
  generous by construction: the point is to exclude the 4-6 METRE "walls"
  the current window admits, not to fit a tight range.

  NOTE, and it is a real architectural consequence rather than a detail:
  converting a mm prior into pair.py's native page units requires knowing
  mm-per-unit AT PAIR TIME, and the shipped pipeline does not know it there
  (`units.system = "plan_units"`, `mm_per_unit = None`, `scale_confidence
  = 0.0`; scale recovery is Phase 5's job). This simulation uses the
  derived frame constant (metersPerPixel * 1000, zero fitted parameters,
  Blocker 2). So a passing result here does NOT hand over a drop-in patch:
  it would require either scale-before-pairing, or a scale-free restatement
  of the same prior. Flagged here rather than discovered later.
==========================================================================

PRE-REGISTERED EXPECTATIONS (written before the first run; scored plainly
afterwards, including the sign, per this phase's practice).

  Pooled baseline, both plans, 29 GT walls / 97 candidates:
    tau=0.01  recall 0.345  precision 0.103
    tau=0.005 recall 0.207  precision 0.062

  * L-window alone -- THE DOMINANT LEVER. Wrong wide pairs never form, so
    real faces stay available for their correct local partner.
    Expect recall 0.60-0.75 and precision 0.35-0.60 at tau=0.01.
  * L-thickness alone -- MUCH WEAKER THAN IT LOOKS, and this is a specific
    structural prediction, not hedging: `_greedy_select_pairs` runs BEFORE
    the thickness filter and consumes segments one-to-one, so a wrong wide
    pair still wins greedy, eats both faces, and is only then rejected --
    leaving the real wall with no face left to pair. Expect recall
    0.35-0.50 (little or no gain, and a small LOSS is entirely possible)
    with precision improving more than recall (0.25-0.45) purely by
    deleting implausible candidates.
  * L-greedy alone -- MODEST. Nearest-first picks the correct partner more
    often even through a 4-6m window, but cannot help where the correct
    partner is not in the candidate set at all. Expect recall 0.45-0.60.
  * All three combined -- BEST, recall 0.65-0.85, precision 0.50-0.80.
  * NO cell reaches the 0.99 exit bar.
  * TIGHT-TAU CHECK (Dan's, explicitly flagged by him as coming from
    someone with three wrong mechanism guesses on this file): correct
    pairing should improve tau=0.005 by a LARGER FACTOR than tau=0.01,
    because pairing is what produces true centerlines and the face-offset
    finding says tight-tau failure is centerline placement. If tight tau
    does not improve disproportionately, something in that chain is wrong
    and it must be said.
"""

from __future__ import annotations

import itertools
import json
import math
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from eval.metrics.matching import match_walls, plan_diagonal  # noqa: E402
from eval.registry.registry import load_registry  # noqa: E402
from extraction.trackv.run_step3a import _gt_scale  # noqa: E402
from extraction.trackv.assemble import assemble  # noqa: E402
from extraction.trackv.dissect import dissect  # noqa: E402
from extraction.trackv.pair import (  # noqa: E402
    MAX_THICKNESS_SEARCH_FRAC,
    MIN_CANDIDATE_LENGTH_FRAC,
    PairFunnel,
    PairResult,
    WallCandidate,
    _axis_frame,
    _bucket_for,
    _bucket_wall,
    _collinear_merge,
    _project_bucket,
    _raw_pairs_in_bucket,
    _thickness_in_plausible_cluster,
    _thickness_plausible_clusters,
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

WALL_THICKNESS_MIN_MM = 50.0
WALL_THICKNESS_MAX_MM = 500.0

TAUS = (0.01, 0.005)


def _greedy_select_pairs_nearest_first(raw_pairs: list[tuple]) -> list[tuple]:
    """L-greedy. Identical to pair.py's `_greedy_select_pairs` except for the
    sort key: nearest partner (thinnest) first, ties broken by longest
    overlap, then lexicographic for determinism. Rationale stated without
    reference to this corpus: a wall face's true partner is its NEAREST
    parallel counterpart -- proximity is the architectural prior, whereas
    overlap length is not (a long dimension line trivially out-overlaps the
    correct short local partner)."""
    ordered = sorted(raw_pairs, key=lambda p: (p[1], -p[0], p[2], p[3]))
    used: set[int] = set()
    accepted = []
    for overlap_len, thickness, i_idx, j_idx, lo, hi, perp_mid in ordered:
        if i_idx in used or j_idx in used:
            continue
        used.add(i_idx)
        used.add(j_idx)
        accepted.append((overlap_len, thickness, i_idx, j_idx, lo, hi, perp_mid))
    return accepted


def pair_walls_variant(
    selection,
    page_size_px: tuple[float, float],
    mm_per_native: float,
    use_window: bool,
    use_thickness: bool,
    use_greedy: bool,
) -> PairResult:
    """Faithful reimplementation of `pair_walls()` with the three levers
    switchable. Every stage not carrying a lever calls pair.py's own helper
    unchanged, so a cell with all levers off must reproduce the shipped
    result exactly (asserted by the OFF/OFF/OFF cell against the recorded
    baseline)."""
    diagonal = math.hypot(*page_size_px)
    funnel = PairFunnel()

    length_floor = MIN_CANDIDATE_LENGTH_FRAC * diagonal
    long_enough = [i for i, seg in enumerate(selection.candidates) if seg.length >= length_floor]
    funnel.n_candidates_below_length_floor = len(selection.candidates) - len(long_enough)

    bucket_of = {i: _bucket_for(selection.candidates[i].angle_deg, selection.theta_deg) for i in long_enough}
    indices_a = [i for i in long_enough if bucket_of[i] == "A"]
    indices_b = [i for i in long_enough if bucket_of[i] == "B"]
    funnel.n_candidates_by_bucket = {"A": len(indices_a), "B": len(indices_b)}

    d_a, n_a = _axis_frame(selection.theta_deg)

    # --- L-window ---
    if use_window:
        max_search_window = WALL_THICKNESS_MAX_MM / mm_per_native
    else:
        max_search_window = MAX_THICKNESS_SEARCH_FRAC * diagonal

    proj_a = _project_bucket(indices_a, selection.candidates, d_a, n_a)
    proj_b = _project_bucket(indices_b, selection.candidates, n_a, d_a)

    raw_a = _raw_pairs_in_bucket(proj_a, max_search_window)
    raw_b = _raw_pairs_in_bucket(proj_b, max_search_window)
    funnel.n_raw_pairs_formed = len(raw_a) + len(raw_b)

    # --- L-greedy ---
    greedy = _greedy_select_pairs_nearest_first if use_greedy else __import__(
        "extraction.trackv.pair", fromlist=["_greedy_select_pairs"]
    )._greedy_select_pairs
    accepted_a = greedy(raw_a)
    accepted_b = greedy(raw_b)
    funnel.n_pairs_accepted_greedy = len(accepted_a) + len(accepted_b)

    all_accepted = [("A", p) for p in accepted_a] + [("B", p) for p in accepted_b]
    thicknesses = [p[1] for _bucket, p in all_accepted]

    # --- L-thickness ---
    if use_thickness:
        lo_native = WALL_THICKNESS_MIN_MM / mm_per_native
        hi_native = WALL_THICKNESS_MAX_MM / mm_per_native

        def thickness_ok(t: float) -> bool:
            return lo_native <= abs(t) <= hi_native

        plausible_clusters = []
    else:
        plausible_clusters = _thickness_plausible_clusters(thicknesses, diagonal)

        def thickness_ok(t: float) -> bool:
            return _thickness_in_plausible_cluster(t, plausible_clusters)

    funnel.thickness_clusters = plausible_clusters

    walls: list[WallCandidate] = []
    for bucket, (overlap_len, thickness, i_idx, j_idx, lo, hi, perp_mid) in all_accepted:
        if not thickness_ok(thickness):
            funnel.n_pairs_rejected_thickness_outlier += 1
            continue
        along_dir, perp_dir = (d_a, n_a) if bucket == "A" else (n_a, d_a)
        start, end = _bucket_wall(along_dir, perp_dir, lo, hi, perp_mid, bucket)
        walls.append(
            WallCandidate(
                start=start,
                end=end,
                thickness=abs(thickness),
                axis_bucket=bucket,
                source_segment_indices=(i_idx, j_idx),
                member_source_indices=tuple(sorted((i_idx, j_idx))),
            )
        )

    merged_walls, opening_candidates = _collinear_merge(walls, d_a, n_a, diagonal)
    funnel.n_merges_applied = len(walls) - len(merged_walls) + len(opening_candidates)
    funnel.n_opening_candidates = len(opening_candidates)

    return PairResult(
        walls=merged_walls, opening_candidates=opening_candidates, funnel=funnel, pre_merge_walls=walls
    )


def run_cell(plan_id: str, dissection, selection, gt: dict, levers: tuple[bool, bool, bool]) -> dict:
    raster_scale = _gt_scale(dissection.page_size_px)
    mm_per_native = raster_scale * MM_PER_PRED_UNIT[plan_id]

    pair_result = pair_walls_variant(
        selection, dissection.page_size_px, mm_per_native, *levers
    )
    assemble_result = assemble(pair_result, scale_to_gt_frame=raster_scale, enable_splitting=False)

    walls_mm = [
        {
            "id": w.id,
            "start": [w.start[0] * MM_PER_PRED_UNIT[plan_id], w.start[1] * MM_PER_PRED_UNIT[plan_id]],
            "end": [w.end[0] * MM_PER_PRED_UNIT[plan_id], w.end[1] * MM_PER_PRED_UNIT[plan_id]],
            "thickness": w.thickness * MM_PER_PRED_UNIT[plan_id],
        }
        for w in assemble_result.walls
    ]

    diagonal_gt = plan_diagonal(gt["walls"])
    per_tau = {}
    for tau in TAUS:
        m = match_walls(walls_mm, gt["walls"], tau, diagonal_gt)
        per_tau[str(tau)] = {"tp": m.tp, "n_pred": m.n_pred, "n_gt": m.n_gt}

    return {
        "n_candidates": len(walls_mm),
        "n_raw_pairs": pair_result.funnel.n_raw_pairs_formed,
        "n_accepted_greedy": pair_result.funnel.n_pairs_accepted_greedy,
        "n_rejected_thickness": pair_result.funnel.n_pairs_rejected_thickness_outlier,
        "per_tau": per_tau,
    }


def main() -> None:
    entries = {e.plan_id: e for e in load_registry()}

    loaded = {}
    for plan_id in TARGET_PLAN_IDS:
        dissection = dissect(REPO_ROOT / entries[plan_id].source_file)[0]
        selection = select_axis_aligned(dissection)
        gt = json.loads((GT_DIR / f"{plan_id}.json").read_text(encoding="utf-8"))
        raster_scale = _gt_scale(dissection.page_size_px)
        loaded[plan_id] = {
            "dissection": dissection,
            "selection": selection,
            "gt": gt,
            "mm_per_native": raster_scale * MM_PER_PRED_UNIT[plan_id],
        }

    cells = {}
    for levers in itertools.product([False, True], repeat=3):
        name = "+".join(
            n for n, on in zip(("window", "thickness", "greedy"), levers) if on
        ) or "baseline(none)"
        per_plan = {}
        for plan_id in TARGET_PLAN_IDS:
            L = loaded[plan_id]
            per_plan[plan_id] = run_cell(plan_id, L["dissection"], L["selection"], L["gt"], levers)

        pooled = {}
        for tau in TAUS:
            tp = sum(per_plan[p]["per_tau"][str(tau)]["tp"] for p in TARGET_PLAN_IDS)
            n_pred = sum(per_plan[p]["per_tau"][str(tau)]["n_pred"] for p in TARGET_PLAN_IDS)
            n_gt = sum(per_plan[p]["per_tau"][str(tau)]["n_gt"] for p in TARGET_PLAN_IDS)
            precision = tp / n_pred if n_pred else 0.0
            recall = tp / n_gt if n_gt else 0.0
            f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
            pooled[str(tau)] = {
                "tp": tp,
                "n_pred": n_pred,
                "n_gt": n_gt,
                "precision": round(precision, 4),
                "recall": round(recall, 4),
                "f1": round(f1, 4),
            }

        cells[name] = {"levers": {"window": levers[0], "thickness": levers[1], "greedy": levers[2]},
                       "pooled": pooled, "per_plan": per_plan}

    base = cells["baseline(none)"]["pooled"]
    tight_check = {}
    for name, c in cells.items():
        if name == "baseline(none)":
            continue
        r01 = c["pooled"]["0.01"]["recall"]
        r005 = c["pooled"]["0.005"]["recall"]
        b01 = base["0.01"]["recall"]
        b005 = base["0.005"]["recall"]
        tight_check[name] = {
            "recall_gain_factor_tau_0_01": round(r01 / b01, 3) if b01 else None,
            "recall_gain_factor_tau_0_005": round(r005 / b005, 3) if b005 else None,
            "tight_improves_more": (r005 / b005) > (r01 / b01) if (b01 and b005) else None,
        }

    out = {
        "physical_prior_mm": {"min": WALL_THICKNESS_MIN_MM, "max": WALL_THICKNESS_MAX_MM},
        "window_native_units": {
            p: {
                "old_0.25_diagonal": round(MAX_THICKNESS_SEARCH_FRAC * math.hypot(*loaded[p]["dissection"].page_size_px), 2),
                "new_physical": round(WALL_THICKNESS_MAX_MM / loaded[p]["mm_per_native"], 2),
                "mm_per_native": round(loaded[p]["mm_per_native"], 4),
            }
            for p in TARGET_PLAN_IDS
        },
        "cells": cells,
        "tight_tau_check": tight_check,
    }
    (OUT_DIR / "step3a_pairing_factorial.json").write_text(json.dumps(out, indent=2), encoding="utf-8")

    print(f"{'cell':28} {'cand':>5} {'P@.01':>7} {'R@.01':>7} {'F1@.01':>7} {'P@.005':>7} {'R@.005':>7} {'F1@.005':>8}")
    for name, c in cells.items():
        p = c["pooled"]
        n_cand = sum(c["per_plan"][x]["n_candidates"] for x in TARGET_PLAN_IDS)
        print(
            f"{name:28} {n_cand:5} {p['0.01']['precision']:7.4f} {p['0.01']['recall']:7.4f} {p['0.01']['f1']:7.4f} "
            f"{p['0.005']['precision']:7.4f} {p['0.005']['recall']:7.4f} {p['0.005']['f1']:8.4f}"
        )
    print()
    print("tight-tau check (recall gain factor vs baseline):")
    for name, t in tight_check.items():
        print(f"  {name:28} x{t['recall_gain_factor_tau_0_01']} @0.01   x{t['recall_gain_factor_tau_0_005']} @0.005   tight_wins={t['tight_improves_more']}")


if __name__ == "__main__":
    main()
