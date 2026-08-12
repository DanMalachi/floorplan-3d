# Catalog Phase 3 — soft decor: handoff

Start a fresh session with this file and the `furniture-catalog-gap-audit` memory,
which is the source of truth for what Phases 1–4 are. Phases 1 (bathroom) and
2 (appliances, plus the mirror/towel/bin split) are shipped and uncommitted on
branch `parametric-furniture`.

## What Phase 3 is

Four generators, because every room currently reads dead:

- `rug` — flat, `noCollide`, uses the existing ambientCG PBR floor textures
- `wallArt` — framed print / canvas / gallery set / wall clock
- `tv` — ~5cm slab, wall-mounted **or** on a stand, size chips 43–75"
- `curtain` — rod + sine-displaced panel planes; drape pair / single / roman blind / sheer

Plants are deliberately NOT built — they are a sourcing job (Poly Haven,
BlenderKit `nature`), not a generator.

## Before writing anything

```
npm run dev                     # visual pass is not optional
npx tsc --noEmit
npm run test:accessories && npm run test:appliances && npm run test:bathroom
npx tsx src/parametric/kitchen.test.ts
```

Read `src/parametric/bin.ts` (simple), `appliance.ts` (variants + mounting) and
`accessories.test.ts` (what a suite has to cover). Copy their shape.

## The rules. Each one below cost a review round in Phase 2 — don't re-learn them

1. **A variant is a product, not a style.** Every card carries its own
   `defaults` (dims *and* finish) and the generator sets `variantIsProduct: true`,
   which hides the inspector's variant chips. Switching a placed 75" TV to
   "wall clock" would keep the TV's dimensions. Styling that a placed item can
   be re-tuned to (colour, finish, front profile) stays in the inspector.
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
   Watch keyword collisions: "bin" is a substring of "cabinet".
6. **Dead controls hide**: `ModuleDef.appliesTo(spec)` and
   `GeneratorDef.showFronts(spec)`. A control that does nothing for this
   variant teaches people the inspector lies.
7. **Two-state modules get labelled buttons** via `ModuleDef.toggle`
   ("Curtains open" / "Curtains closed"), never a 0/1 stepper.
8. **Materials**: no `transmission` — it needs its own render pass and turns
   panels into mirrors. Anything live (a `Reflector`) sets
   `userData.keepMaterial` so `ParametricModel` doesn't clone it dead.
   Canvas-built finishes (painted / oak / walnut / fabric) don't exist headless,
   so tests must swap to a canvas-free finish **the generator itself offers** —
   `sanitizeSpec` resets anything else straight back into the canvas.
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
    `·` fallback), navigator reachability for the whole catalog. Phase 2's
    suites caught 20 real defects before Dan saw them; the ones that reached
    him were all things the tests didn't measure.
12. **Then look at it in the browser.** Screenshots catch what tests can't — a
    hood's flue through the roof, a mirror with no visible glass.

## Open items carried into Phase 3

- The worktop microwave and island hood **counter-bond feel** is unit-tested but
  never eyeballed — synthetic clicks can't drive the run-draw tool (click-move-click
  on a wall face). Ask Dan to try it.
- **Generic stacking** ("place anything on top of anything") needs
  `PlacementGhost` in the protected `FurnitureLayer.tsx`. Not built. Ask first.
- Each mirror costs **one extra scene render per frame** (planar reflector at
  512px). Fine for a few; if a plan fills with mirrors, that is the first thing
  to look at.
- The dock's default height is versioned in localStorage (`planDock:dockHeight2`).
  If you change the default again, bump the key or nobody sees it.
