"""READ-ONLY recount (2026-07-22): re-run the corrected classify() over the
full 17K population and report the defect-count delta against the pre-fix
numbers recorded in reports/p3a-notch-diagnosis.md (1800 edges / 1100 plans
classed a_genuine_gt_defect_between_rooms). No pipeline file touched here --
this only re-executes analyze_plan/classify (classify_room_boundary_no_wall_match.py,
the one file corrected this session) over the population and tabulates."""
from __future__ import annotations

import pickle
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from extraction.synth.qa.classify_room_boundary_no_wall_match import analyze_plan, classify

PKL_PATH = Path(__file__).resolve().parents[3] / "data" / "resplan" / "raw" / "ResPlan.pkl"
DEFECT_CATEGORY = "a_genuine_gt_defect_between_rooms"

PRE_FIX_A_EDGES = 1800
PRE_FIX_A_PLANS = 1100


def main():
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)

    edge_hist = Counter()
    a_plans = 0
    for raw_plan in plans:
        old_edges = analyze_plan(raw_plan)
        if not old_edges:
            continue
        cats = set()
        for e in old_edges:
            cat = classify(e)
            edge_hist[cat] += 1
            cats.add(cat)
        if DEFECT_CATEGORY in cats:
            a_plans += 1

    a_edges = edge_hist[DEFECT_CATEGORY]
    print("Post-fix edge-level category histogram:")
    for cat, count in edge_hist.most_common():
        print(f"  {cat}: {count}")

    print(f"\n{DEFECT_CATEGORY} (edge-level): pre-fix={PRE_FIX_A_EDGES}  post-fix={a_edges}  "
          f"delta={a_edges - PRE_FIX_A_EDGES}")
    print(f"{DEFECT_CATEGORY} (plan-level, >=1 edge): pre-fix={PRE_FIX_A_PLANS}  post-fix={a_plans}  "
          f"delta={a_plans - PRE_FIX_A_PLANS}")


if __name__ == "__main__":
    main()
