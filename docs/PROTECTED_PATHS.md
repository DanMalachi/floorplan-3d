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
