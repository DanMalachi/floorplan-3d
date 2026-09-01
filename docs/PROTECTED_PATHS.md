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
- **2026-08-31, `src/viewport3d/environment/Environment3d.tsx` — added the
  `groundFade?: boolean` prop** (same branch, same approval; passed down from
  `Viewport` as `groundFade={!chrome}`). The studio preset's shadow-catcher
  disc is sized `max(span * 3, 30)`, so its rim draws a hard horizon line
  across a presentation embed. With the flag on it becomes `max(span * 60,
  600)` — past the fog's `span * 11` far plane — so the ground dissolves into
  the background instead of ending. Deliberately not "hide the ground":
  deleting the disc would take the model's contact shadow with it. Additive and
  default-off; every existing caller is unchanged.
