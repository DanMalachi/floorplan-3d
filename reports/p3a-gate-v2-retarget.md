# Phase 3a — Gate v2 retarget (2026-07-29 session)

Records Dan's ruling retiring the original "≥90% clean conversion" bar and
replacing it with a two-part volume+distribution-match bar, plus the
population-scale measurement that bar is judged on. `docs/extraction-plan.md`'s
P3a "Done when" line has been updated in place (old bar struck through and
marked SUPERSEDED, not silently removed).

## Why the old bar is retired

The original bar (`docs/extraction-plan.md` §P3a.1, pre-2026-07-29) read
"target ≥ 90% clean conversion of the 17K." Two independent problems, per
Dan's ruling:

1. **Volume was never the binding constraint.** The 20K-image starter set
   needs roughly 6,700 converted-clean plans (at 3 renders/plan). The
   converter has cleared that floor since before this session
   (8,226/17,000 pre-lever-1-remeasurement; **8,249/17,000 (48.5%)
   re-measured this session** — see note below on the small discrepancy).
   Chasing 90% was solving a volume problem that didn't exist.
2. **A single pooled clean-rate percentage averages away the defect that
   actually matters.** The pooled rate (48.5%) looks like "half the plans
   work, half don't, roughly uniformly." It doesn't: per-room-type survival
   (measured this session, full population) ranges from 49.2% (bedroom) down
   to **0.8% (stair)** — a 60x spread hidden entirely inside one averaged
   number. A bar gated on the pooled rate would have declared victory at
   48.5%/90% while silently shipping a training set where Phase 3b's E2
   symbol detector never sees a working stair example.

**Note on 8,226 vs 8,249**: the lever #1 build report (`reports/p3a-lever1-
build-and-remeasurement.md` §4) measured 8,226/17,000 (48.4%) via
`measure_distribution_shift.py`. This session's fresh population run via the
new `measure_gate_v2_distribution.py` gives 8,249/17,000 (48.5%) — a 23-plan
(0.14%) gap. `git diff` confirms zero changes to `rooms.py`/`skeleton.py`/
`resplan_convert.py`/`notch.py` between the two measurements, and a direct
n=3,000 side-by-side of both scripts' `_score_one` against the same plans
produced **identical** clean counts (1,487=1,487) — the two scripts compute
`converter_clean` identically. The gap is unexplained but immaterial (0.14%,
doesn't change any conclusion below or the volume-floor PASS either way) and
not chased further, per this phase's own proportionality discipline (chasing
every last discrepancy past the point where it could change a decision is
scope creep, not rigor).

## New bar — two parts, both measured population-scale (17,000 plans)

`extraction/synth/qa/measure_gate_v2_distribution.py`, one population pass
(863s, 5 workers — reduced from an initial 10-worker attempt that hit a
`BrokenProcessPool` crash under resource contention with two other population
scans running concurrently this session; unrelated to correctness, just
concurrency headroom on a 12-core machine).

### 1. Volume floor — PASSES, stated and not re-litigated

**8,249/17,000 (48.5%) converter_clean ≥ 6,700 floor. PASS.**

### 2a. Scalar axes — converter_clean subset vs. full 17K, tolerance 2% relative

**CORRECTED 2026-07-29 (3rd session) — see `reports/p3a-discriminator-
disagreement-and-corrections.md` §3.** The wall-count/plan axis below was
originally measured via the converter's own `n_walls` output and FAILED at
+4.94%. Dan flagged this as potentially circular (converter-derived value,
converter-derived subset membership). Recomputed from raw SOURCE geometry
(`len(get_geometries(plan["wall"]))`, zero converter involvement in the
value) — **it PASSES, at −0.59% relative, sign flipped from the original**.
The original FAIL is retracted as a converter-output artifact, not a real
source-complexity bias. Table below shows the corrected, load-bearing
figure; the retracted converter-derived one is kept for reference only.

| Axis | Full population | Clean subset | Gap (relative) | Status |
|---|---|---|---|---|
| doors/plan | 6.382 | 6.349 | +0.52% | **PASS** |
| rooms/plan | 8.217 | 8.078 | +1.68% | **PASS** |
| wall-count/plan (source-derived, corrected) | 9.037 | 9.091 | **−0.59%** | **PASS** |
| ~~wall-count/plan (converter-derived, retracted)~~ | ~~33.264~~ | ~~31.623~~ | ~~+4.94%~~ | ~~FAIL~~ |

**All 3 scalar axes now PASS at 2% relative.** The 2% tolerance is not
invented for this report — it's the doors/plan gap lever #1 already
demonstrated achievable (`reports/p3a-lever1-build-and-remeasurement.md`
§4: +1.4% → +0.5%). For the historical record: ResPlan's wall layer looks
like one unified polygon mass at first glance, but is actually already
multi-part at the SOURCE level (confirmed 4-11 disjoint parts/plan on a
5-plan spot check) — `wall-count/plan` is now that raw part count, a true
source-derived measurement with zero converter involvement, same footing
as doors/rooms. The original converter-derived version (`stats["n_walls"]`,
the post-skeletonization segment count) is retracted, not merely
superseded: its +4.94% gap did not reflect a real source-complexity bias in
the clean subset, only an artifact of how skeletonization happens to behave
differently on plans that also fail room assembly. No wall-complexity bias
finding survives this correction — worth knowing so it isn't
re-introduced from stale memory of this report's first draft.

### 2b. Per-room-type survival rate — measured, threshold PROPOSED, not yet ratified

"Survival" = clean-subset instance count / full-population instance count,
for each of the 7 traced room types (raw instance counts, not a
per-plan-presence check). Overall unconditional survival (== converter_clean
rate) is 48.5%.

| Room type | Full-pop. instances | Clean-subset instances | Survival | Deviation from overall |
|---|---|---|---|---|
| bedroom | 40,756 | 20,050 | 49.2% | +0.7pp (+1% relative) |
| balcony | 21,751 | 10,658 | 49.0% | +0.5pp (+1% relative) |
| kitchen | 16,945 | 8,233 | 48.6% | +0.1pp (+0% relative) |
| living | 17,266 | 8,327 | 48.2% | −0.3pp (−1% relative) |
| bathroom | 40,413 | 18,985 | 47.0% | −1.5pp (−3% relative) |
| **storage** | 1,797 | 379 | **21.1%** | **−27.4pp (−57% relative)** |
| **stair** | 757 | 6 | **0.8%** | **−47.7pp (−98% relative)** |

**The natural gap, same methodology as the doorway-notch discriminator's own
empty-band justification** (`docs/session-notes/p3a-handoff.md`, "Doorway-
notch discriminator" section): five of the seven room types (bedroom,
balcony, kitchen, living, bathroom) cluster tightly, all within **3%
relative deviation** of the overall rate (+1% to −3%). The remaining two
(storage, stair) sit at **−57%** and **−98%** relative deviation — a canyon,
not a narrow gap, between 3% and 57%. Any threshold placed between roughly
5% and 50% relative deviation separates the same two sets; there is no
close call to adjudicate here, unlike the 0.65 notch threshold which had to
sit in a genuinely narrow band.

**Proposed threshold (evidence above; requires Dan's sign-off before it's
load-bearing, per instruction — not applied silently):**

> No room type's survival rate may deviate from the overall unconditional
> survival rate by more than **15% relative** (≈ ±7.3 percentage points at
> today's 48.5% baseline; the bound is expressed relative, not as a fixed
> percentage-point band, so it scales automatically as the overall rate
> moves — e.g. if a future lever lifts the pooled rate toward 65%, the same
> 15% relative rule re-centers around 65% rather than needing to be
> re-picked).

Why 15%: it sits with a **5x margin** above the tightest real cluster
(bathroom's 3% relative deviation is the worst of the five "normal" types)
and well below a third of storage's 57% failure margin — a threshold with
this much headroom on both sides is not a close judgment call, it's picking
a number inside an obvious canyon. **This bar fails loudly today on `stair`
(0.8%) and `storage` (21.1%), by design** — that is the point of the
retarget, not a defect in it.

**Explicit PASS/FAIL table (per Dan's request that the table, not the
number, be what's approved) is in `reports/p3a-discriminator-disagreement-
and-corrections.md` §2**, alongside each type's raw broken-plan count —
notably `bathroom` PASSES on survival-deviation grounds (−3.1% relative)
despite being 70% of the currently-broken population by raw count, which
is why survival deviation and raw broken-count rank lever candidates
differently and both are laid out there for Dan's pick.

## Bottom line

Volume floor: PASS, uncontested. Scalar axes: **3/3 PASS** (doors, rooms,
wall-count — wall-count corrected 2026-07-29 3rd session from an initial
converter-derived FAIL to a source-derived PASS, see `reports/p3a-
discriminator-disagreement-and-corrections.md` §3). Per-room-type
survival: proposed 15%-relative threshold would FAIL loudly on `stair` and
`storage` today, exactly as intended — **pending Dan's sign-off on the 15%
number before it's treated as the ratified bar**; explicit PASS/FAIL table
with bathroom included is in the corrections report §2. No lever built
this session (see companion reports, `reports/p3a-defect-cooccurrence-and-
stair-diagnosis.md` and `reports/p3a-discriminator-disagreement-and-
corrections.md`, for the co-occurrence measurement, both-directions
discriminator disagreement, and stair diagnosis that inform lever #2's
future sizing — none of it locks lever #2 to stair; bathroom remains in
contention by raw broken-plan count even though it passes on survival
deviation).

## Also this session: containment-invariant assert made non-fatal

Per Dan's instruction, unrelated to the gate retarget but landed the same
session: the two `assert not conv_clean or src_clean` sites
(`extraction/synth/qa/classify_room_boundary_no_wall_match.py`'s
`compute_conditional_clean_rate`, `extraction/synth/qa/
held_out_conditional_clean_rate.py`'s `_measure`) now **log + count** a
containment-invariant violation instead of crashing the run. This is a known,
bounded class (13/17,000 = 0.076%, root-caused in `reports/p3a-lever1-build-
and-remeasurement.md` §6 as the raw-ink-vs-skeleton-band discriminator
disagreement) — a class this small must not be able to kill a 300-plan
sampling run that happens to land on one of the 13 ids. **Not unified**: per
Dan's explicit ruling, `check_plan`'s raw-wall-ink discriminator and
`assemble_rooms`'s skeleton-band discriminator stay two separate
implementations over two different inputs — that was a deliberate design
choice, not an oversight, and a 0.076% disagreement rate doesn't justify
collapsing it into one. `population_conditional_clean_rate.py` already
handled this non-fatally (counts, never asserted) and was left unchanged.
Full test suite re-run after the edit: 53/53 passing, no regressions.
