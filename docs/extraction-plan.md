# Extraction Rebuild — Phase Execution Plan

Source of truth for building the new floorplan→JSON pipeline. Derived from `docs/paper.md` §6.7; this file is the operational version. One phase = one branch = one Claude Code session (or session series). Exit bars marked (†) are provisional until Phase 0 ratifies them against the real corpus.

## Quick reference for Dan — model, effort, terminals

| Wave | Terminal A | Terminal B | Model / effort |
|---|---|---|---|
| 1 | **P0** harness + repo hygiene (`phase-0-harness`) | **P3a** ResPlan converter + synthetic renderer (`phase-3a-renderer`) | A: Sonnet 4.6 / high (escalate metric engine to Opus 4.8 / xhigh) · B: Sonnet 4.6 / high |
| 2 | **P1** baselines, then **P2** vector track (`phase-2-trackv`) | **P3b** E1/E2 model training + E3 text layer (`phase-3b-evidence`) | A: Sonnet 4.6 / high, Opus for P2 classification logic · B: Sonnet 4.6 / high |
| 3 | **P4** solver (`phase-4-solver`) — serial, full focus | (optional) P1 failure-gallery polish, corpus GT growth | **Opus 4.8 / xhigh**; Fable 5 if stuck after full context |
| 4 | **P5** openings + scale (`phase-5-openings`) | — | Opus 4.8 / xhigh (scale module: Sonnet / high) |
| 5 | **P6** verification + gating (`phase-6-verify`) | — | Opus 4.8 / xhigh; use `ultracode` for the loop-wiring session |
| 6 | **P7** generalization (`phase-7-hardening`) | **P8** production (`phase-8-prod`) — only after P6 gate | A: Sonnet / high, Opus for analysis · B: Sonnet / high (medium for mechanical infra) |

Rules of thumb (per Anthropic's model/effort guidance): escalate **effort** when Claude wasn't thorough (skipped files, didn't run tests); escalate **model** when it had full context, genuinely tried, and still got it wrong. Routine work that's been going fine → drop back down. Two live terminals max: Dan's review bandwidth is the bottleneck.

## Parallel work mechanics (two terminals)

```bash
# one-time, from repo root on main
git worktree add ../fp-phase0   -b phase-0-harness
git worktree add ../fp-phase3a  -b phase-3a-renderer
# terminal A:
cd ../fp-phase0 && claude          # pick model per table
# terminal B:
cd ../fp-phase3a && claude
```

- Each worktree is an independent checkout; sessions cannot step on each other's files.
- Merge to `main` ONLY after Dan approves the phase gate report. Delete the worktree after merge (`git worktree remove ../fp-phase0`).
- Collision protection: parallel branches may not touch the same directories. Wave 1: P0 owns `eval/`, `docs/`, `legacy/` move, `extraction/schema/`; P3a owns `data/resplan/`, `extraction/synth/`. Wave 2: P2 owns `extraction/trackv/`; P3b owns `extraction/trackr/`, `extraction/training/`.
- After P0 merges, ALL other branches rebase on main to pick up the frozen schema + harness before continuing.

---

## Phase 0 — Repo hygiene, corpus, spec, harness  *(blocks everything; start here)*

**Branch:** `phase-0-harness` · **Model:** Sonnet 4.6 / high; switch to Opus 4.8 / xhigh for the metric engine module. · **Read:** paper §1.2, §1.3, §6.2, Appendix A, Appendix C.

### 0.1 Repo hygiene (do first, in this order)
1. Inventory the repo. Produce `docs/PROTECTED_PATHS.md`: every file/dir belonging to the 3D viewer/renderer (React Three Fiber scene, camera, materials, extrusion, controls) and the scene-schema types the 3D layer consumes. When uncertain whether a file is 3D-critical, include it and mark UNCERTAIN for Dan.
2. Produce `docs/LEGACY_PATHS.md`: every file belonging to the old extraction pipeline (detection, OCR, VLM calls, old routers). Then `git mv` those into `legacy/`, preserving subpaths. Fix any app imports that break by stubbing behind the existing feature-flag path — the app must still build and the old pipeline must still run from `legacy/` (it stays the production path until Phase 6 passes).
3. Scaffold the new tree (see CLAUDE.md repo map) + `extraction/requirements.txt` + CI stub running `pytest` + `eval` self-test.

### 0.2 Schema
Implement paper Appendix A as `extraction/schema/extraction_v1.schema.json` (JSON Schema) + typed Python models (pydantic) + an independent validator (`extraction/schema/validate.py`) enforcing every rule listed at the end of Appendix A (cycle closure, opening-in-span, junction consistency, id resolution, tier rules). Write property-based tests (hypothesis) that generate mutations and confirm the validator catches them.

### 0.3 Metric engine (`eval/metrics/`) — the Opus part
Implement paper §1.3 + Appendix C exactly: Hungarian matching (scipy) for corners and wall centerlines at τ ∈ {0.5%, 1%, 2% of plan diagonal}; wall-mask IoU via rasterization; opening TP rule including host-attachment; topology validity; room metrics; ZFR/MFR-3 bookkeeping fields; stratification by encoding × convention × scope. Per-plan HTML report with GT-vs-pred overlay and residual map (matplotlib/SVG). CLI: `python -m eval.cli run --pred DIR --gt DIR --strata registry.csv --out reports/`.

### 0.4 Corpus + GT
- `eval/registry/` corpus registry (CSV/SQLite): provenance, class labels, GT status, split (source-level separation), canary flag.
- Ingest Dan's sample plans from `data/corpus/incoming/` (DAN PROVIDES). Router labels assigned manually this phase.
- Write `docs/labeling-spec.md` v1 resolving paper §4.3.1 ambiguities (wall vs cabinetry vs low partition vs glazing; passage vs gap; unit scope). Version it.
- GT annotation path: build a minimal converter so GT can be authored as SVG layers in Inkscape (layer names = element classes, geometry per labeling spec) → schema v1 JSON. 30–50 plans fully annotated, second-pass audited; 10 of them double-annotated to measure inter-annotator agreement (this number becomes the published ceiling).

### Definition of done (gate report `reports/phase-0-gate.md`)
- GT-vs-GT eval = perfect scores; deliberately corrupted GT copy = correct penalties (show both).
- Validator catches all mutation classes; app still builds; legacy still runs from `legacy/`.
- Corpus report: strata counts, inter-annotator agreement, ratified per-stratum bars for every (†) below (Dan signs off).
- Schema + eval interfaces declared FROZEN.

**Do not:** touch protected paths; start any extractor; "clean up" app code beyond the legacy move.

---

## Phase 3a — ResPlan converter + synthetic re-renderer  *(parallel with P0; no P0 dependency)*

**Branch:** `phase-3a-renderer` · **Model:** Sonnet 4.6 / high · **Read:** paper §3.6, §6.3. **Data:** `data/resplan/ResPlan.pkl` (17K plans, shapely polygons for wall/window/door/rooms, MIT).

1. `extraction/synth/resplan_convert.py`: ResPlan plan → schema-v1-shaped GT (wall polygons → centerline+thickness via medial axis; window/door polygons → host-wall projection with center_offset/width; rooms → wall cycles). Flag plans that fail conversion cleanly; target ≥ 90% clean conversion of the 17K.
2. `extraction/synth/render.py`: parametric renderer producing training images from any schema-v1 plan in multiple conventions: poché (solid/gray fill), double-line hollow, single-stroke, colored-fill, hatched. Randomize: stroke widths, DPI/size, rotation, noise/JPEG artifacts, furniture symbols (simple parametric set), dimension chains with extension lines + arrowheads, text labels (multi-script incl. Hebrew RTL via a font list), north arrows, scale bars, legends, watermarks. Every render ships with pixel-exact GT (the source plan) + distractor annotations (furniture/dimension/text boxes for E2 training).
3. Determinism: seeded; a manifest per generated set.

**Done when:** visual contact sheet of ≥ 5 conventions × 10 plans approved by Dan; converter stats reported; 20K-image starter set generated with manifests. *(Uses temporary copies of the metric code if P0 isn't merged yet; reconcile on rebase.)*

---

## Phase 1 — Baselines ("you are here")

**Branch:** `phase-1-baselines` (after P0 merge) · **Model:** Sonnet 4.6 / high · **Read:** paper §6.7 P1, §3.2, §3.5.

Three throwaway baselines run over the GT set, scored by the harness: (a) public CubiCasa5K-pretrained model + naive vectorization (DAN PROVIDES the weights download — host is not reachable from all environments); (b) frontier-VLM full-plan JSON via API, best-of-3 by validity+render-IoU, prompt = paper Appendix B5; (c) classical OpenCV-only pipeline (binarize→morph→Hough→heuristics). Also run the LEGACY pipeline from `legacy/` as baseline (d) — this is the number the rebuild must beat.

**Done when:** per-stratum baseline table + failure gallery (each failure tagged with paper §2 family F1–F6) in the gate report. No pass bar — honesty phase.

---

## Phase 2 — Track V (vector-native)

**Branch:** `phase-2-trackv` · **Model:** Sonnet 4.6 / high; Opus 4.8 / xhigh for primitive classification + wall-face pairing. · **Read:** paper §5.2, §3.7.

PyMuPDF dissection; the coverage test (rasterize page low-res, verify extracted paths explain ≥ 95% of ink — else route to Track R); stroke-width clustering; parallel-pair centerline+thickness recovery; filled-polygon medial-axis path; layer/color metadata harvesting; residue classification hooks (stub until P6, use geometric priors only); route through validator.

**Exit (†):** on genuinely-vector plans: wall F1 ≥ 0.99 @ τ=0.5%, validity ≥ 0.99, ZFR ≥ 0.9. **Do not** build VLM adjudication here (P6 owns it).

---

## Phase 3b — Track R evidence layer

**Branch:** `phase-3b-evidence` (parallel with P2) · **Model:** Sonnet 4.6 / high · **Read:** paper §5.3, §6.3.

1. **E1 segmentation:** SegFormer-class multi-class net (wall / opening-gap / door-arc / window-symbol / room-interior / text / background). Pretrain CubiCasa5K (DAN PROVIDES dataset zip) or start from public checkpoint; fine-tune on P3a synthetic set + corpus GT. Tiled inference with overlap-stitch; TTA. Output = probability maps (never decisions). Export ONNX.
2. **E2 symbol detector:** YOLO-class, classes = doors (leaf+arc), windows, sliding doors, stairs, + distractors (furniture, fixtures, dim-arrowheads, north arrow, scale bar, legend). Train on P3a synthetic (free perfect boxes) + CubiCasa5K icons + corpus labels. Recall-tuned. ONNX.
3. **E3 text layer:** text detection (DBNet/CRAFT-class) → crop reading via Anthropic API (prompt Appendix B2, batched, structured output) with PARSeq fallback switch; outputs text assets + text ink mask.
4. Preprocessing per class: photo rectification (quad detect → homography), deskew, adaptive binarization, resolution normalization.
5. Training runs on Modal (`extraction/training/`, launched by Dan); pipeline consumes ONNX on CPU.

**Exit (†):** clean raster: wall-candidate recall ≥ 0.995 (precision unconstrained); opening-candidate recall ≥ 0.98; text-mask completeness ≥ 0.98; per-convention breakdown.

---

## Phase 4 — Fusion, solver, topological reconciliation  *(serial; the hardest phase)*

**Branch:** `phase-4-solver` · **Model:** **Opus 4.8 / xhigh**; Fable 5 for the constraint formulation if two honest attempts fail. · **Read:** paper §5.4, §6.5, §3.2 (R2V), §2 (F3).

Candidate extraction from E1 maps (low threshold → skeletonize → segments + distance-transform thickness → collinear merge); evidence vectors per candidate; junction hypotheses (adaptive snap radius, I/L/T/X typing); dominant-orientation axis system (non-Manhattan-safe); arc fitting → κ; CP-SAT/MILP selection (OR-Tools) with hard constraints (termination, thickness clusters, no unexplained crossings, angle snap, face closure) maximizing evidence score; greedy+local-search fallback with 2s cap; kill log with per-candidate rejection reasons; planar subdivision → room faces (shapely+networkx); deterministic tie-breaking.

**Exit (†):** validity = 1.0 by construction (validator-verified on all outputs); wall F1 ≥ 0.95 @ τ=1% clean raster; every rejection logged with reason; zero F3 incidents. **Do not** tune around opening errors here — openings are P5.

---

## Phase 5 — Openings + scale

**Branch:** `phase-5-openings` · **Model:** Opus 4.8 / xhigh (attachment, consistency, reachability); Sonnet / high (scale module). · **Read:** paper §5.5, §5.9, §3.8.

Candidate union (E2 + E1 gap-prob + wall-graph gap analysis + Track V symbols); projection to host wall → (host, center_offset, width) with impossibility kills; classification (arc⇒door, line-stack⇒window, clean gap⇒passage); non-overlap + width sanity + room-reachability re-search (unreachable room ⇒ targeted boundary re-scan); enrichment (swing chirality, sliding, nullable sill/head). Scale: dimension-string↔pixel-span pairing via extension-line association; global RANSAC scalar; scale-bar + stated-ratio corroboration; door-width-prior fallback labeled as such; round-number snapping only with matching dimension text; disagreement ⇒ null scale + flag (never a silent wrong number).

**Exit (†):** opening F1 ≥ 0.90 @ τ=1% pre-adjudication; scale within 1% on plans with ≥ 4 legible dimensions; wrong-scale-shipped incidents = 0.

---

## Phase 6 — Kill chain, verification loop, calibration, gating  *(where "near-perfect" is demonstrated)*

**Branch:** `phase-6-verify` · **Model:** Opus 4.8 / xhigh; run the final wiring session in `ultracode`. · **Read:** paper §5.6, §5.7, §5.8, §6.4, Appendix B.

1. Layers 1–4 (hygiene masks, geometric priors incl. periodicity FFT, cross-evidence voting rule, post-solve audits).
2. Layer 5 analysis-by-synthesis: convention-matched re-render (reuse P3a renderer), alignment via stored transform, unexplained-ink / hallucinated-ink residual fields, blob→work-item routing, 1–2 iteration loop with 120s budget governor and graceful tier-down.
3. Layer 6 VLM adjudication: SoM crop packaging, numbered markers, multiple-choice prompts (Appendix B3/B4), K=3 self-consistency, batched calls, "unclear"→review. Build `eval/adjudication-bench/`: ~200 labeled crops + ~50 render-diff judgments; evaluate ≥ 2 frontier models × ≥ 2 marker styles via API; pin winners in `extraction/prompts/pins.json`.
4. Layer 7: isotonic calibration per element class on validation split; class operating points chosen for the tier-1 contract; autonomy tiers 1–4 wired into `diagnostics`; adapter feature flag ready to flip.

**Exit (†):** clean raster + vector strata: tier-1 conditional ZFR ≥ 0.98 with tier-1 coverage ≥ 0.6; overall ZFR ≥ 0.8; opening F1 ≥ 0.95; hallucinated-wall rate in tier-1 ≤ 0.2% of elements. Gate report includes calibration curves + tier distribution.

---

## Phase 7 — Generalization hardening

**Branch:** `phase-7-hardening` · **Model:** Sonnet 4.6 / high (data loops); Opus 4.8 / xhigh (failure analysis, LoRA decision). · **Read:** paper §3.6, §6.7 P7, §7.2.

Second/third convention strata to bar via targeted synthetic + corpus GT growth; photo-path rectification eval; multi-unit scoping decision (auto ≥ 0.95 or one-tap unit select); WAFFLE 110-image stress stratum reported (thermometer, no bar — DAN PROVIDES the files; host unreachable from sandboxed environments); optional LoRA experiment (Qwen-VL family on 3–10K samples, Modal) with kill criterion: must improve ensemble ZFR per dollar over expanding E1/E2 data, else dropped.

**Exit:** every in-scope stratum at bar or explicitly tier-3-by-default with written reason.

---

## Phase 8 — Production

**Branch:** `phase-8-prod` (can overlap P7 after P6 gate) · **Model:** Sonnet 4.6 / high; medium for mechanical infra. · **Read:** paper §6.1, §6.6, §4.4.

Async job API (`POST /extract`) on chosen Shape-B infra; queues/retries; observability time-series (tier distribution, render agreement, adjudication disagreement, drift alarms); canary + regression CI (every production failure joins the eval set permanently); cost/latency percentile measurement vs. paper §6.6 planning table; tier-3 one-screen review UI (new app routes only — 3D untouched); versioned releases (schema/prompts/checkpoints/markers pinned); flip the adapter feature flag; `legacy/` stays for one release cycle, then archive-tag and delete.

**Exit:** two weeks shadow/live with tier-1 contract holding and p99 ≤ 120s.

---

## DAN PROVIDES checklist
- [ ] Sample plans → `data/corpus/incoming/` (Phase 0; the more + uglier the better)
- [ ] CubiCasa5K zip (Zenodo) + pretrained weights (Phase 1/3b)
- [ ] WAFFLE benchmark files (Phase 7)
- [ ] Modal account + `ANTHROPIC_API_KEY` in env
- [ ] Gate sign-offs at every STOP
