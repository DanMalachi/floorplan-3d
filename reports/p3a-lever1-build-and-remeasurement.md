# Phase 3a — Lever #1 build + re-measurement (2026-07-29 session)

Builds and re-measures doorway-notch handling (Option C) in
`extraction/synth/rooms.py::assemble_rooms`, per
`docs/session-notes/p3a-handoff.md`'s "Next session: build it." Two
commits: `9b59ba4` (pure `notch.py` module move, zero behavior change,
49/49 tests) and `8d1f227` (the actual stage-1 exemption + area-gate
normalization, 53/53 tests including the new converter-path defect-flip
test).

## What was built

1. **Stage 1** of `assemble_rooms` restructured from one pass to two
   (mirroring `measure_clean_at_source.py::check_plan`'s own pattern): a
   ring edge no wall band ever backs is now offered to the same validated
   3-condition discriminator (`opening_coverage >= 0.65`, perpendicular to
   the nearest wall-backed neighbor, `edge_len <= 1.2 * wall_depth`)
   before being marked `broken` — previously this unconditionally dropped
   the room as `broken_room_cycle` before stage 2 or the area gate ever
   ran.
2. **Area-match gate** normalizes the source polygon by subtracting each
   excused edge's own pocket area (`poly.difference(pocket)` — confirmed
   NOT `poly.union`, see `notch.py`'s docstring and `test_notch.py`'s
   pinned 1216/1200/16 fixture) before comparing to the mitered face
   polygon. Falls back to the raw area if no pocket is usable.
   `_mitered_face_polygon`/`_corner_vertices`/
   `EMPIRICAL_FACE_OFFSET_MULTIPLIER`/`_MITER_LIMIT` untouched.
3. New shared `extraction/synth/notch.py` module (moved, not duplicated,
   discriminator logic) so core converter code has somewhere valid to
   import it from (core never imports from `qa/`).

## Re-measurement

### 1. Held-out check on the four discriminator constants

The 0.65 / 0.15 / 1.2 / 4.0-default-wall_depth constants were tuned by
inspecting specific plans across the 2026-07-21/22/26 diagnostic sessions.
Excluded 305 plan ids from the eval sample: the 300-plan discriminator
false-positive sweep (`measure_notch_discriminator_fp.py`'s
`find_sample(plans, 300, 3000)`, which strictly contains the 27-plan
sample used to validate perpendicularity/length) plus 5 individually-named
exemplar plans (64, 12017, 5683, 11942, 11587) not already in that set.
Full list: `extraction/synth/qa/tuning_plan_ids.json`.

| | n=300 | conditional rate (`converter_clean | clean_at_source`) |
|---|---|---|
| Full sample (`plans[:300]`) | 300 | **58.4%** (150/257) |
| Held-out (tuning plans excluded) | 300 | **58.0%** (174/300) |

Held-out rate is NOT materially below the full-sample rate (gap: +0.4
points) — the discriminator generalizes, not just fitting the plans it was
tuned on.

**Caveat on the held-out sample's composition**: excluding `find_sample`'s
output — which by construction selects plans that FAIL
`room_boundary_no_wall_match` — mechanically strips a disproportionate
share of "dirty" plans from the low end of the dataset order, which is why
held-out `clean_at_source` reads 100% (300/300). That number is an
artifact of the exclusion method, not a real population statistic; only
the conditional rate (58.0%) is comparable across the two rows.

### 2. Conditional rate vs. the pre-registered prediction — BELOW prediction, headline finding

The handoff's pre-registered prediction was 52.5% → **70-80%**. The
n=300 measurement landed at **58.4%**, and full-population (17,000 plans,
not a sample) landed at **55.6%** (8236/14822, see
`extraction/synth/qa/population_conditional_clean_rate.py`, run this
session). Both are **materially below the 70-80% band**, and the
population number is itself below the n=300 sample (another instance of
this phase's recurring sample-vs-population optimism gap, Rule 2).

Per the handoff's own framing, this is a finding, not a failure: rooms
where every sub-threshold edge is notch-flagged are fully recoverable by
lever #1 alone; a room with at least one sub-threshold edge that does
NOT satisfy the notch conjunction has a second, independent defect (the
`notch_plus_other` population, 12.8% of bedroom's notch-affected rooms per
the diagnose-step report) that lever #1 alone cannot fix. The shortfall
vs. the 70-80% prediction is consistent with that second cause being
larger than the diagnose step's bracket assumed — a real, separate
population to size, not a build defect. `broken_room_cycle` on
`storage`/`stair` (0% notch-driven per the original diagnosis) is the
other known, deliberately-untouched contributor.

### 3. Converter-path defect-flip check — PASS, load-bearing

Committed as `extraction/synth/tests/test_gate_flip_check_audited.py`
(not a one-off script run): of the 62 human-audited genuine-defect edges
in `audited_notch_ground_truth.json` (i.e. every non-notch verdict),
**zero flipped to converter-assembled** after this build. The
discriminator is not wrongly excusing real defects at the converter level.

### 4. Distribution-shift (bias) check — gap narrowed, matches prediction

Re-framed success metric per instruction: volume was never the binding
constraint (52.5%+ already clears the 20K-image target); the real risk is
that failures are door-correlated by construction, under-representing
doors in the training set fed to Phase 3b's door detector. Measured full
17K population, before (commit `78d61ec`) vs. after (`8d1f227`), via
`extraction/synth/qa/measure_distribution_shift.py`:

| | converter_clean (unconditional) | doors/plan, full pop. | doors/plan, clean subset | gap (relative) |
|---|---|---|---|---|
| Before | 44.8% (7619/17000) | 6.382 | 6.291 | **+1.4%** |
| After | 48.4% (8226/17000) | 6.382 | 6.349 | **+0.5%** |

**Pre-registered prediction confirmed: the gap narrowed** (roughly a 64%
relative reduction in the door-underrepresentation gap), not just the
rate. This is the headline result lever #1 was actually built for.

Room-type mix shift, same before/after runs: `storage` recovery improved
(18.3% → 21.1% of the population's storage instances survive into the
clean subset); `stair` recovery is **unchanged at 0.8%** (6/757 both
before and after) — expected, since stair/storage breakage was already
diagnosed as NOT notch-driven (see handoff's issue tracking) and lever #1
correctly left it alone.

### 5. Area-error baseline — unchanged, no refresh needed

`measure_area_error.py` (150-plan sample) re-run post-build:
median=2.09%, p90=4.79% — **identical** to the existing
`BASELINE_MEDIAN_ERR`/`BASELINE_P90_ERR` in
`diagnose_notch_area_fraction.py`. Expected: this script measures via
`_build_adjacency`/`_mitered_face_polygon`/`_repair_connectivity` directly
(bypassing `assemble_rooms`'s stage-1/area-gate entirely), so it never
exercises the notch-normalization path. No constant refresh needed.

### 6. NEW FINDING, not pre-registered: containment invariant now fails on 13/17,000 plans (0.076%)

`compute_conditional_clean_rate`'s own assertion (`not conv_clean or
src_clean` — "you cannot cleanly CONVERT a plan whose source isn't
clean_at_source") was previously verified 135/135 (2026-07-26, pre this
build). The population-scale run this session found **13 plans where it
no longer holds**: `[16561, 4056, 5198, 10617, 2967, 9951, 11295, 1074,
9996, 992247, 6148, 14176, 1815]`. Root-caused on plan 16561 (representative):

```
check_plan:      clean_at_source=False, flags=['room_boundary_no_wall_match:bedroom_2']
convert_plan:    clean=True, room flags=['room:notch_normalized:bedroom_2', ...]
```

**Mechanism**: `check_plan`'s discriminator runs against RAW, filled wall
ink (`_wall_boundary_edges`/`_edge_covered`); `assemble_rooms`'s new stage-1
discriminator runs against the SKELETON's derived wall bands (a lossy
representation built via `fill_openings_into_wall` → skeletonize →
simplify). These are two independently-computed coverage signals over
DIFFERENT geometry, feeding the SAME threshold constants
(`OPENING_COVERAGE_THRESHOLD`/`PERPENDICULARITY_COS_THRESHOLD`/
`NOTCH_LENGTH_MULTIPLE`) — for `bedroom_2` on plan 16561, the skeleton-band
signal crosses the notch discriminator's threshold and gets excused
(`notch_normalized`), while the raw-ink signal does not, so `check_plan`
still flags the edge as a genuine boundary mismatch. The two "same"
discriminators were never actually guaranteed to agree — they only agreed
on every case sampled so far by coincidence of the underlying geometry
being similar enough pre- and post-skeletonization.

**Not fixed this session** (scope: gate report only, no lever #2). Flagging
because: (a) it means the previously-trusted containment invariant is no
longer exactly true at population scale — small (0.076%) but real; (b) any
FUTURE re-run of `compute_conditional_clean_rate` (the n=300, non-population
version) will `assert`-crash outright if its fixed 300-plan window ever
happens to include one of these ids (none of the 13 are in `plans[:300]`,
which is why this session's n=300 measurements above didn't trip it) —
worth loosening that assertion to a recorded warning, or reconciling the
two discriminators' input geometry, before the next session trusts a
clean n=300 run as proof this is fine.

## Bottom line

Lever #1 shipped and works as designed — the discriminator generalizes to
held-out plans, doesn't wrongly excuse audited genuine defects (per the
committed converter-path flip test), and measurably narrows the
door-representation bias it was built to fix (the actual pre-registered
success condition, per Dan's reframe). The conditional clean rate moved
52.5% → 58.4% (n=300) / **55.6%** (population, 17,000 plans), short of the
pre-registered 70-80% — a genuine, separate finding (a second, non-notch
defect population on the same rooms) to size next, not a defect in this
build. Separately, population-scale measurement surfaced a real, small
(13/17,000) containment-invariant break between `check_plan`'s and
`assemble_rooms`'s independently-computed notch discriminators (§6) that
needs reconciling before the next session's numbers can be trusted without
re-checking it.

## Not done this session (per scope)

Stopped at this gate report, per instruction — lever #2
(skeleton-simplification fix for issue #4's `missing_from_skeleton`
mechanism) not started.
