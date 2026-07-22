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
