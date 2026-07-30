"""Track V milestone 2 step 3a -- Blocker 1: the PRESENT_AND_KEPT lead.

The length-floor test (`analyze_step3a_length_floor_test.py`) closed Dan's
hypothesis as a null and split the 6 unrecovered displaced walls into two
buckets. This script attacks the second one:

  PRESENT_AND_KEPT, 3/6 (30x50 w_s111, w_s117, w_s142) -- the correct
  opposite-face segment EXISTS in `selection.candidates`, is well above the
  length floor (2442-7326mm vs a 253mm floor), and sits comfortably inside
  even the ORIGINAL 6327mm search window. The wall still mispairs. Cause
  recorded as UNLOCATED; greedy-competition flagged as the only remaining
  lead, explicitly "next lead, not a finding".

The question this answers, without guessing a mechanism first (the method
that cracked the root cause): instrument the actual decision rather than
theorise about it. For each of the 3 walls, take the known-correct near-face
segment(s) (L1 ink, from the displacement measurement) and the known-correct
partner segment(s) (opposite-face ink, from the length-floor test), and ask
in order:

  1. Is the correct pair FORMED at all in `_raw_pairs_in_bucket`? If not,
     which specific gate killed it -- axis bucket, length floor, search
     window, MIN_OVERLAP_FRACTION, or MIN_THICKNESS_STROKE_MULTIPLE? Each
     gate is evaluated separately and reported by name, so a negative here
     names its own culprit instead of just excluding greedy.
  2. If FORMED: what is its rank in `_greedy_select_pairs`'s sort order, and
     did it survive?
  3. If FORMED but rejected: which pair consumed the near face, and which
     consumed the partner? Report the winner's overlap, thickness, and the
     tie-break field that actually decided it.

PRE-REGISTERED PREDICTION (stated before running, scored plainly after --
four hypotheses have already been falsified in this phase and stating them
first is what made each one cheap):

  The correct pair IS formed (every gate is loose enough on these numbers:
  ~127mm offset vs a 6327mm window and a ~9mm min-thickness floor, and both
  faces span the same wall so overlap fraction is near 1.0). It then LOSES,
  and it loses on the SECOND sort key, not the first. `_greedy_select_pairs`
  sorts by (-overlap_len, thickness, i, j); absolute overlap is capped at
  min(|x|,|p|), so a competitor can at best TIE the correct pair, never beat
  it. Therefore the deciding field is `thickness` ascending -- a THINNER
  wrong pair at equal overlap. Concretely: a near-parallel line closer to the
  face than the true opposite face is (between the ~9mm pen-width floor and
  the real ~127mm), consuming the face before the correct pair is reached.

  If that is right, the named lead ("a wrong distant line has LONGER overlap")
  is wrong in its stated form -- the fault is the tie-break, not the primary
  sort -- and `MIN_THICKNESS_STROKE_MULTIPLE` (a pen-width bound, ~9mm) is
  the guard that is too loose, not `MAX_THICKNESS_SEARCH_FRAC`.

  Falsifier: if the correct pair is never formed, greedy is exonerated
  outright and the gate named in (1) is the finding instead.

Diagnostic only. Imports pair.py's pure helpers read-only; does not modify
select.py, pair.py, assemble.py, or anything under eval/.
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
from extraction.trackv.pair import (  # noqa: E402
    MAX_THICKNESS_SEARCH_FRAC,
    MIN_CANDIDATE_LENGTH_FRAC,
    MIN_OVERLAP_FRACTION,
    MIN_THICKNESS_STROKE_MULTIPLE,
    _axis_frame,
    _bucket_for,
    _greedy_select_pairs,
    _project_bucket,
    _raw_pairs_in_bucket,
)
from extraction.trackv.run_step3a import _gt_scale  # noqa: E402
from extraction.trackv.select import select_axis_aligned  # noqa: E402

OUT_DIR = Path(__file__).parent / "out"
GT_DIR = REPO_ROOT / "data" / "corpus" / "gt_provisional"
DISPLACEMENT_PATH = OUT_DIR / "step3a_displacement.json"
LENGTH_FLOOR_PATH = OUT_DIR / "step3a_length_floor_test.json"

LEGACY_METERS_PER_PIXEL = {
    "15x30-ft-Best-House-Plan-Model": 0.008323667459886908,
    "30x50-Model-landscape": 0.012918215560344833,
}
MM_PER_PRED_UNIT = {k: v * 1000.0 for k, v in LEGACY_METERS_PER_PIXEL.items()}


def _angle_mod180(a, b) -> float:
    return math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) % 180.0


def _circ_dist_mod180(x: float, y: float) -> float:
    d = abs(x - y) % 180.0
    return min(d, 180.0 - d)


def _pair_key(p) -> tuple:
    """`_greedy_select_pairs`'s sort key, replicated so a rank can be reported."""
    return (-p[0], p[1], p[2], p[3])


def _gate_report(pi, pj, max_search_window: float, mm: float) -> dict:
    """Evaluate `_raw_pairs_in_bucket`'s gates one at a time for a specific
    pair, so a non-formed pair names the gate that killed it."""
    lo = max(pi.along_lo, pj.along_lo)
    hi = min(pi.along_hi, pj.along_hi)
    overlap_len = hi - lo
    shorter = min(pi.along_hi - pi.along_lo, pj.along_hi - pj.along_lo)
    perp_gap = abs(pj.perp - pi.perp)
    min_thickness = MIN_THICKNESS_STROKE_MULTIPLE * max(pi.seg.stroke_width, pj.seg.stroke_width)
    frac = (overlap_len / shorter) if shorter > 0 else 0.0
    gates = {
        "search_window": {
            "pass": perp_gap <= max_search_window,
            "perp_gap_mm": round(perp_gap * mm, 1),
            "window_mm": round(max_search_window * mm, 1),
        },
        "positive_overlap": {"pass": overlap_len > 0, "overlap_mm": round(overlap_len * mm, 1)},
        "overlap_fraction": {
            "pass": shorter > 0 and frac >= MIN_OVERLAP_FRACTION,
            "fraction": round(frac, 4),
            "required": MIN_OVERLAP_FRACTION,
        },
        "min_thickness_stroke_multiple": {
            "pass": perp_gap >= min_thickness,
            "thickness_mm": round(perp_gap * mm, 1),
            "min_thickness_mm": round(min_thickness * mm, 1),
        },
    }
    return {
        "formed": all(g["pass"] for g in gates.values()),
        "gates": gates,
        "overlap_len_native": round(overlap_len, 4),
        "thickness_native": round(perp_gap, 4),
    }


def _describe_pair(p, mm: float, idx_meaning: dict[int, str]) -> dict:
    overlap_len, thickness, i_idx, j_idx, _lo, _hi, _perp_mid = p
    return {
        "i_idx": i_idx,
        "j_idx": j_idx,
        "overlap_mm": round(overlap_len * mm, 1),
        "thickness_mm": round(thickness * mm, 1),
        "i_role": idx_meaning.get(i_idx, "unrelated"),
        "j_role": idx_meaning.get(j_idx, "unrelated"),
    }


def main() -> None:
    displacement = json.loads(DISPLACEMENT_PATH.read_text(encoding="utf-8"))
    length_floor = json.loads(LENGTH_FLOOR_PATH.read_text(encoding="utf-8"))
    entries = {e.plan_id: e for e in load_registry()}

    targets = [r for r in length_floor["per_wall"] if r["verdict"] == "PRESENT_AND_KEPT"]
    disp_by_key = {(d["plan_id"], d["gt_wall_id"]): d for d in displacement["per_wall"]}

    # One dissect/select per plan, reused across that plan's walls.
    cache: dict[str, dict] = {}

    results = []
    for t in targets:
        plan_id = t["plan_id"]
        if plan_id not in cache:
            entry = entries[plan_id]
            dissection = dissect(REPO_ROOT / entry.source_file)[0]
            selection = select_axis_aligned(dissection)
            diagonal = math.hypot(*dissection.page_size_px)
            length_floor_native = MIN_CANDIDATE_LENGTH_FRAC * diagonal
            max_search_window = MAX_THICKNESS_SEARCH_FRAC * diagonal
            long_enough = [
                i for i, seg in enumerate(selection.candidates) if seg.length >= length_floor_native
            ]
            bucket_of = {
                i: _bucket_for(selection.candidates[i].angle_deg, selection.theta_deg)
                for i in long_enough
            }
            d_a, n_a = _axis_frame(selection.theta_deg)
            proj = {
                "A": _project_bucket(
                    [i for i in long_enough if bucket_of[i] == "A"], selection.candidates, d_a, n_a
                ),
                "B": _project_bucket(
                    [i for i in long_enough if bucket_of[i] == "B"], selection.candidates, n_a, d_a
                ),
            }
            raw = {b: _raw_pairs_in_bucket(proj[b], max_search_window) for b in ("A", "B")}
            accepted = {b: _greedy_select_pairs(raw[b]) for b in ("A", "B")}
            # rank of every raw pair under greedy's own ordering
            rank = {}
            for b in ("A", "B"):
                for r, p in enumerate(sorted(raw[b], key=_pair_key)):
                    rank[(b, p[2], p[3])] = r
            consumed_by = {}
            for b in ("A", "B"):
                for p in accepted[b]:
                    consumed_by[(b, p[2])] = p
                    consumed_by[(b, p[3])] = p
            cache[plan_id] = {
                "selection": selection,
                "mm": _gt_scale(dissection.page_size_px) * MM_PER_PRED_UNIT[plan_id],
                "length_floor_native": length_floor_native,
                "max_search_window": max_search_window,
                "bucket_of": bucket_of,
                "proj_by_idx": {b: {p.idx: p for p in proj[b]} for b in ("A", "B")},
                "raw": raw,
                "rank": rank,
                "consumed_by": consumed_by,
                "n_raw": {b: len(raw[b]) for b in ("A", "B")},
            }
        c = cache[plan_id]
        mm = c["mm"]
        selection = c["selection"]

        disp = disp_by_key[(plan_id, t["gt_wall_id"])]
        gt = json.loads((GT_DIR / f"{plan_id}.json").read_text(encoding="utf-8"))
        gw = next(w for w in gt["walls"] if w["id"] == t["gt_wall_id"])
        gs, ge = tuple(gw["start"]), tuple(gw["end"])
        wall_len = math.hypot(ge[0] - gs[0], ge[1] - gs[1])
        ua = ((ge[0] - gs[0]) / wall_len, (ge[1] - gs[1]) / wall_len)
        up = (-ua[1], ua[0])

        # near-face = L1 covering ink on the known-good side; partner = the
        # opposite-side segments the length-floor test already isolated.
        l1 = disp["_detail"]["L1"]
        known_side_positive = sum(1 for d in l1 if d["offset_mm"] > 0) >= sum(
            1 for d in l1 if d["offset_mm"] < 0
        )
        near_face_idxs = [
            d["select_idx"] for d in l1 if (d["offset_mm"] > 0) == known_side_positive
        ]
        partner_idxs = [
            o["select_idx"] for o in t["opposite_side_segments"] if o["kept_by_length_floor"]
        ]
        idx_meaning = {i: "near_face" for i in near_face_idxs}
        idx_meaning.update({i: "correct_partner" for i in partner_idxs})

        combos = []
        for xi in near_face_idxs:
            for pi_idx in partner_idxs:
                rec: dict = {"near_face_idx": xi, "partner_idx": pi_idx}
                bx, bp = c["bucket_of"].get(xi), c["bucket_of"].get(pi_idx)
                if bx is None or bp is None:
                    rec["formed"] = False
                    rec["killed_by"] = "length_floor"
                    rec["detail"] = {
                        "near_face_len_mm": round(selection.candidates[xi].length * mm, 1),
                        "partner_len_mm": round(selection.candidates[pi_idx].length * mm, 1),
                        "floor_mm": round(c["length_floor_native"] * mm, 1),
                    }
                    combos.append(rec)
                    continue
                if bx != bp:
                    rec["formed"] = False
                    rec["killed_by"] = "axis_bucket_mismatch"
                    rec["detail"] = {"near_face_bucket": bx, "partner_bucket": bp}
                    combos.append(rec)
                    continue
                px = c["proj_by_idx"][bx][xi]
                pp = c["proj_by_idx"][bx][pi_idx]
                gr = _gate_report(px, pp, c["max_search_window"], mm)
                rec.update(gr)
                rec["bucket"] = bx
                if not gr["formed"]:
                    rec["killed_by"] = next(k for k, v in gr["gates"].items() if not v["pass"])
                    combos.append(rec)
                    continue
                lo_i, hi_i = (xi, pi_idx) if px.perp <= pp.perp else (pi_idx, xi)
                key = (bx, lo_i, hi_i)
                rec["greedy_rank"] = c["rank"].get(key)
                rec["n_raw_pairs_in_bucket"] = c["n_raw"][bx]
                won_x = c["consumed_by"].get((bx, xi))
                won_p = c["consumed_by"].get((bx, pi_idx))
                rec["accepted"] = bool(
                    won_x is not None and won_x[2] == lo_i and won_x[3] == hi_i
                )
                rec["near_face_consumed_by"] = (
                    _describe_pair(won_x, mm, idx_meaning) if won_x else None
                )
                rec["partner_consumed_by"] = (
                    _describe_pair(won_p, mm, idx_meaning) if won_p else None
                )
                if won_x and not rec["accepted"]:
                    winner_key = _pair_key(won_x)
                    correct = next(
                        p for p in c["raw"][bx] if p[2] == lo_i and p[3] == hi_i
                    )
                    correct_key = _pair_key(correct)
                    decided = next(
                        (
                            name
                            for name, w, cc in zip(
                                ("overlap_len", "thickness", "i_idx", "j_idx"),
                                winner_key,
                                correct_key,
                            )
                            if w != cc
                        ),
                        "exact_tie",
                    )
                    rec["decided_by_sort_field"] = decided
                    rec["winner_rank"] = c["rank"].get((bx, won_x[2], won_x[3]))
                combos.append(rec)

        # CEILING CHECK -- the question the fork actually turns on. Suppose
        # greedy were fixed perfectly and EVERY formed correct pair were
        # accepted. The wall those pairs describe spans only the union of
        # their along-axis overlaps. `eval/`'s frozen matcher requires
        # overlap_ratio > 0.8 of the GT wall, so if that union covers less
        # than 80% of the GT wall, no pairing-side fix can ever produce a
        # matchable wall here and the ceiling is upstream in select/dissect,
        # not in pair.py. Computed as a union of intervals, so overlapping
        # fragments are not double-counted.
        intervals = []
        for cb in combos:
            if not cb.get("formed"):
                continue
            bx = cb["bucket"]
            px = c["proj_by_idx"][bx][cb["near_face_idx"]]
            pp = c["proj_by_idx"][bx][cb["partner_idx"]]
            lo = max(px.along_lo, pp.along_lo)
            hi = min(px.along_hi, pp.along_hi)
            if hi > lo:
                intervals.append((lo, hi))
        union = 0.0
        if intervals:
            intervals.sort()
            cur_lo, cur_hi = intervals[0]
            for lo, hi in intervals[1:]:
                if lo > cur_hi:
                    union += cur_hi - cur_lo
                    cur_lo, cur_hi = lo, hi
                else:
                    cur_hi = max(cur_hi, hi)
            union += cur_hi - cur_lo
        union_mm = union * mm
        ceiling = {
            "union_span_of_formed_correct_pairs_mm": round(union_mm, 1),
            "gt_length_mm": t["gt_length_mm"],
            "coverage_ratio": round(union_mm / t["gt_length_mm"], 4) if t["gt_length_mm"] else 0.0,
            "matcher_overlap_ratio_bar": 0.8,
            "matchable_even_with_perfect_greedy": union_mm / t["gt_length_mm"] > 0.8
            if t["gt_length_mm"]
            else False,
        }

        results.append(
            {
                "plan_id": plan_id,
                "gt_wall_id": t["gt_wall_id"],
                "gt_length_mm": t["gt_length_mm"],
                "near_face_idxs": near_face_idxs,
                "partner_idxs": partner_idxs,
                "n_combinations": len(combos),
                "any_correct_pair_formed": any(cb.get("formed") for cb in combos),
                "any_correct_pair_accepted": any(cb.get("accepted") for cb in combos),
                "ceiling_if_greedy_were_perfect": ceiling,
                "combinations": combos,
            }
        )

    summary = {
        "n_walls": len(results),
        "n_with_correct_pair_formed": sum(1 for r in results if r["any_correct_pair_formed"]),
        "n_with_correct_pair_accepted": sum(1 for r in results if r["any_correct_pair_accepted"]),
        "killed_by_counts": {},
        "decided_by_sort_field_counts": {},
        "n_matchable_even_with_perfect_greedy": sum(
            1 for r in results if r["ceiling_if_greedy_were_perfect"]["matchable_even_with_perfect_greedy"]
        ),
    }
    for r in results:
        for cb in r["combinations"]:
            if cb.get("killed_by"):
                k = cb["killed_by"]
                summary["killed_by_counts"][k] = summary["killed_by_counts"].get(k, 0) + 1
            if cb.get("decided_by_sort_field"):
                k = cb["decided_by_sort_field"]
                summary["decided_by_sort_field_counts"][k] = (
                    summary["decided_by_sort_field_counts"].get(k, 0) + 1
                )

    out = {
        "pre_registered_prediction": (
            "Correct pair IS formed; loses on the SECOND sort key (thickness ascending) to a "
            "thinner wrong pair at equal overlap, not on absolute overlap. Falsifier: correct "
            "pair never formed -> greedy exonerated, the named gate is the finding instead."
        ),
        "summary": summary,
        "per_wall": results,
    }
    OUT_DIR.mkdir(exist_ok=True)
    (OUT_DIR / "step3a_greedy_competition.json").write_text(
        json.dumps(out, indent=2), encoding="utf-8"
    )
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
