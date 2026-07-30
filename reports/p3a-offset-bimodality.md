# Phase 3a — Bathroom lever #2, path 1: offset-mixture test (2026-07-30, 3rd)

One measurement, pre-committed branches, per Dan's explicit instruction:
**P3a leaves bathroom's `area_match_near_miss` mechanism alone for good
after this session, either way** — four days on this defect class is
enough.

## Scoring the 12% cap first (per instruction, before running anything new)

Lead's 469-edge cap (`reports/p3a-bathroom-lever2-census.md`, 2026-07-30
2nd) was numerically correct — the bound held, 0% ≤ 12% — **but for the
wrong reason**: it assumed the 469-edge under-recognition set WAS
bathroom's mechanism and argued only about its size. The census that ran
showed it is 7/1,170 stage-1 edges — not the mechanism at all. The census
instruction (measure the full population, don't assume the mechanism) was
the valuable move; the specific number it produced was cheap to get once
that instruction was followed. Recorded, not re-litigated further.

## Dismissed before running anything (per instruction)

Lead's suspicion that `EMPIRICAL_FACE_OFFSET_MULTIPLIER` shares a root
with Phase 2's fabricated GT wall thickness (all 650 provisional GT walls
exactly 150.0mm): checked, **ruled out**. `rooms.py:150-166` documents the
multiplier's calibration against 107,608 direct per-wall perpendicular
casts against REAL ResPlan source-polygon boundaries across 800 plans —
a completely different dataset from Phase 2's placeholder GT. Not
pursued further.

## Pre-registrations (written before running `measure_offset_bimodality.py`)

1. **Lead's fork hypothesis**: "multimodal, and the mixture is per-plan
   rather than per-wall."
2. **This session's method commitment**: MULTIMODAL with a material split
   (each mode ≥10% of mass) → real lever, size the ceiling, STOP for Dan.
   UNIMODAL, or multimodal-but-trivial → permanent documented limitation,
   same treatment storage got, bar not moved, STOP. No third candidate
   opened either way.

## Method

`extraction/synth/qa/measure_offset_bimodality.py` (new). Whole
population throughout, never the plans that suggested a mode.

1. Re-measured the SAME 800-plan calibration population
   `calibrate_offset.py` used (`measure_wall_offsets`, REUSED UNCHANGED),
   tagging plan_id/room_key the predecessor script discarded.
2. Fine histogram (not summary statistics) + a formal bimodality read
   (Sarle's bimodality coefficient + KDE peak count) on both the pooled
   per-wall distribution and the per-plan median-ratio distribution.
3. Separately (full 17K scan): re-derived the exact 4,592
   `area_match_near_miss` bathroom rooms
   (`size_bathroom_lever2_census._is_isolated_bathroom` +
   `diagnose_cycle_unrepairable.analyze_plan`, BOTH REUSED UNCHANGED) and
   measured each one's own per-wall offset ratios against its own already-
   repaired wall_cycle.
4. Branch, decided by the calibration population's own read (step 2), not
   the near-miss population.

**Hard prohibitions honored**: `EMPIRICAL_FACE_OFFSET_MULTIPLIER` was never
edited on disk (the "simulate under mode k" step monkeypatches the module
attribute in-process for one `_mitered_face_polygon` call, then restores
it — same discipline as `diagnose_notch_area_fraction.py` sizing option C
before it was built). `area_match_tolerance` (5%) was never widened.
`assemble_rooms`/`check_plan`/`resplan_convert.py` were never touched. No
lever was built.

## Results

### 1. The calibration population IS a real mixture, but the read needed a fine histogram to see it — a coarse one and the summary coefficient alone would have gotten it wrong

**Pooled per-wall ratios (n=107,608, unfiltered)**: mean=0.722,
median=0.838 (matches the committed constant exactly — a good consistency
check), stdev=0.937. A 40-bin histogram across the FULL range crushes
99.4% of the data into a single bin — 0.4% of measurements (395/107,608)
are implausible ray-cast artifacts out to ratio≈78, an obvious measurement
degeneracy (no physically real offset is 78 half-thicknesses), not signal.

**Filtering to a physically-plausible bulk (ratio ≤ 3.0, dropping the
0.37% tail) and re-running the read**: Bimodality coefficient = **0.537**
— technically just BELOW the classic 5/9≈0.556 "non-unimodal" threshold.
**A hard cutoff on that single number would have called this unimodal and
been wrong.** The 60-bin fine histogram on the same filtered data is
unambiguous: a broad hump peaking at [0.25,0.30) with 10,938 measurements,
a real valley dropping to 267-521 (a 20-40× drop) across [0.55,0.80), then
a second hump peaking at [0.999,1.049) with 8,940 measurements, tapering
off by ~1.6-2.0. **KDE independently finds exactly 2 peaks at ratio=0.270
and 1.056** — matching the histogram's two humps. Mass split: low-mode
52,489/107,213 (49.0%), high-mode 54,724/107,213 (51.0%) — **a genuinely
material, roughly even mixture**, not a marginal one. This is exactly why
the instruction demanded the full histogram over summary statistics: BC
alone, taken as a hard threshold, would have missed a mixture the
histogram makes obvious.

**Per-plan median ratios (n=800 plans, ≥5 measurements each)**: BC=0.633,
KDE finds **3** peaks (0.353, 0.646, 0.969), and the 40-bin histogram is
visibly messier than the per-wall one — shallower, narrower valleys (e.g.
[0.561,0.588)=22 sits close to nearby bump heights of 24-30, nothing like
the 20-40× drop the per-wall pooled valley shows), no clean two-mode
separation.

### 2. Scoring pre-registration 1 (lead's fork hypothesis)

**"Multimodal" — CONFIRMED, and materially so** (49.0%/51.0% split,
surviving outlier-filtering scrutiny). **"The mixture is per-plan rather
than per-wall" — NOT SUPPORTED, and probably backwards.** The per-WALL
pooled distribution shows a far cleaner, deeper two-mode split than the
per-PLAN median distribution, which is messier and arguably 3-modal
rather than 2-modal. If anything, this points AWAY from a per-plan
authoring-batch convention and toward a per-wall-level driver (e.g. wall
role — external vs. internal — or a thickness band; NOT measured this
session, flagged as an open question, not chased, per the explicit "one
measurement, capped" instruction). **Half right: real mixture, wrong
locus.** Consistent with, and not deferred past, lead's stated 1-for-7
track record on this project's mechanism calls.

### 3. MULTIMODAL branch fires — sized ceiling

Mode centers from the bulk-filtered KDE: **k_low=0.270, k_high=1.056**
(the outlier-contaminated raw KDE gave 0.301/1.147 in a first pass; using
the cleaned centers changed the resulting ceiling non-trivially — see
below — which is itself the reason the outlier-filtering step mattered,
not a cosmetic detail).

Each of the 4,592 `area_match_near_miss` bathroom rooms was assigned to
whichever mode center its OWN measured wall-offset ratio sat closer to
(a diagnostic assignment using the room's own data — **flagged as a
caveat**: a real, buildable lever would need an assignment signal that
doesn't depend on the room's own failing measurement; this ceiling is an
upper bound under a favorable assumption, not a claim that a real
detector already exists). Face-polygon area was then re-simulated
in-process under that mode's center multiplier (never the room's own
exact fit, avoiding circular perfect recovery) and checked against the
EXISTING, UNCHANGED 5% gate.

| | Count | % |
|---|---|---|
| Room-level ceiling (informational only) | 203/4,592 | 4.4% |
| **Plan-level ceiling** (ALL bathroom near-miss rooms in the plan must clear — the number that matters, since 1,171/3,400 plans have >1 such room) | **93/3,400** unique plans | **2.74%** |
| Plan-level, as % of the full 3,932-plan bathroom-ONLY-broken population | 93/3,932 | **2.37%** |
| **CALIBRATED** (0.468 factor, stated SEPARATELY per instruction, never folded into the raw ceiling) | 93 × 0.468 ≈ 43.5/3,932 | **1.11%** |

## Bottom line

**MULTIMODAL fired — this is a real, materially-sized mixture in the
calibration population, not noise, and the pre-registered branch commits
to calling it a real lever.** But the resulting recoverable ceiling is
**small**: 93 raw / ~44 calibrated plans out of the 3,932-plan
bathroom-ONLY-broken population (2.37% raw / 1.11% calibrated), using a
diagnostic-only assignment method that itself needs a real detector before
any of this is buildable. **For comparison**: stair's ONLY-defect
population is 23 plans, calibrated ceiling ~8 plans (~0.05pp of the full
17,000-plan population). Bathroom's per-mode ceiling here is **roughly
5-6× stair's absolute size** (~44 vs ~8 plans) but is nowhere near the
scale the original discriminator-reconciliation hope implied, and unlike
stair's number (which needs no further detector work, just a source-level
fix), this ceiling assumes an assignment signal that doesn't exist yet.

**Per Dan's explicit instruction: this is where P3a leaves bathroom's
`area_match_near_miss` mechanism, for good, either way.** No lever built,
`EMPIRICAL_FACE_OFFSET_MULTIPLIER` untouched on disk, `area_match_tolerance`
untouched, `assemble_rooms`/`check_plan` untouched, no third lever #2
candidate opened. Both original lever #2 candidates (stair, bathroom) are
now fully accounted for: stair is small-but-clean (~8 calibrated plans,
buildable today as a `check_plan` source-level fix); bathroom's
best-available mechanism is real-but-small-and-not-yet-buildable (~44
calibrated plans, needs a wall-level assignment signal that doesn't exist).
**Next session, Dan's decision, not resolved here**: build stair's small
but clean lever, accept both as too small to prioritize and move to the
renderer (deliverable 2, untouched), or something else — no further
sizing work on bathroom.
