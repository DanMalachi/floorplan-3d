"""Track V milestone 2 step 3a -- Blocker 1: does `MIN_CANDIDATE_LENGTH_FRAC`
delete the correct partner face before pairing ever runs?

Dan's hypothesis (his, explicitly flagged as his and scored on this file
before -- weight accordingly): the length floor deletes the CORRECT
opposite-face segment before `pair_walls()` sees it, which is precisely why
fixing the search window (factorial, prior commit) was necessary but not
sufficient -- for 6 of 8 displaced walls, a wider/narrower window cannot
find a partner that was never in the candidate set pairing operates on.

Scope: the 6 of 8 displaced walls the window lever did NOT recover
(15x30 w_s2/w_s4/w_s6; 30x50 w_s111/w_s117/w_s142). w_s106 and w_s138 are
excluded -- window already fixed them, this question does not apply.

Method, decisive and cheap per Dan's instruction: for each wall, look at
`selection.candidates` -- ALL of them, length filtering is applied only
inside `pair_walls()`, never inside `select_axis_aligned()`, so this
population already contains every segment regardless of length. Split the
wall's covering ink (same orientation+centerline-window test used
throughout this investigation) by which side of the GT centerline it falls
on. The known-correct ink (already established at L1 in the displacement
measurement) sits on one side; the question is the OTHER side, the true
partner face:
  - PRESENT_AND_REMOVED : ink exists on the opposite side, but every such
                           segment is shorter than pair.py's own length
                           floor -- never reaches pairing.
  - PRESENT_AND_KEPT     : ink exists on the opposite side AND at least one
                            such segment is long enough to survive the
                            floor -- if the wall is still mispaired despite
                            this, the floor is NOT the cause and something
                            else in raw-pair-formation/greedy is.
  - NEVER_PRESENT        : no segment at all on the opposite side within the
                            capture window, at any length -- select.py never
                            extracted that face. The length floor is
                            irrelevant; the ceiling is upstream, in select.

This is the fork Dan asked to be stated plainly: if PRESENT_AND_REMOVED
dominates, recall is capped by construction and the cap is removable. If
NEVER_PRESENT dominates, recall's ceiling is unlocated in this module and
sits upstream.

Diagnostic only. Does not modify select.py, pair.py, assemble.py, or eval/.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from eval.registry.registry import load_registry  # noqa: E402
from extraction.trackv.run_step3a import _gt_scale  # noqa: E402
from extraction.trackv.dissect import dissect  # noqa: E402
from extraction.trackv.pair import MIN_CANDIDATE_LENGTH_FRAC  # noqa: E402
from extraction.trackv.select import select_axis_aligned  # noqa: E402

OUT_DIR = Path(__file__).parent / "out"
GT_DIR = REPO_ROOT / "data" / "corpus" / "gt_provisional"
DISPLACEMENT_PATH = OUT_DIR / "step3a_displacement.json"
FACTORIAL_PATH = OUT_DIR / "step3a_pairing_factorial.json"

LEGACY_METERS_PER_PIXEL = {
    "15x30-ft-Best-House-Plan-Model": 0.008323667459886908,
    "30x50-Model-landscape": 0.012918215560344833,
}
MM_PER_PRED_UNIT = {k: v * 1000.0 for k, v in LEGACY_METERS_PER_PIXEL.items()}

# Window-recovered walls -- excluded, the question doesn't apply to them.
RECOVERED_BY_WINDOW = {"30x50-Model-landscape": {"w_s106", "w_s138"}}


def _angle_mod180(a, b) -> float:
    return math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) % 180.0


def _circ_dist_mod180(x: float, y: float) -> float:
    d = abs(x - y) % 180.0
    return min(d, 180.0 - d)


def main() -> None:
    displacement = json.loads(DISPLACEMENT_PATH.read_text(encoding="utf-8"))
    entries = {e.plan_id: e for e in load_registry()}

    targets = [
        r
        for r in displacement["per_wall"]
        if r["gt_wall_id"] not in RECOVERED_BY_WINDOW.get(r["plan_id"], set())
    ]

    results = []
    for t in targets:
        plan_id = t["plan_id"]
        entry = entries[plan_id]
        dissection = dissect(REPO_ROOT / entry.source_file)[0]
        raster_scale = _gt_scale(dissection.page_size_px)
        mm = raster_scale * MM_PER_PRED_UNIT[plan_id]
        diagonal_native = math.hypot(*dissection.page_size_px)
        length_floor_native = MIN_CANDIDATE_LENGTH_FRAC * diagonal_native

        selection = select_axis_aligned(dissection)
        angular_tol = selection.angular_tolerance_deg

        gt = json.loads((GT_DIR / f"{plan_id}.json").read_text(encoding="utf-8"))
        gw = next(w for w in gt["walls"] if w["id"] == t["gt_wall_id"])
        gs, ge = tuple(gw["start"]), tuple(gw["end"])
        wall_len = math.hypot(ge[0] - gs[0], ge[1] - gs[1])
        wall_angle = _angle_mod180(gs, ge)
        ua = ((ge[0] - gs[0]) / wall_len, (ge[1] - gs[1]) / wall_len)
        up = (-ua[1], ua[0])

        gt_diagonal = math.hypot(
            max(pt[0] for w in gt["walls"] for pt in (w["start"], w["end"]))
            - min(pt[0] for w in gt["walls"] for pt in (w["start"], w["end"])),
            max(pt[1] for w in gt["walls"] for pt in (w["start"], w["end"]))
            - min(pt[1] for w in gt["walls"] for pt in (w["start"], w["end"])),
        )
        tau_abs = 0.01 * gt_diagonal

        # Known covering ink side, from the displacement measurement's L1.
        known_offsets = [d["offset_mm"] for d in t["_detail"]["L1"]]
        known_side_positive = sum(1 for o in known_offsets if o > 0) >= sum(1 for o in known_offsets if o < 0)

        opposite = []  # segments on the OTHER side from the known-good ink
        same_side = []
        for i, s in enumerate(selection.candidates):
            a = (s.p0[0] * mm, s.p0[1] * mm)
            b = (s.p1[0] * mm, s.p1[1] * mm)
            seg_angle = _angle_mod180(a, b)
            if _circ_dist_mod180(seg_angle, wall_angle) > angular_tol:
                continue
            mid = ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0)
            offset = (mid[0] - gs[0]) * up[0] + (mid[1] - gs[1]) * up[1]
            if abs(offset) > tau_abs:
                continue
            along = (mid[0] - gs[0]) * ua[0] + (mid[1] - gs[1]) * ua[1]
            if along < -tau_abs or along > wall_len + tau_abs:
                continue
            is_positive = offset > 0
            entry_rec = {
                "select_idx": i,
                "offset_mm": round(offset, 1),
                "length_native": round(s.length, 4),
                "length_mm": round(s.length * mm, 1),
                "kept_by_length_floor": s.length >= length_floor_native,
            }
            if is_positive == known_side_positive:
                same_side.append(entry_rec)
            else:
                opposite.append(entry_rec)

        if not opposite:
            verdict = "NEVER_PRESENT"
        elif any(o["kept_by_length_floor"] for o in opposite):
            verdict = "PRESENT_AND_KEPT"
        else:
            verdict = "PRESENT_AND_REMOVED"

        results.append(
            {
                "plan_id": plan_id,
                "gt_wall_id": t["gt_wall_id"],
                "gt_length_mm": round(wall_len, 1),
                "length_floor_mm": round(length_floor_native * mm, 1),
                "verdict": verdict,
                "n_opposite_side_segments": len(opposite),
                "opposite_side_segments": opposite,
                "n_same_side_segments": len(same_side),
            }
        )

    counts = {}
    for r in results:
        counts[r["verdict"]] = counts.get(r["verdict"], 0) + 1

    out = {
        "pre_registered_expectation_note": "Dan's hypothesis, his track record on this file noted (4 prior calls, mixed); fork stated as instructed rather than a point prediction -- PRESENT_AND_REMOVED dominating caps recall removably, NEVER_PRESENT dominating means the ceiling is upstream in select.py.",
        "n_walls_tested": len(results),
        "verdict_counts": counts,
        "per_wall": results,
    }
    (OUT_DIR / "step3a_length_floor_test.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
