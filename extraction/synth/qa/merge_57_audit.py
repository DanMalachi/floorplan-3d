"""One-shot merge (2026-07-26): apply this session's human verdicts for the
57 previously-UNAUDITED risk-band edges (priority 1 of the next-session spec
in reports/p3a-notch-resolution.md) into audited_notch_ground_truth.json.

Verdict taxonomy, extended from the original 8-edge audit's three verdicts
(notch / not_notch_diagonal_chamfer / not_notch_jagged_boundary_artifact /
notch_but_check_plan_recall_miss) with one new verdict this session's
population-scale review surfaced as the dominant mechanism -- not seen at
n=8 -- and one residual "other":

- not_notch_diagonal_wall_mismatch (NEW, dominant this session): a smooth
  diagonal room-boundary edge crossing a wall the source represents as an
  axis-aligned staircase (or that is simply absent from the wall polygon's
  own edge set at that angle). Real wall ink is visibly present in every
  overlay -- this is a coverage-matching TECHNIQUE limitation (the parallel-
  candidate search requires cos_a>=0.9 to a single wall-polygon edge, which
  a smooth diagonal can structurally never satisfy against a staircase),
  not evidence the source omits a partition. Distinct from
  not_notch_diagonal_chamfer (the original audit's term for the same
  geometric shape) only in naming precision -- kept as a new value rather
  than overloading the old one, since "chamfer" implies a small corner
  clip while several of these are long mid-wall diagonal runs.
- not_notch_jagged_boundary_artifact: reused verbatim, same mechanism
  already documented (plan 1437's irregular multi-facet room boundary).
- not_notch_axis_aligned_gap: NEW, n=1 (plan 16342). The one edge in this
  batch that is NOT diagonal (cos_to_neighbor~1.0, i.e. collinear with its
  neighbor) -- sits parallel to a door reveal's own threshold/header line,
  not a jamb. Genuinely distinct mechanism, kept unmerged with the rest.

Cross-cutting, orthogonal finding (recorded in the report, not encoded as a
verdict): several pairs/clusters in this batch are exact or near-exact
duplicate ring edges (same coordinates) or a duplicate PLAN under two ids
(2098/2099) -- noted in reports/p3a-audit-57-unaudited.md, still added here
individually since the audited-JSON schema is keyed by
(plan_id, room, edge_index), and gate_flip_check_audited.py needs an entry
for every key it enumerates regardless of duplication.
"""
from __future__ import annotations

import json
from pathlib import Path

GT_PATH = Path(__file__).resolve().parent / "audited_notch_ground_truth.json"
SIGNALS_PATH = Path(__file__).resolve().parent / "unaudited_57_signals.json"

# index -> verdict, per this session's visual audit (see report for the
# per-edge rationale). Default is the dominant mechanism; overridden below
# for the two exceptions found.
DEFAULT_VERDICT = "not_notch_diagonal_wall_mismatch"
OVERRIDES = {
    39: "not_notch_axis_aligned_gap",          # plan 16342 bedroom_1 e19
    40: "not_notch_jagged_boundary_artifact",  # plan 1437 bathroom_2 e12
    41: "not_notch_jagged_boundary_artifact",  # plan 1437 bedroom_0 e8
    42: "not_notch_jagged_boundary_artifact",  # plan 1437 bedroom_1 e7
}


def main():
    signals = json.loads(SIGNALS_PATH.read_text())
    gt = json.loads(GT_PATH.read_text())
    existing_keys = {(e["plan_id"], e["room"], e["edge_index"]) for e in gt["audited_edges"]}

    added = 0
    for idx, s in enumerate(signals):
        key = (s["plan_id"], s["room"], s["edge_index"])
        if key in existing_keys:
            print(f"already present, skipping: {key}")
            continue
        verdict = OVERRIDES.get(idx, DEFAULT_VERDICT)
        entry = {
            "plan_id": s["plan_id"],
            "room": s["room"],
            "edge_index": s["edge_index"],
            "verdict": verdict,
            "opening_coverage": s["opening_coverage"],
            "cos_to_neighbor": s["cos_to_neighbor"],
            "jamb_ratio": s["jamb_ratio"],
            "door_witness": s["door_witness"],
            "residual_gap_beyond_door_span": s["residual_max_gap"],
            "overlay": str(Path(s["overlay"]).relative_to(Path(__file__).resolve().parents[3])).replace("\\", "/"),
        }
        gt["audited_edges"].append(entry)
        added += 1

    gt["_meta"]["updated_2026_07_26"] = (
        "Added 57 previously-UNAUDITED edges (priority 1 of the next-session spec in "
        "reports/p3a-notch-resolution.md). All 57 confirmed NOT a doorway notch by visual "
        "audit -- classify()'s exclusion of them from e_opening_doorway_notch is correct in "
        "every case (0/57 wrongly excluded). Dominant mechanism (not_notch_diagonal_wall_mismatch, "
        "~46/57): a smooth diagonal room-boundary edge over a wall the source represents as an "
        "axis-aligned staircase, or absent from the wall polygon's own edge set at that angle -- "
        "real wall ink is visibly present in every overlay; this is a coverage-matching TECHNIQUE "
        "limitation, not evidence of an omitted partition. See reports/p3a-audit-57-unaudited.md "
        "for the full per-edge rationale and the duplicate-edge/duplicate-plan findings."
    )

    GT_PATH.write_text(json.dumps(gt, indent=2) + "\n")
    print(f"\nAdded {added} entries. Total audited_edges now: {len(gt['audited_edges'])}")


if __name__ == "__main__":
    main()
