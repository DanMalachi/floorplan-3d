# Catalog Phase 3 — soft decor: handoff

Start a fresh session with this file and the `furniture-catalog-gap-audit` memory,
which is the source of truth for what Phases 1–4 are. Phases 1 (bathroom) and
2 (appliances, plus the mirror/towel/bin split) are shipped and committed on
branch `parametric-furniture`.

## Status

- **`rug` — DONE**, commit `fcd46da`. Five product cards (wool area, round shag,
  Persian medallion, modern geometric, braided jute round), suite
  `npm run test:decor` (160 checks). What that build learned is below under
  "Surfaces" — read it before writing another material.
- **`tv` — DONE**, commit `41a10e5`.
  Round 2 added: sizing in INCHES (`GeneratorDef.sizeInches` — screen diagonal
  at a locked 16:9, standard-size chips, no width/height fields); a lit screen
  showing ONE real photograph (`public/textures/tv/broadcast-earth.jpg`, NASA
  ISS, public domain — see docs/DATA_RIGHTS.md); and STACKING — a TV on a stand bonds to
  the top of any furniture, parametric or IKEA, not just kitchen worktops
  (`surfaceHosts.ts`, `findAttachHost`, `GeneratorDef.surfaceOptional`).
  Catalog items carry no height, so a host GLB is measured at render time and
  the result is cached in localStorage (`furniture:hostHeights1`) — an
  attached item's elevation is re-derived on every sync, so without the cache
  a reopened plan would sink its TVs to a per-kind estimate.
  Five cards (wall 55/65/75", pedestal 55", feet 43"), one generator, mounting
  per variant. `npm run test:decor` covers rugs + TVs in one suite. Living only
  until the wide roll-out adds bedroom/study/kids buttons. New: `showFinishes2`
  + `finishes2Label` on `GeneratorDef` (the second swatch row paints the STAND,
  so it hides on the wall cards) and `WallTv` / `unionBox` in `isoArt.tsx` —
  the living TV hotspot now draws a panel on the wall band over a media
  console, one hit rect covering both.
- **`wallArt` — DONE.** Six cards (framed print portrait / landscape, large
  framed art, canvas print, gallery wall of 3, picture ledge with frames), in
  living, bedroom, dining, study, kids, kitchen, bathroom and laundry. The
  PICTURE is a finish, not a variant — six public-domain museum scans in the
  first swatch row (thumbnails, not colour dots), the frame tone in the second.
  Rule 15 taken one step further: a painting on a wall is a photograph of a
  real work, so no procedural "art" was drawn. Sources and licences are in
  docs/DATA_RIGHTS.md; every candidate whose `is_public_domain` flag was false
  was dropped, artist's death date notwithstanding.
- **`wallClock` — DONE.** Its own generator, not a wallArt card: a clock has no
  artwork, no mount and no glazing, and its first swatch row paints the CASE —
  one generator whose primary finish means two different things depending on
  the card is the dead-control rule from the other side. Three cards (round,
  wooden, station with a roman dial), in kitchen/living/dining/study/kids.
- **Wide room roll-out — DONE for rug and tv** (commit `8ffd153`): rug reaches
  living/bedroom/dining/study/kids + a bathroom bath mat, tv reaches
  living/bedroom/study/kids. Curtain's rooms land with curtain.
- **`curtain` — NOT BUILT.** Scope unchanged (below); rooms when it lands:
  living, bedroom, dining, study, kids.

## What is left of Phase 3

- `curtain` — rod + sine-displaced panel planes; drape pair / single / roman
  blind / sheer. **Placement Dan asked for: one click locks the anchor onto the
  wall grid, then you drag to size it.** Not auto-fit to the nearest window —
  he wants precise placement with an easy gesture. RunDrawGhost is the closest
  existing interaction and is NOT in a protected file.

Plants are deliberately NOT built — a sourcing job (Poly Haven, BlenderKit
`nature`), not a generator.

## Before writing anything

```
npm run dev                     # visual pass is not optional
npx tsc --noEmit
npm run test:accessories && npm run test:appliances && npm run test:bathroom
npm run test:decor
npx tsx src/parametric/kitchen.test.ts
```

Read `src/parametric/bin.ts` (simple), `appliance.ts` (variants + mounting),
`rug.ts` (surfaces, custom geometry) and `softDecor.test.ts`. Copy their shape.

## The rules. Each one below cost a review round — don't re-learn them

1. **A variant is a product, not a style.** Every card carries its own
   `defaults` (dims *and* finish) and the generator sets `variantIsProduct: true`,
   which hides the inspector's variant chips. Switching a placed 75" TV to
   "wall clock" would keep the TV's dimensions. Styling that a placed item can
   be re-tuned to (colour, finish, front profile) stays in the inspector.
   Shape belongs to the product too, never to the finish.
2. **Mounting is per-variant, never per-generator.** `wallMounted(spec)` for
   wall art / wall-mounted TVs / curtains; plain floor for rugs and TV stands.
   A generator that mixes them must NOT set a flat `defaultElevation` — that
   number is applied by `placeFurniture` and will hang the floor variants in
   mid-air. Read it only through `elevationOf()` in `src/parametric/index.ts`.
3. **y = 0 is the item's BASE**, wall items included. The wall ghost clamps the
   click height against the item's own height to keep it under
   `WALL_HEIGHT` (2.4m) — a centred item hangs half of itself below the click.
4. **The declared footprint includes everything that sticks out** — a curtain's
   rod finials, a TV stand's feet. Test it: `bbox ≤ dims + 0.03`.
5. **Every card needs a button in the illustrated room**, in *every* room it
   appears in, and a card nobody can reach through the picture does not exist.
   If there is no hotspot, add one and draw the object at true scale and true
   position (a TV hangs on the wall band; a rug lies on the floor plane), then
   re-space the row around it. Never wedge it in as a small box beside
   something unrelated, and never hide it behind another product's button.
   Watch keyword collisions: "bin" is a substring of "cabinet", and two buttons
   must never both match one product (the rug had to leave "Lamp & decor").
   The app's floating compass badge covers the navigator's bottom-left corner —
   art parked under it is art nobody can click.
6. **Dead controls hide**: `ModuleDef.appliesTo(spec)` and
   `GeneratorDef.showFronts(spec)`. A control that does nothing for this
   variant teaches people the inspector lies.
7. **Two-state modules get labelled buttons** via `ModuleDef.toggle`
   ("Curtains open" / "Curtains closed"), never a 0/1 stepper.
8. **Materials**: no `transmission` — it needs its own render pass and turns
   panels into mirrors. Anything live (a `Reflector`) sets
   `userData.keepMaterial` so `ParametricModel` doesn't clone it dead.
   Canvas-built finishes (painted / oak / walnut / fabric / every rug pattern)
   AND image-based ones (the ambientCG scans go through `THREE.TextureLoader`,
   which needs a document as much as a canvas does) don't exist headless, so
   every generator must offer at least one finish that needs neither, and tests
   swap to it — `sanitizeSpec` resets anything the generator doesn't list.
9. **Retire, never delete.** Superseding a generator means `rooms: []` plus a
   comment; it keeps rendering items already saved with it. `ALL_PIECES()`
   skips it.
10. **Protected files** (`docs/PROTECTED_PATHS.md`) stay untouched — including
    `FurnitureLayer.tsx` and `Viewport.tsx`. Adding ids to the
    `ParametricSpec["generator"]` union in `src/schema/scene.ts` is additive and
    pre-approved; anything else in a protected file, stop and ask Dan.
11. **Ship a headless suite with the phase** (`src/parametric/<phase>.test.ts`
    plus a `test:` script): builds, no NaN, footprint, base plane, mounting,
    per-variant sizes distinct, unique glyphs, card names that stand alone (no
    `·` fallback), navigator reachability for the whole catalog. Measure in
    WORLD space — a geometry authored lying down and rotated into place has
    local coordinates that mean nothing (this produced a false failure claiming
    a 2cm rug was 1.18m tall).
12. **Then look at it in the browser, at floor level.** Screenshots catch what
    tests can't — a hood's flue through the roof, a mirror with no visible
    glass, a rim that aliases into a dashed black line. The default overhead
    camera hides all of it.

## Surfaces: what the rug build learned (read before writing a material)

Dan's review order is **material first, pattern second**. A pattern painted in
flat fills is a picture of the thing, not the thing.

- **Real relief beats a normal map.** A map has no silhouette and casts no
  shadow. `rug.ts` displaces a ~3cm grid with seeded value noise — canvas-free,
  so it builds headless — by 3mm (wool) to 9mm (shag). Keep the noise frequency
  under the grid's own Nyquist limit (`1 / 2·CELL`) or it turns to speckle.
- **Grain at the physical unit's scale.** Colour has to break up at the size of
  a knot / fibre / strand, and the normal AND roughness must come from that
  same field so light and pigment agree. `weaveLayer()` in `materials.ts` does
  this; the first patterned pass shipped without it and was rejected on sight.
- **Texture scale is easy to get 4× wrong.** "Too zoomed in" was the note on
  shag at 0.42m per repeat; 0.22m with 4× thinner strokes reads right.
- **Edges**: no coplanar seam in a second tone, no vertical rim. Chamfer, with
  relief damped to zero at the rim.
- **Never sit anything exactly in the floor plane** (y=0) — z-fighting draws a
  dashed black line. 1.5mm of lift is invisible and fixes it.
- **Two UV channels when a pattern must not tile**: channel 1 normalised 0..1
  for the design, channel 0 in metres for the grain. Textures carry `.channel`.
  Every mesh in the group needs `uv1`, backing planes included.
- **A pattern that owns its palette opts out of the colour wheel** (leave it out
  of `COLORABLE`) — tinting multiplies the whole map into one muddy tone.

## Two rules the TV build added (both cost a browser pass to find)

13. **Author every item CENTRED on its declared depth** (`z` from `-d/2` to
    `+d/2`), the way `carcass()` in `parts.ts` does. Placement backs an item
    onto a wall assuming that. The TV was first authored with its glass at
    `z=0` and its body behind — placed flush, the bezel, the housing and the
    bracket all sat INSIDE the plaster and the room saw one flat black
    rectangle with no edge. Nothing in the headless suite noticed: every
    dimension was correct. `softDecor.test.ts` now checks depth centring and
    that the glass is the frontmost surface.
14. **A texture's `.channel` must match an attribute the mesh actually has.**
    A `CanvasTexture` at `channel = 1` on a plain `PlaneGeometry` (no `uv1`)
    reads (0,0) at every vertex — one texel, silently. The TV's glare overlay
    rendered as nothing at all. Rugs put patterns on channel 1 because their
    geometry authors `uv1`; anything else stays on channel 0.

15. **A screen shows a PHOTOGRAPH, so use one.** The lit TV first shipped three
    procedural "channels" painted on canvas (news studio, football pitch,
    landscape) and every one read as the vector drawing it was — the screen is
    the one surface in a room that displays photographic content, and nothing
    hand-drawn survives next to it. It is now a single loaded JPEG on UV
    channel 1. Anything shipped this way is REDISTRIBUTION: source it public
    domain or CC0 and record it in `docs/DATA_RIGHTS.md`, same rule that kept
    royalty-free BlenderKit models out of the catalog.

## Moving a hung item (2026-08-14, Dan's bug report)

Dragging a picture felt stuck, lagged the cursor and kept flipping to the far
side of the wall. None of it was about pictures — it was the wall snap every
wall-mounted generator shares, and a picture is just the thinnest thing on it.

- The drag resolved the pointer against the FLOOR plane. A picture hangs at eye
  level, so that point is metres away from it and wanders centimetres across
  the wall's centreline while the cursor sits still on the frame.
- `snapRunToWall` picked the face from that point alone, so a 4.5cm-deep item
  sitting 7cm off the centreline teleported between faces; and it quantised
  along the wall on the kitchen's 10cm grid, so it stuttered behind the cursor.

Now: `snapRunToWall` takes `{ step, keepFacing }`. Given the pose an item
already has it prefers that wall and face, and only changes face once the
incoming point is as far out as hanging it on the other face would put it —
which is exactly what pointing at that face gives, and far past any jitter.
Decor steps 1cm along the wall; `kitchenWall` keeps 10cm because it lines up
with the base run under it.

**`FurnitureLayer.tsx` was edited with Dan's explicit approval** (2026-08-14) —
it is protected, so this is the exception, not a precedent. A wall-mounted item
now resolves the pointer with `rayToWall` + `wallPose` (both in the
non-protected `wallRay.ts`, and `wallPose` MOVED there from CounterItemGhost so
placing and moving cannot disagree), which also gives it height: a drag now
slides a picture UP the wall, not only along it. The drag dead zone counts that
rise, because measured in plan alone a straight-up drag never opened a gesture
at all. Heights snap 1cm for decor, 10cm for wall cabinets.

## Three more the wall-art build added

16. **A canvas map with transparent pixels renders BLACK.** A cleared canvas is
    rgba(0,0,0,0) and an opaque material multiplies that RGB straight through,
    so the station clock's numeral dial — numerals drawn on a transparent
    canvas — came out as a black hole with faint roman numerals in it. Paint
    the surface tone into the canvas, and set the material colour to white so
    the two don't multiply.
17. **A recessed part needs an OPEN case.** The clock's rim was a solid drum,
    which buried the dial, the ticks and all three hands inside it. Every part
    was present and correctly sized; the headless suite passed; the room saw a
    blank disc. An open-ended cylinder plus a back plate fixed it.
18. **Aspect is data, so test it against the file.** Loading is async and three
    can't be asked for an image's size synchronously, so each artwork's aspect
    is hard-coded next to its URL — and `softDecor.test.ts` reads the actual
    JPEG with `sharp` and compares. A stale number here stretches a painting
    and nothing else in the app would ever notice. Prints are FITTED inside
    their mount (the board absorbs the mismatch, which is what a mount is for);
    a gallery wrap is CROPPED to fill its face. Neither path scales unevenly.

Also: an off screen rendered physically (dark dielectric, low roughness) is
BLACK indoors, because there is no environment worth reflecting — it reads as
a hole cut in the wall. The fix is a faked window reflection: one additive
`MeshBasicMaterial` sheen plane over the glass, plus a bezel light enough to
draw a frame line against the panel. Same lesson as the rugs, other direction:
physical correctness is not the goal, reading as the real thing is.

## Open items carried into the rest of Phase 3

- The worktop microwave and island hood **counter-bond feel** is unit-tested but
  never eyeballed — synthetic clicks can't drive the run-draw tool (click-move-click
  on a wall face). Ask Dan to try it.
- **Placement ghosts cannot be driven by synthetic clicks at all.** Verifying a
  new generator in the browser means committing through the store's own
  `placeFurniture` (`window.useSceneStore.getState()`) and screenshotting; the
  ghost's *feel* is Dan's call. Camera: the OrbitControls wheel only responds to
  a `WheelEvent` dispatched on the canvas, and a left-drag inside the room
  selects and MOVES furniture — drag on empty ground, and check nothing moved
  before you finish.
- **Generic stacking** ("place anything on top of anything") needs
  `PlacementGhost` in the protected `FurnitureLayer.tsx`. Not built. Ask first.
- Each mirror costs **one extra scene render per frame** (planar reflector at
  512px). Fine for a few; if a plan fills with mirrors, that is the first thing
  to look at.
- The dock's default height is versioned in localStorage (`planDock:dockHeight2`).
  If you change the default again, bump the key or nobody sees it.
