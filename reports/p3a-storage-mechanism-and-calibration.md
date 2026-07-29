# Phase 3a — Storage mechanism check + lever #1 sizing-method calibration (2026-07-29, 4th session)

Delivers exactly tasks A and B per Dan's instruction. **No lever built, no
lever #2 proposal made — that's task C, still pending Dan's review of this
report.**

## A. Does storage share stair's dominant mechanism? No — two separate levers.

`extraction/synth/qa/diagnose_storage_failure.py`, full population (34s
scan + 10s classify), reuses `classify_room_boundary_no_wall_match.py`'s
`analyze_plan`/`classify` completely unchanged — same taxonomy, same
constants, only filtered to `storage` instead of `stair`.

| Category | Storage, room-level | Stair, room-level (for comparison) |
|---|---|---|
| `a_genuine_gt_defect_between_rooms` | **81.5% of broken (698/856), 38.8% of all 1,797** | 15.1% of broken, 13.9% of all 757 |
| `b_shared_wall_wide_recoverable` | 16.5% of broken, 7.8% of all | 4.3% of broken, 4.0% of all |
| `c_exterior_boundary_or_void` | 1.2% of broken, 0.6% of all | **79.2% of broken, 72.9% of all** |
| `d_tracing_artifact_small_notch` | 0.2% of broken, 0.1% of all | 0.7% of broken, 0.7% of all |
| `unresolved_degenerate_probe` | 0.5% of broken, 0.2% of all | 0.4% of broken, 0.4% of all |
| `f_unexplained_interior_gap` | 0.1% of broken, 0.1% of all | 0.3% of broken, 0.3% of all |

**Storage's dominant mechanism is `a_genuine_gt_defect_between_rooms`
(81.5%/38.8%) — a REAL, IRRECOVERABLE source-data defect, not a wall-
detection or boundary-adjacency problem.** This matches and population-
confirms the 2026-07-21 session's 3-instance spot-check finding verbatim: a
storage closet whose room polygon sits embedded inside a solid, uncut mass
of wall ink — no door/gap was ever cut into the wall layer for that room at
all. Stair's dominant mechanism (`c_exterior_boundary_or_void`, 72.9%) is
essentially ABSENT from storage (0.6%). **The profiles do not match. Storage
and stair are two separate levers, confirmed before any sizing work, per
task A's purpose.**

**Consequence for storage's ceiling**: recoverability (rooms where every
broken edge is in the non-genuine-defect classes b/c/d/e) is only
**17.6% of broken / 8.4% of all 1,797 storage instances** — far below
stair's 78.6%/72.4%. Storage's low survival rate (21.1%, the gate's other
failing row) is mostly a genuine, unfixable-by-software GT data quality
issue, not a converter or discriminator gap. This is a materially different
— and much less promising — lever than stair, and that difference needed
to be known before either was scoped, per the point of running this check
first.

## B. Calibrating lever #1's sizing method against its own actual outcome

`extraction/synth/qa/calibrate_lever1_prediction.py`, full population
(91s/6 workers). Pure bookkeeping, no new hypothesis, per explicit
instruction: identifies the population that "entered `clean_at_source` via
the notch-suppression fix" (precise, reproducible definition: `check_plan`
returns a non-empty `notch_suppressions` list AND an empty `flags` list —
i.e., every one of the plan's would-be-broken edges got excused as a notch;
without the suppression, this plan would NOT have been `clean_at_source`) —
this is the exact population the lever #1 diagnose step's own prediction
was about — then traces each one's ACTUAL, CURRENT (post-lever-1-build)
`convert_plan` outcome.

**Note on population size vs. the handoff's prose "66 plans" figure**: this
session's precise, reproducible definition finds 27/300 plans in the exact
`plans[:300]` sample (9.0%), not 66/300 (22%). The "66" figure's original
derivation isn't reproducible from any committed script — it most likely
used a looser criterion (e.g. counting every plan where a suppression fired
at all, regardless of whether the WHOLE plan ended up clean_at_source,
which this session measured separately at 34/300, still not 66). This
discrepancy is stated plainly rather than silently resolved — chasing the
exact provenance of a prose figure from a stale note is not what task B
asked for, and the precise, reproducible definition used here is the more
defensible one for a calibration factor going forward.

### Result, full 17,000-plan population

| | Count | % |
|---|---|---|
| Predicted-to-fully-clear population | 1,184 | 6.96% of all plans |
| Actually cleared (converter_clean) | 554 | **46.8%** of the predicted population |
| Still broken | 630 | 53.2% of the predicted population |

**CALIBRATION FACTOR: 0.468 (554/1,184).** Applied to this session's stair
recoverability ceiling (72.4%, from part A's companion diagnosis):

> **Calibrated stair estimate: 72.4% × 0.468 = 33.9%** of all 757 stair
> instances — not the raw 72.4% taxonomy ceiling, which this calibration
> shows the underlying sizing method overstates by roughly 2x on its own
> proven track record.

**Still-broken breakdown, by flag** (a plan can carry more than one; caveat
before reading it: this raw histogram mixes true BLOCKING causes with
purely informational flags — `cycle_repaired:*` marks a room whose wall
cycle needed the BFS bridge repair but SUCCEEDED, not a failure, and
`broken_room_cycle`/`cycle_unrepairable` on `balcony`/`kitchen`/`living`
are OPEN_PLAN_ROOM_TYPES, which never count against `clean` per
`resplan_convert.py`'s own bar — so their large raw counts here reflect
incidental co-occurring open-plan breaks on plans that are ALREADY broken
for a required-room reason, not the actual cause):

| Flag (mechanism:room_type) | Count |
|---|---|
| `cycle_unrepairable:bathroom` | 247 |
| `cycle_unrepairable:bedroom` | 92 |
| `broken_room_cycle:bathroom` | 126 |
| `broken_room_cycle:bedroom` | 218 |
| `broken_room_cycle:storage` | 15 |
| `cycle_unrepairable:storage` | 13 |
| `cycle_unrepairable:stair` | 4 |
| `broken_room_cycle:stair` | 2 |
| (informational, not causal: `cycle_repaired:*`, open-plan `broken_room_cycle`/`cycle_unrepairable` on balcony/kitchen/living) | (see raw log) |

**The true blocking population, restricted to `CLEAN_REQUIRED_ROOM_TYPES`
only**: bathroom (373 combined) and bedroom (310 combined) dominate the
still-broken causes by a wide margin over storage (28) and stair (6) —
consistent with, and a second independent confirmation of, this session's
earlier finding that bathroom/bedroom under-recognition (raw-ink-vs-
skeleton-band discriminator disagreement) is the largest still-open
mechanism, not stair or storage. Stair and storage barely register in
THIS specific population, because this population (plans that entered
clean_at_source via NOTCH suppression) is by construction a
notch-affected population — stair/storage failures were already
established as ~0% notch-driven, so their near-absence here is expected,
not a new finding.

## Bottom line

**A**: Storage and stair do not share a mechanism. Storage is dominated by
genuine, irrecoverable GT defects (81.5%/38.8%) with a low 8.4% ceiling;
stair is dominated by a recoverable-in-principle exterior/void-adjacency
pattern (79.2%/72.9%) with a much higher 72.4% (now 33.9% calibrated)
ceiling. Two separate levers, sized very differently.

**B**: The sizing method that produced stair's 72.4% ceiling has a measured
calibration factor of 0.468 against its own actual, traced track record.
**Calibrated stair estimate: 33.9% of all 757 stair instances** — this is
the number task C should size lever #2 against, not the raw 72.4%. No
mechanism theorized for the gap between predicted and actual (not asked
for, not delivered) — this is bookkeeping, and the factor is now available
to discount any future estimate this same method produces.

No lever built. Task C (propose lever #2, sized as ONLY-defect population,
calibrated) awaits this report's review.
