# Phase 0 Debt Session — Ground-Truth Audit

Status: COMPLETE + RATIFIED, amended per lead's 4-point follow-up (n
disclosure, ceiling arithmetic, censoring characterization, stale-metadata
fix). Read-only measurement session plus one metadata-only commit — no
phase started, no lever built, no wall/junction/thickness geometry
touched, no bar changed or proposed.
Scope: read-only measurement of `data/corpus/gt_provisional/` (15 files) against
source ink in `data/corpus/incoming/`. No pipeline file touched, no GT file
edited, no schema/eval file edited, no phase started.

## Why this audit exists

Phase 2 closed NOT MET against an exit bar of F1 >= 0.99 @ tau = 0.005 (fraction
of plan diagonal), and that bar has never been validated against what the GT
actually encodes. All 650 walls across all 15 GT files carry `thickness ==
150.0` exactly, tagged `flags: ["legacy_default_thickness", ...]` — a
fabricated constant carried over by `convert_legacy_gt.py`, not a
measurement. `eval/metrics/matching.py::centerline_cost` matches a predicted
wall's centerline polyline against GT's polyline directly (symmetric
point-to-segment distance), so if GT polylines were traced along a visible
wall EDGE rather than the true geometric middle, a perfect extractor that
outputs true centerlines is off by (true thickness)/2 before any pipeline
error is counted at all.

tau_frac = 0.005; tau_abs = tau_frac * plan_diagonal. Reported by the lead as
50.2mm on the 15x30 plan, 73.2mm on the 30x50 plan (both recomputed below
from `plan_diagonal()` in `eval/metrics/matching.py`, using GT wall endpoints
as `match_walls` does when no explicit diagonal is passed).

## Pre-registration (written before any measurement was run)

**Lead's prediction:** Centerlines are GENUINE (roughly symmetric per wall),
but real thickness varies enough across the corpus that a constant 150mm
mis-places a meaningful share of walls by more than tau.

**My prediction (written before Measurement 1/2/3 ran):**
- M1 (convention): I expect a MIX, not a clean single population — the corpus
  spans 15 plans traced across at least two visibly different eras/tools
  (per `docs/labeling-spec.md` §6, all 15 are `provisional_unaudited`
  conversions from an old trace tool with no role taxonomy). Clean vector
  marketing PDFs (15x30, 20x45, 30x50, Matterport — `hatched`/`poche`
  convention_class, real vector ink) are the ones most likely to have been
  traced carefully down a printed centerline guide or a hatch band's visual
  middle, so I lean CENTERLINE for those. The `poche`-style raster JPGs (the
  9 Israeli developer-plan photos, low-resolution phone photos of printed
  plans, per `docs/israeli-floorplan-domain.md` memory) are exactly the case
  where a human tracer clicking against a blurry photographed gray-fill band
  is more likely to anchor to whichever boundary is visually crisper (often
  one edge, not an ambiguous fuzzy middle) — I lean EDGE-leaning or
  inconsistent-per-wall for that subset. Net prediction: population is
  bimodal (not uniformly one convention), split roughly along the
  raster-photo vs. vector-PDF line, not resolvable by a single verdict for
  "the corpus."
- M2 (thickness): real thickness varies well outside a tight band around
  150mm — expect a wide spread (both true masonry/block walls in the ~200-
  250mm range on the vector plans and thin partition walls in the ~80-120mm
  range), because these are heterogeneous plans (US marketing PDFs, Indian
  hatched-model PDFs, Israeli developer photos) with no shared construction
  convention, so a single constant can't be locally right for more than a
  minority.
- M3 (label noise floor): I expect GT-internal junction mismatches to be
  small relative to tau on the clean vector PDFs (hand-traced but the
  legacy tool likely snapped shared endpoints — note `w_s4`/`w_s6` in
  15x30's own file already share exact float coordinates at `j_p3`, which
  is a good sign) but potentially comparable to or exceeding tau on the
  low-resolution raster photos, where sub-mm coordinate precision is
  reported (many decimal places) but cannot possibly reflect real
  measurement precision at that source resolution.

Both predictions will be scored against the measured numbers in the verdict
section.

## Method note (read before the numbers)

GT wall coordinates are stored in `units.mm_per_unit = 1.0` for every file,
with `image_transform.matrix` = identity and `scale_source = null` /
`scale_inliers = 0` in every file — i.e. the *bookkeeping* for how the
legacy trace tool derived its scale was never populated. Independent sanity
check: the 15x30 plan's own wall bounding box is ~4430mm x ~9018mm, which is
a ~3%/~1.4% match to a nominal 15ft x 30ft (4572mm x 9144mm) building — so
the stored coordinates are genuine real-world mm, just with the source
provenance chain for *how* that scale was derived lost. To compare GT
against source ink, this audit independently re-derives a pixel<->mm
similarity transform per file (rotation fixed at 0 — verified per file that
wall directions cluster at 0/90 degrees). The actual calibration method
(an ensemble of building-envelope and peak/profile strategies, gated and
visually verified per file) is documented in the "Calibration confidence"
section below, after the pre-registration — the peak/profile approach
sketched here going in turned out to be unreliable on its own (see that
section) and was not the method actually trusted for the final numbers.
Any file whose calibration cannot be trusted is marked NOT MEASURED rather
than forcing a number through a bad fit.

## Calibration confidence (read before the numbers)

Ran on all 15 files: render the source PDF/JPG at the exact pixel grid
`image_transform.source_px` records, threshold to an ink mask (per-image
Otsu), then find a px<->mm similarity transform per axis via an ensemble of
strategies (building-envelope bbox aspect-match at two dilation strengths,
plus a peak/profile grid search), gated by requiring `|sx| ~= |sy|` (a true
similarity transform can't have different scale per axis on an
axis-aligned plan — this caught several otherwise-plausible-looking but
wrong fits). Every one of the 15 overlays was visually inspected
(GT walls drawn in red over the rendered source).

- **13 / 15 files: calibration visually confirmed good** — GT lines track
  real wall ink closely. Used for Measurements 1 and 2.
- **2 / 15 files: calibration unreliable, excluded from M1/M2, marked NOT
  MEASURED for ink-based work:**
  - `Matterport Sample_BW` — multi-floor sheet; only a fraction of Floor 1
    is traced in GT and the fit never passed the same-scale gate
    (`|sx|=0.020` vs `|sy|=0.058`, a ~3x mismatch).
  - `739790347_...jpg` — the source file is not a floorplan photo but a
    **screenshot of a phone gallery app displaying the photo** (status
    bar, app chrome, Russian-language UI buttons all rendered into the
    image). No amount of transform-fitting recovers a coordinate mapping
    from a photo of a photo through unrelated UI chrome.
  These 2 files still contribute to Measurement 3 (pure JSON, no ink or
  calibration needed).

A methodological limitation that affects M1/M2's statistical power even on
the 13 good files: calibration is one **global** similarity transform per
file. On the raster JPGs (real phone photos), true camera perspective is
not a similarity transform, so per-wall alignment quality degrades with
distance from wherever the fit is best-anchored. This is very likely the
main driver of the large "incomplete" bucket in M1 below (a wall for which
no ink at all was found within the search window on one or both sides,
predominantly on `encoding_class=R` raster files, median ink-coverage-at-
GT-line of 0.0 for that bucket vs 0.42 for classified walls) — not evidence
those walls are absent, but evidence the audit's single-transform-per-file
approach loses precision far from center on real photos. Reported as a
limitation, not silently patched by widening the search window (tested:
widening 400mm->800mm recovered only 3/13 cases on a sample file, i.e. it's
not simply a too-small search radius).

## Measurement 1 — centerline vs. edge convention

Method: per GT wall, sample along the centerline (excluding ~160mm at each
end to avoid junction/corner contamination, and excluding opening spans),
and independently in the +v and -v perpendicular directions find the
nearest ink/blank transition ("nearest drawn ink edge" per side, `d_neg`,
`d_pos`). A wall classifies as:
- **centerline**: both sides > 30mm and far/near ratio < 3 (roughly equal,
  non-zero)
- **edge**: the smaller side <= 30mm, the other > 30mm (one side ~0, other
  ~full thickness)
- **asymmetric_other**: both sides > 30mm but far/near ratio >= 3 (offset
  from center, but not cleanly ON one edge either — partial/intermediate
  offset)
- **both_near_zero**: both sides <= 30mm (GT sits on a thin feature/corner,
  not informative for this test)
- **incomplete**: no ink found within the 400mm search window on at least
  one side (see calibration-confidence note above)

Population: 529 walls across the 13 calibration-reliable files.

| class | n | % of 529 | % of the 214 classified (excl. incomplete) |
|---|---|---|---|
| incomplete | 315 | 59.5% | — |
| centerline | 91 | 17.2% | 42.5% |
| edge | 64 | 12.1% | 29.9% |
| asymmetric_other | 39 | 7.4% | 18.2% |
| both_near_zero | 20 | 3.8% | 9.3% |

Two-column distribution for the 214 walls with a reading on both sides
(near = min(d_neg,d_pos), far = max(d_neg,d_pos)):

| | median | IQR |
|---|---|---|
| near | 42.0mm | [16.0, 93.5] |
| far | 140.0mm | [83.5, 251.5] |

Bimodality read: the **near** column does NOT show two separated peaks (a
spike at ~0 and a separate spike at ~thickness/2). It is a heavy-near-zero,
monotonically-tapering distribution (histogram: 0-10mm:25, 10-20mm:33,
20-30mm:24, 30-40mm:17, 40-50mm:18, 50-75mm:22, 75-100mm:23, 100-150mm:29,
150-200mm:11, 200-300mm:12, 300+:5). **This is not the signature of a
single clean population under either pure convention** — it reads as a
genuine mixture of edge-traced and centerline-traced walls (each
individually near-clean, per the strong per-plan/per-style splits below),
smeared somewhat by per-wall calibration slop (single global transform per
file, see above).

Per-`convention_class` breakdown (registry.csv is authoritative; the GT
JSON's own embedded `source.convention_class`/`encoding_class` fields were
STALE at measurement time — see "Metadata fix" section below, now
corrected in a separate commit):

| convention_class | n walls | classified n (excl. incomplete) | centerline (n) | edge (n) | edge+centerline split |
|---|---|---|---|---|---|
| single_stroke (1350 plan only, 1 plan) | 57 | 19 | 16 | 3 | 84% centerline (n=19) |
| hatched (15x30, 20x45, 30x50; 3 plans) | 47 | **10** | 3 | 7 | **NOT QUOTABLE — n=10 classified.** 70% edge = 7 walls. These are exactly the 3 plans (15x30/20x45/30x50) most likely to be cited to reinterpret Phase 2's recall failure; do not cite "70% edge" as a stratum-level finding on this sample size. |
| poche (9 Israeli JPGs) | 425 | 126 | 72 | 54 | 57% centerline (n=126) — the only stratum with n>=30, the closest thing to a quotable per-style split in this audit |

**Rule applied throughout this report: any stratum or breakdown cell with
n<30 classified walls is marked NOT QUOTABLE inline, not just here.** An
underpowered percentage in a gate report gets cited later as if solid —
that is the failure mode this audit exists to end.

Per-plan breakdown. **`n_classified` column is the denominator for that
row's percentages; EVERY row here is n<30 — every single-plan percentage
in this table is NOT QUOTABLE as a standalone finding, full stop.** Shown
only to demonstrate no plan is a clean single population; do not extract
any one plan's row as evidence on its own (full counts in
`scripts/gt_audit/_out/rows.json`):

| plan | n_walls (total) | n_classified (denominator) | centerline | edge | asym_other | both~0 | NOT QUOTABLE (n<30)? |
|---|---|---|---|---|---|---|---|
| 1350-Sq-Ft-Modern-House-Plan | 57 | 23 | 16 | 3 | 4 | 0 | yes |
| 15x30-ft-Best-House-Plan-Model | 10 | 5 | 1 | 4 | 0 | 0 | yes |
| 20x45-Model | 18 | 3 | 1 | 2 | 0 | 0 | yes |
| 30x50-Model-landscape | 19 | 2 | 1 | 1 | 0 | 0 | yes |
| 732584435 (jpg) | 41 | 18 | 4 | 5 | 7 | 2 | yes |
| 732845872 (jpg) | 42 | 16 | 9 | 5 | 1 | 1 | yes |
| 733062873 (jpg) | 62 | 42 | 16 | 12 | 7 | 7 | yes |
| 733514932 (jpg) | 55 | 27 | 9 | 13 | 4 | 1 | yes |
| 735222816 (jpg) | 57 | 18 | 6 | 4 | 6 | 2 | yes |
| 736931713 (jpg) | 25 | 6 | 3 | 0 | 2 | 1 | yes |
| 737383801 (jpg) | 56 | 19 | 6 | 7 | 5 | 1 | yes |
| 738206378 (jpg) | 53 | 17 | 7 | 5 | 1 | 4 | yes |
| 739609728 (jpg) | 34 | 18 | 12 | 3 | 2 | 1 | yes |

**Every single plan in this corpus has n<30 classified walls. Not one
per-plan percentage anywhere in this report is individually quotable.**
The only claims this audit stands behind at the population level are (a)
the pooled 214-wall classification (M1 headline table, n=214, adequately
powered) and (b) the poche stratum (n=126). Everything sliced finer than
that is illustrative, not evidence.

**M1 verdict: bimodal/mixed, NOT a single genuine convention across the
corpus (n=214 pooled, adequately powered).** No plan or stratum is 100%
one convention. There is a directional lean per drawing style, but only
the poche stratum (n=126) and the pooled total (n=214) are large enough to
quote: poche is roughly even, 57/43 centerline-leaning (n=126), with a
substantial minority — 27% of its classified walls (n=126) — in the
"asymmetric_other"/"both_near_zero" buckets that fit neither clean
convention. The single_stroke (n=19) and hatched (n=10) stratum figures
are directionally suggestive only, NOT QUOTABLE. This directly matches the
"the bar is unachievable by construction" mechanism the lead flagged for a
**material minority** of walls, not for the whole corpus uniformly — see
the Censoring section below for whether this minority is under- or
correctly-estimated.

## Censoring characterization — is the "incomplete" bucket informative?

315/529 walls (59.5%) produced no ink-based reading at all, so every M1/M2
figure above rests on the ~40% of the population that DID resolve. "No ink
within 400mm on at least one side" will not censor walls at random — it
will preferentially drop walls whose GT line sits far from any nearby ink,
which is plausibly the WORST-placed GT, not a random subsample. This
section measures whether that's true, and what it implies for the 14%
unachievable figure in the Verdict below.

**Pre-registration (written before running this diagnostic):**

*Lead's prediction:* the incomplete set is enriched in badly-placed GT, so
the true unachievable share exceeds 14%.

*My prediction:* the incomplete bucket is a MIX of two distinct
mechanisms, not purely "badly-placed GT" — (a) genuine mis-registration
(agrees with lead's mechanism) and (b) a benign structural case: exterior
walls whose outward-facing side has nothing drawn nearby by construction
(already observed directly during M1 method development — wall `w_s2` in
the 15x30 plan legitimately found no ink on its exterior side within
400mm, which is correct, not a placement error). I predicted
boundary-touching (likely-exterior) walls would show a markedly higher
incomplete rate than interior walls, and that a meaningful share would
stay unresolved even at a much wider search radius. Net prediction: lead
is directionally right (share exceeds 14%), but the increase is moderate,
not dramatic, because part of the bucket is not evidence of bad placement
at all.

**Measurement** (`scripts/gt_audit/measure_censoring.py`):

| test | incomplete | classified | read |
|---|---|---|---|
| wall length (median) | 1909mm | 1917mm | no differentiation |
| has openings | 109/176 = 61.9% incomplete | — | modest enrichment vs. 206/353 = 58.4% for no-openings walls |
| boundary-touching (proxy for exterior) | 128/176 = **72.7%** incomplete | — | interior walls: 187/353 = 53.0% incomplete |

Boundary-touching walls (touch the plan's overall bbox within 50mm — a
proxy for exterior walls) are incomplete at a **substantially higher rate**
than interior walls (72.7% vs. 53.0%, n=176 boundary / n=353 interior,
both adequately powered). This confirms mechanism (b): a real share of
"incomplete" is mechanically driven by exterior walls whose outward side
has nothing drawn nearby, not by bad GT placement.

**Diagnostic-only widened search** (v_max 400mm -> 2000mm, explicitly NOT
used for the official M1/M2 numbers above, disclosed here only to
characterize the censored population):

- Of 315 incomplete walls, **90 (28.6%) still have BOTH sides unresolved
  even at 2000mm** — no ink found within two full meters in a direction
  where the search should, on any benign reading (large room, distant
  dimension line, etc.), eventually hit *something* in a residential
  floorplan. This is much harder to explain as benign than the
  boundary-touching finding above.
- Of the 225 walls that did resolve at least one side by 2000mm, distance
  to the nearest resolved side: median 162mm, 90th percentile 720mm, max
  1944mm. 50/225 needed to go beyond the original 400mm window to find
  anything at all.

**Per-plan and per-convention_class incomplete rates** (shown for
transparency, NOT QUOTABLE individually — every row n<30 walls except
where noted): incomplete rate ranges from 32.3% (733062873, n=62 total)
to 89.5% (30x50, n=19 total) across plans, and single_stroke 59.6%
(n=57)/hatched 78.7% (n=47, itself already flagged NOT QUOTABLE above)/
poche 57.4% (n=425, quotable) across strata — no single stratum explains
the censoring on its own.

**Verdict on the censoring question: 14% IS AN UNDERESTIMATE, direction
confirmed, exact magnitude UNDETERMINED.** Reasoning:
- A real, substantial share of "incomplete" (the boundary-touching excess,
  72.7% vs. 53.0%) is benign — driven by exterior walls whose outward
  face legitimately has nothing nearby — and does NOT imply those walls
  are badly placed. Excluding them from M1/M2 is not obviously wrong.
- But 90/315 (28.6% of incomplete, 17% of the full 529-wall population)
  show no ink at all within 2 full meters on at least one side. This
  audit's calibration is a single global similarity transform per file
  (see Calibration confidence note), which loses precision away from its
  best-fit anchor on real camera photos — so this 28.6% tail is
  irreducibly ambiguous between "GT is genuinely badly placed" (supports
  the lead's mechanism directly) and "this audit's registration failed
  for this wall" (this audit simply cannot see that far). Either
  explanation means the true unachievable share is UNDERSTATED by the
  14% figure: if it's bad GT, the true share is higher; if it's audit
  registration failure, then 14% was never a population estimate to begin
  with, only a lower bound on the confirmed subset.
- This audit cannot produce a corrected percentage without either (a)
  per-wall manual re-registration (out of scope, this is not a re-trace)
  or (b) a piecewise/projective calibration model (a real engineering
  project, not a debt-session diagnostic). Reporting UNDERESTIMATE with
  the arithmetic above, not a replacement number, per the "no placeholder
  numbers" rule.

**Both pre-registrations scored:** Lead's prediction — **CONFIRMED
directionally.** The incomplete set is measurably enriched in walls that
plausibly carry real placement/registration problems (the unresolved-at-
2m tail), and the true unachievable share exceeds 14%. My prediction —
**CONFIRMED on the mixed-mechanism claim** (boundary-touching enrichment,
72.7% vs 53.0%, cleanly demonstrates a benign structural component
alongside the bad-placement component) but **the "moderate not dramatic"
qualifier is UNVERIFIABLE** — this audit has no way to size the true
increase precisely, so "moderate" was an unsupported guess dressed as a
prediction. Score: lead's directional call holds up better than my
attempt to bound the magnitude.

## Measurement 2 — real thickness distribution

Method: for walls with both `d_neg` and `d_pos`, thickness = `d_neg +
d_pos` (sum of the two side distances, as specified). For walls where one
side found nothing within the search window (the whole wall band sits to
one side of the GT line), a fallback continues the scan through the found
side's contiguous ink run to its far boundary and uses that span. 389/529
walls produced a thickness estimate; 11 were excluded as implausible
(<=0mm or >=600mm — almost certainly contamination from adjacent-room ink
or text, not a real wall thickness), leaving n=378.

| | value |
|---|---|
| median | 118.0mm |
| Q1 / Q3 | 32.0mm / 242.5mm |
| IQR | 210.5mm |
| mean / stdev | 156.6mm / 136.9mm |
| min / max | 2.0mm / 566.0mm |

Histogram (mm): 0-50:123, 50-100:38, 100-150:60, 150-200:28, 200-250:38,
250-300:30, 300-400:35, 400-600:26.

Per-plan median (n = walls with a valid thickness estimate; NOT QUOTABLE
flag per the n<30 rule applied throughout this report):

| plan | n | median | IQR | NOT QUOTABLE (n<30)? |
|---|---|---|---|---|
| 1350-Sq-Ft-Modern-House-Plan | 32 | 228.0 | [107,230] | no (n=32) |
| 15x30-ft-Best-House-Plan-Model | 8 | 185.0 | [123,240] | yes |
| 20x45-Model | 14 | 116.0 | [94,143] | yes |
| 30x50-Model-landscape | 15 | 136.0 | [12,140] | yes |
| 732584435 (jpg) | 35 | 254.0 | [106,288] | no (n=35) |
| 732845872 (jpg) | 24 | 124.0 | [26,246] | yes |
| 733062873 (jpg) | 58 | 248.0 | [58,310] | no (n=58) |
| 733514932 (jpg) | 38 | 115.0 | [86,194] | no (n=38) |
| 735222816 (jpg) | 31 | 132.0 | [34,284] | no (n=31) |
| 736931713 (jpg) | 19 | 30.0 | [20,210] | yes |
| 737383801 (jpg) | 39 | 44.0 | [16,172] | no (n=39) |
| 738206378 (jpg) | 36 | 30.0 | [26,118] | no (n=36) |
| 739609728 (jpg) | 29 | 76.0 | [25,182] | yes |

Six of thirteen plans are individually NOT QUOTABLE on thickness (n<30);
the pooled n=378 figure is the one this report stands behind. The
per-plan spread (30mm-254mm medians, mixing quotable and non-quotable
rows) is shown to demonstrate heterogeneity exists, not as thirteen
independent findings.

The corpus median (118mm) sits well below the fabricated constant (150mm),
and per-plan medians range from 30mm to 254mm — an 8x spread. This is
real, physical heterogeneity (exterior vs. interior walls, different
countries'/styles' construction conventions), not noise: the pooled
IQR alone (210.5mm) is wider than the constant itself.

**How far off is the constant 150, and how much of it is due to convention
vs. raw thickness variance?** Two separate questions, both with
consequences for `tau=0.005`:

1. Taking the true thickness distribution at face value (independent of
   convention): `|true_thickness - 150| / 2` is the error a downstream
   consumer of the *fixed 150mm thickness field* would see if GT's
   *centerline* were otherwise correct. This exceeds tau(50.2mm) for
   56.6% of walls (214/378) and exceeds tau(73.2mm) for 16.7% (63/378).
2. **The convention question is the more load-bearing one for F1.** Only
   walls that are NOT already centerline-classified are structurally
   at risk from the convention issue (a centerline-classified wall's GT
   line is already correct regardless of what the thickness FIELD says).
   Of the 103 edge/asymmetric_other walls with a valid thickness
   estimate, a perfect extractor outputting the true wall centerline
   would still fail to match GT (thickness/2 > that plan's own tau) for
   **52 of them — 50.5%**. That is roughly 52/378 ≈ 14% of ALL walls with
   a thickness reading, and consistent with M1's ~30-48% off-center share
   depending on stratum.

## Measurement 3 — is tau above GT's own numeric noise floor?

Pure JSON analysis (no ink/calibration needed) — covers all 15 files
including the 2 flagged unreliable for M1/M2.

**3.1 Coordinate precision:** all 2600 sampled coordinate values carry 9-14
decimal places (`repr()` of the stored float) — full double-precision
noise from some upstream floating-point transform, zero evidence of
snapping/quantization to a coarse grid (0% have <=1 decimal place). This
precision is obviously far beyond any real tracing precision; it is an
artifact of how the legacy tool stored coordinates, not a claim about
accuracy.

**3.2 Junction endpoint mismatch:** for every wall listed at a junction,
distance from that wall's nearest endpoint to the junction's declared
`point` — **0.0000mm for all 1300 wall-junction pairs, exactly, no
exceptions.** Junctions were constructed by coordinate reuse, not
independent re-measurement, so there is zero internal noise here by
construction. This part of GT is nowhere near the noise floor — it has no
measurable noise at all.

**3.3 Collinear-continuation flush check:** for wall pairs meeting at a
junction that run ~straight through (outgoing angle difference > 172
degrees), perpendicular distance from one wall's far endpoint to the
other's infinite line. n=219 through-junction pairs. Median = 0.00mm (most
are perfectly flush), but a real tail exists: **11/219 (5.0%) exceed
tau(50.2mm)**, 4/219 (1.8%) exceed tau(73.2mm), max 322.9mm (735222816
plan, `j_p37`, `w_s40`-`w_s57` — almost certainly two segments of what
should be one straight wall that were traced with a genuine kink, not
noise but a labeling error). This is a real, if minority, source of
GT-internal inconsistency that independently exceeds tau, unrelated to the
centerline/edge convention question.

**M3 verdict:** GT's own coordinate storage is not the noise floor problem
— junction endpoints are exact by construction, and coordinate precision
is not meaningfully quantized. But GT is not perfectly self-consistent
either: ~5% of straight-through wall pairs have a real flush-alignment
error exceeding tau, independent of anything to do with centerline vs.
edge. tau is NOT below GT's own noise floor in the aggregate (the floor is
near-zero for the junction-sharing majority), but for that ~5% tail,
individual walls DO carry GT-authoring error exceeding tau.

## Pre-registrations scored (M1/M2/M3 original pair)

(The censoring diagnostic's own separate pre-registration is scored inline
in the Censoring section above.)

**Lead's prediction** ("centerlines are GENUINE/symmetric, but real
thickness varies enough that constant 150 mis-places a meaningful share by
more than tau"): **PARTIALLY CORRECT, but the more consequential mechanism
is different from what was predicted.** Real thickness does vary enough to
matter (M2: median 118mm, IQR 210mm, 56.6% of walls exceed tau(50.2mm) on
the constant-150 question alone) — that half of the prediction holds. But
"centerlines are genuine" does NOT hold as a corpus-wide claim: only 42.5%
of classified walls are cleanly centerline; 57.5% are edge or
intermediate-offset. The lead's mechanism (thickness-constant error) is
real but secondary to the convention-mixing mechanism this audit was
launched to check.

**My prediction** ("a MIX split along raster-photo vs. vector-PDF lines,
hatched/vector = centerline, poche/raster = edge-leaning"): **PARTIALLY
CORRECT on "it's a mix," WRONG on the specific direction.** It is
genuinely a mix (confirmed) with a real per-style lean (confirmed) — but
the direction was backwards: `hatched` vector PDFs lean edge (70%, n=10,
small sample) while `poche` raster JPGs lean centerline (57%, n=126). The
single_stroke US marketing PDF (n=19 classified) is the strongest signal
in either direction (84% centerline) and wasn't specifically called out as
its own case in my prediction.

Score: both predictions got the qualitative shape partly right (thickness
matters; convention is mixed, not uniform) and both got a specific
directional claim wrong or overconfident (lead: convention isn't uniformly
genuine; me: the vector/raster split runs the opposite direction from
predicted). Neither prediction anticipated the M3 collinear-flush finding.

## Verdict

**Is F1 >= 0.99 @ tau = 0.005 achievable, unachievable, or undetermined on
this ground truth?**

**0.99 IS IMPOSSIBLE, NOT MERELY HARD. The achievable ceiling is AT MOST
~0.925, and the censoring finding above means even 0.925 is an optimistic
upper bound, not the true ceiling.**

**Ceiling arithmetic (the actionable output of this audit):**

- 52 of 378 walls with a thickness reading have `true_thickness/2 >
  tau` for their own plan (Measurement 2) — these are walls where GT
  itself sits further from true geometry than tau allows, so no
  extractor, however accurate, can match them. 52/378 = **13.8% ≈ 14%**.
- Taking that rate as the population rate: **recall <= 1 - 0.14 = 0.86**
  is the hard ceiling on wall recall, by construction, before any
  extraction error at all.
- **F1 with a hypothetical PERFECT extractor (precision = 1.0):**
  `F1 = 2*P*R / (P+R) = 2*1.0*0.86 / (1.0+0.86) = 1.72/1.86 = 0.925`.
- **0.99 > 0.925: the bar is mathematically unreachable on this ground
  truth, for any extractor, at any quality level.** This is not "hard to
  hit" — it is impossible by construction, the same way a 100m-dash bar
  set 5 meters before the actual finish line is impossible regardless of
  runner speed.
- **0.925 is itself an upper bound, not the true ceiling — the Censoring
  section above found 14% is very likely an UNDERESTIMATE.** 315/529
  walls (59.5%) never produced a reading at all, and among those, 90
  (28.6% of incomplete, 17% of the full population) show no ink within 2
  full meters on at least one side — a signature much more consistent
  with genuinely bad GT placement than with the benign "exterior wall
  facing open space" explanation that accounts for part of the rest of
  the incomplete bucket (confirmed via the boundary-touching test: 72.7%
  incomplete rate vs. 53.0% interior). If the true unachievable rate is
  higher than 14% — which the evidence points toward without this audit
  being able to size it precisely — the true achievable ceiling is LOWER
  than 0.925, not higher. **0.925 should be read as "the best case is no
  better than this," not as "this is achievable."**
- Separately, M3's ~5% collinear-flush tail contributes its own
  tau-exceeding GT noise, independent of (additive to, not counted
  inside) the 14% figure above.

**Why this is UNDETERMINED at the precise-number level while still being
IMPOSSIBLE at the bar level:** the 0.99 bar is impossible with certainty
(0.925 is a hard, defensible upper bound from measured data). But the
EXACT achievable ceiling below 0.925 is undetermined, because: (a) the
edge/centerline split is plan- and style-dependent and only two of three
strata are adequately powered (poche n=126 and the pooled n=214; hatched
n=10 and single_stroke n=19 are NOT QUOTABLE), (b) 59.5% of walls
produced no ink-based reading at all and that censoring is now shown to
be non-random (enriched in walls harder to confirm as well- or
badly-placed), and (c) 2/15 files (13% of the corpus) were entirely
excluded from M1/M2 for calibration reasons and contribute nothing to
either number.

No replacement bar is proposed here, per instruction — this is Dan's call
once he has this number. What this audit delivers is: the current bar is
impossible, the measured ceiling is at most ~0.925, and the true ceiling
is probably lower than that but not precisely known.

## Metadata fix — stale `source.encoding_class`/`convention_class`/`scope_class`

**Root cause found:** `extraction/synth/convert_legacy_gt.py` (lines
122-124) hardcodes `"encoding_class": "R"`, `"convention_class":
"single_stroke"`, `"scope_class": "single"` for every legacy-converted GT
file, regardless of that plan's actual style — the exact same
placeholder-default pattern as the already-documented `thickness: 150.0`
constant this whole audit exists to check. It is not a rare edge case: a
systematic check of all 15 GT files against `eval/registry/registry.csv`
found **14 of 15 disagreed** with the registry on at least one of the
three fields (only `1350-Sq-Ft-Modern-House-Plan` matched, apparently by
coincidence — it happens to genuinely be R/single_stroke/single). Per
`docs/labeling-spec.md` §6, registry.csv is the authoritative source for
these labels.

**Consumers found (grepped the full repo for `convention_class` /
`encoding_class` before touching anything):**

| file | reads from | verdict |
|---|---|---|
| `eval/metrics/engine.py::score_corpus` (line 125) | `gts[pid]["source"][...]` — the GT JSON directly | **LIVE BUG, now fixed by this commit.** Built `by_stratum` from the stale field. Every past/future `eval/cli.py run --strata` invocation silently mis-bucketed all 14 affected plans (15x30/20x45/30x50 on encoding+convention; the 9 poche JPGs + Matterport on convention, Matterport additionally on scope_class single-vs-multi_floor) under the wrong `(encoding, convention, scope)` stratum key. This is the bigger finding — a mis-routing consumer, not just a stale label. |
| `eval/metrics/strata.py::stratum_key`/`group_by_stratum` | same pattern (`plan["source"][...]`) | **Dead code** — grepped for callers, found none anywhere in the repo (only self-reference and an unrelated docstring mention in engine.py). Same bug shape, but currently inert. Flagging in case someone wires it in later expecting it to be correct. |
| `eval/registry/registry.py::load_registry`/`stratum_counts` | `registry.csv` directly | Correct, unaffected — this is the authoritative path. |
| `extraction/trackv/run_corpus.py` | `entry.encoding_class`/`entry.convention_class` via `load_registry()` | Correct, unaffected. |
| `extraction/synth/svg_gt.py` | function parameters with defaults, for future GT *authoring* | Not a consumer of the stale data — a producer tool for new plans, separate from the legacy-converted corpus under audit. Not touched. |
| `extraction/schema/extraction_v1.schema.json`, `tests/schema/test_validate.py`, `docs/paper.md` | schema enum declaration / test fixtures / docs | Declare the field shape, don't consume real corpus values. Not touched. |

**Fix applied:** corrected `source.encoding_class`/`convention_class`/
`scope_class` in all 14 mismatched GT files to match registry.csv, in one
commit (`P0 debt: fix stale source.encoding_class/convention_class/
scope_class in legacy GT`, this worktree/branch). Diff is metadata-only —
every changed hunk touches exactly those 1-3 lines under `"source"`;
verified via `git diff` before committing (reproduced below). No wall,
junction, opening, or thickness field was touched. `extraction/`, `eval/`,
and the schema were not modified — only the frozen-per-rule-5 GT data
files themselves, which is explicitly in scope for a metadata-only
labeling correction (not a schema or interface change).

## Reproducing this audit

All measurement code: `scripts/gt_audit/` (`calibrate.py`,
`measure_wall.py`, `measure3_noise.py`, `measure_censoring.py`,
`run_measure.py`, `analyze.py`, `overlay_check.py`). Raw per-wall output:
`scripts/gt_audit/_out/measurements.json` (calibration + all 579 wall
readings) and `rows.json` (flattened, classified). Calibration overlay
PNGs for visual verification of all 15 files: `scripts/gt_audit/
_check/*.png`.

**Geometry integrity, verified not asserted:** `git diff` against `main`
for everything under `data/corpus/gt_provisional/` touches only the 14
files' `source.encoding_class`/`convention_class`/`scope_class` lines (the
one commit described above); `git status` shows no changes anywhere under
`extraction/`, `eval/`, or the schema. `scripts/` and `reports/` are new,
untracked-until-now files, not modifications. No wall, junction, opening,
or thickness value in any GT file was changed at any point in this
session.
