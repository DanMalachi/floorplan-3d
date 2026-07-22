"""READ-ONLY, re-anchored acceptance gate (2026-07-22): does check_plan's
doorway-notch suppression (measure_clean_at_source.py) ever suppress an edge
that human audit -- not classify() -- says is a genuine inter-room defect?

Per reports/p3a-notch-diagnosis.md / p3a-notch-resolution.md: the original
flip gate compared check_plan's suppressions against classify()'s
a_genuine_gt_defect_between_rooms label, which turned out to be an
uncorrected heuristic with a proven systematic blind spot (single-condition
opening_coverage>=0.8 cutoff). That made classify() a poor oracle. This gate
replaces the oracle with extraction/synth/qa/audited_notch_ground_truth.json
-- a human-verified verdict for every edge in the risk surface (every
a_genuine_gt_defect_between_rooms edge with opening_coverage>=0.65, the only
band check_plan's suppression predicate can ever touch).

classify() remains useful as the CANDIDATE GENERATOR (it finds edges worth
auditing); it is no longer the ground truth the gate checks against.

Any newly-appearing a-classed edge with opening_coverage>=0.65 that is NOT
yet in the audited JSON is flagged as UNAUDITED and must be manually
reviewed (rendered + visually verified, same as this session's process)
before the gate's PASS/FAIL verdict can be trusted -- this script does not
guess a verdict for it.
"""
from __future__ import annotations

import json
import pickle
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from extraction.synth.qa.classify_room_boundary_no_wall_match import analyze_plan, classify
from extraction.synth.qa.measure_clean_at_source import check_plan

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"
GT_PATH = Path(__file__).resolve().parent / "audited_notch_ground_truth.json"
DEFECT_CATEGORY = "a_genuine_gt_defect_between_rooms"
RISK_BAND_FLOOR = 0.65  # matches check_plan's OPENING_COVERAGE_THRESHOLD -- the only band it can ever suppress in


def main():
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)
    gt = json.loads(GT_PATH.read_text())
    audited = {(e["plan_id"], e["room"], e["edge_index"]): e for e in gt["audited_edges"]}

    unaudited = []
    wrongly_suppressed = []
    correctly_suppressed = []
    correctly_not_suppressed = []
    recall_gaps = []

    for raw_plan in plans:
        old_edges = analyze_plan(raw_plan)
        if not old_edges:
            continue
        risk_edges = [e for e in old_edges
                      if classify(e) == DEFECT_CATEGORY and e["opening_coverage"] >= RISK_BAND_FLOOR]
        if not risk_edges:
            continue

        result = check_plan(raw_plan)
        suppressed_keys = set()
        for s in result["notch_suppressions"]:
            parts = s.split(":")
            suppressed_keys.add((parts[1], int(parts[2][4:])))

        for e in risk_edges:
            key = (raw_plan.get("id"), e["room"], e["edge_index"])
            is_suppressed = (e["room"], e["edge_index"]) in suppressed_keys
            if key not in audited:
                unaudited.append((key, is_suppressed))
                continue
            verdict = audited[key]["verdict"]
            is_true_notch = verdict.startswith("notch")
            if is_suppressed and not is_true_notch:
                wrongly_suppressed.append(key)
            elif is_suppressed and is_true_notch:
                correctly_suppressed.append(key)
            elif not is_suppressed and is_true_notch:
                recall_gaps.append(key)
            else:
                correctly_not_suppressed.append(key)

    print(f"Audited-set gate result (risk band: opening_coverage >= {RISK_BAND_FLOOR}):")
    print(f"  correctly suppressed (audited notch, rule suppressed):     {len(correctly_suppressed)}")
    print(f"  correctly NOT suppressed (audited non-notch, rule didn't): {len(correctly_not_suppressed)}")
    print(f"  recall gaps (audited notch, rule did NOT suppress -- safe miss, not a failure): {len(recall_gaps)}")
    for k in recall_gaps:
        print(f"    {k}")
    print(f"  WRONGLY suppressed (audited non-notch, rule suppressed anyway -- ACCEPTANCE FAILURE): "
          f"{len(wrongly_suppressed)}")
    for k in wrongly_suppressed:
        print(f"    *** {k} ***")
    print(f"  UNAUDITED (new risk-band edge not in ground truth -- manual audit required, "
          f"gate verdict below excludes these): {len(unaudited)}")
    for k, sup in unaudited:
        print(f"    {k}  currently_suppressed={sup}")

    if wrongly_suppressed:
        print("\nGATE: FAIL -- suppression rule wrongly clears an audited genuine defect.")
    elif unaudited:
        print("\nGATE: INCOMPLETE -- new unaudited risk-band edges found; audit them before trusting PASS.")
    else:
        print("\nGATE: PASS -- suppression rule is clean against the full audited risk surface.")


if __name__ == "__main__":
    main()
