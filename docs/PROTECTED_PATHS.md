# Protected Paths

Everything listed here is the working 3D viewer/renderer or the scene-schema
types it directly consumes. Per `CLAUDE.md` rule 1, this code must not be
modified, refactored, "improved," or have its imports/types changed as part
of the extraction rebuild. Integration with the new pipeline happens only
through a new adapter module (new files) behind a feature flag. If a task
appears to require editing anything below, stop and ask Dan.

Compiled from a full-repo Explore pass on 2026-07-19 (see the Phase 0 gate
report for methodology), **refreshed by a second full pass on 2026-09-08**
covering every file added under `src/viewport3d/` since. Nothing here is
marked UNCERTAIN — every file's imports were traced and confirmed to be
3D-viewer-only with no legacy extraction dependencies (`grep -rn "from
['"].*legacy" src/viewport3d/` returns nothing).

> **RESOLVED 2026-09-08.** The gap flagged below (open since 2026-09-07) is
> closed: all 27 files that had landed under `src/viewport3d/` since the
> 2026-07-19 pass — `StairMesh.tsx`, `FixtureLayer.tsx`, `MeasureTool.tsx`,
> `SnapGridViz.tsx`, `autoOrbitPlayback.ts`, `fixtureTexture.ts`,
> `frameTarget.ts`, `pickObject3D.ts`, `dragPlane.ts` (+ its test), the six
> camera rigs, the whole `buildTools/` and `camera/` directories, and four more
> `walkthrough/` files — are now named below. `FixtureCatalog.tsx` and
> `StairInspector.tsx` were already covered by name in the Approved Exceptions
> section (added 2026-09-07); they're now also in the main list for
> completeness. None import from `legacy/` or anything Python-side; all are
> additive R3F viewer/tool code in the same shape as the files already listed.
> **This list is current as of `8af476f` (2026-09-08) — the next Explore pass
> is only needed after the next batch of new files, not on a schedule.**
>
> History, kept for context: this was found on 2026-09-07 the expensive way —
> the Hebrew job declared the editor fully translated while two panels inside
> this tree — the lighting picker and the stair inspector — were still
> entirely English, because the inventory had used this list as its boundary.
> Dan's call that day was to keep treating the whole tree as protected and to
> record the gap here rather than silently narrowing the rule.

## React Three Fiber viewer

- `src/viewport3d/Viewport.tsx` — Canvas root: camera, controls, postprocessing, env/time-of-day wiring.
- `src/viewport3d/WallMesh.tsx`, `FloorMesh.tsx`, `FurnitureLayer.tsx`, `StairMesh.tsx`, `FixtureLayer.tsx` — mesh builders consuming `Scene`.
- `src/viewport3d/FixtureCatalog.tsx`, `StairInspector.tsx` — inspector panels for fixtures and stairs (landed 2026-08-03/07-31; see the 2026-09-07 Approved Exceptions entry for the one change made to each since).
- `src/viewport3d/collision.ts`, `snap.ts`, `textures.ts`, `viewportCapture.ts`, `fixtureTexture.ts`, `dragPlane.ts` (+ `dragPlane.test.ts`), `pickObject3D.ts`, `frameTarget.ts` — 3D-editing support (collision, plan-space snapping, procedural textures, screenshot capture, the pointer→plan-point and pick→Object3D helpers shared by tools and camera rigs, camera framing).
- `src/viewport3d/geometry/` — `buildJoinery.ts`, `buildWallSegments.ts`, `triangulateFloor.ts`, `wallGeometry.ts`, `wallJunctions.ts` + their `.test.ts` files. Pure geometry turning `Wall`/`Opening`/`Node` into THREE-consumable segments/junctions/joinery.
- `src/viewport3d/environment/` — `City.tsx`, `Environment3d.tsx`, `Rain.tsx`, `Suburb.tsx`. Presentation environment around the model.
- `src/viewport3d/walkthrough/` — `WalkthroughMode.tsx`, `collision.ts`, `config.ts`, `doors.ts`, `furnitureCollision.ts`, `spawn.ts`, `stairGround.ts`. First-person camera mode. Plus `derivedPatioDoor.test.ts`, `doorSig.test.ts`, `stairGround.test.ts`.
- `src/viewport3d/AutoOrbitRig.tsx`, `CameraRig.tsx`, `CameraKeyboardRig.tsx`, `CameraDoubleClickRig.tsx`, `CameraFocusRig.tsx`, `CameraOfferRig.tsx`, `autoOrbitPlayback.ts` — camera behaviour: orbit/pan/dolly, WASD/keyboard channel, double-click-to-frame, room-click focus, the "offer, never seize" camera-suggestion chip, and the presentation auto-orbit toggle.
- `src/viewport3d/camera/` — `armedTarget.ts`, `inputVocabulary.ts`, `offerPolicy.ts`, `targetPlane.ts` + their `.test.ts` files. Pure rules behind the camera rigs above: which surface a tool is aiming at, whether the camera can see it, and the mouse/trackpad input map.
- `src/viewport3d/buildTools/` — `WallTool.tsx`, `OpeningTool.tsx`, `MeasureTool.tsx`, `SnapGridViz.tsx`, `gate.ts`, `planMath.ts`. New, additive Canvas children for the Plan Dock build tools (wall drawing, opening placement, measuring, snap-grid visualization) and their shared pointer-gating/plan-space math — deliberately new files rather than edits to the protected files they mirror (see `planMath.ts`'s own header comment).

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

- **2026-09-18, accessibility pass (`Viewport.tsx`, `CameraFocusRig.tsx`,
  `frameTarget.ts`, new `reducedMotion.ts`).** Approved directly by Dan ("yes
  to the 3D folder, go ahead with step 3"), branch `feat/a11y-launch`. DOM and
  camera-flight flags only; no scene, mesh, material or renderer change.
  - `Viewport.tsx` canvas wrapper: in the editor it is `role="application"`
    with a translated name and an sr-only key list (`aria-describedby`); the
    chrome-less embed (landing hero) is `role="img"` and no longer a Tab stop.
    Inline `outline: none` replaced by `outlineOffset: -3`, so the global
    `:focus-visible` ring shows on keyboard focus only, inside the edge.
  - `ScenePanel` time-of-day slider: `aria-label` + `aria-valuetext`.
  - `FitCamera`, `CameraFocusRig`, `frameBox`: the camera-controls
    `enableTransition` argument is `!prefersReducedMotion()` instead of `true`,
    so under the OS reduce-motion setting camera moves jump instead of fly.
    Default behaviour is unchanged.

- **2026-09-11, automatic editor camera input routing (`Viewport.tsx`,
  `CameraRig.tsx`, `camera/inputVocabulary.ts` + tests, an additive Space-pan
  arbitration helper, and a guard in `CameraDoubleClickRig.tsx`'s native
  dblclick handler).** Approved directly by Dan to add macOS mouse and
  cross-platform trackpad support, then revised from hands-on MacBook
  feedback. Scope is input routing only: Mouse preserves right-orbit/
  middle-pan/wheel-zoom (with automatic macOS natural-scroll compensation);
  Trackpad uses two-finger movement to orbit, pinch to zoom and Space+drag to
  pan. No dedicated settings UI, scene geometry, renderer contract, camera
  envelope, framing, or project persistence behavior changes.

  The same Space-pan guard also covers `LinearLightGhost.tsx` and
  `CeilingFixtureGhost.tsx`'s native click handlers. They were held back at
  first because the drawable-fixtures feature those two files belong to
  (`feat(lighting): add drawable fixtures`) had not shipped to `main`; it has
  since merged, and the guards landed on 2026-09-16 under this same approval
  (Dan: "ship the camera change"). The fixture ghosts are drag-and-click
  placers and would otherwise reopen the same "camera gesture also edits the
  scene" bug this fixes.

- **2026-09-10, `feat(lighting): add drawable fixtures` (`codex/lighting-prod`)
  — `FixtureLayer.tsx` rewritten, plus new `FixtureBody.tsx`,
  `CeilingFixtureGhost.tsx`, `LinearLightGhost.tsx`, `StripSelection.tsx`,
  and additive changes to `FixtureCatalog.tsx`.** Approved by Dan directly
  with OpenAI Codex (a separate coding tool Dan runs on its own branches
  alongside Claude Code — see `concurrent-codex-session` context); logged
  here retroactively on merge since Codex's own commit didn't add this
  entry. Adds a draw-a-ceiling-strip fixture (`FixtureItem.path`, additive
  and optional on `scene.ts`) alongside the existing point fixtures:
  `computeRoomLights()` now samples a strip's centerline into weighted
  segments and renders each as a `StripBeam` rectangular downlight instead
  of a single point light, everything else (room resolution, wall-fixture
  fallback, lux/color pipeline) unchanged. `placeFixture()`'s new `path`
  parameter is optional or backward compatible with every existing call
  site. No scope outside fixtures/lighting: no camera, wall, floor,
  furniture, config, or dependency changes.

- **2026-09-07 (second), `src/viewport3d/FixtureCatalog.tsx` and
  `src/viewport3d/StairInspector.tsx` — their hardcoded UI TEXT moves into the
  message catalogue.** Approved by Dan before the edits. Translation only: a
  `useTranslations` import, module-scope label tables swapping words for keys,
  and the render sites resolving them. No logic, no geometry, no imports beyond
  next-intl.

  **Neither file is named in the list above, and that is the point of the
  callout at the top of this file.** The list was compiled 2026-07-19;
  `StairInspector.tsx` landed 2026-07-31 and `FixtureCatalog.tsx` 2026-08-03. So
  they sat in the protected tree while being absent from the protected list, and
  the Hebrew inventory — which used the list as its boundary — never saw them.
  The lighting picker and the stair panel were still fully English after Step 5
  was declared done. Dan found the lighting one by looking at the running app.

  Dan's decision was deliberately the conservative one: treat the whole tree as
  protected, grant this exception explicitly, and write the staleness down —
  rather than concluding "not on the list, therefore fair game", which would
  have widened rule 1 by interpretation instead of by a decision.

  `FixtureCatalog.tsx` also switches from the catalogue's `name` to its new
  `nameKey` (`src/fixtures/catalog.ts`); `name` stays as the English fallback.
  `StairInspector.tsx`'s advisory warnings are built in
  `src/lib/stairs/stairGeometry.ts`, which is NOT protected and now returns
  `{ key, params }` for the render site to resolve — a pure geometry module must
  not render words.

- **2026-09-07, `src/viewport3d/Viewport.tsx` — `StatusOverlay`'s `bottom`
  moves from 14 to 250.** Approved by Dan before the edit. A third, separate
  ask from the two 2026-09-06 entries below: neither of those covered
  POSITIONING, and this is not a rename and not a string move — it changes
  where a box lands.

  Why: the pill renders only in `build` and `furnish`, and those are exactly
  the two modes where a 208×224 Plan Dock panel is pinned to the same corner
  (`BuildNavigator.tsx:74` in build, `BottomDock.tsx:403`'s `NavigatorPanel` in
  furnish, both `insetInlineStart: 16, bottom: 16`). Measured at 1440×900 the
  overlap was 208×31 — **72% of the pill** — identical in `en` and `he` and in
  both modes; both boxes are `z-index: auto` under the same stacking parent, so
  DOM order decided it and the panel painted over the pill. The pill was
  therefore never fully visible in either mode it exists in. This is one of the
  four pre-existing English overlaps the Step 4 RTL gate counted, and NOT an
  RTL regression — Dan reported seeing it in both languages.

  Scope: one number plus its comment. No logic, no imports, no props. The
  residual case, left deliberately unhandled: `furnish`'s item dock is
  resizable, and dragging it above ~234px tall reaches the pill's trailing end
  again — fixing that would couple this file to the dock's height, which is the
  cross-layer reach this tree is protected from.

- **2026-09-06 (second, separate from the property-rename entry below),
  `src/viewport3d/Viewport.tsx` — its hardcoded UI TEXT moves into the message
  catalogue** (branch `feat/hebrew`, Step 5). Approved by Dan before the edit,
  asked for separately because the earlier exception the same day covered
  *property renames only* and this one is not that: it adds a
  `useTranslations` import and changes three module-scope label tables to carry
  keys instead of words.

  The text: `WALL_MODES` ("Full"/"Cutaway"/"Top"), `ENV_PRESETS`
  ("Studio"/"Suburb"/"City"), `WEATHERS` ("Clear"/"Cloudy"/"Rain"), the
  "Scene" panel header, the walkthrough chip's two states, the time-of-day
  tooltip, the ceilings tip, and StatusOverlay's selection and undo/redo lines.
  Without it the Hebrew editor would show its view-mode and environment rows in
  English directly beside translated chrome.

  Each table keeps its `id` untouched and swaps `label` for `labelKey`; the
  render site resolves the key. That is the convention already used by
  `NavItem.labelKey` (src/landing/nav.ts) and now by `ALL_MODES`
  (design/page.tsx), so this file follows the app's existing answer rather than
  inventing one. Ids are what the store compares on and none of them move.

  Presentation only. Nothing touching the Canvas, camera, controls,
  postprocessing, env/time-of-day WIRING (only the words naming the presets),
  raycasting, or any store setter — every `onClick` keeps the exact call it
  had. The file's own comment above `WEATHERS` already anticipated this: the
  weather emoji was split out of the label string earlier precisely so "the
  label stays a word".

- **2026-09-06, `src/viewport3d/Viewport.tsx` and
  `src/viewport3d/walkthrough/WalkthroughMode.tsx` — four pinned chrome boxes
  move from physical `left`/`right` to logical `insetInlineStart`/
  `insetInlineEnd`** (branch `feat/hebrew`, Step 4 of docs/HEBREW-HANDOFF.md).
  Approved by Dan before the edit.

  | site | element | was |
  |---|---|---|
  | `Viewport.tsx:217` | Scene panel | `left: 14, top: 112` |
  | `Viewport.tsx:321` | WallModeToggle | `left: 14, top: 64` |
  | `Viewport.tsx:367` | StatusOverlay | `left: 14, bottom: 14` |
  | `WalkthroughMode.tsx:748` | FOV slider | `right: 14, top: 64` |

  Under `<html dir="rtl">` these four stayed on the physical side they were
  authored on while everything around them mirrored. The consequence is not
  cosmetic and is arithmetic rather than observed: the inspector is
  `insetInlineEnd: 14, top: 64` (`panelKit.tsx`), which in Hebrew resolves to
  physical `left: 14, top: 64` — the exact coordinates of WallModeToggle. The
  two draw on top of each other the moment anything is selected in the Hebrew
  editor. The Step 4 mirror gate missed it only because nothing was selected
  during that run.

  Four property renames. No logic, no geometry, no imports, no types. Nothing
  touching the camera, controls, postprocessing, env/time-of-day wiring, or the
  first-person walkthrough's collision, spawn, doors or config. Every one is UI
  chrome that happens to live in the viewer's file rather than viewer code —
  which is the same argument the 2026-09-04 `WalkthroughMode.tsx` entry below
  makes, and, as that entry says, an exception is never widened to a file it
  does not name: both files are named here.

  Reversible by inverting the four renames; in English the two spellings
  compute identically, so the LTR render is unchanged by construction.

- **2026-09-04, `src/viewport3d/walkthrough/WalkthroughMode.tsx` — its five
  `T` token references now read from the Plan Dock set** (branch
  `fix/ui-sweep`). Approved by Dan before the edit, asked for specifically
  because this file is not covered by the Viewport/WallMesh entry below and a
  logged exception must never be widened to a file it does not name.

  Two token sets were live and disagreed about the same control: `src/ui/tokens.ts`
  (`T`) fills an active chip SOLID `#0a84ff` with white text, while
  `pdChip` uses a 22% tint of `oklch(0.62 0.15 258)`. Dan read the result as
  "Full/Cutaway is a different shade of blue"; it was really two design
  languages side by side. Everything moves to `PD`.

  This file mattered out of proportion to its five references, because it was
  the **last consumer of `src/ui/tokens.ts`** — while it stood, that whole
  file, and therefore the second design language, had to stay in the repo.
  With it migrated the file is deleted and there is genuinely one token set,
  which also makes the pending copper rebrand a single-file change instead of
  a hunt.

  Presentation only, and all five are walkthrough HUD chrome: `T.textDim` → 
  `PD.textSecondary` on two labels, `glass()` → `pdGlass()` on two floating
  panels, and `accentColor: T.accent` → `PD.accent` on the FOV range input.
  Nothing touching the first-person camera, collision, spawn, door animation
  or config. No import churn beyond swapping the one token import.

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
