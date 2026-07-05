# Floorplan → 3D: Technical Summary (2D-to-3D & Plan Understanding)

*Scope: how the system turns a 2D floor plan into an editable 3D model, and how it
understands the plan (walls, openings, rooms). Excludes the 3D build/edit engine,
furniture, and rendering/atmosphere work.*

---

## 1. What it does

Given a 2D floor plan — a vector CAD PDF, a raster image/scan, or a manual trace —
the system reconstructs the building's structure (walls, doors, windows, rooms) as a
clean geometric model and extrudes it into a navigable, editable 3D scene. The user
sets a real-world scale once, and everything downstream is in meters.

The product bet is that **auto-tracing accuracy is the core value**: a first-time user
should be able to drop in a real plan and get a mostly-correct suggestion that is fixable
in a handful of clicks. That goal is partially met on clean plans and **not yet met on
arbitrary real-world plans** — see §7 for the honest state.

---

## 2. Architecture and guiding principles

**Single source of truth: a normalized node-graph `Scene`.**
Nodes are 2D points (meters); walls reference two node ids plus thickness/height;
openings (doors/windows) are attached to a wall by a normalized span, not absolute
coordinates; rooms are ordered node-id loops. Editor/ephemeral state is deliberately kept
out of the `Scene` type. This makes the same model serve tracing, extraction, 3D build,
and export without translation layers.

**Geometry is deterministic; models never emit coordinates ("the iron rule").**
Every candidate wall/door/window is proposed by deterministic code (vector pairing,
raster CV, coverage profiles). Where a learned model (a vision-language model / VLM) is
used, it only *judges, selects, describes, and directs* — it classifies candidates and
resolves ambiguity, but geometry always comes from the deterministic pipeline. This keeps
output metrically exact and auditable, and prevents hallucinated dimensions.

**Scale-first.** Loading a plan hard-gates the UI into a calibration step; nothing is
traceable until a pixel-to-meter scale is set. Detection thresholds that were originally
hand-tuned in pixels are normalized against a reference scale so they hold across plans of
different resolutions.

---

## 3. The 2D → 3D geometry pipeline

Once structure exists as a `Scene`, extrusion is fully deterministic:

- **Openings are real gaps, not booleans/CSG.** Walls are split in wall-local space so a
  door or window becomes an actual break in the mesh (`buildWallSegments.ts`) — a door
  yields 3 pieces, a window 4. This avoids CSG cost and fragility.
- **Floors** are triangulated with `THREE.ShapeUtils`, so non-convex and L-shaped rooms
  render correctly.
- **Rooms via planar-face decomposition** (`findRooms`, half-edge traversal): neighbors
  sorted by angle, bounded faces kept by signed area, outer face and dangling spurs
  excluded. An interior wall correctly subdivides one space into two rooms. Validated on
  square/split/grid/L-shaped cases.
- **Coordinate convention** is consistent end-to-end: plan (x, y) in meters, renderer maps
  plan-y → world-z with Y up. The viewport auto-fits any scene from its bounds.

This half of the system is solid and well-tested; the hard problems are upstream, in
*understanding* the plan.

---

## 4. Plan understanding — three acquisition paths

### 4a. Guided manual tracing (the reliable path)
A 2D tracing canvas with magnetic snapping: vertex snap > edge snap (splits the wall and
re-homes any openings onto the correct sub-wall) > free point with a 90° ortho constraint
(toggle + per-click Shift override). Doors and windows are two-click line traces stored as
a scale-independent normalized span on their wall. Loop closure feeds directly into room
detection. This path is accurate by construction and is the fallback whenever
auto-detection is uncertain.

### 4b. Vector CAD extraction (clean PDFs)
For vector PDFs, geometry is already in the file, so extraction is deterministic with
**no ML**:
- Parse paths with PyMuPDF (server-side), preserving color, stroke width, and OCG layer.
- Walls are recovered as **pairs of parallel double lines** a wall-thickness apart →
  collapsed to centerline + thickness; text is dropped by length, furniture by color/layer.
- A planar graph noded at T/cross intersections closes rooms.
- **Openings by geometry** (`detectOpenings`): a 1-D coverage-count profile is walked along
  each wall run — count 2 = solid wall, 0 = a gap = **door**, 3–4 cramped lines = **window**.
  Door swing arcs are used as independent evidence (radius from chord, leaf detection).
  Stairs (regular parallel treads) and dimension lines (isolated, touching no wall) are
  rejected explicitly.
- **Interactive thickness calibration** ("manual training"): clicking a real wall reads its
  face-gap and filters candidates to that thickness band. This was the practical answer to
  the fact that no single global threshold separates walls from dimension lines, tile grids,
  and stairs when they are all thin black parallels.
- **Hybrid centerline snapping**: because full auto-detection has an accuracy ceiling on
  messy plans, the human can identify a wall by clicking near it and the computer snaps to
  the exact centerline/corner. The person supplies semantics; the machine supplies precision.

Measured behavior on clean CAD renders: after the accuracy fixes, wall coverage went from
~5% (early bug) to ~94%, and on well-behaved plans wall/door/window recovery is essentially
complete. Residual false positives (furniture, niches) are rejectable per-element.

### 4c. Raster / image extraction (scans, screenshots, JPEGs)
For images there is no vector data, so a classical-CV proposer runs (`propose_raster.py`):
darkness map → Otsu/adaptive binarization → stroke-width statistics via distance transform +
skeleton → morphological wall mask → letter-blob rejection → skeletonization → junction
splitting and spur pruning → polyline centerlines with thickness. A TS layer
(`rasterCandidates.ts`) ortho-snaps, merges collinear runs, and proposes door candidates
three ways: collinear **gaps**, **swing-arc chains** (arc + leaf geometry, for doorways with
no gap), and **corner** doorways. "Bridge" walls span each gap so the accepted graph stays
continuous across doors.

Honest coverage numbers (generator recall against hand-traced ground truth):

| Plan | Walls | Doors | Windows |
|---|---|---|---|
| 20×45 (render) | 18/18 | 6/7 | 9/9 |
| 15×30 | 10/10 | 3/3 | — |
| 30×50 | 19/19 | 5/5 | 9/9 |
| 1350 sq ft (real scan) | 57/57 | 14/16 | 9/16 |
| Matterport (2-floor scan) | 60/72 | 10/21 | 10/33 |

Wall recall is strong, even on real scans. Doors are decent after arc-door work. **Windows
and cluttered real-world scans (Matterport) remain the weak spots**, and some door types
(solid-panel garage doors drawn with no gap) are structurally invisible to a
geometry-only proposer.

### 4d. VLM-assisted semantic classification
The deterministic proposers are deliberately tuned for **high recall** — they over-generate
candidates. A Claude VLM then labels each candidate into 7 classes with a confidence, seeing
one composite image (plan render + numbered overlay). Structured/JSON-schema output enforces
the iron rule: labels only, never coordinates. Dense plans are compressed (union-find
collapse of parallel stacks) before the call to control token cost.

Measured effect: on plans where furniture is drawn in black (no color separation), the VLM
substantially raised wall precision (e.g. one plan 13%→54% precision at 89% recall; another
40%→92%) by rejecting furniture and rescuing real walls the heuristic dropped. On a real
scan, length-based wall F1 improved from ~64 to ~74 while *cutting* candidate count. So the
VLM clearly adds value on wall classification. **Door and window classification remain weak
on both the heuristic and VLM sides**, largely because half those misses are generator
recall (no candidate to label), not classification.

---

## 5. Evaluation methodology (why the numbers above are trustworthy)

- **Ground truth** is hand-traced per plan and exported to a stable schema (`.gt.json`).
- A repeatable eval harness (`scripts/eval/`: gen-candidates → coverage → classify → score →
  ab) runs the whole pipeline headless. **Coverage runs first and is free** — VLM spend is
  gated behind an explicit cost check every time (the project runs on a small, deliberately
  managed API budget).
- Metrics were corrected for honesty as flaws surfaced: element-based F1 was replaced by
  **length-based precision/recall** for walls (long unbroken raster centerlines were being
  under-credited), and the headline product metric is **correction effort** — how many
  add/move/reject/redraw actions separate the auto result from ground truth — with recall
  weighted over precision (a rejectable false wall is cheap; a missing wall is expensive).
- Visual diagnostics (PIL overlays: red walls / green doors / cyan windows over the plan)
  are used to *look* at failures rather than trust aggregate numbers.

---

## 6. What is genuinely solid

- The node-graph schema and the deterministic 2D→3D extrusion (real opening gaps,
  non-convex floors, planar-face room detection) — well-tested and reliable.
- Vector-CAD wall/opening extraction on clean plans, with interactive calibration and
  centerline snapping as a dependable assisted path.
- Raster **wall** recall, including on real scans.
- A disciplined architecture: deterministic geometry, VLM-as-judge-only, scale
  normalization, and a free-first evaluation loop that prevents flying blind.

## 7. What is not solved (the honest part)

- **Auto-trace on arbitrary real plans is not there yet.** The most important test —
  the user's own real floor plan through Import → Extract → AI-classify — was a complete
  failure. That plan is the current north star and the reason the next phase exists.
- **Openings lag walls.** Window recall on real scans (~9/16) and cluttered scans
  (10/33) is poor; some door archetypes (solid-panel/garage) have no geometric signal at all.
- **No single global setting separates walls from dimension lines, tile grids, and stairs**
  when all are thin black parallels — hence the reliance on calibration and human-in-the-loop
  snapping rather than pure automation.
- **VLM classification is imperfect and steerable both ways.** It anchors on candidate
  shape and relabels reluctantly; an optional plan-description hint helps doors/stairs but
  suppressed windows, and prompt iteration hit diminishing returns.

## 8. Where it goes next

The open problem is framed as a diagnosis-first effort: split each failure into
**generator recall** (no candidate existed), **classification** (candidate labeled wrong),
or **systemic** (wrong scale / an unseen plan style — colored fills, hand-drawn, photographed
at an angle), then choose one direction. Candidate directions under consideration:
agentic crop-and-zoom VLM tours (so thin detail isn't lost in one blind overview call),
CV+VLM disagreement-driven refinement, one-click correction loops that re-tune extraction
from the user's first few fixes, a plan-style router, a pretrained wall-segmentation spike
(pending a licensing check), and synthetic self-training that renders plans from the app's
own 3D scene schema to generate unlimited ground-truth pairs.

---

*Summary reflects the project state as of early July 2026. Accuracy figures are from the
headless eval harness against hand-traced ground truth and are reported as generator
recall or length-based P/R/F1 as noted.*
