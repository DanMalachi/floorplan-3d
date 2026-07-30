# Phase 2 Track V — Milestone 2 Step 3a Handoff

Branch `phase-2-trackv-m2c` (worktree `fp-phase2`). Not merged to main — held on this branch by explicit decision. This document exists so a cold session can resume with zero re-derivation. Full evidence, tables, and residuals live in `reports/phase-2-gate.md`'s step-3a sections; this is the compressed pointer, not a replacement for it.

> **START AT THE BOTTOM: read the "CURRENT STATE (as of 2026-07-30)" section. Everything above it in this document is history.**
>
> Short version for a cold session: Blocker 2 (coordinate frame) is CLOSED — derived, zero fitted parameters. Blocker 1 was reframed from over-production (precision) to **recall**. Its root cause is found and verified — `pair.py` pairs wall faces with distant unrelated parallel lines — and as of 2026-07-30 the remaining "unlocated" sub-case is located too. **Four levers have now been simulated and none recovers recall** (best 0.3793 vs 0.3448 baseline, one wall, against an exit bar of F1 ≥ 0.99). Five hypotheses have been falsified and are recorded so they are not re-attempted. **Nothing has been built or merged. Held for Dan's gate decision.**
>
> One unresolved contradiction is flagged in CURRENT STATE and must be settled before the factorial's negative result is quoted at the gate.
>
> Everything above the "ROOT CAUSE FOUND" section is kept for the record, not as live direction. In particular: the Blocker 2 instructions, the over-production framing, the kill-rule plan, and the bucket-(b) "pair dropped it" label are all **superseded**.

## STATUS

3a is built: `select.py` (axis-alignment), `pair.py` (parallel-pair recovery + thickness-plausibility guard + re-keyed collinear-merge), `assemble.py` (junction snap + junction closure via extend-to-intersection + wall-only schema output), `score_align.py` (scoring-only coordinate adapter, outside `eval/`).

- Schema validity: **1.0 on both plans** (15x30, 30x50) — zero validator errors.
- Cycle closure: **24/50 cycles found** (15x30/30x50), connected components down from 43/54 (every wall isolated) to **7/6**. Closure (extend-to-intersection in `assemble.py`) works as designed and is committed.
- **Wall F1 is not a reportable number right now, on either plan — two independent blockers, not tuning:**
  1. **Candidate over-production** (this session's headline finding): `pair.py` emits ~3x as many wall candidates as GT has walls (54 vs 19 on 30x50). Precision therefore caps at ≈0.35 even at perfect recall — nowhere near the 0.99 exit bar — **regardless of anything in `assemble.py` or downstream**. Frame-independent, measured directly: GT has 2 T-junctions across 19 walls; predictions show 84 accepted T + 46 accepted X across 54 candidates once closure actually connects them (a ~65x topology-density error). This was invisible before closure because every candidate sat in its own isolated component.
  2. **Coordinate-frame unmeasurability** (issue #8) — **CLOSED, see bottom of doc.** Was: 15x30's pinned-transform anchor-fit residuals were 3–6τ, making 15x30's wall F1 UNMEASURABLE under the old 4-parameter anchor fit. Root cause turned out to be the fit itself, not the frame — the frame needed zero fitted parameters all along. Superseded, kept here only so the old numbers aren't mistaken for current.
- **Not merged as a phase-exit candidate** — not because closure failed (it didn't), but because both blockers above are still open.

## WHAT'S DONE AND PROVEN — do not re-litigate, do not re-run to re-confirm

- **`_collinear_merge` re-key** (prior session) — grouping by tight absolute perpendicular tolerance, not each fragment's own noisy thickness. Two required guardrail tests green, unchanged this session.
- **Junction closure** (`_resolve_junction_closure` in `assemble.py`, this session): for every wall-end still dangling after the cheap tolerance-only snap, finds cross-orientation partners, computes the *exact* infinite-line intersection (exact because every wall is analytically axis-aligned within one global theta frame — `pair.py`'s `_bucket_wall`), and either **SPLITS** the stationary partner (crossing strictly interior to its span — T/X) or **MOVES** a dangling endpoint to meet it (L-corner). Two independently-scaled bounds (generous axial-extension for genuinely dangling ends, tight overhang for near-misses on non-dangling ends), both keyed to each wall's own thickness. Candidates are enumerated and gated in one batch, never pairwise-in-sequence; splits on one wall are batched into a single N+1 cut, never iterative. Rejected candidates are logged with the bound they failed. Split pieces carry `parent_wall_id`. 10 new tests + both pre-existing collinear-merge guardrails green; full suite 51 passed, 3 xfailed.
- **`enable_splitting` diagnostic flag**: `assemble(..., enable_splitting=False)` / `run_step3a.py --no-splitting` runs the exact pre-split candidate set through the same funnel/eval path (verified: wall count bit-identical to pre-closure, 43/54). Use this, not code reverts, for any further over-production diagnostics.
- **`wall_parent_ids` funnel sidecar** (non-schema — the frozen schema has no parent field): lets a future script recover which split pieces came from which original wall, e.g. to re-merge 30x50's pinned-transform anchor walls (`W0`, `W22`, `W23` — all three got split by closure) without re-fitting the transform.
- **Pinned-transform scales** (prior session, unchanged in substance, but anchor wall IDs are now stale post-closure — see below): 15x30's anchor-fit residuals are 3–6τ (untrustworthy — this is *why* 15x30 is UNMEASURABLE). 30x50's clean 4-anchor fit has residuals ~0.8τ (trustworthy). Don't re-derive from scratch; if re-running, resolve the anchor walls via `wall_parent_ids` first (they're pre-split IDs that no longer exist standalone).

## WHY THIS ISN'T A MERGE-READINESS SESSION — two blockers, prioritized

**BLOCKER 1 — candidate over-production. Start here.** Per Dan's own arithmetic: 19 GT walls vs. 54 candidates on 30x50 caps precision at 0.35 pre-split (0.15 post-split, 19/230) — no downstream fix reaches 0.99 while this holds. Already in Phase 2's own scope per `extraction-plan.md` ("layer/color metadata harvesting; residue classification hooks... use geometric priors only"), not scope creep into P4/P6. Concrete leads already identified from this session's inspection: `W2` (15x30... actually 30x50) crosses three ~275-unit verticals `W26/27/28` at three different points; a second triad `W46/47/48` mirrors the pattern against a neighboring wall — repeating triads of near-identical-length parallel segments, consistent with window mullions/frame elements passing the thickness-plausibility guard.

Do these **in this order**:

1. **Layer/color/stroke metadata check first** — may be free (paper 5.2 step 1). **Decision rule, fixed before you start (so this doesn't stall on the fork):**
   - **Measure the separation over the full population, don't inspect a handful.** `W0`/`W22`/`W23` vs. `W2`/`W26-28`/`W46-48` is how the over-production hypothesis was *formed*, not how it should be *tested*. 30x50's pinned transform is trustworthy at ~0.8τ — good enough for the coarse real/spurious question. Label **all 54 pre-split candidates** real/spurious against GT's 19 walls, and report layer/color/stroke as a **confusion matrix over the full set**, not a few examples.
   - **Run this on the pre-split candidate set** (`--no-splitting`) — classification is upstream of splitting; the 230-wall post-split view only adds noise.
   - **By outcome:**
     - *Clean separation* (metadata partitions real from spurious, zero real walls lost against all 19 GT walls): use it as a filter. Free, no thresholds, exactly paper 5.2's "high-precision evidence."
     - *Partial separation*: do **not** half-filter. A partially-predictive channel used as a hard filter is the fastest way to lose a real wall and poison recall, and the 0.99 bar has zero room for that. Record it as an evidence field on the candidate instead, and move to periodicity.
     - *No separation* (single layer, shared colors, or PyMuPDF exposes no optional-content groups at all — common in marketing/CAD-export PDFs): report as a one-paragraph negative result and go straight to periodicity. A negative here is cheap and informative, not a failed session.
   - The deliverable is the confusion matrix, not a verdict — bring it to a STOP before building any filter.
2. **Periodicity/repetition signature second**, only if metadata doesn't cleanly separate them — the observed pattern is exactly paper 5.6 Layer 2's named signature (1-D FFT along the candidate population to catch periodic hatching/mullions/stair-treads), and is what milestone-2-step-2 already predicted would eventually be needed. Deterministic geometry only, no cross-evidence voting (that's P6's).

**Explicitly ruled out, do not re-attempt**: a length- or connectivity-based bound on the SPLIT side of closure. Considered and rejected this session — it would suppress the over-production symptom, restore a plausible-looking wall count, and destroy the clearest quality signal Phase 2 has produced. It is exactly the "threshold-tuned-around-a-symptom instead of a measured, specific fix" pattern this project's discipline forbids.

**Framing to carry forward**: this is paper §5.2's own predicted failure mode coming true almost verbatim ("Track V's geometric error is essentially zero; its risk is purely semantic") — a good sign about the blueprint, independent of it being bad news for the exit bar. Don't read the over-production finding as something having gone wrong this session.

**BLOCKER 2 — issue #8, coordinate-frame unmeasurability.** Direction from the prior STOP, not re-scoped here: the goal is to **eliminate the fitted transform, not fit a better one** (fitting on the same predictions you score is circular). Factual question to answer first: does a page-unit form of this corpus's GT exist upstream of its mm conversion (the Phase-0.4 SVG-authoring path implies SVG user-space was the original frame)? If yes, issue #8 collapses to "score Track V in page units." If no, the mm↔page relationship is Phase 5's scale-recovery job, not Phase 2's to hand-fit. One bounded falsification test worth running: refit the similarity by global least-squares over *all* confidently-matched wall pairs rather than 3–6 hand-picked anchors — if 15x30 drops under ~1τ, it was anchor selection; if it stays 3τ+ with anisotropic structure, the similarity model itself is wrong and 15x30 is out for this milestone on that evidence.

## DEBT / WATCH — carried forward, not regressions, do not silently drop

- **Manhattan-bias `xfail` test** (`tests/test_select.py`) — unchanged, still `xfail(strict=True)`, still out of scope until Phase 7.
- **X-junction count is NOT zero** (`tests/test_assemble.py::test_x_junctions_are_zero_on_real_corpus`, `xfail(strict=True)`) — 31 (15x30) / 46 (30x50), far from the "probably zero" prediction. This is itself evidence for Blocker 1, not a closure bug — do not "fix" by loosening or deleting the test; it should start passing (or be replaced by a real threshold) only once over-production is actually addressed upstream.
- **Both collinear-merge guardrails must stay green** through any further work here — unchanged this session, still the anti-over-merge tripwire.
- **30x50's GT runs meaningfully off-nominal** — known, already-diagnosed, not new.

## DONE SINCE THIS DOC WAS WRITTEN — metadata check, closed as a negative result

Full section in `reports/phase-2-gate.md` ("Blocker-1 step 1 — style-metadata separation"). Compressed:

- **Metadata cannot separate real from spurious candidates on this corpus, and the verdict needs no coordinate frame.** 4 of 5 channels take exactly ONE value across all 54 pre-split candidates (`layer` all `None` — neither plan has any optional-content groups at all; `fill_color`, `stroke_width` 0.72, `dashes` all uniform). `stroke_color` partitions {50, 2, 1, 1}, so the best wall-F1 *any* filter on it could reach is **0.5507** vs. the 0.99 bar — computed from bucket sizes alone (`F1 ≤ 2·min(k,n)/(k+n)`), never from a label. 15x30 matches: {43}/{43}/{43}/{43} and {39, 4}.
- **Do not re-run this expecting a different answer, and do not build a metadata filter.** The decision rule's third branch fired.
- **The labeled confusion matrix was built and is VOID** — at τ=1% only 6 of 19 GT walls have any candidate lying on them. SPURIOUS was absorbing frame-displaced real walls. Retained in `out/step3a_metadata_confusion.json` under `labels_trustworthy: false`; never quote it.
- Additive pipeline changes only: `dashes`/`seqno` on `VectorPrimitive`, `member_source_indices` on `WallCandidate` (a merged wall's `source_segment_indices` is only its first chain member's two faces — provenance analysis needs the rest). Predictions bit-identical; suite 52 passed, 3 xfailed.

**New evidence bearing on Blocker 2, and on whether the two blockers are independent:** the 4 clean anchors re-fit to the recorded residuals *exactly* (0.1 mm), yet the rest of the plan does not follow — 16/19 GT walls have an orientation+overlap-compatible candidate but only 6 clear the lateral bound. Displacement is sharply x-heavy: median **627 mm in x (≈4.3τ) vs 74 mm in y (≈0.5τ)**, against an envelope error of −5.29% x / +0.54% y. Two mechanisms were tested over the full population and **both falsified**: fit-degrades-with-anchor-distance (r=0.063) and single-wrong-uniform-x-scale (r=0.14). The mechanism is NOT established — do not assume one. Untested third candidate: the per-GT "best candidate" is drawn from an over-produced set, so correspondence error and frame error may be mixing, which would mean **Blocker 1 and Blocker 2 are not independent** as assumed since the closure round.

## BLOCKER 2 CLOSED — frame is derived, zero fitted parameters

Full derivation, formula, and evidence in `reports/phase-2-gate.md`'s "Step 3a Blocker 2 (issue #8)" section — read that before touching anything frame-related. Compressed:

- **`mm_per_pred_unit = metersPerPixel * 1000`, rotation = 0, translation = 0.** 15x30 = 8.323667459886908, 30x50 = 12.918215560344834. Not fit — derived from constants both sides of the pipeline already assert (`run_step3a.py`'s existing `_gt_scale`, the legacy hand-trace tool's recorded `metersPerPixel`, `convert_legacy_gt.py`'s pure-scalar conversion). Regenerate via `extraction/trackv/analyze_step3a_frame.py`, don't hand-recompute.
- Confirmed two ways: (1) full-population nearest-GT-endpoint residual — mode at the origin, single-digit-to-low-tens-of-mm median for endpoints that land near any GT vertex at all; (2) direct visual review of the overlay (`out/step3a_frame_overlay.png`) by Dan — envelope sits on GT exactly, both plans, no shift, no flip.
- The old 3–6τ "unmeasurable" reading on 15x30 was an artifact of the prior 4-parameter anchor fit (scale+rotation+tx+ty from 3–6 hand-picked anchors), not a property of the frame. Anchor selection was the bug; the frame needed no fitting at all.
- **Do not re-open this.** Do not fit translation, rotation, or scale on this corpus's frame again. If a future plan's frame looks wrong, re-derive from its own `metersPerPixel`/`_gt_scale`, don't hand-fit.

**Correction — do not carry the 3.7%/9.4% vertex-proximity figures into Blocker 1 as a recall or over-production baseline.** Those came from the endpoint-residual diagnostic (fraction of predicted endpoints landing within 300mm of *any* GT vertex) and are a stricter test than wall correctness: a correctly-extracted wall that's merely split at a different point, or that legitimately terminates mid-span at a T-junction, contributes endpoints far from any GT vertex and scores zero on that test even though the wall itself is right. Dan reviewed the overlay directly and confirms substantial red-on-green collinearity — wall-level recall is materially higher than 3.7%/9.4%. **Blocker 1 needs its own wall-level matched baseline (the harness, tau-based) measured fresh at the start of that session** — do not reuse the vertex-proximity numbers as if they were it.

## SUPERSEDED RESUME POINTER (over-production / kill rules) — kept for the record only

The plan that stood here — measure a matched baseline, classify candidates into `{sheet-border, dimension, furniture/fixture, other}`, then write kill rules — **was executed and is finished.** Its conclusion inverted its own premise: precision work cannot reach the exit bar and over-production is not the blocker. See below. Do not restart it.

---

# ROOT CAUSE FOUND — `pair.py` pairs wall faces with distant unrelated parallel lines

Full evidence, tables and overlays: `reports/phase-2-gate.md`, section "Step 3a Blocker 1 — ROOT CAUSE FOUND". Read that before touching anything. Compressed here so a cold session can act without re-deriving.

## The finding

Raw select-stage ink is **correct** — it sits within −98…+147mm of the GT centerline on every affected wall (face offset, as expected). The wall candidate built from that ink lands **107–2208mm away**, because `pair.py` matched a true wall face against a distant parallel line instead of its own opposite face 150mm away. Verified across the full affected population, not inferred from one case:

- `displacement ≈ half the recovered pair thickness` — the exact signature of a wrong-partner pair. 7 of 8 walls land at ratio 0.93–1.12, median 0.997. (`w_s106`, the smallest displacement, does not fit and is not claimed to.)
- Measured as a three-level decomposition (L1 select ink → L2 pre-merge pair centerline → L3 final merged), all against the same reference. **L1 clean, displacement appears at L2, unchanged by L3.** Pairing, not merging.
- Confirmed by direct visual review of `out/step3a_displacement_overlays.png` (one frame per wall, true scale).

## Why the existing guard never fired

| | 15x30 | 30x50 |
|---|---|---|
| pair search window (`MAX_THICKNESS_SEARCH_FRAC` = 0.25 · diagonal) | 4077 mm | 6327 mm |
| GT wall thickness | 150 mm | 150 mm |
| accepted "plausible" thickness clusters | (11–59), (112–3775) | (21–6324) — one cluster, spans everything |
| `n_pairs_rejected_thickness_outlier` | 0 | 0 |
| pre-merge candidates with plausible thickness (150±75mm) | 3% | 18% |

1. The search window is **27–42× the real wall thickness** — the correct partner has no privileged status among hundreds of candidates inside 4–6 metres.
2. `_thickness_plausible_clusters` **calibrates itself on the contaminated population it is meant to filter**. Wrong-partner pairs are 82–97% of that population, so the derived cluster spans the whole range and rejects nothing. Same class of error as fitting the coordinate frame to the predictions being scored.
3. `_greedy_select_pairs` sorts on longest overlap first, so a long face against a long distant line outranks the correct local pair.

## SUPERSEDED RESUME POINTER (simulate-the-fix) — kept for the record only

The plan that stood here — "nothing has been fixed, the next job is to simulate a fix" — **was executed across three further sessions and is finished.** Both named levers were simulated, plus a third and a fourth. See "CURRENT STATE" below. Do not restart it.

---

# CURRENT STATE (as of 2026-07-30) — read this section, everything above is history

Branch `phase-2-trackv-m2c`, worktree `fp-phase2`, not merged. **Held for Dan's gate decision.** Full detail in `reports/phase-2-gate.md`'s last four sections, in order: ROOT CAUSE FOUND → pairing factorial → length-floor test → greedy competition.

### What has been simulated, and what it measured

All simulation-only, `eval/` never touched, baseline cells reproducing the shipped pipeline exactly.

- **Pairing factorial** (`analyze_step3a_pairing_factorial.py`), full 2³ over search window / thickness guard / greedy sort. **Best recall in all 8 cells = 0.3793 vs baseline 0.3448 — one wall.** Every F1 gain is precision-driven; best cell is `thickness` alone at F1@0.01 0.2338. **`L-greedy` (nearest-first) is catastrophic (recall 0.1379) — longest-overlap-first must not be revisited as a wholesale replacement.**
- **Length-floor test + factorial** — Dan's hypothesis (the floor deletes the correct partner) **falsified, `PRESENT_AND_REMOVED` is empty 0/6.** Forks into NEVER_PRESENT 3/6 (15x30, upstream ceiling) and PRESENT_AND_KEPT 3/6 (30x50).
- **Greedy competition** (`analyze_step3a_greedy_competition.py`, this session) — **the PRESENT_AND_KEPT cause is LOCATED.** Correct pair formed 3/3, accepted 0/3, decided on the primary sort key 13/13. The correct near face is fragmented while its partner is not, so absolute overlap caps at the fragment length and a long unrelated parallel line out-scores the correct pair for the partner segment and consumes it. Thieves sit at 1831.9 / 3058.6 / 4730.3mm recovered thickness.

### Exit-bar arithmetic, unsoftened

Best simulated F1 anywhere this phase: **0.2338 @ τ=0.01, 0.2078 @ τ=0.005, against an exit bar of 0.99 @ τ=0.005.** Recall essentially unmoved all phase. Recall is the binding constraint.

### The 8 displaced walls, current tally

| status | walls | reachable from pairing? |
|---|---|---|
| fixed by window lever | `w_s106`, `w_s138` | yes, already |
| located pairing cause + enough ink coverage to match | `w_s117` (90.3%), `w_s142` (93.5%) | **yes** |
| located **upstream** ceiling in select/dissect | 15x30 `w_s2`/`w_s4`/`w_s6` (no partner ink at all), 30x50 `w_s111` (34.4% coverage) | **no** |

### DO THIS FIRST NEXT SESSION — one cheap measurement, highest value in the phase

**There is an unresolved contradiction between the two most recent sections and it must be settled before anything is built or quoted at the gate.** Every thief that steals `w_s117`/`w_s142`'s correct partner has a recovered thickness of 3058.6 / 4730.3mm — far outside the 50–500mm physical window the factorial simulated — and both walls clear the matcher's `overlap_ratio > 0.8` bar. **On that evidence the window lever alone should have recovered them; the factorial says it recovered 0 of these 6.** Both cannot be right as stated.

The decisive test: re-run `analyze_step3a_greedy_competition.py` **with the narrowed window applied** and observe who consumes the correct partner then. Three untested explanations — (a) a different thief inside the narrowed window takes over; (b) `_collinear_merge` drags the correct wall's centerline off afterwards; (c) `match_walls`'s one-to-one Hungarian gives the GT wall to another candidate. **Until settled, do not quote the factorial's "all three levers fail" as a settled negative at the gate.**

### Then, and only if the contradiction resolves in favour of a real fix

The pairing defect is now specific enough to state: **overlap length is compared in absolute terms across pairs of wildly differing plausibility, with no thickness admissibility applied first.** Any fix must be simulated before it is built, per the standing rule below. Note this is *not* a licence to reorder greedy to nearest-first — that is already measured as catastrophic.

### Also available, honestly sized

- **Exact-duplicate deduplication of the select population** — newly measured: **35.1% of 30x50's 22513 select candidates and 13.7% of 15x30's are exact geometric duplicates.** Unusually safe (exact identity, no threshold, cannot lose a real wall) but it removes no thief, so **expect no recall gain**; its value is halving 30x50's pairing population so later diagnostics are cheaper and less noisy. Precision-only, and precision alone cannot reach the bar.
- **The upstream ceiling (4 of 8 walls)** is now the larger share of the displaced population and is entirely outside `pair.py`. Nobody has looked at why those near faces are missing or fragmented. This is where recall actually lives, and it is select/dissect work, not pairing work.
- **Cross-phase scale dependency** — `MAX_THICKNESS_SEARCH_FRAC` and `MIN_CANDIDATE_LENGTH_FRAC` both scale with *page* geometry because `mm_per_unit` is unavailable at pair time (Phase 5 owns scale recovery). Architecturally wrong by construction, not mistuned. Proposed (unbuilt, Dan's scope call): an uncontaminated scale proxy from select-stage stroke-width/separation statistics — legitimate only because it is upstream of pairing.

## Falsified — recorded so they are not re-attempted

- **Sheet border + dimension lines as the over-production story.** 7.2% of candidates combined. Killing both perfectly is worth almost nothing.
- **Fragmentation / segmentation-convention mismatch as bucket (c)'s driver.** Run-merge with no gap bound: 97→86 candidates, recall 0.345→0.345, **zero** GT walls recovered.
- **Chain-clustering drift in `_cluster_by_perp` as the displacement cause.** Spread/threshold correlation with unmatched status r=−0.09 (wrong sign); bounded-diameter counterfactual gave **identical** recall and *worse* precision (0.1031→0.0917, candidates 97→109). The drift is real (7/48 groups exceed tolerance) but is not what breaks these walls.
- **Both originally-named bucket-(b) suspects** — `thickness_outlier_rejected` = 0, `no_raw_partner_found` = 0.
- **Coverage measured without an orientation constraint** (`analyze_step3a_coverage.py`) — retired; every GT endpoint sits at a junction where a crossing wall is trivially within τ. Use `analyze_step3a_coverage_oriented.py`.
- **Fitting the coordinate frame** — closed, derived, zero parameters. Never re-fit.

## Standing constraints, unchanged

- `eval/` public interfaces are **frozen**. Loosening `overlap_ratio` or relaxing Hungarian one-to-one is a frozen-contract violation *and* the same error as fitting the frame — making the ruler agree with the prediction. If you find yourself editing anything under `eval/`, stop.
- Do not touch closure's SPLIT-side bound (see "Explicitly ruled out" above — still ruled out).
- Do not touch the pairing **geometry** — recovered thickness on a correct pair is ~149mm against GT's 150mm. The centerline math works; *which segments get paired* is the defect.
- Bring measurements to a STOP before building. Every round of this phase has done so.
- **GT-audit risk stays open and is Phase 0 scope, not Phase 2's**: `provisional_unaudited`, default 150mm thickness, exit-bar τ=0.005 ≈ 50mm, inter-annotator agreement never measured. Independently corroborated this round — GT's uniform default thickness measurably smears the face-offset signal. Do not start audit work; do not let the exit bar be claimed against unaudited GT without saying so.

## Model escalation

Per `docs/extraction-plan.md` Phase 2, wall-face pairing is designated **Opus 4.8 / xhigh** — that is exactly where this is now stuck. If the terminal is restarted on Opus mid-stream, that is the plan being followed, not a reset. This document is the handoff; nothing is lost.
