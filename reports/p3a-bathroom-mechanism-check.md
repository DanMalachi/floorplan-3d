# Phase 3a — Bathroom mechanism check, completing task C's prerequisite (2026-07-30)

Stair and storage both have a classify()-taxonomy recoverability ceiling
(72.4%/8.4% of all instances, `diagnose_stair_failure.py` /
`diagnose_storage_failure.py`, 2026-07-29). Bathroom never got the same
treatment, and task C ("propose lever #2, calibrated") cannot compare stair
against bathroom like-for-like without it. This session runs the missing
measurement, read-only, no lever built, no lever #2 decision made.

## Measurement: same classify() taxonomy, unchanged, filtered to bathroom

`extraction/synth/qa/diagnose_bathroom_failure.py` (new, mirrors
`diagnose_stair_failure.py`/`diagnose_storage_failure.py` exactly — same
`analyze_plan`/`classify` from `classify_room_boundary_no_wall_match.py`,
same two-stage scan, no new discriminator or threshold). Full 17,000-plan
population (30s scan + 10s classify).

**Result: only 529 of 40,413 bathroom instances (1.3%) even carry a
`room_boundary_no_wall_match` flag** — an order of magnitude smaller than
the 4,618-plan bathroom-broken population the co-occurrence report
measures. Dominant mechanism: `a_genuine_gt_defect_between_rooms` (39.5% of
broken / 0.5% of all), with `d_tracing_artifact_small_notch` close behind
(36.1%/0.5%). Recoverability ceiling on THIS population: 311/529 (58.8% of
broken, **0.8% of all 40,413 bathroom instances**).

## Why this number is not the one to size lever #2 against

This taxonomy operates on `check_plan`'s raw-ink discriminator — a
SOURCE-level check, run before any conversion step. It correctly captured
stair's and storage's dominant mechanisms because stair/storage breakage
IS predominantly source-level (92.1% of stair instances are already
`clean_at_source`-broken, confirmed 2026-07-29). **Bathroom's breakage is
not** — its dominant, already-measured mechanism is the CONVERTER-level
raw-ink-vs-skeleton-band discriminator disagreement inside `assemble_rooms`
(`measure_discriminator_disagreement.py`, 3rd session), a different code
path this taxonomy never touches. The 529/40,413 population this session
measured is real but represents a minor, mostly-genuine-defect side
mechanism, **not** the ~4,618-plan problem bathroom actually has. Applying
the 0.468 calibration factor to 0.8% would produce a number
(0.37% of all bathroom instances) that answers the wrong question —
not done here, flagged instead: **the classify() taxonomy structurally
cannot size bathroom's real lever**, the same way it wouldn't have sized
stair's if stair's problem had been converter-level instead of source-level.
This is itself the useful result of this session's measurement, not a
dead end.

## What bathroom's real lever already has, and what it's still missing

The 3rd session (`measure_discriminator_disagreement.py`) already measured
the mechanism that actually matters for bathroom, full population,
both directions:

- **Under-recognition (469 edges)** — `assemble_rooms`'s skeleton-band
  discriminator fails to excuse an edge `check_plan`'s raw-ink would have.
  This is the direction that HURTS recovery (produces `broken_room_cycle`
  wrongly) — the one a reconciliation fix would target.
- Over-recognition (1,307 edges) is the opposite-direction problem (13-plan
  containment break); reconciling it does not recover bathroom plans, it
  prevents wrongly-clean ones.
- The same report concludes total disagreement (1,776 edges, both
  directions) is **smaller than the shortfall it's a candidate explanation
  for** — the 5x miss remains UNEXPLAINED, and "compounding AND-semantics
  across required rooms per plan" was named as the leading unquantified
  candidate for the remainder, not measured yet.

**No population-scale "if reconciled, X% of bathroom's isolated-broken
plans would flip to converter_clean" ceiling exists for this mechanism.**
469 edges is an upper bound on directly-fixable EDGES, not plans (a plan
needs every blocking edge fixed, and the AND-semantics compounding is
unquantified) — it cannot yet be stated as a calibrated percentage the way
stair's 33.9% can.

## Side-by-side for task C, both denominators stated together

| | Stair | Bathroom |
|---|---|---|
| Own-mechanism ceiling (classify() taxonomy) | 72.4% of 757 instances, **calibrated 33.9%** | 0.8% of 40,413 — wrong mechanism for bathroom, not usable |
| Real lever's own measured signal | same taxonomy, source-level, applies cleanly | discriminator disagreement, converter-level: 469 under-recognition edges (population), no plan-level ceiling yet |
| ONLY-defect broken-plan population (2026-07-29 co-occurrence) | **23/6,603 (0.3%)** | **3,923/6,603 (85.0% of bathroom's 4,618, 59.4% of all 6,603 broken plans)** |
| Fix location | `check_plan` / source-level | `assemble_rooms` / converter-level (discriminator reconciliation) |
| What's fully known | Calibrated ceiling, tiny addressable population | Huge addressable population, ceiling not yet sizeable |

**Stair's addressable population is tiny regardless of fix quality**: even
at a rosy 100% recovery rate, at most 23 plans (0.14% of the full 17,000)
are reachable — the calibrated 33.9% ceiling further discounts this to
roughly 8 plans (~0.05pp population-wide). **Bathroom's addressable
population (3,923 plans, 23.1% of the full 17,000) dwarfs stair's by two
orders of magnitude** — even a modest, unglamorous recovery rate there
would move the population-wide clean rate far more than a perfect stair
fix could. But unlike stair, bathroom has no calibrated per-plan recovery
rate yet — only an edge count (469) that its own source report already
says is insufficient to fully explain the mechanism's reach.

## Bottom line, no decision made

Task C is not resolvable as a clean numeric comparison yet: stair is fully
sized but nearly irrelevant at the population level; bathroom is by far
the higher-leverage target by population size but its own ceiling has
never been measured the way stair's has, because the taxonomy that
produced stair's number doesn't apply to bathroom's actual mechanism. The
natural next diagnose step (not done this session) would size the
bathroom-isolated population's under-recognition-edge overlap directly —
of the 3,923 bathroom-only-broken plans, how many have EVERY blocking edge
in the under-recognition set, the same "ONLY-defect population" discipline
lever #1's own lesson established. That would produce bathroom's own
calibrated-comparable number. Not run here — flagged for Dan's decision on
whether to run it before picking, or pick with the asymmetry as-is.
