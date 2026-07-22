"""Re-measurement session (2026-07-22), READ-ONLY: doorway-notch
suppression is now live in check_plan (measure_clean_at_source.py,
committed 1881b8a). This script makes NO code changes to check_plan,
rooms.py, skeleton.py, or any measurement script — it only reads the
current, suppression-live check_plan's output at population scale and
cross-tabulates it against the UNCHANGED classify_room_boundary_no_wall_match.py
taxonomy (which has no knowledge of the suppression rule at all, since it
reimplements its own coverage check independently) to answer three
questions, in order of importance per Dan's ask:

  1. DEFECT-FLIP CHECK (the acceptance gate): of the plans
     classify_room_boundary_no_wall_match.py's classify() puts in
     'a_genuine_gt_defect_between_rooms' for at least one edge, how many
     now score clean_at_source=True under the suppression-live check_plan?
     Expected: ZERO. Any non-zero count means the rule is over-suppressing
     a real defect and the fix is not accepted regardless of the
     clean-rate gain.
  2. Source-clean rate: new clean_at_source % on the full 17K vs the
     80.2% pre-suppression baseline (docs/session-notes/p3a-handoff.md).
     Also: total notch_suppressions fired and how many plans they touched
     — cross-checked against the ~34.4% plan-level / ~46.1% edge-level
     doorway-notch population sizing from the discriminator-validation
     session (measured with a simpler opening_coverage>=0.8-only test,
     not the full conjunction — some drift either direction is expected,
     but a wildly different number is a flag that the rule is catching
     more than notches).
  3. Converter-clean-subset rate: reuses
     classify_room_boundary_no_wall_match.compute_conditional_clean_rate
     UNCHANGED (it already imports check_plan dynamically, so it picks up
     the suppression-live version automatically) — the exact same n=300,
     first-plans methodology the 61.0% baseline was measured on.

analyze_plan/classify (classify_room_boundary_no_wall_match.py) are
reused verbatim for the defect-flip check: analyze_plan reimplements its
own per-edge coverage loop against the (unchanged) _edge_covered/
_wall_boundary_edges/COVERAGE_THRESHOLD primitives, so it reproduces
exactly the PRE-suppression 'genuinely broken' edge set regardless of
what check_plan's own loop now does -- calling it on every plan (not just
a pre-filtered flagged subset) is safe and cheap, since it returns an
empty list immediately for any plan with no broken edges.
"""
from __future__ import annotations

import pickle
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from extraction.synth.qa.classify_room_boundary_no_wall_match import (
    PKL_PATH,
    analyze_plan,
    classify,
    compute_conditional_clean_rate,
)
from extraction.synth.qa.measure_clean_at_source import check_plan

DEFECT_CATEGORY = "a_genuine_gt_defect_between_rooms"

# Prior population sizing (2026-07-21, opening_coverage>=0.8-only test,
# not the full 3-condition conjunction) -- sanity-check anchor, not a
# hard bound.
PRIOR_PLAN_LEVEL_NOTCH_PCT = 34.4  # of then-flagged plans, would fully clear
PRIOR_EDGE_LEVEL_NOTCH_PCT = 46.1  # of then-flagged broken edges


def main():
    with open(PKL_PATH, "rb") as f:
        plans = pickle.load(f)
    n_total = len(plans)

    n_clean_post = 0
    n_suppressions_total = 0
    n_plans_with_suppressions = 0
    n_pre_suppression_flagged_plans = 0
    n_pre_suppression_broken_edges = 0

    a_classed_plans = []          # (resplan_id,) with >=1 a_genuine_gt_defect edge, pre-suppression
    a_classed_flip_to_clean = []  # subset of the above now clean_at_source post-suppression

    t0 = time.time()
    for i, raw_plan in enumerate(plans):
        # Pre-suppression classification, from the UNCHANGED diagnostic
        # taxonomy -- independent of check_plan's own suppression logic.
        old_edges = analyze_plan(raw_plan)
        is_a_classed = False
        if old_edges:
            n_pre_suppression_flagged_plans += 1
            n_pre_suppression_broken_edges += len(old_edges)
            cats = {classify(e) for e in old_edges}
            if DEFECT_CATEGORY in cats:
                is_a_classed = True
                a_classed_plans.append(raw_plan.get("id"))

        # Current, suppression-live check_plan.
        result = check_plan(raw_plan)
        if result["clean_at_source"]:
            n_clean_post += 1
        n_sup = len(result["notch_suppressions"])
        if n_sup:
            n_suppressions_total += n_sup
            n_plans_with_suppressions += 1

        if is_a_classed and result["clean_at_source"]:
            a_classed_flip_to_clean.append(raw_plan.get("id"))

        if (i + 1) % 2000 == 0:
            elapsed = time.time() - t0
            print(f"  ...{i + 1}/{n_total} ({elapsed:.0f}s elapsed, "
                  f"{elapsed / (i + 1) * n_total:.0f}s projected total)", file=sys.stderr)

    elapsed = time.time() - t0
    print(f"\nScanned {n_total} plans in {elapsed:.0f}s\n")

    print(f"{'=' * 70}\n1. DEFECT-FLIP CHECK (acceptance gate)")
    print(f"  Plans with >=1 edge classed '{DEFECT_CATEGORY}' pre-suppression: {len(a_classed_plans)}")
    print(f"  Of those, now clean_at_source POST-suppression: {len(a_classed_flip_to_clean)}")
    if a_classed_flip_to_clean:
        print(f"  *** NON-ZERO -- flipped plan ids: {a_classed_flip_to_clean}")
    else:
        print(f"  ZERO flips -- guardrail holds at population scale.")

    print(f"\n{'=' * 70}\n2. Source-clean rate")
    print(f"  clean_at_source (post-suppression): {n_clean_post}/{n_total} "
          f"({100 * n_clean_post / n_total:.1f}%)  [baseline pre-suppression: 80.2%]")
    print(f"  notch_suppressions fired (edge-level): {n_suppressions_total}")
    print(f"  plans touched by >=1 suppression: {n_plans_with_suppressions}/{n_total} "
          f"({100 * n_plans_with_suppressions / n_total:.1f}%)")
    print(f"  pre-suppression flagged plans (room_boundary_no_wall_match, "
          f"per the unchanged classify_room_boundary_no_wall_match taxonomy): "
          f"{n_pre_suppression_flagged_plans} ({n_pre_suppression_broken_edges} broken edges)")
    if n_pre_suppression_flagged_plans:
        plan_pct = 100 * n_plans_with_suppressions / n_pre_suppression_flagged_plans
        print(f"  -> suppression touched {plan_pct:.1f}% of pre-suppression-flagged plans "
              f"(prior opening_coverage>=0.8-only sizing: {PRIOR_PLAN_LEVEL_NOTCH_PCT}% would "
              f"fully clear -- not the same metric, this is 'touched by >=1 suppression', "
              f"a looser bar, so some excess over that anchor is expected)")
    if n_pre_suppression_broken_edges:
        edge_pct = 100 * n_suppressions_total / n_pre_suppression_broken_edges
        print(f"  -> suppression fired on {edge_pct:.1f}% of pre-suppression broken edges "
              f"(prior opening_coverage>=0.8-only sizing: {PRIOR_EDGE_LEVEL_NOTCH_PCT}%)")

    print(f"\n{'=' * 70}\n3. Converter-clean-subset rate (n=300, reusing compute_conditional_clean_rate unchanged)")
    compute_conditional_clean_rate(300)


if __name__ == "__main__":
    main()
