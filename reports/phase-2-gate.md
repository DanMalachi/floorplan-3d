# Phase 2 Gate Report — Track V Milestone 1 (Dissection + Coverage Test)

Branch `phase-2-trackv` (worktree `fp-phase2`, forked from `main` @ `d3b3ee1`, which merged the Phase 1 gate report). **This is a milestone checkpoint, not a full Phase 2 closure** — per the session's explicit scope, only milestone 1 (PyMuPDF dissection + the ink-coverage router test) was built. Stroke-width clustering, wall-face pairing/centerline recovery, medial-axis extraction, layer/color-based classification, and residue classification (`docs/extraction-plan.md`'s remaining Phase 2 items) are not started. Held here for Dan's merge decision per his explicit instruction — nothing merges to main without it.

## What was built

`extraction/trackv/primitives.py` + `dissect.py` — faithful PyMuPDF vector-primitive extraction (`get_drawings()`/`get_images()`), no interpretation, no wall/not-wall judgment. `extraction/trackv/coverage.py` — the router's coverage test: rasterize the real page, redraw only the extracted primitives, `coverage = fraction of non-text ink the redraw explains`, bar = 0.95 (`docs/extraction-plan.md` Phase 2 spec). Two corrections required before build, both now implemented and unit-tested (`extraction/trackv/tests/test_coverage.py`, 4/4 passing):

1. **Text-ink subtraction.** `get_drawings()` never captures text; text ink is detected via `get_text("rawdict")` and subtracted from the denominator only, never credited to the numerator (`text_ink_fraction` reported per plan). Verified by a rectangle+text-label fixture that must still score ~100%.
2. **Redraw dilation (1-2px).** The vector-render mask is dilated before the AND, to absorb registration/rasterization slack between the real page and the redraw. Verified by a synthetic sub-pixel coordinate offset that a raw AND measurably loses (coverage < 0.95) and dilation measurably recovers (coverage ≥ 0.95).

Full corpus sweep: `extraction/trackv/run_corpus.py`, output `extraction/trackv/out/coverage_results.json`. Reads `eval/registry/registry.py` read-only — `eval/` untouched throughout.

## Corpus split (descriptive only — does not size the phase)

n=16, 10 of which are JPGs (raster by construction, trivial 0% coverage, no informative signal). **The coverage test's raw output measures 3/16 routing to Track V, 13/16 to Track R** on this specific corpus. Per `convention_class`: all 3 `hatched` plans → track_v; all 11 `poche` + 2 `single_stroke` → track_r (this raw count includes Matterport under `poche`/track_r — see below for why that number is superseded). This is not a statistically meaningful estimate of Track V's real-world share — the deliverables this milestone are the coverage test itself and the finding below, not this ratio.

## Registry `encoding_class` disagreements — flagged for Dan's ruling, `eval/registry/registry.csv` not modified

All 6 PDFs disagree with their registry-guessed `encoding_class`; all 10 JPGs agree trivially.

| plan_id | registry guess | measured coverage | measured verdict |
|---|---|---|---|
| `1350-Sq-Ft-Modern-House-Plan` | V | 0.0% (0 primitives, 1 embedded image) | raster-in-PDF-container |
| `5400-Square-Ft-House-Plan-With-Mentioned-Ceiling-Height` | V | 0.0% (0 primitives, 1 embedded image) | raster-in-PDF-container |
| `Matterport Sample_BW` | V | 93.56% raw / **96.77% with watermark excluded** | **track_v, pending subpath-flattening fix** — see investigation below |
| `15x30-ft-Best-House-Plan-Model` | R | 99.83% | genuinely vector |
| `20x45-Model` | R | 100.0% | genuinely vector |
| `30x50-Model-landscape` | R | 99.87% | genuinely vector |

**Highest-priority item for the P0 gate (per Dan, not actioned here):** `1350-Sq-Ft-Modern-House-Plan` and `5400-Square-Ft-...` are logged `encoding_class=V` in the registry but are, by direct measurement, raster scans wrapped in a PDF container — zero vector primitives, one embedded raster image each. `5400-Square-Ft-...` is also the corpus's only `gt_status=none` plan. Left uncorrected, both will misclassify as "vector PDFs" in any future encoding-stratified metric (e.g. once Phase 3b runs a Track V vs. Track R comparison), contaminating that stratum with raster content. Registry correction intentionally not applied — `eval/registry/registry.csv` is P0-frozen; this is a proposal for Dan's ruling at the P0 gate, same discipline as the Phase 1 harness proposals (issues #5/#6/#7).

## Matterport Sample_BW — routing verdict: track_v, pending subpath-flattening fix

**Superseding the raw 93.56%/track_r number below: Matterport is a genuine Track V plan, misrouted by an identified P2 bug, not an unparseable plan.** With the watermark region excluded, measured coverage is 96.77%, clearing the 95% bar. The routing is recorded here as track_v-pending-fix rather than left filed as track_r, because that would mean shipping a routing decision known to be wrong on a number a known bug is suppressing. Fixing the bug (below) is the first item for the next Track V milestone; once fixed, re-running `run_corpus.py` should move this plan's *raw* output to match this verdict without needing a manual override.

## Investigation — why the raw run misses at 93.56%

Requested because the plan is 1.44pts under a bar this session's two amendments just moved, making it the corpus's one real calibration signal. Investigated directly (residual-mask connected-component analysis on the actual pixel data, not inferred):

- Total unexplained ("residual") ink: 72,244 px of 1,121,494 px non-text denominator (6.44% — the reported 93.56% coverage is `1 - this fraction` after rounding).
- Connected-component analysis of the residual finds it is **not** uniformly diffuse: the 15 largest components (of 186 total), all co-located in one ~600×450px page region (approx. x:4800-5900, y:3850-4300 at 150dpi), account for 34.3% of all residual mass. Cropping and viewing that exact region directly identifies it as **the Matterport logo/wordmark watermark** (icon + "Matterport®" text).
- That watermark **is genuinely drawn as vector fills** (`get_drawings()` correctly returns filled-path drawings there, type `f`) — it is not a raster inset, thumbnail, or unparseable raster element. Direct inspection of the raw drawing items confirms each glyph/icon-piece is a **multi-subpath compound path** (letters with counters — 'a', 'e', 'o', 'p', 'r' — need an outer contour + inner hole, i.e. ≥2 subpaths per glyph; estimated 4-8 subpaths per glyph in this wordmark). This milestone's `dissect.py`/`coverage.py` flatten every drawing's items into **one continuous polyline**, with no subpath-boundary detection — so a multi-contour glyph gets corrupted into a single wrong (likely self-intersecting) shape on redraw, and its real ink goes almost entirely unexplained (293 of 25,095 denominator px in that specific region, ~1%).
- Excluding just that one region from the denominator (3.4% of total non-text ink) raises measured coverage from 93.56% to **96.77%** — clearing the bar.
- The remaining, smaller residual components (ranks 16-30, 500-950px each) are spatially scattered across nearly the full page (x: 1579-5842 of 6034, y: 534-4118 of 4267) — consistent with ordinary diffuse edge/registration slack, not a second concentrated feature.

**Answer to the diagnostic question as posed:** neither of the two hypothesized causes, precisely — it is not a real un-vectorizable raster region (the watermark has real vector geometry behind it), and it is not primarily diffuse edge slack either (over a third of the miss is concentrated in one identifiable spot). It is a **milestone-1 dissection/redraw limitation**: multi-subpath compound fills are not yet handled. This is a coverage-test implementation gap, not evidence that Track V structurally can't handle this plan or that the amendment bar is miscalibrated. **Flagging for Dan's routing call:** the plan is one small, scoped fix (subpath-boundary detection in `dissect.py`/`coverage.py`, splitting on point-discontinuities within a drawing's `items` list) away from very likely clearing 95% outright — worth doing before treating this plan as Track-R-routed, but that fix was not made this session (out of the approved milestone-1 scope). Supporting evidence: `extraction/trackv/out/matterport_band_crop.png` (the isolated watermark crop) and the connected-component numbers above; not scripted as a committed tool this session, numbers are reproducible from `coverage.py`'s existing (private) mask functions.

## Note — dilation amendment's verified failure mode

The dilation fix is verified in `test_dilation_recovers_small_registration_offset` against a **synthetic sub-pixel coordinate offset**, not against the anti-aliasing/independent-double-render noise it was originally specified to absorb. That's because the originally planned test mechanism (mismatched `lineCap` end styles between source and redraw) was empirically confirmed inert in this PyMuPDF build (1.28.0) — two renders of the same line with `lineCap=0` vs `lineCap=1` produced byte-identical output, so it couldn't demonstrate anything. The sub-pixel-offset simulation is arguably more realistic (it mirrors, at Track V's own redraw-registration scale, the same class of slack Phase 1's issue #5 measured across baselines), but genuine anti-aliasing/double-render noise as a distinct failure mode remains **untested**. Flagging per Dan's request: if a future plan misses the bar by a hair and it isn't a registry-guess error or a subpath-flattening case like Matterport's, anti-aliasing noise on the redraw is the first place to look.

## Explicitly not done this session

Stroke-width clustering, wall-face pairing/centerline recovery, filled-polygon medial-axis, layer/color-based semantic classification, residue classification, any VLM adjudication. `dissect.py` captures layer/color/width as raw fields (free at parse time) but nothing consumes them yet.

## FIRST target for milestone 2 — fix before building stroke-width clustering

**Multi-subpath compound-path flattening bug.** `dissect.py`'s `_flatten_items` concatenates every item in a drawing into one point list with no subpath-boundary detection, and `coverage.py`'s `_rasterize_vector_mask` connects them as a single continuous polyline. Any compound filled path — glyphs with counters, multi-piece icons, and (the reason this is milestone-2's first item rather than a general backlog entry) **filled door-swing symbols and wall polygons with inner courtyards/holes** — gets corrupted the same way the Matterport watermark did. It only stayed invisible on the three ~100%-coverage hatched plans because their wall-relevant ink happens to be subpath-simple (line strokes, not compound fills); the same latent bug will bite the moment centerline/medial-axis recovery consumes a compound path, which milestone 2 does directly. Fix: detect subpath boundaries within a drawing's `items` list (a discontinuity where one item's endpoint doesn't match the next item's start marks a new subpath) and preserve them as separate closed loops through both dissection and redraw, before starting stroke-width clustering or parallel-pair centerline+thickness recovery.

## Other known gaps (ordinary backlog, not blocking)

1. Anti-aliasing/double-render noise as a dilation failure mode is untested (above).
2. `run_corpus.py` scores only page 0 of each plan; all 16 corpus files are single-page today, so this hasn't mattered, but it's not general.

## Disposition

Durable artifacts from this milestone: this report, `extraction/trackv/{primitives,dissect,coverage,run_corpus}.py` + tests, `extraction/trackv/out/coverage_results.json`, `extraction/trackv/out/matterport_band_crop.png`. Commits on `phase-2-trackv`: `48becb5`, `16310f6`, `d7581b0`, `fd60927`, plus this report's post-review revision. **Merge approved by Dan** after the Matterport routing correction and the milestone-2 priority note above. No further Track V work started this session (milestone 2 — stroke-width clustering / centerline recovery, now gated on the subpath-flattening fix first — explicitly not begun, per instruction).

## Milestone 2, step 1 — subpath-flattening fix landed

Branch `phase-2-trackv-m2` (worktree `fp-phase2`, forked from `main` @ `7f53273`). Fixes exactly the bug flagged above, nothing else (stroke-width clustering, centerline recovery, medial-axis, layer/color classification, and VLM calls are explicitly out of scope for this step and not started).

**Fix:** `VectorPrimitive` now carries `subpaths: list[list[Segment]]` (one entry per contour) instead of a single flattened point list. `dissect.py`'s `_extract_subpaths` splits a drawing's raw `items` on point-discontinuity — PyMuPDF emits no explicit move-to marker between subpaths, confirmed directly against the real Matterport PDF's raw items (7 genuine gaps, largest 23.7pt, zero float-rounding false positives at the sub-hundredth-point level). Segments keep their real op (`"l"`/`"c"`) instead of collapsing a multi-curve subpath into one spurious 4-point bezier, since the real watermark glyphs interleave line and curve ops within a single subpath (also confirmed directly against the corpus file). `coverage.py`'s redraw now walks each subpath independently, closes each one on its own rather than only the drawing's last, and propagates the source's `even_odd` fill-rule bit so a hole renders as a hole rather than a solid overfill.

**Corrected coverage, re-running `run_corpus.py`:**

| plan_id | coverage before | coverage after | routes_to before | routes_to after |
|---|---|---|---|---|
| `Matterport Sample_BW` | 93.56% | **100.0%** | track_r | **track_v** |
| `15x30-ft-Best-House-Plan-Model` | 99.83% | 100.0% | track_v | track_v |
| `20x45-Model` | 100.0% | 100.0% | track_v | track_v |
| `30x50-Model-landscape` | 99.87% | 100.0% | track_v | track_v |

No regression on the three already-vector plans; all three genuine vector plans and Matterport now score exactly 100%. Full sweep in `extraction/trackv/out/coverage_results.json`.

**Registry ruling this unblocks (Dan's call, `eval/` untouched here):** Matterport's routing recorded in this report's milestone-1 section as "track_v, pending subpath-flattening fix" should now read plain **`track_v`** — the fix has landed and cleared the bar outright (100%, not just the 96.77% watermark-excluded estimate). This is the durable source for that registry edit, same discipline as the `7f53273` ruling.

**Regression test:** `extraction/trackv/tests/test_compound_paths.py`, two fixtures — a pure-line rect-with-hole and a glyph-like hole mixing line/curve segments (matching Matterport's real op profile). Both assert the dissected primitive keeps 2 distinct subpaths and round-trips at ≥98% coverage under the new code. Checked directly against the pre-fix code (pulled from `HEAD`, run standalone, not committed): the pure-line fixture still fills fully under old flattening — a self-intersecting overfill happens not to reduce the coverage ratio, so it isn't a discriminator by itself — but the mixed line/curve fixture drops to **44.63% coverage, routes_to=track_r** under old code. That's the fixture that actually proves subpath preservation is what fixed this, not just green tests.

**Commits on `phase-2-trackv-m2`:** `64fc5d2` (core fix), `f7b0891` (adapt existing dilation-offset fixture to the new field), `5de6d40` (new compound-path regression test), `269ce00` (re-run corpus sweep). **Merge approved by Dan.**

**Design note carried into milestone 2, step 2 (stroke-width clustering → parallel-pair centerline+thickness recovery, fresh session, own plan + STOP):** consumers now see `subpaths: list[list[Segment]]` with mixed `"l"`/`"c"` ops and a fill-rule bit, not a flat point list. Clustering and centerline recovery need to handle curve segments and multi-contour paths (the wall-with-courtyard case) from the start — design for this representation, don't assume polylines. This is the seam step 2 is most likely to trip on.

## Milestone 2, step 2 — stroke-width clustering: does it separate walls from noise?

Branch `phase-2-trackv-m2b` (worktree `fp-phase2`, rebased on `main` @ `d5ad7c3`, i.e. directly on top of step 1 — no drift). Scope was stroke-width clustering only, tested against the corpus's four track_v plans (15x30, 20x45, 30x50, Matterport). **Explicitly not built this step, per instruction:** centerline recovery, parallel-pair matching, medial-axis thickness recovery, any schema/`ExtractionResult` output. This step's deliverable is an intermediate — clustered stroke primitives + width statistics — not walls.

**Built:** `extraction/trackv/stroke_clusters.py` (`extract_stroke_population` — splits a dissection into the stroke-width population vs. filled-no-stroke residue; `cluster_widths` — the clustering algorithm) + `extraction/trackv/run_stroke_clustering.py` (corpus sweep, writes `extraction/trackv/out/stroke_cluster_results.json` + gitignored per-plan histogram PNGs under `extraction/trackv/out/stroke_hist/`) + `extraction/trackv/tests/test_stroke_clusters.py` (19 tests, all passing).

### Method, and why it isn't variance-based

The obvious first instinct — pick k via variance reduction (elbow/GVF, or plain k-means with a BIC-style stopping rule) — was tried and rejected: variance-reduction criteria *always* find a large apparent improvement from k=1→2 even on genuinely unimodal continuous data, because an optimally-placed 2-way split of a single Gaussian still "explains" a large fraction of its variance by construction (this is a known property of 1D k-means/Jenks, not a bug in the implementation). That directly fails the required "single population must not over-split" behavior, empirically confirmed by testing it before discarding it.

What's implemented instead: kernel density estimation over the raw width population, with a **peak/valley-ratio modality test** — a candidate split (a valley between two density peaks) is accepted only if the valley's density is small (≤ 60%, `valley_ratio=0.6`) relative to the smaller of its two flanking peaks. This tests for an actual low-density gap, not merely "does splitting reduce variance", which is the correct question for "is this really two populations." Bandwidth uses an IQR-based robust scale estimate (falling back to std, then to range/6) specifically because the real data's dominant behavior is one exact-repeated literal float value shared by the vast majority of primitives (see below) — a plain std-based bandwidth would be dragged around by whichever tail is currently present. A minimum cluster size (4) discards single/double-point tail artifacts that a KDE will still occasionally split off from a large, tightly-concentrated unimodal sample (found empirically: n≥300, std=0.05 draws produced spurious 2-3 point splits before this safeguard).

**Unit tests** (`test_stroke_clusters.py`): a clean two-mode Gaussian population (means 2 units apart, std 0.05) splits into exactly 2 clusters with no overlap; single-population Gaussians across n ∈ {30,100,300,1000} × std ∈ {0.05,0.1,0.2} (12 combinations, fixed seeds) all stay at exactly 1 cluster; the degenerate-but-real corpus shapes (one dominant repeated value + far outliers; exactly 2 distinct pens; exactly 3 distinct pens) all cluster as expected; `extract_stroke_population` correctly separates a filled-only primitive (no stroke width) from a stroked one on a synthetic 2-primitive fixture.

### Per-plan cluster structure (`extraction/trackv/out/stroke_cluster_results.json`)

| plan | stroked prims | clusters | dominant cluster | dominant cluster's diagonal-segment fraction |
|---|---|---|---|---|
| 15x30 | 20,741 | 2: `{0.0: n=4}`, `{0.72: n=20,737}` | 0.72, **99.98%** of stroked prims | **78.5%** |
| 20x45 | 251 | 3: `{0.0: n=43}`, `{0.48: n=26}`, `{0.72: n=182}` | 0.72, 72.5% of stroked prims | 9.3% |
| 30x50 | 33,117 | 2: `{0.0: n=4,227}`, `{0.72: n=28,890}` | 0.72, 87.2% of stroked prims | **78.5%** |
| Matterport | 526 (of 682 total; 156 are filled-no-stroke) | 5, see below | 0.654–0.758, 94.7% of stroked prims | 29.2% |

**A dominant cluster does emerge in every plan** — that half of the paper's §3.7 hypothesis holds. What does *not* hold, on two of the four plans, is the other half: that the dominant cluster is separable from hatching.

### The hatching finding (direct answer to the "does it share the wall cluster" question)

Diagonal-segment fraction was computed per cluster (angle mod 180°, axis-aligned = within 20° of 0°/90°) as a hatch-likelihood proxy independent of the clustering itself. **On 15x30 and 30x50, the single dominant stroke-width cluster is 78.5% diagonal-angled segments.** That is not "hatching sits mostly in one cluster with a wall minority" — it is hatching and wall-boundary-like geometry sharing the *exact same literal pen width* (`0.72`pt), because whatever CAD/generator produced these two PDFs draws essentially everything — walls, hatch fill, dimension extensions, furniture — at one global stroke width. Stroke-width clustering, run alone, cannot separate a wall edge from a hatch tick on these two plans: they land in the same bucket by construction, not by algorithm failure. This falsifies the paper's §3.7/§5.2 prefilter claim ("wall strokes form the dominant cluster separable from hatching") for this corpus's two densest hatched plans specifically.

30x50's secondary cluster (`0.0`/hairline, n=4,227, 12.8% of stroked prims) is *not* clean signal either: it's 27% diagonal (some hatch bleeds in here too), every one of its primitives is `fill_and_stroke` (not stroke-only), and its median segment length is 0.84pt — these read as short filled dash/tick marks, a different hatch-rendering style co-existing with the diagonal-line hatch in the dominant cluster, not a wall-relevant group.

**20x45 behaves differently** — its three clusters are 96.7%/78.3%/90.6% axis-aligned respectively (diagonal fractions 9–22%), i.e. comparatively little hatch content bleeding into any width bucket, and the 0.72 cluster's segments have a plausible wall-like median length (24.8pt) — this plan is not densely hatch-vector-drawn the way the other two are, and its width buckets look closer to the paper's assumed separable structure. This is real plan-to-plan variability within a single `convention_class=hatched` label, not noise: **hatched-convention plans are not one uniform structure**, and the ratio of hatch ink to wall ink at the vector-primitive level swings from ~9% diagonal content (20x45) to ~78% (15x30, 30x50).

### Filled-no-stroke fraction (deferred to the later medial-axis path)

Only Matterport has any filled-primitive-with-no-stroke content: 156 of 682 primitives (**22.9% by count**). 15x30, 20x45, and 30x50 have zero — every primitive in those three plans carries a numeric stroke width, so nothing is deferred there; whatever their walls are, they're stroke-drawn (double-line or hatch-boundary convention), not solid poché fills, consistent with their `convention_class=hatched` registry label. Matterport's `convention_class=poche`, and this is exactly where that shows up: its true wall geometry very likely lives entirely in this filled-no-stroke bucket (poché fill, no border stroke), which by definition carries no width signal and cannot be clustered — only a medial-axis pass on the fill geometry itself will recover wall thickness there.

**The area-based version of this fraction is unreliable and should not be quoted:** computed at 2.9% (vs. 22.9% by count) because one single `fill_and_stroke` primitive — almost certainly a full-page background/floor silhouette — covers ~44% of the page area on its own (2.6M of 5.9M sq-pt) and swamps the area denominator. This is flagged, not corrected: distinguishing "real wall ink" from "an unrelated background plate" is a semantic judgment call outside this step's scope (that's residue classification, §5.2 item 3). The **count-based** 22.9% is the trustworthy number here.

### Verdict: is clustering alone a viable wall-stroke selector?

**No, not on its own, on this corpus.** On 15x30 and 30x50 — the two plans with the heaviest genuinely-vector-drawn hatching — the dominant stroke-width cluster is a majority-diagonal (hatch-dominated) mix, not a wall-selective one; picking "the biggest cluster" would hand the next step a pile that's mostly hatching. On Matterport, the width population barely contains the walls at all (they're filled, not stroked), so clustering the stroke population misses the wall question entirely regardless of how well it clusters. Only 20x45, the smallest and least hatch-dense of the four, produces clusters where the dominant one is plausibly wall-associated by itself.

This means the geometric pairing/medial-axis step (originally staged as step 3, refining step 2's output) is not a refinement on top of a mostly-working width selector — it is **load-bearing**: the axis-alignment signal (which this step computed only as a diagnostic, not as a selector) is doing more of the real separating work than width is, on the two plans that most stress-test the hypothesis. Concretely, whatever step 3 becomes should treat width clustering as a candidate-generation/prefilter aid at best (e.g., restrict to the dominant width cluster(s) before geometric pairing, to cut the search space), not as the primary wall/non-wall decision — that decision needs geometry (parallel-offset pairing, axis-alignment, run-length/collinearity), consistent with what the diagonal-fraction diagnostic already surfaced here for free.

### Reproduce

`py -m extraction.trackv.run_stroke_clustering` from repo root (writes `extraction/trackv/out/stroke_cluster_results.json`, prints the same to stdout; histograms need `matplotlib`, gitignored, not required for the JSON). `py -m pytest extraction/trackv/tests/test_stroke_clusters.py -q` for the unit tests.

### Explicitly not done this step

Wall-face pairing, parallel-segment offset detection, centerline recovery, filled-polygon medial-axis thickness recovery, any semantic wall/non-wall decision, any schema or `ExtractionResult` output, any modification to `eval/`, `extraction/schema/`, `extraction/synth/`, or `legacy/`.

## Milestone 2, step 3a — axis-aligned selection + parallel-pair recovery + minimal assembly (15x30, 30x50)

Branch `phase-2-trackv-m2c` (worktree `fp-phase2`, forked from `main` @ `6af44a1`, the step-2 merge). Scope per Dan's approved step-3 proposal, 3a only: axis-alignment selection (item 1), parallel-pair centerline+thickness recovery with a thickness-plausibility guard and collinear-merge-across-opening-gaps (item 2, both guards required by the approval), minimal wall-only assembly into a schema-valid `ExtractionResult` (item 4), targeting 15x30 and 30x50 — the two plans where step 2 found the width selector fails. 3b (20x45, frozen-parameter generalization check) and 3c (Matterport medial-axis) are explicitly not started.

**Built:** `extraction/trackv/select.py`, `extraction/trackv/pair.py`, `extraction/trackv/assemble.py`, `extraction/trackv/run_step3a.py` (corpus runner + per-stage funnel report), 13 new tests (`tests/test_select.py`, `tests/test_pair.py`, `tests/test_assemble.py`, all passing, 38/38 in the package overall). Outputs: `extraction/trackv/out/step3a_predictions/*.json`, `extraction/trackv/out/step3a_report.json`.

### Result against the approved STOP criterion

**Schema validity: achieved for both plans.** `extraction/schema/validate.py`'s `validity()` returns zero errors on both 15x30 and 30x50's predictions, confirmed both by this module's own call and independently by `eval.cli run` against the real GT files. **Wall F1: not measurable this step** — not a pairing defect, a newly-discovered cross-phase architecture gap (below). Per-stage attribution (item 3) is wired and was directly useful for finding and localizing every bug below during the build, not just as a report artifact.

### Reading validate.py closely changed the scope of assemble.py, for the better

Before writing assembly code, re-read `validate.py`'s actual checks rather than assuming: `cycles_closed`, `zones_within_room`, and `ids_resolve`'s room-facing half all iterate `plan.get("rooms", [])`. An **empty** `rooms` list is schema-valid by construction — none of those checks fire. Combined with the approved scope's own "wall-only output" framing, this means full planar-face-tracing into closed room cycles is not required for this step's schema-validity deliverable at all. `assemble.py` still performs real junction assembly (endpoint-snap into a graph) and still runs `networkx.cycle_basis` to produce open-cycle diagnostics (dangling wall-end localization, per the approved scope's item 4), but emits `rooms: []` in the schema payload itself — a smaller, more honest deliverable than originally scoped, found by reading the frozen validator instead of assuming what it required.

One consequence: opening candidates from `pair.py`'s collinear-merge are **not** serialized as schema `Opening` objects. `OpeningClass` has no "unclassified" value (`door`/`window`/`passage` only) and step 3a does not classify. They drive the merge internally (keeping wall recall through a gap) and appear in the funnel report's `n_opening_candidates`, never in `Wall.openings`.

### Four real bugs found and fixed by testing against the real corpus, not assumed away

Every one of these was found by running against 15x30/30x50 directly and checking numbers against the real GT, per this project's own standing discipline — none was caught by unit tests alone first.

1. **Dominant-axis selection locked onto the hatch angle, not the wall angle.** A first-cut length-weighted global argmax for the folded mod-90 orientation histogram (`select.py`'s `_dominant_axis`) picks whichever orientation carries the most *aggregate stroke length* — and on 15x30/30x50, dense diagonal hatching outweighs wall strokes in total length (15x30: ~164k length-units at the hatch angle vs. ~15k near 0°). A raw argmax silently inverts the whole selector: it keeps hatch, rejects walls, with no error signal. Fixed by picking the local peak *closest to 0* in the folded circular domain instead of the global max — encodes the real drafting convention that hatch is drawn off-axis (conventionally ~45°) specifically to read as distinct from axis-aligned structure, and still generalizes to an actually-rotated plan (verified by a synthetic 15°-rotation unit test) as long as the rotation is under ~45° from the hatch offset, true of any real building. Confirmed against real data: theta now lands at 0.5° on all three hatched plans (previously 44.5–45.5° on 15x30/30x50).
2. **The axis-aligned candidate population is dominated by sub-percent-of-diagonal noise.** 90th-percentile candidate segment length is under 0.34% of plan diagonal on both 15x30 and 30x50 (only the top few percent run tens to hundreds of units — plausible wall-face length). Without a length floor, pairing produced thousands of spurious sub-unit "walls." Fixed with a length floor in `pair.py`, self-calibrated at 1% of plan diagonal (not a hardcoded absolute unit).
3. **Greedy pairing's own sort order preferred degenerate near-duplicate pairs over real wall pairs.** Sorting accepted pairs by (longest overlap, thinnest thickness) actively *prefers* two near-coincident candidate lines — offset by float/rendering noise well under one pen width, ~100% overlap, near-zero thickness — over genuine wall-face pairs (offset by a real multi-point wall thickness), because the degenerate pairs score better on both criteria. This let greedy matching consume real wall-face candidate segments into spurious zero-thickness pairs before the true pairs were ever considered. Fixed with a hard floor: paired thickness must exceed the pair's own average pen (stroke) width, or it's not a wall, it's the same line effectively twice.
4. **Junction points and wall endpoints ended up in different coordinate frames.** `assemble.py`'s graph was built from *native* (pre-GT-scale) snapped endpoints while `AssembledWall.start/end` were emitted in the GT-scaled frame — every wall failed `junctions_consistent` (wall doesn't terminate at its own junction point) as a result. Fixed by scaling before building the graph, not after, so both live in one frame. Caught immediately by `validate.py` returning 100+ errors on the first real run; the fix is a two-line reorder.

A fifth, structural (not code) finding: **thickness-plausibility clustering absorbs a lone outlier instead of excluding it, at small sample sizes.** A single implausible-thickness pair mixed into a small (~8-pair) clean population doesn't reliably split out via the reused KDE valley test — it gets absorbed into the main cluster, diluting the cluster's mean below the outlier ceiling instead of being excluded. Confirmed directly (`tests/test_pair.py`'s first version of `test_thickness_outlier_pair_is_rejected` failed this way before being rewritten to test what the guard reliably does: reject a cluster whose *own* mean is implausible). Real corpus populations are far larger (hundreds of accepted pairs) so this specific small-n failure mode is less likely to dominate there, but it is a genuine precision gap in the guard, not fixed this step (the clustering machinery is step 2's reviewed logic, out of this step's scope to modify) — flagged for whoever revisits precision here.

### The blocking finding: Track V predictions and this corpus's GT are not in the same coordinate frame, and nothing in the frozen eval pipeline aligns them

Discovered while diagnosing wall F1 = 0.0 at every τ on both plans, despite schema validity passing cleanly. Traced directly, not assumed:

- `docs/paper.md` (§"Two coordinate frames, one transform"): all geometry is stored in "a canonical plan frame (millimeters if scale was recovered, otherwise normalized units)". Track V step 3a does no scale recovery (explicitly Phase 5's job) — predictions are emitted in `units.system="plan_units"`, i.e. an uncalibrated native-PDF-point-derived frame.
- This corpus's GT files, however, **are in real-world millimeters**, confirmed directly: 15x30's GT wall bounding box spans 4430 x 9018 (mm), matching the plan's nominal 15ft x 30ft footprint (4572 x 9144mm) within 3%; 20x45's GT bbox (6002 x 13626) matches 20ft x 45ft (6096 x 13716mm) within 1.5%. This is consistent with the registry's own confidence notes for this GT (`gt_status=provisional_unaudited`, "not individually spot-checked, inferred from filename family match") — reads as the GT author assigning millimeter coordinates from the plan's advertised nominal footprint, not a calibrated measurement.
- An early hypothesis — that GT lived in a "long edge scaled to 1600px" raster-pixel frame, inferred from `image_transform.source_px` values that are consistent (1131x1600 or 1600x1131/1132) across all four track_v plans — was tested directly against actual GT wall coordinates and **falsified**: GT wall y-extents run past 11000 while the hypothesized frame's height is 1600. `source_px` in this corpus's GT does not describe the frame the wall coordinates actually live in.
- `eval/metrics/matching.py` performs **no scale or alignment step**: `centerline_cost`/`_sym_mean_dist` are raw absolute Euclidean distances, and `tau = tau_frac * plan_diagonal(gt_walls)` is an absolute distance threshold derived from GT's own (millimeter-scale) bounding box. Confirmed directly against the real prediction: 15x30's predicted wall bbox diagonal is ~1273 (native-point-derived plan units) against GT's ~10047 (mm) — roughly 8x apart in scale, with a different origin too. No number of correctly-recovered wall shapes could score above 0 under this mismatch; it is not fixable inside Track V without either (a) real scale recovery, which is out of Phase 2's declared scope, or (b) fitting a transform to GT at prediction time, which would make F1 meaningless (scoring against the exact labels used to align the prediction).

**This is flagged for Dan's ruling, same discipline as the milestone-1 registry-disagreement flags — not patched around.** Phase 2's own exit bar (`docs/extraction-plan.md`: "wall F1 ≥ 0.99 @ τ=0.5%") appears to presuppose a coordinate frame Phase 2 itself has no mechanism to produce, on this specific (provisional, mm-scaled) GT convention. Options for Dan to choose between, none applied here: (i) score Track V's own milestones against a scale-normalized metric (e.g. Hausdorff-style shape comparison after independently normalizing both pred and GT by their own bounding-box diagonal) rather than absolute-distance matching, which would require a change to the frozen `eval/metrics/matching.py`; (ii) treat Phase 2's F1 exit bar as only measurable after Phase 5's scale recovery lands, i.e. re-score Track V's wall geometry post-fusion rather than in isolation; (iii) re-author this corpus's provisional GT in a frame Track V's own native output can reach without scale recovery (e.g. native PDF points) for the plans where GT was assigned by convention rather than measured. Not decided here.

### Recall/validity picture the funnel report surfaces (per-stage attribution working as intended)

Even setting the coordinate-frame question aside, the funnel numbers show real, honestly-reportable recall/precision problems, exactly the kind item 3's per-stage attribution exists to localize:

| plan | select candidates | pair: accepted | pair: final walls (post-merge) | assemble: junctions | assemble: cycles closed | assemble: dangling wall-ends |
|---|---|---|---|---|---|---|
| 15x30 | 4132 (of 20487 lines) | 120 | 72 | 128 | **0** | 125 (of 144 wall-endpoints) |
| 30x50 | 22513 (of 51527 lines) | 191 | 118 | 207 | **0** | 197 (of 236 wall-endpoints) |

GT wall counts are 10 (15x30) and 19 (30x50) — predicted wall counts (72, 118) are roughly 6-7x over, and **zero room cycles close on either plan** (`n_cycle_basis_found=0`), with the large majority of walls having at least one unresolved (dangling) end. This localizes cleanly to the `pair` stage per the funnel: `select`'s candidate count is plausible (axis-alignment is doing its job — 15x30's 78.5%-diagonal dominant cluster is down to 20.1% axis-aligned as expected), but pairing is not selective enough among those candidates to isolate the small number of true wall-face pairs, consistent with the small-n outlier-absorption finding above. This is the real precision/recall picture step 3a leaves behind for whoever picks up next, independent of the coordinate-frame blocker.

### Explicitly not done this step

3b (20x45 generalization under frozen parameters), 3c (Matterport medial-axis), any opening classification, any room/cycle closure in the schema payload, any scale/units recovery, any modification to `eval/`, `extraction/schema/`, `extraction/synth/`, or `legacy/`.

### Disposition

Held for Dan's review per the STOP discipline. Durable artifacts: this report section, `extraction/trackv/{select,pair,assemble,run_step3a}.py` + tests, `extraction/trackv/out/step3a_predictions/*.json`, `extraction/trackv/out/step3a_report.json`. Not merged to main. The coordinate-frame finding above blocks a meaningful F1 number regardless of further pairing-precision work, so it is the highest-priority open question before continuing to 3b/3c.

## Step 3a review follow-up — scoring adapter, over-production diagnosis, debt log

3a reviewed; schema-valid output + per-stage attribution accepted as meeting the STOP criterion. Committed to `phase-2-trackv-m2c` (`28bfe56`). This section covers Dan's three follow-up instructions: build a scoring-only coordinate adapter (outside `eval/`), diagnose the over-production/zero-closure finding as one problem or two, and log the axis-selector's Manhattan-bias debt honestly. No pipeline fix is built this round — directional read only, per instruction.

### Scoring adapter (`extraction/trackv/score_align.py`)

One global similarity transform (scale + rotation + translation; no affine/shear/per-wall correction), fit in two stages, applied to a copy of the prediction, then scored by frozen `eval/metrics` unmodified:

1. **Coarse seed** from the single longest pred/GT wall pair — the longest wall in a floor plan is robustly a real, unbroken exterior run, unlike a raw bounding-box ratio, which this step's own ~7x wall over-production directly inflates and corrupts (confirmed: an early bbox-ratio-based estimate would have been off by roughly the over-production factor).
2. **One refine pass**: apply the coarse transform, find orientation-compatible (within 15°) and length-plausible (within 3x) nearest-centroid matches within a generous radius, then recompute scale (median), rotation (circular median of signed deltas), and translation (median) from that whole coarse-matched population — not the single seed pair.

**Two real bugs found and fixed while building this, same discipline as 3a itself — checked against real data, not assumed correct:**

1. **Pure midpoint-distance coarse matching picked wrong correspondences.** With ~7x more predicted walls than GT walls, a short spurious wall sitting near a real GT wall's midpoint out-competed the correct match. First attempt recovered a 89° rotation on an unrotated plan and a scale spread from 4x to 144x across "matched" pairs — obviously wrong, caught by comparing against select.py's own independently-measured theta (~0.5°) rather than trusted at face value. Fixed by requiring orientation and length-ratio compatibility before a candidate pair is even considered, not distance alone.
2. **Sign bug in the circular-mean rotation refinement.** `_circular_mean_deg_180` is used on small *signed* deltas (e.g. -2°) but ended with a plain `% 180.0` — Python's `%` always returns a result with the divisor's sign, so a legitimate -2° delta silently became +178°. This alone explained a second-round rotation result of ~179°/178° on both plans (should be ~0°). Fixed to wrap into (-90°, 90°] instead; regression test added (`test_score_align.py::test_small_negative_rotation_delta_does_not_wrap_to_near_180`).

### Directional read (15x30, 30x50)

| plan | recovered scale | scale consistency (rel. stdev / min–max over coarse matches) | recovered rotation | n coarse matches | matched @ τ=2% | wall F1 @ τ=2% | mean endpoint error @ τ=2% | wall-mask IoU |
|---|---|---|---|---|---|---|---|---|
| 15x30 | 11.74 | 0.354 / 8.49–22.73 | -0.41° | 10 | 2 of 10 GT | 0.049 | 449 (≈4.5% of GT diagonal) | 0.069 |
| 30x50 | 8.69 | 0.258 / 6.45–10.94 | -1.65° | 2 | 0 of 19 GT | 0.0 | n/a | 0.020 |

Both recovered rotations land near 0°, consistent with select.py's own independently-measured theta (~0.5° on both plans) — a real cross-check the two bugs above were caught against, not just plausible-looking output. Recovered scale magnitude is the same order on both plans (~9–12), a mild positive signal, but **only 10 and 2 coarse matches respectively fed the refine step** — thin evidence, and 30x50 in particular is only weakly constrained (2 points barely determine 4 similarity parameters). At τ=0.5%/1% neither plan matches anything; only the loosest τ=2% band produces any matches at all, and only on 15x30. This is a directional read, explicitly not a precision metric, exactly as scoped.

**τ confirmation:** `matching.py`'s `tau = tau_frac * plan_diagonal(gt_walls)` is fractional-of-diagonal, matching `docs/paper.md` Appendix C's pseudocode (`def match_walls(pred, gt, tau): # tau in plan-diagonal fraction`) exactly, including the `overlap_ratio > 0.8` co-requirement in `centerline_cost`. **No spec deviation found here** — the coordinate-frame gap is a real gap regardless.

**Phase-0 amendment filed:** [github.com/DanMalachi/floorplan-3d/issues/8](https://github.com/DanMalachi/floorplan-3d/issues/8), same discipline as issues #5/#6/#7 — proposes the harness needs a frame-normalization convention for pre-scale geometry; `score_align.py` is explicitly interim, meant to be superseded in `eval/`, not extended.

### Over-production + zero-closure: one problem, and which branch

**Wall-count over-production is confirmed real** (72 pred vs. 10 GT on 15x30, 118 vs. 19 on 30x50) and **zero room cycles close on either plan** (`n_cycle_basis_found=0`, ~87% of predicted walls carry a dangling end on both). Categorized the spurious population (`extraction/trackv/analyze_step3a_walls.py`, re-derives provenance from the live select/pair objects, not the scaled schema output which loses it):

| plan | near-duplicate remnant | dimension-line-shaped (guard-absorbed) | unclassified (see below) |
|---|---|---|---|
| 15x30 (n=72) | 19 (26%) | 13 (18%) | 40 (56%) |
| 30x50 (n=118) | 20 (17%) | 31 (26%) | 67 (57%) |

- **Near-duplicate remnant** = paired thickness under 3x the pair's own pen width — the stroke-width floor (fixed earlier this step) requires only >1x, so a real, quantified residue sits in the 1–3x band, still spurious.
- **Dimension-line-shaped, guard-absorbed** = thickness over 3x the plan's own median final-wall thickness. This directly answers Dan's ask: **13/72 (15x30) and 31/118 (30x50) of the spurious walls are exactly the small-n thickness-outlier-absorption failure mode flagged at the end of the main 3a section** — not a separate deferral, a real, sizeable pair-stage contributor (18–26% of over-production on its own).
- **Unclassified, majority on both plans:** an attempted "hatch cluster membership" category (does the segment's parent primitive sit in a width cluster with low axis-aligned fraction?) turned out **uninformative** — checked directly, not assumed: on this corpus, genuine wall-boundary strokes and hatch share the *literal same pen width* (0.72pt, the milestone-2-step-2 finding this whole step exists to work around), so a segment's width-cluster membership cannot distinguish a real wall edge from a coincidentally axis-aligned hatch remnant; both land in the same cluster by construction. This is itself informative — it rules out a cheap categorization shortcut, not just a null result. Confirmed further: even restricted to the *surviving* (already guard-passed) population, thickness does not sub-cluster into a tight "real wall" group at all — 15x30 splits into two log-space clusters but the larger (69% of walls) still spans a 27x range (7.08–193.4); 30x50 doesn't split at all (100% in one cluster spanning 0.84–257.6). There is no thickness-based signal left to mine further within this population.

**Branch verdict: leans FILTERING, not confirmed at high confidence by matched-pair residual alone (evidence is thin), corroborated by independent evidence.** Reasoning:
- select.py's axis-alignment step is doing its intended, verified job (candidate axis-aligned fraction drops from 78.5%→20% diagonal on the dominant cluster, matching design) — selection is narrowing correctly, not the source of the explosion.
- When pairing does land on a real wall-face pair, the underlying geometry is analytically clean by construction (float-precision offset math, no measurement noise) — individually inspected examples earlier in this step (thickness ~78–85, plausible lengths, sane positions) support this directly.
- The adapter's own matched-pair evidence is consistent with, but does not strongly confirm, "low residual": 15x30 gets 2/10 GT matches only at the loosest τ with ~4.5%-of-diagonal endpoint error (not tight, not catastrophic either); 30x50 gets zero matches at any τ, but off only 2 coarse-matched points feeding a weakly-constrained refine, not a strong negative signal either.
- Zero cycle closure is a mechanical, expected consequence of ~6–7x too many candidate walls scattered among the real ones — sufficient on its own to explain the closure failure without positing broken centerline/thickness math.

**If hatch dominates the remainder (plausible per the "unclassified" finding, not confirmed further this round): fix direction is a periodicity/texture discriminator, not threshold tuning**, per `docs/paper.md`'s own §5.6 Layer 2 spec: "stroke-texture check (hatching and stair treads are periodic — a 1-D FFT along the candidate flags periodicity)." Proposed only, not built this session: for each candidate segment surviving axis-alignment, sample stroke-population density along its own local neighborhood (perpendicular to its run) and flag periodic spacing consistent with a hatch field, as an additional Layer-2 prior in `pair.py` ahead of (or alongside) the existing thickness-plausibility guard. Left for a future session's own plan + STOP, not built here.

### Debt logged — axis-selector Manhattan-bias regression

The "prefer the local peak closest to 0" fix (main 3a section, item 1's second bug) reintroduces a 0°-Manhattan bias and **regresses the non-Manhattan-safe goal** (`docs/paper.md` §5.4). Confirmed directly, not assumed: at rotation ≤15° combined with dominant hatch, the heuristic still recovers the correct wall axis; at rotation 30°, it locks onto ~74.5° instead of the true ~30° — the hatch peak (rotation+45°, folded mod-90) lands *closer* to 0 than the true wall peak once rotation is large enough, and "closest to zero" picks the wrong one.

Logged honestly rather than left as a silent gap: `extraction/trackv/tests/test_select.py::test_rotated_wall_grid_with_dominant_hatch_is_not_reliably_recovered`, marked `xfail(strict=True)` with the reasoning above written into the test itself — if a future fix accidentally makes this pass, the suite will flag it (strict xfail fails on unexpected success) rather than silently losing the debt marker. Acceptable interim **only** because this corpus is measurably unrotated (theta ≈ 0.5° on all three hatched plans). Principled fix, noted for Phase 7 hardening, not built here: weight the axis vote by parallel-pair support (does a candidate at this orientation actually find a consistent-offset partner?) rather than by raw proximity to zero — real walls pair up; coincidentally-aligned hatch mostly doesn't, which is a stronger and rotation-agnostic signal than orientation proximity alone.

### Explicitly not built this round

Any fix to over-production (periodicity discriminator proposed, not built), any change to `eval/`, any scale-recovery machinery, any forced cycle closure in `assemble.py`, 3b, 3c.

### Disposition

Held for Dan's review. Durable artifacts added: `extraction/trackv/score_align.py` + `tests/test_score_align.py`, `extraction/trackv/run_score_align.py` + `out/step3a_aligned_score.json`, `extraction/trackv/analyze_step3a_walls.py`, the xfail debt test, this section, GitHub issue #8. Not merged to main. Merge decision waits on this read per Dan's instruction.

## Step 3a second diagnostic STOP — hand-pinned recall analysis

**Reframe accepted and confirmed:** over-production explains zero cycle closure and low precision, but does **not** explain low recall (15x30: 2/10 GT matched; 30x50: 0/19 GT matched under the automatic adapter) -- a sound wall matches its GT counterpart under Hungarian assignment regardless of how much unrelated junk surrounds it. `score_align.py`'s automatic refine pools over *all* coarse-matched candidates, so a scale/rotation error there is itself a confound indistinguishable from a real recall problem. This section resolves it by fitting the transform from a small number of hand-identified, visually verified anchors only, frozen (no pooled refine), then diagnosing every individual GT wall against that frozen transform. Nothing built beyond the diagnostic; `eval/` untouched.

### Step 1 — hand-pinned transform

Visual verification via `extraction/trackv/plot_pin_check.py` (`out/pin_check_*.png`, both plans' predicted and GT walls plotted with each side's top-3-longest highlighted) plus the raw longest-wall coordinate dump, inspected directly before picking any anchor -- not assumed from IDs or lengths alone.

**15x30** — only one confidently-verifiable anchor emerged. `W42` (native, len 1062.8) is the only one of the pred's top-3-longest walls that sits at a bounding-box *edge*; the plot shows the other two top-3 walls (`W9`, `W12`) sitting in the middle of a dense hatch tangle, not at any perimeter -- not used. `W42`'s two endpoints pin the left wall's top-left and bottom-left corners (`w_s7`↔`w_s2`/`w_s6` junctions). A second anchor, `W43` (the only wall found anywhere near the pred bbox's right edge, len 504.8, covering only the lower ~45% of the expected right-wall height per a direct fragment search), pins a probable bottom-right corner -- flagged as the weaker of the two anchors going in, since it's a partial fragment, not a clean corner-to-corner wall.

**30x50** — three confident anchors, all visually unmistakable in the plot (three long red lines at top, left, and bottom of the pred cluster, matching the same three sides in GT): `W13`↔`w_s102` (top), `W36`↔`w_s111` (left), `W19`↔`w_s110` (bottom). One real bug caught while building this: the first fit attempt for the left-wall correspondence swapped top/bottom endpoint order (`W36.end`, the wall's *bottom* point by native y, was paired against GT's *top* point) -- caught because it produced a wildly inconsistent fit (anchor residuals up to 6440mm on a ~12800mm-diagonal plan) before being traced to the ordering bug and fixed; residuals dropped to the 93–1777mm range reported below once corrected.

| plan | pinned scale | pinned rotation | anchor fit residuals (mm) | nominal footprint (mm) | GT's own bbox (mm) | pinned-transform-implied pred envelope (mm) |
|---|---|---|---|---|---|---|
| 15x30 | 8.285 | 1.31° | 155.7, 314.6, 278.9 | 4572 × 9144 | 4429.6 × 9018.0 | 4949.5 × 9311.4 |
| 30x50 | 9.707 | 2.35° | 117.2, 1557.1, 93.0, 485.9, 430.6, 1777.5 | 9144 × 15240 | 12796.2 × 7120.5 | 11485.2 × 6865.2 |

**Scale cross-check against nominal size:** 15x30 agrees reasonably (implied envelope within 8.3%/1.8% of nominal 15ft×30ft) -- a positive signal that this plan's pinning is in the right ballpark. **30x50 disagrees substantially** (implied envelope off by 20–55% from nominal 30ft×50ft, and the aspect ratio itself doesn't match) -- but this traces to GT's *own* geometry, not the pinning: the implied envelope (11485×6865) is close to GT's own measured bounding box (12796×7121, within 10%/4%), and it was already known from this step's first diagnostic pass that 30x50's provisional, unaudited GT does not follow the simple nominal-name-to-mm convention 15x30/20x45 do. Reported as instructed, not smoothed over: the disagreement is real, but it's a pre-existing GT-labeling-convention issue, not new evidence against the pinning itself.

30x50's two large anchor residuals (1557.1, 1777.5mm) both belong to the *right-side* endpoints of the top and bottom wall anchors — traced directly: GT's building outline has a step/notch on the right side (visible in `pin_check_30x50-...png` and in the registry data itself: `w_s104`/`w_s106` form a separate shorter return wall there), so the top wall's right endpoint and the bottom wall's right endpoint are *not* the same physical corner, unlike the left side where both anchors agree tightly (93.0, 117.2, 430.6, 485.9mm). Not a pinning error -- an accurate reflection of a non-rectangular footprint that a 3-anchor simple-rectangle assumption only partially captures.

### Step 2 — per-GT-wall verdict (the branch call)

Every GT wall scored against *every* predicted wall (not just Hungarian-matched ones) under the frozen pinned transform, using `matching.py`'s own `_sym_mean_dist`/`_overlap_ratio` primitives directly (imported, not reimplemented, so the diagnostic can't silently drift from the real metric). Classification: **MATCHED** (residual < τ, overlap > 0.8) / **MISPLACED** (residual ≥ τ but < 3τ) / **FRAGMENTED** (residual < τ, overlap ≤ 0.8) / **ABSENT** (residual ≥ 3τ, i.e. no plausible candidate anywhere nearby). τ = 1% of GT diagonal throughout this section.

**15x30** (`extraction/trackv/out/step3a_pinned_diagnostic.json`):

| GT wall | length (mm) | verdict | best pred | residual (mm) | residual/τ | overlap |
|---|---|---|---|---|---|---|
| w_s2 | 4429.6 | ABSENT | W20 | 860.3 | 8.56 | 0.238 |
| w_s4 | 9017.7 | ABSENT | W43 | 947.4 | 9.43 | 0.464 |
| w_s6 | 4341.0 | ABSENT | W70 | 822.4 | 8.19 | 0.002 |
| w_s7 | 9018.3 | MISPLACED | W42 | 148.7 | 1.48 | 0.976 |
| w_s21 | 2039.5 | **MATCHED** | W44 | 89.3 | 0.89 | 0.885 |
| w_s23 | 1271.3 | MISPLACED | W31 | 166.6 | 1.66 | 0.235 |
| w_s25 | 907.8 | ABSENT | W25 | 328.4 | 3.27 | 0.023 |
| w_s29 | 3141.2 | MISPLACED | W19 | 224.9 | 2.24 | 0.364 |
| w_s32 | 3140.2 | **MATCHED** | W16 | 68.2 | 0.68 | 0.900 |
| w_s35 | 4341.1 | ABSENT | W17 | 626.6 | 6.24 | 0.553 |

Counts: MATCHED 2, MISPLACED 3, FRAGMENTED 0, ABSENT 5.

**30x50:**

| GT wall | length (mm) | verdict | best pred | residual (mm) | residual/τ | overlap |
|---|---|---|---|---|---|---|
| w_s102 | 12796.3 | MISPLACED | W13 | 327.2 | 2.24 | 0.877 |
| w_s104 | 4493.2 | ABSENT | W41 | 1471.2 | 10.05 | 0.876 |
| w_s106 | 3363.4 | ABSENT | W104 | 1035.3 | 7.07 | 0.007 |
| w_s108 | 2601.2 | ABSENT | W40 | 1184.0 | 8.09 | 0.000 |
| w_s110 | 9380.5 | MISPLACED | W42 | 263.2 | 1.80 | 1.000 |
| w_s111 | 7094.4 | **MATCHED** | W36 | 142.6 | 0.97 | 0.936 |
| w_s117 | 2365.1 | MISPLACED | W28 | 275.0 | 1.88 | 0.523 |
| w_s119 | 1734.3 | MISPLACED | W106 | 314.6 | 2.15 | 0.010 |
| w_s121 | 2312.3 | MISPLACED | W34 | 303.6 | 2.07 | 0.589 |
| w_s124 | 630.6 | MISPLACED | W58 | 411.9 | 2.81 | 0.099 |
| w_s126 | 2312.5 | ABSENT | W73 | 604.3 | 4.13 | 0.198 |
| w_s129 | 1419.9 | ABSENT | W41 | 533.6 | 3.64 | 1.000 |
| w_s132 | 683.9 | ABSENT | W64 | 718.8 | 4.91 | 0.000 |
| w_s138 | 3048.5 | ABSENT | W37 | 863.2 | 5.90 | 0.007 |
| w_s142 | 2611.8 | ABSENT | W25 | 573.2 | 3.91 | 0.610 |
| w_s147 | 3538.5 | MISPLACED | W87 | 249.4 | 1.70 | 0.518 |
| w_s149 | 3250.2 | **FRAGMENTED** | W45 | 130.7 | 0.89 | 0.740 |
| w_s150 | 1164.9 | MISPLACED | W28 | 279.6 | 1.91 | 0.594 |
| w_s152 | 1004.0 | ABSENT | W41 | 1132.4 | 7.73 | 0.000 |

Counts: MATCHED 1, MISPLACED 8, FRAGMENTED 1, ABSENT 9.

**A necessary caveat before the verdict:** ABSENT and FRAGMENTED are not as cleanly separated by this classification as the four labels suggest. `_sym_mean_dist` samples 9 points along the *shorter* of the two walls and measures symmetric point-to-segment distance -- a severely truncated fragment (e.g. `w_s2`'s best candidate `W20`, a 127-native-unit fragment against a 4429.6mm GT wall spanning roughly 4x that after scaling) inflates this distance heavily even when the fragment's own available extent is well-aligned, because most of the *longer* wall's sampled points land far from the short fragment. Checked directly against `w_s2`/`w_s4`/`w_s6` (15x30's top/right/bottom exterior walls): a manual coordinate search (not shown in the table, in this step's working notes) found real, correctly-positioned fragments for all three -- `W20` (top, ~21% of expected width), `W43` (right, ~45% of expected height) -- that this residual-first classification reads as ABSENT rather than FRAGMENTED purely because the mismatch is too severe to pass even a 3τ residual gate. **The true fragmentation burden is very likely undercounted by the FRAGMENTED label alone; some meaningful fraction of "ABSENT" is actually "recovered, but so short the standard metric can't tell it apart from nothing."**

**Branch verdict — GEOMETRY/COVERAGE dominates on both plans, correcting the first diagnostic's "leans filtering" read.** ABSENT is the single largest category on both plans (5/10 on 15x30, 9/19 on 30x50) and MISPLACED is second (3/10, 8/19) -- together they account for 8/10 and 17/19 of all GT walls. Pure MATCHED is rare (2/10, 1/19). This is a materially different, less favorable picture than the first (automatically-refined, pollution-confounded) diagnostic suggested. Reasoning:
- The dominant failure is **coverage, not position**: for roughly half of GT's real walls on both plans, *no* predicted wall (out of 72–118 candidates) lands within even a generous 3τ of it -- select.py/pair.py's candidate generation appears to genuinely never produce a viable pairing near that specific real wall at all, for a meaningful fraction of real walls. That is a pairing/selection recall gap, not a filtering-precision problem; no amount of better filtering recovers a wall that was never paired in the first place.
- Where a real wall *is* recovered, position is usually close but not tight: MISPLACED residuals cluster in the 1.5–2.8τ range (not 5–10τ, which is where ABSENT sits) -- consistent with the fragmentation-driven endpoint imprecision found directly in this step (e.g. `W42`, the single most-confident anchor on 15x30, itself starts short of the true top-left corner, which alone explains most of its own 1.48τ residual as an anchor).
- Per the caveat above, genuine fragmentation is a real, likely-undercounted contributor sitting *underneath* several ABSENT verdicts, not a separate small correction -- but it presents as a coverage/geometry problem in the metric either way, not as excess-precision noise.
- Over-production (confirmed real in the first diagnostic pass) explains precision and cycle closure, and does not conflict with this finding -- both are true simultaneously: pairing produces too many wrong candidates *and* too few right ones.

**Path forward implied (not built this session):** a pairing rethink is warranted before further filtering/merge work, per the instructed GEOMETRY-branch guidance -- specifically, understanding *why* select.py/pair.py's candidate generation misses roughly half of real walls entirely (not just why it over-generates elsewhere), and separately, whether collinear-merge/endpoint handling can be tightened so recovered walls reach their true corners rather than stopping short.

### Step 3 — hatch-identity check on the unclassified 56–57% majority

Attempted three quantitative confirmations against a sample of the "unclassified" spurious walls from the first diagnostic (`analyze_step3a_walls.py`'s `hatch_cluster_uninformative` category), cross-checked against the confirmed-real anchor walls from Step 1 as a control. **Result: inconclusive by the proxies tried, and the reason why is itself informative.**

1. **Raw local density of nearby diagonal (hatch-band, ≥30° from axis) segment midpoints**, radius scaled to 3x each wall's own length: uniformly enormous for the sample (1,155 to 15,809+ nearby diagonal segments) -- but *also* enormous around the confirmed-real anchors (15,809 around `W42`/`W43` on 15x30; 25,749 around all three 30x50 anchors), because those radii scale with each wall's own length and the anchors are long, saturating to near-page-wide counts. Not a fair comparison as constructed.
2. **Spacing regularity (coefficient of variation) of nearby diagonal-segment perpendicular positions**, fixed radius: confounded by binning resolution -- median gaps collapsed to exactly the 0.5-unit bin size used for deduplication on nearly every sample, meaning the reported "spacing" was measuring the tool's own resolution, not a real hatch pitch. Discarded as unreliable rather than reported as a real number.
3. **Local diagonal-ink *fraction*** (not raw count) in a small fixed-radius (25 native units) window around each wall's midpoint, corrected for #1's radius-scaling flaw: unclassified sample mean 0.407 (15x30) / 0.522 (30x50) -- but the **confirmed-real anchor walls score *higher*, not lower**: 0.978–0.994 on both plans. This is the opposite of what a naive "spurious walls sit in hatch, real walls don't" hypothesis predicts.

Investigated why #3 goes the "wrong" way rather than discarded: it's architecturally expected, not a bug. In this double-line-plus-hatch convention, a real wall's boundary stroke sits *directly against* the hatch fill that occupies the wall's own thickness -- the wall boundary and its hatch are adjacent by construction, not separated. Proximity to hatch is therefore not diagnostic of *anything* on this corpus; both real wall edges and coincidentally-axis-aligned hatch remnants sit inside hatch-dense neighborhoods, because hatch coverage is pervasive across large regions of both plans rather than spatially localized to specific "noise pockets."

**This does not confirm or refute the hatch-leakage hypothesis for the unclassified majority -- it rules out simple proximity/density-based confirmation as the wrong tool for the job**, and points at the reason `docs/paper.md` §5.6 Layer 2 specifies a **1-D FFT along the candidate itself** rather than a neighborhood-density check: periodicity needs to be measured *along the candidate segment's own local profile*, checking for regular parallel structure specifically at (or near) *its own* orientation, not "any diagonal segment within some radius." That is a different, more specific tool than anything tried this round, and was not built -- per instruction, this step only establishes whether the tool is the right one, and the finding is that a cruder proxy isn't a substitute for it, not that the FFT approach itself is unwarranted. **No hatch-identity fraction is reported** -- fabricating one from an confounded proxy would violate this project's own no-placeholder-metrics discipline more than reporting "not established this round."

### Explicitly not built this round

Any pairing/selection rethink, any fragmentation/collinear-merge tuning, the 1-D FFT periodicity discriminator (still only proposed), any change to `eval/`, 3b, 3c.

### Disposition

Held for Dan's review. Durable artifacts added: `extraction/trackv/analyze_step3a_pinned.py` + `out/step3a_pinned_diagnostic.json`, `extraction/trackv/plot_pin_check.py` + `out/pin_check_*.png`, this section. Not merged to main. Merge and all fix-builds wait on this read.

## Step 3a third diagnostic STOP — fragmentation confirmed as the leading mechanism

**Reframe accepted and confirmed: recovered walls are SHORT FRAGMENTS, not misplaced walls.** This is a continuity/assembly-adjacent failure (pairing produces correct pieces that don't get stitched into full-span walls), not a pairing-position failure. Still no fix built -- `eval/` untouched, debt/xfail tests unchanged. One additive, behavior-preserving change was needed to make this diagnosis possible: `pair.py`'s `PairResult` gained a `pre_merge_walls` field exposing the accepted, thickness-plausible wall list *before* `_collinear_merge` runs (previously computed internally and discarded) -- `walls`/`opening_candidates`/`funnel`, the actual shipped output, are byte-for-byte unchanged; confirmed by rerunning the full 43-test suite (still 43 passed, 1 xfailed).

### Step 1 — killing the 30x50 scale confound

Re-fit 30x50's transform from a cleaner 4-point anchor subset: `W13.start` and `W36.start` (both independently targeting GT's top-left corner) plus `W36.end` and `W19.start` (both independently targeting GT's bottom-left corner) -- dropping `W13.end`/`W19.end`, the original 6-point fit's two largest-residual points (1557mm, 1777mm), traced last round to a real cause: GT's building outline steps on the right side, so those two points are not actually the same physical corner and were pulling the least-squares fit toward a compromise.

| | anchor residuals (mm) | rotation | pinned-implied envelope vs GT's own bbox | verdict counts (MATCHED/MISPLACED/FRAGMENTED/ABSENT) | recall @ τ=1% |
|---|---|---|---|---|---|
| original 6-point fit | 117–1777 (mean-dragged) | 2.35° | 11485×6865 vs 12796×7121 (10%/4% off) | 1/8/1/9 | 0.053 |
| **clean 4-point fit** | **45–59 (tight)** | **-0.47°** | **12143×7259 vs 12796×7121 (5%/2% off)** | 2/9/1/7 | 0.105 |

The clean fit is unambiguously better on every internal-consistency measure -- residuals dropped ~20-30x, rotation now agrees with select.py's own independently-measured theta (~0.5° on this corpus) instead of disagreeing by ~2°, and the implied building envelope tracks GT's own bounding box far more closely. **ABSENT did drop (9→7), confirming part of the original count was a scale-fit artifact, not a real recall gap** -- but ABSENT+MISPLACED together barely move (17/19 → 16/19). The clean fit is what's used for every 30x50 result below; **per Dan's instruction the mechanism verdict is still weighted on 15x30**, whose scale was already trusted (~8% agreement with nominal) and needed no correction.

### Step 2 — positive fragmentation confirmation (not elimination)

For every ABSENT/MISPLACED GT wall, `pair.py`'s pre-merge candidate fragments were overlaid on that wall's span (GT wall inverse-transformed into the predicted frame via the frozen pinned transform) and classified directly from coverage, not inferred from the residual/overlap verdict alone. One coordinate-frame bug caught and fixed while building this: the pinned transform was fit against `step3a_predictions/*.json` (scaled by the schema's own now-superseded 1.900238x `image_transform` convention), while a fresh `pair_walls()` call returns raw, unscaled native coordinates -- applying one directly against the other silently searched in the wrong place (a failed round-trip sanity check, inverting a known anchor point and getting back a value ~1.9x off from the expected native coordinate, caught it before any numbers were trusted). Fixed by scaling the pre-merge fragments into the same schema-scaled frame the pinned transform actually operates in.

**15x30** (8 target walls, `extraction/trackv/out/step3a_fragmentation_diagnostic.json`):

| GT wall | original verdict | fragmentation verdict | fragments found | coverage | closest-frag perp offset (mm) | gaps |
|---|---|---|---|---|---|---|
| w_s2 | ABSENT | **FRAGMENTED** | 2 | 0.585 | 338.0 | 1 |
| w_s4 | ABSENT | **FRAGMENTED** | 3 | 0.764 | 337.2 | 1 |
| w_s6 | ABSENT | **FRAGMENTED** | 5 | 0.182 | 369.0 | 4 |
| w_s7 | MISPLACED | MISPLACED | 4 | 0.976 | 133.5 | 0 |
| w_s23 | MISPLACED | **FRAGMENTED** | 2 | 0.255 | 23.8 | 1 |
| w_s25 | ABSENT | MISPLACED | 3 | 0.023 | 66.5 | 0 |
| w_s29 | MISPLACED | **FRAGMENTED** | 3 | 0.565 | 117.9 | 1 |
| w_s35 | ABSENT | TRULY_ABSENT | 0 | -- | -- | -- |

**5/8 (63%) reclassify as FRAGMENTED — ink was correctly found, in pieces. Only 1/8 is genuinely TRULY_ABSENT.** `w_s7` (the single most-trusted anchor wall) stays MISPLACED under this finer lens too, but with 97.6% coverage and zero gaps -- its residual is a small, single perpendicular offset (133.5mm), not a fragmentation artifact; a real, if modest, centerline-recovery imprecision on the one wall recovered essentially whole.

**30x50** (16 target walls, post-clean-scale): TRULY_ABSENT 6, MISPLACED 7, FRAGMENTED 3. A more mixed picture than 15x30 -- fragmentation is present and confirmed (3/16) but genuine single-piece misplacement is the largest single category (7/16), with real coverage gaps remaining too (6/16). Consistent with 30x50 being the noisier, less-trusted evidence base; not weighted as heavily as 15x30 per instruction.

### Gap-vs-opening coincidence

Every gap on a FRAGMENTED wall checked against that wall's own GT-recorded openings (`Wall.openings`, `center_offset` ± `width/2`):

- **15x30: 1 of 8 gaps coincides with a real GT opening** (`w_s23`'s single gap, a real door). The other 7 -- including all 4 gaps on `w_s6` and both gaps on `w_s2`/`w_s4` -- do not correspond to any door or window in GT. **Most fragmentation is not (mis-scoped) opening detection; it's arbitrary breaks in candidate coverage unrelated to real architectural features.**
- **30x50: 4 of 5 gaps "coincide"** -- but flagged, not taken at face value: 3 of those 4 are all on the same wall (`w_s150`, length only 1164.9mm) against its single recorded opening, which given the coincidence test's generous match window (sum of half-widths) on a short wall is more likely a threshold artifact than three independent confirmations. Treating `w_s150` as one data point, not three, the honest count is closer to 2/3 wall-level gap groups coinciding, on a much smaller sample than 15x30's.

### Step 3 — is collinear-merge under-reaching or not firing at all?

Checked directly against `pair.py`'s existing merge (built in 3a, unmodified): for each gap, whether an `opening_candidate` already exists there (merge fired and is reflected in the shipped, post-merge `walls` output) vs. not.

- **15x30: merge fired on only 1 of 8 gaps** (`w_s4`'s). **30x50: merge fired on 3 of 5.**
- Spot-checked *why* the other 7 (15x30) don't fire, on the clearest case (`w_s2`'s top-wall fragments): the nearby candidate fragments in that region sit at **measurably different perpendicular offsets** (native y-midpoints 134.7 / 154.8 / 194.2 / 194.2 across four fragments in the same rough area, not one consistent line) with generous individual gap bounds (397–2074 native units, well above the actual gaps between them) -- meaning the gap-*size* bound (`OPENING_GAP_MULTIPLIER × local thickness`) is not obviously the limiting factor here. **The more likely limiter, on this sample, is `_collinear_merge`'s grouping key** (`(axis_bucket, round(perp / thickness × 4))`): fragments of what should be the same physical wall are landing in different perpendicular bins because each fragment's own independently-recovered thickness and offset are individually noisy (the same over-production/precision problem documented in the first diagnostic round), so they never get compared for merging at all, rather than being compared and rejected on gap size.
- **This distinguishes "not firing at all" from "under-reaching" -- and points at grouping/collinearity tolerance, not the gap-length bound, as the more likely fix target**, though this is a spot-check on one wall's fragments, not an exhaustive audit of all 12 unfired gaps across both plans.

### Synthesis

The leading hypothesis is confirmed on the trusted (15x30) evidence base: **most of what scored as ABSENT is really FRAGMENTED** -- pairing does find real wall ink for the majority of these walls, but splits it into pieces that (a) mostly don't line up with real GT openings, so this isn't disguised opening-detection working correctly, and (b) mostly don't get healed by the existing collinear-merge, most plausibly because fragments of the same true wall aren't even being recognized as candidates for merging (a grouping/tolerance issue) rather than the merge's gap-size bound being too tight. This reframes the likely fix target for a future session: **before/alongside anything touching filtering or the gap-size bound, the collinear-merge's *grouping* step -- how it decides two fragments belong to the same physical line -- is the more evidence-backed place to look.** Not built this session.

### Explicitly not built this round

Any change to `_collinear_merge`'s grouping/tolerance, any gap-bound retuning, any pairing rethink, any change to `eval/`, 3b, 3c.

### Disposition

Held for Dan's review. Durable artifacts added: `extraction/trackv/analyze_step3a_fragmentation.py` + `out/step3a_fragmentation_diagnostic.json`, the `pair.py` `pre_merge_walls` diagnostic field (additive, shipped output unchanged, 43/43 tests + 1 xfail unaffected), `analyze_step3a_pinned.py`'s `run_30x50(clean_anchors_only=...)` comparison, this section. Not merged to main. Merge and fix-scope wait on this read.

## Step 3a fix — re-keyed collinear-merge, scored — merge decision

Mechanism confirmed (FRAGMENTED-dominant, 5/8 on 15x30, root cause localized to `_collinear_merge`'s grouping key). This session builds the fix and scores it. `eval/` untouched; debt/xfail tests unchanged; both required guardrail tests green before scoring, per instruction.

### The fix

`_collinear_merge` (`extraction/trackv/pair.py`) re-keyed from `(axis_bucket, round(perp / thickness * 4))` -- grouping fragments by their own noisy recovered thickness, the confirmed root cause -- to `(axis_bucket, tight absolute perpendicular tolerance)`: fragments now cluster by chain-linked proximity in perpendicular position alone (`COLLINEAR_GROUPING_TOLERANCE_FRAC = 0.005` of plan diagonal, ~7 native units on this corpus), independent of thickness entirely. Thickness is now an *output* of each merged group -- the length-weighted median of its member fragments' thicknesses -- not an input to deciding whether they belong together. The existing along-axis overlap-or-small-gap requirement (opening-scale bound, unchanged) still governs whether two same-line fragments actually merge, so two same-line-but-far-apart walls in different rooms still don't collapse into one.

**Guardrails, both required, both green:**
- `test_close_parallel_walls_do_not_merge_guardrail` -- two walls 50 units apart in perpendicular offset (well above the ~7-unit tolerance) must stay separate, with no opening candidate invented between them.
- `test_fragments_with_different_noisy_thickness_still_merge_on_geometry` -- two collinear stubs with *different* recovered thickness (9.8 vs 10.2, realistic pairing noise) must still merge, with the merged thickness landing at the length-weighted median (10.2, verified exactly).

One test-fixture bug found and fixed while building these: `test_pair.py`'s `_support_pairs` helper spaced independent synthetic walls only 3 units apart in perpendicular offset -- safe under the old thickness-relative binning, but inside the new tight absolute tolerance, so unrelated support walls started spuriously merging with each other. Fixed by widening the fixture's spacing to 200 units; not a fix-code bug, a fixture built for the old scheme's tolerances.

Full suite: 45 passed, 1 xfailed (the logged Manhattan-bias debt, unchanged).

### Funnel, before vs. after

| plan | pair: accepted (pre-merge) | merges applied | opening candidates | **walls before assemble** | assemble: junctions | connected components | cycles closed |
|---|---|---|---|---|---|---|---|
| 15x30 before | 120 | 60 | 12 | **72** | 128 | 61 | 0 |
| 15x30 after | 120 | **92** | 15 | **43** | 86 | 43 | 0 |
| 30x50 before | 191 | 97 | 24 | **118** | 207 | 96 | 0 |
| 30x50 after | 191 | **161** | 24 | **54** | 108 | 54 | 0 |

Wall count roughly halved on both plans (72→43, 118→54) from correctly merging fragments that the old thickness-keyed grouping was scattering apart -- direct, mechanical confirmation of the diagnosed root cause. **Cycle closure stays at 0 on both plans, and this is expected, not a fix failure**: `_collinear_merge` only stitches fragments *along one wall's own axis*; it has no mechanism to connect two *perpendicular* walls at a shared corner. That's `assemble.py`'s endpoint-snap job (`SNAP_TOLERANCE_NATIVE`), untouched this session, and per the documented endpoint-precision gap (`w_s7`'s 133mm perpendicular offset even on the single most-trusted anchor wall) real corners are apparently still further apart than that snap tolerance allows. Flagged, not chased, per instruction.

### Score

Pinned transforms unchanged from the last STOP (anchor wall coordinates are bit-identical pre- and post-fix -- the specific fragments chosen as anchors didn't need merging themselves) -- 15x30's 3-anchor fit and 30x50's clean 4-point re-fit, both round-trip-verified against the 1.9x schema-scale frame before scoring anything, per instruction.

| plan | τ=0.5% (Phase 2 exit metric) | τ=1% | τ=2% |
|---|---|---|---|
| 15x30 | P=0.000 R=0.000 **F1=0.000** (0 matched) | P=0.047 R=0.200 F1=0.076 (2 matched) | P=0.070 R=0.300 F1=0.113 (3 matched) |
| 30x50 | P=0.019 R=0.053 **F1=0.027** (1 matched) | P=0.037 R=0.105 F1=0.055 (2 matched) | P=0.056 R=0.158 F1=0.082 (3 matched) |

**Wall F1 @ τ=0.5%: 0.000 (15x30) and 0.027 (30x50), against Phase 2's exit bar of ≥ 0.99.** Not close, at any τ tried, on either plan.

Real, if modest, directional improvement is visible per-wall, not just in aggregate wall count: `w_s102` (30x50's top wall) flipped from MISPLACED (residual 2.24τ, overlap 0.877) to **MATCHED** (residual 0.58τ, overlap 0.929); `w_s111` (30x50's left wall) tightened from a marginal 0.97τ match to a comfortable 0.29τ match. Several previously-ABSENT walls' residuals dropped meaningfully even where the verdict bucket didn't flip (`w_s2`: 8.56τ → 4.47τ). But most of the corpus's real walls still don't clear even the loosest τ=2% band, for reasons this fix doesn't touch: the ~133mm single-wall perpendicular-offset precision gap (logged, not chased, per instruction) and genuine coverage gaps unrelated to fragmentation (multiple GT walls still show `overlap=0.0` against their best candidate -- no fragment anywhere nearby at all, not a merge problem).

### Merge recommendation

**Do not merge to main.** Schema validity clears its bar (1.0 ≥ 0.99 required, both plans, zero validator errors) but **wall F1 @ τ=0.5% is 0.000/0.027 against a required ≥ 0.99** -- not a marginal miss, orders of magnitude short. The collinear-merge fix is confirmed working exactly as diagnosed (fragment count roughly halved, several individual walls now cleanly matched or much closer), which validates the three-round diagnostic chain that led here, but it was never going to close a gap this large on its own -- it fixes continuity, not the two things still standing between this corpus and the exit bar:

1. **Endpoint/centerline precision** -- even fully-merged, well-covered walls (`w_s7`, `w_s102`, `w_s111`) sit 0.29–1.48τ off GT's centerline, not 0τ. Logged this session, not chased.
2. **Genuine coverage gaps** -- several GT walls have no predicted candidate anywhere nearby (`overlap=0.0`), unrelated to fragmentation. Not diagnosed this session -- the next open question, per instruction's own framing ("if it doesn't fully [improve], it's the NEXT diagnostic, not this session's scope").

Recommend continuing to hold `phase-2-trackv-m2c` for further diagnosis/fixing rather than merging a validity-only pass to main.

### Explicitly not built this round

Any fix to endpoint/centerline precision, any pairing-coverage-gap diagnosis or fix, any `assemble.py` corner-snapping change, any change to `eval/`, 3b, 3c.

### Disposition

Held for Dan's review. Durable artifacts added: the `_collinear_merge` re-key in `extraction/trackv/pair.py` (`COLLINEAR_GROUPING_TOLERANCE_FRAC`, `_weighted_median`, `_cluster_by_perp`), two new required guardrail tests in `tests/test_pair.py` (both green), regenerated `out/step3a_predictions/*.json` + `out/step3a_report.json` + `out/step3a_pinned_diagnostic.json` reflecting the fix, this section. Not merged to main -- wall F1 remains far below Phase 2's exit bar despite the confirmed, working fix.

## Step 3a fix — junction closure (extend-to-intersection) — headline finding: candidate over-production, not a topology bug

**Lead with this: closure worked, and it functioned as a detector, not a fix.** GT has 2 T-junctions across 19 walls (30x50). Predictions, once closure actually connects what's really there, show 84 accepted T + 46 accepted X across 54 candidates -- a ~65x topology-density error. Unlike every wall-F1 number in this milestone, this measurement needs no pinned transform, no coordinate-frame alignment, nothing scoring-adjacent -- it's frame-independent and directly comparable to GT's own junction graph. It is the first reliable measurement of candidate quality Phase 2 has had, and it was invisible before this fix because every wall candidate sat in its own isolated connected component (see the m2c handoff: `n_connected_components == n_walls_final` on both plans, i.e. zero cross-wall junctions of any kind).

### The fix

`assemble.py` gained `_resolve_junction_closure`: for every wall-end still dangling after the existing tight-tolerance snap, find cross-orientation (near-perpendicular) partner walls, compute the *exact* intersection of their infinite centerlines (exact because every wall is analytically axis-aligned within one global theta frame -- see `pair.py`'s `_bucket_wall`), and either **SPLIT** the partner (crossing point strictly interior to its own span -- a T- or, rarely, X-junction) or **MOVE** a genuinely dangling endpoint out to meet it (an L-corner), never both loosely at once. Two independently-scaled bounds, both keyed to each wall's own recovered thickness: a generous axial-extension bound (~1.5x thickness) for ends that are actually dangling (safe to relocate, nothing else depends on that point yet), and a tight overhang bound (~0.5x thickness) for the rare case where a non-dangling end falls just short. Every candidate is enumerated and gated *before* anything is applied (never pairwise-in-sequence, which can double-count or oscillate); every wall's accepted split points are batched and cut once into N+1 pieces, never iteratively. Rejected candidates are logged with the specific bound they failed (wall ids, magnitude, bound) -- a kill-chain audit trail, not a silent drop. Split pieces carry `parent_wall_id` back to their pre-split origin.

**Guardrails, both required, both still green**, plus 8 new tests covering the closure logic itself (L-corner mutual extension, T-split with parent tracking, X-split, rejected-candidate logging, batched multi-tap splitting, and an `enable_splitting=False` diagnostic-mode test). Full suite: 51 passed, 3 xfailed.

### Funnel, before vs. after

| plan | connected components | cycles closed | walls (post-closure) | n_walls_split | accepted L / T / X | rejected |
|---|---|---|---|---|---|---|
| 15x30 | 43 → **7** | 0 → **24** | 43 → **136** | 33 (of 43) | 7 / 31 / **31** | 391 |
| 30x50 | 54 → **6** | 0 → **50** | 54 → **230** | 47 (of 54) | 19 / 84 / **46** | 571 |

Cycle closure and connectivity both improved sharply, exactly as intended. But **77–87% of all wall candidates got split at least once**, not the ~47%/72% axial-dominant share estimated going in, and X-junctions (predicted "probably zero") landed at 31 and 46 -- comparable in magnitude to T. Concrete inspection (`W2` crossing three ~275-unit verticals `W26/27/28` at three different points, mirrored by a second triad `W46/47/48` against a neighboring wall) shows repeating triads of near-identical-length parallel segments crossing shared perpendiculars at multiple points -- consistent with window-mullion/frame elements that `pair.py`'s thickness-plausibility guard lets through as wall candidates, now being connected into the graph by closure. All three of 30x50's pinned-transform anchor walls (its longest, most-trusted perimeter walls -- `W0`, `W22`, `W23`) were themselves split, confirming the longest candidates take the most damage, as expected if the mechanism is real over-production rather than noise.

### Root cause and why this is not a bound-tuning problem

Dan's own arithmetic forecloses it: 30x50's GT has 19 walls; `pair.py` emits 54 candidates. Even at perfect recall, precision caps at 19/54 = 0.35 and wall F1 caps at ~0.52 pre-split, ~0.15 post-split (19/230) -- against a required 0.99. **No closure logic, no split bound, and no downstream tuning can reach the exit bar while the candidate set is ~3x over-produced.** Over-production is not a contributing factor to the F1 problem -- it IS the F1 problem, and it was invisible until closure made it legible by actually connecting candidates together.

The asymmetry that surfaced it (MOVE is thickness-bounded, SPLIT was not) is real and correctly identified, but **the fix is not a symmetric bound on the split side** -- that would suppress the symptom, restore a plausible-looking wall count, and destroy the clearest quality signal this phase has produced, while being exactly the kind of threshold-tuned-around-a-symptom change this project's own discipline forbids. The principled read: splitting should only ever be triggered by junctions between candidates that *survived selection*, and `assemble.py` currently performs no selection at all -- paper 5.4's promise that topology filters false positives depends on a solve step that selects a subset; unconditional assembly never runs that filter. That is a missing step (selection/residue-classification, already in Phase 2's own scope per `extraction-plan.md`: "layer/color metadata harvesting; residue classification hooks... use geometric priors only"), not a missing constant.

**Housekeeping added so this diagnosis doesn't require reverting code:** `assemble()` / `_resolve_junction_closure` take `enable_splitting: bool = True`; `--no-splitting` on `run_step3a.py` runs the exact pre-split candidate set through the same funnel/eval path (verified: wall count is bit-identical to pre-closure, 43/54). Split pieces' `parent_wall_id` is also exposed as a non-schema sidecar (`junction_closure.wall_parent_ids`) in the funnel report, so a future re-merge script can recover the pinned diagnostic's now-shattered anchor walls (`W0`, `W22`, `W23`) by parent id without re-fitting the transform.

### Corrected framing: two independent blockers, neither is tuning

Phase 2 currently has **two independent blockers** to its exit bar, and no wall F1 number should be reported as a milestone result until at least one clears:

1. **Candidate over-production** (this session's finding) -- precision ceiling ≈0.35 pre-split, measured directly from GT-wall-count vs. candidate-count, frame-independent.
2. **Coordinate-frame unmeasurability** (issue #8, carried from the prior STOP) -- 15x30's pinned-transform anchor-fit residuals are 3–6τ, several times the exit metric's own tolerance, so **15x30's wall F1 must be reported as UNMEASURABLE, not 0.000** -- a zero implies a measured failure; this is an absent measurement. 30x50's clean 4-anchor fit is sub-τ (~0.8τ) and remains trustworthy, but its F1 is still capped by blocker 1 regardless.

### Next work, in order (both squarely Phase 2's own scope, not P4/P6 creep)

1. **Layer/color/stroke metadata first** -- may be free, high-precision evidence per paper 5.2 step 1. Check whether the identified spurious candidates (`W2`, `W26/27/28`, `W46/47/48`) differ from confirmed real walls (`W0`, `W22`, `W23`) by PDF layer name, color, or stroke attributes before building anything geometric.
2. **Periodicity/repetition signature second**, only if metadata doesn't separate them -- "repeating triads of near-identical-length parallel segments crossing shared perpendiculars" is the paper 5.6 Layer 2 signature (hatching/stair-tread periodicity via 1-D FFT along the candidate), and is what milestone-2-step-2 already predicted would be needed once stroke width alone was found unable to separate wall from hatch. Deterministic geometry only -- no cross-evidence voting or adjudication (P6's job).

### Explicitly not built this round

Any bound or threshold on the SPLIT side of closure (considered, explicitly rejected as symptom-suppression). Any layer/color/periodicity filtering itself (next session). Any change to `select.py`, `pair.py`, `eval/`, or the frozen schema. Re-fitting or re-running the pinned-transform diagnostic (its anchors are recoverable via `parent_wall_id` when needed, not re-derived here).

### Disposition

Held for Dan's review; **committed** (closure is correct against what was specified, tested, both guardrails green, and per instruction commits as-is rather than waiting on the over-production question it surfaced). Durable artifacts: `_resolve_junction_closure` + supporting closure machinery in `extraction/trackv/assemble.py`, `enable_splitting` flag threaded through `assemble()`/`run_step3a.py`/`--no-splitting`, `parent_wall_id` on `AssembledWall` + `wall_parent_ids` funnel sidecar, 10 new tests + 1 corpus-level `xfail(strict=True)` regression tripwire in `tests/test_assemble.py` (X-junction count is NOT zero, tracked not silently normalized), this section. Not a merge-readiness change either way -- Phase 2 remains blocked on candidate over-production and coordinate-frame unmeasurability, neither addressed by this session's own scope.

---

## Step 3a Blocker-1 step 1 — style-metadata separation: NEGATIVE RESULT, and it needs no coordinate frame

**Lead with this: PDF style metadata cannot separate real wall candidates from spurious ones on this corpus, and that verdict does not depend on the pinned transform, the labels, or anything scoring-adjacent.** Four of five channels take exactly ONE value across all 54 pre-split candidates on 30x50 — zero information, no labeling required to see it. The fifth (stroke colour) partitions the population {50, 2, 1, 1}, and the best wall-F1 *any* filter built on it could possibly reach is **0.5507**, against an exit bar of 0.99.

This is the third branch of the decision rule fixed in advance by `reports/phase-2-m2c-handoff.md` ("no separation ⇒ report as a one-paragraph negative result and go straight to periodicity"). It is also paper §5.2's own hedge landing on the unfavourable side: layer names are free high-precision evidence *when present*, and here they are simply absent.

### What was measured

`extraction/trackv/analyze_step3a_metadata.py` (new; diagnostic, not a pipeline module). Runs `dissect → select → pair` in-process and stops there — the **pre-split** candidate set (54 on 30x50), since classification is upstream of closure's splitting. Never calls `assemble()`, never touches `out/step3a_predictions/`. Channels harvested per candidate through its full provenance: `layer`, `stroke_color`, `fill_color`, `stroke_width`, `dashes`, plus `seqno` (content-stream order) as an ordinal.

Two supporting changes were needed and are the session's only pipeline edits, both strictly additive:

- `VectorPrimitive` now carries `dashes` and `seqno` (`primitives.py`, `dissect.py`) — PyMuPDF already returns both in the `get_drawings()` dict; dissection was discarding them.
- `WallCandidate` gained `member_source_indices` (`pair.py`, propagated in `assemble.py`). `source_segment_indices` survives `_collinear_merge` as only the *first* chain member's two faces, so a merged wall's other fragments' metadata was unreachable — the matrix would have been built on an arbitrary two-face sample of each merged wall. New test in `tests/test_pair.py` (a 3-fragment merge must carry all 6 member indices). Suite: **52 passed, 3 xfailed**; `run_step3a.py` re-run produces **bit-identical** predictions, confirming the edits change no behaviour.

### The transform-free bound (this is the result)

For a selection of *k* candidates scored against *n* GT walls under `matching.py`'s one-to-one assignment, at most `min(k, n)` can match, so `F1 ≤ 2·min(k,n)/(k+n)` — an upper bound that holds regardless of which candidates are truly real. A metadata filter can only ever select a union of its channel's value buckets, so enumerating all such unions bounds the whole channel.

| channel | buckets over the 54 candidates | best possible wall-F1 | reaches 0.99? |
|---|---|---|---|
| `layer` | {54} — all `None` | 0.5205 | no |
| `fill_color` | {54} — all none | 0.5205 | no |
| `stroke_width` | {54} — all 0.72 | 0.5205 | no |
| `dashes` | {54} — all `[] 0` | 0.5205 | no |
| `stroke_color` | {50, 2, 1, 1} | **0.5507** | no |

`layer` is dead at the source, not merely uniform: neither plan has any optional-content groups at all (`doc.get_layers() == []`), and `layer` is `None` on all 33117 (30x50) / 20741 (15x30) primitives. These are marketing/CAD-export PDFs with the layer structure flattened out — the case paper §5.2 anticipated.

`stroke_color`'s three minority buckets are not a wall/non-wall signal: each is a `MIXED(...)` candidate whose provenance includes one of the four page-wide red/ochre annotation primitives bleeding into an otherwise all-black wall. Keeping the black bucket means keeping 50 of 54 candidates — i.e. doing nothing. **The channel cannot construct a ~19-candidate selection at all**, which is what the exit bar requires, so its correlation with truth is moot.

15x30 (label-free, no transform needed) is the same picture on its own 43 candidates: `layer` {43}, `fill_color` {43}, `stroke_width` {43}, `dashes` {43}, `stroke_color` {39, 4}.

### The labeled confusion matrix is VOID — reported, not quietly dropped

The handoff asked for a full-population REAL/SPURIOUS confusion matrix on 30x50. It was built, and it **fails its own sanity check**: at τ=1% only **6 of 19 GT walls** have any candidate lying on them (5/19 at 0.5%, 8/19 at 2%). Since Track V's documented problem is candidate *excess*, not absence, a SPURIOUS label here conflates "not a wall" with "displaced by coordinate-frame error" — so the matrix measures Blocker 2, not Blocker 1, and is not reportable as evidence. It is retained in `out/step3a_metadata_confusion.json` under `labels_trustworthy: false` with the void reason attached, so it can never be quoted as a result by accident.

Note this **does not weaken the verdict above**: the bound is computed from bucket sizes alone and never consults a label.

The frame's own guard did pass exactly — re-fitting the 4 clean anchors reproduced the recorded residuals to 0.1 mm (`[59.1, 60.9, 56.2, 56.1]`), confirming the labels were built in precisely the frame the recorded ~0.8τ was measured in. **The anchors fit; the rest of the plan does not.**

### Two mechanisms tested for that displacement, both NEGATIVE

Walls are detected but laterally displaced: 16 of 19 GT walls have an orientation- and overlap-compatible candidate once the lateral bound is lifted, yet only 6 clear it. The displacement is sharply x-heavy — median lateral offset **627 mm along x (≈4.3τ) vs 74 mm along y (≈0.5τ)**, an 8.5× asymmetry — matching an envelope error of −5.29% in x against +0.54% in y (a uniform-scale similarity cannot satisfy both axes).

Two specific mechanisms were then tested against the full population and **both were falsified**:

1. *Fit degrades with distance from the hand-picked anchors* — correlation of lateral offset vs. distance-to-nearest-anchor: **0.063**. No.
2. *A single wrong uniform x scale* — correlation of x-offset vs. the wall's own x-coordinate: **0.14**, slope 0.039 vs. the envelope's 0.053. Too weak to claim. No.

So the anisotropy is real and measured, but **the mechanism behind it is NOT established** and is not asserted here. A third candidate not tested this round: the per-GT-wall "best candidate" in this no-lateral-bound view is itself chosen from an over-produced set, so the residual population may be mixing correspondence error with frame error — which would make Blocker 1 and Blocker 2 not independent, contrary to the framing carried since the closure round.

### Explicitly not built this round

Any filter, threshold, or rejection rule on metadata (the deliverable was the measurement, per the handoff — and the measurement says don't build one). Periodicity/FFT. Any change to closure's SPLIT-side bound, `select.py`'s logic, `eval/`, or the frozen schema. Any re-derivation or repair of the pinned transform — the anchor guard only *checks* it. 15x30 labeling (its transform remains 3–6τ, so its candidates are reported label-free only).

### Disposition

Held for Dan's review. Durable artifacts: `extraction/trackv/analyze_step3a_metadata.py`, `out/step3a_metadata_confusion.json`, `dashes`/`seqno` on `VectorPrimitive`, `member_source_indices` on `WallCandidate` + its test, this section.

**Blocker 1's metadata branch is closed as a negative result — periodicity is now the only remaining in-scope lead for it.** But the honest ordering has changed: this round could not measure candidate quality against GT at all on the one plan whose transform was believed trustworthy, and turned up evidence that the two blockers may not be independent. **Recommend Blocker 2 (issue #8) next, not periodicity** — the handoff's own falsification test (global least-squares refit over all confidently-matched pairs; and first, the factual question of whether a page-unit form of this GT exists upstream of its mm conversion) — because periodicity would otherwise be built and then scored through the same unusable frame.

## Step 3a Blocker 2 (issue #8) — coordinate frame is DERIVED, ZERO fitted parameters, not two

**The handoff's factual question resolves to yes, and it eliminates fitting entirely — not just rotation and scale, but translation too.** The prior pinned-transform approach fit a 4-parameter similarity (scale, rotation, tx, ty) from 3–6 hand-picked anchors. All four parameters are unnecessary: the frame is fully determined by constants both pipelines already assert, with no free parameters left to fit.

### Derivation chain (each link checked independently, not assumed)

1. `run_step3a.py`'s own `_gt_scale` already rescales Track V's predictions into a **1600px-long-edge raster frame** (`GT_LONG_EDGE_PX`) — documented in that file's header, already wired, not new.
2. That raster frame is bit-identical to the **legacy hand-trace tool's frame**: `legacy/data/floorplan-gt/*.gt.json`'s `imageSize` equals `round(page.rect.w · zoom), round(page.rect.h · zoom)` for `zoom = min(1600/rect.w, 1600/rect.h)`, computed directly from the real source PDFs (595×842pt and 842×595pt) — confirmed numerically for both plans (1131×1600 / 1600×1131), not assumed from either file's own claims.
3. `extraction/synth/convert_legacy_gt.py:44-47` converts that same px frame to the GT's mm frame with a **pure scalar**: `[p.x * scale, p.y * scale]`, `scale = metersPerPixel * 1000`. No offset term. No axis flip.
4. `run_step3a.py:124`'s `image_transform.matrix` and `assemble()`'s `scale_to_gt_frame` parameter are likewise **scale-only** — no offset term on the prediction side either.

Both sides of the pipeline therefore assert the same origin `(0,0)`, y-down, with no free parameters between them:

```
mm_per_pred_unit = metersPerPixel * 1000     # rotation = 0, translation = 0
15x30-ft-Best-House-Plan-Model:  8.323667459886908  (metersPerPixel 0.008323667459886908)
30x50-Model-landscape:          12.918215560344834  (metersPerPixel 0.012918215560344833)
```

`metersPerPixel` is a constant the legacy hand-trace tool recorded at GT export time (`legacy/data/floorplan-gt/*.gt.json`), independent of anything Track V predicts.

### What was measured (`extraction/trackv/analyze_step3a_frame.py`, new; diagnostic, not a pipeline module)

**Overlay** (`out/step3a_frame_overlay.png`): GT walls vs. predictions transformed by scale-only (rotation=0, tx=ty=0), plotted in the same mm frame. Both plans show strong walls landing on top of GT almost exactly — no flip, no rotation, no gross offset. What extends past GT is a scattered red fringe consistent with Blocker 1's over-production, not a frame defect.

**Full-population nearest-GT-endpoint residual** (`out/step3a_endpoint_residual_scatter.png`, `out/step3a_frame_derivation.json`): for every one of 272 (15x30) / 460 (30x50) predicted wall endpoints, distance and (dx, dy) to its nearest GT endpoint, under scale-only transform, no fitting. The scatter shows a **dense cluster at (0,0)** superimposed on a scattered cloud — the mode is at the origin, as predicted, and the cloud is the tail:

| plan | radius | n endpoints in radius | median dx | median dy |
|---|---|---|---|---|
| 15x30 | 150mm | 6 / 272 | -0.2mm | -2.0mm |
| 15x30 | 300mm | 10 / 272 | 24.4mm | -14.2mm |
| 30x50 | 100mm | 24 / 460 | 12.2mm | 9.4mm |
| 30x50 | 300mm | 43 / 460 | 19.9mm | 7.7mm |

Residuals for endpoints that land near a GT vertex at all are **single-digit-to-low-tens of mm** — negligible against plan dimensions in the meters. This confirms the derivation: the frame is correct as derived, with no fitted parameters.

Only 3.7% (15x30) / 9.4% (30x50) of predicted endpoints land within 300mm of any GT vertex at all. That is not a frame failure — it is Blocker 1 restated in endpoint terms: most predicted endpoints belong to over-produced candidates with no corresponding GT wall to land near, so they contribute to the surrounding cloud, not the peak.

### Rejected measurement — bounding-box comparison, and why it must not be reused as a calibration constant

An earlier pass in this same investigation compared pred-bbox×scale to GT-bbox directly and read off apparent offsets of (36, -349)mm on 15x30 and (-954, -1975)mm on 30x50, with no consistent sign or magnitude between the two plans. **This is not a frame measurement and must not be used as one.** Two independent reasons:

1. A bounding box is a max-statistic over extremes — the single measurement most sensitive to exactly the failure mode already known to exist. The two plans' apparent "offsets" scale with their contamination (15x30, less over-production, smaller apparent offset; 30x50, more over-production, larger), which is the signature of a noise measurement, not a calibration constant.
2. `gt_provisional`'s GT is `provisional_unaudited`, produced by a legacy converter that **drops portals** and inherits the hand-trace convention of deliberately not tracing some non-room areas (service balconies). Pred bbox legitimately exceeds GT bbox even under perfect extraction. Bbox agreement was never a valid target here.

Retained only as a documented rejected measurement so it is never mistaken for a frame constant downstream.

### NOT MEASURED

Root-cause bisection of the residual cloud beyond "consistent with over-production" (e.g., confirming each spurious-cloud endpoint traces to a specific over-produced candidate) was not attempted — the clean near-zero mode made it unnecessary for closing the frame question, and it is Blocker 1's work, not Blocker 2's. Wall-level F1 under the derived zero-parameter transform was not recomputed into `step3a_aligned_score.json` this round — the endpoint-residual measurement was judged sufficient to close the frame question and F1 remains dominated by Blocker 1 regardless.

### Explicitly not built this round

No translation fit. No rotation fit. No rescoring of `step3a_aligned_score.json` under the derived transform. No Blocker 1 work (periodicity or otherwise) — held for a future session per Dan's explicit instruction.

### Disposition

Held for Dan's review. Durable artifacts: `extraction/trackv/analyze_step3a_frame.py`, `out/step3a_frame_overlay.png`, `out/step3a_endpoint_residual_scatter.png`, `out/step3a_frame_derivation.json`, this section.

**Blocker 2 (issue #8) is CLOSED.** The coordinate frame is derived, not fitted — zero free parameters, formula and constants recorded above so a future reader can regenerate rather than trust them. The prior 3–6τ "unmeasurable" reading on 15x30 was an artifact of the old 4-parameter anchor fit, not a property of the frame itself. The bbox-based offsets seen mid-investigation are recorded above specifically so they are never reused as calibration.

**The real target, now unblocked, is Blocker 1 — candidate over-production (~3x predicted walls vs. GT).** That work is explicitly not started this session.

## Step 3a Blocker 1 resumed — recall is the real gap, two of Dan's own hypotheses falsified, coverage metric retired and replaced

Opened per Dan's direct instruction: classification before tuning, no thresholds fit to make these two plans look good, hypotheses tested on the whole population, never on the examples that suggested them.

### Step 0 — fresh wall-level matched baseline under the derived (zero-parameter) transform

`extraction/trackv/analyze_step3a_blocker1_baseline.py`. Replaces both the raw 54-vs-19 candidate-count arithmetic (still true, still not a matched baseline) and the 3.7%/9.4% vertex-proximity figures (too strict a test — a correct wall split at a different point scores zero on it).

| plan | n_pred (pre-split) | n_gt | P@τ0.01 | R@τ0.01 | F1@τ0.01 |
|---|---|---|---|---|---|
| 15x30 | 43 | 10 | 0.070 | 0.30 | 0.113 |
| 30x50 | 54 | 19 | 0.130 | 0.368 | 0.192 |

Post-split F1 collapses to ~0 — `match_walls`'s `overlap_ratio>0.8` fails split fragments that only cover part of a GT wall's span. Corroborating evidence for the mechanism below, not a separate defect.

### Step 1 — family classification matrix (pre-split, both plans, 97 candidates)

`extraction/trackv/analyze_step3a_family_classification.py`. First pass defined `sheet_border` as touching the physical PDF page edge — zero hits. The real rectangle Dan identified from the overlay (30x50, candidates `W0`/`W22`/`W23`/`W38`) sits ~1000mm *outside the GT envelope*, not near the page edge; rule rewritten to detect a near-full-span parallel-offset loop against the GT bbox instead. Recorded so a future reader doesn't repeat the same wrong assumption.

| family | n | share | matched | spurious | spurious% |
|---|---|---|---|---|---|
| sheet_border | 4 | 4.1% | 0 | 4 | 100% |
| dimension | 3 | 3.1% | 0 | 3 | 100% |
| furniture_fixture | 39 | 40.2% | 1 | 38 | 97.4% |
| other | 51 | 52.6% | 9 | 42 | 82.4% |

**FALSIFIED HYPOTHESIS 1 (Dan's, from the overlay review): sheet_border + dimension are the over-production story.** Combined they are 7.2% of candidates. Killing both perfectly recovers almost nothing. Dropped — visual salience of long lines does not equal population share.

**Real problem restated: recall, not precision.** Only 10/29 GT walls across both plans have any one-to-one match at τ=0.01. Ceiling arithmetic assuming a perfect kill of every spurious candidate with zero collateral: 15x30 → P=1.0, R=0.30, F1=0.46; 30x50 → P=1.0, R=0.368, F1=0.54. The 0.99 exit bar (at the tighter τ=0.005) is unreachable by precision work alone, and this restores the project's own recall-first doctrine (a missed wall costs ~10x a spurious one) to a phase that had been running against it.

### Step 2 — coverage measurement, FIRST ATTEMPT — SUPERSEDED, do not use

`out/step3a_coverage.json` (script `analyze_step3a_coverage.py`) reported select-stage coverage mean 0.887 / pair-stage mean 0.673 (τ=0.01) / pair-stage mean 0.591 (τ=0.005), and a death-bucket split of 1 (a) / 9 (b) / 9 (c) across 19 unmatched GT walls.

**SUPERSEDED. Reason:** `_coverage_fraction` matched each GT-wall centerline sample to the nearest candidate segment **regardless of orientation**. Every GT wall endpoint sits at a junction where a crossing (perpendicular) wall's corner is trivially within τ — confirmed directly on 15x30's `w_s23`: ~30% genuine same-orientation coverage near one end, a real gap through the middle, then false "coverage" from an unrelated perpendicular candidate near the other end, contributing nothing real. Do not cite the numbers in this subsection as pipeline quality; they are retired below, not merely caveated, per Dan's explicit instruction not to leave two disagreeing tables in the tree.

### Step 3 — run-merge probe (offline, `eval/` untouched) — FALSIFIED HYPOTHESIS 2

`extraction/trackv/analyze_step3a_run_merge_probe.py`. Test: re-group pair.py's already-merged pre-split candidates by the same axis-bucket + tight perpendicular tolerance it already uses, but span each group's full min-to-max projection with **no** opening-gap bound — i.e., let a run merge straight through a crossing wall's junction, matching GT's one-wall-per-run convention (10 walls for an entire 15x30 house).

Pre-registered expectation (recorded before running): recall +25 to +35pp, sharp precision gain via candidate-count drop, still short of 0.99.

| | today | run-merged | Δ |
|---|---|---|---|
| candidates (both plans) | 97 | 86 | −11.3% |
| recall @ τ=0.01 (both plans) | 0.345 | 0.345 | **0** |

**FALSIFIED HYPOTHESIS 2 (Dan's, and the prior session's framing): fragmentation/segmentation-convention mismatch is the driver of bucket (c).** If single GT walls were being chopped into multiple same-line fragments, removing the gap bound would have merged far more than 11 candidates and recovered at least some GT walls. It recovered zero. Dropped as the primary mechanism for bucket (c); guardrail respected throughout — nothing under `eval/` was imported or modified, no matcher threshold touched.

Chasing the null result (rather than reporting it flat) is what surfaced the Step 2 coverage confound in the first place: `w_s23`'s "coverage" turned out to come from a perpendicular candidate near its far endpoint, not a mergeable same-line fragment — explaining directly why merging same-axis candidates did nothing for it.

### Step 4 — coverage measurement, CORRECTED (orientation-constrained) — this is the number to use

`extraction/trackv/analyze_step3a_coverage_oriented.py`, `out/step3a_coverage_oriented.json`. A candidate counts toward a GT wall's coverage only if (i) its direction is within `selection.angular_tolerance_deg` of the wall's direction (mod 180 — reuses the existing, already-justified tolerance, no new constant invented) and (ii) its perpendicular offset from the wall's own centerline is within τ. No orientation-agnostic fallback.

Pre-registered expectation (Dan's, recorded before running): bucket (c) shrinks substantially, (a)+(b) grow, select-stage coverage falls materially below 0.887.

| population | τ | mean | median | min | max |
|---|---|---|---|---|---|
| select-stage | 0.01 | 0.870 | 0.952 | 0.095 | 1.0 |
| pair-stage | 0.01 | 0.586 | 0.762 | 0.0 | 1.0 |
| select-stage | 0.005 | 0.488 | 0.429 | 0.0 | 1.0 |
| pair-stage | 0.005 | 0.516 | 0.571 | 0.0 | 1.0 |

Death buckets, 19 unmatched GT walls, corrected metric:

| bucket | n (old) | n (corrected) |
|---|---|---|
| a — dissect/select blind | 1 | 2 |
| b — select saw it, pair dropped it | 9 | 10 |
| c — coverage exists, match still fails | 9 | 7 |

Contamination (old − corrected, per GT wall, τ=0.01): pair-stage mean 0.087 / median 0.0 / max 0.571; select-stage mean 0.017 / median 0.0 / max 0.048.

**Verdict on the pre-registration: PARTIALLY CONFIRMED, direction right, magnitude smaller than expected.** Bucket (c) did shrink (9→7) and (a)+(b) did grow (10→12), and `w_s23` — the wall used to diagnose the confound — moved from (c) to (b) exactly as the mechanism predicts. But median contamination across the population is **0** — most GT walls were not materially affected; the mean is pulled up by a right-skewed few (max single-wall shift 0.571). Select-stage coverage barely moved (0.887→0.870), not the material fall predicted. Stated plainly per standing discipline: the confound was real and worth fixing, but it does not overturn the overall picture — genuine coverage remains moderate-to-good at τ=0.01 (pair-stage median 0.762) and drops further at the tighter exit-bar τ=0.005 (median 0.571), which is now itself real signal, not an artifact.

**Bucket (b) — select saw it, pair dropped it — is now the single largest identified loss (10/19, 52.6% of unmatched), tied with the corrected coverage drop between stages (0.870→0.586 mean at τ=0.01).** Not yet bisected into its two named suspects (thickness-outlier rejection; no parallel partner found) — that bisection is the next session's work, not done here.

### Tau-sensitivity risk — DOWNGRADED (numbers were contaminated), STRUCTURAL CONCERN UNCHANGED

Prior session's numeric support (pair-stage coverage 0.905→0.667 median, τ=0.01→0.005) came from the retired orientation-agnostic metric and is superseded by the table above: corrected pair-stage median is 0.762 (τ=0.01) → 0.571 (τ=0.005), a real but smaller drop than first reported. Cross-axis contamination is more forgiving at larger τ, so tightening τ strips contamination faster than real coverage — some, not all, of the originally-reported drop was artifact.

**The structural concern itself is independent of this correction and is unchanged, open, RISK — not acted on:**
- Exit-bar τ=0.005 of plan diagonal ≈ 50mm on these plans (15x30 diagonal ≈10.05m).
- GT is `gt_status: "provisional_unaudited"`; `convert_legacy_gt.py` assigns a **default 150mm thickness** where the legacy trace format recorded none. A centerline-vs-face convention difference of half a wall thickness is ~75mm — larger than the entire 50mm error budget at the exit-bar τ.
- Specific checkable suspect, NOW TESTED (`analyze_step3a_face_offset.py`, see the Blocker 1 resumed section below): signed residual between select-stage ink and GT centerline, 17 qualifying walls / 229 segments — median **74.95mm**, essentially exactly half of GT's default 150mm thickness (75mm), not zero-centered (only 5.2% within ±20mm of zero). **Confirmed at the median**, though the full distribution is broad (stdev 122mm), not a crisp bimodal spike — consistent with the next bullet smearing a real constant offset rather than the offset not existing.
- **Independent corroboration that this is a GT artifact, not pipeline noise**: GT's uniform 150mm `legacy_default_thickness` on most walls means real per-wall thickness variation (which the source drawing almost certainly has) smears the centerline-vs-face signal even at zero measurement noise on the pipeline side. The offset is real; its exact per-wall magnitude is unmeasurable against this GT until thickness is actually audited.
- Phase 0's plan requires 30–50 audited plans with 10 double-annotated to establish inter-annotator agreement as a published ceiling. Not done. Phase 2 cannot honestly claim F1≥0.99 @ τ=0.005 against GT whose own precision — and whose own per-wall thickness — at that τ is unmeasured.

Not started: any GT audit work. That is Phase 0 scope and Dan's call, not Phase 2's.

### Explicitly not built this round

No kill rules (guardrail: `eval/` public interfaces stay frozen; the legitimate fix for bucket (c), if it turns out to be needed, is production-side collinear-run-merging in `assemble.py` sized by real evidence, not a matcher change). Bucket (b) not bisected into its two named suspects. Bucket (c)'s 7 remaining walls not re-examined individually. No GT audit work.

### Disposition

Held for Dan's review. Durable artifacts: `analyze_step3a_blocker1_baseline.py`, `analyze_step3a_family_classification.py`, `analyze_step3a_coverage.py` (retired, kept for the record), `analyze_step3a_run_merge_probe.py`, `analyze_step3a_coverage_oriented.py`, and their JSON outputs under `out/`, this section.

**Two of this phase's own hypotheses died this round, both recorded above rather than quietly dropped: sheet_border+dimension are not the over-production story (7.2% combined), and fragmentation/segmentation-convention mismatch is not bucket (c)'s driver (run-merge recovered zero GT walls).** The real gap is recall (10/29 GT walls matched at all) with bucket (b) — pairing dropping candidates select already saw — as the largest identified single loss event. Next session's work, in order: bisect bucket (b) into its two named suspects (thickness-outlier rejection vs. no-parallel-partner-found) via a per-wall attribution histogram before changing any `pair.py` logic; bucket (c) and any run-merging fix stay downstream of that, sized by whatever bucket (b)'s bisection leaves outstanding. Kill rules and any matcher-adjacent work remain explicitly out of scope.

## Step 3a Blocker 1 — ROOT CAUSE FOUND: `pair.py` pairs wall faces with distant unrelated parallel lines

This is the first mechanically-established, quantitatively-verified cause of the recall gap. Everything above it in the Blocker 1 sequence was elimination; this is the positive finding.

### Taxonomy correction — bucket (b) is misnamed and the old name misdirects

The label "select saw it, pair dropped it" is **wrong** and must not be carried forward. Nothing is dropped for these 8 walls: a candidate **exists**, with correct orientation and (post-merge) a near-correct recovered thickness. It simply sits far from the ink. Renamed **`b_displaced_candidate`**. The remaining 2 of the original 10 keep their own distinct name, `below_length_floor` — real, clean, one fifth the size, queued and unstarted.

The old label sends a reader hunting for a rejection that never happened. `analyze_step3a_bucket_b_attribution.py` measured exactly that: `thickness_outlier_rejected` = **0**, `no_raw_partner_found` = **0**. Both originally-named suspects scored zero.

### The measurement (`analyze_step3a_displacement.py`, `out/step3a_displacement.json`)

Three observable pipeline levels, every one measured as a signed perpendicular offset against the *same* reference — the intended GT wall's own centerline, along that wall's normal. Whichever level first shows the displacement is the stage that caused it. No mechanism was assumed in advance.

| wall | GT len (mm) | L1 select ink (min/med/max mm) | L2 pre-merge pair centerline (mm) | L3 final (mm) | displacement |
|---|---|---|---|---|---|
| 15x30 `w_s2` | 4430 | −67 / −67 / −67 | 1467 | 1488 | **+1488** |
| 15x30 `w_s4` | 9018 | −78 / −78 / −78 | −574 | −574 | **−574** |
| 15x30 `w_s6` | 4341 | 10 / 10 / 10 | 877 | 877 | **+877** |
| 30x50 `w_s106` | 3363 | −76 / 31 / 146 | 108 … 3086 | 108 | **+108** |
| 30x50 `w_s111` | 7094 | −64 / 19 / 96 | −983 … 58 | −929 | **−929** |
| 30x50 `w_s117` | 2365 | −36 / 113 / 127 | −1565 … −284 | −1511 | **−1511** |
| 30x50 `w_s138` | 3048 | −98 / −97 / 56 | −2199 … 1202 | −2145 | **−2145** |
| 30x50 `w_s142` | 2612 | −62 / 77 / 87 | −2428 … −371 | −2208 | **−2208** |

**L1 is clean on every wall.** Raw select-stage ink sits within −98…+147mm of the GT centerline — i.e. on the wall, at face offset, exactly as the face-offset finding predicts. The pipeline sees this ink correctly.

**The displacement appears at L2 and is unchanged by L3.** Merging is not the cause; **pairing is**. (This also explains why the earlier bounded-diameter merge counterfactual recovered exactly zero recall — the damage was already done upstream of merging.)

### The mechanism, verified on the full bucket, not inferred from one case

`displacement ≈ half the recovered pair thickness` — the signature of a face paired with the **wrong** partner: the centerline lands midway between the true wall face and some distant parallel line.

| wall | displacement | pair thickness | ratio \|disp\| / (thickness/2) |
|---|---|---|---|
| `w_s2` | 1488 | 3059 | 0.973 |
| `w_s4` | −574 | 1024 | 1.121 |
| `w_s6` | 877 | 1743 | 1.007 |
| `w_s111` | −929 | 1832 | 1.014 |
| `w_s117` | −1511 | 3059 | 0.988 |
| `w_s138` | −2145 | 4500 | 0.954 |
| `w_s142` | −2208 | 4730 | 0.933 |
| `w_s106` | 108 | 78 | 2.776 ← the one exception, and the smallest displacement in the set |

7 of 8 land in 0.93–1.12, median 0.997. `w_s106` (displacement 108mm, thinnest pair) does not fit and is **not** claimed to — its candidate is roughly correctly placed and is failing to match for some other reason, unexamined.

**Direct visual confirmation** (`out/step3a_displacement_overlays.png`, one frame per wall, true scale): in every panel the covering ink lies exactly on the GT centerline, while the final candidate runs parallel and far away, midway to another distant parallel line visible among the member segments. On `w_s6` the arithmetic is visible by eye — ink at y≈11500, an unrelated line at y≈9750, candidate at y≈10600 = their midpoint.

### Why the existing guard never caught it

`pair.py`'s design intent, per its own comment on `MAX_THICKNESS_SEARCH_FRAC`, is *search wide, then reject implausible thickness explicitly* so bad pairs are visible in the funnel rather than silently missing. The first half works; the second half has never fired once.

| | 15x30 | 30x50 |
|---|---|---|
| pair search window (`MAX_THICKNESS_SEARCH_FRAC` = 0.25 · diagonal) | **4077 mm** | **6327 mm** |
| GT wall thickness | 150 mm | 150 mm |
| accepted "plausible" thickness clusters | (11–59), (112–**3775**) | (21–**6324**) — a single cluster spanning everything |
| `n_pairs_rejected_thickness_outlier` | **0** | **0** |
| pre-merge candidates with plausible thickness (150±75mm) | **3%** | **18%** |
| median recovered pre-merge thickness | 653 mm | 504 mm |

Two compounding faults, both structural:

1. **The search window is 27–42× the real wall thickness.** Any wall face has hundreds of parallel partners inside 4–6 metres; the correct partner 150mm away has no privileged status.
2. **The plausibility guard is self-calibrating on the contaminated population it is supposed to filter.** `_thickness_plausible_clusters` clusters the *observed* thickness distribution — and since wrong-partner pairs dominate that distribution (97% / 82% of it), the cluster it derives spans the entire range and accepts everything. On 30x50 it produces one cluster from 21mm to 6324mm. This is the same class of error as fitting the coordinate frame to the predictions being scored: the ruler is derived from the thing it is meant to judge.

`_greedy_select_pairs` compounds it by sorting on longest overlap first, so a long face against a long distant line outranks the correct local pair.

### NOT MEASURED / not claimed

Whether fixing the search window and/or the plausibility guard actually recovers recall — **not simulated, not built, per the standing simulate-before-building rule.** No parameter was changed. `w_s106`'s different failure is unexplained. Whether the same mechanism drives bucket (c)'s 7 walls or the family-classification `other` bucket is untested, though both are now plausible downstream consequences of the same cause and should be re-checked after any fix rather than treated as separate problems.

### Explicitly not built this round

No change to `MAX_THICKNESS_SEARCH_FRAC`, `_thickness_plausible_clusters`, `_greedy_select_pairs`, or any other pair.py logic. No counterfactual re-score of a narrowed window. `eval/` untouched. `below_length_floor` (2 walls) still queued and unstarted.

### Disposition

Held for Dan's review. Durable artifacts: `analyze_step3a_displacement.py`, `out/step3a_displacement.json`, `out/step3a_displacement_overlays.png`, `analyze_step3a_chain_spread.py` (falsified lead, kept), `out/step3a_chain_spread.json`, this section.

**Root cause established: the recall gap is not a rejection problem, a fragmentation problem, or a matcher problem — it is that `pair.py` pairs wall faces with distant unrelated parallel lines, and its thickness guard is calibrated on the very contamination it exists to reject.** The obvious next step — narrow the search window to an architecturally-motivated bound and/or derive the plausibility cluster from something other than the contaminated population — is a *fix*, and per standing discipline must be **simulated offline and scored at τ=0.01 and τ=0.005 before it is funded**, exactly as the run-merge and bounded-diameter counterfactuals were (both of which that rule correctly stopped). That simulation is the next section, and it stopped a fourth.

## NAMED ANTI-PATTERN — the self-certifying guard

**Any guard whose threshold is calibrated on the population it filters will, once that population is dominated by the failure the guard exists to catch, certify whatever the pipeline produces.** It cannot fail loudly. It reports zero rejections and looks healthy.

This is recorded as a named anti-pattern rather than a bug because it is the most transferable finding of the phase, and because this codebase has now hit it **three times in three different modules**, twice before anyone named it.

**Confirmed live instance — `pair.py::_thickness_plausible_clusters`.** Clusters the observed pair-thickness distribution to decide which thicknesses are plausible. Wrong-partner pairs are 82–97% of that distribution, so the derived cluster spans 21–6324mm on 30x50 (a single cluster covering everything) and `n_pairs_rejected_thickness_outlier` is **0 on both plans and always has been**. The guard has never once fired. Same structural error as fitting a coordinate frame to the predictions being scored: the ruler is derived from the thing it is meant to judge.

**Historic instance, already fixed before it was named — `pair.py::_cluster_by_perp`.** Its grouping tolerance was originally `round(perp / thickness * 4)`, keyed to each fragment's *own recovered thickness* — a pipeline-produced, contaminated quantity. Replaced by an absolute fraction of the plan diagonal precisely because noisy recovered thickness was scattering real same-wall fragments. Correct fix, same disease.

**Instance correctly avoided by a domain prior — `select.py::_dominant_axis`, and this is the model to copy.** A plain global argmax over the orientation histogram locks θ onto the *hatch* angle, because hatching outweighs wall strokes in aggregate length on both plans (15x30: ~164k units at bin 44–45 vs ~15k at bin 0). That would have silently inverted the entire selector — keep hatch, reject walls — **with no error signal**, which is the anti-pattern's signature. It was avoided by encoding a real drafting convention (hatch is conventionally drawn ~45° to read as distinct from axis-aligned structural lines) instead of trusting the population's own statistics. **A domain prior, not a data statistic, is what breaks the loop.**

**Audited clean.** `select.py`'s use of `cluster_widths` is diagnostic-only (per-cluster aligned/diagonal counters); actual selection uses an absolute 20° tolerance. `coverage.py`'s Track V/R router uses an absolute 95% bar. `_cluster_by_perp`'s current tolerance is an absolute fraction of diagonal.

**Open / watch — `assemble.py`'s closure bounds.** `AXIAL_EXTENSION_BOUND_FRAC * w.thickness` and `STATIONARY_OVERHANG_FRAC * w.thickness` scale each bound by *that wall's own recovered thickness* — a pipeline-produced quantity now known to be contaminated (median recovered pre-merge thickness 504–653mm against a real ~150mm; only 3–18% of pre-merge candidates are physically plausible). Not the same self-certifying loop, but the same family: a bound trusting a pipeline output that is measurably wrong. **Untested. Must be re-checked after any pairing fix lands, because the thickness it depends on will change.**

**Rule going forward, for this phase and beyond:** a guard's threshold must come from a physical/domain prior, an absolute bound, or a demonstrably uncontaminated reference — never from the distribution it is filtering. If a guard reports zero rejections on real data, treat that as a suspected self-certifying guard until proven otherwise, not as evidence of a clean population.

## Step 3a Blocker 1 — FULL FACTORIAL SIMULATION of the three candidate fixes: all three fail to recover recall

`extraction/trackv/analyze_step3a_pairing_factorial.py`, `out/step3a_pairing_factorial.json`. Simulation only — `pair.py`, `assemble.py`, `eval/` all unmodified; levers applied in a local reimplementation whose all-levers-off cell reproduces the shipped pipeline exactly (43/54 candidates; tp 3/7 at τ=0.01, 2/6 at τ=0.005 — identical to the recorded baseline).

### The physical prior, stated so it can be checked without reference to this corpus

`WALL_THICKNESS_MIN_MM = 50`, `WALL_THICKNESS_MAX_MM = 500`. Lower bound: the thinnest thing built as a wall in residential practice (stud/glass partitions ~50–75mm); below that, two parallel strokes are a drafting artifact, not a wall's two faces. Upper bound: comfortably above half-brick ~115mm, full-brick ~230mm, insulated/cavity exterior ~300mm, and this project's own domain note on Israeli MAMAD safe-room walls at 250–400mm; stone/retaining reach ~500mm. **Neither bound was chosen by trying values against 15x30 or 30x50.** Both are deliberately generous — the job is to exclude the 4–6 *metre* "walls" the current window admits, not to fit a tight range.

Resulting search window: **31.6 native units (15x30) / 20.4 (30x50)**, against the current `0.25 · diagonal` = **257.75** on both.

> **Architectural consequence, flagged now rather than discovered later:** converting a mm prior into pair.py's native units requires mm-per-unit **at pair time**, and the shipped pipeline does not have it there (`units.system = "plan_units"`, `mm_per_unit = None`, `scale_confidence = 0.0`; scale recovery is Phase 5's job). This simulation uses the derived frame constant. A passing result here would therefore **not** have been a drop-in patch — it would need scale-before-pairing or a scale-free restatement of the prior.

### Full factorial, pooled across both plans (29 GT walls)

| cell | candidates | P@0.01 | R@0.01 | F1@0.01 | P@0.005 | R@0.005 | F1@0.005 |
|---|---|---|---|---|---|---|---|
| baseline (none) | 97 | 0.1031 | 0.3448 | 0.1587 | 0.0825 | 0.2759 | 0.1270 |
| greedy | 116 | 0.0345 | 0.1379 | 0.0552 | 0.0172 | 0.0690 | 0.0276 |
| **thickness** | **48** | **0.1875** | 0.3103 | **0.2338** | **0.1667** | 0.2759 | **0.2078** |
| thickness+greedy | 81 | 0.0494 | 0.1379 | 0.0727 | 0.0370 | 0.1034 | 0.0545 |
| window | 88 | 0.1250 | **0.3793** | 0.1880 | 0.0795 | 0.2414 | 0.1197 |
| window+greedy | 104 | 0.0385 | 0.1379 | 0.0602 | 0.0288 | 0.1034 | 0.0451 |
| window+thickness | 70 | 0.1571 | **0.3793** | 0.2222 | 0.1143 | 0.2759 | 0.1616 |
| window+thickness+greedy | 81 | 0.0494 | 0.1379 | 0.0727 | 0.0370 | 0.1034 | 0.0545 |

### THE HEADLINE: the root cause is real, and fixing it does not recover recall

**Best recall in the entire factorial is 0.3793 against a baseline of 0.3448 — one wall.** Every F1 gain in the table is precision-driven (junk deleted), not recall-driven (walls found). The exit bar is F1 ≥ 0.99; the best cell reaches 0.2338.

The window lever *does* work on exactly the walls it was designed for — it recovers **2 of the 8 diagnosed displaced walls** (`w_s106`, `w_s138`, both 30x50; 0 of 3 on 15x30). So the mechanism is confirmed a second time, independently. But **eliminating wrong-partner pairs is necessary and not sufficient**: for 6 of the 8, removing the wrong partner leaves *nothing correct in its place*. The correct opposite face is apparently not in the candidate set at all.

### Pre-registration scored, plainly

| prediction (mine unless noted) | outcome |
|---|---|
| L-window is the dominant lever, recall 0.60–0.75 | **WRONG, badly.** Actual 0.3793 (+1 wall). |
| L-thickness weak on recall because greedy consumes faces *before* the filter runs | **RIGHT on mechanism** — recall 0.3448→0.3103, no gain, the small loss I allowed for. |
| L-thickness precision 0.25–0.45 | **WRONG, too optimistic.** Actual 0.1875 — though it is the single best lever by F1. |
| L-greedy modest, recall 0.45–0.60 | **CATASTROPHICALLY WRONG — wrong direction.** Actual 0.1379, a 60% collapse. |
| all three combined best, recall 0.65–0.85 | **WRONG.** Combined = 0.1379; greedy dominates negatively wherever it appears. |
| no cell reaches the 0.99 exit bar | **RIGHT.** Best F1 0.2338. |
| *(Dan's)* correct pairing improves τ=0.005 by a larger factor than τ=0.01 | **FAILS, and is said plainly as instructed.** Only `thickness` shows it (×1.0 vs ×0.9). `window` actively *hurt* tight-tau recall (0.2759→0.2414). The chain "fix pairing → true centerlines → tight-tau gains" does not hold, because no lever produced materially more correct centerlines in the first place. |

### Why L-greedy collapses — and why the existing sort is right

Nearest-partner-first maximises exactly the failure `_raw_pairs_in_bucket`'s own docstring already warns about: it preferentially consumes segments into the *thinnest* available pairs, which are near-duplicate strokes (double-drawn edges, rendering duplicates, hatch line pairs) sitting almost on top of each other. `MIN_THICKNESS_STROKE_MULTIPLE` blocks the most degenerate of these but not the merely-thin. **Longest-overlap-first is doing real work**: a long shared overlap is genuine evidence of a shared wall run, and proximity alone is not. This lever is falsified and should not be revisited.

### What this reframes — the next lead, NOT started

If the correct opposite face is missing for 6 of 8 displaced walls, the question moves **upstream of pairing**, to whether both faces survive into the candidate set at all. `MIN_CANDIDATE_LENGTH_FRAC = 0.01 · diagonal` drops every segment shorter than **253mm (30x50) / 163mm (15x30)** before pairing is attempted. The earlier attribution already found `below_length_floor` as the primary cause for 2 walls — and on those two, **12 of 14 and 15 of 15** covering segments were below the floor. Its 2/10 headline share may badly understate it, because the floor also silently removes *one face of a pair* on walls attributed elsewhere. This is a hypothesis, unmeasured, and explicitly not acted on.

### NOT MEASURED / not claimed

Why 6 of 8 displaced walls have no correct partner available. Whether the length floor is responsible. Whether the same levers behave differently on the other two Track V plans (Matterport, 20x45) — this factorial covers only 15x30 and 30x50. The scale-free restatement of the physical prior. Any interaction with `assemble.py`'s thickness-scaled closure bounds (flagged above as a watch item).

### Explicitly not built this round

Nothing was changed in `pair.py`, `assemble.py`, or anywhere under `eval/`. No lever was adopted. No threshold was tuned. `below_length_floor` still queued and unstarted.

### Disposition

Held for Dan's review. Durable artifacts: `analyze_step3a_pairing_factorial.py`, `out/step3a_pairing_factorial.json`, this section and the anti-pattern section above.

**The simulate-before-building rule has now stopped four fixes** (closure split-side bound; run-merging; bounded-diameter clustering; and this factorial's three levers). Three of the four looked obviously correct beforehand. The single most valuable output of this phase may be that rule's track record rather than any individual measurement.

**Correction to the previous section's numbers:** `analyze_step3a_chain_spread.py` scored its τ=0.005 row on *un-assembled* walls, reporting baseline recall 0.2069 / precision 0.0619. The correct assembled baseline is **0.2759 / 0.0825**. Its conclusion is unaffected — both arms of that comparison used the same path and recall was identical between them — but the absolute τ=0.005 figures in that section should be read from this factorial's baseline row instead.

## Step 3a Blocker 1 — length-floor test: the fork resolves as BOTH halves, not one

Dan's sharpened hypothesis: `MIN_CANDIDATE_LENGTH_FRAC` deletes the correct partner face before pairing runs, which is why the window fix (previous section) recovered only 2 of 8 displaced walls. Tested directly and decisively on the 6 walls window did *not* recover (`analyze_step3a_length_floor_test.py`, `out/step3a_length_floor_test.json`).

### Method

For each of the 6 walls, using `selection.candidates` (the full pre-length-floor population — the floor is applied only inside `pair_walls()`, never inside `select.py`), split covering ink by which side of the GT centerline it falls on. The known-correct ink side was already established (displacement measurement's L1). The question is the *opposite* side — the true partner face:

- **NEVER_PRESENT** — no segment at all on the opposite side, at any length. The floor is irrelevant; select.py never extracted that face.
- **PRESENT_AND_KEPT** — a segment exists on the opposite side and already clears the *current, unmodified* length floor. The floor is not the cause; something else in raw-pair-formation or greedy selection is.
- **PRESENT_AND_REMOVED** — exists, but every such segment is shorter than the current floor.

### Result: a clean 3/3 split, and the third bucket (the one Dan flagged as mattering most) is empty

| wall | verdict | opposite-side segment(s) found |
|---|---|---|
| 15x30 `w_s2` | **NEVER_PRESENT** | none |
| 15x30 `w_s4` | **NEVER_PRESENT** | none |
| 15x30 `w_s6` | **NEVER_PRESENT** | none |
| 30x50 `w_s111` | **PRESENT_AND_KEPT** | length 7326mm (floor 253mm) |
| 30x50 `w_s117` | **PRESENT_AND_KEPT** | length 2442mm (floor 253mm) |
| 30x50 `w_s142` | **PRESENT_AND_KEPT** | length 2595mm (floor 253mm) |

`PRESENT_AND_REMOVED` — the bucket the hypothesis needed to be right — is **empty, 0/6**. The length floor is not deleting anyone's correct partner on this population. **Dan's sharpened hypothesis is falsified as stated.**

But it forks correctly into two distinct, real problems, neither of which is the floor:

1. **15x30's three walls: recall's ceiling is upstream of pairing, in `select.py`/`dissect.py`.** No amount of pairing-side work — window, thickness, greedy, or floor — can produce a partner that was never extracted as ink in the first place. This is new information: Phase 2's pairing-stage work has a hard ceiling on this plan that has not been located.
2. **30x50's three walls: the correct partner survives, at generous length, well inside even the ORIGINAL window (7326/2442/2595mm, all under the original 6327mm window and trivially under the new 500mm one) — yet the pipeline still pairs the wrong distant line.** This is neither the window, the floor, nor (per the prior factorial) the greedy sort order in isolation. **Unlocated.** A candidate for the actual cause, not yet tested: the correct partner may be getting *consumed by a different wrong pair first* under greedy's overlap-first ordering — i.e., a distant line has even *longer* overlap with the correct-partner segment than the correct pair does, and wins the greedy competition for that segment before the correct pair is ever considered. Flagged as the next specific thing to check, not claimed.

### Joint simulation: window + length-floor, alone and combined

`analyze_step3a_length_floor_factorial.py`, `out/step3a_length_floor_factorial.json`. Same discipline: simulation only, baseline cell reproduces the shipped pipeline. Physical prior, stated without reference to either plan: **`MIN_WALL_FACE_LENGTH_MM = 200`** — the shortest common freestanding architectural wall element (a pier between openings, a corner return, a jamb stub) rarely measures under ~200mm; below that a line is far more likely a dimension tick or hatch remnant, which mirrors `pair.py`'s own stated rationale for having a floor at all.

Pre-registered before running, and derivable directly from the table above without simulating anything: **loosening the floor should recover ZERO of the 6 target walls** — NEVER_PRESENT has nothing to loosen into at any length, and PRESENT_AND_KEPT already clears the current floor. Confirmed exactly:

| cell | candidates | P@0.01 | R@0.01 | F1@0.01 | P@0.005 | R@0.005 | F1@0.005 | of the 6 recovered |
|---|---|---|---|---|---|---|---|---|
| baseline | 97 | 0.1031 | 0.3448 | 0.1587 | 0.0825 | 0.2759 | 0.1270 | 0 |
| length_floor alone | 100 | 0.0900 | 0.3103 | 0.1395 | 0.0600 | 0.2069 | 0.0930 | 0 |
| window alone | 88 | 0.1250 | 0.3793 | 0.1880 | 0.0795 | 0.2414 | 0.1197 | 0 |
| window + length_floor | 86 | 0.1279 | 0.3793 | 0.1913 | 0.0814 | 0.2414 | 0.1217 | 0 |

Length-floor alone *loses* a small amount of recall (0.3448→0.3103) and precision — it admits a few new short candidates elsewhere in the plan that dilute the match without helping it; net negative on this corpus. Combined with the window it adds a rounding-level F1 gain (0.1880→0.1913) with no additional wall recovered. **Confirms the pre-registration exactly: this lever does nothing for the diagnosed problem and should not be pursued further on its own.**

### STRUCTURAL FINDING — named, not fixed this round

**The pipeline expresses physical thresholds as fractions of page geometry, and this is architecturally wrong by construction, not merely mistuned.** `MAX_THICKNESS_SEARCH_FRAC · diagonal` (search window) and `MIN_CANDIDATE_LENGTH_FRAC · diagonal` (length floor) both scale with *sheet size*. A real wall is ~150mm regardless of whether it's drawn on an A4 sheet or a wall-sized plot. Page-relative constants cannot be correct across plans of different scale or zoom — this is the structural reason both constants came out wrong (27–42× and comparably oversized), not a tuning failure, and it is the same family as the self-certifying-guard anti-pattern above: a threshold derived from something other than the physical quantity it is meant to bound.

**Root cause of the root cause: `mm_per_unit` is unavailable at pair time.** The schema's own `units` block (`system: "plan_units"`, `mm_per_unit: None`, `scale_confidence: 0.0`) is explicit that scale recovery is Phase 5's job, downstream of Track V entirely. Pairing therefore has no choice but to reason in page-relative terms. **This is a genuine cross-phase dependency, not a Phase 2 oversight, and it should be raised with whoever owns Phase 5 planning: Phase 2 wants at least a rough scale earlier than currently planned.**

**Proposed, NOT built:** an uncontaminated scale proxy derived upstream of pairing. The legitimacy line, stated explicitly per Dan's constraint: select-stage raw ink is not contaminated by pairing decisions (pairing hasn't happened yet), so a **modal stroke-width or modal parallel-separation statistic taken directly from `select.py`'s output** sits on the correct side of that line. Anything derived from paired output (recovered wall thickness, candidate geometry) sits on the wrong side and would repeat the anti-pattern named above. This proposal is unbuilt, unsimulated, and is Dan's call whether it belongs in Phase 2 or is itself Phase 5 scope pulled forward.

### NOT MEASURED / not claimed

Why 30x50's three PRESENT_AND_KEPT walls still mispair despite a generously-long, in-window correct partner — the greedy-competition hypothesis above is a lead, not a finding. Whether 15x30's NEVER_PRESENT walls are a select.py defect or a genuine feature of that source PDF (occluded face, single-line drafting convention for that wall). The scale-proxy proposal's accuracy or its interaction with anything downstream.

### Explicitly not built this round

No change to any file. No lever adopted. `below_length_floor` lead is now understood to be a null result rather than merely unstarted — recorded as such, not left ambiguous.

### Disposition — arithmetic stated without softening, decision point flagged for the gate, not resolved here

**Best simulated F1 across every cell tried this phase, either factorial, is 0.2338 @ τ=0.01 (`thickness` alone) and 0.2078 @ τ=0.005, against an exit bar of F1 ≥ 0.99 @ τ=0.005.** Today's and the prior session's work is precision-only; **recall is unmoved** (best 0.3793 vs baseline 0.3448, one wall, from a lever that only partly worked) and remains the binding constraint on this phase.

**The fork, stated as it was asked to be, decided at the gate and not here:**
- 3 of 8 displaced walls (15x30) have a located, structural cause — page-relative thresholds and an absent upstream scale — with a proposed (unbuilt) fix path.
- 3 of 8 (30x50) have no located cause at all; the obvious levers are exhausted and falsified.
- 2 of 8 (`w_s106`, `w_s138`) are already fixed by the window lever.
- Whether this constitutes "recall is capped by a removable, structural cause" or "recall's ceiling is unlocated and Phase 2's approach needs reconsidering at the gate" is genuinely mixed evidence for both readings on this 8-wall population, and is Dan's decision, not a conclusion this document reaches on his behalf.

Durable artifacts: `analyze_step3a_length_floor_test.py`, `analyze_step3a_length_floor_factorial.py`, their JSON outputs, this section.
