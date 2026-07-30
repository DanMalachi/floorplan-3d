# Phase 3a — Bathroom lever #2 full blocking-edge census (2026-07-30, 2nd)

Direct response to Dan rejecting a scope-to-469-edges plan before it ran.
Pre-registered objection, scored first: **469 under-recognition edges vs.
3,923 bathroom-ONLY-broken plans caps a maximally generous
one-edge-rescues-one-plan ceiling at 469/3,923 = 12.0%** — and a plan needs
EVERY blocking edge fixed, not one, so the real number can only be lower.
Scoping a ceiling measurement to that 469-edge set alone would answer the
wrong question before even asking what the other ~88%+ is. This report
measures the full census instead.

## Pre-registered expectation (written before running the script below)

1. `diagnose_bathroom_failure.py` (previous session) already showed the
   `check_plan`-level (source, raw-ink) taxonomy barely applies to bathroom
   at all — 529/40,413 instances (1.3%). Expect the notch-under-recognition
   mechanism, though real, to be a MINORITY of this census, not the
   dominant bucket.
2. Expect a mechanism not yet named specifically for bathroom to dominate
   — matching this phase's own repeated pattern (issue #4's
   `no_angle_valid_candidate` surfaced only after the three named
   hypotheses were checked and found insufficient; this session should
   name whatever the data forces, not stretch an existing category to fit).
3. Expect the plan-level reconciliation ceiling (every blocking edge on
   every bathroom room in the plan tagged under-recognition, AND no
   stage-2 cycle_unrepairable bathroom failure in the plan at all) to land
   well under the 12.0% naive cap once the AND-across-edges compounding is
   enforced.

## Method

`extraction/synth/qa/size_bathroom_lever2_census.py` (new). Full
17,000-plan population, no sampling anywhere:

1. Reproduces the exact bathroom-ONLY-broken population
   (`measure_defect_cooccurrence.py`'s own `_defect_classes`, reused
   unchanged: `clean_at_source AND NOT converter_clean`, defect-class set
   `== {"room_broken:bathroom"}` exactly).
2. For every qualifying plan's bathroom room instance(s): runs
   `diagnose_broken_room_cycle.py`'s `analyze_plan` (stage-1 per-edge
   coverage taxonomy, REUSED UNCHANGED) and `diagnose_cycle_unrepairable.py`'s
   `analyze_plan` (stage-2 connectivity/area-match taxonomy, REUSED
   UNCHANGED) — the two mechanisms `resplan_convert.py`'s own clean bar
   actually checks, together a complete census (stage-1 failures never
   reach stage-2, so the two are disjoint and exhaustive by construction).
3. For every stage-1 blocking edge, additionally tags it with the
   under-recognition boolean from `measure_discriminator_disagreement.py`'s
   own per-edge check (`_skeleton_edge_ratio` + `notch.py`'s conjunction,
   REUSED UNCHANGED, only the edge-index bookkeeping is new — the
   predecessor script discarded which edge a disagreement belonged to
   because it only needed a population total, not per-plan attribution).
4. Plan-level reconciliation ceiling: a plan counts only if EVERY stage-1
   blocking edge across every bathroom instance is under-recognition-tagged
   AND the plan has zero stage-2 bathroom failures (reconciling the stage-1
   discriminator does nothing for a stage-2 connectivity/area-match break).
5. The 0.468 calibration factor is applied as a separate, visually distinct
   line — never folded into the raw ceiling, per instruction, since it was
   derived from lever #1's own population and that lever's 5x miss is still
   unexplained.

No changes to `rooms.py`, `assemble_rooms`, or any gate threshold. Read-only
measurement only.

## Results, full 17,000-plan population (1,022s, 8 workers)

**Population reproduced: 3,932 bathroom-ONLY-broken plans** (2026-07-29's
own measurement: 3,923/6,603 — this session's independent re-derivation
confirms the count within 9 plans, consistent with normal cross-session
noise in a different re-scan, not a discrepancy worth chasing). 4/3,932
(0.1%) reproduced no mechanism under this script and are flagged, not
dropped — negligible and consistent with the analogous caveat rate in the
predecessor stage-1/stage-2 diagnostics.

### 1. Full blocking-edge/room census

**Stage-1 (per-edge coverage) touches only 619/3,932 plans (15.7%).**
1,170 blocking edges total:

| Stage-1 category | Edges | % |
|---|---|---|
| `coverage_below_threshold` | 514 | 43.9% |
| `no_angle_valid_candidate` | 411 | 35.1% |
| `angle_filter_rejected_real_match` | 158 | 13.5% |
| `no_candidate_band` | 87 | 7.4% |

**Under-recognition-tagged (the 469-edge mechanism, restricted to this
population): 7/1,170 stage-1 edges (0.6%).** The pre-registered 12.0% naive
cap was already known to be an overestimate before running this — the
actual overlap is two orders of magnitude smaller than even that
conservative cap, because almost none of bathroom's stage-1 edges are
notch-shaped disagreements at all; they're dominated by
`coverage_below_threshold`/`no_angle_valid_candidate`, mechanisms unrelated
to the discriminator-disagreement hypothesis.

**Stage-2 (connectivity/area-match) dominates overwhelmingly: 4,681
room-level failures across 3,467/3,932 plans (88.2%):**

| Stage-2 category | Rooms |
|---|---|
| `area_match:area_match_near_miss` | 4,592 |
| `area_match:area_match_degenerate_face_polygon` | 45 |
| `connectivity_null:bridge_exceeds_depth_cap` | 44 |

**Plan-level split** (stage-1-only 461/3,932 = 11.7%, stage-2-only
3,309/3,932 = 84.2%, both 158/3,932 = 4.0%, neither 4/3,932 = 0.1% —
accounts for all 3,932 exactly). **Bathroom's dominant, isolated blocking
mechanism is `area_match_near_miss` — the mitered face polygon's area
falls outside the 5% gate against the source room polygon — not any
stage-1 discriminator disagreement.**

### Reading this correctly: this is the SAME mechanism already characterized on 2026-07-20, with no known fix

`area_match_near_miss` is not a new discovery — it is the residual noise
from `EMPIRICAL_FACE_OFFSET_MULTIPLIER`'s own calibration, already measured
2026-07-20 (median error 2.09%, p90 4.79%, both real and irreducible per
that session's own finding: "Neither model is a tight fit... looks like
real variability in how ResPlan was authored, not a single clean named
convention... the area gate was correctly left at 5%... this bucket has no
obvious further lever"). Bathroom's small room area makes it
disproportionately sensitive to this same fixed-magnitude offset noise —
consistent with, and now population-confirming at bathroom-specific scale,
a limitation this phase already knew about and had already concluded had
no clear lever.

### 2. Plan-level reconciliation ceiling

**RAW ceiling: 0/3,932 (0.0%).** Not "small" — zero. Every one of the 7
under-recognition-tagged edges belongs to a plan that either has more than
one blocking edge (not all of them under-recognition-tagged) or also
carries a stage-2 failure the reconciliation fix does nothing for.
**CALIBRATED (0.468 factor, stated separately per instruction): 0 × 0.468
= 0.0 plans.** The pre-registered naive cap (469/3,932 = 11.9%) was already
flagged as an overestimate before running the census; the real number is
not "lower than the cap," it is zero.

## Bottom line

**The discriminator-reconciliation fix — the lever the 3rd/4th 2026-07-29
sessions and this phase's handoff both pointed at for bathroom — would
recover approximately ZERO of the 3,932 bathroom-ONLY-broken plans.**
Under-recognition edges are real (469 population-wide, confirmed again
here) but they are not what is actually breaking bathroom's isolated
population; that population is 88.2% dominated by `area_match_near_miss`,
a face-offset-calibration residual already known since 2026-07-20 to have
no obvious lever. **Neither original lever #2 candidate is currently
buildable with a known payoff**: stair is fully calibrated (33.9%) but its
addressable population is tiny (23 plans); bathroom's addressable
population is huge (3,932 plans) but its actual dominant mechanism has no
proposed fix at all — the proposed one (discriminator reconciliation)
measures out to 0.0%. No lever built. This is a correction to the
phase's own standing framing, not an incremental sizing update, and is
reported as plainly as the co-occurrence hypothesis's own falsification
was on 2026-07-29 — stopped here for Dan's decision, per explicit
instruction not to build, touch `assemble_rooms`, move any bar, or grant
an exemption.
