# Protected Paths

Everything listed here is the working 3D viewer/renderer or the scene-schema
types it directly consumes. Per `CLAUDE.md` rule 1, this code must not be
modified, refactored, "improved," or have its imports/types changed as part
of the extraction rebuild. Integration with the new pipeline happens only
through a new adapter module (new files) behind a feature flag. If a task
appears to require editing anything below, stop and ask Dan.

Compiled from a full-repo Explore pass on 2026-07-19 (see the Phase 0 gate
report for methodology). Nothing here is marked UNCERTAIN — every file's
imports were traced and confirmed to be 3D-viewer-only with no legacy
extraction dependencies.

## React Three Fiber viewer

- `src/viewport3d/Viewport.tsx` — Canvas root: camera, controls, postprocessing, env/time-of-day wiring.
- `src/viewport3d/WallMesh.tsx`, `FloorMesh.tsx`, `FurnitureLayer.tsx` — mesh builders consuming `Scene`.
- `src/viewport3d/collision.ts`, `snap.ts`, `textures.ts`, `viewportCapture.ts` — 3D-editing support (collision, plan-space snapping, procedural textures, screenshot capture).
- `src/viewport3d/geometry/` — `buildJoinery.ts`, `buildWallSegments.ts`, `triangulateFloor.ts`, `wallGeometry.ts`, `wallJunctions.ts` + their `.test.ts` files. Pure geometry turning `Wall`/`Opening`/`Node` into THREE-consumable segments/junctions/joinery.
- `src/viewport3d/environment/` — `City.tsx`, `Environment3d.tsx`, `Rain.tsx`, `Suburb.tsx`. Presentation environment around the model.
- `src/viewport3d/walkthrough/` — `WalkthroughMode.tsx`, `collision.ts`, `config.ts`, `doors.ts`, `furnitureCollision.ts`, `spawn.ts`. First-person camera mode.

## Scene schema (consumed directly by the viewer)

- `src/schema/scene.ts` — canonical `Scene`/`Node`/`Wall`/`Opening`/`Room`/`FurnitureItem` types, including the Building Knowledge Layer fields (`RoomSemantics`, `BuildingSemantics`, `Evidence`, `FactSource`). Kept as one protected unit — the BKL fields are populated by the ongoing `src/lib/rooms/` feature (shared, not legacy), not by the old extraction pipeline, so the file is not split.
- `src/schema/constants.ts` — geometry constants (`WALL_HEIGHT`, `RAIL_HEIGHT`, `DEFAULT_THICKNESS`, `DEFAULT_DOOR`/`DEFAULT_WINDOW`).
- `src/schema/sampleScene.ts` — default/sample `Scene` fixture used as store initial state.

## Notes for the new pipeline's adapter

- The only sanctioned integration point is a new `extraction/adapter/` module (Python side) plus new, additive TS glue that maps the new pipeline's schema-v1 JSON output into a `Scene` — modeled on the existing `legacy/src/trace2d/traceToScene.ts` and `src/dev/gtToScene.ts` conversion pattern, but as new files, not edits to the above.
- `src/store/useSceneStore.ts` is **not** in this list — it's app state (shared), not 3D-viewer code, even though the viewer reads from it. See `docs/LEGACY_PATHS.md` for how its legacy-coupled slices are being untangled.

## Approved exceptions

Changes to files above that Dan signed off on before they were made. Anything
not listed here still falls under CLAUDE.md rule 1 — stop and ask.

- **2026-09-04, `src/viewport3d/WallMesh.tsx` — the selected-opening badge
  renders a display name instead of the raw enum** (branch `fix/ui-sweep`).
  Approved by Dan before the edit.

  `:1015-1016` printed `{opening.type}`, and `dimLabelStyle` sets no
  `textTransform`, so the badge floating over a selected opening in the 3D view
  read literally **`door · 0.90 m`** — lowercase, and it said "door" even when
  the renderer directly above it was drawing a glazed patio slider. That second
  half is the part that mattered to Dan: `effectiveSlide()` gives any opening at
  or past `PATIO_MIN_WIDTH` two sliding glazed panels as a *derived* default,
  nothing is written to the scene to record it, and the badge was the one place
  the app asserted a contradiction with what was on screen.

  One import and one expression: `openingDisplayName(opening)` from
  `src/render/doorStyle.ts`, which is unprotected and already the home for
  `effectiveSlide`/`isGlazedDoor`/`isDoubleDoor` — so the inspector title and
  this badge cannot drift apart, which is how the raw-enum fallthrough survived
  in the first place. No other change to the file.

- **2026-09-04, `src/viewport3d/Viewport.tsx` — emoji swapped for the icon set,
  and its three panel anchors made direction-agnostic** (branch `fix/ui-sweep`,
  the RTL half lands with the Hebrew work). Approved by Dan before the edits, as
  part of "remove all emojis from the app" and "I want Hebrew support for the
  whole site".

  Two unrelated reasons this file could not be skipped. It holds 5 of the app's
  25 emoji — `WEATHERS[].label` at `:146` bakes 🌧 **into the label string**
  (`"🌧 Rain"`), `:168` picks `"☀️"`/`"🌙"` by hour, and `:176` prefixes the
  walkthrough button with 🚶 — so the emoji cannot leave without splitting label
  from icon, which is a change to this file by construction. And `:170`, `:243`,
  `:287` pin overlay panels with a physical `left: 14`, which puts them on the
  wrong edge under `dir="rtl"`.

  Presentation only, and deliberately narrow: label/icon split plus
  `left` → `insetInlineStart`. No change to the Canvas, the camera, the controls,
  postprocessing, env wiring, or any prop signature. Note `CameraDoubleClickRig.tsx:45`'s
  `(e.clientX - rect.left)/rect.width` is **not** in scope and must not be
  "fixed" — it is NDC conversion for a raycast, not layout, and is already
  correct in both directions.

- **2026-09-04, `src/viewport3d/FurnitureLayer.tsx` — `normalize()` clones with
  `SkeletonUtils.clone` instead of `Object3D.clone(true)`.** Approved by Dan
  before the edit. Fixes the "phantom oven" in the marketing hero.

  `Object3D.clone(true)` copies a `SkinnedMesh` but not its `Skeleton`, so every
  copy stayed bound to the ORIGINAL bones — which live inside drei's `useGLTF`
  cache, are never added to any scene, and therefore sit at the world origin for
  the life of the tab. The GPU skins by those bones, so a skinned item drew in
  the middle of the model no matter where it was placed, while its `matrixWorld`,
  its `Box3`, and `Mesh.raycast` all correctly reported the placed position.

  That split is the whole reason it read as a phantom rather than a misplaced
  item: it could not be selected, and every measurement said there was no
  geometry where it was visibly drawn. Two hours of the previous session were
  spent on the resulting false negatives, so it is worth stating plainly —
  **a bounding box or a raycast is not evidence about where a skinned mesh is
  drawn.** (The second false negative, unrelated to skinning: a raycast from the
  orbit camera hits the near cutaway wall first, because cutaway fades walls in
  the shader rather than removing the geometry.)

  Exactly one catalog model is skinned today — the BlenderKit Electric Stove,
  `76e31f48-a0f7-4854-868a-c2f692b68f67`, 1 of 465 GLBs (75 BlenderKit + 390
  IKEA, all scanned for `skins`) — which is why this reached production
  unnoticed. It is a latent trap for any skinned model added later, so the fix
  is unconditional rather than special-cased: on an unskinned model
  `SkeletonUtils.clone` is an ordinary deep clone.

  `src/render/perf/PerfFurnishRig.tsx`'s `normalizeForPerf` is a deliberate copy
  of this function (see its doc comment) and carried the same bug; it was fixed
  in the same change to keep the two in step.

- **2026-09-03, `src/viewport3d/WallMesh.tsx` — the two cutaway fades now set
  `needsUpdate` when they flip `transparent`.** Approved by Dan before the edit.
  Fixes a regression shipped by the 2026-09-02 WallMesh entry below.

  That change stopped building wall, baseboard and joinery materials
  `transparent: true` and started flipping the flag from the live opacity
  instead. `transparent` is not a runtime-only flag: three folds it into the
  program as the `opaque` parameter (`WebGLPrograms.getParameters`, and
  `_programLayers.enable(17)` in the cache key), and `#define OPAQUE` makes
  `opaque_fragment.glsl` execute `diffuseColor.a = 1.0`. A material born
  `transparent: false` therefore compiles a shader that FORCES alpha to 1, and
  flipping the flag later moves the mesh into the blend pass while leaving that
  shader in place — so the fade ran, the opacity really did fall to 0.13, and
  the wall still drew fully solid. Cutaway looked like it did nothing.

  Both loops now compare before assigning and set `m.needsUpdate = true` only
  on the transition, which is twice per fade rather than sixty times a second —
  a per-frame recompile of every wall shader would cost far more than the render
  pass the original change was buying back. Glass was never affected: it is
  created `transparent: true`, so its program never had the define.

  Caught in production by Dan, not by the /calibration check in the entry below
  — that harness compares two still renders, and both stills were of a wall that
  had already finished fading, so the pixels matched while the transition
  between them was broken.

- **2026-09-02, `src/viewport3d/walkthrough/doors.ts` and
  `WalkthroughMode.tsx` — the walkthrough now asks `effectiveSlide()` what kind
  of door it is looking at instead of reading the raw `slide` field, and hands
  back any slide spec it had to materialise.** Approved by Dan before the edit.

  The bug: a patio slider is a DERIVED default. `effectiveSlide()`
  (`src/render/doorStyle.ts`) gives any door at or past `PATIO_MIN_WIDTH` two
  glazed sliding panels, and nothing is written to the scene to record that —
  which is the whole point, so narrowing the door returns it to a swing leaf.
  Both files branched on the raw `opening.slide` field instead, so exactly those
  doors were classified as hinged and `applyOpeningValue` wrote `swingDeg` into
  them. `swingDeg` is one of the three fields `hasAuthoredDoorStyle()` reads as
  "the user chose this by hand", so a single approach demoted a patio door to a
  single hinged leaf permanently, and cost it its window-frame finish
  (`isGlazedDoor` goes false with it). Not cosmetic: the writes go through the
  store's gesture path, so they were committed, autosaved to IndexedDB and
  mirrored into the shared doc like any other edit.

  Two changes. Every door-TYPE question in these files now routes through
  `effectiveSlide()` — `isDoorClosed`, `currentOpeningValue`, `targetOpenValue`,
  `applyOpeningValue`, `dampOpeningValue`'s settle epsilon, the anchor branch,
  the closed-collider branch and `doorGeometryKey`. And because animating a
  derived door still has to put its position SOMEWHERE (the renderer reads the
  stored field), `WalkthroughMode` records which doors it borrowed in a local
  `derivedDoorsRef` and strips `slide`/`swingDeg` back off them when they settle
  shut, or on unmount if the player leaves with one open. The keys are deleted
  rather than set to `undefined`, so nothing travels through the Yjs diff or the
  IndexedDB clone that the scene never had.

  The same root cause fixed one layer down: `buildClosedDoorColliders` was
  building a derived patio door's collider from `{...opening, swingDeg: 0}`, so
  the player collided with one swing leaf instead of two sliding panels.

  New logic that could live outside these files does —
  `hasDerivedSlide`/`withoutAuthoredDoorStyle` are in `src/render/doorStyle.ts`,
  which is not protected. No refactors, no import churn, nothing else in either
  file. Covered by a new headless regression test,
  `src/viewport3d/walkthrough/derivedPatioDoor.test.ts`, confirmed to fail
  against the old branch and pass against the new.

- **2026-09-02, `src/viewport3d/WallMesh.tsx` — wall, baseboard and joinery
  materials now set `transparent` from their opacity instead of leaving it
  permanently `true`.** Approved by Dan AFTER the edit, not before: this rule
  reached the session mid-task, once the change was already in the working
  tree. Flagged rather than committed quietly; noted here so the exception
  list stays a true record of how each one happened.

  The bug: a furniture ghost or selection ring drawn against a wall was cut off
  along the wall's face. Wall materials were built `transparent: true, opacity:
  1`, which parks a solid wall in three's TRANSPARENT render list — sorted
  back-to-front by object distance, drawn after everything opaque. Ghosts and
  rings draw with `depthWrite: false`, so they leave no depth behind them, and
  any wall whose centre is nearer the camera than the ghost's therefore sorts
  last and paints over it. `OpeningPick`'s cutaway loop was worse: it set
  `m.transparent = true` unconditionally and never set it back, so every frame,
  leaf and mullion stayed in the blend pass permanently after the first
  cutaway.

  Both fade loops now also land exactly on their target instead of stopping
  within 1e-3 of it — `damp` only approaches 1 asymptotically, and a wall
  parked at 0.999 never becomes opaque again.

  Behaviour-neutral for the walls themselves: `transparent: true` at opacity 1
  is NormalBlending with src alpha 1, which is what opaque already draws.
  Verified on `/calibration` in both `full` and `cutaway` — renders before and
  after differ on 0.03%/0.05% of channels at mean delta 0.01 (antialiasing on
  edges), and the cutaway fade still fades.

- **2026-08-31, `src/viewport3d/Viewport.tsx` — added the `chrome?: boolean`
  prop** (branch `feat/landing-page`). The marketing hero needs the real
  renderer with Viewport's own panels suppressed, so it can present a curated,
  brand-styled subset of controls instead of the app's full panel set;
  `ScenePanel` and `WallModeToggle` are the only chrome in this file that
  renders unconditionally, so they are the only two the flag gates. Additive
  and default-`true`: every existing call site keeps today's behaviour, and no
  app-facing behaviour changed. See `docs/LANDING.md`.
- **2026-08-31, `src/viewport3d/Viewport.tsx` — `chrome={false}` now also hides
  the CAD grid** (same branch, same approval). `showGrid` previously read
  `envPreset === "none" || appMode !== "view"`, which is exactly the state a
  presentation embed sits in, so the marketing hero rendered the editing grid.
  Widening the existing flag rather than adding a second one, per the note on
  the prop: the grid is described in that file as "an editing aid", which is
  what this flag means. Default `true` keeps the app unchanged.
- **2026-09-01, `src/viewport3d/Viewport.tsx` — added the `autoOrbit?: boolean`
  prop** (branch `feat/landing-hero-showcase`). Approved by Dan before the edit.
  The marketing hero must not compete with the page for the pointer:
  `CameraControls` binds the wheel on the canvas, so a hero that owns the camera
  owns the page's scroll — the visitor scrolls, the model dollies, the page
  stays put. The middle button collides the same way (TRUCK in `CameraRig`,
  autoscroll in the browser). With the flag on, the camera is taken away
  entirely and `<AutoOrbitRig>` moves it instead.

  Deliberately a SECOND flag rather than widening `chrome`: they are separate
  axes, and a chrome-less embed that still wants a camera the visitor can drive
  has to stay expressible. It gates three things, all required — `enabled` on
  `CameraControls`, and mounting `<CameraRig>` (which writes the mouse/touch map
  in an effect, so neutralising it from outside would be undone) and
  `<CameraKeyboardRig>` (which binds keydown on WINDOW, so on a marketing page
  it would eat WASD/QE/T/F/Home for the whole document). Additive and
  default-`false`; every existing call site is unchanged. The asymmetry it rests
  on is that camera-controls' `update()` does not read `_enabled` — only its DOM
  handlers do — so programmatic camera moves survive disabling user input.
- **2026-09-01, `src/viewport3d/environment/Environment3d.tsx` — added the
  `groundShadow?: boolean` prop** (branch `feat/landing-hero-showcase`, passed
  from `Viewport` as `groundShadow={!autoOrbit}`). Approved by Dan before the
  edit. `groundFade` makes the studio disc effectively infinite, which removes
  the horizon but leaves the room's own cast shadow lying across it as a large,
  hard-edged dark slab — on a marketing page the most prominent object after the
  model, and it reads as an artefact rather than as light. With this off the
  room floats on the background instead.

  It is the DISC that stops receiving (`receiveShadow={groundShadow}`), not the
  lights that stop casting, so everything inside the room still shades and
  self-shadows exactly as before. Additive and default-`true`; every existing
  caller renders what it rendered before.
- **2026-08-31, `src/viewport3d/environment/Environment3d.tsx` — added the
  `groundFade?: boolean` prop** (same branch, same approval; passed down from
  `Viewport` as `groundFade={!chrome}`). The studio preset's shadow-catcher
  disc is sized `max(span * 3, 30)`, so its rim draws a hard horizon line
  across a presentation embed. With the flag on it becomes `max(span * 60,
  600)` — past the fog's `span * 11` far plane — so the ground dissolves into
  the background instead of ending. Deliberately not "hide the ground":
  deleting the disc would take the model's contact shadow with it. Additive and
  default-off; every existing caller is unchanged.
