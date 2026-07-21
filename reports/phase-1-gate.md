# Phase 1 Gate Report — Baselines

Branch `phase-1-baselines` (worktree `fp-phase1`, forked from `main` @ `c6614c5`). Per `docs/extraction-plan.md` Phase 1: **no pass bar — this phase exists to be honest about the starting point and to sanity-check the harness on real predictions.** Everything below is MEASURED against the harness (`python -m eval.cli selftest` PASS on this worktree before scoring anything); nothing is estimated. `eval/` (τ, the Hungarian matcher, all metric code) is untouched throughout this phase — frozen per CLAUDE.md rule 5, P0-owned.

## Status: all five baselines complete (15/15 each)

The phase plan specifies four baselines: (a) CubiCasa5K pretrained, (b) frontier VLM, (c) classical OpenCV, (d) the legacy pipeline as shipped. (d) is reported as two rows — (d1) legacy's free heuristic stage alone, (d2) legacy's full shipped pipeline including its paid VLM classification step — because the delta between them is itself informative (see the per-stratum table).

> **Unambiguous bar, stated once, referenced everywhere below as "(d = d2)": (d) = (d2) Legacy+VLM = the full shipped pipeline including its paid VLM classification step. Mean wall F1 = 0.078, mean wall-mask IoU = 0.119. This is the number the rebuild must beat. (d1) is the no-VLM ablation of (d) — its 0.057 is diagnostic context (it shows how much of (d)'s score the VLM step buys), not the bar.**

| Baseline | n/15 |
|---|---|
| (a) CubiCasa5K pretrained + naive vectorization | 15/15 |
| (b) Frontier VLM (Claude Sonnet 5) | 15/15 |
| (c) Classical OpenCV | 15/15 |
| (d1) Legacy pipeline, free heuristics only | 15/15 |
| (d = d2) Legacy pipeline, full shipped pipeline (+ paid VLM classification) | 15/15 |

## Corpus caveat

`eval/registry/registry.csv` has 15 plans with ground truth, all `gt_status=provisional_unaudited` — **not** the 30–50 audited-plan bar Phase 0 originally targeted (`reports/phase-0-gate.md` §5 explicitly left "run Phase 1 against the 15 provisional plans in the meantime" as Dan's call; starting Phase 1 was that call). Every number below is scored against this provisional set and should be read as a directional signal, not a calibrated benchmark.

**Room metrics are unmeasurable on this corpus, not just weak.** Every provisional GT plan carries `rooms: []` — the legacy hand-trace format this GT was converted from never derived planar faces (`extraction/synth/convert_legacy_gt.py`'s own documented limitation). `room_label_accuracy = 1.0` and `room_count_error ≈ 0` for every baseline is a **vacuous match** (zero GT rooms vs. zero-or-attempted predicted rooms), not evidence of correct room reconstruction. Ignore both fields until Phase 0's room-GT gap is closed.

**Strata are registry-derived, not GT-derived.** `score_corpus`'s own stratum key reads `encoding_class`/`convention_class`/`scope_class` from each GT plan's `source` block, but the legacy-GT conversion script stamped every converted plan with the same placeholder values there — collapsing 4 real strata into 1. The table below uses `eval/registry/registry.csv`'s per-plan classification instead (assigned manually in Phase 0), which does vary correctly.

## Measurement methodology: the scale-only rescale shim

Every baseline emits raw render-pixel coordinates (`units.system: "plan_units"`, uncalibrated — none attempt scale recovery, which is explicitly Phase 5 scope). Every provisional GT plan is calibrated to millimeters. Scoring predictions directly against GT with no conversion produces a flat 0.000 wall F1 for everyone (paper §2's **F5**, universal here) — an artifact that would hide the actual geometric signal Phase 1 exists to measure.

**Shim used for every number below** (`extraction/baselines/summarize.py::_rescale_to_gt_extent`, Phase-1-owned code, not `eval/`): each prediction is uniformly rescaled so its wall bounding-box diagonal matches GT's, before scoring. Scale-only — no translation/origin correction. This was diagnosed in-session (filed as GitHub issue #5) and found to be incomplete but not the dominant driver of the low absolute scores; a candidate improvement exists but **is not merged** and none of the numbers in this report use it.

`common.infer_junctions` runs on every baseline's wall list — snapping nearby endpoints and re-deriving junction type from wall degree — immediately before scoring, discarding whatever junctions a baseline itself proposed (relevant to (b), whose prompt asks for a `junctions` array), so junction-derived signals compare geometry uniformly. (Corner/junction metrics aren't wired into `score_plan` yet — `eval/metrics/matching.py::match_corners` exists but isn't called from `eval/metrics/engine.py` — so this has no metric surface to show up in this report; noted for whoever wires it up.)

## Per-stratum table (wall F1 @ τ=1%, scale-only rescale)

| Stratum | n | (a) CubiCasa5K | (b) VLM (Sonnet 5) | (c) OpenCV | (d1) Legacy free | **(d = d2) Legacy+VLM, shipped** |
|---|---|---|---|---|---|---|
| R / hatched / single | 3 | 0.000 | 0.020 | 0.000 | 0.060 | **0.120** |
| R / poche / single | 10 | 0.020 | 0.030 | 0.010 | 0.060 | **0.080** |
| V / poche / multi_floor | 1 | 0.000 | 0.080 | 0.000 | 0.010 | **0.020** |
| V / single_stroke / single | 1 | 0.030 | 0.020 | 0.020 | 0.030 | **0.030** |
| **Overall mean (n=15)** | **15** | **0.018** | **0.035** | **0.011** | **0.057** | **0.078** |

**(d) Legacy+VLM, mean wall F1 = 0.078 — this is the number the rebuild must beat.** It is the strongest of the four phase-plan baselines by a clear margin. Ranking: (d) > (d1, its own free-heuristic stage) > (b) frontier VLM > (a) CubiCasa5K > (c) classical OpenCV. The two-stage design — classical candidate generation, then VLM classification of already-localized candidates — beats every from-scratch approach, including a frontier VLM asked to do full-plan extraction end-to-end in one shot. This is the paper's §3.5 division-of-labor thesis (VLMs classify localized candidates; they don't detect/locate well on their own) showing up empirically, not just in the cited literature.

## Validity

| Baseline | Validity rate |
|---|---|
| (a) CubiCasa5K | 100% (15/15) |
| (b) Frontier VLM | **0%** (0/15) |
| (c) Classical OpenCV | 100% (15/15) |
| (d1) Legacy free | 100% (15/15) |
| (d = d2) Legacy+VLM | 100% (15/15) |

(a), (c), (d1), (d)'s 100% is a byproduct of scope, not topological robustness: all four emit `rooms: []` and `openings: []` by design (no solver exists yet to build either), trivially satisfying `cycles_closed`, `openings_in_span`, and the portal/zone rules.

Baseline (b) is the one baseline that attempts the *full* schema (walls + nested openings + room wall-cycles, per its own prompt), and fails schema validation on **every plan**, even after best-of-3 self-consistency selection. Dominant cause: **`cycles_closed` violations** — the model's own room `wall_cycle`s reference walls whose endpoints it never made coincide with their neighbors (e.g. `1350-Sq-Ft-Modern-House-Plan`: "room r1: walls w18 and w1 do not share an endpoint within 0.001"). One plan (`20x45-Model`) shows the model reaching for `role: "portal"` unprompted (inferred from the schema text embedded in the system prompt) but getting the hard rule wrong — thickness must be exactly 0 for a portal; it emitted 75.5. Direct, first-party confirmation of the paper's central thesis: topology is the hard part, and verifiable-reward RL (FloorplanVLM's 90.2%→96.1% validity jump from adding a watertightness reward) exists precisely because plain prompting doesn't get you there.

## Failure gallery (tagged to paper §2's F1–F6 families)

Evidence below combines the full-corpus numbers with a deep dissection of two plans on baseline (d): the **best-scoring plan** (`732584435...`, F1=0.396, the ceiling of this entire report) and the **median-scoring plan** (`739609728...`, F1=0.042, independently verified as the true median of (d)'s 15 F1 scores — 7 plans score lower, 7 score higher). The two tell different stories and both are needed: the ceiling shows how much of the *low end* is metric strictness rather than bad geometry; the median shows that the *typical* plan's low score is not.

*Tags below were checked against `docs/paper.md` §2 directly (read in full this session, lines 131–158) — not inferred from titles. One self-correction from an earlier pass: baseline (a)'s over-segmentation was first filed under F1; on re-reading §2's actual F2 text — "segmentation-mask vectorization introduces its own jitter at every mask boundary" — it's a verbatim match for (a)'s mechanism (a correctly-classified wall-class mask, mis-vectorized into fragments), not a semantic-confusion case. Moved below. One tag is flagged as a judgment call rather than a clean fit (F5, marked inline) — everything else below is a direct textual match, cited.*

- **F1 — Semantic confusion, severe, baseline (c).** §2: "hatching and poché texture... dimension chains and their extension/leader lines... text strokes." Wall count per plan ranges 306–3423 (median ~530) against GT wall counts in the tens — Hough-line clustering on exactly these surfaces reads almost all of it as candidate wall segments. The paper's own predicted failure mode for pre-2017 classical pipelines (§3.1).
- **F1, reduced by classification, (d1) vs (d).** §2: "Lines that look like walls but aren't... furniture edges... text strokes" being kept as candidates, then correctly rejected once classified. Legacy's free heuristic stage keeps every geometrically-plausible candidate regardless of semantics (64–921 walls/plan). Adding the paid VLM classification step collapses that to roughly 28–348 walls/plan and lifts mean wall F1 from 0.057 to 0.078. On the median plan specifically, the VLM stage still leaves real false positives: **67% of (d)'s predicted walls (74/110) don't correspond to any GT wall at all** — F1 confusion is reduced by classification, not eliminated, and is a real, typical-case phenomenon, not just a best-case artifact.
- **F2 — Geometric imprecision, baseline (a) (retagged from F1 — see note above).** §2, verbatim: "segmentation-mask vectorization introduces its own jitter at every mask boundary." CubiCasa5K's domain-pretrained wall-class mask is a *correctly classified* wall region (unlike (c)'s hatching/text confusion) — the failure is purely in naive vectorization (skeletonize → jitter), not in what got called a wall. 82–288 walls/plan vs. GT's tens; wall-mask IoU (0.03–0.57, mean ~0.17) is often *higher* than element-matched wall F1 (~0.02) — the mask silhouette lands in the right place, but "collinear walls broken into misaligned fragments" (§2's own phrase) means the coordinates rarely land within tolerance.
- **F2 — Geometric imprecision, real even at the ceiling, baseline (d).** §2: "corners displaced... coordinates are off." On (d)'s *best* plan, a strict collinear+span-adjacency check finds 54% of predictions are clean 1:1 correspondences to a single GT wall — but the harness's own tight endpoint/overlap matcher confirms only 36% (18/50) as actually matched. The gap (**18% of predictions**) is real positional imprecision on structurally-correct segments — endpoints not landing close enough, or overlap short of the required 80% — independent of both fragmentation and registration.
- **F3 — Topological breakage, total, baseline (b).** §2: "rooms that don't close" — verbatim. 0/15 valid, dominated by unclosed room cycles the model's own wall coordinates don't support (see Validity above).
- **F4 — Omission.** §2: "openings in dense areas missed... short wall stubs lost." Opening F1 = 0.000 for every baseline including (b) (whose rooms/walls topology is already broken enough — F3 above — that opening attachment inherits the same coordinate inconsistency). On walls specifically, the median-plan dissection shows this is a real, typical failure, not just an unattempted-scope gap: **32% of GT walls (11/34) have zero covering prediction from (d) at all** — genuinely missed, not merely mis-scored.
- **F5 — Scale and frame errors, universal — judgment call, flagged.** §2 lists "mixed units" as an explicit F5 sub-case, which textually covers every baseline here (`plan_units` vs. GT's `mm`). But §2's other F5 examples (misread dimension text, misinterpreted scale bar, homography residual) all presuppose an *attempted* scale-recovery step that then errs — these baselines don't attempt scale recovery at all (out of scope until Phase 5), which is a different shape of gap than "attempted and wrong." Keeping the tag on the "mixed units" textual match, but noting it's not as clean a fit as the others. Separately, and **not itself an F2/F5 tag**: even after scale correction, a real residual registration offset remains in the rescale shim I built for this phase (GitHub issue #5) — mean 4–10% of plan diagonal depending on baseline, up to 28% on individual plans — a *contributing*, not dominant, driver of the low F1 numbers (see Strategic conclusion below).
- **F6 — Scope.** Not observed as a failure. 14 of 15 provisional GT plans are `scope_class=single`; the one `multi_floor` plan (Matterport) is not enough to exercise this family meaningfully.
- **Not an F1–F6 family — a metric/labeling-spec tension, flagged separately (filed as GitHub issue #6):** on the best-case plan, **38% of predicted walls legitimately span more than one distinct GT wall.** GT splits a physical straight run into multiple wall entities at every junction (a correct labeling-spec convention — a T-intersection produces two separate wall records either side), so a detector that correctly emits one clean long segment for that run structurally cannot 1:1-match GT under strict Hungarian assignment. This is not a detection failure; it's a mismatch between what "correct" looks like on each side of the metric, and it doesn't fit any of §2's six families (they're about extraction failures; this is a metric/spec-design tension). An earlier, looser measurement of this same effect (angle + perpendicular-distance-to-infinite-line only, no adjacency check) initially reported 72% — self-caught and corrected in-session; **38% is the number that survives the strict criterion** and the one carried forward here.

## Proposed P0 harness issues (not merged — filed as tracked issues, for Dan's ruling)

Both are about `eval/`-adjacent scoring methodology, not this phase's baseline code. Neither τ, the Hungarian matcher, nor anything in `eval/` was changed to produce this report. Filed as tracked GitHub issues (same discipline as P3a's #3) rather than only living as prose here, so they survive `phase-1-baselines` being archived after merge — anything only in this report evaporates with the branch; these reach whoever reopens the P0 freeze.

**[Issue #5](https://github.com/DanMalachi/floorplan-3d/issues/5) — the rescale shim has no translation correction.** `_rescale_to_gt_extent` corrects scale only (bbox-diagonal ratio); an identity round-trip test confirmed the scale math is exact in isolation, but a synthetic small translation added before rescaling collapsed F1 from 1.0 to 0.0, proving the shim would amplify any real origin mismatch. Measured on real data (all 5 baselines, full 15-plan corpus): adding a canonical bbox-center translation correction *after* the existing scale step —

| Baseline | ΔF1 | ΔIoU | mean translation applied (% of GT diagonal) |
|---|---|---|---|
| (a) | +0.003 | +0.014 | 5.5% (max 20.3%) |
| (b) | **+0.014** | **−0.009** | 8.1% (max 26.1%) |
| (c) | +0.004 | +0.009 | 10.4% (max 28.2%) |
| (d1) | +0.008 | +0.025 | 5.4% (max 14.5%) |
| (d = d2) | +0.010 | +0.025 | 4.2% (max 13.8%) |

Helps F1 and IoU for 4 of 5 baselines (small but consistent), at a small IoU cost for (b) only. A length-weighted centroid-of-mass alternative was also tested and **falsified as an alternative anchor** — it made every baseline worse than bbox-center, often below the original scale-only shim (e.g. (d = d2) IoU 0.119→0.059), and did not fix (b)'s regression either (0.058→0.048 vs. bbox-center's 0.049). **Recommendation for ratification:** adopt bbox-center translation correction as the canonical registration step (not centroid-of-mass).

**[Issue #6](https://github.com/DanMalachi/floorplan-3d/issues/6) — one-to-one Hungarian matching can't credit legitimate GT junction-splitting.** See the F2/labeling-spec-tension entries in the failure gallery above for the full writeup and the 38% measurement. Framed as a labeling-spec ↔ metric-design question with two named directions (add coverage-style scoring vs. treat exact junction-granularity reproduction as intentionally measured) — not a τ change, and this report takes no position between them.

**[Issue #7](https://github.com/DanMalachi/floorplan-3d/issues/7) — baseline (b)'s wall-mask IoU regression under translation correction, filed separately, unresolved.** No translation anchor tested (bbox-center or centroid-of-mass) fixes (b) specifically — both improve its F1 while regressing its IoU. Root cause not identified this session (candidate hypotheses in the issue). Not a blocker on Issue #5's adoption since (b) isn't the phase-1 bar baseline ((d = d2) is), but tracked on its own so it isn't lost inside #5.

**Issue 2 — one-to-one Hungarian matching cannot credit legitimate many-to-one correspondences.** See the F2 gallery entry above: 38% of predictions on the best-case plan are geometrically correct but span multiple GT wall entities because the labeling spec splits every physical wall run at each junction. This is a design tension between the labeling spec (junction-split walls, arguably correct for topology/opening-attachment purposes) and the metric (strict 1:1 element matching, no coverage-based credit) — not a τ problem. Two directions worth ratifying between, not resolved here: (a) change the metric to score wall *length coverage* in addition to/instead of element-count F1 (legacy's own old TS harness, `legacy/scripts/eval/score-core.ts::coveredLength`, already implements exactly this pattern and could be a reference), or (b) leave the metric as-is and treat "does the extractor reproduce GT's exact junction-splitting granularity" as a real, intentional part of what's being measured. Both are legitimate; this report takes no position.

## Strategic conclusion — guidance for P3b/P4, not a P1 action item

The median-plan dissection settles the question this round of diagnosis was run to answer: **the low mean F1 (0.011–0.078 across baselines) is dominated by real misses and real false positives, not by metric artifact.** On (d = d2)'s median plan: 32% of GT walls have zero covering prediction (genuine omission) and 67% of predicted walls match no GT wall at all (genuine false positives) — both far larger effects than registration slack (which moved this specific plan's F1 by exactly 0.000) or coarsening (a best-case-plan phenomenon, not observed as the dominant effect here). The *ceiling* (best-case plan) is meaningfully metric-compressed (issue #6 above); the *typical* plan is not — it's genuinely worse detection.

This has a direct implication for what comes next: **a missed wall is unrecoverable by anything downstream — a solver, a verification layer, or an adjudicating VLM can only work with candidates that exist. A spurious wall is filterable.** That asymmetry is exactly why `docs/extraction-plan.md`'s Phase 3b exit bar is written the way it is — **wall-candidate recall ≥ 0.995, precision unconstrained** — and this phase's empirical evidence independently confirms that bar is the right one, not just a theoretical default: on real baseline output, the false-positive side of the ledger is large but tractable (F1 semantic confusion, addressed by better classification — d1→d exactly demonstrates this working), while the false-negative side, once it happens, is a dead end. Recall is the lever. Nothing in this section is a request to change Phase 1's own deliverable; it's the reading this phase's evidence supports for whoever scopes Phase 3b/Phase 4 next.

## Known gaps

1. **Corner/junction metrics aren't wired into `score_plan`** (`eval/metrics/matching.py::match_corners` exists but isn't called from `eval/metrics/engine.py`).
2. Per-plan HTML reports are written to `reports/phase-1/<baseline>/<plan_id>.html` for all 75 scored plan/baseline pairs — useful for visually inspecting the specific cases named above.
3. Room metrics are unmeasurable until Phase 0's GT gains real room polygons.
4. Baseline (b)'s per-candidate self-consistency agreement (mean pairwise wall-rasterization IoU across the 3 samples) ranged roughly 0.05–0.52 across plans, with no obvious correlation to final wall F1 — worth a closer look if (b)'s selection strategy is revisited.
5. GitHub issues [#5](https://github.com/DanMalachi/floorplan-3d/issues/5), [#6](https://github.com/DanMalachi/floorplan-3d/issues/6), [#7](https://github.com/DanMalachi/floorplan-3d/issues/7) are open until Dan rules on them; this report's own numbers do not depend on any of them being resolved.

## Disposition

Durable artifacts from this phase: this report, its strategic-conclusion section, and issues #5/#6/#7. The baseline runners (`extraction/baselines/*.py`) are throwaway per the phase plan ("Three throwaway baselines...") — they archive with the `phase-1-baselines` branch rather than merging forward, unless Dan wants them kept for regression testing against future extraction work.

**Stopping here — not starting Phase 2 in this session** (CLAUDE.md rule 3). All five baselines are measured; `eval/` is unmodified; this report is the honest starting point the rebuild has to beat. No further baseline runs or harness edits pending — ready for Dan's review and merge decision.
