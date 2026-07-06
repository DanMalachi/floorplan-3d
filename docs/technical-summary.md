# Technical summary — how tracing and understanding work

*Written 2026-07-06. Covers Phases 1–5 as built through commit `700c2bc`.*

## 0. The rules everything hangs on

**Geometry is never inferred by an AI. AI may classify existing geometry
or resolve ambiguity, but it never creates coordinates.** Every coordinate
in the system — wall endpoints, opening spans, room polygons — is produced
by classical code (vector math, morphology, graph traversal). The VLM
(Claude) is only ever asked *what things are*: "is candidate #41 a wall or
a dimension line", "is this room a bathroom". This keeps results
reproducible, debuggable, and cheap: a wrong label is one click or one
re-run; wrong geometry would poison everything downstream.

The architecture is intentionally modular: every stage communicates
through explicit intermediate representations, never opaque model
outputs. That is why a stage can later be swapped — raster extractor,
vector extractor, segmentation model, VLM, room classifier — without
touching what consumes it.

The second principle follows from it: **recall over precision, 10×.** The
extraction stages are high-recall candidate *generators*; noise is expected
and cheap (a reject click or a VLM label), while a missed wall is invisible
and expensive. The success metric for the whole pipeline is **correction
effort** — how many clicks from upload to a clean model.

The third principle is the backbone of the system: **every stage produces
a richer graph than the previous one.** The system never jumps directly
from pixels to semantics — each stage below transforms one representation
into a richer one:

```
pixels / PDF
    ↓
wall primitives        (centerlines + thickness)
    ↓
wall graph             (noded at junctions)
    ↓
topology               (loops, gaps, adjacency)
    ↓
rooms                  (planar faces)
    ↓
room graph             (connections, exterior, features)
    ↓
semantics              (types, functions, house archetype)
```

Deterministic processing climbs this ladder; semantic interpretation only
annotates the upper rungs. That ordering is *why* geometry comes first —
each semantic question ("is this a bathroom?") is answered over a graph
that geometry has already made exact.

A fourth principle governs openings specifically: **topology is
established before openings are named.** Every interruption in a wall is
first treated as a topological connection; whether it represents a door,
window, slider, or open passage is decided later, by the layer built for
exactly that question (§7.2 is this principle applied to the current room
closure gaps).

## 1. Pipeline at a glance

```
input file ──► geometry proposal ──► regularization ──► candidates ──► labels
(PDF/image)      (Python)              (TypeScript)       (TS)         (VLM, optional)
                                                                          │
        suggestion review in the trace editor  ◄──────────────────────────┘
                    │ accept
                    ▼
     node-graph trace ──► planar faces = rooms ──► Scene schema ──► 3D build engine
                                                        │
                                          semantic layer (rules → VLM escalation)
```

Two proposal paths converge on one contract (centerline segments with
per-segment thickness, plus arcs/text where available), so everything from
candidates onward is shared.

## 2. Geometry proposal

### 2a. Vector PDFs — `scripts/extract_pdf.py` + `src/trace2d/extractWalls.ts`

PyMuPDF reads the drawing commands directly: line segments, arcs, color,
stroke width, OCG layer, plus a page render PNG and the text words. No
pixels are interpreted; the geometry is already in the file.

Wall detection exploits how CAD plans draw walls — **two parallel lines a
wall-thickness apart**:

1. Filter to black, long-enough strokes (noise layers like furniture
   dropped by layer/color).
2. Cluster collinear fragments into *face edges*.
3. Pair parallel faces whose gap is a plausible wall thickness →
   **centerline + measured thickness**.
4. Reject hatching/stairs (≥3 uniformly-spaced parallels), suppress window
   "pane" edges (short edge sandwiched between longer parallels), drop
   isolated centerlines that touch nothing (dimension lines), enforce a
   minimum wall separation (0.3 m) to kill stair treads.
5. `buildPlanarGraph()` nodes the centerlines at T/cross intersections so
   accepted walls can close into rooms.

Interactive refinements: **thickness calibration** (click a wall, its face
gap becomes an accepted thickness band) and **centerline snap** for manual
tracing (click near a double line, the point lands exactly on its
centerline; near a corner, on the intersection).

### 2b. Raster images — `scripts/propose_raster.py`

For scans/JPEGs/screenshots the geometry must be proposed from pixels.

**Architecture.** Raster extraction is style-routed: double-line CAD
render, gray poché (solid mid-gray wall fills), filled black polygons,
thin-line scan each get a dedicated deterministic extractor, rather than
one universal heuristic evaluating all of them. The styles differ in
*which* signal separates walls from annotation (stroke thickness, a gray
fill band, polygon fill), so the discriminator has to be selected, not
averaged. This is an architectural commitment, not an optimization: a
single global heuristic is structurally unable to cover the style space
(see §6a).

**Current implementation.** The codebase today runs two routed branches
(filled-polygon / thin-stroke), selected by a stroke-width estimate; the
explicit style classifier and the gray-poché extractor are the next
implementations of the same architecture, not new architecture (the
gray-poché discriminator was validated end-to-end on the user's plan,
2026-07-06 — see §6a, §7.1). The current filled-branch pipeline:

1. **Darkness image** = max(RGB) — colored floor fills read light, ink
   reads dark.
2. **Binarize** (Otsu ∪ adaptive), despeckle.
3. **Stroke-width statistics**: distance transform + skeleton give the
   width of every stroke; walls are assumed to be the dominant thick mode.
4. **Wall mask**: morphological opening sized from that estimate erases
   thin strokes (text, dims, symbols) and keeps thick bars. Thin-stroke
   plans (walls drawn as ~2px outlines) can't be opened — the mask stays
   "all ink" and downstream copes with the noise.
5. Letter-sized blobs are dropped; blobs with a wall-grade thick core are
   emitted as **islands** (short wall stubs between adjacent doorways).
6. **Skeletonize → split at junctions → walk branches → Douglas-Peucker**
   → centerline segments with per-segment thickness, plus a quality report.

### 2c. Regularization — `src/trace2d/rasterCandidates.ts`

Raw raster centerlines are wobbly. Deterministic cleanup: snap
near-orthogonal segments (≤6°), merge collinear runs (union-find), then
find openings:

- **Gap doors**: a door-sized gap (0.45–3.5 m) inside a collinear wall run,
  split at islands and at perpendicular T-ing walls, with jamb-face
  trimming; corner doorways pair a run end with a crossing wall.
- **Arc doors**: detect the swing arc as a chain of short thin segments
  with consistent turning (45–120° total sweep), find the straight leaf
  off its open tip → door span = hinge→far arc end (width ≈ leaf ≈ R).
- **Bridges**: every detected gap also emits a wall candidate spanning it,
  so the accepted graph stays continuous across doorways.

## 3. Candidate classification (Phase 2.5) — `src/lib/vlmClassify.ts`

All surviving geometry becomes numbered **candidates** (id, kind, heuristic
guess, pixels, thickness, length, flags). A composite image — the plan with
the numbered candidates drawn on it — goes to Claude with structured
outputs; it returns one of 7 labels per candidate (wall / door / window /
stairs / dimension / furniture / reject) plus confidence. Dense plans are
compacted first (same-guess parallel stacks collapse to a representative;
cap 600). An optional one-line **plan description** from the user is passed
as an advisory hint.

Labels convert to suggestions in the editor: wall candidates the VLM calls
"door" become opening suggestions, "dimension"/"furniture" become rejects,
etc. The human reviews suggestions (accent-colored overlays; click to
reject) and accepts — acceptance welds the noded graph into the trace.

An offline eval harness (`scripts/eval/`: gen-candidates → classify →
score → ab) measures precision/recall against hand-traced ground truth
(`floorplan-gt/*.gt.json`), with length-based wall metrics and tolerant
opening matching. Every heuristic change is validated against 5 GT plans
before it ships; VLM runs are budgeted and quoted first.

## 4. From trace to scene to 3D

The trace is a **normalized node graph**: points, wall segments (a/b node
ids + thickness), openings stored on their host wall as a normalized span.
`traceToScene.ts` converts pixels→meters via the user-calibrated scale
(`metersPerPixel`, set by clicking two points of a known dimension —
mandatory first step, hard-gated in the UI).

**Rooms are derived from the wall graph**: `src/lib/loops.ts` runs
planar-face decomposition (half-edge traversal, neighbors sorted by angle,
keep bounded faces by shoelace sign). Closed faces become rooms directly,
including rooms formed by an internal dividing wall. When topology is
incomplete, the intended behavior is to fall back to **image evidence to
recover likely closures** before semantic analysis — the graph stays the
primary representation, the image is the tiebreaker. (Adopted direction;
today an unclosed loop simply yields no room, which is the failure
described in §6b.)

The 3D side (`Phase 4`) renders walls as segment-split solids (openings are
real gaps, no CSG), triangulated floors, and provides a Sims-style build
engine: selection/undo command stack, wall/corner dragging with snapping
and live dimensions, opening slide/resize with collision clamps, a CC0
furniture catalog with OBB collision + wall magnetism, camera cutaway, and
a day-lighting rig. Editing operates on the same Scene schema, so 2D trace
and 3D build stay one model.

## 5. Building Knowledge Layer v1

Above geometry sits semantics, with its own iron-rule variant: **features →
type, never geometry → type directly**, and every fact carries structured
evidence with provenance (`geometry | rule | ocr | vlm`).

1. `semanticGraph.ts` computes exact room **features**: area, exterior-wall
   count, door/window counts, which rooms connect via which openings,
   closet detection.
2. `roomClassifier.ts` scores room **types** by additive rules (a 4 m² room
   with a door and no window scores toward bathroom/closet...) plus global
   constraints (unique kitchen/entry, ensuite→master). Confident rooms
   (≥0.65) are done — **free**.
3. Undecided rooms **escalate to the VLM**: it receives briefs for all
   rooms (confident ones as context), a whole-plan overview, and native-res
   crops of only the undecided rooms; it returns open-vocab type +
   **function** (sleeping/hygiene/circulation…) + evidence + a house-level
   archetype. OCR'd room labels (vector PDFs) override when present.
4. Everything merges into the Scene as one undo step; the room inspector
   shows type, confidence, and the evidence trail.

First live run: 8/10 rooms decided free by rules; the 2 escalations both
resolved correctly for $0.019. Auto-furnishing is the intended consumer:
`function` tells it what a room needs even when `type` is uncertain.

## 6. Why it still doesn't work perfectly

The failures are concentrated in one place: **the raster proposer as
currently implemented is still a single global heuristic facing an
open-ended distribution of drawing styles** — the style-routed
architecture of §2b is adopted but not yet built. Everything downstream
is comparatively solid.

### 6a. One estimator, many drawing styles

The proposer's core assumption — "walls are the dominant thick stroke
mode" — is true for some plans and structurally false for others:

- **Gray-poché plans** (the user's own plan, standard Israeli CAD output):
  walls are solid mid-gray fills, annotation is near-black. Dense
  annotation outvotes the wall modes in the stroke histogram, the
  estimator concludes "walls are 4px", takes the thin-strokes branch, and
  emits 2,880 noise centerlines. Diagnosed 2026-07-06; a mid-gray band
  mask yields a near-perfect wall mask on the same plan (100 clean
  candidates vs 600 garbage) — the signal exists, the router just never
  looks for it.
- **Thin-stroke scans**: walls are 2px outlines, so the wall mask must keep
  all ink; door-leaf ink fuses the skeleton straight through doorways (no
  gap possible), and text/dims become centerlines for the VLM to mop up.
- **Filled-polygon plans** (Matterport-style): walls are solid black
  polygons, not strokes; outline pairing only partially recovers them.
- **Symbol conventions vary**: windows are triple lines here, hatched
  blocks there, something else entirely on scan-derived plans (window
  recall 10/33 on Matterport); garage/panel doors are drawn solid — no
  gap, no arc, nothing for gap/arc detection to find.

Each style got targeted fixes and each fix is validated against the GT
suite, but the pattern is clear: **global parameters cannot separate walls
from annotation across styles**, because what distinguishes them differs
per style (thickness here, grayness there, layer names elsewhere).

### 6b. Room closure is brittle at openings

Rooms only exist if wall loops close, but real walls are *interrupted* —
by windows (never bridged today; only door-sized gaps get bridge
candidates), by wide sliders (3.87 m > the 3.5 m door cap → no candidate at
all), and by mask fragmentation where annotation crosses a wall fill.
Result on the user's plan even with a perfect wall mask: 5 loops close, 17
loose ends. The knowledge layer then starves — no rooms, nothing to
classify. This is the single highest-leverage defect outside the proposer.

### 6c. VLM classification has a shape problem

The single-overview-call design anchors on the candidate's drawn geometry
and heuristic guess: it relabels reluctantly (a sliding door whose only
candidate was a wall guess stays "window"), over-labels doors near curved
furniture, and its `missed[]` channel has returned 0 useful recoveries
across every run. Plan-description hints help doors/stairs but suppress
window labels even with explicit anti-omission prompting. Run-to-run
variance is unmeasured, which makes paid prompt iteration a poor
investment. And on noisy candidate sets (the misrouted plans above) it's
being asked to fix a generator problem with labels — the wrong tool.

### 6d. Honest-signal gaps

The quality verdict said `good` while producing garbage on the user's
plan. The system currently cannot tell the user "this plan style defeats
me, trace manually with snap assist" — which is a supported and fast path,
but only if the app routes people to it.

## 7. Technical opinion — how to actually solve it

My ranked view, cheapest-and-most-certain first:

**1. Build the style router (now the committed architecture, §2b).**
Don't estimate one
"wall thickness" and branch on it; *measure which wall signal the plan has*
and route to the matching mask strategy. The candidate signals are cheap
global statistics: a distinct mid-gray ink population with bar morphology
(→ gray-poché mask), a dominant thick stroke mode (→ current filled
branch), solid black polygons with high fill ratio (→ polygon-outline
strategy), none of the above (→ thin-stroke/all-ink). Each strategy is
simple and near-perfect *within its style* — the gray-poché what-if proved
this in an afternoon. This converts "one heuristic must survive every
style" into "detect the style, then use its clean discriminator", which is
also how a human reads a plan. Add per-style regression plans to the GT
suite as they appear.

**2. Bridge every collinear fill gap and let classification name it.**
Openings are the *topology* of the plan; door-vs-window-vs-passage is
*semantics*. Emitting a bridge + opening candidate for any gap between
collinear wall runs (no door-size cap; windows and 3.9 m sliders included)
fixes room closure deterministically, and pushes the naming question to
exactly the layer built for it — the iron rule applied to openings. Room
closure unlocks the entire knowledge layer, which is where the product's
value concentrates: without it, semantics never gets good input.

**3. Tell the truth in the quality report.** The verdict must detect its
own failure modes (thin-strokes branch exploding into thousands of
centerlines, candidate cap hit, no rooms closed) and route the user to
assisted manual tracing when auto-trace is beaten. This ranks above the
cleverer items because it's about trust: users forgive a system that says
"this plan style defeats me — trace it with snap assist, it's fast"; they
don't forgive silent garbage, and "didn't work well" is exactly what
silent garbage feels like. A fast, honest fallback is a feature.

**4. Make correction effort the interface, not just the metric.** The
human is already in the loop reviewing suggestions; corrections should
*teach the extractor live* within the session. Thickness calibration
already works this way and it rescued the Phase 2 vector pipeline
(5%→94% coverage came from diagnostics, and grids/stairs died via
calibration). Extend the same pattern: rejecting a suggested wall should
tighten the active band; manually tracing a missed wall should loosen it
or add a style hint. This compounds: every click both fixes the trace and
improves the remaining suggestions. It sits below the items above only
because it presumes a deterministic pipeline that's already worth
correcting — build that first.

**5. Spend VLM tokens on ambiguity, not on everything.** The
understand-rooms design is the template: rules decide the easy 80% free,
and the model gets small, high-resolution crops of only the undecided
cases with structured context. Candidate classification should move the
same way — classical filters decide confident walls/rejects; the VLM gets
zoomed crops of ambiguous elements ("is this a sliding door?") instead of
one 600-item overview image. That fixes the anchoring problem (crops make
the symbol legible), the cost problem (tokens scale with ambiguity, not
plan size), and matches measured reality: the room-escalation run cost
$0.019 and got both escalations right, while whole-plan classify runs cost
$0.5+ with mixed results. Solid-panel garage doors and odd window
conventions are exactly the cases this rescues.

**6. Only then consider a segmentation model — as another proposer.** A
raster segmentation net (walls/doors/windows) would slot behind the same
candidates contract without violating the iron rule (mask → vector →
regularize is already built). But it's probabilistic, adds an ML runtime,
has a licensing landmine (CubiCasa weights are NC-tainted), and the
router + gap-topology fixes above likely deliver most of its value on the
plan styles that matter. Revisit only if a style class resists all
deterministic discriminators. The long-shot variant worth keeping in mind:
we own a 3D engine that can *render* plans with known ground truth —
synthetic self-training data is nearly free if a model ever becomes
necessary.

The unifying theme: the architecture is right — deterministic geometry,
semantic escalation, human review — and everything from the trace graph
downward (rooms, room graph, knowledge layer, 3D build) already runs on
stable, shared interfaces. That part earned its stability the normal way:
it works today, on real plans.

The part that hasn't earned that yet is the raster proposer. It is still,
as built, a single global heuristic losing to an open-ended distribution
of drawing styles — not a tuning problem but the structural one described
in §6a. The fix is a refactor of existing machinery (router + per-style
discriminator, gap bridging before naming), not a new invention, and the
gray-poché what-if is a real, if small, proof that the fix works. But it
is still unbuilt, and until it ships, "the architecture is right" is a
claim about the downstream 80% of the pipeline, not the whole of it.
