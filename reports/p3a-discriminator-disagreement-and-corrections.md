# Phase 3a — Discriminator disagreement (both directions), survival table, wall-count correction (2026-07-29, 3rd session)

Follow-on to `reports/p3a-gate-v2-retarget.md` and `reports/p3a-defect-
cooccurrence-and-stair-diagnosis.md`, per Dan's rejection of both that
session's co-occurrence conclusion and its replacement explanation. **No
lever built.** Four deliverables, in the order Dan asked for them.

## 0. Correction: the co-occurrence hypothesis is FALSIFIED — record it as Dan's, not mine

Dan's hypothesis, stated when this measurement was commissioned: the
70-80%→55.6% (~5x) miss on lever #1's conditional-rate prediction is
because 34.4% of "would clear" plans had the notch as *a* defect, not the
*only* defect. **Falsified by the full-population co-occurrence measurement
in `reports/p3a-defect-cooccurrence-and-stair-diagnosis.md`**: 81.4% of the
currently-broken population carries exactly one defect class; only 18.6%
carries two or more. A mechanism present in at most 18.6% of the broken
population cannot produce a shortfall of the size actually observed
(roughly 2,100-3,600 plans — see §2 below for how that range is derived).
This is Dan's hypothesis, tested directly, and it did not survive contact
with the population number. Recorded here explicitly so it stops being
implicitly re-asserted in future sessions.

## Correction to the previous report's own replacement claim

The previous version of `reports/p3a-defect-cooccurrence-and-stair-
diagnosis.md` stated the raw-ink-vs-skeleton-band discriminator
disagreement "remains the better-supported explanation" for the 5x miss.
**Dan correctly rejected this as numerically unsupported before this
session measured it**: the only number then in evidence for that mechanism
was 13/17,000 plans (the containment-invariant violations), which — as Dan
pointed out — measures ONE direction only (skeleton-band over-recognizing
relative to raw-ink) and only surfaces when it's the ONLY problem on the
whole plan. 13 cannot explain a shortfall of thousands. That sentence in
the prior report was wrong to assert without the measurement below, and is
superseded by this section. **The 5x miss is relabeled UNEXPLAINED as of
this report** — see the actual measurement's conclusion at the end of §1.

## 1. Both-directions, per-edge discriminator disagreement — full population

**Pre-registered prediction (written before running
`extraction/synth/qa/measure_discriminator_disagreement.py`, per
instruction)**: under-recognition (check_plan's raw-ink discriminator
excuses an edge, assemble_rooms's skeleton-band discriminator does not)
would be substantially LARGER than over-recognition (the reverse), landing
in the low thousands, because the lever #1 report's own 1500-plan sample
found a 16% under-recognition rate among pure-notch rooms.

**This prediction was WRONG, in both direction and magnitude.** Full
population (17,000 plans, 738s/6 workers), scope = every required-room ring
edge where at least one of the two coverage checks (raw wall ink,
skeleton wall bands — reimplemented read-only, no changes to `rooms.py`/
`measure_clean_at_source.py`, same no-pipeline-changes convention
`classify_room_boundary_no_wall_match.py` already established) finds the
edge not genuinely wall-backed (19,965 such edges total):

| | assemble_rooms EXCUSES | assemble_rooms does NOT |
|---|---|---|
| **check_plan EXCUSES** | 4,525 (both agree) | **469 (under-recognition)** |
| **check_plan does NOT** | **1,307 (over-recognition)** | 13,664 (both agree, genuine defect) |

- Under-recognition: **469 edges (2.3% of considered edges)** — smaller
  than predicted, and the direction the lever #1 report emphasized.
- Over-recognition: **1,307 edges (6.5%)** — **2.8x LARGER than
  under-recognition**, the opposite of the pre-registered prediction. This
  direction was previously only visible as 13 PLAN-level containment
  violations — the true edge-level rate is roughly 100x that count. The gap
  between 1,307 edges and 13 plan-level violations is itself informative:
  an over-recognized edge only flips the WHOLE PLAN to wrongly-clean if
  every other room/edge in that plan is also clean — evidently true for
  only about 1% of over-recognized edges (13/1,307), meaning the other ~99%
  of over-recognition instances occur on plans that have a second, unrelated
  problem anyway and so never surface as a containment violation. This is
  the same shape of lesson as the co-occurrence falsification above, just
  in the opposite direction: a real per-edge mechanism can be numerically
  substantial while rarely being the SOLE determinant of a plan's outcome.

**Does this explain the 5x miss? No — not by itself, and that must be said
plainly.** The conditional-rate shortfall (70-80% predicted vs. 55.6%
population actual) is roughly 14.4-24.4 percentage points on a
14,822-plan `clean_at_source` population, i.e. **roughly 2,100-3,600
plans**. Total measured disagreement across BOTH directions is 469 + 1,307
= **1,776 edges** — smaller than the low end of that range even before
accounting for the fact that multiple disagreement edges can land on the
same plan (so the number of distinct AFFECTED PLANS is ≤ 1,776, likely
somewhat lower — this script counts edges, not deduplicated plans; that
plan-level count was not measured this session and would need a follow-up
pass keyed by plan id if it matters to a future decision). **Conclusion:
discriminator disagreement is real, quantified, and larger than the
previously-known 13-plan number by roughly two orders of magnitude on the
over-recognition side — but it is not large enough on its own to be the
full explanation for a shortfall in the thousands. The 5x miss remains
UNEXPLAINED.** Compounding AND-semantics across multiple required rooms
per plan (already argued qualitatively in the lever #1 report's §2) remains
a plausible contributor to the remaining gap, but has not been quantified
either — flagged as the natural next question, not measured here.

## 2. Per-room-type survival table, with PASS/FAIL at the proposed 15%-relative threshold

Per Dan's instruction: the threshold is not applied until this exact table
is approved. Overall unconditional survival: 48.5% (8,249/17,000). At a
proposed 15%-relative bound, the PASS/FAIL range is **[41.2%, 55.8%]**.

| Room type | Survival | Relative deviation | PASS/FAIL at 15% | Broken-plan count (from co-occurrence report) |
|---|---|---|---|---|
| bedroom | 49.2% | +1.4% | PASS | 1,320 |
| balcony | 49.0% | +1.0% | PASS | — (open-plan, not in required-room co-occurrence scope) |
| kitchen | 48.6% | +0.2% | PASS | — (open-plan) |
| living | 48.2% | −0.6% | PASS | — (open-plan) |
| **bathroom** | **47.0%** | **−3.1%** | **PASS** | **4,618 (70.0% of all broken plans)** |
| **storage** | **21.1%** | **−56.5%** | **FAIL** | 246 |
| **stair** | **0.8%** | **−98.4%** | **FAIL** | 40 |

**Bathroom is included per instruction, and the table answers the ranking
question directly: bathroom PASSES on survival-deviation grounds (−3.1%,
comfortably inside any reasonable band) despite being 70% of all currently
broken plans by raw count.** Under the retargeted bar, survival deviation —
not raw broken-plan count — is the ranking metric, and by that metric
bathroom is not a failing class; its large raw count is a volume effect
(40,413 source instances, the second-largest room type) not a survival-rate
problem. Only `storage` and `stair` fail at 15% relative, by wide margins
(56.5% and 98.4%). **This table is the decision — the 15% number is only
how it's computed. If Dan wants to rank candidates by total plans
recoverable rather than by survival deviation, bathroom's raw count (4,618,
by far the largest) is the relevant number instead; both framings are laid
out here for that choice, not resolved by this report.**

## 3. Wall-count/plan — corrected, source-derived, full population

Dan's objection: the original 4.94%-relative FAIL used `stats["n_walls"]` —
converter output — as the wall-count value, which is potentially circular if
skeletonization complexity correlates with room-assembly success
independent of true source complexity. Recomputed via
`extraction/synth/qa/measure_wallcount_source_derived.py`: wall-count/plan
now measured as `len(get_geometries(plan["wall"]))` — ResPlan's own raw wall
`MultiPolygon`'s disjoint-part count, confirmed directly (5-plan spot check
this session: 4-11 parts per plan) to already be multi-part at the SOURCE
level, zero skeletonization involved. `convert_plan` is still used to
determine clean-subset MEMBERSHIP (unavoidable, and not what the objection
was about — every axis needs it to define "the clean subset" at all).

| | Full population | Clean subset | Gap (relative) | Status |
|---|---|---|---|---|
| **Source-derived** (`len(get_geometries(wall))`) | 9.037 | 9.091 | **−0.59%** | **PASS** |
| Converter-derived (`n_walls`, original axis) | 33.264 | 31.623 | +4.94% | FAIL |

**The fix changes the conclusion.** The source-derived metric PASSES, with
the gap direction even flipping sign (clean subset has marginally MORE wall
parts, not fewer). **The original 4.94% FAIL was a converter-output
artifact, not a genuine source-complexity bias** — most plausibly because
broken plans' skeletonization produces a different segment count
distribution than the room-assembly outcome would suggest on its own (an
artifact of the pipeline correlating with itself), exactly the circularity
Dan flagged. `docs/extraction-plan.md`'s gate description and `reports/
p3a-gate-v2-retarget.md`'s scalar-axis table are corrected to use this
source-derived figure: **wall-count/plan now PASSES, 3/3 scalar axes clear
the 2% bar.**

## Bottom line

1. Co-occurrence: falsified, Dan's own hypothesis, recorded as such.
2. Discriminator disagreement: measured both directions, full population —
   real (1,776 edges total, over-recognition 2.8x under-recognition,
   opposite of the pre-registered prediction) but **not large enough to
   fully explain the 5x miss**. The miss stays labeled UNEXPLAINED.
3. Survival table: delivered with bathroom included: bathroom PASSES on
   survival-deviation grounds despite being 70% of broken-plan volume;
   only storage and stair fail at the proposed 15% threshold, which is
   still awaiting sign-off.
4. Wall-count: fixed and re-reported — source-derived axis PASSES; the
   prior FAIL is retracted as a converter-artifact, not a real finding.

No lever built. No threshold applied without sign-off.
