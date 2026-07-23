# Architectural Reasoning Engine — Architecture

> **Status:** Phase A **approved** (2026-07-08). This document holds *reviewed*
> phases only. Phases B–E are appended after review. It sits under
> [`VISION.md`](./VISION.md): the vision is the goal; this is the structure that
> pursues it.

## What we are building (and what we are not)

We are **not** building a floorplan parser, and the BIM is **not** the primary
product. The primary product is a **Verified Building Model + Evidence Graph**:
an explainable architectural reasoning engine that incrementally constructs,
verifies, and refines an internal understanding of a building until it produces
a BIM a professional can trust — because every conclusion is supported by
evidence, every uncertainty is exposed, and every object is traceable to the
original drawing.

Guiding philosophy — these stages remain independent:

```
Observation → Representation → Reasoning → Verification → BIM
```

### Core design principles

1. Separate observation from interpretation completely.
2. Never silently invent information.
3. Every conclusion must be explainable.
4. Reasoning is independent of whether observations come from DWG or a future raster/image interpreter.
5. Build on general architectural principles — topology, geometry, reasoning — not heuristics tuned to our current plans.
6. When evidence is insufficient, explicitly represent uncertainty instead of guessing.

---

## The load-bearing decision

"Swapping the Interpreter requires **no** change to reasoning" is only
achievable if the reasoning engine **never treats any observation as ground
truth — not even a DWG one.**

> Every observation carries a **confidence**. DWG observations are simply
> high-confidence observations; a future raster interpreter emits lower-confidence
> ones. The reasoning engine consumes confidence-weighted evidence *identically*
> in both cases.

Building reasoning as an **evidence integrator from day one** — even when
today's evidence is near-certain — is what keeps the seam clean.

---

## Resolved decisions (Phase A review)

| # | Decision | Choice |
|---|---|---|
| 1 | Observation/interpretation boundary at apertures & spaces | Interpreter emits **untyped geometric signatures + topology**; *all* typing is reasoning. |
| 2 | Reasoning control model | **Blackboard + agenda** (independent operators), not a fixed pipeline. |
| 3 | BIM projection schema | **IFC**-oriented. |
| 4 | Low-trust / "unknown" objects in exported BIM | **Flagged, not removed** — represented as low-confidence entities carrying their uncertainty. |

---

## Stage → Component map

| Philosophy stage | Component | Produces |
|---|---|---|
| Observation | **Interpreter** (source-specific) | Observation Graph |
| Representation | **World Model** (source-agnostic) | Evolving belief state |
| Reasoning | **Reasoning Pipeline** (blackboard operators) | Belief revisions |
| Verification | **Verification Engine** (adversarial) | Contradictions → fed back as evidence |
| BIM | **Projection** (read-only) | Verified Building Model + Evidence Graph |

Cross-cutting: **Architectural Knowledge Base** (declarative constraints/priors),
**Provenance & Explainability** (first-class), **Orchestrator** (control loop).

---

## Data & control flow

```
  DWG file
     │        ┌───────────────────────── source-specific ──────────────────────────┐
     ▼        │   DWG Interpreter  (later: Raster Interpreter — SAME output schema)  │
  entities ──►│  geometry → topology → spaces → apertures → properties → provenance  │
              └───────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
                          ╔═════════════════════════╗   ◄── THE ONLY CONTRACT
                          ║   OBSERVATION GRAPH      ║       (immutable, objective,
                          ║  facts + confidence +    ║        confidence-weighted,
                          ║  provenance, NO semantics║        source-agnostic)
                          ╚═════════════════════════╝
                                        │  seed (low commitment)
                                        ▼
   ┌───────────────────────────────────────────────────────────────────────────┐
   │                              WORLD MODEL                                    │
   │   beliefs · competing hypotheses · confidence · versioned history          │
   │        ▲ propose (never write directly)          ▲ inject contradictions   │
   │        │                                         │                         │
   │   ┌────┴─────────────────┐              ┌────────┴──────────┐              │
   │   │  REASONING PIPELINE  │◄────agenda──►│ VERIFICATION      │              │
   │   │  (blackboard ops):   │   scheduler  │ ENGINE (adversary)│              │
   │   │  hypothesize·eval·   │              │ tries to DISPROVE │              │
   │   │  contradict·constrain│              └───────────────────┘              │
   │   │  ·revise·propagate   │        both consult ▼                          │
   │   └──────────────────────┘   ┌───────────────────────────────┐            │
   │                              │ ARCHITECTURAL KNOWLEDGE BASE   │            │
   │                              │ general constraints & priors   │            │
   │                              │ (declarative data, not code)   │            │
   │                              └───────────────────────────────┘            │
   └───────────────────────────────────────────────────────────────────────────┘
                                        │  when stable / no further improvement
                                        ▼
                          ┌──────────────────────────────┐
                          │  BIM PROJECTION (read-only)   │
                          │  Verified Building Model       │
                          │        +  Evidence Graph       │
                          └──────────────────────────────┘
```

**Control loop (Orchestrator):** seed → run reasoning cycles interleaved with
verification, agenda-driven → each operator *proposes* changes as evidence → the
World Model arbitrates (keeps competing hypotheses alive) → verification injects
contradictions → repeat until a **fixpoint** (no operator can contribute and no
violation is reducible) or a step/quality budget is hit. Deterministic and
replayable.

---

## Component catalog

### 1. Interpreter (Observation Layer) — *source-specific*
- **Purpose:** turn source entities into objective, measurable observations.
- **Does:** normalize geometry; build topology (node/edge/face planar graph);
  detect enclosed regions (planar faces); detect connectivity signatures
  (boundary discontinuities + associated arcs/blocks = *apertures*, untyped);
  compute properties (lengths, areas, angles, face-pair gaps/thickness,
  adjacency); stamp **provenance** on everything.
- **Must NOT:** call a face a "room," an aperture a "door," a fixture a "toilet,"
  or infer intent. No semantics, ever.
- **Boundary rule (Decision 1):** "these edges enclose a face" and "this boundary
  has a 0.9 m gap with a quarter-circle arc" are **observations**. "This face is a
  bedroom" and "this gap is a door" are **reasoning**. The Interpreter reports the
  *geometric signature*; it never names the type.

### 2. Observation Graph — *the contract*
Immutable, objective, confidence-weighted, provenance-linked. The **only** thing
reasoning sees. (Schema: Phase B.)

### 3. World Model (Representation) — *source-agnostic*
- The engine's evolving "mental model": belief nodes (candidate spaces, walls,
  openings, fixtures, circulation, apartment boundaries…), each with **competing
  hypotheses**, confidence, and links to supporting/opposing observations.
- Supports uncertainty, alternatives, incremental refinement, **versioned
  history** (belief revision is inspectable and reversible).
- Operators cannot mutate it directly — they submit *proposals*; the update
  mechanism integrates them, preserving alternatives. (Details: Phase C.)

### 4. Reasoning Pipeline — *independent operators (Decision 2: blackboard)*
- Independent knowledge sources watch the World Model; when one can contribute it
  posts to a shared **agenda**; a scheduler runs them. Behaves like an architect
  refining a model, not a one-shot classifier.
- **Operator families:** Hypothesis Generators · Evidence Evaluators ·
  Contradiction Detectors · Constraint Solvers · Belief Revisers · Change
  Propagators. Each is domain-general and reads architecture from the Knowledge
  Base, never from inlined heuristics. (Details: Phase D.)

### 5. Architectural Knowledge Base — *general principles as data*
- Declarative constraints and **soft, regional, revisable** typology priors
  (topology laws, circulation/reachability, host relationships, wet-room/plumbing
  coupling, dimensional consistency). Separated from operator code so reasoning is
  general architecture, and priors are never hardcoded cultural assumptions.

### 6. Verification Engine — *adversarial*
- Actively tries to **disprove** current beliefs (unreachable rooms, impossible
  circulation, doors joining invalid spaces, windows without host walls,
  dimensions inconsistent with geometry, disconnected stairs, open apartment
  boundaries, plumbing without wet rooms, duplicate/overlapping spaces).
- Emits violations as **negative evidence** into the World Model, driving another
  reasoning round. Computes per-object and whole-model **trust scores**.
  (Details: Phase E.)

### 7. Provenance & Explainability — *cross-cutting, first-class*
- Every belief change records: which operator, on what evidence, under which named
  principle, yielding what confidence delta. The **Evidence Graph** is a queryable
  artifact, not an end-of-run report. Any object answers: *why do I exist / which
  observations made me / what supports & opposes me / what was rejected / how
  confident.*

### 8. BIM Projection — *read-only (Decision 3: IFC; Decision 4: flag, don't drop)*
- Projects the stable World Model to an IFC-oriented BIM with the Evidence Graph
  attached. Uncertainty is **preserved as attributes**; low-trust and "unknown"
  items are exported **flagged as low-confidence**, never silently dropped or
  invented.

### 9. Orchestrator — control loop, budgets, convergence detection, deterministic replay.

---

## Interfaces (the seams that enforce separation)

| Boundary | Contract | Direction |
|---|---|---|
| Interpreter → World Model | **ObservationGraph** (read-only, objective, +confidence, +provenance) | one-way |
| Operators → World Model | `propose(update, evidence)` — never direct write | mediated |
| World Model → Operators | `query(beliefs)`, `subscribe(changes)`, `snapshot()` | read |
| Knowledge Base → Operators/Verifier | `Constraint.evaluate(worldModel) → satisfied \| violated+evidence` | read |
| Verifier → World Model | `check() → violations[]` injected as negative evidence | mediated |
| Any → Explainability | `explain(objectId) → {hypothesis, supporting, conflicting, confidence, alternatives, derivation}` | read |
| World Model → BIM | `project(trustThreshold) → BIM + EvidenceGraph` | read-only |

Hard rule: **reasoning depends only on the ObservationGraph interface, never on
DWG concepts.**

---

## Design tensions (tracked, not hidden)

1. **Observation/interpretation line is genuinely fuzzy** at apertures and spaces.
   Resolved per Decision 1; revisit if a case breaks it.
2. **Hypothesis combinatorics** could explode. Blackboard + agenda +
   confidence-pruning is the intended control; convergence guarantees are a real
   Phase D design task, not free.
3. **"General principles" can smuggle in cultural bias.** Mitigated by keeping
   typology as soft/regional/revisable priors with confidence, never universal
   rules.
4. **Provenance gap in current code:** `parseDxf` does not yet capture DWG entity
   **handles** (group code 5). Handles exist in the files (1.8k–3.7k per plan) and
   are required for traceability — a concrete Phase F fix. Geometry is frequently
   **nested in blocks**, so provenance is a *path through block instances*, not a
   flat handle.

---

## Sanity checks (Phase A)

1. Works for DWG and raster equally? ✅ Reasoning consumes only the
   confidence-weighted Observation Graph.
2. Observation and interpretation fully separated? ✅ Interpreter is contractually
   forbidden from semantics.
3. Every BIM object traceable to evidence? ✅ BIM → belief → evidence →
   observations → entity handles.
4. Explicit uncertainty? ✅ Confidence on observations *and* beliefs; competing
   hypotheses; "unknown" is a valid, preserved state.
5. Explainable to a professional? ✅ `explain()` under *named* general principles.
6. Revises beliefs on new evidence? ✅ Blackboard + belief revision + propagation;
   non-monotonic.
7. General reasoning, not project heuristics? ✅ Constraints/priors are declarative
   Knowledge-Base data. (Tension #3 is the watch-item.)
8. Scales to millions of different plans? ✅ No per-plan tuning; soft regional
   priors; graceful degradation to "unknown."

---

# Phase B — Observation Graph  *(approved 2026-07-08)*

The Observation Graph is **the contract**. It speaks pure geometry, topology, and
measurement — never DWG vocabulary (that lives only in provenance) and never
semantics (that's the World Model). A future raster interpreter emits the *same
schema*, with lower confidence and possibly fewer observation kinds.

## Resolved decisions (Phase B review)

| # | Decision | Choice |
|---|---|---|
| B1 | Multi-level / floors | **Single implicit `Level` now** (no floor-detection code). `Level` reserved in schema; multi-level is a later additive Interpreter feature, reasoning already keyed by level. |
| B2 | `Band` (parallel-pair thickness) | **First-class objective observation.** Thickness is high value (interior vs envelope, Israeli MAMAD shelters). Delivered via per-band thickness + thickness-change segmentation + a building-wide `ThicknessDistribution` + thickness on the `separates` edge. |

## Three objective tiers + capability descriptor

```
 tier 3  FEATURE     Band · Aperture · FixtureFootprint · Region        (derived, still objective)
 tier 2  TOPOLOGY    Junction · BoundaryEdge · Face                     (derived: planar arrangement)
 tier 1  GEOMETRY    Vertex · Curve · Annotation · ScaleObservation     (raw measurement)
 ─────── grouping    Level (single/implicit for now)
```

Every node: `{ id, kind, attributes, confidence, basis, provenance | derivedFrom }`.

| Kind | Tier | Objective meaning | Key attributes | **Not** (reasoning) |
|---|---|---|---|---|
| `Vertex` | geom | a point in normalized plan coords | x, y | — |
| `Curve` | geom | segment or arc between vertices | type(line\|arc), length, radius, sweep | — |
| `Annotation` | geom | text/number placed at a point | text, anchor, (if dim) spanLen + endpoints | "labels the kitchen" |
| `ScaleObservation` | geom | declared units → real-world scale | unitsDeclared, metersPerUnit, **plausibility** | trustworthy scale |
| `Junction` | topo | where curve-ends coincide (±tol) | degree, position | — |
| `BoundaryEdge` | topo | maximal continuous edge run between junctions | polyline, length, straightness | "wall face" |
| `Face` | topo | minimal enclosed planar region | area, perimeter, **closedness** | "room" |
| `Band` | feat | parallel BoundaryEdge pair, consistent thickness | thickness, overlapLen, hatchPresent | "wall" |
| `Aperture` | feat | discontinuity in a band/boundary | gapWidth, swingArc?, spanningSymbol? | "door"/"window" |
| `FixtureFootprint` | feat | bounded geometry of a block instance / cluster | bbox, area, repeatCount | "toilet"/"sink" |
| `Region` | feat | Face or union of faces = enclosed space | area, boundary | "apartment"/"room" |
| `ThicknessDistribution` | feat | objective clusters/percentiles of all `Band` thicknesses | clusters[], percentiles | "these are MAMAD walls" |
| `Level` | group | objectively separable floor/plane | index, z\|cluster-id | — |

## Relationships (objective edges)

`composedOf`, `bounds` (Edge→Face), `adjacent` (Face↔Face), `separates`
(Band→Face,Face **carrying thickness**), `connects` (Aperture→Face,Face\|Exterior
= physical connectivity, not "door"), `pierces` (Aperture→Band), `within`
(Footprint→Face), `near` (Annotation→element = proximity, not "labels"),
`derivedFrom` (derived→sources).

## Thickness delivery (Decision B2, in full)

1. **Per-`Band` measured thickness** (+confidence from parallelism/gap consistency).
2. **Segment bands at material thickness changes** — a stepped wall becomes
   adjacent bands of differing thickness; the transition is an objective signal
   (MAMAD embedded in a normal wall).
3. **`ThicknessDistribution`** — building-wide clusters/percentiles positioning
   every band relative to the whole; the relative signal for interior-vs-envelope
   and MAMAD, computed as pure statistics (no interpretation).
4. **Thickness on `separates`** — reasoning receives thickness paired with what is
   on each side (Face/Face = partition; Face/Exterior = envelope).

## Provenance model (handles nesting)

Raw observations carry an **opaque `SourceRef`** the reasoning engine never
inspects. For DWG it is a **handle path through block nesting**:
`{ handlePath:[insert…nested…leaf], leafType, primitive }` — because geometry is
frequently buried in blocks. Derived observations carry `derivedFrom` → provenance
is transitive to raw geometry → DWG handles. A raster interpreter fills `SourceRef`
with `{pixelRegion, detectorId}`; schema unchanged. *(Current `parseDxf` drops
handles — logged Phase F gap.)*

## Confidence model

Per-observation `confidence ∈ [0,1]` + `basis`. Raw DWG geometry ≈ 1.0; **derived**
observations get computed confidence (Band: parallelism/gap consistency; Aperture:
higher with matching swing-arc; Face: lower with boundary gaps;
`ScaleObservation`: **low when declared units imply an implausible size** — our
"units lie" finding as first-class uncertainty). Scope: this is **observation
reliability**, never interpretation confidence (that's the World Model).

## Extension strategy

Additive-only, versioned schema; `kind` is an open enum (unknown kinds pass
through). **Capability descriptor** per interpreter declares emittable kinds; every
reasoning operator declares what it consumes and **degrades gracefully** when a
kind is absent — a weaker interpreter yields more "unknown," never a crash.

## Sanity checks (Phase B)

1. DWG & raster equal? ✅ pure geometry/topology; opaque `SourceRef`; capability
   descriptor. 2. Observation vs interpretation separated? ✅ each type's "Not"
   column. 3. Traceable? ✅ `SourceRef` + transitive `derivedFrom`. 4. Explicit
   uncertainty? ✅ per-observation confidence + basis. 5. Explainable? ✅ `basis` +
   provenance render into explanations. 6. Revisable? ✅ observations immutable;
   revision happens above. 7. General? ✅ geometry-universal types. 8. Scales? ✅
   additive schema, opaque provenance, graceful degradation.

---

# Phase C — World Model  *(approved 2026-07-08)*

The World Model is the engine's **evolving mental model** — the reasoning
substrate above the immutable Observation Graph, below the BIM. It holds
**interpretations as hypotheses**, never facts.

## Resolved decisions (Phase C review)

| # | Decision | Choice |
|---|---|---|
| C1 | Confidence representation | **Log-odds internally** (clean accumulation of independent evidence, natural "unknown"=0), **presented as [0,1]** in explanations. |
| C2 | Persistence | Autosave to disk so a refresh/reopen resumes the plan. **Built now as a minimal, forward-compatible foundation** (project autosave → IndexedDB, auto-restore, "New plan" UI). The belief event log slots into the same `ProjectDocument.worldModel` slot when the reasoning engine exists; multi-project management deferred. |

## Representation: entity → belief → hypothesis → evidence

```
Entity (Space, Wall, Opening, Fixture, CirculationLink, ApartmentBoundary…)
  └─ anchors → Observation node(s)          (Space→Region, Wall→Band, Opening→Aperture; anchor is itself a belief)
  └─ HypothesisSet (exclusive | independent)
        └─ Hypothesis { claim, confidence(log-odds), state }
              ├─ supportedBy → Evidence[]
              └─ opposedBy   → Evidence[]
Evidence { polarity, weight, principle, source → (Observation | Belief) }   ← immutable, append-only
```

- **HypothesisSet exclusivity flag:** a type *slot* (kitchen | utility) is
  `exclusive` (distribution); independent attributes (is-wet, load-bearing)
  co-exist. Makes belief math correct.
- **Evidence is first-class + immutable** → recording it append-only *is* the
  Evidence Graph. Evidence may point at other beliefs (chains + propagation).

## Uncertainty model

Entity states: `resolved` (dominant hypothesis) → exported normally · `contested`
(multiple viable) → exported **flagged** with alternatives · `unknown` (nothing
crosses floor) → exported **flagged**, never invented · `refuted` → kept in
history, not projected. "I don't know" is first-class and preserved (Decision 4).

## Storage & versioning: append-only belief event log

State = a **fold over an immutable event log**. Every integrated proposal →
`BeliefEvent { step, operator, inputs, principle, target, before→after }`. This
delivers history/versioning, deterministic replay, non-destructive belief
revision, and explainability (the log *is* the derivation chain) in one stroke.

## Update mechanism: propose → integrate → propagate

Operators never write directly; they `propose(update, evidence)`. A single
**Belief Integrator** arbitrates: validate → attach evidence (append-only) →
**recompute** the hypothesis confidence from its full evidence set via a pluggable
combination function (log-odds; exact function is Phase D) → never overwrite
(retire, don't delete) → record a `BeliefEvent` → **propagate** (mark dependents
dirty, re-queue on the agenda). Revision is non-monotonic and principled.

## Interfaces

`query(selector)` · `propose(update, evidence)` · `subscribe(changes)` ·
`snapshot(step)` · `explain(entityId)`. Reasoning depends only on this API.

## Implemented now (Decision C2)

`src/store/projectPersistence.ts` — dep-free, SSR-safe IndexedDB autosave of the
durable project slice (plan image, parsed geometry, scale, trace, scene) +
auto-restore on load + `newProject()`; UI status/control in `page.tsx`
(`ProjectStatus`). Verified: plan survives a full page reload. `ProjectDocument`
reserves `worldModel: null` for the future belief event log. `parseDxf` handle
capture still pending (Phase F) before provenance is end-to-end.

## Sanity checks (Phase C)

1. DWG & raster equal? ✅ entities reference observations abstractly; anchor
   confidence absorbs interpreter quality. 2. Separated? ✅ observations immutable
   below; model holds only interpretations. 3. Traceable? ✅ entity→hypothesis→
   evidence→observation→handle via the event log. 4. Uncertainty? ✅ log-odds +
   exclusive/independent sets + unknown/contested preserved. 5. Explainable? ✅
   `explain()` reads append-only evidence + log. 6. Revises? ✅ non-monotonic
   recompute + propagation + superseding events. 7. General? ✅ domain-general
   machinery; principles live in the Knowledge Base. 8. Scales? ✅ append-only log
   + indexed hypotheses.
