# Near-Perfect Floorplan-to-JSON Extraction
## A Thesis and Implementation Blueprint for Wall, Window, and Opening Recovery with Systematic False-Positive Elimination

**Version 1.0 — July 2026**
**Status: Pre-corpus edition.** This paper was written before representative sample plans were provided. Section 6.7 Phase 0 defines exactly how the corpus plugs in and which claims must be re-validated against it. Everything else stands on published evidence.

---

## Table of Contents

0. Executive Summary and Thesis Statement
1. Problem Formalization
2. Why This Is Hard: A Taxonomy of Failure
3. State of the Art: What the Evidence Actually Says
4. The Knowledge Matrix: Known-Knowns, Known-Unknowns, Unknown-Knowns, Unknown-Unknowns
5. The Thesis: A Verification-First Ensemble Architecture
6. Implementation
7. Risks, Open Questions, and Research Agenda
8. Appendices (Schema, Prompts, Metric Pseudocode, Bibliography)

---

# 0. Executive Summary and Thesis Statement

The goal is a system that ingests a floorplan — vector PDF, clean raster, photo, or sketch — and emits a near-perfect JSON file: every wall with correct coordinates and thickness, every window and opening on the correct wall at the correct position, no phantom elements, in under 120 seconds, fully automatically, with a quick-review fallback only as a defined compromise tier.

After reviewing two decades of published research, the current benchmark record, the frontier VLM evidence, and the commercial landscape, the paper's central conclusions are:

**Conclusion 1: No single model gets you there.** The best published end-to-end system (FloorplanVLM, 2026 — a vision-language model fine-tuned on two million floorplans with reinforcement learning on geometric rewards) reaches 92.5% external-wall IoU and only 0.73 F1 on openings. The best general-purpose frontier VLMs, tested on the AECV-Bench suite in 2025–2026, count doors correctly as little as 9–39% of the time and windows around 14%, even while reading text off the same drawings at 85–95% accuracy. Segmentation networks trained on CubiCasa5K score well in-distribution and collapse on out-of-distribution styles, as the WAFFLE benchmark demonstrated. Every path — CNN, transformer, VLM, classical CV — has a documented, load-bearing weakness.

**Conclusion 2: The weaknesses do not overlap.** VLMs fail at metric geometry and symbol counting but excel at reading text, classifying semantics, and judging marked candidates. Deterministic geometry excels at precision but cannot decide what a line *means*. Trained detectors find symbols but drift across drawing styles. Constraint solvers cannot see the image but can prove that a proposed structure is topologically impossible. A system that routes each sub-decision to the component that is provably good at it — and lets no single component's output pass unverified — can exceed the accuracy of any component alone.

**Conclusion 3: Near-perfect is a verification problem, not a detection problem.** Going from 90% to 99%+ is not achieved by a better detector; it is achieved by a system that *knows which of its outputs are wrong*. The architecture proposed here treats verification — render-and-compare, cross-evidence voting, topological proof, targeted VLM interrogation of disputed elements — as the primary mechanism, with detection merely supplying candidates. False positives are eliminated by a layered kill chain (Section 5.6) rather than a threshold. Elements the system cannot verify are surfaced explicitly, which is what makes the fully-automatic goal and the quick-review compromise two settings of the same dial rather than two systems.

**The thesis in one sentence:** *Generate redundant, independent evidence about the plan; fuse it into candidate geometry with a deterministic solver; prove or disprove every element with topology constraints and analysis-by-synthesis; let a frontier VLM arbitrate only pre-marked disputes; and gate autonomy on calibrated per-element confidence.*

The rest of this paper defines the problem precisely (Section 1), catalogs how systems fail (Section 2), reviews the evidence in detail (Section 3), organizes what is and is not known (Section 4), specifies the architecture (Section 5), and provides a phased implementation plan with STOP gates, infrastructure options, cost and latency budgets, model and prompt specifications, and an evaluation harness that is built *before* the pipeline (Section 6).

---

# 1. Problem Formalization

## 1.1 Input Taxonomy

The system must accept the full space of real-world floorplan artifacts. Inputs are classified along four independent axes; the router (Section 5.1) estimates all four before any extraction runs.

**Axis 1 — Encoding.**
- **V (Vector):** PDF/SVG/DXF containing actual line and polygon primitives. Common in architect exports and much marketing material. Highest-fidelity path when present; a "vector" PDF may still be a wrapped raster scan, so presence of drawable path primitives must be tested, not assumed from the file extension.
- **R (Clean raster):** Rendered or scanned image with sharp strokes, uniform background, resolution ≥ ~1000 px on the long edge.
- **P (Photo):** Perspective distortion, lighting gradients, paper curvature, possible occlusion. Requires rectification before any geometry work.
- **S (Sketch):** Hand-drawn, wobbly strokes, inconsistent thickness, implicit conventions.

**Axis 2 — Drawing convention.** At minimum: filled/poché walls (solid black or gray fill between wall faces), double-line hollow walls, single-stroke walls, colored-fill presentation plans, and hatched walls. Convention determines which low-level extractors are reliable; misrouting convention is a top-3 source of catastrophic failure.

**Axis 3 — Content contamination.** Furniture symbols, dimension chains and extension lines, text labels (any script, including RTL scripts such as Hebrew or Arabic), hatching, north arrows, scale bars, legends, title blocks, watermarks, adjacent-unit geometry, landscaping.

**Axis 4 — Scope.** Single dwelling, single dwelling within a multi-unit floor plate (requires unit isolation), whole floor plate, multi-floor sheet (requires sheet segmentation into per-floor sub-images).

## 1.2 The Output Contract: Canonical JSON Schema

The schema is designed from first principles but deliberately converges with the representation that the strongest published system (FloorplanVLM) validated at scale, because that representation encodes topology *by construction*: walls are the primary entities; openings are children of walls; rooms are cycles of wall references. This ordering makes entire classes of errors — floating openings, rooms with gaps, duplicated shared walls — structurally inexpressible.

Key design decisions, with rationale:

1. **Walls are centerline segments with thickness, not polygons.** A wall is `(start, end, thickness, curvature)`. Polygonal wall faces are derivable; centerlines are what solvers, snapping, and 3D extrusion want. Curvature parameter κ (0 = straight; signed value = circular arc) covers curved walls without a separate primitive type.
2. **Openings never carry absolute coordinates.** An opening is `(host_wall_id, class, center_offset_along_wall, width, ...)`. It is geometrically impossible for an opening in this schema to float off a wall — the single most common topology bug in flat schemas is deleted by the type system.
3. **Every element carries confidence and provenance.** `confidence ∈ [0,1]` (calibrated, Section 5.8) and `evidence: []` listing which extractors support it. This is what makes tiered autonomy, review UIs, and debugging possible. Strip these fields for downstream consumers that don't want them.
4. **Two coordinate frames, one transform.** All geometry is stored in a canonical plan frame (millimeters if scale was recovered, otherwise normalized units), plus a single `image_transform` (similarity or homography) mapping plan frame → source-image pixels. This keeps geometry clean while preserving exact auditability against the source.
5. **Junctions are explicit.** A junction table `(id, point, type ∈ {L,T,X,I,end}, wall_ids)` is emitted because junction correctness is the strongest single predictor of overall topological correctness (this was the core insight of Raster-to-Vector in 2017 and remains true).

The full schema with field-level documentation is Appendix A. Abbreviated shape:

```json
{
  "schema_version": "1.0",
  "units": { "system": "mm", "scale_confidence": 0.97, "scale_source": "dimension_text" },
  "image_transform": { "type": "similarity", "matrix": [[...]], "source_px": [2480, 1754] },
  "walls": [
    {
      "id": "w_014",
      "start": [0.0, 0.0], "end": [3620.0, 0.0],
      "thickness": 200.0, "curvature": 0.0,
      "role": "external",
      "openings": [
        { "id": "o_003", "class": "window", "center_offset": 1810.0,
          "width": 1400.0, "sill_height": 900.0, "head_height": 2100.0,
          "confidence": 0.98, "evidence": ["detector", "vlm", "render_check"] }
      ],
      "confidence": 0.99, "evidence": ["segmentation", "vector", "topology"]
    }
  ],
  "junctions": [ { "id": "j_007", "point": [3620.0, 0.0], "type": "L", "walls": ["w_014", "w_015"] } ],
  "rooms": [ { "id": "r_002", "label": "bedroom", "wall_cycle": ["w_014", "w_015", "w_021", "w_009"], "confidence": 0.95 } ],
  "diagnostics": {
    "tier": 1,
    "unresolved": [],
    "render_agreement": { "wall_iou": 0.983, "unexplained_ink_ratio": 0.011 }
  }
}
```

`sill_height` and `head_height` are nullable — plans rarely encode them; when absent, downstream 3D applies defaults and the field records that they are defaults, not measurements. Door openings additionally carry `swing` (`left|right|sliding|double|unknown`) as a nullable attribute; the AECV-Bench evidence shows swing is among the least reliably read symbols, so it is modeled as enrichment, never as a gate on the opening itself.

## 1.3 Defining "Near-Perfect": The Metric Suite

"Near-perfect" must be a number before it can be a goal. The suite below is computed by the evaluation harness (Section 6.2) on every run, stratified by input class and drawing convention. Matching between predicted and ground-truth elements uses optimal bipartite assignment (Hungarian) with the distances defined in Appendix C.

**Geometric metrics.**
- **Corner precision/recall/F1 @ τ** for τ ∈ {0.5%, 1%, 2% of plan diagonal} — a predicted junction matches a GT junction if within τ.
- **Wall centerline score:** a predicted wall matches a GT wall if their centerlines' symmetric mean distance < τ and overlap ratio > 0.8; report P/R/F1 plus mean endpoint error and mean thickness error on matched pairs.
- **Wall-mask IoU:** rasterize both wall sets; IoU of the ink. Blunt but sensitive to everything at once.

**Semantic metrics.**
- **Opening detection F1:** an opening counts as true positive only if (a) class correct, (b) attached to the matched host wall, and (c) center within τ along the wall and width within 15%. Attachment-correctness is part of the definition — an opening on the wrong wall is a miss plus a false positive, not a near-hit.
- **Room metrics:** room count error, room-label accuracy on matched rooms, adjacency-graph edit distance.

**Topological metrics.**
- **Validity rate:** fraction of outputs that are watertight — every wall endpoint participates in a junction or is a legitimate free end (e.g., a wing wall), every room cycle closes, no zero-thickness or self-intersecting geometry, every opening lies strictly within its host wall's span.

**Product metrics (the ones that actually define "near-perfect").**
- **ZFR — Zero-Fix Rate:** fraction of plans whose output a human inspector accepts with *no* edits.
- **MFR-3:** fraction requiring ≤ 3 element-level edits.
- **Tier distribution:** fraction of plans the system itself classified into autonomy tiers 1–4 (Section 5.8), and the *conditional* ZFR within tier 1 — this is the honesty metric: when the system says "I'm sure," how often is it right?

**Proposed pass bars** (to be ratified against the real corpus in Phase 0): tier-1 conditional ZFR ≥ 0.98; overall ZFR ≥ 0.85 on clean raster and vector inputs; opening F1 ≥ 0.95 @ τ = 1%; validity rate ≥ 0.99; wall F1 ≥ 0.98 @ τ = 1%. For photos and sketches, bars are set per-class in Phase 0 — pretending one bar fits all input classes is how benchmarks lie.

Two published reference points calibrate ambition: Raster-to-Vector reported roughly 90% precision/recall and called it "the range of production-ready performance" in 2017; FloorplanVLM's 2026 numbers (96.1% validity, 0.925 external IoU, 0.733 opening F1) show where two million training samples and RL get a single model. The bars above are *above* the single-model frontier — which is exactly why Section 5 is an ensemble-plus-verification design rather than a model choice.

---

# 2. Why This Is Hard: A Taxonomy of Failure

Every failure a floorplan extractor can make falls into one of six families. The architecture in Section 5 maps a specific countermeasure to each; this section is the threat model.

**F1 — Semantic confusion (the false-positive engine).** Lines that look like walls but aren't, and vice versa. Concrete sub-cases, all documented in the literature or trivially reproducible: furniture edges (wardrobes and kitchen counters are wall-thickness rectangles), dimension chains and their extension/leader lines, text strokes (a Hebrew ״ח״ or a Latin "H" is two parallel strokes with a connector — locally indistinguishable from a wall fragment), stair treads (periodic parallel lines), balcony railings, hatching and poché texture, plumbing fixtures, section-cut markers, north arrows, scale bars, grid/axis lines with bubbles, property boundaries, legend boxes and title blocks, watermarks, and — in multi-unit plates — perfectly real walls that belong to the *neighbor's* apartment and are therefore false positives *for this extraction's scope*. The AECV-Bench failure analysis adds the VLM-specific variants: confusing windows with wall gaps, misreading door swings, hallucinating fixtures, and missing instances in dense regions.

**F2 — Geometric imprecision.** The element is real and correctly classified, but coordinates are off: corners displaced, walls slightly rotated, thickness wrong, collinear walls broken into misaligned fragments, parallel walls not parallel. VLMs are the worst offenders (the literature now has a name for it — "geometric hallucination"), but segmentation-mask vectorization introduces its own jitter at every mask boundary.

**F3 — Topological breakage.** Hanging wall endpoints that almost meet, rooms that don't close, duplicated shared walls from room-wise polygon prediction (the documented failure mode of query-based transformers like RoomFormer and PolyRoom), openings floating off walls, walls crossing without a junction. FloorplanVLM's ablations quantify how decisive this family is: their SFT-only model was 90.2% valid; adding RL with a watertightness reward — i.e., directly optimizing against F3 — pushed validity to 96.1% and lifted every other metric with it.

**F4 — Omission (false negatives).** Thin interior partitions dropped, openings in dense areas missed, short wall stubs lost, curved and slanted walls skipped by Manhattan-assuming extractors (Raster-to-Vector could only represent axis-aligned uniform-thickness walls — a 2017 limitation that still silently haunts any junction-type formulation), an entire wing lost to a tiling seam at high resolution.

**F5 — Scale and frame errors.** Correct shape, wrong size: dimension text misread (OCR on ~10 px digits, superscripts, RTL layouts), scale bar misinterpreted, mixed units, or a homography-rectification residual that shears the whole photo-derived plan.

**F6 — Scope errors.** Extracting the neighbor's unit, the site plan inset, the furniture legend, or merging two floors printed on one sheet. Almost absent from academic benchmarks (which pre-crop), dominant in real marketing PDFs.

Two structural observations shape the whole design. First, **F1 and F4 trade off directly** — every threshold that suppresses furniture-as-walls also suppresses thin-partition recall — which is why single-detector threshold tuning plateaus and why independent evidence sources (which move the ROC curve, not the threshold) are the only way through. Second, **F3 is the only family where errors are *provable***: topology violations can be detected with certainty from the output alone, no image needed. A system should therefore never ship an F3 error, and the constraint solver that guarantees this also, as a side effect, catches many F1/F4 errors (a furniture rectangle rarely closes into the wall graph; a missing wall usually leaves an unclosable room). This "topology as a free verifier" insight dates to Raster-to-Vector's integer program and is the intellectual ancestor of the reconciler in Section 5.4.

---

# 3. State of the Art: What the Evidence Actually Says

This section reviews each technical lineage with its actual reported numbers and its documented failure modes, then distills seven lessons the architecture must obey. Full citations are in Appendix D.

## 3.1 Classical Computer Vision (pre-2017)

Binarization, morphological erosion/dilation, connected components, Hough line detection, stroke-width analysis, SURF-based symbol matching. The survey literature is unanimous on the verdict: these pipelines work on the convention they were tuned for and break on the next one, because every threshold is an implicit assumption about drawing style. **However** — and this is under-appreciated — classical operators are not obsolete; they are *demoted*. As candidate generators and as feature extractors inside a voting ensemble (stroke-width clustering for thickness estimation, morphology for poché-fill isolation, Hough for dominant-orientation estimation), they are fast, deterministic, explainable, and free. They fail as *deciders*, not as *witnesses*.

## 3.2 The Segmentation Era (2017–2022)

**Raster-to-Vector (Liu et al., ICCV 2017)** remains the most architecturally important paper in the field. A CNN predicts *junctions* — 13 types covering I/L/T/X configurations with orientations — plus per-pixel semantics; an **integer program** then selects the subset of candidate primitives that satisfies hard constraints (walls meet consistently at junctions, rooms form closed loops with consistent labels). Reported ~90% precision and recall. Three things matter for us: (a) the IP *explicitly filtered out fake lines* — constraint solving as false-positive elimination is a 2017-proven mechanism, not a novel idea; (b) the representation could only express axis-aligned, uniform-thickness walls — a warning about baking geometric assumptions into the representation; (c) 90% was called production-ready then, and the field has spent nine years on the remaining 10%.

**Deep Floor Plan Recognition (Zeng et al., ICCV 2019)** introduced room-boundary-guided attention in a multi-task net, explicitly to handle what R2V couldn't: non-uniform thickness, irregular junctions, curved walls. **CubiCasa5K (Kalervo et al., 2019)** contributed the field's de facto standard dataset — 5,000 Finnish real-estate plans with SVG vector ground truth across ~80 categories — and a stronger multi-task baseline. Three meta-facts about CubiCasa5K matter more than its model numbers. First, the dataset is a byproduct of a *commercial, partially manual* conversion pipeline — the company that knows this problem best kept humans in the loop. Second, annotation took 5–120 minutes per plan with a two-stage human QA process — ground truth is expensive and error-prone, and later work (the 2024 multi-unit study) explicitly rates CubiCasa5K's annotation quality below the smaller R3D dataset. Third, its style distribution is Finnish marketing plans — a fact that becomes decisive in Section 3.6.

Subsequent segmentation refinements (direction-aware kernels, adversarial training, MDA-UNet/MACU-Net variants, attention U-Nets, 2024–2025 Mix-Transformer hybrids such as MitUNet) each add a few points in-distribution. The 2025 MitUNet work is notable for its *recipe* rather than its architecture: pre-train on CubiCasa5K for invariant structural features, then fine-tune on a small regional dataset for the target convention — a transfer pattern directly applicable here.

**The structural limitation of the whole era:** segmentation outputs pixels, the task needs graphs. Every pixel method requires a vectorization post-process (skeletonization, corner finding, merging) whose heuristics reintroduce exactly the fragility that learning was supposed to remove. The CubiCasa5K authors said it themselves: if junctions are missed or misplaced, polygons cannot be recovered regardless of segmentation quality.

## 3.3 Query-Based and Sequence-Based Vectorization (2022–2026)

The transformer wave attacked the representation mismatch by predicting geometry directly. **HEAT (CVPR 2022)** detects corners and classifies edges holistically. **RoomFormer (CVPR 2023)** predicts room polygons with two-level queries; **PolyRoom (ECCV 2024)** adds room-aware queries, dense uniform-sampling supervision, and corner selection using angle priors. These are elegant and fast, but the 2026 literature is blunt about their systemic flaw: rooms are predicted as *independent* polygons, so shared walls are represented twice, and the two copies disagree — gaps and overlaps that require "complex, error-prone merging algorithms" to reconcile. In our schema terms: they generate F3 errors by construction.

**Sequence models** fix this by changing the output grammar. **Raster2Seq (2026)** autoregressively emits labeled polygon sequences and demonstrates its generalization on WAFFLE's in-the-wild plans. And the current apex, **FloorplanVLM (Beike, February 2026)**, deserves its own subsection.

## 3.4 FloorplanVLM: The Frontier, and What It Teaches

FloorplanVLM fine-tunes Qwen2.5-VL-3B to emit, directly from a raster image, a structured JSON: walls first (with coordinates, thickness, curvature, and *nested openings*), then rooms as ordered references to wall IDs. Training: SFT on FLOORPLAN-2M (two million plans distilled from a 20M-plan industrial pool via structure-aware clustering) → SFT on a pixel-aligned 300K high-quality subset → **GRPO reinforcement learning with verifiable geometric rewards** (binary JSON-validity + watertightness reward; external-boundary IoU reward; internal-structure F1/IoU reward gated by external correctness). Results on their FPBENCH-2K: 96.1% validity, 0.925 external IoU, 0.892 room IoU, 0.825 room F1, **0.733 opening F1**; non-Manhattan subset only modestly worse (0.903 external IoU) — genuine geometric generalization.

Eight transferable lessons, ranked by importance to this project:

1. **The dependency-ordered schema works at scale.** Walls-first with openings-as-children and rooms-as-wall-cycles is now empirically validated as the topology-safe representation. Section 1.2 adopts it.
2. **Openings are the weakest element even at the frontier.** 0.733 F1 after two million training plans. Every era of this field — R2V, CubiCasa, transformers, VLMs — reports openings as the laggard. Any credible near-perfect design must treat opening detection as its own first-class subproblem with dedicated evidence sources (Section 5.5), not a byproduct of wall extraction.
3. **Verifiable-reward RL is what closed the topology gap** (+5.9 points of validity over SFT). The general principle — *optimize and select against deterministic geometric checks, not against likelihood* — is available to us at inference time without any training: generate K candidates, score each with the same watertightness/IoU/render checks, keep the best. Best-of-K under verifiable rewards is the poor developer's GRPO.
4. **Their ablation of noisy-scale vs. clean-small data:** training only on the 2M noisy set produced 67% validity; the clean 300K subset was what taught watertightness. Data *quality and pixel alignment* beat raw scale for topological correctness. For us: 50 impeccable ground-truth plans of the target distribution are worth more than 5,000 scraped ones.
5. **JSON beat a Python DSL as output format** despite being 50% longer, because pretraining bias toward JSON syntax stabilizes generation. Prompting frontier VLMs for structured plan output should use JSON, and schema-constrained decoding where the API offers it.
6. **Coordinates were emitted as plain-text numbers on a 1024-normalized grid** — no special coordinate vocabulary needed, but a quantization floor exists. When we ask a frontier VLM for any coordinate at all, normalizing the image and expecting ~0.1% grid precision at best is the realistic model.
7. **The cost of the end-to-end route:** 20M raw plans, 2M curated, 300K pixel-aligned (20K human-redrawn), 32×H200 GPUs, three training stages. This is a platform company's moat, not a reachable path for a small team — which is precisely why Section 5 composes verifiable components instead of training an oracle. A scoped LoRA fine-tune of the same base model family on thousands (not millions) of samples remains a rational Phase-7 *experiment* as one more evidence source.
8. **Their stated limitation — ~3,000-token autoregressive outputs make latency non-trivial** — is a reminder that any VLM-emits-full-plan step costs 20–60 s per call and must be budgeted (Section 6.6). Within a 120 s envelope this is affordable once, not five times.

## 3.5 The General-Purpose VLM Reality Check

The 2025–2026 AECV-Bench program is the most rigorous public audit of what off-the-shelf frontier models can actually do with architectural drawings, and its findings are the empirical backbone of this paper's division of labor:

- A stable capability gradient: **OCR and text-grounded document QA are strong (up to ~0.95 / 0.85)**; spatial reasoning is moderate; **symbol-centric understanding is unsolved**.
- Door counting across frontier models: roughly **9–39% exact-match**; windows around **14%**; one iteration measured GPT-5 at 12% on doors; the best overall performer (Gemini 3 Pro) still averaged only ~51% across counting fields. Bedrooms and toilets — which are *text-labeled* — reach 74–91%, confirming the models are reading, not seeing.
- Documented failure modes: misinterpreting door swings, confusing windows with plain wall openings and façade elements, hallucinating fixtures, missing instances in dense regions.
- Errors persist *even when OCR on the same drawing is excellent* — the bottleneck is the graphical language, not image quality.
- A sobering meta-finding: within one vendor family, the nominally stronger model was not the better plan-reader (their earlier benchmark round found Claude 3.7 Sonnet beating Opus 4.0 on these tasks). Model choice for this domain must be *measured per task*, never assumed from general leaderboards.

Complementary evidence: the map-parsing study (DeFazio et al.) found VLMs *excellent* at topological reading — tracing which rooms connect through which doors well enough to plan nine-step navigation sequences at 0.96 success. And the Set-of-Mark literature established that frontier models cannot *emit* accurate coordinates, but reason well over **pre-marked candidates**: overlay numbered marks on regions and the model can classify, count, compare, and adjudicate them reliably — with the caveat that marker attributes (size, color, placement) can swing accuracy by ±10 points, so marker design must itself be evaluated, and mark-based prompting only works on models trained to exploit it (frontier APIs: yes).

**Synthesis:** the VLM's validated roles are (1) reader of all text, labels, and dimensions; (2) classifier/adjudicator of candidates that deterministic code has already localized and marked; (3) topological sanity judge; (4) triage/routing classifier. Its forbidden roles are: primary detector of symbols, counter of anything, and emitter of coordinates. Every VLM touchpoint in Section 5 respects this boundary.

## 3.6 The Generalization Cliff: WAFFLE and the Style Problem

**WAFFLE (WACV 2025)** curated ~20K in-the-wild floorplans spanning building types, countries, eras, and formats, and showed that a strong CubiCasa5K-trained model *struggles badly* on them. This is the quantitative confirmation of the field's open secret: benchmark scores are style-locked. The practical failure is not gradual degradation but cliff-shaped: a model trained on Finnish double-line marketing plans meets an Israeli gray-poché developer plan or a 1970s hatched blueprint and produces confidently wrong output. Consequences for design: (a) a **convention router** in front of extraction is not an optimization, it is a correctness requirement; (b) per-convention evaluation stratification is mandatory or aggregate metrics will hide cliffs; (c) style-targeted synthetic augmentation (re-render vector ground truth in multiple conventions — thin-stroke, poché, colored, hatched) is the cheapest known way to buy cross-style robustness, and FloorplanVLM's synthetic re-rendering subset validates the mechanic at scale; (d) WAFFLE itself, plus its 110-image wall/door/window SVG benchmark, is a ready-made out-of-distribution stress set for Phase 7.

## 3.7 Vector-Native and CAD-Adjacent Paths

When the input contains real vector primitives, rasterizing it to feed a vision model is destroying information to reconstruct it worse. PDF path extraction (PyMuPDF and equivalents) yields exact line segments, rectangles, and fills with layer/color/stroke metadata; the extraction problem becomes *classification and assembly* of perfect geometry rather than detection of noisy geometry. The FloorPlanCAD line of work (10K+ real CAD drawings; panoptic symbol spotting with CNN-GCN and transformer methods) demonstrates learned classification directly on vector primitives, and VectorFloorSeg does the same for segmentation on vector input. Two hard-won cautions: marketing PDFs routinely mix a raster underlay with a few vector decorations — the router must verify that the *walls themselves* are vector, e.g., by checking coverage of detected ink by extracted paths; and CAD exports bury walls among hundreds of layers of annotation, so vector input changes the false-positive problem's *shape* (from pixel ambiguity to layer/primitive ambiguity) without removing it.

## 3.8 Scale and Text Recovery

The CVPR 2021 residential system (Lv et al.) is the reference design for multi-modal fusion here: it combines structure recognition with detected text, symbols, and scale to output *physically sized* vector plans, which is exactly the units requirement. The supporting text-extraction literature has converged on a two-stage pattern — a detector (YOLO-family or CRAFT/EAST) finds text instances including rotated dimension strings, then a recognition model (PARSeq-class, or a frontier VLM crop-read, which the AECV evidence says is a solved sub-task) reads them. Scale can then be recovered redundantly from: explicit dimension chains matched to their measured pixel spans (robust: fit one global scalar by RANSAC over *all* dimension–span pairs, which simultaneously flags misread dimensions as outliers); scale-bar detection; stated scale ratios ("1:100") *only* when physical page size is known; and door-width priors (~800–900 mm) as a weak fallback. RTL scripts and mixed-direction dimension text are an OCR-configuration issue, not a research problem, but must be in the test set from day one if the corpus includes them.

## 3.9 The Commercial Landscape: The Hidden-Human Truth

Reading the industry honestly: CubiCasa (the company) — whose scan-to-plan product claims 95–97% area accuracy from phone video — built its *dataset* from a partially manual conversion pipeline with two-stage human QA. Conversion services across the market (plan-to-CAD vendors, real-estate plan redrawers, several "AI floor plan" startups) advertise automation and deliver human-verified output on 12–48 h turnarounds. Matterport-class products sidestep the problem by capturing 3D directly. No vendor publishes per-element precision/recall on third-party plans. The inference is not that automation is impossible; it is that **the honest frontier ships with a verification layer and a review escape hatch** — which is exactly what the tiered-autonomy design formalizes, with the explicit engineering goal of driving the review tier's share toward zero rather than pretending it is already there.

## 3.10 Seven Lessons the Architecture Must Obey

1. **Topology is checkable; check it always.** From R2V's integer program to FloorplanVLM's validity reward, every leap in this field came from enforcing what can be proven. (Counters F3, and much of F1/F4 for free.)
2. **Openings need their own pipeline.** Weakest element in every system ever measured. (F1/F4 on openings.)
3. **VLMs read and judge; they do not locate or count.** Use them only on marked candidates and text. (F1, F2.)
4. **Style routing precedes everything.** Cross-convention transfer is a cliff, not a slope. (F1, F4, F6.)
5. **Vector input is a different, better problem.** Never rasterize real geometry. (F2.)
6. **Small pixel-perfect ground truth beats large noisy data** — for training, for evaluation, and for calibration. (All families.)
7. **Best-of-K under verifiable rewards approximates at inference time what frontier labs achieve with RL at training time.** Sampling diversity + deterministic scoring is the single highest-leverage cheap trick available. (F2, F3.)

---

# 4. The Knowledge Matrix

The request was to think in known-knowns, known-unknowns, and unknown-knowns. All four quadrants are covered — including unknown-unknowns, which cannot be listed but can be engineered against.

## 4.1 Known-Knowns (established facts the design is built on)

1. Vector-encoded plans permit exact geometry recovery; the residual problem is semantic classification of primitives. (§3.7)
2. Junction-and-constraint formulations enforce topology and delete impossible false positives; proven since 2017. (§3.2)
3. The walls-first, openings-nested, rooms-as-cycles schema is topology-safe by construction and validated at industrial scale. (§3.4)
4. Frontier VLMs read text and labels at ~0.85–0.95 but count doors at 0.09–0.39 and windows near 0.14; they misread swings, confuse windows with gaps, hallucinate fixtures, and cannot emit precise coordinates. (§3.5)
5. Pre-marked candidates (Set-of-Mark) convert VLM grounding from unusable to reliable, with sensitivity to marker design. (§3.5)
6. Segmentation models transfer across drawing conventions poorly; the failure is cliff-shaped (WAFFLE). Pre-train-then-regionally-fine-tune, plus synthetic re-rendering across conventions, are the demonstrated mitigations. (§3.6, §3.2, §3.4)
7. Openings are the least reliably extracted element class in every published system. (§3.4)
8. Data quality/pixel-alignment dominates data quantity for topological correctness. (§3.4)
9. Verifiable geometric scoring — watertightness, IoU against the source, render agreement — separates good candidates from bad ones without ground truth, enabling best-of-K selection at inference. (§3.4)
10. Scale is recoverable redundantly from dimension text, scale bars, and object priors; RANSAC over dimension–span pairs both fits scale and flags OCR errors. (§3.8)
11. The commercial state of the art ships human verification behind the marketing. (§3.9)
12. A 120 s budget comfortably fits: rectification, one GPU segmentation+detection pass, two to four frontier-VLM calls, constraint solving, and one to two render-verify iterations. (§6.6)

## 4.2 Known-Unknowns (identified questions with defined experiments)

1. **The corpus itself.** Actual distribution over encodings, conventions, contamination, and scope — unknown until samples arrive. Phase 0 is the experiment.
2. **Per-convention accuracy of a CubiCasa5K-pretrained model fine-tuned on ~100–300 target-convention plans.** Literature says the recipe works; the achievable ceiling on *this* corpus is unmeasured. Phase 3 measures it.
3. **Which frontier VLM, with which marker design, best adjudicates marked candidates on architectural line art.** AECV-Bench warns that rankings are task-specific and non-monotonic in model size. A 200-crop adjudication benchmark decides it empirically (Phase 6), re-run quarterly as models update.
4. **Opening-detector ceiling:** F1 achievable by a dedicated symbol detector (YOLO-class, trained on CubiCasa5K openings + synthetic re-renders + corpus samples) on the target distribution. Phase 5.
5. **Render-and-compare discrimination power:** what unexplained-ink and missing-ink thresholds separate correct from flawed reconstructions on real plans, and what the ROC looks like. Phase 6.
6. **Calibration quality:** whether per-element confidence can be calibrated (isotonic/Platt on validation data) tightly enough that tier-1 conditional ZFR ≥ 0.98 with tier-1 coverage high enough to matter. Phase 6.
7. **Photo-path fidelity:** corner-detection + homography rectification residuals on real phone photos of plans; whether the geometric bar for photos must be permanently lower. Phase 7.
8. **Multi-unit isolation reliability:** can unit boundaries be inferred (entrance doors, unit labels, demising-wall thickness) at ≥ 0.95, or is a one-tap unit selection the rational product answer? Phase 7.
9. **The LoRA question:** does a scoped fine-tune of an open VLM (Qwen-VL family) on 3–10K corpus-distribution samples add ensemble value per dollar over the trained-detector track? Phase 7+, strictly optional.
10. **Cost/latency in production percentiles,** especially GPU cold starts on serverless infrastructure vs. the 120 s p99. Phase 8.

## 4.3 Unknown-Knowns (things already known — by the field, or latently in the data — that typically blindside builders)

This quadrant is the reason the research mandate existed; each item is knowledge that exists *somewhere* and predictably ambushes newcomers:

1. **"Wall" is not a well-defined class.** Low partition walls, glass walls, cabinetry runs, bulkheads, shafts, and demising walls are judged differently by different annotators and downstream uses. CubiCasa5K's own QA notes and the R3D-vs-CubiCasa annotation-quality comparison show even curated datasets disagree. Without a written labeling spec (Phase 0 deliverable), the system's accuracy ceiling is the *ambiguity* of the target, and no amount of modeling fixes a moving target.
2. **Your ground truth will be wrong.** 5–120 min/plan annotation times and two-stage QA in the flagship dataset imply meaningful GT error rates everywhere. Budget a second-pass GT audit; treat eval-metric anomalies as possible GT bugs before pipeline bugs.
3. **Benchmark numbers are in-distribution numbers.** Published IoU/F1 silently assume the test style matches training. The WAFFLE cliff is the documented general case. Never quote a paper's number as an expectation for your corpus.
4. **The false-positive/false-negative dial is one dial** per detector. Independent evidence sources are the only way to improve both simultaneously — this is elementary ROC logic, yet single-model threshold-tuning consumes months in most attempts.
5. **"Vector PDF" frequently isn't**, and raster plans frequently hide a vector twin one email away (the architect has the DWG). Both facts change routing and product decisions.
6. **VLM answers vary run-to-run;** self-consistency (majority over 3–5 samples) is a known, cheap variance killer that most integrations skip. Conversely, temperature-0 single calls give false confidence.
7. **Marker/prompt cosmetics move VLM accuracy by ±10 points.** The adjudicator's marker style is a tunable hyperparameter with its own benchmark, not a UI choice.
8. **Doors are the best scale ruler on unlabeled plans** (interior leaves cluster ~800–900 mm worldwide) — an old surveyor's trick that rescues scale when text fails.
9. **Tiling seams and downscaling kill thin walls.** High-resolution plans fed naively to fixed-input models lose 1–2 px partitions; sliding-window inference with overlap-stitching is standard practice in segmentation literature and routinely forgotten.
10. **Rooms-as-independent-polygons double-count shared walls** — the documented query-transformer flaw. Any tempting "just predict room boxes" shortcut re-imports it.
11. **Topological validity can be *guaranteed*, not just encouraged** — a solver that refuses invalid output moves a whole error family to zero. Teams that treat topology as a metric rather than a constraint leave this on the table.
12. **The industry's hidden humans** mean there is no proof-of-existence for fully-automatic near-perfect on arbitrary input. Planning as if a competitor has already solved it silently would be planning against a ghost; the tiered design is how you ship value while honestly converging on the goal.

## 4.4 Unknown-Unknowns (engineering against the unenumerable)

By definition unlistable; the mitigations are structural. **Verification-first architecture:** a system that independently checks its output detects *novel* failure modes as unexplained disagreement, without needing to have anticipated them — the render-and-compare residual is a universal anomaly detector. **Canary and regression suites:** every production plan that ever failed enters the eval set; the suite only grows. **Per-convention gates:** new styles run in shadow mode (extract, verify, report, but tier-3 by default) until their stratum clears the bars. **Drift monitoring:** tier distribution, render-agreement statistics, and VLM-adjudication disagreement rates are time-series; alarms on shift catch upstream changes (new plan sources, silent VLM model updates) before users do. **Versioned everything:** schema, prompts, model checkpoints, and marker styles are pinned and replayable, so any regression bisects. **Escape hatch by design:** tier-4 (manual) exists so that the unknown-unknown costs a support ticket, not a corrupted 3D model.

---

# 5. The Thesis: A Verification-First Ensemble Architecture

## 5.0 Design Principles

**P1 — Separation of what and where.** Semantic decisions (is this a wall? is that a window?) and geometric decisions (exactly where, exactly how thick) are made by different components. Learned and language models propose and classify; deterministic geometry localizes and refines; nothing learned ever has the final word on a coordinate.

**P2 — Independent evidence, explicit fusion.** Every element must be supportable by more than one evidence channel drawn from: vector primitives, learned segmentation, learned symbol detection, classical CV witnesses, VLM adjudication, and topological necessity. Fusion is a scoring rule over channels, not a cascade where one model's output becomes the next model's unquestioned input.

**P3 — Topology as law.** The output space is restricted, by the solver and the schema, to watertight structures. Invalid geometry is not penalized; it is unrepresentable.

**P4 — Verification is the product.** Detection produces candidates; verification produces the answer. Every element ships with calibrated confidence and the verdicts of independent checks. The system's most important capability is knowing what it doesn't know.

**P5 — Best-of-K everywhere randomness exists.** Any stochastic stage (VLM calls, augmented inference) runs multiple samples; deterministic verifiable scores select or vote.

**P6 — The pipeline is a standalone service.** One contract in (file bytes + options), one contract out (Section 1.2 JSON). No assumption about, or dependency on, any particular application, framework, or runtime consuming it.

The pipeline in one line:

**Triage → (Track V | Track R) evidence generation → candidate fusion → geometric solve & topological reconciliation → opening attachment → scale recovery → verification loop (kill chain + render-and-compare + VLM adjudication) → confidence gating → JSON.**

## 5.1 Stage 0 — Triage Router

Cheap, fast, and decisive. Inputs: the file. Outputs: encoding class (V/R/P/S), convention class, contamination flags, scope class, page/sheet segmentation, and a per-class routing plan.

Mechanics: file-type dissection first (does the PDF contain path primitives, and do those paths *cover the ink* of a low-res raster render? — coverage test, not extension test). A single small-VLM call classifies convention, contamination, scope, and multi-floor layout from a downscaled image — this is squarely within validated VLM competence (global semantic classification, text presence, layout description). Classical signals (stroke-width histogram, ink density, Hough orientation spectrum, color census) computed in milliseconds cross-check the VLM's convention call; disagreement routes conservatively (run both candidate conventions' extractors in Phase-6+ configurations, or drop straight to tier-3). Multi-floor sheets are segmented here into per-floor sub-jobs; multi-unit plates get a scope mask or a scope question, per the Phase-7 known-unknown.

Misrouting is catastrophic downstream, so the router has its own eval stratum and its own confusion-matrix bar (≥ 0.98 on encoding, ≥ 0.95 on convention) before anything depends on it.

## 5.2 Track V — Vector-Native Extraction

When walls are genuinely vector: parse all primitives with exact coordinates (paths, rects, fills, strokes, layers, colors). The problem becomes primitive classification and assembly:

1. **Prefilter** by geometry and style statistics: stroke widths cluster; wall strokes/fills form the dominant thick cluster; text outlines, hatching, and dimension ticks sit in distinct clusters. Layer names, when present (CAD-derived PDFs), are read by the VLM and mapped to semantic roles — free, high-precision evidence.
2. **Wall face pairing:** double-line conventions yield parallel segment pairs at consistent offsets → centerline + thickness analytically, at float precision. Filled conventions yield polygons → medial-axis centerlines with exact thickness.
3. **Classification of the residue** (is this thick polyline a wall or a wardrobe?) uses the same fusion, kill-chain, and adjudication machinery as Track R — Sections 5.4–5.7 are track-agnostic; only evidence generation differs.

Track V's geometric error is essentially zero; its risk is purely semantic (F1/F6). This asymmetry is why the router's vector test is worth real engineering: every plan it correctly claims skips the entire F2 family.

## 5.3 Track R — Raster Evidence Generation

Preprocessing per class: photos are rectified (page-corner or content-quad detection → homography; deskew; illumination flattening), scans are deskewed and binarized adaptively; resolution is normalized with **overlapping-tile inference** for anything above model input size (thin-wall preservation, per §4.3.9).

Then three parallel, *independent* evidence channels:

**E1 — Structural segmentation (learned).** A multi-class segmentation model (wall / opening-gap / door-arc / window-symbol / room-interior / text / background), architecture per current best practice (Mix-Transformer-U-Net hybrid class), pre-trained on CubiCasa5K, fine-tuned on corpus-convention data augmented with synthetic re-renders across conventions (§3.6). Output: probability maps, not decisions. Test-time augmentation (flips/rotations, averaged) buys stability cheaply within budget.

**E2 — Symbol detection (learned).** A dedicated detector (YOLO-class) for door leaves+arcs, window symbols (the regional zoo: double/triple parallel lines, filled sills, mullion ticks), sliding-door glyphs, stair runs, and — deliberately — the major *distractor* classes: furniture items, fixtures, dimension arrowheads, north arrows, scale bars, legends. Detecting distractors explicitly turns the worst F1 offenders into labeled, subtractable objects. Trained on CubiCasa5K symbols + synthetic renders + corpus labels. This channel exists because of Lesson 2: openings get their own detector, tuned for recall (precision is restored downstream by the kill chain).

**E3 — Text and dimension layer (VLM + detector).** Text-instance detection (rotated boxes), then reading: room labels, dimension strings (all scripts, RTL included), scale statements, legends, title-block metadata. Every text box becomes (a) a semantic asset and (b) a *mask* — text ink is subtracted from structural evidence before any line reasoning (the classical text/graphics separation step, now done with modern components). Frontier-VLM crop reading is within its validated 0.85–0.95 competence; a lighter OCR path (PARSeq-class) is the cost fallback.

Classical witnesses (stroke-width transform, morphology-isolated poché mask, Hough peaks, connected-component stats) are computed alongside — near-free features consumed by fusion and the kill chain, never deciders (§3.1).

## 5.4 Fusion, Geometric Solving, and Topological Reconciliation

**Candidate generation.** From E1's wall probability map: threshold conservatively low (recall-first), skeletonize, extract polyline segments, estimate per-segment thickness from the distance transform; merge collinear runs; from Track V, candidates arrive pre-formed. Every candidate carries its evidence vector: seg-probability stats, vector support, detector overlaps, classical-witness features, text-mask conflicts.

**Junction graph.** Candidate endpoints within an adaptive snap radius (scaled by local thickness) form junction hypotheses typed I/L/T/X. Dominant-orientation estimation (from the Hough spectrum) defines the plan's axis system *without* assuming Manhattan: axes are whatever orientations dominate, so 45° wings and non-orthogonal buildings keep their geometry while still benefiting from parallelism/collinearity priors. Curvature: arc fitting is attempted where skeleton curvature is consistent; κ enters the wall parameterization per the schema.

**The solve.** Select the subset of candidates and junction assignments that maximizes total evidence score subject to hard constraints: every selected wall terminates in junctions or flagged free-ends; thickness consistency within learned clusters; no unexplained crossings; angle snapping to the recovered axis system within tolerance; room faces (from the planar subdivision of selected walls) must close. Formally an integer program in the R2V lineage; practically, a greedy-plus-local-search or CP-SAT/MILP solve (OR-Tools class) at this problem size (< a few hundred candidates) runs in well under a second — solver runtime is a rounding error in the budget. The solver's rejections are the first, and strongest, false-positive filter: candidates that cannot be embedded in a consistent wall graph — most furniture, most dimension lines, all text residue — are discarded *with a recorded reason*, which feeds diagnostics and the review tier.

**Output of 5.4:** a watertight wall/junction graph with per-wall fused scores. By construction, F3 = 0 at this point and stays 0.

## 5.5 Opening Attachment

Openings are resolved *against* the wall graph, never independently (schema P3):

1. **Candidate sources (union, recall-first):** E2 detections; E1 opening-gap probability; wall-graph gap analysis (a wall interrupted by a low-ink span flanked by aligned wall continuation is an opening candidate even if no symbol was drawn — the "phantom-gap" both a real source of true openings and of false ones, hence candidates only); Track V symbol primitives.
2. **Projection:** each candidate is projected onto its nearest wall centerline → (host wall, center offset, width). Candidates whose projection exceeds a distance bound or whose width exceeds the host span are killed immediately (topological impossibility).
3. **Classification:** window vs. door vs. passage, from detector class, symbol geometry (arc ⇒ swinging door; parallel-line stack ⇒ window; clean gap with floor continuity ⇒ passage), and — for the disputed residue — VLM adjudication on marked crops (5.7).
4. **Consistency rules:** openings on one wall may not overlap; door widths sane (600–1200 mm interior once scale is known); a room must be reachable (the room-adjacency graph must be connected through doors/passages — an unreachable room is a near-certain missed opening, triggering a targeted re-search of its boundary walls: topology used to hunt false *negatives*).
5. **Enrichment (nullable):** swing side from arc chirality; sliding vs. hinged from glyph; sill/head heights only if annotated.

This subsystem gets its own metrics, its own eval stratum, and its own phase — Lesson 2 is not negotiable.

## 5.6 The False-Positive Elimination Doctrine: A Layered Kill Chain

The request named false-positive removal explicitly; here is the doctrine. No single filter is trusted; a candidate must survive seven layers, each attacking a different failure mechanism, each cheap to reason about, each independently testable. Layers 1–4 are deterministic; 5–6 involve models; 7 is statistical.

**Layer 1 — Source hygiene (prevent).** Text ink masked (E3) before any structural reasoning; legends, title blocks, north arrows, scale bars, insets detected (E2 distractor classes + layout analysis) and excluded from the extraction region; sheet/scope segmentation from the router bounds the universe. The cheapest false positive is the one never generated.

**Layer 2 — Local geometric priors (filter).** Per-candidate sanity: minimum length relative to thickness; thickness within the plan's learned thickness clusters (wall thicknesses on one plan are few and quantized; a 40 mm "wall" on a plan whose clusters are 100/200/250 mm is furniture); parallel-face support for hollow conventions; poché-fill support for filled conventions; stroke-texture check (hatching and stair treads are periodic — a 1-D FFT along the candidate flags periodicity).

**Layer 3 — Cross-evidence voting (corroborate).** The fusion score requires either two independent channels above their operating points, or one channel plus strong classical witnesses plus prior consistency. Single-channel candidates are never auto-accepted — they are exactly the population that VLM adjudication (Layer 6) exists for. This is the ROC-logic answer to §4.3.4: adding an independent witness improves precision *and* recall simultaneously, which no threshold can.

**Layer 4 — Topological pruning (prove).** The 5.4 solver's constraint rejections; plus post-solve audits: dangling stubs below length bounds, walls participating in no room cycle and no external boundary (demoted to "candidate — unconfirmed structure"), openings violating host-span or overlap rules, duplicate near-coincident walls merged. Uniquely, this layer's kills are *certain*, not probabilistic.

**Layer 5 — Analysis-by-synthesis (the universal detector).** Render the current JSON back to an image in the *detected convention* (walls as poché or double-line to match, openings as gaps/symbols), align via the stored transform, and diff against the structural-ink image (source minus text/distractor masks). Two residual fields result: **unexplained ink** (source structure the model didn't produce — missed elements, F4) and **hallucinated ink** (model structure absent in the source — false positives, F1/F2). Residual blobs are localized, measured, and become work items: hallucinated-ink blobs overlapping a low-evidence element trigger its demotion; unexplained-ink blobs trigger targeted re-extraction in that region at higher sensitivity. Global agreement statistics (structural-mask IoU, unexplained-ink ratio) become the plan-level health score. This is the layer that catches the failure mode nobody predicted, because it assumes nothing about *why* the reconstruction is wrong — only that a correct reconstruction re-explains the ink. One to two iterations of this loop fit comfortably in budget.

**Layer 6 — Targeted VLM adjudication (judge the disputes).** Everything still unresolved — single-channel candidates, residual-flagged elements, classification ties — is packaged as a Set-of-Mark task: a crop around the disputed region at full resolution, candidate(s) overlaid with numbered markers in a benchmarked marker style, and a constrained question ("Marker 3 spans a rectangle attached to the south wall. Is it: (a) a wall, (b) fitted furniture, (c) a plumbing fixture, (d) other/unclear?"). Multiple-choice, never coordinates; 3–5 samples with majority vote (self-consistency, §4.3.6); "unclear" is always an option and routes to review rather than forcing a guess. Batching disputes into one or two structured calls keeps cost flat. This is the VLM inside its validated competence (§3.5) doing the one thing deterministic code cannot: telling a wardrobe from a wall by *understanding the drawing*.

**Layer 7 — Calibrated thresholds (decide).** Surviving elements carry a fused score mapped through a calibration function (isotonic regression fitted on validation data, per element class) to a probability. Class-specific operating points, chosen on the validation ROC to hit the tier-1 conditional-ZFR bar, make the accept/flag decision. Calibration is re-fit whenever any upstream component changes — an uncalibrated confidence is a lie with decimals.

**Doctrine summary:** prevent → filter → corroborate → prove → re-explain → judge → decide. A furniture rectangle must fool a thickness prior, two independent detectors, a topology solver, a re-rendering diff, and a frontier VLM looking straight at it with the question spelled out — *and* clear a calibrated threshold — before it enters the JSON as a wall. That stack, not any single model, is the near-perfect claim.

## 5.7 The Verification Loop as Control Flow

Operationally, 5.4–5.6 run as a loop with a budget governor: solve → attach → render-diff → if residuals above tolerance and budget remains: targeted re-extraction/adjudication on residual regions → re-solve. Convergence is typical in one to two iterations; the governor guarantees the 120 s envelope by degrading gracefully — if budget expires with residuals outstanding, affected elements are flagged and the plan tiers down rather than blocking. Best-of-K (P5) wraps stochastic stages: when the VLM full-plan reading (an optional Track-R evidence booster on hard plans: one FloorplanVLM-style "emit the JSON" call whose output is used *only* as candidate evidence, never as truth) is invoked, K=3 samples are scored by the same verifiable metrics and the best is kept.

## 5.8 Confidence Gating: The Autonomy Ladder

Fully-automatic and quick-review are one system at two thresholds:

- **Tier 1 — Auto-accept.** All checks green; every element above its operating point; render agreement above bar. Ships silently. *Contract: conditional ZFR ≥ 0.98.*
- **Tier 2 — Auto-accept, flagged.** Structure green; enrichment uncertainties only (a swing direction, a label). Ships with machine-readable flags.
- **Tier 3 — Targeted review (the compromise).** A handful of specific, pre-localized questions — the exact disputes Layer 6 couldn't settle — presented as one screen of accept/fix taps, never a re-tracing session. Seconds of human time, spent precisely where the system knows it is blind.
- **Tier 4 — Declined.** The system states it cannot extract this input reliably (router anomaly, budget exhaustion with major residuals) and says why. An honest refusal is a feature; a confident hallucination is the only unforgivable output.

The engineering goal over time is monotone tier-1 share growth per stratum, with the tier-1 contract never violated — that is the operational definition of "fully automatic as the goal, quick review as a compromise."

## 5.9 Scale Recovery

Runs after geometry stabilizes (needs wall spans) and before final JSON: (1) pair every read dimension string with its measured pixel span via extension-line/arrowhead association; (2) RANSAC a single global mm-per-px scalar over all pairs — inliers confirm, outliers flag misreads (which loop back as E3 corrections); (3) corroborate with scale-bar measurement and stated ratio × physical page size when available; (4) fallback: door-width prior (§4.3.8) yields a low-confidence scale honestly labeled `scale_source: "door_prior"`. Disagreement among sources above tolerance → scale ships null with plan-frame units and a tier-2/3 flag, never a silently wrong number. Round-number snapping (walls at 3.62 m vs 3.615 m when a "362" dimension exists) is applied only where a matched dimension string licenses it.

---

# 6. Implementation

## 6.1 System Shape and Infrastructure Options

The extractor is a standalone service: `POST /extract` with file bytes and options → job → Section 1.2 JSON. Internally it is a Python pipeline (the entire relevant ecosystem — OpenCV, scikit-image, shapely, networkx, PyMuPDF, OR-Tools, PyTorch/ONNX — is Python-native), orchestrating three resource classes: CPU geometry (milliseconds), GPU model inference (seconds), and hosted VLM calls (tens of seconds). Three deployment shapes, evaluated against the 0–120 s budget and free-API allowance:

**Shape A — All-hosted, zero custom models.** Frontier VLM calls + CPU geometry only; no E1/E2. Fastest to stand up; useful as the Phase-1 baseline and as a permanent minimal fallback path. Its ceiling is dictated by §3.5: without trained detectors, symbol recall depends on VLM adjudication over *classically generated* candidates, which will cap opening F1 well below the bar on anything nontrivial. Cost ≈ $0.02–0.10/plan; latency 20–60 s. **Verdict: baseline and fallback, not the destination.**

**Shape B — Hybrid serverless (recommended).** E1/E2 (and OCR fallback) served on serverless GPU (Modal / Replicate / RunPod class): scale-to-zero, per-second billing, cold starts 10–40 s mitigated by image slimming, snapshotting, or a small keep-warm budget when volume justifies. Frontier VLM via API for triage, text, adjudication, judging. CPU geometry co-located with the orchestrator (any host — a container platform or a long-timeout serverless runtime; the only hard requirement is a ≥ 150 s execution window and async job semantics). Cost ≈ $0.03–0.25/plan warm; latency 30–90 s warm, worst-case cold within budget with the governor. **Verdict: the design center of this paper.**

**Shape C — Persistent GPU.** Only rational above roughly 1–2k plans/day sustained or for hard p99 latency contracts; revisit at Phase 8 with real volume numbers. Nothing in the architecture changes — Shape C is Shape B with a different bill.

All shapes keep the same code and contracts; infrastructure is a deployment detail by design (P6).

## 6.2 Build the Evaluation Harness First

Nothing else starts until this exists, because every subsequent decision — model choice, thresholds, marker styles, phase gates — is an eval query. Components:

1. **Ground-truth annotation tooling.** An annotator (an existing plan editor, or a purpose-built canvas tool) that saves *directly in the Section 1.2 schema*, plus a written **labeling specification** resolving the §4.3.1 ambiguities: what counts as a wall, how cabinetry/low walls/glass are labeled, how passages vs. missing-wall gaps are annotated, unit-scope rules. The spec is versioned; GT is second-pass audited (§4.3.2).
2. **The metric engine.** Implements Section 1.3 exactly (bipartite matching, τ-sweeps, opening attachment rules, validity checks, ZFR bookkeeping), stratified by encoding × convention × scope, with per-plan HTML reports rendering GT vs. prediction overlays and residual maps — visual diffing is where 80% of debugging happens.
3. **The corpus registry.** Every plan: provenance, class labels from the router (audited), GT status, split assignment (train/val/test with *plan-source-level* separation so near-duplicate marketing variants never straddle splits), and canary membership.
4. **A regression runner** producing one-page deltas between pipeline versions per stratum. Metric movement without an explanation blocks merge.

Deliverable size for Phase 0: 30–50 fully-audited GT plans covering the corpus's classes (§4.2.1), plus the harness. Grow to 100–150 by Phase 6 for calibration headroom; WAFFLE's 110-image wall/door/window benchmark joins as a fixed out-of-distribution stratum.

## 6.3 Models and Data Strategy

**E1 segmentation.** Start from a CubiCasa5K-pretrained multi-task checkpoint (public implementations exist) or retrain a current encoder (SegFormer/Mix-Transformer-U-Net class) on CubiCasa5K; fine-tune on the target conventions using (a) corpus GT, (b) **synthetic re-renders**: take vector GT (CubiCasa5K SVGs + corpus GT + any Track-V extractions) and re-render each plan programmatically in every convention — poché, double-line, thin-stroke, colored, hatched — with randomized furniture, dimensions, text (multi-script), and noise. This is the FloorplanVLM synthetic-subset mechanic at hobby scale and the single cheapest robustness purchase available (§3.6). Hundreds of vector plans × dozens of render styles = tens of thousands of pixel-perfect training pairs from a weekend of renderer work.
**E2 detector.** YOLO-class, trained on CubiCasa5K icon annotations + the same synthetic renders (which give free, perfect symbol boxes) + corpus labels; distractor classes included from day one. Export both models to ONNX for portability and cold-start speed.
**E3.** Frontier VLM for reading (primary), PARSeq-class OCR as the cost/latency fallback; a text-detection model (CRAFT/DBNet class) for instance boxes either way.
**Adjudicator/judge/triage VLM.** Chosen empirically per task on a purpose-built mini-benchmark (§4.2.3): ~200 labeled adjudication crops, ~50 triage cases, ~50 render-diff judgments; evaluate 2–3 frontier models × 2–3 marker styles; pin the winners; re-run quarterly. Structured-output/JSON-schema modes used wherever the API provides them.
**Optional Phase-7+ LoRA.** Qwen-VL-family open model, LoRA-tuned on 3–10K synthetic+corpus samples emitting the Section 1.2 schema, deployed on serverless GPU as one more evidence channel with best-of-K verifiable selection. Strictly an experiment with a kill criterion: it must improve ensemble ZFR per dollar over enlarging E1/E2 training data, else it dies.

## 6.4 VLM Integration Patterns (the contract with the model)

1. **Never ask for coordinates; ask about marks.** All localization flows from deterministic code to the model as numbered overlays; answers are choices among marks.
2. **Constrained answers only:** JSON with enumerated options + "unclear"; schema-enforced decoding where available.
3. **Self-consistency on anything that matters:** 3–5 samples, majority vote, disagreement rate recorded as a feature.
4. **Full-resolution crops, not full-page squints:** the adjudicator sees the disputed region at native resolution with minimal context ring; the triage/judge calls see the downscaled whole.
5. **Batch disputes** into one structured multi-question call per iteration (cost flatness), with per-question IDs for auditability.
6. **Version pinning + drift canaries:** model IDs pinned; the mini-benchmark re-runs on schedule and on any provider model-version change (§4.4).
7. **Prompt library under version control** — Appendix B contains the initial templates (triage, text reading, candidate adjudication, render-diff judging, full-plan evidence reading).

## 6.5 Solver Notes

Candidate scale is small (tens to a few hundred wall candidates), so exactness is affordable: CP-SAT or MILP with binary selection variables per candidate/junction assignment, hard constraints per 5.4, objective = Σ fused evidence scores − complexity penalties. Deterministic tie-breaking (lexicographic on IDs) for reproducibility. Keep a greedy+local-search fallback for pathological instances with a 2 s cap; log every rejected candidate with its violated constraint (the kill chain's audit trail). Geometry via shapely (snapping, planar subdivision → room faces via networkx cycle basis), all in the plan frame at float64.

## 6.6 Latency and Cost Budget vs. the 120 s Envelope

Warm-path Shape-B estimate per raster plan (to be replaced with measured numbers in Phase 1 — these are planning figures, not promises):

| Stage | Latency (s) | Cost ($) |
|---|---|---|
| Router: dissection + classical stats | 0.5–1 | ~0 |
| Router: small-VLM triage call | 2–5 | 0.001–0.01 |
| Rectification/normalization (P-class adds ~1–3 s) | 0.2–3 | ~0 |
| E1+E2 GPU pass (tiled, TTA) | 2–6 warm / +10–40 cold | 0.005–0.03 |
| E3 text: detect + VLM read (batched) | 5–15 | 0.01–0.05 |
| Fusion + solve + attachment | 0.3–1 | ~0 |
| Render-diff iteration ×1–2 | 1–2 each | ~0 |
| Adjudication call (batched, K=3 voting) | 8–25 | 0.01–0.08 |
| Optional full-plan VLM evidence read (hard plans only) | 20–50 | 0.02–0.10 |
| **Typical total (warm, no optional read)** | **~25–60** | **~$0.03–0.15** |
| **Hard-plan total (warm, with optional read)** | **~50–100** | **~$0.05–0.25** |

The governor (5.7) enforces the envelope: optional stages are budget-gated; cold starts consume the slack; expiry degrades to flags + tier-down, never to overrun. Track V plans run in single-digit seconds and cents.

## 6.7 The Phase Plan (STOP-gated)

Each phase ends at a STOP: a written report of measured results against its exit bar; the next phase's plan is confirmed or revised on evidence. Bars marked (†) are provisional until Phase 0 ratifies them against the real corpus.

**Phase 0 — Corpus, spec, harness.** Ingest sample plans; audit and label the corpus registry (encodings, conventions, contamination, scope); write the labeling spec; build annotation tooling + metric engine + reports; produce 30–50 audited GT plans. *Exit:* harness runs end-to-end on GT-vs-GT (perfect scores) and on a deliberately corrupted copy (correct penalties); corpus report enumerating strata and ratifying per-stratum pass bars. **This phase converts every §4.2 unknown about the corpus into numbers.**

**Phase 1 — Baselines ("you are here").** Run three trivial systems over the GT set: (a) public CubiCasa5K-pretrained model + naive vectorization; (b) Shape-A frontier-VLM full-plan JSON (best-of-3 by validity+IoU); (c) classical-only OpenCV pipeline. *Exit:* per-stratum baseline table + failure-mode gallery mapped to Section 2's families. No pass bar — this phase exists to be honest about the starting point and to sanity-check the harness on real predictions.

**Phase 2 — Track V.** Vector dissection, coverage test, primitive classification, centerline/thickness recovery; route through the (initially minimal) solver. *Exit (†):* on genuinely-vector plans: wall F1 ≥ 0.99 @ τ=0.5%, validity ≥ 0.99, ZFR ≥ 0.9.

**Phase 3 — Track R evidence layer.** Synthetic re-renderer; E1 fine-tune; E2 training; E3 pipeline with text masking. *Exit (†):* on clean raster: wall-candidate recall ≥ 0.995 at whatever precision (recall-first by design); opening-candidate recall ≥ 0.98; text-mask completeness ≥ 0.98; per-convention breakdown reported.

**Phase 4 — Solver + reconciliation.** Fusion scoring, junction graph, constraint solve, audits. *Exit (†):* validity = 1.0 by construction (verified); wall F1 ≥ 0.95 @ τ=1% on clean raster; every rejection logged with reason; F3 incidents in output: zero.

**Phase 5 — Openings + scale.** Attachment pipeline, consistency rules, reachability re-search; scale RANSAC. *Exit (†):* opening F1 ≥ 0.90 @ τ=1% pre-adjudication; scale within 1% on plans with ≥ 4 legible dimensions, wrong-scale-shipped incidents: zero (null allowed, wrong not).

**Phase 6 — Kill chain, verification loop, calibration, gating.** Layers 1–7 wired; render-diff loop; adjudication mini-benchmark → model/marker selection; calibration fit; tier thresholds set on validation. *Exit (†):* on clean raster + vector strata: tier-1 conditional ZFR ≥ 0.98 with tier-1 coverage ≥ 0.6; overall ZFR ≥ 0.8; opening F1 ≥ 0.95; hallucinated-wall rate in tier-1 output ≤ 0.2% of elements. **This is the phase where "near-perfect" is either demonstrated per-stratum or the gap is quantified.**

**Phase 7 — Generalization hardening.** Second/third convention strata to bar via targeted data + re-renders; photo path (rectification eval, §4.2.7); multi-unit scoping decision (§4.2.8); WAFFLE stress stratum reported (no bar — it is a thermometer); optional LoRA experiment with its kill criterion. *Exit:* every in-scope stratum at bar or explicitly tier-3-by-default with a written reason; hardening report.

**Phase 8 — Production.** Async job API, queues, retries; observability (tier/agreement/drift time-series, §4.4); canary + regression CI; cost/latency percentiles measured against §6.6; review UI for tier-3 (one-screen accept/fix); versioned releases. *Exit:* two weeks of shadow or live traffic with tier-1 contract holding, p99 ≤ 120 s, and the growing-canary discipline in place.

Sequencing rationale: verification infrastructure (0) before detection (3) before optimization (7), because every later phase is *steered* by the harness; and Track V (2) early because it ships real value with minimal risk while Track R matures.

---

# 7. Risks, Open Questions, and Research Agenda

## 7.1 Ranked Risks and Mitigations

**R1 — Corpus mismatch (highest).** Every provisional bar and several design weights assume a corpus dominated by vector PDFs and clean raster in a handful of conventions. If the real mix skews to photos or sketches, the geometric bars for those strata must be renegotiated, and rectification quality becomes the critical path. *Mitigation:* Phase 0 exists precisely to re-weight the plan before expensive work; the architecture is class-routed, so re-weighting is a scheduling change, not a redesign.

**R2 — The ambiguity ceiling.** If the labeling spec cannot make "wall" crisp on the real corpus (glass partitions, half-walls, built-ins), inter-annotator agreement caps every downstream metric. *Mitigation:* measure inter-annotator agreement in Phase 0 on 10 double-labeled plans; the agreement rate becomes the published ceiling, and disputed sub-classes get explicit schema roles (`role: "partition_low"`, `"glazing"`) rather than forced binary calls.

**R3 — Opening-detector ceiling.** If Phase 5's pre-adjudication opening F1 stalls below ~0.85, tier-1 coverage collapses because too many openings route to adjudication. *Mitigation:* the reachability re-search and gap-analysis channels specifically attack recall; synthetic-render volume specifically attacks symbol-style variance; and if the ceiling persists, the honest fallback is tier-2 flags on low-confidence openings — degraded autonomy, not degraded correctness.

**R4 — VLM drift and dependency.** Provider model updates silently change adjudication behavior; pricing or deprecation shifts economics. *Mitigation:* pinned versions, the quarterly mini-benchmark, a second-provider fallback configuration kept green, and the structural fact that VLMs sit in *judge* roles — the pipeline degrades (more tier-3) rather than breaks if a judge weakens.

**R5 — Cold-start latency on serverless GPU.** Worst-case cold starts stack toward the envelope. *Mitigation:* governor gating of optional stages, ONNX slimming, provider snapshot features, and a keep-warm spend switch once volume justifies it.

**R6 — Calibration data scarcity.** Isotonic calibration and threshold setting need validation volume per stratum; 30–50 plans is thin. *Mitigation:* synthetic renders are unlimited and share failure structure for geometric checks; production tier-3 resolutions feed the calibration set continuously (each human answer is a free labeled example); confidence intervals on the tier-1 contract are reported, not hidden.

**R7 — Builder-side over-engineering.** This paper specifies a system with many components; a solo effort can drown in it. *Mitigation:* the phase gates are also scope guards — every phase ships a usable increment (Phase 2 alone is a shippable vector-plan feature), and Shape A remains a permanently valid minimum system while later phases are under construction.

**R8 — The review-tier temptation.** Once tier-3 exists, it silently becomes a crutch and the automation goal stalls. *Mitigation:* tier-share per stratum is a first-class tracked metric with an explicit downward target, and every tier-3 resolution must feed a training/calibration set — review is designed as fuel for automation, not a substitute for it.

## 7.2 Open Research Questions Worth Experiments (beyond the committed plan)

1. **Pointing-class models as a fourth evidence channel.** Models trained to emit points/boxes natively (open pointing/grounding models, and frontier APIs' detection modes) sidestep part of the coordinate-emission ban; whether their localization on line art beats E2 is an empirical question with a cheap A/B on the adjudication benchmark.
2. **Promptable segmentation (SAM-class) for interactive tier-3.** Not for automatic extraction (thin structures are a known weakness), but as the fix-it interaction: a tap inside a missed room proposing its boundary could make tier-3 corrections near-instant.
3. **Conformal prediction over isotonic calibration** for distribution-free per-element guarantees — attractive for the tier-1 contract's formal footing.
4. **Diffusion/generative re-rendering as Layer 5's renderer** for conventions that are hard to render procedurally (hand-sketch style), tightening render-diff on the S class.
5. **Active-learning loop formalization:** selecting which production plans to GT-annotate next by expected metric information gain rather than recency.
6. **Schema extensions** in priority order once core bars hold: stairs (geometry, not just detection), columns, balconies/terraces as typed zones, plumbing fixtures as placement anchors, ceiling-height annotations.
7. **A public-facing benchmark contribution:** the per-convention stratified eval set (minus private plans) would be a genuine gap-filler for the field, which still lacks a convention-stratified opening-accuracy benchmark.

## 7.3 Conditions That Would Change the Thesis

Intellectual honesty requires stating what evidence would overturn this design. (a) If a FloorplanVLM-class model becomes available as weights or an API and, on the Phase-0 corpus, beats the Phase-6 ensemble on ZFR — the ensemble should collapse around it, keeping only the solver, kill chain, and gating (verification remains non-negotiable; the evidence generator is fungible). (b) If frontier VLM symbol competence jumps such that AECV-style door/window counting exceeds ~0.9 exact-match — re-run Phase 1's Shape-A baseline; the division of labor in §3.5 is empirical, not ideological. (c) If the corpus turns out to be ≥ 90% genuinely-vector — Track V plus a thin classifier may hit the bars alone, and Track R demotes to the fallback. The quarterly mini-benchmark and the frozen Phase-1 baselines are the standing tripwires for all three.

## 7.4 Closing Statement

Near-perfect floorplan extraction is not blocked on a missing model; it is blocked on missing *discipline* — precise targets, independent evidence, provable topology, verification that assumes nothing, and honesty about uncertainty. Every mechanism specified here is either published, measured, or deterministically checkable; the contribution of this paper is their composition into a system whose errors are caught by construction rather than discovered by users. The corpus decides the rest, and Phase 0 is waiting for it.

---

# 8. Appendices

## Appendix A — Canonical JSON Schema (v1.0, field-level)

```jsonc
{
  "schema_version": "1.0",            // semver; breaking changes bump major
  "source": {
    "file_sha256": "…", "filename": "…",
    "encoding_class": "V|R|P|S",       // router verdicts, audited
    "convention_class": "poche|double_line|single_stroke|colored|hatched|mixed",
    "scope_class": "single|unit_in_plate|plate|multi_floor",
    "router_confidence": 0.99
  },
  "units": {
    "system": "mm|plan_units",         // plan_units when scale unrecovered
    "mm_per_unit": 1.0,                // present iff system == "mm"
    "scale_confidence": 0.97,          // calibrated
    "scale_source": "dimension_text|scale_bar|stated_ratio|door_prior|null",
    "scale_inliers": 11, "scale_outliers": 1
  },
  "image_transform": {                 // plan frame -> source image pixels
    "type": "similarity|homography",
    "matrix": [[a,b,tx],[c,d,ty],[0,0,1]],
    "source_px": [W, H]
  },
  "walls": [{
    "id": "w_014",
    "start": [x, y], "end": [x, y],    // centerline endpoints, plan frame
    "thickness": 200.0,
    "curvature": 0.0,                  // signed; 0 = straight, else circular arc
    "role": "external|internal|partition_low|glazing|demising|unconfirmed",
    "openings": [{
      "id": "o_003",
      "class": "door|window|passage",
      "center_offset": 1810.0,         // along centerline from start
      "width": 1400.0,
      "sill_height": 900.0,            // nullable; null => downstream default
      "head_height": 2100.0,           // nullable
      "swing": "left|right|double|sliding|folding|unknown",  // doors only, nullable
      "confidence": 0.98,
      "evidence": ["detector","seg_gap","vlm","render_check"],
      "flags": []                      // e.g. ["swing_uncertain"]
    }],
    "confidence": 0.99,
    "evidence": ["segmentation","vector","topology","render_check"],
    "flags": []
  }],
  "junctions": [{
    "id": "j_007", "point": [x, y],
    "type": "L|T|X|I|end",
    "walls": ["w_014","w_015"]
  }],
  "rooms": [{
    "id": "r_002",
    "label": "bedroom|…|unknown",      // from E3 text or VLM, nullable
    "label_confidence": 0.93,
    "wall_cycle": ["w_014","w_015","w_021","w_009"],  // ordered, closed
    "area": 12.84,                     // derived; units.system^2
    "confidence": 0.95
  }],
  "diagnostics": {
    "tier": 1,                         // 1 auto | 2 flagged | 3 review | 4 declined
    "unresolved": [                    // tier-3 work items, pre-localized
      { "element": "o_007", "question_id": "q_swing", "crop_bbox_px": [..] }
    ],
    "render_agreement": {
      "wall_iou": 0.983,
      "unexplained_ink_ratio": 0.011,  // source structure not reproduced
      "hallucinated_ink_ratio": 0.004  // reproduced structure absent in source
    },
    "kill_log_ref": "…",               // audit trail of rejected candidates
    "pipeline_version": "…", "timings_ms": { "…": 0 }, "cost_usd": 0.07
  }
}
```

Validation rules enforced by the emitting solver (and re-checked by an independent validator): every `wall_cycle` closes with consistent orientation; every opening satisfies `0 < center_offset ± width/2 < wall_length` with no overlap among siblings; every junction's walls actually terminate at its point within ε; no wall self-intersects; thickness > 0; all referenced IDs resolve; `tier == 1` requires empty `unresolved` and all confidences above class operating points.

## Appendix B — Prompt Templates (initial library, version-pinned)

**B1 — Triage (downscaled full page).** System: floorplan intake classifier; output strict JSON per provided schema; choose "unclear" over guessing. User content: the image + "Classify: encoding hints (raster/vector artifacts, photo distortion, hand-drawn), wall drawing convention (options…), contamination present (furniture / dimension chains / legends / title block / watermark / multiple floors / multiple units / site inset), page layout (floor regions as coarse fractional boxes), primary text scripts. JSON only."

**B2 — Text reading (batched crops).** System: exact transcription engine; no normalization, no translation; per-crop JSON {id, text, script, rotation_deg, kind: dimension|room_label|scale|title|other}; "kind" from context; dimensions kept verbatim including separators/superscripts. (Crops pre-rotated upright by detector angle; RTL handled by transcribing visual content faithfully — downstream parsing owns semantics.)

**B3 — Candidate adjudication (Set-of-Mark crops).** System: architectural drawing analyst; answer only about numbered markers; multiple-choice; "unclear" allowed; JSON array of {marker, answer, rationale_short}. User: full-res crop with markers + per-marker questions, e.g. "Marker 2 outlines a 60×180 unit rectangle abutting wall A. (a) structural wall (b) fitted furniture/cabinetry (c) plumbing fixture (d) dimension/annotation graphics (e) unclear." Marker style: [pinned after Phase-6 benchmark]. K=3 samples, majority vote per marker.

**B4 — Render-diff judging.** User: side-by-side (source-structural vs. rendered reconstruction, aligned, residual blobs numbered). "For each numbered residual: (a) reconstruction missed real structure (b) reconstruction contains structure absent in source (c) rendering-style mismatch only (d) source noise (e) unclear. JSON."

**B5 — Full-plan evidence read (hard plans only).** System: emit the v1.0 schema JSON (walls-first, openings nested, rooms as wall-id cycles); coordinates on a 0–1024 grid of the provided image; when uncertain about an element, omit it rather than guess. Output consumed as *candidate evidence with per-element weight, never as truth*; K=3, best-of by validity + render agreement.

## Appendix C — Metric Pseudocode (matching core)

```python
def match_walls(pred, gt, tau):                 # tau in plan-diagonal fraction
    C = [[centerline_cost(p, g, tau) for g in gt] for p in pred]   # inf if unmatchable
    pairs = hungarian(C)                         # optimal assignment
    TP = [(p,g) for p,g in pairs if C[p][g] < INF]
    return TP, precision(TP,pred), recall(TP,gt)

def centerline_cost(p, g, tau):
    d = sym_mean_dist(p.centerline, g.centerline)          # sampled
    ov = overlap_ratio(project(p, g.axis), g.span)
    return d if (d < tau and ov > 0.8) else INF

def opening_tp(po, go, wall_match, tau):
    return (po.cls == go.cls
        and wall_match[po.host] == go.host                 # attachment is part of truth
        and abs(po.center_world - go.center_world) < tau
        and abs(po.width - go.width) <= 0.15 * go.width)

def validity(plan):
    return all([cycles_closed(plan), openings_in_span(plan),
                junctions_consistent(plan), no_self_intersections(plan),
                thickness_positive(plan), ids_resolve(plan)])

def zfr(results):                                # per stratum
    return mean(r.human_edit_count == 0 for r in results)
```

Corner metrics use the same Hungarian pattern on junction points with absolute τ; all metrics computed per stratum (encoding × convention × scope) and never reported aggregate-only.

## Appendix D — Bibliography (sources underpinning this paper)

Academic core: Liu, Wu, Kohli, Furukawa — *Raster-to-Vector: Revisiting Floorplan Transformation*, ICCV 2017 (junctions + integer programming; ~90% P/R) — art-programmer.github.io/floorplan-transformation.html · Zeng, Li, Yu, Fu — *Deep Floor Plan Recognition with Room-Boundary-Guided Attention*, ICCV 2019 — arxiv.org/abs/1908.11025 · Kalervo, Ylioinas, Häikiö, Karhu, Kannala — *CubiCasa5K*, 2019 (dataset + multi-task model; partially-manual commercial origin; two-stage QA) — arxiv.org/abs/1904.01920 · Lv et al. — *Residential Floor Plan Recognition and Reconstruction*, CVPR 2021 (multi-modal structure+text+symbol+scale to physical size) — openaccess.thecvf.com · Chen, Qian, Furukawa — *HEAT*, CVPR 2022 · Yue, Kontogianni, Schindler, Engelmann — *RoomFormer*, CVPR 2023 · Liu et al. — *PolyRoom*, ECCV 2024 — arxiv.org/abs/2407.10439 · *Comprehensive floor plan vectorization with sparse point set representation* (CFP dataset), Automation in Construction 2025 · *Raster2Seq: Polygon Sequence Generation for Floorplan Reconstruction*, 2026 — arxiv.org/abs/2602.09016 · Liu, Yang, Li, Yang (Beike) — *FloorplanVLM*, 2026 (Qwen2.5-VL-3B; FLOORPLAN-2M/HQ-300K; GRPO on verifiable geometric rewards; 96.1% validity / 0.925 ext-IoU / 0.733 opening F1; FPBENCH-2K) — arxiv.org/abs/2602.06507 · Ganon, Alper, Mikulinsky, Averbuch-Elor — *WAFFLE: Multimodal Floorplan Understanding in the Wild*, WACV 2025 (20K in-the-wild; CubiCasa5K-trained models struggle; 110-image wall/door/window benchmark) — tau-vailab.github.io/WAFFLE · *FloorPlanCAD* panoptic symbol spotting line (vector CAD) · *Multi-Unit Floor Plan Recognition and Reconstruction*, 2024 — arxiv.org/abs/2408.01526 · *MitUNet: Hybrid Mix-Transformer and U-Net for wall segmentation*, 2025 — arxiv.org/abs/2512.02413 · Floor plan text-extraction comparative study (YOLO-family/CRAFT/EAST detection; PARSeq/MATRN/EasyOCR/Tesseract recognition), Information Sciences · *A Comprehensive Survey of Floor Plan Recognition 2000–2025*, ICMLNN 2025 — dl.acm.org/doi/10.1145/3747227.3747250.

VLM capability evidence: *AECV-Bench* program, 2025–2026 (frontier-model door counting 9–39%, windows ~14%, best mean ~51% — Gemini 3 Pro; OCR/doc-QA 0.85–0.95; failure modes; non-monotonic model rankings) — arxiv.org/abs/2601.04819 and aecfoundry.com/blog (both benchmark rounds) · DeFazio, Mehta, Blackburn, Zhang — *Vision Language Models Can Parse Floor Plan Maps*, 2024 (topological reading strong: 0.96 nine-step navigation) — arxiv.org/abs/2409.12842 · Yang et al. — *Set-of-Mark Prompting*, 2023 (frontier grounding via marked candidates; coordinate emission weak) — arxiv.org/abs/2310.11441 · Mark-based-prompting synthesis literature 2024–2026 (marker-attribute sensitivity ±10 pts; frontier-only applicability) · *ArchPlanVQA*, J. Computing in Civil Engineering 2026.

Industry: CubiCasa product/developer pages (scan-based capture; 95–97% claimed area accuracy; API) — cubi.casa · CubiCasa5K paper's own account of its partially-manual conversion pipeline (the hidden-human datum) · plan-conversion vendor materials reviewed for turnaround/QA patterns (rastertovector.com et al.).

All characterizations above are paraphrased; figures are as reported by the cited sources at the time of writing (July 2026) and should be re-verified against source versions when quoted onward.

---

*End of paper. Version 1.0 awaits its corpus.*
