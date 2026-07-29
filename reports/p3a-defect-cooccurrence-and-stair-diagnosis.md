# Phase 3a — Defect co-occurrence + stair failure diagnosis (2026-07-29 session)

Two measurements, both population-scale (17,000 plans, not samples), per
Dan's instruction after lever #1's conditional-rate gain missed its
pre-registered 70-80% prediction by roughly 5x (55.6% population actual vs.
the 52.5%→70-80% band; see `reports/p3a-lever1-build-and-remeasurement.md`
§2). **No lever built this session** — diagnosis and sizing only, per
instruction.

## 1. Why lever #1's prediction missed by ~5x: co-occurrence, quantified

The lever #1 report already root-caused the SPECIFIC 5x miss (§2: 80% true
per-room recovery on pure-notch rooms, compounded by AND-semantics across
required rooms per plan, dominated by the raw-ink-vs-skeleton-band
discriminator disagreement — not `notch_plus_other`, which was directly
measured as tiny, ~1.2% of notch-affected rooms). This measurement answers a
broader, forward-looking question: **at population scale, how often does a
broken plan have more than one distinct defect class**, so every FUTURE
lever's sizing accounts for this before being pre-registered, not just
lever #1's.

**Scope**: `clean_at_source == True AND converter_clean == False` — the
exact population the conditional clean rate's numerator gap describes (same
denominator as `population_conditional_clean_rate.py`), not a differently-
scoped population. 6,603/17,000 plans (38.8% of ALL plans) are in scope.

**Method**: `extraction/synth/qa/measure_defect_cooccurrence.py`, full
population, 791s/6 workers. Defect classes reuse `resplan_convert.py`'s own
clean-bar computation un-collapsed (no new classification machinery): one
class per broken required room TYPE (`room_broken:bedroom/bathroom/storage/
stair`, since these four have already been separately characterized as
different mechanisms — bedroom/bathroom mostly notch-driven, storage
partially, stair not at all), plus `opening_sibling_overlap`,
`opening_projection_failed`, `ink_coverage_out_of_range`,
`other_validator_problem`, `hard_failure` (an exception inside `convert_plan`
itself — see the note at the end of this section).

### Distinct defect-class count per broken plan

| Classes present | Count | % of broken |
|---|---|---|
| 1 | 5,374 | 81.4% |
| 2 | 1,114 | 16.9% |
| 3 | 109 | 1.7% |
| 4 | 6 | 0.1% |
| **≥2 (unfixable by a single-class lever)** | **1,229** | **18.6%** |

**This does not confirm Dan's stated hypothesis as the dominant mechanism**,
and that is reported plainly rather than bent to fit: only 18.6% of the
CURRENT (post-lever-1) broken population carries a second co-occurring
defect class. The already-identified discriminator-disagreement mechanism
(§2 of the lever #1 report) remains the better-supported explanation for
that specific 5x miss. What this measurement adds, and the reason Dan asked
for it regardless of whether it explained lever #1's own shortfall: **it is
now a real, quantified, population-scale number** (not asserted) that every
future lever's pre-registered prediction must subtract before promising a
gain — an 18.6% multi-defect rate means any single-class fix has a ceiling
below 100% of its "class present" count, and that ceiling is now known
instead of assumed.

### Per-class appearance vs. ISOLATED (only this class present)

| Class | Appears in | Isolated | Isolated % of appearances |
|---|---|---|---|
| `room_broken:bathroom` | 4,618 | 3,923 | 85.0% |
| `room_broken:bedroom` | 1,320 | 692 | 52.4% |
| `room_broken:storage` | 246 | 168 | 68.3% |
| `room_broken:stair` | 40 | 23 | 57.5% |
| `other_validator_problem` | 875 | 495 | 56.6% |
| `opening_sibling_overlap` | 746 | 0 | 0.0% |
| `hard_failure` | 68 | 68 | 100.0% |
| `ink_coverage_out_of_range` | 13 | 3 | 23.1% |
| `opening_projection_failed` | 27 | 2 | 7.4% |

**`bathroom` dominates the current broken population** (4,618/6,603 = 70.0%
of ALL broken plans carry a broken bathroom, 85.0% of those in isolation) —
this is the population the raw-ink-vs-skeleton-band discriminator fix (lever
#1 report §2/§6, "likely the single highest-leverage next move") would
target, and this measurement confirms that population is both large and
mostly isolated (a fix would clear most of what it touches, not be
neutralized by a second defect).

**`opening_sibling_overlap` never appears alone (0/746 isolated)** — every
instance co-occurs with something else (mostly `other_validator_problem` at
374 and the two notch-driven room types at 233/220) — not sized further
this session, filed as a observation for whoever picks up that mechanism
next.

**`hard_failure` (68 plans, 100% isolated) is a new finding, not previously
flagged**: `convert_plan` raises an exception on 68 plans that ARE
`clean_at_source` — i.e., the converter crashes outright on plans that
should be reachable. Not diagnosed this session (out of scope — stairs and
co-occurrence sizing only, per instruction), but flagged because it's small,
clean (100% isolated, no interaction with anything else), and previously
invisible inside `diagnose_clean_rate.py`'s coarser `source_geometry_invalid`
bucket (which is scoped to plans that fail EVERYTHING, not this specific
"was clean_at_source, crashed anyway" signature).

### Pairwise co-occurrence matrix (count of broken plans with BOTH classes)

```
                                hard_failure  ink_coverage  opening_proj  opening_sibl  other_valida  room_broken:bathroom  room_broken:bedroom  room_broken:stair  room_broken:storage
hard_failure                             68             0             0             0             0                    0                    0                  0                    0
ink_coverage_out_of_range                 0            13             2             0             1                    7                    3                  0                    0
opening_projection_failed                 0             2            27             1             5                   16                    7                  0                    1
opening_sibling_overlap                   0             0             1           746           374                  233                  220                  7                   18
other_validator_problem                   0             1             5           374           875                    0                    0                  0                    0
room_broken:bathroom                      0             7            16           233             0                 4618                  491                 10                   56
room_broken:bedroom                       0             3             7           220             0                  491                 1320                  5                   17
room_broken:stair                         0             0             0             7             0                   10                    5                 40                    3
room_broken:storage                       0             0             1            18             0                   56                   17                  3                  246
```

### Stair lever sizing — the correct number, per Dan's instruction

> "Size the stairs lever as 'plans whose ONLY defect is stair-related',
> never 'plans containing a stair defect'."

- Plans containing a stair defect (any co-occurrence): **40/6,603 (0.6%)**
- **Plans whose ONLY defect is stair-related: 23/6,603 (0.3%)**

A stair-only converter-side fix can, at absolute most, clear 23-40 plans out
of the 6,603 currently broken — nowhere near the scale the 0.8% headline
survival number implies. Section 2 explains why: almost all of stair's
damage happens **upstream of this entire population**, at the source level,
before a plan ever becomes eligible for this measurement's scope.

## 2. Stair failure diagnosis — population scale, starting from plans 1448/9796

**`extraction/synth/qa/diagnose_stair_failure.py`** (full 17K, 37s scan +
14s classify = 51s total — cheap, because stair is a small population and
the heavier per-edge analysis only runs on the subset that's actually
flagged). Reuses `analyze_plan`/`classify` from `classify_room_boundary_
no_wall_match.py` **completely unchanged** — no new discriminator, no new
thresholds — filtered to stair rooms only, exactly the same taxonomy already
validated on 27/1,500-plan samples for the general `room_boundary_no_wall_
match` decomposition, just run exhaustively instead of sampled (affordable
here because there are only 757 stair instances total).

### The real bottleneck is upstream of the converter, not inside it

**697 of 757 stair instances (92.1%) are already broken at the SOURCE level**
(`clean_at_source == False` for that room) — before `assemble_rooms` ever
runs. Only ~60 stair instances are even source-clean, and of those, 6
survive the converter (matches the co-occurrence section's 23-40 broken-at-
converter-level count, modulo plan- vs. instance-level counting). **The
stair lever, if it exists, is a `check_plan`/source-level lever, not an
`assemble_rooms`/converter-level lever** — the opposite shape from lever #1
(notch), which was entirely a converter-side fix. Sizing "lever #2" against
the converter-broken population (section 1's 23-40 plans) would be sizing
the wrong 8% of the problem.

### Edge-level taxonomy (2,790 genuinely-broken stair edges, full population)

| Category | Edges | % |
|---|---|---|
| `c_exterior_boundary_or_void` | 2,140 | 76.7% |
| `a_genuine_gt_defect_between_rooms` | 306 | 11.0% |
| `b_shared_wall_wide_recoverable` | 155 | 5.6% |
| `unresolved_degenerate_probe` | 154 | 5.5% |
| `d_tracing_artifact_small_notch` | 20 | 0.7% |
| `f_unexplained_interior_gap` | 14 | 0.5% |
| `e_opening_doorway_notch` | 1 | 0.0% |

### Room-level taxonomy (697 broken stair instances of 757 total, worst-verdict-wins)

| Category | Of 697 broken | Of all 757 stair instances |
|---|---|---|
| `c_exterior_boundary_or_void` | 79.2% (552) | **72.9%** |
| `a_genuine_gt_defect_between_rooms` | 15.1% (105) | 13.9% |
| `b_shared_wall_wide_recoverable` | 4.3% (30) | 4.0% |
| `d_tracing_artifact_small_notch` | 0.7% (5) | 0.7% |
| `unresolved_degenerate_probe` | 0.4% (3) | 0.4% |
| `f_unexplained_interior_gap` | 0.3% (2) | 0.3% |

**Dominant mechanism, confirmed at population scale: `c_exterior_boundary_
or_void` (72.9% of ALL stair instances)** — the room-boundary edge's outward
probe lands outside the traced building envelope: an exterior wall gap, a
balcony/rail frontage, or a genuine void beyond the footprint. For stairs
specifically this most plausibly reflects a structural/vertical-circulation
pattern (a stairwell bordering an unroofed shaft or the building envelope at
a floor break) rather than a wall-tracing omission — but that architectural
read is inference, not confirmed by this taxonomy, which only classifies
"the outward probe found nothing inside the envelope," not why.

### Named exemplars — both confirmed exactly, population-scale, as instructed

Dan named plan 1448 stair_0 (`c_exterior_boundary_or_void`) and plan 9796
stair_0 (`b_shared_wall_wide_recoverable`) as starting points. Both
reproduce exactly at population scale, plus the two other pre-existing
`EXEMPLARS` entries:

- plan 1448 stair_0 → `c_exterior_boundary_or_void` ✓ (matches)
- plan 15895 stair_0 → `c_exterior_boundary_or_void` ✓ (matches)
- plan 9206 stair_0 → `c_exterior_boundary_or_void` ✓ (matches)
- plan 9796 stair_0 → `b_shared_wall_wide_recoverable` ✓ (matches)

### Recoverability ceiling — an upper bound to pre-register against, not a promise

Per this taxonomy's own definition (`NOT_A_REAL_DEFECT` = b/c/d/e, i.e. not a
genuine irrecoverable GT gap): **548/697 broken stair instances (78.6% of
broken, 72.4% of all 757) have every broken edge in a non-"genuine-defect"
class.** This is explicitly an upper bound, not a sizing commitment — carried
over verbatim from this session's own lever #1 finding: an edge being
`classify()`-recoverable in principle does not mean `assemble_rooms`'s
actual discriminator recognizes it (16% of true pure-notch rooms were
under-recognized this session, §2 of the lever #1 report). The same caution
applies here with more force, since `c_exterior_boundary_or_void` isn't even
the SAME mechanism the notch fix targeted — a stair-specific fix, if built,
would need its own discriminator, not a reuse of the notch one.

## Pre-registered sizing for a future "lever #2" session (NOT built this session)

Two candidate scopes, correctly separated per Dan's instruction (never
"contains a stair defect"):

1. **Converter-side fix (analogous to lever #1's shape)**: targets the
   23-40 currently-converter-broken, clean_at_source, stair-isolated plans.
   Small — this is not where stair's damage lives.
2. **Source-level fix (the actual majority mechanism, un-built, no design
   proposed this session)**: would need to teach `check_plan` to recognize
   `c_exterior_boundary_or_void`-shaped stair edges as legitimately
   boundary-adjacent (i.e., not a missing-wall defect), analogous to how the
   doorway-notch discriminator was built into `check_plan`. **Ceiling: 72.4%
   of all 757 stair instances (548), with the same "upper bound, not a
   promise" caveat as lever #1's own 70-80% prediction carried** — do not
   pre-register a point estimate inside that ceiling without first checking,
   the way lever #1's post-hoc check found the real bottleneck wasn't where
   the diagnose step expected. This report stops here, at the size and the
   caveat, per instruction not to build lever #2 this session.

## Bottom line

Co-occurrence in the CURRENT broken population is real (18.6% multi-defect)
but modest — it is not the dominant explanation for lever #1's own 5x miss
(that remains the discriminator-disagreement mechanism already identified),
but it is now a quantified, population-scale number every future lever must
account for. Stairs are not a converter-assembly problem the way notches
were: 92.1% of stair damage happens before `assemble_rooms` ever runs, at
the source `clean_at_source` check, dominated by one named, population-
confirmed mechanism (`c_exterior_boundary_or_void`, 72.9% of all stair
instances). A future stairs lever needs to be scoped as a `check_plan`
source-level fix, not an `assemble_rooms` fix — sizing it against the
converter-broken population (23-40 plans) would target the wrong 8% of the
problem.
