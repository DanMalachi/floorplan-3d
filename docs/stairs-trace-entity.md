# Stairs as a traced entity — design + Tier 1 plan

Status: design agreed 2026-07-31 (revised same day after the UI pass — the
gesture question changed the schema). Tier 1 = "trace a stair, see a stair."
Sits in Phase 5 (trace experience) as a new milestone alongside T1/T2.

Context: no second floor is modeled and none is planned. Every decision below
follows from that, not from a general stair feature.

---

## The four resolutions

### 1. What the stair terminates at

**A user-set `rise`, topped by a landing stub.** All three candidates were
answers to different questions, so all three hold:

- `rise` (meters, user-set, default `WALL_HEIGHT`) is the schema. It is the
  **total** climb of the whole staircase, not per flight.
- A **landing stub** — a slab whose top sits at `rise`, `LANDING_DEPTH` deep,
  hanging past the last tread — is the geometry. It reads as "the floor above
  starts here", which is the honest statement. A run that just stops in midair
  reads as a bug.
- **One staircase, one or more straight flights** is the scope.

`rise` must be user-set rather than pinned to `WALL_HEIGHT`, because in a
single-storey design tool the stairs you actually trace are often not
storey-height: steps up to a raised terrace, a sunken lounge, a split level, an
entry stoop. Pinning it to `WALL_HEIGHT` would serve only the case we've said
we're not modeling. Default stays `WALL_HEIGHT` because a stair traced off a
real plan usually does go to the (unmodeled) floor above.

**Up only in Tier 1** (`rise > 0`). The asymmetry is real and is what draws the
scope line: a stair going *up* through the ceiling plane has a first-class
escape already in the UI — the **Ceilings toggle** — so a full-storey stair
clashing with `Ceilings` is a documented artifact with a one-click workaround.
A stair going *down* needs a hole in the floor slab, and `FloorMesh.tsx` is a
protected file with no such toggle. Down-stairs and stairwell voids are a later
tier that needs an explicit protected-path decision.

Winders (wedge treads through a turn) and spiral stairs are out entirely — both
need tread geometry that isn't a straight extrusion.

### 2. The trace gesture

**A chain, like a wall, plus one click for width.** Not a polygon.

The polygon was tempting because the outline is what your eye sees on the plan,
but it fails twice: it under-specifies the one thing the geometry needs (*which
end is the bottom*), so it needs a second gesture anyway; and it over-promises
shapes the builder cannot make (winders, curves). Four-plus clicks to say less
than three clicks say.

```
① click the foot of the run     centerline — easy to eyeball, and a few cm of
                                lateral error just shifts the stair a few cm
② click the head of the run     ortho + Shift-invert, exactly like a wall
                                → previews at the last-used width
③ click on either long edge     width = 2 × perpendicular distance
                                → the envelope snaps onto the plan's parallel lines
   … keep clicking to add flights (see below) …
   Esc / Finish                 commits the staircase
```

The demanding click is ③, and it lands on a line that is **inked on the plan**.
Clicks ① and ② are on an imaginary axis, which is fine — lateral error there is
invisible. Click ③ is projected onto the run's perpendicular, so it is forgiving
along the axis and only needs to be accurate across it. Either side works.

Click ③ is optional: Esc/Finish straight after ② accepts the pending width.

**Sticky width.** The committed width becomes the pending width for the next
stair, exactly as `drawThickness`/`drawHeight` already persist between walls.

**Deliberate differences from the wall gesture:**

1. **Not in the wall graph.** Stairs are their own draft array, never
   `TraceSegment`s. If they were segments, `analyzeLoops` would read them as
   room boundaries and poison room detection.
2. **No vertex/edge magnets, no PDF centerline snap.** The wall tool snaps to
   points and *splits* walls; a stair must split nothing, and a stair axis is
   not a wall centerline. Ortho only.
3. **Free coordinates, not node ids.** Dragging a wall point must never drag a
   stair.
4. **Run is measured; rise is set.** Run comes from the clicks ×
   `metersPerPixel`. `rise` is a panel field.

**Step count is derived, not typed.** From `rise` and a comfortable target
riser (`COMFORT_RISER`), rounded to an integer; then `riser` and `going` are
shown back in the panel, with buildability warnings
(`riser ≤ 0.19`, `going ≥ 0.25`, `0.60 ≤ 2·riser + going ≤ 0.66`, `width ≥ 0.8`).
Advisory only — warn, never block.

The override (`steps?`) earns its place as the **primary accuracy check**, not
as a nerd knob: the canvas draws the derived tread ladder, the plan has tread
lines printed on it, so you nudge the count until the two line up and the model
now matches the drawing. Absent = derived, same contract as `Wall.height`.

**Rail placement:** a new step in the guided rail, between Openings and Build:

```
① Plan  ② Scale  ③ Walls  ④ Openings  ⑤ Stairs  ⑥ Build
```

Not a fourth chip inside the Walls step's Wall/Rail/Open row: those three are
*kinds of one thing* sharing thickness/height, and a stair's parameter set
would make that row incoherent. The step is optional and must not gate Build —
`canGenerate` stays walls+scale.

#### Flat breaks: you don't draw the landing — the gap *is* the landing

```
   flight 1              landing              flight 2
①━━━━━━━━━━━▶②      (you draw nothing)      ③━━━━━━━━━━━▶④
```

After a flight, keep clicking. The next click is where the treads start again
on the plan — past the flat bit. **The space you skipped becomes the landing.**
No mode switch, no landing tool, no extra schema field.

This matches the drawing: on a plan a landing is drawn as *the region with no
tread lines in it*, so "trace the treads, skip the flat part" is what your eye
is already doing.

| shape | what you draw | landing derived from |
|---|---|---|
| straight + mid landing | two collinear flights with a gap | the gap |
| L / quarter-turn | two perpendicular flights | the corner |
| U / half-turn | two antiparallel flights side by side | the crossover |

One formula covers all three: the landing footprint is the **convex hull of the
end cross-section of flight A and the start cross-section of flight B** — four
points, one quad. Oblique angles fall out for free.

Width is set once, on the first flight, and inherited by the rest — true of
real staircases, and it makes flight 2 onward two clicks each.

**One `rise` for the whole staircase.** This is the load-bearing consequence.
Tracing an L-stair as two independent stairs would make you split 2.4 m into
1.2 + 1.2 in your head, and any mismatch shows up as a visible step
discontinuity at the landing. Instead: total steps derive from total rise, get
distributed across flights by run length (largest-remainder, so they sum
exactly), and the riser is uniform everywhere by construction. No stair
arithmetic, ever.

### 3. Is "rail" already first-class?

**Yes — and the word is loaded three ways in this repo. Don't merge them.**

1. `Wall.kind === "rail"` / `SegmentKind "rail"` — a balcony/balustrade barrier.
   Already first-class in the protected schema (`RAIL_HEIGHT = 1.1`), already
   drives semantics (`RoomFeatures.railWallCount`) and ceilings (a rail edge
   means open to sky, so the room loses its ceiling).
2. `TraceRail.tsx` — the guided-trace **side panel**. Unrelated to railings.
   Named collision only; "add a rail to the stair" must not land here.
3. A stair **balustrade/handrail** — does not exist, and is not #1.

So: **no new rail entity, and do not reuse `Wall.kind:"rail"` for a stair's
handrail.** A wall-rail is a straight horizontal edge between two graph nodes;
a stair balustrade is a raked polyline that would have to inject fake nodes
into the loop analysis — the same failure mode as putting the stair in
`segments`. When the balustrade arrives it is a **field on `Stair`**
(`rail?: "none" | "left" | "right" | "both"`), rendered by the stair's own mesh.

That field is **not added in Tier 1**, because Tier 1 doesn't render it and
unrendered schema fields rot. Same reasoning drops a `landing?` flag: landings
are derived, never authored. Every Tier 1 field is used and rendered.

### 4. Mesh generation — this tier or later?

**Split, but not at "placement-data-only".** Tier 1 renders the **stepped
solid** — one extruded sawtooth profile per flight, plus a slab per derived
landing. Nothing else.

Placement-data-only is the wrong cut: the trace tab would gain a tool that
produces nothing visible, Generate would silently drop it, and a wrong `rise`
would be indistinguishable from a right one — untestable. A featureless
placeholder box is worse than nothing, because an unreadable wedge in the
living room fails the trust bar the product is built on.

Full geometry is also the wrong cut: stringers (open vs closed), nosings, newel
posts, baluster spacing, soffit and stair materials are all styling decisions
that each multiply the review surface of a first pass.

Tier 2 (later, separate plan): balustrade, open stringer, nosings, materials,
walkthrough collision + climbing, 3D-mode selection/inspector, down-stairs and
the stairwell void.

---

## Schema

### `src/schema/scene.ts` (PROTECTED — additive only)

```ts
/** One straight flight within a staircase. Centerline, plan meters. */
export interface StairFlight {
  x0: number; y0: number; // foot (lower end)
  x1: number; y1: number; // head (upper end)
}

/**
 * A staircase: one or more straight flights climbing to a single total `rise`.
 *
 * NOT part of the wall graph. The endpoints are free coordinates rather than
 * node ids on purpose: a stair bounds no room, splits no wall and joins no
 * corner, so it must never reach `analyzeLoops` or the junction solver.
 *
 * Flights are stored in walking order and are deliberately NOT connected: the
 * GAP between consecutive flights is what a landing is, and its footprint is
 * derived (convex hull of the two facing cross-sections). That is why this is
 * a list of flights and not a polyline — the type encodes the rule.
 *
 * With no second floor modeled, the last flight terminates at a landing stub
 * whose top sits at `rise` — "the floor above starts here". `rise` is always
 * positive (up); descending stairs need a void in the floor slab, a later tier.
 */
export interface Stair {
  id: Id;
  flights: StairFlight[]; // >= 1, walking order, bottom first
  width: number;          // meters, perpendicular to the run; one width for the whole stair
  rise: number;           // meters, TOTAL climb, > 0
  // Absent = derived from `rise` and COMFORT_RISER (see src/lib/stairs).
  // Present = the user matched the tread count drawn on the plan.
  steps?: number;         // TOTAL across all flights
}
```

and on `Scene`:

```ts
  stairs?: Stair[]; // optional: every project saved before stairs existed has none
```

`stairs` is **optional and stays optional**. Making it required would not help:
projects already in IndexedDB and in live Yjs docs have no such key at runtime
regardless of the type. Consumers read `scene.stairs ?? []`.

`Scene.schemaVersion` stays `2`. `projectPersistence.SCHEMA_VERSION` stays `1`
— that check discards the entire project document on mismatch, so bumping it
would silently wipe every saved project.

### `src/schema/constants.ts` (PROTECTED — additive only)

```ts
// A stair's default climb is a full storey (the common case when tracing a
// plan whose upper floor isn't modeled); the panel can lower it for terraces,
// split levels and sunken rooms.
export const DEFAULT_STAIR = { width: 0.9, rise: WALL_HEIGHT };
export const COMFORT_RISER = 0.175; // m — target riser; the step count derives from it
export const MIN_STAIR_STEPS = 2;
export const LANDING_DEPTH = 0.9;   // m — top landing stub, past the last tread
export const LANDING_SLAB = 0.15;   // m — landing thickness (its TOP sits at its height)
```

### `legacy/src/trace2d/types.ts` (draft type)

```ts
/** A traced staircase. Mixed units on purpose, exactly like TraceOpening: the
 *  traced axis is in image-local pixels, the untraced dimensions are meters. */
export interface TraceStairFlight { x0: number; y0: number; x1: number; y1: number } // px
export interface TraceStair {
  id: string;
  flights: TraceStairFlight[];
  width: number;  // METERS, perpendicular to the run
  rise: number;   // METERS, total
  steps?: number; // absent = derived
}
```

---

## Protected-path footprint — approved by Dan 2026-07-31

Per CLAUDE.md rule 1. Three protected files, all strictly additive, no change
to any existing code path:

| File | Change |
|---|---|
| `src/schema/scene.ts` | `+ StairFlight`, `+ Stair`, `+ stairs?: Stair[]` on `Scene` |
| `src/schema/constants.ts` | `+ 5 stair constants` |
| `src/viewport3d/Viewport.tsx` | `+ 1 import`, `+ 1 line` mounting `<StairLayer>` |

`src/viewport3d/StairMesh.tsx` is a **new** file in a protected directory, not
an edit to a protected file — same standing as the sanctioned adapter pattern.
`src/store/useSceneStore.ts`, `src/collab/*` and `legacy/src/trace2d/*` are not
protected.

**Frozen contract, untouched:** `extraction/schema/extraction_v1.schema.json`
has no stair concept, so `exportGroundTruth.ts` / `buildGroundTruth` must NOT
learn about stairs. That would mutate a frozen contract (CLAUDE.md rule 5).

---

## Tier 1 implementation — stages

Conventions: one file group per stage. Each stage opens with a **DIAGNOSE**
block — read, confirm, report. **If any diagnosis fact differs from what's
written here, STOP and report instead of adapting.** Each stage ends at a
**STOP**: report what changed + the named evidence.
Commit prefix `Stairs:`. Tests are standalone `npx tsx <file>.test.ts` — this
repo has no test framework, and adding one is out of scope.

---

### Stage 1 — the contract

**DIAGNOSE.** Read `src/schema/scene.ts` and `src/schema/constants.ts`.
Confirm: `Scene.schemaVersion` is the literal `2`; `Scene` has exactly
`nodes | walls | openings | rooms | furniture | building?`; `constants.ts`
exports `WALL_HEIGHT = 2.4`. Report all three.

**DO.** Add `StairFlight`, `Stair`, `stairs?: Stair[]` and the five constants,
verbatim from the Schema section above, comments included.

Do NOT bump `Scene.schemaVersion` — every persisted project and live Yjs doc
is version 2 and a bump orphans them.
Do NOT make `stairs` required — existing documents have no such key at runtime.
Do NOT touch anything else in either file.

**STOP.** Report: `npx tsc --noEmit` clean.

---

### Stage 2 — the maths

**DIAGNOSE.** Confirm `src/lib/stairs/` does not exist and nothing in `src/`
imports `stepCount`, `stairMetrics` or `stairLandings`.

**DO.** New file `src/lib/stairs/stairGeometry.ts`:

```ts
export function flightRun(f: StairFlight): number      // hypot, plan meters
export function totalRun(s: Stair): number
export function stepCount(s: Stair): number            // s.steps ?? round(rise/COMFORT_RISER), >= MIN_STAIR_STEPS

export interface FlightMetrics {
  run: number; steps: number; going: number;
  baseHeight: number;  // height of this flight's FOOT (0 for the first)
  topHeight: number;   // height of its head
  angleRad: number;    // pitch above horizontal
}
export interface StairMetrics {
  steps: number; riser: number; going: number; run: number; // totals / nominal
  flights: FlightMetrics[];
  warnings: string[];  // human-readable, advisory only
}
export function stairMetrics(s: Stair): StairMetrics

export interface StairLanding {
  poly: { x: number; y: number }[]; // convex hull, plan meters
  top: number;                      // height of the landing's TOP surface
}
export function stairLandings(s: Stair): StairLanding[] // between flights + the top stub
```

Step distribution: total steps split across flights **proportional to run
length by largest remainder**, each flight at least 1, sum exactly `steps`.
Riser is `rise / steps` and therefore uniform across the whole staircase — that
is the whole point of one `rise` per stair. `going` is per flight
(`run_i / steps_i`); the top-level `going` is the nominal `totalRun / steps`.

Landings: for consecutive flights, the convex hull of the head cross-section of
flight *i* and the foot cross-section of flight *i+1* (each cross-section being
the two points at ±`width/2` perpendicular to that flight's own direction), at
height = the top of flight *i*. For the last flight, the same construction
against a cross-section `LANDING_DEPTH` further along its own direction, at
height `rise`. A hull that degenerates below 3 points is skipped with a warning.

Warnings: `riser > 0.19`, `going < 0.25`, `2*riser + going` outside
`0.60..0.66`, `width < 0.8`, any `run <= 0`, `rise <= 0`, a landing gap > 3 m.

New file `src/lib/stairs/stairGeometry.test.ts`, headless, `npx tsx`, header
comment giving the run command (copy the style of
`src/viewport3d/geometry/joinery.test.ts`). Cover: a 2.4 m storey stair over a
4 m run derives a sane step count with no warnings; a 2.4 m rise over a 1.5 m
run warns on `going`; an explicit `steps` overrides the derivation; a
degenerate zero-length run warns and does not divide by zero; **the three
multi-flight shapes** (straight+gap, L, U) each produce one interior landing
whose hull has 4 points and whose `top` equals the first flight's `topHeight`;
step distribution sums exactly to the total across uneven flight lengths.

**STOP.** Report: test output, pass/fail per case.

---

### Stage 3 — the mesh (visible proof, before any authoring UI)

**DIAGNOSE.** Read `src/viewport3d/Viewport.tsx` around the recenter group
(`<group position={[-cx, 0, -cz]}>`). Confirm `<Floors scene={scene} />` takes
`scene` only while `<FurnitureLayer scene={scene} offset={offset} />` also
takes `offset`. Report why: `offset` exists for pointer-ray→plan conversion,
not placement — children of the recenter group are already in plan coords.
Read `src/viewport3d/WallMesh.tsx` and report the exact plan→world convention
(plan x→world x, plan y→world z) and how a wall's angle is derived.

**DO.** New file `src/viewport3d/StairMesh.tsx`, exporting
`StairLayer({ scene }: { scene: Scene })`.

Per **flight**, one `THREE.ExtrudeGeometry` of the sawtooth side profile, built
in flight-local (u = along run, v = world height so flights above the first sit
at their `baseHeight`):
`(0, baseHeight)` → for each step *i*: up to `(i*going, baseHeight+(i+1)*riser)`,
along to `((i+1)*going, baseHeight+(i+1)*riser)` → then `(run, 0)` → close at
`(0, 0)`. Closing to 0 rather than to `baseHeight` gives a closed-stringer
solid instead of a flight floating in midair.
Extrude depth = `width`, translated `-width/2` on the perpendicular so the
profile straddles the traced centerline.

Per **landing** from `stairLandings`, a slab: the hull polygon as a
`THREE.Shape`, extruded `LANDING_SLAB`, laid flat with its TOP face at
`landing.top`.

Rotate about world Y from each flight's own direction; take the convention from
`WallMesh.tsx`, don't re-derive it. `castShadow`/`receiveShadow` on, default
standard material.

Then mount in `Viewport.tsx` — one import, one line after
`<FurnitureLayer …/>`, inside the recenter group. Nothing else in that file.

Do NOT add stair picking, hover, selection or an inspector — that means real
edits to protected `Viewport.tsx` and is Tier 2.
Do NOT edit `sampleScene.ts` to test. Inject fixtures from the browser console.

**STOP.** Report: screenshots of a single flight along +X, the same along +Y
(the handedness check — if the second is rotated wrong, the plan→world
convention was re-derived instead of copied), and one each of the straight-gap,
L and U staircases. Note whether the flight clashes with a ceiling and that the
Ceilings toggle clears it.

---

### Stage 4 — the trace draft

**DIAGNOSE.** Read `src/store/useSceneStore.ts`: the `TraceMode` union, the
trace-draft slice, `snapshot()`, `deleteSelected`, `clearTrace`, `undo`. Read
`DURABLE_KEYS` in `src/store/projectPersistence.ts`. Confirm `points`,
`segments`, `openings` all appear in `DURABLE_KEYS` and in `TraceSnapshot`.
Report both lists.

**DO.**
- `legacy/src/trace2d/types.ts`: `+ TraceStairFlight`, `+ TraceStair`.
- `useSceneStore.ts`: `stairs: TraceStair[]`; `selectedStairId: string | null`;
  `TraceMode` gains `"stair"`; pending values `drawStairWidth`, `drawStairRise`
  (+ setters, defaults from `DEFAULT_STAIR`); the in-progress
  `stairDraft: { flights; foot; width } | null`; the click state machine
  `stairClick(x, y)`; `finishStair()`; `cancelStairDraft()`; `selectStair(id)`;
  and editors for the selected stair (`setStairWidth`, `setStairRise`,
  `setStairSteps(id, n | null)`).
- Wire `stairs` **and** `stairDraft` into `snapshot()`/`TraceSnapshot` (else
  undo resurrects or drops stairs), into `deleteSelected` (via
  `selectedStairId`), and into `clearTrace`.
- `projectPersistence.ts`: `"stairs"` into `DURABLE_KEYS`, beside `"openings"`.
  Do NOT touch `SCHEMA_VERSION` — a mismatch discards the whole saved document.

**STOP.** Report: `tsc --noEmit` clean; and from the console, that adding a
stair → refreshing the page → the stair is still in the store (the
`DURABLE_KEYS` proof).

---

### Stage 5 — the gesture

**DIAGNOSE.** Read `legacy/src/trace2d/TraceCanvas.tsx`: `handleStageClick`,
`resolveTarget`, the opening two-click flow (`openingStart` + preview), the
segment-rendering block, and the `keydown` handler (Esc → `finishChain`).
Report how ortho is applied and how Shift inverts it.

**DO.** Route `mode === "stair"` clicks into `stairClick`. State machine:

| draft state | click does |
|---|---|
| none | start: record the foot |
| foot set, no flights | close flight 1; await the width click |
| 1 flight, width not set | width = 2 × perpendicular distance to flight 1's axis |
| width set, no pending foot | record the foot of the next flight |
| width set, foot set | close that flight |

Esc / Finish commits via `finishStair()` (accepting the pending width if click
③ was skipped). Ortho + Shift-invert apply to the *head* click only, reusing
the existing ortho branch.

Render: placed stairs as centerline + width envelope + the derived tread ladder
(`stairMetrics`) + a foot marker or arrow — the up direction must be legible.
Derived landings drawn as filled quads, distinct from treads, so the flat break
is visible on the canvas. While a draft is open, preview the pending flight and
the landing that would fill the gap to the cursor. Click-to-select when
`mode === "stair"` → `selectStair`, drawn selected the way `selectedOpeningId`
is.

Do NOT route stair clicks through `resolveTarget` — it snaps to vertices and
splits walls, and a stair must split nothing.
Do NOT put stairs into `points`/`segments` — `analyzeLoops` would read them as
room boundaries.
Do NOT apply `wallSnap`/`snapWallPoint` — a stair axis is not a wall centerline.

**STOP.** Report: screenshots of a single flight and an L-stair being traced,
and confirmation that the room count in step ⑥ is unchanged by drawing a stair
across a room (the "not in the graph" proof).

---

### Stage 6 — the panel

**DIAGNOSE.** Read `legacy/src/trace2d/TraceRail.tsx`: the `steps: StepDef[]`
array, the auto-advance `useEffect`, `stepBody`'s switch, `DrawTools`, and how
`NumField` is used for Height/Thickness. Report the current step numbering and
every place a step number is hard-coded.

**DO.** Insert **⑤ Stairs**, push Build to **⑥**. `locked: !scaleSet`,
`done: stairs.length > 0`, status `"N placed"` / `"optional — steps & levels"`.
Body: a "✎ Stair" tool button setting `mode: "stair"`; `NumField` Width and
Rise (cm, same clamp/`displayScale` pattern as Height/Thickness); a Steps field
showing the resolved count with an **Auto** chip clearing the override back to
derived; and a live `stairMetrics` readout for the selected (or last placed)
stair — `flights · steps · riser · going · pitch` — with warnings in `T.warn`.

Warnings are advisory text. Do NOT disable Generate on them — a plan may
legitimately show a stair that fails a rule of thumb, and this is a tracing
tool before it is a code checker.
Do NOT add stairs to `canGenerate` — the step is optional and must not gate
Build.

**STOP.** Report: screenshot of the ⑤ panel with a real readout; confirm Build
is now ⑥ and every hard-coded step number found in DIAGNOSE was updated (list
them).

---

### Stage 7 — the bridge

**DIAGNOSE.** Read `legacy/src/trace2d/traceToScene.ts`. Report how
`metersPerPixel` is applied to nodes, and how `TraceOpening`'s px-vs-meters
mix is handled (the precedent `TraceStair` follows).

**DO.** `TraceToSceneInput` gains `stairs: TraceStair[]`. Emit `scene.stairs`:
every flight's `x0..y1` × `mpp`; `width`, `rise`, `steps` pass through
unchanged (already meters/count). Pass `stairs` at the `traceToScene(...)` call
site in `TraceRail.tsx`.

Do NOT touch `exportGroundTruth.ts` / `buildGroundTruth` — the extraction
schema is a frozen contract with no stair concept (CLAUDE.md rule 5).

**STOP.** Report: full loop — trace an L-stair, Generate, screenshot the 3D
result. Foot, landing and head must land where they were drawn on the plan.

---

### Stage 8 — collaboration + share

**DIAGNOSE.** Read `src/collab/sceneDoc.ts` (`COLLECTIONS`, `seedSceneDoc`,
`readScene`) and `src/collab/sceneDiff.ts`. Report the exact expressions
`scene[name]` and `(prev[coll] as unknown as Item[]).map`, and confirm both
would throw on a scene whose `stairs` is `undefined`.

**DO.** Add `"stairs"` to `COLLECTIONS` **and** the `?? []` guards in the same
commit — never `COLLECTIONS` first. Every project created before this feature
has `scene.stairs === undefined`, and un-guarded those two call sites crash
live collaboration on the next edit. Guard: `seedSceneDoc`'s loop, `sceneDiff`'s
two `.map` sites, and `readScene`.

Note `Stair.flights` is an array of objects, so it rides the existing
"complex field values stored as opaque JSON, edited as a unit" rule in
`sceneDoc.ts` — same as `room.loop`. No per-flight merging.

**STOP.** Report: `npx tsx src/collab/sceneDiff.test.ts` passing, plus one
added case — diffing a scene with no `stairs` key against one with a stair
produces the right ops and does not throw.

---

## Tier 1 known limitations (state them, don't fix them)

- A full-storey stair intersects the ceiling slab. Workaround: the existing
  Ceilings toggle. Real fix (a stairwell void) needs `FloorMesh.tsx`, protected.
- Stairs are authored in the trace tab only — not selectable or editable in
  Build mode. Editing means returning to trace and regenerating, which discards
  3D edits (pre-existing behavior for walls, not new).
- Walkthrough mode walks through a stair; it is neither an obstacle nor
  climbable.
- No balustrade, no stringers, no nosings, no stair materials.
- Straight flights only — no winders, no spiral, no descending stairs.
