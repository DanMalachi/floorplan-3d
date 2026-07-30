# Phase 3a session handoff — updated 2026-07-30

Branch: `phase-3a-renderer` (worktree `fp-phase3a`, terminal B per
`docs/extraction-plan.md`'s two-terminal table). The 2026-07-19 session
built the ResPlan→schema-v1 converter (`extraction/synth/resplan_convert.py`)
up through room assembly and found the offset-convention fix (below). The
2026-07-20 session fixed the face-polygon construction bug that fix's own
diagnostic (`diagnose_cycle_unrepairable.py`) surfaced, then fixed a QA
script bug in `diagnose_clean_rate.py` that had been hiding a second,
same-sized failure mode (`broken_room_cycle` on required rooms) behind
"uncategorized". The renderer (deliverable 2) has still not been started.
Auditing of the notch-suppression/`classify()` diagnostic layer completed
2026-07-22 through 2026-07-26, and **lever #1 (doorway-notch handling,
Option C) is BUILT** (2026-07-29 session) — see "2026-07-29 session (1st)"
below and `reports/p3a-lever1-build-and-remeasurement.md`. A same-day
follow-on session (**2026-07-29, 2nd**) **retargeted the P0-style clean-rate
bar** (old 90% bar retired, see `reports/p3a-gate-v2-retarget.md` and
`docs/extraction-plan.md`'s P3a "Done when" line) and ran the co-occurrence +
stair diagnosis Dan asked for before any lever #2 sizing
(`reports/p3a-defect-cooccurrence-and-stair-diagnosis.md`). **A third
same-day session corrected two of the 2nd session's own conclusions** — see
"2026-07-29 session (3rd)" below and `reports/p3a-discriminator-
disagreement-and-corrections.md`: the co-occurrence hypothesis is
FALSIFIED (Dan's own hypothesis, tested and rejected), the replacement
"discriminator disagreement explains it" claim was itself unmeasured and
wrongly asserted, and the **5x conditional-rate miss is UNEXPLAINED** even
after properly measuring discriminator disagreement in both directions.
**Read the 3rd-session report before trusting anything the 2nd session's
report says about WHY lever #1 under-performed** — the stair diagnosis and
gate-retarget numbers from the 2nd session are unaffected and still stand
(stair's bottleneck is still upstream of the converter; the gate's volume
floor and per-type survival numbers are unchanged), only the wall-count
scalar axis (corrected: now PASSES) and the miss-explanation narrative
needed fixing. **A 4th same-day session (`reports/p3a-storage-mechanism-
and-calibration.md`) ran the two checks Dan approved doing next, before any
lever #2 proposal**: storage does NOT share stair's mechanism (two separate
levers — storage is 81.5%/38.8% genuine irrecoverable GT defects, an 8.4%
ceiling; stair stays 79.2%/72.9% exterior/void-adjacency, recoverable in
principle), and the sizing method itself was calibrated against its own
traced track record (factor 0.468) — **stair's real target is 33.9% of all
757 instances, not the raw 72.4% taxonomy ceiling.** The RATIFIED 15%
survival threshold and the corrected source-derived wall-count are now
PERMANENT in `measure_gate_v2_distribution.py` (not just proposed in a
report) — see "Current state" below before assuming either could
silently revert. The standing discipline rule below is still why every
session's numbers in this file are trustworthy — including these, which
exist because Dan caught things worth catching and then told the next
session exactly what to check before proposing anything.

## 2026-07-30 session — bathroom mechanism check, task C still not resolvable cleanly (no lever built)

Full detail: `reports/p3a-bathroom-mechanism-check.md`. Picks up exactly
where the 4th 2026-07-29 session left off: task C (propose lever #2,
calibrated) needs stair and bathroom sized the SAME way before Dan can
compare them, and bathroom never got the classify()-taxonomy treatment
stair/storage did.

**Ran it** (`extraction/synth/qa/diagnose_bathroom_failure.py`, new, mirrors
`diagnose_stair_failure.py`/`diagnose_storage_failure.py` exactly, same
taxonomy unchanged). **Result: it doesn't apply.** Only 529/40,413 (1.3%)
bathroom instances even carry the `room_boundary_no_wall_match` flag this
taxonomy classifies — an order of magnitude smaller than bathroom's real
4,618-plan broken population, because this taxonomy operates on
`check_plan`'s SOURCE-level raw-ink check, and bathroom's actual dominant
mechanism (unlike stair's, which is genuinely source-level, 92.1%
`clean_at_source`-broken) is the CONVERTER-level raw-ink-vs-skeleton-band
discriminator disagreement inside `assemble_rooms`, already measured by the
3rd session's `measure_discriminator_disagreement.py`. **The taxonomy that
correctly sized stair structurally cannot size bathroom** — not a dead end,
but the reason no bathroom-comparable-to-stair's-33.9% number exists yet.

**Side-by-side assembled from what IS known** (both denominators stated
together, per standing Rule 2): stair has a fully calibrated ceiling
(33.9% of 757 instances) but a tiny addressable population — only
**23/6,603 (0.3%)** broken plans have stair as their ONLY defect, so even
a rosy 100%-recovery lever moves at most 23 plans (~0.14pp population-wide,
~8 plans/~0.05pp at the calibrated rate). Bathroom's addressable population
is two orders of magnitude larger — **3,923/6,603 (59.4% of all broken
plans)** have bathroom as their ONLY defect — but its real lever
(discriminator reconciliation) has only an edge-level signal so far (469
under-recognition edges, population-wide, the direction that would help
recovery), and that report already states this is insufficient to fully
explain the mechanism's reach (compounding AND-semantics across required
rooms per plan remains the unquantified candidate for the rest).

**Next session, Dan's decision needed, not made this session**: task C is
not yet a clean apples-to-apples comparison. Either (a) run one more
diagnose pass sizing bathroom's own ONLY-defect population against the
under-recognition edge set specifically (same discipline as lever #1's own
"only-defect population, not contains-this-defect" lesson) to get a
bathroom number comparable to stair's 33.9%, or (b) pick between the two
candidates as-is, explicitly trading a well-calibrated-but-tiny lever
(stair) against a huge-but-not-yet-ceiling-measured one (bathroom). No
lever built either way until Dan picks.

## 2026-07-29 session (4th) — storage mechanism check + lever #1 sizing-method calibration (no lever built, no lever #2 proposed yet)

Full detail: `reports/p3a-storage-mechanism-and-calibration.md`. Delivers
exactly the two things Dan approved (task A, task B) — task C (propose
lever #2) explicitly NOT done yet, awaiting this report's review.

1. **Task A — does storage share stair's mechanism? NO.**
   `extraction/synth/qa/diagnose_storage_failure.py` (new, mirrors
   `diagnose_stair_failure.py` exactly, same `classify()` taxonomy reused
   unchanged, filtered to storage instead of stair, full population).
   Storage's dominant mechanism is `a_genuine_gt_defect_between_rooms`
   (81.5% of broken / 38.8% of all 1,797 storage instances) — a real,
   irrecoverable source-data defect (storage closets embedded in solid
   wall mass with no cut door), population-confirming the 2026-07-21
   3-instance spot-check. Stair's own dominant mechanism
   (`c_exterior_boundary_or_void`, 72.9%) is essentially absent from
   storage (0.6%). **Two separate levers, confirmed cheaply before scoping
   either.** Storage's recoverability ceiling is only 8.4% of all
   instances (vs. stair's 72.4%) — its low 21.1% survival rate is mostly a
   genuine data-quality problem, not a converter gap.
2. **Task B — calibrate the sizing method, pure bookkeeping, no new
   hypothesis.** `extraction/synth/qa/calibrate_lever1_prediction.py` (new):
   identifies the population that "entered `clean_at_source` via the
   notch-suppression fix" (precise, reproducible: `notch_suppressions`
   non-empty AND `flags` empty) — the exact population lever #1's own
   diagnose-step prediction was about — and traces each one's ACTUAL
   post-build `convert_plan` outcome, full population. Result: **1,184
   plans predicted to fully clear; only 554 (46.8%) actually did.
   Calibration factor: 0.468.** Note: this session's precise population
   count (27/300 on the exact `plans[:300]` sample) does not match the
   handoff's old prose "roughly 66 plans" figure — that figure's exact
   derivation isn't reproducible from any committed script; stated plainly,
   not silently reconciled, since chasing it wasn't what task B asked for.
   **Applied to stair's 72.4% recoverability ceiling: calibrated estimate
   = 33.9% of all 757 stair instances — this is the number any lever #2
   proposal should size against, not the raw 72.4%.** Still-broken
   breakdown (restricted to real blocking causes, not the informational
   `cycle_repaired`/open-plan flags the raw histogram also contains):
   bathroom (373 combined `cycle_unrepairable`+`broken_room_cycle`) and
   bedroom (310) dominate by a wide margin over storage (28) and stair (6)
   — a second, independent confirmation that bathroom/bedroom under-
   recognition remains the largest still-open mechanism, not stair or
   storage (expected: this traced population is by construction
   notch-affected, and stair/storage were already established as ~0%
   notch-driven).

**Next session**: task C — propose lever #2 with a calibrated estimate
(33.9% for stair; storage's own ceiling, 8.4%, is far lower and its
mechanism largely unfixable by software), sized as the ONLY-defect
population per lever #1's own lesson (not "contains this defect"), and
STOP for Dan's approval before building anything. Both stair (worse
survival deviation, tiny absolute population, needs a `check_plan` source-
level fix) and bathroom (passes survival deviation, by far the largest raw
broken-plan count at 4,618/6,603, needs the raw-ink/skeleton-band
discriminator reconciliation) remain candidates Dan has not locked between.

## 2026-07-29 session (3rd) — co-occurrence hypothesis falsified, both-directions discriminator disagreement measured, wall-count corrected (no lever built)

Full detail: `reports/p3a-discriminator-disagreement-and-corrections.md`.
Direct response to Dan rejecting the 2nd session's conclusions. Four
pieces, all read-only measurement, no lever built:

1. **Co-occurrence hypothesis FALSIFIED, recorded as Dan's own** (it was
   his hypothesis before this session, tested directly): 18.6% multi-defect
   rate cannot produce the ~2,100-3,600-plan shortfall the 5x miss
   represents. The 2nd session's own report is corrected in place (not
   silently rewritten — the false claim is left visible, marked superseded)
   rather than quietly editing away that it originally asserted
   "discriminator disagreement remains the better-supported explanation"
   without ever measuring it — Dan correctly rejected that as numerically
   unsupported (13/17,000 plans, one direction only, cannot explain
   thousands either).
2. **Both-directions, per-edge discriminator disagreement measured, full
   population** (`extraction/synth/qa/measure_discriminator_disagreement.py`,
   reimplements both check_plan's raw-ink and assemble_rooms's skeleton-band
   per-edge coverage read-only, no changes to either core file). Pre-
   registered prediction (under-recognition >> over-recognition, low
   thousands) was **WRONG in both direction and magnitude**: over-
   recognition (1,307 edges) is 2.8x LARGER than under-recognition (469
   edges) — the direction previously only visible as 13 plan-level
   containment violations turns out to be ~100x that at edge level, because
   an over-recognized edge only flips a WHOLE PLAN wrongly-clean when every
   other edge/room in it is also clean (true for only ~1% of over-
   recognized edges). **Total disagreement (1,776 edges) is still smaller
   than the shortfall it's a candidate explanation for. The 5x miss is
   UNEXPLAINED** — stated plainly, not stretched to fit. Compounding
   AND-semantics across required rooms per plan (lever #1 report's own
   qualitative argument) remains unquantified and is the natural next
   question, not measured this session.
3. **Per-room-type survival table delivered with bathroom included, PASS/
   FAIL at the proposed 15%-relative threshold** (still awaiting sign-off,
   not applied): bathroom PASSES on survival-deviation grounds (47.0%,
   −3.1% relative) despite being 70% of the currently-broken population by
   raw count (4,618/6,603 plans) — survival deviation and raw broken-count
   rank candidates differently, and Dan picks from the table, not from a
   pre-selected ranking. Only `storage` (−56.5%) and `stair` (−98.4%) fail.
4. **Wall-count/plan scalar axis CORRECTED**
   (`extraction/synth/qa/measure_wallcount_source_derived.py`): the 2nd
   session's +4.94% FAIL used the converter's own `n_walls` output, flagged
   by Dan as potentially circular. Recomputed from raw ResPlan source
   geometry (confirmed already multi-part at the source level, 4-11 parts/
   plan spot-checked) — **PASSES at −0.59% relative, sign flipped**. The
   original FAIL is retracted as a converter-output artifact (skeletonization
   behaves differently on plans that also fail room assembly, independent of
   true source complexity), not a real finding. **All 3 scalar axes now
   PASS** — only the per-room-type survival threshold remains unresolved on
   the distribution-match half of the gate.

**Next session**: still no lever built (three sessions running on the same
day, all diagnosis/measurement per instruction). Two genuinely open
questions, not one: (a) if not co-occurrence and not (solely) discriminator
disagreement, what DOES explain the remaining shortfall? Compounding
AND-semantics across required rooms per plan is the leading unquantified
candidate — sizing it would mean measuring, per broken plan, how many
required rooms are BOTH notch-affected AND currently under-recognized,
compounded across the plan, not just per-edge; (b) Dan's lever #2 pick is
still open between stair (worst survival deviation, but tiny absolute
count, source-level fix needed) and bathroom (passes survival deviation,
but by far the largest raw broken-plan count, converter-level discriminator
reconciliation needed) — both tables are now in front of him, neither is
locked in.

## 2026-07-29 session (2nd) — gate v2 retarget, defect co-occurrence, stair diagnosis (no lever built)

Full detail: `reports/p3a-gate-v2-retarget.md` and `reports/p3a-defect-
cooccurrence-and-stair-diagnosis.md`. Four pieces of work, per Dan's explicit
instruction not to build lever #2 this session:

1. **P3a's gate bar RETARGETED** (Dan's ruling). The old "≥90% clean
   conversion of the 17K" bar is retired — volume was never binding (8,249/
   17,000 converter_clean, population re-measured this session, clears the
   ~6,700-plan floor a 20K-image set needs) and a single pooled rate hid the
   defect that matters (60x spread across room types, 49.2% bedroom down to
   0.8% stair). New bar, both parts measured population-scale: (a) volume
   floor — PASSES; (b) distribution match — scalar axes (doors/rooms/wall-
   count per plan) within 2% relative (doors 0.5%/rooms 1.7% PASS,
   wall-count/plan 4.9% FAILS, a new finding — **later corrected to PASS,
   see the 3rd/4th session notes above and below, the FAIL was a
   converter-derived artifact**); per-room-type survival rate, no class
   more than a threshold from the overall 48.5% survival rate. A
   **15%-relative threshold is proposed** (5x margin above the tightest real
   cluster's 3% deviation, nowhere near storage's 57%/stair's 98% failure
   margins) — **RATIFIED 2026-07-29 (3rd session) — both this threshold
   AND the wall-count fix are now PERMANENT in
   `measure_gate_v2_distribution.py` itself (constants + corrected
   source-derived computation, not just described in a report), so neither
   can silently revert.** `docs/extraction-plan.md`'s P3a "Done when" line
   updated in place, old bar struck through and marked SUPERSEDED with the
   reason, not deleted.
2. **Defect co-occurrence measured, full population** (`extraction/synth/
   qa/measure_defect_cooccurrence.py`), scoped to `clean_at_source ∧
   ¬converter_clean` (6,603/17,000 plans, the same population the
   conditional clean rate's numerator gap describes). 81.4% of broken plans
   have exactly one defect class, 18.6% have ≥2. This does **not** turn out
   to be the dominant explanation for lever #1's own 5x miss (that remains
   the raw-ink-vs-skeleton-band discriminator disagreement, already named
   in the lever #1 report) — reported as such, not bent to fit — but it's
   now a real, quantified number every future lever's sizing must account
   for. `bathroom` dominates the current broken population (4,618/6,603
   plans, 85.0% isolated) — the population the discriminator-reconciliation
   fix would target. Stair sized correctly per instruction: **23/6,603
   (0.3%) plans have stair as their ONLY defect** — not the 40/6,603 (0.6%)
   "contains a stair defect" number, and nowhere near the 757-instance
   population the 0.8% survival headline implies.
3. **Stair failure diagnosed at population scale, starting from plans 1448
   and 9796 as instructed** (`extraction/synth/qa/diagnose_stair_failure.py`,
   reuses `classify_room_boundary_no_wall_match.py`'s taxonomy completely
   unchanged, filtered to stair). **Headline: 92.1% of all 757 stair
   instances (697) are already broken at the SOURCE level**
   (`clean_at_source`), before `assemble_rooms` ever runs — the stair
   bottleneck is almost entirely upstream of the converter, the opposite
   shape from lever #1's notch mechanism. Dominant mechanism, population-
   confirmed: `c_exterior_boundary_or_void` (72.9% of ALL stair instances) —
   the room edge's outward probe lands outside the traced building envelope,
   plausibly a real stairwell/vertical-circulation pattern, not a wall-
   tracing omission (inference, not confirmed by the taxonomy itself). Both
   named exemplars (1448 → `c_exterior_boundary_or_void`, 9796 →
   `b_shared_wall_wide_recoverable`) reproduce exactly at population scale.
   Recoverability ceiling (non-genuine-defect edges only): 72.4% of all 757
   — **stated as an upper bound to pre-register against, not a promise**,
   same caution as lever #1's own over-predicted 70-80% band. **A future
   stairs lever needs to be a `check_plan`/source-level fix, not an
   `assemble_rooms` fix** — sizing it against the converter-broken
   population (23-40 plans, previous bullet) would target the wrong ~8% of
   the problem.
4. **13/17,000 containment-invariant violation made non-fatal.** The two
   `assert not conv_clean or src_clean` sites (`classify_room_boundary_no_
   wall_match.py::compute_conditional_clean_rate`, `held_out_conditional_
   clean_rate.py::_measure`) now log + count instead of crashing. Per Dan's
   explicit ruling: **not unified with `assemble_rooms`'s discriminator** —
   two implementations over two different inputs (raw wall ink vs. skeleton
   bands) was a deliberate design choice, and 0.076% doesn't justify
   collapsing it. `population_conditional_clean_rate.py` already handled
   this correctly (unchanged). Full suite re-run after the edit: 53/53
   passing.

**Next session**: no lever built (per instruction). Two live threads,
priority order unchanged from the 1st 2026-07-29 session's own framing
except stair is now correctly re-scoped: (a) reconcile the raw-ink-vs-
skeleton-band discriminator disagreement (still the highest-leverage single
fix — it's both the dominant cause of lever #1's under-recovery AND the
13-plan containment break, AND `bathroom` — the mechanism it would fix — is
70% of the current broken population per this session's co-occurrence
measurement); (b) design a `check_plan`-level stair discriminator for the
`c_exterior_boundary_or_void` pattern (72.4% ceiling, unbuilt, no design
proposed yet) — **diagnose-before-build discipline still applies**: the
ceiling is an upper bound, not a promise, per this exact phase's own recent
history of over-predicting from a taxonomy-recoverable number without
checking whether the actual discriminator recognizes it in practice. Also
open, not urgent: the 68-plan `hard_failure` class surfaced by this
session's co-occurrence scan (`convert_plan` raising on clean_at_source
plans) — small, 100% isolated, not diagnosed this session.

## 2026-07-29 session (1st) — lever #1 BUILT, re-measured, one new finding open

Full detail: `reports/p3a-lever1-build-and-remeasurement.md`. Summary:

- **Built** in two commits (`9b59ba4` pure `notch.py` module move, `8d1f227`
  the actual `assemble_rooms` stage-1 exemption + area-gate normalization).
  53/53 tests green, including a new committed converter-path defect-flip
  test (`test_gate_flip_check_audited.py`) — zero of 62 human-audited
  genuine-defect edges wrongly flip to converter-assembled.
- **Conditional clean rate**: 52.5% → 58.4% (n=300) / **55.6%**
  (population, 17,000 plans) — short of the pre-registered 70-80% band,
  and specifically the predicted GAIN was over-predicted by roughly **5x**
  (predicted gain ~17.5-27.5 points; actual population gain only 3.1
  points, 5.9 at n=300 — the low end of the predicted range alone is
  ~5.6x the population gain). Held-out check (305 tuning-influenced plans
  excluded) confirms the discriminator generalizes fine to unseen plans
  (58.0%, not materially below the full-sample 58.4%) — the shortfall is
  NOT an overfit-to-tuning-plans problem.
  - **Cause of the over-prediction, checked this session, not just
    hypothesized**: the diagnose step's own pre-registered branch expected
    the shortfall (if any) to come from `notch_plus_other` rooms (a second,
    independent defect alongside the notch). Sampled 1500 plans directly:
    that population is **tiny** (1 of 81 notch-affected rooms, ~1.2%) — NOT
    the bottleneck. The real cause is the SAME mechanism as the 13-plan
    containment-invariant bug below, just showing up far more often in the
    opposite direction: of 80 sampled "pure-notch" rooms (no second
    defect, should be lever-1-recoverable per the diagnose step's own
    98.3%/87.2% bathroom/bedroom estimates), only **64 (80%) actually
    recovered** — 13 (16%) still hit `broken_room_cycle` because
    `assemble_rooms`'s skeleton-band discriminator never excused the edge
    even though the raw-ink discriminator (`check_plan`, what the
    diagnose step benchmarked against) would have; 3 (4%) got excused but
    then failed the area gate. An ~80% per-room recovery rate, compounded
    across multiple required rooms per plan (AND semantics — one
    surviving `broken_room_cycle` room fails the whole plan) plus
    pre-existing non-notch failure modes (stair/storage, next bullet),
    arithmetically lands well below the per-room recovery rate. **The
    skeleton-band discriminator under-recognizing notches relative to the
    raw-ink one it was modeled on is the dominant, now-confirmed cause** —
    fixing that (see containment-invariant bullet) is likely the single
    highest-leverage next move, more so than sizing `notch_plus_other`
    further.
- **The metric that actually mattered** (Dan's reframe: bias, not volume):
  doors-per-plan gap between the converter-clean subset and the full 17K
  **narrowed as predicted**, +1.4% relative (before) → +0.5% (after).
- **`stair` is next priority, flagged explicitly**: only **6 of 757**
  stair instances (0.8%) survive into the converter-clean subset,
  population-wide, and this session's build moved that number by exactly
  zero (6/757 both before and after lever #1) — expected, since
  stair/storage breakage was already diagnosed pre-session as NOT
  notch-driven, but it is now, by a wide margin, the single worst-recovered
  required room type and has had no dedicated diagnostic session of its
  own yet (unlike the notch mechanism, which had three). Candidate for
  next session's diagnose-before-build pass.
- **New finding, not pre-registered**: population-scale run surfaced 13
  plans (0.076%) where the previously-verified containment invariant
  (`converter_clean ⇒ clean_at_source`) no longer holds — `check_plan`'s
  raw-wall-ink notch discriminator and `assemble_rooms`'s new
  skeleton-band notch discriminator can disagree on the same edge (in
  BOTH directions — this is the same root cause as the 5x
  over-prediction above, just the rarer direction where skeleton-band
  over-recognizes instead of under-recognizes). Not fixed this session
  (scope: gate report only). **Read report §6 before trusting a future
  `compute_conditional_clean_rate(300)` run that happens not to hit one
  of the 13 ids** — it would assert-crash if it did.
- **Next session**: no lever #2 started (per instruction, stopped at the
  gate report). In priority order: (a) reconcile the two notch
  discriminators' input geometry (raw wall ink vs. skeleton bands) — this
  is now confirmed to be both the dominant cause of the 5x
  under-recovery AND the cause of the 13-plan containment-invariant
  break, so one fix likely addresses both; (b) `stair`'s 0.8% recovery
  rate has no diagnosis yet at all — needs its own diagnose-before-build
  pass, same discipline as the notch work got. `notch_plus_other` is
  confirmed small (~1%) and is NOT worth further sizing work.

## Standing discipline, adopted 2026-07-26 — read this before trusting any new QA number

**Pattern across this phase's diagnostic history**: three defects have now
been found in this phase's *measurement/QA code*
(`_edge_covered`'s unclamped overlap sum; `classify()`'s original
single-condition `opening_coverage>=0.8` notch cliff with no shape check;
this session's own search-radius-reused-for-an-area-overlap-question bug in
`size_diagonal_wall_mismatch.py`) — and **zero** in the converter itself
(`rooms.py`/`skeleton.py` have been stable since the 2026-07-20 corner-mitre
fix). The error mass lives in the QA layer, which is exactly the layer the
90% P0-gate decision is gated on.

**Rule 1**: any NEWLY-DERIVED QA/diagnostic number is **provisional** until
either (a) a second, independently-derived signal corroborates it, or
(b) a spot-check confirms it visually against source data. This is not a
suggestion to be more careful in the abstract — it is the specific
discipline that caught this session's own area-overlap calibration bug
(a visually-confirmed case scored 0.1-0.35 under the first version, 0.65-
0.71 under the corrected one) before it was reported as a population
number. Apply it to every future population-scale diagnostic in this
phase, not just the ones that happen to feel uncertain.

**Rule 2, added same day — Rule 1 doesn't cover this failure mode, a
different one kept recurring**: Rule 1 catches defects in measurement
*code*. It does not catch a *correct* number quoted without its
denominator, or a subpopulation share silently treated as a population
share — and that specific mistake happened **four times** in this phase
without any code being wrong: the 96.4% revised-ceiling estimate
(projected from n=27, later needing correction), the 63.1%→46.1%
sample-to-population gap in the doorway-notch sizing, the 81%/5.5%
diagonal-wall-mismatch pair this session, and a stale "~90% of the bucket"
claim this session's own draft briefly asserted before being caught and
corrected. **Rule: every percentage carries its denominator in the same
sentence. No sample-derived share is ever stated as a population share
without an actual population measurement backing it — and where both a
sample rate and a population rate exist for the same thing, state both
together, every time either is cited, not just at first mention.** Cheap,
mechanical, and it would have caught all four instances above without
needing any code to be fixed.

## 2026-07-26 session (2nd) — lever #1's diagnose step is DONE, build next

Ran exactly the two bounded diagnose numbers the section below specifies,
nothing more: `extraction/synth/qa/diagnose_notch_area_fraction.py`, full
17K population, report at `reports/p3a-notch-area-fraction-sizing.md`
(read that for the full method/result — this is the pointer + the
decision).

**Numbers**: notch-affected rooms are rare relative to all required-room
instances (bathroom 1.29%, bedroom 0.96%; storage/stair 0% — a DIFFERENT,
not-notch-driven broken-edge cause, not sized this session, filed for
later) but the notch's own area, among affected rooms, is small (median
0.06-0.14%, p90 well under 1%, max 3.93%). Bracketed against the 5% gate
minus this phase's own already-measured baseline face-polygon error
(median 2.09% / p90 4.79%): 0.2%/0% of notch-affected bathroom/bedroom
rooms would fail even under the pessimistic (p90-baseline) bracket at the
low end, 22.3%/27.8% at the high end. Recoverability (no OTHER broken
edge on the same room): 98.3% bathroom, 87.2% bedroom.

**Decision: build option C (normalize the notch out of the SOURCE room
polygon before the area comparison), not option B (skip the edge, eat the
error).** Not because B measured badly — it would work for ~72-78% of
notch-affected rooms even in the pessimistic bracket — but because C is
essentially free now: the notch-pocket polygon the diagnose script
already builds for the area sum **is** the polygon C would union into the
source, and C has no residual-budget ambiguity at all (works regardless
of notch size), where B leaves the 22-28% pessimistic-case rooms as a
real, unresolved gate risk. See the report's "Reading this correctly" for
the full reasoning.

**One self-caught bug worth carrying forward, same standing discipline as
below**: the first version of the diagnose script grouped notch edges by
matched-opening-polygon identity alone and produced two impossible
outliers (fraction >99% of room area — a notch that consumes the whole
room). Root cause: two real, physically unrelated notches on OPPOSITE
sides of one room (plan 64, `bedroom_1`) both best-matched the same door
polygon; grouping by shared key alone merged them into one giant span.
Fixed by additionally clustering by ring proximity (a same-key group only
merges if its members are within a few ring edges of each other) before
closing each cluster's span — caught via the max-fraction column looking
wrong (>100% is a hard impossibility, not a judgment call), consistent
with the existing project's discipline that any newly-derived population
number is provisional until it looks right on inspection, not just
internally consistent.

**Next session: build it.** The discriminator, opening-grouping, and
signed-area pocket logic are already validated (2 synthetic fixtures + 3
visual spot-checks, `extraction/synth/qa/diagnose_notch_area_fraction.py`
+ its test file) — the build session's job is porting this into
`rooms.py`'s actual `assemble_rooms`/face-polygon path (union the pocket
into the source room polygon before the area-match comparison, don't
re-derive the pocket-finding logic) and re-measuring the
clean-at-source-CONDITIONED rate afterward (pre-registered prediction:
52.5% → roughly 70-80%; materially below that means the
`notch_plus_other` rooms — 12.8% of bedroom's notch-affected population —
are masking a second cause, which would itself be a valuable finding, not
a disappointing one).

## 2026-07-26 session — audit complete, gate PASS, two follow-on sizings, lever #1 is next

Four pieces of work, four commits (`ee6adfd`, `b9087af`, `75ab226`,
`d24e6e4`):

1. **Re-measured the conditional converter-clean rate** with notch
   suppression live (`reports/p3a-conditional-rate-recheck.md`): **52.5%**
   (135/257, n=300), matching a pre-registered 46-52% prediction. The
   apparent drop from 61.0% is the denominator (`clean_at_source`)
   becoming honest, not converter regression — confirmed `rooms.py`/
   `skeleton.py` zero-diff since the corner-mitre fix. **Promoted a free
   invariant to an assertion**: `converter_clean` is now a provable subset
   of `clean_at_source` (135/135) — `compute_conditional_clean_rate`
   (`classify_room_boundary_no_wall_match.py`) now asserts this on every
   run; if it ever fires, the two `clean` definitions have drifted apart.
2. **Audited the 57 previously-unaudited notch-risk-band edges**
   (`reports/p3a-audit-57-unaudited.md`) — priority 1 from the
   2026-07-22 session's spec. Result: 0/57 wrongly excluded from the
   notch category; `gate_flip_check_audited.py` now **PASSes** (was
   INCOMPLETE) against the full 65-edge audited ground truth. Named a new
   mechanism, `not_notch_diagonal_wall_mismatch` (smooth diagonal
   room-boundary edge over a staircase-quantized or otherwise-unmatched
   wall — real ink present, a coverage-matching TECHNIQUE gap, not a
   missing partition) — dominant in this specific 57-edge sample (~81%)
   **but read item 4 before citing that rate anywhere**. Priority 2
   (spot-check of `classify()`'s `b`/`c`/`d`/`f` branches) is **DROPPED**,
   not deferred, per Dan's ruling — `classify()` is validated and the real
   bar (52.5%→90%) is converter work.
3. **Sized duplicate/near-duplicate plans across the full 17K**
   (`reports/p3a-duplicate-plan-scan.md`) — filed as its own issue since
   P3a's deliverable is a training set and paper §6.2 requires
   plan-source-level split separation. Found 139 exact-duplicate clusters
   (282 plans, 1.66%) and 12 stricter near-duplicate pairs (24 plans),
   confirmed genuine (not a signature collision) via direct shapely
   `.equals()` on the largest cluster. **Priority correction, same day**:
   1.66% is not itself alarming — the RULE survives at full priority
   regardless (assign future splits by geometry hash, never `plan_id`),
   the alarm doesn't. The near-dup pair count is a lower bound, not a
   measurement — re-examine the threshold when splits are actually cut,
   not before.
4. **Sized the diagonal-wall-mismatch mechanism at population scale**
   (`reports/p3a-diagonal-mismatch-sizing.md`), because this phase was
   already burned once projecting a small sample onto a headline number
   (the 96.4% ceiling estimate). Result: **~5.5% of the full 1853-edge
   `a_genuine_gt_defect_between_rooms` bucket** (102 edges, 55 plans) —
   NOT the ~81% the 57-edge sample showed. **Both numbers are correct**;
   they describe different denominators (the 57-edge sample was drawn
   from the `opening_coverage>=0.65` risk band specifically, where this
   mechanism concentrates; the full bucket has no such filter and is 83%
   axis-aligned edges the mechanism can't apply to). Always state both
   denominators together if citing either rate. This sizing pass also
   self-caught and fixed a calibration bug before reporting (see standing
   discipline above).

**Next session: build unparked lever #1 — converter-side doorway-notch
handling in `rooms.py`.** First converter change since the corner-mitre
fix. The diagnosis is already done (17 rooms / 26 edges, the 3-condition
conjunction, the `[0.3,0.5)` empty-band threshold justification, opening-
type coverage checked, front_door divergence and the 12017 zigzag both
named — see the doorway-notch discriminator section below) — reuse it,
don't re-derive it. Order within the session, **diagnose before building**:

**The diagnose step is BOUNDED — read this before starting it, not after
it's already sprawled.** Weeks of this phase went into making measurement
honest, and it worked — the numbers are trustworthy now and the rules that
keep them that way are written above. **The risk has flipped**:
`rooms.py`/`skeleton.py` haven't changed since the corner-mitre fix, and
the temptation next session will be to keep measuring instead of building.
The diagnose step for lever #1 is exactly two things: **(1) notch area as
a fraction of room area, reported by room type, and (2) the resulting
normalize-vs-eat-the-error decision.** That's the whole diagnose step. Once
those numbers are in, build. **If the diagnosis starts branching into new
mechanisms or new taxonomies, that's scope creep wearing the discipline's
clothes — note the branch in this file for later, don't follow it now.**
The bar is 52.5% against 90%, and only converter code moves it.

1. **Settle the face-polygon reconstruction question first, before writing
   any fix code — THREE options, not two, and the obvious one is likely
   unavailable.** `check_plan` only decides "is this plan source-clean" —
   excusing a notch edge there is free. `rooms.py` must actually ASSEMBLE
   a closed wall cycle: excusing an edge isn't enough, the cycle still has
   to close across the notch, and the resulting mitered face polygon still
   has to area-match the source room polygon within the 5% gate (which Dan
   has standing instructions not to loosen). The source room polygon
   INCLUDES the notch; a face reconstructed from a straight wall run does
   not.
   - **Option A, "reconstruct the notch into the face polygon," is
     probably NOT actually available**: the `wall_cycle` representation is
     built from wall segments, and a doorway notch by definition is NOT
     backed by any wall — there is nothing in the wall data to
     reconstruct the notch shape FROM. Check this is really a dead end
     before spending build time on it, but expect it to be.
   - **Option B, "excuse the edge and eat the area error,"** is what's
     been assumed so far — on a small required room (bathroom/storage,
     where notches cluster), that error is plausibly at or over the 5%
     gate on its own, which would make the "fix" reject rooms it was
     supposed to recover.
   - **Option C, likely the right one: NORMALIZE THE SOURCE ROOM POLYGON**
     — fill the doorway notch out of the SOURCE room polygon before the
     area comparison, so both sides of the 5% check are compared on the
     same convention (a face polygon that also doesn't include the
     notch). **This is not loosening the gate — it's correcting the
     comparison**, precisely the move already made once in this phase
     with `EMPIRICAL_FACE_OFFSET_MULTIPLIER` ("correct the comparison,
     don't widen the guard"). The 5% gate stays exactly as-is; Dan's
     standing instruction is preserved because nothing about the
     tolerance changes, only what's being compared.
   - **Measure notch areas as a fraction of their own room areas BEFORE
     building anything** — this settles which option is viable (confirms
     A is dead, sizes how bad B would be, sizes what C needs to
     normalize). **Report the fractions BY ROOM TYPE, not pooled** —
     notch geometry clusters on small required rooms (bathroom/storage),
     exactly where the fraction-of-room-area is largest, so a pooled
     median will look reassuring and hide the cases that actually decide
     the design. Don't discover the area-gate interaction when it starts
     rejecting rooms you just "fixed."
2. **Pre-registered prediction, write it down before building, check it
   after**: roughly 66 plans (of the 300-sample denominator) entered
   `clean_at_source` via the source-side suppression fix. If the
   converter-side fix recovers most of them, the conditional rate should
   move from 52.5% to roughly **70-80%**. Materially below that means a
   SECOND independent failure cause on those plans — which would be the
   more valuable finding, not a disappointing one.
3. **Carry forward the known guardrail limit, restate it in the build's
   test docstring, don't let it get silently dropped**: a straight-run
   defect-with-incidental-opening-proximity case cannot be constructed in
   isolation (`fill_openings_into_wall` couples the two quantities by
   construction — only a corner-shaped anomaly decouples them, since the
   crossbar heals via the parallel fill and the jambs don't). The
   `rooms.py` version of this fix inherits the same limitation.

**Consolidation — at the END of the lever #1 session, not now.** Findings
are currently spread across this file (getting long), `p3a-notch-
diagnosis.md`, `p3a-notch-resolution.md`, `p3a-conditional-rate-recheck.md`,
and `p3a-audit-57-unaudited.md`. Once lever #1 moves the conditional rate,
that's the natural point to fold the live numbers (87.2% `clean_at_source`,
the conditional rate, the containment invariant, the audited defect count,
the duplicate-split rule) into a single Phase 3a gate report, demoting the
diagnostic reports to appendix references. Don't do it before the number
moves — it would only need rewriting.

## Current state — done and tested

- **Environment**: `.venv` (Python 3.11), `extraction/requirements.txt`
  pinned-unpinned (shapely, networkx, opencv-python-headless, scikit-image,
  numpy, pydantic, Pillow, python-bidi, geopandas, matplotlib, pytest).
- **Data**: ResPlan (17,000 plans, MIT) fetched via `data/resplan/fetch.py`
  from `github.com/m-agour/ResPlan`; vendored `resplan_utils.py` with MIT
  attribution under `extraction/synth/vendor/`.
- **`schema_v1_local.py`** — temp pydantic models + `validate_plan_v1()`,
  mirrors paper.md Appendix A **plus one deliberate addition**: `wall.role`
  includes `"rail"` (not in Appendix A's enum), confirmed with Dan
  2026-07-19 to match `docs/DATA_RIGHTS.md`'s established balcony-boundary
  tracing convention. 11 tests passing. Banner comment marks the whole file
  temporary — reconcile against `extraction/schema/` after the Phase 0 gate.
- **`skeleton.py`** — ResPlan's unified wall polygon → centerline
  `WallSegment`s + `SkeletonJunction`s (rasterize → skeletonize → pixel
  graph → prune spurs → cluster junctions → simplify → map to plan space).
  Verified against synthetic L/T/X fixtures and real-plan overlay QA (zero
  exceptions across 300 real plans). `fill_openings_into_wall()` restores
  wall continuity through door/window cutouts — ResPlan cuts openings out
  of the wall polygon entirely (verified: zero overlap), so this must run
  before skeletonizing or opening-projection fails almost completely.
  Thickness is measured directly against source vector geometry
  (`_measure_thickness_vector`: perpendicular chord sampling,
  junction-excluded, median of samples), falling back to a
  distance-transform raster estimate only for segments too short to have
  an interior sampling zone.
- **`openings.py`** — door/window/front_door polygon → host-wall
  projection (`center_offset`, `width`, sibling-overlap resolution).
  Unattached-opening rate ~0.03% after the gap-fill fix (was ~85% broken
  before it).
- **`rooms.py`** — room polygon → `wall_cycle` assembly in two stages:
  (1) per-edge spatial coverage picks candidate walls (one straight
  boundary edge can span multiple short wall segments) — if no candidate
  survives, or the survivors don't cover enough of the edge, the room is
  flagged `broken_room_cycle` and dropped **before stage 2 ever runs**;
  (2) the sequence is verified/repaired for actual topological
  connectivity (bounded BFS bridge, max depth 3) since per-edge coverage
  alone doesn't guarantee consecutive picks share an endpoint — failing
  this is flagged `cycle_unrepairable`. A repaired cycle is only accepted
  if its **mitered face polygon** area-matches the source room polygon
  within `area_match_tolerance` (held at **5%**, per Dan's instruction not
  to loosen the gate — confirmed correct this session, see below).
  **Face-polygon construction (2026-07-20 fix):** each wall is still offset
  inward by its own half-thickness × `EMPIRICAL_FACE_OFFSET_MULTIPLIER`,
  but corners are no longer built by unconditionally intersecting
  consecutive offset lines as infinite lines (undefined for
  collinear/parallel neighbors — e.g. a straight run split into two wall
  ids of different thickness — and silently wrong, self-intersecting the
  ring, at reflex/concave corners like any L-shaped room). `_corner_vertices`
  now tries the true miter intersection and only accepts it within
  `_MITER_LIMIT` (8.0) half-thicknesses of the real centerline junction,
  otherwise falls back to a bevel (two vertices) — the standard CAD/stroke
  fallback. A residual hairline self-intersection from a short chamfer
  wall between much-thicker neighbors is healed via `buffer(0)`, only when
  healing stays a single Polygon. Verified against all 7 originally-
  classified degenerate cases: 5 now resolve directly, 2 remain a
  *different* bug (wall_cycle revisits the same wall id — issue #3,
  filed, not fixed). Wall `role` heuristic: `external` (on/near `inner`
  boundary) / `rail` (only adjacent room type is `balcony`) / `internal`.
- **`resplan_convert.py`** — wires it all together; CLI with
  `--limit`/`--workers` (ProcessPoolExecutor); writes per-plan schema-v1
  JSON + `converter_stats.json`. "Clean" definition: no exception,
  validator-clean, zero broken `CLEAN_REQUIRED_ROOM_TYPES` (bedroom/
  bathroom/storage/stair — open-plan `living`/`kitchen`/`balcony` excluded
  per Dan's 2026-07-19 scope decision, matching the already-deferred
  open-plan-zones limitation) — "broken" here means either
  `broken_room_cycle` or `cycle_unrepairable`, both count against the
  bar — opening-attach ≥95%, ink-coverage ratio in [0.85, 1.15]. 30 tests
  passing in `extraction/synth/` (59 across the whole repo).
- **`extraction/synth/qa/diagnose_clean_rate.py`** — its `categorize()`
  function only checked `room:cycle_unrepairable:` flags, silently missing
  `room:broken_room_cycle:` even though both count against the real clean
  bar above. Fixed 2026-07-20 (see "Corrected failure categories" below);
  the bucket is renamed `room_assembly_failed_required`/
  `_open_plan_only` since it now covers both failure points.

Not started: `render.py` / `render/` engine (deliverable 2), contact
sheet, full 17K batch run, gate report.

## The offset-convention finding and fix

Room `wall_cycle`s were assembling and passing connectivity, but failing
the area-match gate at a high rate. Root-caused through several rounds
(see git history on this branch for the full trail — thickness estimation
was checked and confirmed accurate before the real cause was found):
ResPlan's room polygons sit **closer to the wall centerline than a full
half-thickness offset predicts**. Calibrated directly: 107,608 per-wall
perpendicular measurements (wall centerline → source room polygon
boundary) across 800 plans, wall_depth 2.76–6.59. Two models fit and
compared by residual spread:

- Model A (fixed constant, ignores thickness): median 1.72, stdev 0.87, residual σ = 0.429
- **Model B (multiplier k on half-thickness): median k = 0.838, stdev 0.94, residual σ = 0.417** ← applied

Neither model is a tight fit (both carry substantial per-wall noise —
looks like real variability in how ResPlan was authored, not a single
clean named convention). No round/nameable value was identified for `k`.
**This is a measured empirical correction, not a discovered exact
convention** — flagged clearly at its definition site
(`rooms.py::EMPIRICAL_FACE_OFFSET_MULTIPLIER`, with full provenance
comment). `area_match_tolerance` was kept at 5% per instruction (correct
the comparison, don't widen the guard).

### Result: area-error histogram (per-room-cycle, 150-plan sample)

| | Before calibration (k=1.0) | After calibration, pre corner-fix | After corner-fix (2026-07-20) |
|---|---|---|---|
| n room-cycles | 650 | 650 | **763** |
| Median error | 4.50% | 2.43% | **2.09%** |
| p90 | 8.36% | 4.86% | **4.79%** |
| % within 5% | 51.2% | 91.5% | **91.9%** |
| % within 10% | 97.7% | 99.8% | **99.1%** |
| % degenerate (implied_area≤0) | — | ~32% of the *failure* bucket | **0.3% of all room-cycles** |

(`extraction/synth/qa/measure_area_error.py`, added 2026-07-20, reproduces
this on demand.) The remaining 0.3% degenerate is entirely issue #3
(repeated wall id), not an offset/construction problem.

### Result: plan-level clean rate (n=300)

**45.0% clean (135/300)** — up from 36.7% pre corner-fix, still well short
of the ≥90% target.

**Corrected failure categories** (`categorize()`'s bug fixed 2026-07-20 —
see below; a plan can count in more than one):

| Category | % of plans | (old, buggy label/count) |
|---|---|---|
| `room_assembly_failed_required` | **52.0%** (156/300) | was split across `cycle_unrepairable_required` (44.3%/93 — undercounted) + most of `uncategorized` (13.0%/46) + part of `other_validator_problem` |
| `opening_sibling_overlap` | 6.0% (18/300) | unchanged |
| `room_assembly_failed_open_plan_only` | 2.7% (8/300) | was folded into `other_validator_problem`/`cycle_unrepairable_open_plan_only` |
| `other_validator_problem` | 0.3% (1/300) | was 8.0%/24 — 23 were masked room-assembly failures |
| `opening_projection_failed` | 0.3% (1/300) | unchanged |
| `uncategorized` | **0%** | was 15.3%/46 — fully explained, not a distinct failure mode |

## Key open finding — read this first next session

Two rounds of investigation this session (2026-07-20), each correcting the
previous one's diagnosis:

**Round 1 — `cycle_unrepairable_required` was never a connectivity
problem.** The 2026-07-19 handoff assumed the BFS bridge depth-3 cap was
the blocker. A 15-plan diagnostic (`diagnose_cycle_unrepairable.py`) found
0/22 failing required-room instances were actually `_repair_connectivity`
returning `None` — all 22 were area-match failures, split 68% near-miss
(5–9% error) / 32% degenerate (`implied_area=0.0`, a real construction
bug in the pairwise infinite-line mitre). **Fixed**: `_corner_vertices`
mitre/bevel solver (see `rooms.py` bullet above). Population-wide result:
degenerate rate 32%→0.3%, plan clean rate 36.7%→45.0%. **The residual
near-miss noise (median 2.09%, p90 4.79%) is the offset multiplier's own
previously-measured irreducible variability — the area gate was correctly
left at 5% (per Dan's standing instruction), and this bucket has no
obvious further lever.**

**Round 2 — `uncategorized` (13.0%→15.3% after round 1's reclassification
shuffling) was a QA-script bug, not a new pipeline failure mode.**
`diagnose_clean_rate.py`'s `categorize()` checked only
`room:cycle_unrepairable:` flags, never `room:broken_room_cycle:` — even
though `resplan_convert.py`'s real clean-bar computation counts both. A
15-plan sample of the uncategorized bucket was 15/15 (100%) explained by
this single gap. **Fixed** (see `diagnose_clean_rate.py` bullet above) and
reconciled exactly against n=300 (69 plans expected to reclassify by a
naive count; 8 landed in the open-plan-only variant instead of required,
and 2 previously-hidden open-plan-only plans turned out to also have a
required-room `broken_room_cycle` flag — net 69−8+2=63, matching the
measured 93→156 jump exactly).

**Net effect: `broken_room_cycle` on a required room is now known to be a
THIRD, same-sized, still-unexplored failure mode** — 21.0% of all plans
exclusively (63/300), vs. 20.7% exclusively for the (already-understood)
`cycle_unrepairable` near-miss noise, with 10.3% hitting both. **Filed as
issue #4** with three hypotheses (no candidate wall band found / coverage
ratio below the 0.5 threshold / angle-filter rejecting a real match) —
not started, next session's target.

### Issue #4 progress (2026-07-21 diagnostic session)

`extraction/synth/qa/diagnose_broken_room_cycle.py` (committed) instruments
`rooms.py::assemble_rooms`'s stage-1 per-edge coverage loop. Sampled the
15-plan "exclusively" population (`room_assembly_failed_required`, zero
`cycle_unrepairable:` flags anywhere in the plan). 20 required-room
instances, 47 broken edges. A first pass over-attributed 80% of instances
to the angle filter (`angle_filter_rejected_real_match`), but most
rejected candidates had `cos_angle` near 0.0 — near-perpendicular walls
butting into a corner, exactly the case the filter's own comment says the
0.9 cutoff exists to reject. Rescoping to only count moderate-tilt
rejections (`cos_angle` in [0.5, 0.9) — plausible diagonal/chamfered
walls) as genuine near-misses collapsed that category to 20%/10.6% (edges)
and surfaced a **fourth, dominant category the three named hypotheses
didn't cover**:

| Category | Instances | Edges |
|---|---|---|
| **no_angle_valid_candidate** (new) | 55.0% (11/20) | 57.4% (27/47) |
| coverage_below_threshold (hyp. 2) | 20.0% (4/20) | 27.7% (13/47) |
| angle_filter_rejected_real_match (hyp. 3) | 20.0% (4/20) | 10.6% (5/47) |
| no_candidate_band (hyp. 1) | 5.0% (1/20) | 4.3% (2/47) |

`no_angle_valid_candidate`: a broad-phase STRtree candidate exists near
the edge, but every one is near-perpendicular and none survives even
hypothetically — no genuinely-angled wall is ever near the edge. Read
from absence in the STRtree query, so treated as a lead, not a
conclusion, pending direct confirmation.

**Positive confirmation** (`extraction/synth/qa/verify_no_angle_valid_candidate.py`,
committed): checked 3 of the 11 `no_angle_valid_candidate` instances
directly against raw GT wall ink (pre-skeleton) and the extracted
skeleton, using a wall-thickness-scaled proximity (not edge-length-scaled
— an early version scaled by edge length and "found" unrelated parallel
walls 11-22 units away in an axis-aligned building, misclassifying all
three) and an ink **coverage ratio** projected onto the edge's own
parametric range (not a boolean "is there any qualifying ink nearby" —
that conflated a genuine full-length wall match with a short unrelated
ledge that happened to be parallel and close: a 3.49-unit ledge "matched"
a 17.47-unit edge at first pass). Result: the lead splits into three
distinct, confirmed mechanisms, none of which is a uniform "skeleton
pruned a spur":

- **plan 3807, bathroom_0, edge 0** (`extraction/synth/reports/no_angle_candidate_3807_bathroom0_e0.png`,
  gitignored, regenerate via the script) — **missing_from_skeleton**. GT
  wall ink exactly matches the edge (identical endpoints, `ink_coverage_ratio`
  well over 1.0 from overlapping ink features), but the skeleton runs one
  continuous straight vertical wall through that point with no trace of
  the small lateral jog the raw polygon actually has. Looks like
  skeleton *simplification* smoothing away a small real offset, not spur
  pruning — revises the original hypothesis in `diagnose_broken_room_cycle.py`'s
  docstring.
- **plan 634, storage_0, edge 2** (`extraction/synth/reports/no_angle_candidate_634_storage0_e2.png`)
  — **partial_ink_partial_gap** (new sub-category). `ink_coverage_ratio`
  0.033: only a sliver near one end of a 17.47-unit edge is backed by
  real wall ink (a short ledge); the other ~17 units run through genuinely
  open space. The room polygon's edge is not "a wall extraction missed" —
  most of it isn't a wall at all.
  Not yet clear whether this is a valid record of a wall-less room
  boundary or a fixture/other feature; needs the domain check noted below
  before deciding.
- **plan 881, bathroom_0, edge 0** (`extraction/synth/reports/no_angle_candidate_881_bathroom0_e0.png`)
  — **no_ink_at_all**. The room polygon has a small (4.8-unit) notch with
  zero qualifying wall ink anywhere within a generous, thickness-scaled
  proximity — a room-polygon tracing artifact, not a skeleton or
  room-assembly bug at all.

**Open — this is the actual next-session target, read before touching a
fix**: n=3 bought heterogeneity, not proportions. It disproves "the whole
bucket is a skeleton bug" (only 3807 is) but doesn't tell you the mix,
and the mix is the entire decision: if the missing_from_skeleton
mechanism dominates the 11, a skeleton-simplification fix is worth
building; if partial_ink_partial_gap / no_ink_at_all dominate, this is
mostly a labeling-spec/GT-convention question and a skeleton fix would
barely move the clean rate. **Next session: classify all 11
no_angle_valid_candidate instances (from the 15-plan sample; extend the
scan if fewer than 11 turn up) through `verify_no_angle_valid_candidate.py`
and report the real proportions.** Do not assume the three-way taxonomy
above is complete — `partial_ink_partial_gap` only emerged mid-pass on
n=3, so a 4th or 5th mechanism showing up in the full 11 should be named,
not forced into these three. Diagnostic only, still no fix, until the
proportions are in.

Also open: **issue #3** — 2 known cases (ResPlan plans 2642/`bathroom_1`,
3973/`bathroom_0`) where the assembled `wall_cycle` revisits the same
wall id (a per-edge-coverage bug, not a face-polygon construction one).
Small (0.3% of all room-cycles), not urgent, but tracked.

### Population-scale results (2026-07-21 diagnostic session, part 2)

Two measurements, both READ-ONLY, no fix attempted, run in this order
because the first changes whether the second even matters:

**1. Clean-at-source ceiling — `extraction/synth/qa/measure_clean_at_source.py`,
full 17,000-plan population, not a sample.** Runs three checks directly
against the raw source polygons before any conversion step touches them
(no skeletonization, no wall_cycle assembly, no offset calibration, no
mitre solving — the one deliberate exception is `fill_openings_into_wall`,
a lossless deterministic union documented in the script, without which
the "ceiling" came out BELOW the real converter's measured clean rate,
which is incoherent for a true ceiling): wall polygon validity, required-room
polygon validity, and whether each required room's boundary edges are
actually backed by real wall ink (same coverage-ratio technique as the
no_angle_valid_candidate verification below, applied to the raw wall
polygon instead of the skeleton).

**Result: 67.5% clean_at_source (11,472/17,000).** `wall_invalid` 0.0%,
`room_geometry_invalid` 0.0% — ResPlan's raw polygons are topologically
sound at the shapely-validity level, essentially without exception.
**`room_boundary_no_wall_match` 32.5%** — a third of all plans have at
least one required-room edge that doesn't correspond to any real wall ink
at all, even before any of our pipeline's lossy steps run.

**This is the ceiling on the whole phase, and it's below the 90% bar.**
90% clean conversion is arithmetically impossible against this GT as-is —
the most any converter could ever achieve is ~67.5%, no matter how good
`rooms.py`/`skeleton.py` get. Two implications, not yet acted on (Dan's
call, not made here): (a) conversion progress should be re-measured
against the clean-at-source subset specifically, not the full 17K, to see
how close the converter actually is to ITS reachable ceiling; (b) the 90%
bar itself likely needs revising at the P0 gate, with this number as the
evidence, rather than continuing to chase converter fixes toward a target
the data can't reach.

**2. Full-11 classification of `no_angle_valid_candidate` — reusing
`diagnose_broken_room_cycle.py`'s sampler and
`verify_no_angle_valid_candidate.py`'s confirmation logic unchanged** (new
script: `extraction/synth/qa/classify_no_angle_valid_candidate_population.py`).
The prior session's n=3 spot-check proved the bucket is at least three
unrelated mechanisms but said nothing about their mix. Classified all 11
of the 15-plan sample's `no_angle_valid_candidate`-primary rooms (26
edges; a 12th room, plan 1448 `stair_0`, has one such edge too but a
higher-priority category wins its room-level label, so it's reported as a
footnote, not counted in the 11) into attribution buckets:

| Attribution | Room-level (of 11) | Edge-level (of 26) |
|---|---|---|
| **converter_bug** (`missing_from_skeleton` / `present_outside_band` / `present_within_band_UNEXPECTED`) | **81.8% (9/11)** | 80.8% (21/26) |
| gt_error (`no_ink_at_all`) | 9.1% (1/11) | 15.4% (4/26) |
| convention_mismatch (`partial_ink_partial_gap`) | 9.1% (1/11) | 3.8% (1/26) |

`missing_from_skeleton` alone is 57.7% of edges (15/26) — the dominant
single mechanism, and a second independently-verified overlay (plan
13342 `bathroom_1`, beyond the original 3-instance spot-check) shows the
identical pattern already seen on plan 3807: a real small lateral jog
present in the raw wall ink, with the skeleton drawing one straight wall
through the point and no trace of the offset. **Per the decision rule
from last session's framing: converter_bug dominates, so a
skeleton-simplification fix for issue #4 is justified — not yet built.**
The `convention_mismatch` bucket (`partial_ink_partial_gap`) is still
genuinely ambiguous and small (1/11); doesn't change the decision either
way.

**Both numbers matter together, not separately**: issue #4 is worth
fixing (population 2 says so), but fixing it converts converter_bug-typed
failures toward clean — it can NEVER close the `room_boundary_no_wall_match`
gap that sets the 67.5% ceiling (population 1), because that gap is
measured against raw wall ink with no skeleton involved at all. A
skeleton-simplification fix moves the converter closer to 67.5%, not
closer to 90%.

### room_boundary_no_wall_match decomposition (2026-07-21 diagnostic
session, part 3) — READ-ONLY, no fix applied, per Dan's explicit request
before trusting the 67.5% ceiling enough to revise the bar on it

Motivation: the 67.5% ceiling has already been shown to over-count once
(omitting `fill_openings_into_wall` cost 33 points, 34.5%→67.5%). Before
taking 67.5% to the P0 gate, Dan asked for the 32.5% `room_boundary_no_wall_match`
bucket itself decomposed — sampled 27 plans hit by the flag (deterministic
scan, first 1500 plans, `extraction/synth/qa/classify_room_boundary_no_wall_match.py`,
committed) and classified every flagged required-room edge.

**Finding 0 (the big one): a second measurement bug, this time in the
coverage-ratio arithmetic itself, not a missing fill step.**
`measure_clean_at_source.py`'s `_edge_covered` (and
`verify_no_angle_valid_candidate.py`'s copy) sums each candidate wall-ink
edge's projected overlap with the room edge's own `[0,1]` parametric range
via `min(t1,1.0) - max(t0,0.0)` — but never floors that at 0. When a
candidate's projected range falls entirely outside `[0,1]` (genuinely zero
overlap — common for short required-room edges, e.g. bathroom/storage
edges are frequently 2-5 units, sitting near OTHER unrelated wall ink in a
dense cluster of small rooms), this still contributes a large negative
number to the sum, which can swamp a real candidate's positive
contribution. Confirmed directly on plan 3733 (bedroom_1, edge 30): a
candidate with t-range `[-5.12,-3.12]` — no overlap with `[0,1]`
whatsoever — contributes -3.12 to the sum via the unclamped formula.
Visually confirmed on plan 704238 (bedroom_0, edge 16, overlay committed
at `extraction/synth/reports/no_wall_match_measurement_bug_704238_bedroom0_e16.png`):
the edge sits in the middle of solid, unambiguous wall ink on both sides —
obviously fully covered — yet the buggy formula scored it -6.35 (nonsense;
flagged as broken) while a properly-clamped recomputation scores it 1.0
(fully covered, correctly not broken). **Population impact on the 27-plan
sample: 40.4% of flagged EDGES (44/109) and 29.6% of flagged PLANS (8/27)
were false positives explained ENTIRELY by this bug** — real coverage was
fine, the plan should never have been flagged. This bug lives in a QA
script, not the converter (`rooms.py`/`skeleton.py` use a different,
correctly-clamped face-offset/mitre code path) — but `measure_clean_at_source.py`
IS the script that produced the 67.5% ceiling number, so this directly
inflates it. **Not fixed this session** (read-only instruction) —
`_edge_covered_clamped` in the new qa script is a local, diagnosis-only
reimplementation used only to get a trustworthy classification signal.

**Taxonomy of the remaining 65 genuinely-still-broken edges** (i.e. after
correcting finding 0), against the task's (a)-(f) categories, each
confirmed with a source-level overlay (`extraction/synth/reports/no_wall_match_*.png`,
gitignored, regenerate via `generate_overlays()` in the same script):

| Category | Edges (of 65) | Rooms (of 25) | Mechanism, confirmed |
|---|---|---|---|
| (e) opening/doorway | 63.1% (41) | 48.0% (12) | **Dominant.** The room polygon itself steps into a small rectangular notch tracing the door's own footprint (confirmed on plans 9206/7607/3807/10171 — notch edge coordinates land exactly on the door polygon's bounding box). Not a missing wall-ink or missing-union problem — the notch edges are near-perpendicular to the real wall line by construction, so no proximity-band widening or extra fill step can ever match them; fixing this needs the room-edge check itself to skip edges captured by a door polygon (fix work, correctly out of scope here). |
| (d) tracing artifact | 15.4% (10) | 12.0% (3) | Small (≤1.5× wall_depth) interior notch/jog with zero qualifying ink anywhere nearby even at a widened band, no door involved, no traced neighbor found — same mechanism as the already-documented plan-881 `no_ink_at_all` case (re-confirmed with a fresh overlay this session). |
| (c) exterior/boundary/void | 12.3% (8) | 20.0% (5) | Outward probe from the edge lands genuinely outside the `inner` building envelope — confirmed on plan 1448 (stair_0): the edge sits at the traced footprint's own edge with literal blank space beyond, no site feature, no room. |
| (a) genuine GT defect | 4.6% (3) | 12.0% (3) | Confirmed real: e.g. plan 3467 storage_0 edge 0 — a storage closet whose room polygon sits entirely embedded inside a solid, uncut mass of wall ink (overlay confirms no gap/doorway was ever cut into the wall layer for this room at all). More precisely a wall/room-layer overlap inconsistency than a literally "absent" wall, but equally unfixable by the converter — a genuine source-data defect. All 3 instances are on `storage` rooms specifically (edges bordering `living`, in all 3 cases) — worth watching as a pattern if more data turns up. |
| (b) shared/party wall | 4.6% (3) | 8.0% (2) | Outward probe lands inside another traced room, and widening the search band (half- to full-thickness scaled) recovers full coverage — real wall ink exists, just authored asymmetrically toward the neighbor's side beyond the narrow band's reach. Confirmed on plan 9796 (stair_0, edge 0). |
| (f) new category | 0% | 0% | None needed — the four confirmed mechanisms above (plus the doorway-notch reframing of what was expected to be a simple "(e) doorway" bucket) fully covered the sample. |

**Two requested numbers:**

1. **Revised true ceiling estimate: 67.5% + 32.5% × 0.889 ≈ 96.4%**
   (recovered fraction = 24/27 sampled plans had every genuinely-broken
   edge land in class b/c/d/e or the arithmetic-bug bucket; only 3/27 kept
   a real class-(a) defect). **This is a diagnostic-scale estimate from
   n=27, not a population-scale measurement** — unlike the 67.5% itself
   (measured on the full 17,000), this recovered-fraction needs to be
   re-measured at population scale (after fixing finding 0) before it's
   trustworthy enough to set a bar. Treat 96.4% as "the ceiling is
   probably much closer to arithmetically-100%-reachable than 67.5%
   suggested, once measurement artifacts are corrected" — not as a number
   to gate on directly.
2. **Converter clean rate, conditioned on clean_at_source (direct
   intersection, not the ~45/67.5≈67% approximation): n=300,
   clean_at_source=65.0% (195/300), converter_clean=45.0% (135/300, matches
   the existing figure), converter_clean AND clean_at_source=39.7%
   (119/300) → converter_clean | clean_at_source = 119/195 = 61.0%.**
   Slightly below the ~67% approximation — the converter is doing somewhat
   worse against its own reachable ceiling than the two-independent-
   percentages estimate suggested.

**What this changes about the 67.5% number itself**: it is very likely
inflated by finding 0 (the arithmetic bug) at a population scale similar
to what the 27-plan sample shows (~30-40% of the flagged bucket) — the
true clean-at-source ceiling, once `_edge_covered` is fixed and
`measure_clean_at_source.py` is re-run on the full 17K, is almost
certainly well above 67.5%, plausibly in the 85-95%+ range given how
thoroughly the sample's `room_boundary_no_wall_match` instances turned out
to be explainable. **Not re-measured at population scale this session**
(would require editing the QA script, out of scope for a read-only pass).

### Measurement-tooling fix + corrected population re-measurement (2026-07-21
diagnostic session, part 4) — Dan-authorized clamp fix, explicitly still no
converter changes

Per Dan's explicit authorization: this is a fix to a QA/measurement script
(`measure_clean_at_source.py`), not the converter (`rooms.py`/`skeleton.py`
untouched). Three steps, in order:

**1. Fixed the clamp bug.** `_edge_covered`'s overlap sum now floors each
candidate's contribution at its actual overlap with `[0,1]` before
summing (`max(t0,0.0)`/`min(t1,1.0)`, then only kept if `clipped_t1 >
clipped_t0`) — see the function's own updated docstring for the full
before/after trace on plan 704238. `verify_no_angle_valid_candidate.py`'s
own duplicated copy of this bug was **not** touched (out of the
authorized scope — flagged here so it isn't forgotten; it feeds issue #4's
diagnosis, not the clean-at-source ceiling, so it's lower urgency).

**2. Added `extraction/synth/tests/test_measure_clean_at_source.py`** (4
live + 1 xfail, all passing as intended; full suite now 39 tests, up from
34):
- `test_fully_clean_plan_scores_clean` — a fully-enclosed room, no
  openings, must score clean.
- `test_genuinely_missing_wall_must_flag` — a real gap in the wall ring
  (no door/window involved) must flag. **Fixture note**: had to widen the
  room to 30×10 (wall_depth=4) — at 10×10 the opposite wall's parallel
  inner face falls inside `ink_proximity` (12 units) and spuriously
  "covers" the missing edge from across the room. This is a pre-existing
  characteristic of the coverage check for small rooms relative to
  wall_depth, not something this session's fix touches — just something
  the test fixtures had to be sized around. Worth knowing if a future
  session's ceiling ever looks suspiciously high on plans with tiny
  required rooms and thick walls.
- `test_simple_doorway_cut_into_wall_does_not_flag` — a straight door cut
  into an otherwise-continuous wall (the already-working
  `fill_openings_into_wall` case) must not flag.
- `test_edge_covered_never_negative_for_candidate_entirely_outside_span` —
  direct regression test for the clamp bug itself.
- `test_doorway_notch_does_not_flag` (**xfail, strict**) — the real
  room-polygon-notch pattern. Confirmed to still flag post-clamp-fix, as
  expected: the clamp fix and notch-suppression are different bugs (the
  notch jamb edges are genuinely zero-coverage — perpendicular to the
  wall, not just victims of the negative-sum bug). This is the pinned
  tripwire for the deferred doorway-notch converter work below — it
  should flip from xfail to passing once that lands, and CI-equivalent
  discipline (`strict=True`) means it errors loudly if it starts passing
  by accident before that work is done, or stays failing after.

**3. Re-ran `measure_clean_at_source.py` on the full 17K.** Result:

| | Pre-fix (buggy) | Post-clamp-fix |
|---|---|---|
| clean_at_source | 67.5% (11,472/17,000) | **80.2% (13,638/17,000)** |
| room_boundary_no_wall_match | 32.5% | **19.8% (3,362/17,000)** |
| wall_invalid | 0.0% | 0.0% (unchanged) |
| room_geometry_invalid | 0.0% | 0.0% (unchanged) |

A **+12.7 point** recovery from the clamp fix alone — the bucket
explained-by-arithmetic-bug was 39.1% of the original 32.5% at population
scale (12.7/32.5), close to the 27-plan sample's bug-only estimate
(29.6%), same ballpark. **This is now a population-scale, trustworthy
number** (full 17K, not a diagnostic sample) — the 90% bar question can be
gated on 80.2%, not the earlier 96.4% diagnostic-scale estimate (which
optimistically assumed b/c/d/e were ALL already fixed — they aren't;
80.2% reflects only the clamp fix landing).

**Doorway-notch population sizing** (`extraction/synth/qa/size_doorway_notch_population.py`,
committed — reused `opening_coverage`'s projection technique verbatim
from `classify_room_boundary_no_wall_match.py`, no new classification
machinery; ran only against the 3,362 still-flagged plans, not a second
full-17K pass, so this stayed cheap: 164s):

| | Sample (n=27, 2026-07-21 part 3) | Population (n=3,362 flagged plans) |
|---|---|---|
| Edge-level notch-signature | 63.1% | 46.1% (4,951/10,732 broken edges) |
| Room-level all-notch | 48.0% | 39.0% (1,687/4,329 broken rooms) |
| Plan-level all-notch (would fully clear) | — | **34.4% (1,158/3,362)** |

If doorway-notch suppression alone landed (no other change): 80.2% +
19.8% × 0.344 ≈ **86.9%** — a rough population-scale projection of that
fix's payoff, for sizing/prioritization only, not a commitment (the
sample-vs-population gap above, 63.1%→46.1%, shows these sample-based
projections run a bit optimistic).

## Ratified P0-gate bar (Dan's ruling, 2026-07-21) — replaces the old
monolithic "90% of all plans" target

**The 90% bar STANDS, but relocated to the right denominator.** The
original framing conflated two different things — GT quality and
converter quality — under one number, which is what made it look
arithmetically unreachable (67.5%, later 80.2%, corrected-ceiling). Split:

- **Source-cleanliness (`clean_at_source`, `measure_clean_at_source.py`)
  is a DATA property, not a converter target.** Currently 80.2%
  (population, post-clamp-fix), heading toward an estimated ~87% once
  doorway-notch handling lands (population-scale projection, see above).
  **Keep measuring it — never gate on it.** It's the denominator for the
  real bar, not the bar itself.
- **Converter clean rate, CONDITIONED ON clean_at_source, is where the
  90% bar actually lives.** Currently 61.0% (n=300, direct intersection —
  see the 2026-07-21 part 3 section above). "90% of convertible plans
  convert cleanly" is the ratified quality gate. Doorway-notch handling
  and skeleton-simplification (issue #4) are the two scoped levers toward
  it — re-measure THIS conditioned rate after each, not the unconditioned
  `diagnose_clean_rate.py` population rate, since that denominator still
  includes plans that were never reachable in the first place.

## Converter work — UNPARKED, in priority order, each its own session
with its own STOP

These are the first converter changes in weeks (`rooms.py`/`skeleton.py`
have been diagnosis-only since the 2026-07-20 corner-mitre fix) — treat
each with that same discipline, not as a quick fix: **diagnose first,
reproduce the mechanism on 2-3 fresh overlays before touching any code,
keep the change narrowly scoped to the diagnosed mechanism, re-measure the
clean-at-source-CONDITIONED rate after** (not just clean_at_source, which
won't move — these are converter fixes, not source-measurement fixes).

1. **Doorway-notch handling first** — dominant recoverable class (34.4%
   of currently-flagged plans would fully clear at population scale).
   Converter-detection work: teach the relevant edge check to recognize a
   required-room edge captured by a door/window/front_door polygon's own
   footprint as an opening, not a required wall match.
   `test_doorway_notch_does_not_flag` in `test_measure_clean_at_source.py`
   is the built-in confirmation signal — it's pinned `xfail(strict=True)`
   and should flip to passing when this lands (remove the `xfail` marker
   at that point, don't leave it decorating a passing test).
2. **Skeleton-simplification fix for issue #4's `missing_from_skeleton`
   mechanism** second (81.8% of that bucket, confirmed on 5 overlays, not
   just inferred).
3. Lower priority, unscheduled: issue #3 (repeated wall id) — small (2
   known cases, 0.3% of room-cycles).

### Doorway-notch discriminator — validated, ready to build (2026-07-22,
two diagnostic sessions, still no converter code)

**Widened from the original 4 hand-picked exemplars to 17 room instances /
26 edges** in the same 27-plan sample (`extraction/synth/qa/diagnose_doorway_notch.py`,
committed) — every edge showed `cos_to_neighbor=0.0` (perfect
perpendicularity to its nearest wall-backed ring neighbor, no exceptions),
`len/wall_depth` in [0.64,1.18], `endpoint_to_opening_bbox_dist` mostly
0.0–0.6. One clean pattern, not sub-variants, confirmed on fresh overlays
(`notch_diag_*.png`, gitignored, regenerate via the script).

**Proposed discriminator (spec only, still not built)**: suppress a
required-room edge when ALL of (1) `opening_coverage >= 0.65`, (2)
perpendicular to nearest wall-backed ring neighbor (`cos_angle <= 0.15`),
(3) `edge_len <= 1.2 * wall_depth`. Conjunction, not `opening_coverage`
alone — perpendicularity by itself is non-discriminating (every corner in
an axis-aligned building is perpendicular).

**Threshold justification (this is the load-bearing evidence, not the FP
count below, which is nearly uninformative by construction — `classify()`'s
own `e_opening_doorway_notch` boundary already IS `opening_coverage>=0.8`,
so recall against it is tautologically flat at 98.9% across the whole
0.60–0.80 sweep)**:
- A 300-plan/929-edge population run (`extraction/synth/qa/measure_notch_discriminator_fp.py`,
  committed) found 18 edges at threshold 0.65 that `classify()` puts in a
  different category (16 `d_tracing_artifact_small_notch`, 2
  `c_exterior_boundary_or_void`/`b_shared_wall_wide_recoverable`). **Every
  one was visually confirmed via overlay to be the same doorway-notch
  mechanism**, just mislabeled by `classify()`'s own hardcoded 0.8 cutoff
  or by its check-order interaction with the exterior/neighbor-widen
  probes (one case, plan 2455, shows the "wide-band ink recovery" is
  itself the filled-in door polygon, not an independent wall). None are
  real defects.
- Among shape-matching (perpendicular + short) non-e edges there is a
  **clean empty band at opening_coverage [0.3, 0.5) — zero edges** —
  separating unrelated noise (93 edges at <0.1) from the confirmed-notch
  cluster (0.55–0.78+). **0.65 sits in that gap with margin on both
  sides** — that's why 0.65, not the FP table.
- Real-world payoff: plan 5664's bedroom_0 has one door producing 3 edges
  at coverage 0.833/0.714/0.667 — a strict 0.8 cutoff recovers only 1 of
  3, leaving the room PARTIALLY recovered (worse than not recovering at
  all, per Dan's read). 0.65 recovers all 3.

**Opening-type coverage gap, checked**: all 26 original edges were
door-triggered. Extended scan (`extraction/synth/qa/diagnose_notch_opening_types.py`,
committed, full 17K):
- **window**: confirmed, identical signature (plan 11942, bedroom_0,
  `opening_cov=0.948`, `cos_to_neighbor=0.0`, `len/wall_depth=1.17`).
  Generalizes cleanly.
- **front_door**: only 1 instance in the entire 17K population (plan
  5186, `stair_0` — front doors rarely border a
  CLEAN_REQUIRED_ROOM_TYPES edge at all). Its signature **diverges**: a
  diagonal chamfer edge (`cos_to_neighbor=0.874`, not perpendicular;
  `endpoint_to_opening_bbox_dist=2.583`, 5-25x the door/window range),
  not a rectangular jamb. The perpendicularity condition as specified
  would NOT suppress this instance — a safe miss (stays flagged), but a
  real counterexample to assuming the door/window signature generalizes
  to all three opening types. **Don't design the fix around n=1, but
  don't lose this either** — file it as a known safe-miss alongside the
  xfail test, not silently dropped.

**Two design constraints for the suppression build**:
1. **front_door divergence** (plan 5186, diagonal chamfer) — a known
   safe-miss, not a target to chase.
2. **12017 zigzag** — a single door can trace as a multi-step zigzag (4
   short edges, not the usual clean 2-jamb rectangle), all still
   door-adjacent and near-perpendicular individually. This is the
   adversarial case any per-door room-closure check in the fix must
   handle correctly (per-edge suppression already handles it in this
   diagnostic; a future per-door/run-based redesign must not regress it).

**Required test guardrail for the build's test suite** (beyond flipping
`test_doorway_notch_does_not_flag` off xfail): **a positive assertion
that a genuine-defect edge with incidental opening proximity is NOT
suppressed.** This is the actual risk the whole diagnostic exists to
bound — suppressing a real missing-wall edge would mark a broken plan
clean, inflating the exact clean-rate metric the 90% bar gates on. Test
that the rule refuses to suppress a defect, not only that it suppresses
notches.

**BUILT (2026-07-22, approved).** The 3-condition conjunction landed in
`check_plan` (`measure_clean_at_source.py` only — `rooms.py`/`skeleton.py`/
offset multiplier/corner solver untouched). Suppressions logged to a new,
separate `notch_suppressions` list (never merged into `flags`, so an
audited suppression structurally can't corrupt `clean_at_source`).
`test_doorway_notch_does_not_flag` flipped from `xfail` to passing.
Two new tests: a genuine-defect-with-incidental-opening-proximity
guardrail, and a multi-edge zigzag adversarial case reproducing plan
12017's real two-doors-one-wall pattern. Full repo suite 66/66.

**Important limit on the guardrail test, promoted from a test-comment
footnote — read this before trusting the guardrail's coverage**: while
building it, found that `fill_openings_into_wall` unions ANY nearby
door/window polygon back into the wall — so on a STRAIGHT wall run, an
opening close enough to give a missing edge high `opening_coverage` also
tends to heal that same edge's own wall-ink ratio back above
`COVERAGE_THRESHOLD` before the suppression logic is ever reached (both
quantities are projections of the same overlap, coupled by construction).
**A straight defect-with-incidental-opening-proximity case could not be
built in isolation** — only a corner-shaped anomaly decouples the two
(the crossbar heals via the parallel fill, the jambs don't, since they're
perpendicular — the same mechanism a real notch relies on). This means
the guardrail test proves the rule is safe on the FAVORABLE (separable)
geometry; it does NOT by itself prove safety on the coupled (straight-run)
case — that can only be settled empirically, at population scale.
**Required check for the next session's re-measurement, not just an
aggregate clean-rate delta**: does ANY plan previously classed
`a_genuine_gt_defect_between_rooms` (in `classify_room_boundary_no_wall_match.py`'s
taxonomy) flip to `clean_at_source` after suppression goes live? If zero
flip, the guardrail holds at scale. If any flip, that's a real defect the
rule wrongly suppressed and the conjunction needs revisiting before the
90% bar is gated on this number.

**Next session (re-measurement) starts here, its own STOP**: run
`measure_clean_at_source.py` on the full 17K with suppression live,
report (a) the new clean-at-source rate, (b) the converter-clean-subset
rate re-measured against it, AND (c) the defect-flip check above as an
explicit, separate number — not folded into the aggregate delta.

## Filed, not actioned (per Dan's instruction — record only, no fix this
session)

- **Issue #5 — small-room/thick-wall proximity-bleed, now confirmed as a
  recurring pattern across two independent trigger sites, tracked as its
  own issue (was a footnote below).** `measure_clean_at_source.py`'s
  coverage check scales its search band to `wall_depth`
  (`ink_proximity = (TOLERANCE + wall_depth/2) * PROXIMITY_MULTIPLIER`,
  ~12 units at `wall_depth=4`), so ANY wall-ink boundary — not just an
  opposite room wall — falling within that generous radius and roughly
  parallel to the edge being checked can spuriously "cover" it. Two
  independent confirmed triggers: (1) 2026-07-21, an opposite room wall's
  parallel inner face in a small room (`test_genuinely_missing_wall_must_flag`
  had to be widened from 10x10 to 30x10 to reproduce a real flag at all);
  (2) 2026-07-22, the OUTER building boundary itself, in the zigzag
  adversarial fixture (a notch jamb 12 units from the outer wall got
  spuriously "covered" by it; fixed by widening the fixture). Two
  unrelated geometries triggering the same mechanism makes this a pattern,
  not a one-off fixture quirk. **Risk direction that matters at
  population scale, per Dan's 2026-07-22 note**: this isn't just a test-
  fixture annoyance — the SAME mechanism can spuriously cover a genuinely
  broken edge in a REAL plan, masking a real defect and inflating
  `clean_at_source` from the OPPOSITE direction of the notch-suppression
  risk (notch suppression risks wrongly clearing a defect via the
  discriminator; this risks wrongly clearing one via the underlying
  coverage check itself, no discriminator involved at all). Not this
  session's fix — filed so it surfaces as a tracked issue before it shows
  up as a silently-wrong ceiling number on plans with small required rooms
  and thick walls, or on plans where a required room sits close to the
  building's outer envelope.

- **`verify_no_angle_valid_candidate.py` carries the same unclamped-
  overlap bug `measure_clean_at_source.py` had** (2026-07-21 part 4's
  clamp fix touched only `measure_clean_at_source.py`, as authorized).
  **No number this script emits should be trusted until it's fixed** —
  its `ink_coverage_ratio` can go negative the same way, which feeds
  issue #4's `missing_from_skeleton`/`present_outside_band` classification
  (used by `classify_no_angle_valid_candidate_population.py` too). Pick up
  alongside skeleton-simplification work above, since that's when its
  numbers would next be relied on.
- **Small-room/thick-wall proximity-bleed** — first surfaced here
  (2026-07-21, `test_genuinely_missing_wall_must_flag`'s 10×10→30×10
  widening). Promoted to **Issue #5** (see above, under the doorway-notch
  build section) after a second, independent trigger site (the outer
  building boundary, 2026-07-22) confirmed it's a recurring pattern, not
  a one-off fixture quirk — read that entry for the full mechanism and
  the population-scale masking risk.

## Still parked — until the converter clean-subset rate is near bar

17K batch conversion, `render.py` / render engine (deliverable 2), 20K
image set. No minting a training set off a converter that's still below
its own bar.

## Continue the established discipline

Each fix should be a real, specific, measured bug — not a
threshold/tuning change. Re-measure after each fix rather than assuming.

## For Phase 0

`extraction/synth/rooms.py`'s `EMPIRICAL_FACE_OFFSET_MULTIPLIER = 0.838`
is a stopgap measured against ResPlan specifically. **Phase 0's labeling
spec (`docs/labeling-spec.md`, §0.3 of `extraction-plan.md`) needs to
explicitly define the room-polygon-to-wall-centerline convention** —
otherwise this same offset resurfaces as phantom room-IoU error when
Phase 1's baselines are scored against corpus GT, and nobody will know why
without rediscovering this session's calibration trail.
