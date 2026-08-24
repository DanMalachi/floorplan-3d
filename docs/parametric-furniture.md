# Parametric Furniture — Design Doc

Status: APPROVED DESIGN, not yet built. Executor: Sonnet worker sessions, one phase per session/commit.
Branch: continue on `ui-ux-plan-dock-overhaul` (or a child branch `parametric-furniture`).

Goal: furniture with user-set width/depth/height, configurable module counts (doors,
drawers, seats, pillows…), front styles (slab / shaker / farmhouse), handle styles, and
finishes — generated procedurally from a parts library, placed and edited like any other
furniture item. Three generators ship in order: **wardrobe → kitchen run → sofa**.

This doc is deliberately precise: every new file, every edit to an existing file, every
type, and every dimension is specified. Do not redesign; if something here contradicts
the code you find, stop and report the contradiction instead of improvising.

---

## 0. Architecture in one paragraph

A placed parametric item is a normal `FurnitureItem` whose new optional `parametric`
field carries the full config; its `assetId` is a synthetic `"param:<generator>"` id that
is **deliberately not in `CATALOG_BY_ID`** (old code paths fall back to `PlaceholderBox`,
so back-compat is automatic). Geometry is built client-side by a pure function
`buildParametric(spec) → THREE.Group` in a new `src/parametric/` module, rendered by a
new `<ParametricModel>` component that `FurnitureLayer.tsx` branches to when
`item.parametric` is present. Everything that today reads
`CATALOG_BY_ID.get(item.assetId)` for footprint/flags (collision, wall snap, walkthrough
collision, inspector) instead calls a new resolver `specOf(item)` that synthesizes a
pseudo-`FurnitureAsset` from the parametric dims. The configurator UI is a new inspector
section plus "Custom" cards in the dock's furniture tab.

**Protected files** (`docs/PROTECTED_PATHS.md`): `scene.ts`, `FurnitureLayer.tsx`,
`collision.ts`, `snap.ts`, `walkthrough/furnitureCollision.ts` are protected. Dan's
approval of this doc is the sign-off (same precedent as `Room.ceilingHeight`). Keep the
diffs in those files to exactly what §2 and §5 specify — logic lives in new files.

---

## 1. Schema (`src/schema/scene.ts` — protected, additive only)

Add above `FurnitureItem`:

```ts
/** Config for a procedurally generated furniture item (parametric furniture).
 *  Geometry is rebuilt deterministically from this spec at render time by
 *  src/parametric/ — the scene stores only the recipe, never meshes. */
export interface ParametricSpec {
  generator: "wardrobe" | "kitchenRun" | "sofa";
  /** Outer bounding dims in meters: w along local X, d along local Z, h up. */
  dims: { w: number; d: number; h: number };
  /** Generator-specific integer counts, e.g. { doors: 3, drawers: 2 }.
   *  Missing keys fall back to the generator's defaults. */
  modules: Record<string, number>;
  front: "slab" | "shaker" | "farmhouse";
  handle: "bar" | "knob" | "none";
  /** Finish id resolved by src/parametric/materials.ts (carcass + fronts,
   *  or upholstery for the sofa). */
  finish: string;
  /** Secondary finish: kitchen countertop / sofa accent pillows. */
  finish2?: string;
}
```

Extend `FurnitureItem` (one line):

```ts
export interface FurnitureItem {
  id: Id;
  assetId: string; // catalog key, e.g. "loungeSofa"; parametric items use "param:<generator>"
  x: number;
  y: number;
  rotation: number;
  elevation?: number;
  parametric?: ParametricSpec; // present ⇔ assetId starts with "param:"
}
```

No schemaVersion bump: the field is optional-forever like `stairs`/`fixtures`. Old
projects never have it; new projects opened by old code render a correctly-sized
`PlaceholderBox` (assetId unknown to the catalog) and never crash.

---

## 2. Spec resolver (`src/furniture/spec.ts` — NEW file)

The single place that answers "what are this item's placement properties":

```ts
import { CATALOG_BY_ID, type FurnitureAsset } from "./catalog";
import type { ParametricSpec } from "@/schema/scene";
import { GENERATORS } from "@/parametric";

/** Minimal shape both FurnitureItem and ghost/probe literals satisfy. */
export interface ItemLike {
  assetId: string;
  parametric?: ParametricSpec;
}

/** Placement spec for any item, catalog or parametric. Returns undefined for
 *  unknown catalog ids (existing PlaceholderBox semantics stay intact). */
export function specOf(item: ItemLike): FurnitureAsset | undefined {
  if (item.parametric) {
    const g = GENERATORS[item.parametric.generator];
    return {
      assetId: item.assetId,
      name: g.label,
      category: g.category,
      footprint: { w: item.parametric.dims.w, d: item.parametric.dims.d },
      wallSnap: g.wallSnap,
    };
  }
  return CATALOG_BY_ID.get(item.assetId);
}
```

### Edits in protected files — exact swaps, nothing else

Every call site below currently does `CATALOG_BY_ID.get(item.assetId)` on an object that
IS (or can carry) an `ItemLike`. Swap the lookup for `specOf(item)` and add the import;
delete the `CATALOG_BY_ID` import where it becomes unused.

- `src/viewport3d/collision.ts` — 4 sites (`obbOf` at ~:59, `snapToWall` at ~:94/:126,
  the `noCollide` check at ~:103 → `specOf(other)?.noCollide`). `snapToWall`'s probe
  parameter widens from `{ assetId: string; x: number; y: number }` to
  `{ assetId: string; parametric?: ParametricSpec; x: number; y: number }`.
- `src/viewport3d/walkthrough/furnitureCollision.ts` — 1 site (~:34).
- `src/viewport3d/FurnitureLayer.tsx` — see §5; its three `snapToWall({ assetId, x, y }, …)`
  calls each add `parametric: item.parametric` (drag) / `parametric: placing.parametric`
  (ghost).
- `src/ui/planDock/inspector/FurnitureSection.tsx` (NOT protected) — uses `specOf` too,
  but that file is superseded by §6 anyway.

`placementCollides` and `wallOBBs` signatures do not change.

---

## 3. Generator module (`src/parametric/` — NEW directory)

### 3.1 `types.ts`

```ts
import type * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { FurnitureCategory, RoomType } from "@/furniture/catalog";

export interface ModuleDef {
  key: string;            // key into spec.modules
  label: string;          // "Doors", "Drawers", …
  min: number;
  max: number;            // hard clamp; generator may clamp further by dims
  default: number;
}

export interface GeneratorDef {
  id: ParametricSpec["generator"];
  label: string;                    // "Custom wardrobe"
  category: FurnitureCategory;      // dock category chip
  rooms: RoomType[];                // which room tabs show the Custom card
  wallSnap: boolean;
  dimLimits: { w: [number, number]; d: [number, number]; h: [number, number] }; // meters
  modules: ModuleDef[];
  fronts: ParametricSpec["front"][];     // subset relevant to this generator
  handles: ParametricSpec["handle"][];
  finishes: string[];                    // primary finish ids (ordered, first = default)
  finishes2?: string[];                  // secondary finish ids, when applicable
  defaultSpec: ParametricSpec;
  /** Pure build: spec → group. Origin at floor center (y=0 at floor, x/z centered),
   *  front faces +Z — same convention FurnitureLayer's normalize() produces. */
  build(spec: ParametricSpec): THREE.Group;
}
```

### 3.2 `index.ts`

```ts
export const GENERATORS: Record<ParametricSpec["generator"], GeneratorDef>
```
built from the three generator files, plus:

```ts
/** Clamp + fill: any partial/out-of-range spec becomes a valid one. Applied by
 *  the inspector on every edit and by build() on entry (defense in depth). */
export function sanitizeSpec(spec: ParametricSpec): ParametricSpec;
```

`sanitizeSpec` clamps dims to `dimLimits`, clamps each module count to its `ModuleDef`
range, and resets `front`/`handle`/`finish`/`finish2` to the generator default when the
value isn't in the def's list.

**No build cache in v1.** Specs change only on inspector edits; `ParametricModel`
memoizes per mounted item on `JSON.stringify(spec)` (§5). A global LRU is premature.

### 3.3 `materials.ts`

Reuses the existing decorate/materials infrastructure — do NOT write new wood shaders:

| finish id | source | notes |
|---|---|---|
| `painted-white` | `doorProceduralFinish("painted-white")` + `material.color = #f4f4f2` | matches door convention: painted = maps + color |
| `painted-charcoal` | `doorProceduralFinish("painted-charcoal")` + color `#3a3d40` | |
| `oak` | `doorProceduralFinish("oak")` | has its own color map |
| `walnut` | `loadDoorTextures("walnut")` from `src/materials/loaderDoors.ts` (returns a `DoorTextureSet` of THREE textures; roughness via `doorMaterialRoughness("walnut")`) | real photo texture; loads async-ish via TextureLoader — fine to assign maps directly, three renders untextured until loaded |
| `fabric-linen` | NEW procedural canvas (see below) + color `#d8d2c4` | sofa only |
| `fabric-charcoal` | same maps, color `#4a4d52` | |
| `fabric-sage` | same maps, color `#9aa88f` | |
| `counter-oak` | same maps as `oak` | kitchen counter |
| `counter-white` | plain `MeshStandardMaterial` color `#e9e7e2`, roughness 0.35 | quartz look |
| `counter-dark` | color `#2e2f31`, roughness 0.4, plus the fabric noise canvas at low strength as roughnessMap for speckle | |

API: `finishMaterial(id: string): THREE.MeshStandardMaterial` — module-level cache per
id (materials ARE shared across items; that is safe because parametric meshes never
tint-mutate materials — tint/opacity are handled by cloning in `ParametricModel`, §5).

Fabric procedural (one function, ~25 lines): 256px canvas, `mulberry32` noise +
horizontal/vertical 2px weave lines at alpha 0.05, `heightToNormal(strength 0.35)` for
normalMap, the same canvas (inverted brightness, clamped 0.75–0.95) as roughnessMap.
Reuse `makeCanvas`/`mulberry32`/`heightToNormal` from `src/decorate/proceduralTexture.ts`.

### 3.4 `parts.ts` — shared parts library

All dimensions in meters. Every part returns a `THREE.Mesh` or `THREE.Group` positioned
by the caller. Constants at top of file:

```ts
export const PANEL = 0.018;      // carcass panel thickness
export const FRONT_T = 0.019;    // door/drawer front thickness
export const GAP = 0.003;        // gap between adjacent fronts
export const REVEAL = 0.002;     // outer reveal at carcass edges
export const PLINTH_H = 0.08;    // kitchen plinth height
export const COUNTER_T = 0.04;   // countertop thickness
export const COUNTER_OVER = 0.02;// countertop front overhang
```

Parts (signatures indicative; keep them dumb — boxes in, mesh out):

- `carcass(w, d, h, mat)` — 5 panels: 2 sides (full h), top, bottom (between sides),
  back (12mm, inset flush at rear). Open front.
- `slabFront(w, h, mat)` — single box `w × FRONT_T × h`.
- `shakerFront(w, h, mat)` — frame of 4 rails 60mm wide × `FRONT_T`, center panel 10mm
  thick recessed 8mm behind the frame face. Skip the recessed panel (plain slab) when
  `w` or `h` < 180mm — a drawer front too small for a frame.
- `farmhouseFront(w, h, mat)` — slab + vertical battens 60mm wide × 6mm proud, evenly
  spaced at ~100mm pitch (count = `max(0, round(w/0.1) - 1)`); skip battens when
  h < 250mm (drawer fronts read as plain slabs).
- `frontOf(style, w, h, mat)` — dispatcher over the three above.
- `barHandle(mat)` — cylinder Ø12mm, length 150mm, on two Ø10mm × 35mm standoffs,
  axis vertical for doors / horizontal for drawers (caller rotates).
- `knobHandle(mat)` — Ø30mm sphere on Ø15mm × 20mm stem.
- `handleMat()` — fixed brushed-metal: color `#b8babd`, metalness 0.9, roughness 0.35.
- `cushion(w, d, h, mat)` — `RoundedBoxGeometry` from
  `three/examples/jsm/geometries/RoundedBoxGeometry.js`, radius `min(w,d,h) * 0.18`,
  4 segments.
- `plinth(w, d, mat)` — box `w-0.04 × PLINTH_H × d-0.03`, recessed 30mm from front.
- `countertop(w, d, mat)` — box `w × COUNTER_T × (d + COUNTER_OVER)`, front edge
  overhanging.

Handle placement rules (used by generators):
- Hinged door: on the edge opposite the hinge, 40mm in from that edge. Wardrobe doors:
  centered vertically. Kitchen base doors: 60mm below the top edge. Kitchen wall-cabinet
  doors: 60mm above the bottom edge.
- Drawer: horizontal, centered on the front.
- `handle: "none"`: skip entirely (integrated-pull look).

### 3.5 `wardrobe.ts`

`id: "wardrobe"`, `label: "Custom wardrobe"`, `category: "Storage"`,
`rooms: ["bedroom", "closet", "kids"]`, `wallSnap: true`.

- `dimLimits`: w [0.5, 4.0], d [0.35, 0.8], h [1.2, 2.6].
- `modules`: `doors` (min 1, max 8, default 2), `drawers` (min 0, max 3, default 0) —
  drawers form a bottom band spanning the full width.
- `fronts`: all three. `handles`: all three. `finishes`: painted-white (default),
  painted-charcoal, oak, walnut. No `finishes2`.
- `defaultSpec`: dims {w 1.5, d 0.6, h 2.2}, {doors 2, drawers 0}, slab, bar,
  painted-white.

Build:
1. Carcass `w × d × h` in the primary finish (carcass always primary finish).
2. Drawer band height = `drawers × 0.25` (0 if none), at the bottom, above a 20mm base
   gap. Each drawer front: full inner width, height `0.25 - GAP`.
3. Door band = remaining height above the drawer band. `doors` fronts side by side,
   each `innerW/doors - GAP` wide. Clamp: if `innerW/doors < 0.30`, reduce the
   effective door count until ≥ 0.30 (sanitize handles the module number; this is the
   render-time guard).
4. Hinge alternation: leftmost door hinges left, then alternate, so handle pairs meet.
5. Fronts sit proud of the carcass front face by `FRONT_T` (overlay doors).

### 3.6 `kitchenRun.ts`

`id: "kitchenRun"`, `label: "Custom kitchen run"`, `category: "Kitchen"`,
`rooms: ["kitchen"]`, `wallSnap: true`.

- Fixed heights: base units 0.72 carcass on `PLINTH_H` plinth + `COUNTER_T` counter
  ⇒ counter surface at 0.84. `dims.h` controls the TOP of the wall-cabinet band
  (ignored when `wallCabinets` is 0).
- `dimLimits`: w [0.6, 6.0], d [0.55, 0.7], h [1.4, 2.6].
- `modules`: `drawerUnits` (min 0, max 4, default 1), `wallCabinets` (min 0, max 6,
  default 2).
- Unit layout: `unitCount = max(1, round(w / 0.6))`, each unit `w/unitCount` wide.
  The first `drawerUnits` units (from the left, clamped to unitCount) are 3-drawer
  stacks (equal thirds of the front height); the rest are single-door units,
  hinge alternating.
- Wall cabinets: `wallCabinets` cabinets of the same unit width (clamped to unitCount),
  left-aligned, depth 0.32, from `dims.h - 0.7` up to `dims.h`, mounted flush to the
  back plane. Single door each.
- `fronts`/`handles`: all. `finishes`: painted-white (default), painted-charcoal, oak,
  walnut. `finishes2` (counter): counter-oak (default), counter-white, counter-dark.
- `defaultSpec`: dims {w 2.4, d 0.6, h 2.2}, {drawerUnits 1, wallCabinets 2}, slab,
  bar, painted-white, finish2 counter-oak.
- Footprint/collision note: footprint is `dims.w × dims.d` — wall cabinets overhang
  nothing (depth 0.32 < base depth), so the base OBB is correct for collision.

### 3.7 `sofa.ts`

`id: "sofa"`, `label: "Custom sofa"`, `category: "Seating"`,
`rooms: ["living", "study", "kids"]`, `wallSnap: true`.

- `dimLimits`: w [0.8, 4.0], d [0.8, 1.2], h [0.65, 1.0].
- `modules`: `seats` (min 1, max 5, default 3), `pillows` (min 0, max 6, default 2).
- Geometry (all cushions via `cushion()`):
  - Base slab: `w × d×0.85 × 0.22`, at y 0.06 (on 4 Ø40mm cylinder feet).
  - Arms: 2 boxes 0.18 wide × `d×0.85` × `h×0.75`, rounded (cushion() with small
    radius), at the ends.
  - Seat cushions: `seats` cushions filling `w - 2×0.18`, depth `d×0.62`, height 0.16,
    on the base, front-aligned.
  - Back cushions: `seats` cushions, height `h - 0.28 - 0.16` (clamped ≥ 0.25),
    thickness 0.14, leaning against the back edge (tilt −8° about X).
  - Pillows: `pillows` cushions 0.45 × 0.12 × 0.45, tilted −15°, spread alternately
    from the two arms inward, resting on the seat cushions in front of the back
    cushions. Pillows use `finish2`; everything else uses `finish`.
- `fronts`/`handles`: NOT applicable — `fronts: ["slab"]`, `handles: ["none"]` (the
  inspector hides a picker whose def lists exactly one option).
- `finishes`: fabric-linen (default), fabric-charcoal, fabric-sage.
  `finishes2`: same three (default fabric-charcoal).
- `defaultSpec`: dims {w 2.2, d 0.95, h 0.8}, {seats 3, pillows 2}, slab, none,
  fabric-linen, finish2 fabric-charcoal.

---

## 4. Store (`src/store/useSceneStore.ts` — shared, NOT protected)

1. `placing` type widens: `{ assetId: string; rotation: number; parametric?: ParametricSpec } | null`.
2. `setPlacing` (verified signature at ~:763: `(assetId) => set({ placing: assetId ? { assetId, rotation: 0 } : null, … })`)
   — add an optional second param: `setPlacing(assetId, parametric?)` spreading
   `...(parametric ? { parametric } : {})` into the placing object. Existing callers
   pass one arg and are unaffected.
3. `placeFurniture(x, y, rotation)` at ~:775: copy `parametric` from `placing` into the
   new item (`...(placing.parametric ? { parametric: placing.parametric } : {})`).
   `defaultElevation` lookup stays as-is (parametric ids miss the catalog → undefined →
   floor level, correct).
4. NEW action:
   ```ts
   updateFurnitureParametric: (id: Id, patch: Partial<ParametricSpec>) => void;
   ```
   Merges patch into the item's spec (`modules` merged shallowly too), runs
   `sanitizeSpec`, commits via the same `commitScene`/undo path other inspector edits
   use, label `"Edit custom furniture"`. Look at how `RoomSection`'s ceiling-height
   field commits and copy that pattern exactly.
5. `duplicateFurniture` / `replaceFurnitureAsset`: duplicate already spreads the item —
   verify `parametric` survives (it will if it spreads). `replaceFurnitureAsset` must
   DROP `parametric` when replacing with a catalog asset (delete the key), and the
   Replace flow does not need to support replacing WITH a parametric item in v1.

---

## 5. Rendering (`src/parametric/ParametricModel.tsx` NEW + minimal `FurnitureLayer.tsx` diff)

### ParametricModel (new, unprotected)

```tsx
export function ParametricModel({ spec, tint, opacity }: {
  spec: ParametricSpec;
  tint?: "red" | null;
  opacity?: number;
}) { … }
```

- `useMemo` on `[JSON.stringify(spec), tint, opacity]`:
  `const g = GENERATORS[spec.generator].build(sanitizeSpec(spec))`.
- Apply the same conventions `normalize()` uses in `FurnitureLayer.tsx`:
  `applyShadowClass(g, opacity !== undefined ? "transient" : "opaqueArchitecture")`,
  then traverse-clone materials per instance and apply opacity/depthWrite and the red
  emissive tint exactly like `normalize()` does (copy those ~15 lines; they cannot be
  imported — `normalize` is not exported and FurnitureLayer must not be refactored).
- Dispose the previous group's cloned materials+geometries in the memo/effect cleanup
  (unlike GLTF clones, we own these geometries).
- No `<Suspense>` needed — building is synchronous.

### FurnitureLayer.tsx (protected — this exact diff and nothing more)

1. Import: `import { ParametricModel } from "@/parametric/ParametricModel";`
2. In `FurnitureItemView`, the `<AssetModel …>` render (~:327) becomes:
   ```tsx
   {item.parametric
     ? <ParametricModel spec={item.parametric} tint={colliding ? "red" : null} />
     : <AssetModel assetId={item.assetId} tint={colliding ? "red" : null} />}
   ```
3. In `PlacementGhost`: the early return (~:347) becomes
   `if (!placing || (!placing.parametric && !CATALOG_BY_ID.has(placing.assetId))) return null;`
   and the ghost `<AssetModel …>` gets the same conditional using
   `placing.parametric` with `opacity={0.55}`.
4. The three `snapToWall({ assetId … })` probes add `parametric` (§2).
5. `SelectionRing` radius: `FurnitureItemView` computes `spec`/`ringR` from
   `CATALOG_BY_ID` (~:225) — swap to `specOf(item)` (§2), which also fixes the ring for
   parametric items.

Nothing else in the file changes. `AssetModel` itself is untouched.

---

## 6. UI

### 6.1 Dock custom cards (`src/ui/planDock/BottomDock.tsx` — not protected)

In `FurnitureItemsForRoom` (~:501): before the catalog `items.map(…)` grid entries,
render one `CustomCard` per generator whose `rooms` includes the current `room` —
`Object.values(GENERATORS).filter(g => g.rooms.includes(room))`. Rules:

- Custom cards are pinned first, unaffected by category chips or hotspot filter, but DO
  respect search (`query` matches against `g.label.toLowerCase()`).
- `CustomCard` mirrors `ItemCard`'s tile styling (find `ItemCard` in the same file and
  reuse its dimensions/hover/active styles) with: an inline SVG glyph instead of a
  thumbnail (wardrobe: tall rect split by a center line; kitchen: two squat rects +
  counter line; sofa: seat + back arcs — 3 tiny hand-written SVGs, ~10 lines each), the
  generator label, and a small `PD.accent`-colored "Custom" badge.
- Click: `useSceneStore.getState().setPlacing("param:" + g.id, g.defaultSpec)` (per the
  store signature chosen in §4) — arms the normal placement ghost.

### 6.2 Inspector (`src/ui/planDock/inspector/`)

`Inspector.tsx` `case "furniture"` becomes:

```tsx
return item.parametric
  ? <ParametricSection item={item} />
  : <FurnitureSection item={item} />;
```

NEW `ParametricSection.tsx`, built entirely from `panelKit` primitives
(`pdInspectorPanel`, `PdSectionTitle`, `PdNumField`, `PdStepper`, `PdChipGroup`,
`PdSwatch`, `PdActionRow`, `PdActionButton`, `PdHelpText`) — read `panelKit.tsx` prop
signatures before writing this file:

1. Header: generator label + "Custom" (no thumbnail).
2. Dims row: three `PdNumField`s W / D / H shown in **cm** (schema stores meters —
   follow `RoomSection`'s ceiling-height cm↔m convention), clamped to `dimLimits`.
3. One `PdStepper` per `ModuleDef` of the generator.
4. Front style: `PdChipGroup` of the generator's `fronts` — hide when only one.
5. Handle: chip group of `handles` — hide when only one.
6. Finish: `PdSwatch` row for `finishes` (swatch colors: hardcode a representative hex
   per finish id in this file — e.g. painted-white `#f4f4f2`, oak `#d6b282`, walnut
   `#5b4632`, fabric-linen `#d8d2c4`…). Second swatch row for `finishes2` when the
   generator has it, titled "Counter" (kitchenRun) / "Pillows" (sofa).
7. Every control commits through `updateFurnitureParametric(item.id, patch)` — dims and
   module edits rebuild the mesh live.
8. Action row: Duplicate / Delete (reuse `FurnitureSection`'s handlers; no Replace).
9. Help text: `drag to move · R rotates · Delete removes`.

---

## 7. What does NOT change

- `FurnitureItem` placement/drag/rotate/elevation code paths — parametric items reuse
  them untouched (only the model rendered inside the group differs).
- Thumbnails (`src/furniture/thumbnails.ts`), variants, IKEA/BlenderKit catalogs,
  eyedropper (sampling a parametric item may no-op in v1 — verify it doesn't throw:
  `sampleFurniture` reads the catalog, returns falsy for unknown ids, fine).
- Liveblocks/live projects: `parametric` is plain JSON on `FurnitureItem`; the Yjs
  mirror needs no schema work.
- Walkthrough door/collision systems beyond the one `specOf` swap.
- No changes to `eval/`, `extraction/`, or anything on the pipeline side.

---

## 8. Phases (one commit each; verify in browser before each commit — dev server,
visible tab, walkthrough per memory `browser-verify-3d-app`)

**P1 — Skeleton + wardrobe, placeable.**
Schema field, `spec.ts` + all protected swaps, `parametric/` (types, index,
materials with the 4 wood/paint finishes only, parts, wardrobe), `ParametricModel`,
FurnitureLayer diff, store `placing`/`placeFurniture` changes, dock CustomCard
(wardrobe appears in Bedroom/Closet/Kids tabs).
✔ Place a default wardrobe; drag it; it collides (red tint) and wall-snaps back-flush;
walkthrough camera collides with it; save → reload → still there; undo removes it.

**P2 — Configurator.**
`updateFurnitureParametric`, `ParametricSection`, sanitizeSpec wired, front styles
(shaker/farmhouse geometry), handles, finish swatches.
✔ Select wardrobe → change W to 240cm, doors to 4, front to shaker, finish to walnut —
mesh updates live each edit; each edit is one undo step; collision footprint follows
the new width (drag into a wall).

**P3 — Kitchen run.**
`kitchenRun.ts`, counter finishes in materials.ts, custom card in Kitchen tab.
✔ Default 2.4m run renders base units + counter + 2 wall cabinets; `drawerUnits`
stepper converts left units to drawer stacks; counter swatch changes only the top;
h slider moves the wall-cabinet band.

**P4 — Sofa.**
`sofa.ts`, fabric finishes, custom card in Living/Study/Kids.
✔ Default 3-seater with 2 charcoal pillows; seats 4 widens cushions count; pillow
finish2 swatch recolors only pillows; RoundedBox cushions cast/receive shadows.

**P5 — polish pass (optional, needs Dan).**
Candidates, do not start unscoped: in-viewport resize handles; more generators
(bookshelf, bed); unblocking the 234 blend-only BlenderKit assets (ops task —
install Blender locally, rerun `bk:optimize` pipeline — NOT a code task).

Each phase ends: run `npx tsc --noEmit`, verify the ✔ list in the browser, commit
(`P1: parametric skeleton + wardrobe` style), report deviations from this doc
explicitly.

---
---

# v2 Revision (2026-08-06) — Dan's feedback after P1–P4

P1–P4 shipped and reviewed (commits `8364e59..3229389`). This revision is APPROVED
DESIGN. Same rules as v1: this doc is the spec, do not redesign, report contradictions.
Decisions confirmed with Dan: color wheel is SEPARATE from texture (wheel tints
painted/fabric/leather, never photo wood); kitchen L-shape drag is IN scope; wall
cabinets slide along their wall + adjustable height, snapping to align with base runs;
sink/stove are drop-in items on the counter (no counter cutout).

Four phases R1–R4, one commit each.

---

## R1 — Color wheel + texture expansion (all generators)

### Schema (`src/schema/scene.ts` — protected, additive)

`ParametricSpec` gains:

```ts
  /** Free tint (hex) for colorable finishes (painted/fabric/leather). Ignored
   *  by photo-wood finishes, which keep their natural color. */
  color?: string;
  /** Same, for the finish2 surface (counter / pillows). */
  color2?: string;
```

### Finish system rework (`src/parametric/materials.ts`)

Each finish id gets a `colorable: boolean`. New export:

```ts
export function isColorable(id: string): boolean;
```

Finish table becomes (replaces the v1 painted-white/painted-charcoal pair — keep those
ids resolving as aliases of `painted` so saved P1–P4 items still render):

| id | colorable | recipe |
|---|---|---|
| `painted` | ✔ (default `#f4f4f2`) | v1 paintedFinish maps; color from wheel |
| `laminate-matte` | ✔ (default `#e8e6e1`) | no maps, roughness 0.5 |
| `laminate-gloss` | ✔ (default `#e8e6e1`) | no maps, roughness 0.12 |
| `oak` | ✘ | unchanged v1 |
| `walnut` | ✘ | unchanged v1 |
| `wood-walnut-dark` | ✘ | `loadFloorTextures("wood-walnut-dark")` from `src/materials/loader.ts` + `floorMaterialRoughness` (ids verified in `data/materials-floors.manifest.json`) |
| `wood-plank-pale` | ✘ | same, id `wood-plank-pale` |
| `fabric-linen` → rename to `fabric` | ✔ (default `#d8d2c4`) | v1 fabric maps; `fabric-charcoal`/`fabric-sage` become aliases of `fabric` (their old hardcoded colors move to preset swatches) |
| `fabric-boucle` | ✔ (default `#e3ded2`) | fabric canvas rerun with seed 23, noise amplitude ×2, cover 0.25 |
| `velvet` | ✔ (default `#5a4a6a`) | `MeshPhysicalMaterial` (subtype of MeshStandardMaterial — return type stays), sheen 1.0, sheenRoughness 0.5, `sheenColor` = the tint color, roughness 0.6, fabric normal map at strength ×0.5 |
| `leather` | ✔ (default `#6b4a35`) | new procedural: fabric-style canvas, seed 7, cellular look = 60 random dark ellipse outlines alpha 0.06 over noise, `heightToNormal` strength 0.5, roughness 0.42, cover 0.6 |
| `counter-oak` / `counter-white` / `counter-dark` | ✘ / ✔ / ✔ | unchanged recipes; white/dark colorable |

### Tint plumbing — zero new material lifecycle

Generators do NOT clone materials for color. Instead: when a mesh's finish is colorable
and `spec.color` (or `color2` for finish2 surfaces) is set, the generator tags
`mesh.userData.tintColor = thatHex`. `ParametricModel` already clones every material per
instance — after cloning, it applies
`if (o.userData.tintColor && m instanceof THREE.MeshStandardMaterial) m.color.set(o.userData.tintColor)`
(and for velvet also `m.sheenColor?.set(...)`). Shared base materials never mutate;
disposal story unchanged.

### UI (`ParametricSection.tsx`)

- Finish swatch rows stay (they pick the TEXTURE). Under each row, when
  `isColorable(selectedFinish)`: a color control — native `<input type="color">`
  styled to a 26px round swell (border `PD.hairline`), plus 6 preset swatches
  (`#f4f4f2 #3a3d40 #d8d2c4 #9aa88f #5a4a6a #6b4a35`). Commits
  `updateFurnitureParametric(id, { color })` on change-end (`onChange` is fine —
  the store action already coalesces per commit; verify undo isn't spammed per
  drag tick, else commit on blur).
- Generator finish lists update: wardrobe/kitchen fronts `["painted",
  "laminate-matte", "laminate-gloss", "oak", "walnut", "wood-walnut-dark",
  "wood-plank-pale"]`; sofa `["fabric", "fabric-boucle", "velvet", "leather"]`
  (finishes2 same list).

✔ R1 acceptance: wardrobe painted + wheel → any color live; switch to walnut → wheel
hides, natural wood; sofa leather tinted deep green renders leather grain; velvet has
visible sheen; old saved P1–P4 items (painted-white etc.) still render.

---

## R2 — Kitchen split: base runs + wall-cabinet runs as separate items

Kill the monolith: `kitchenRun` stays registered (renders old saves) but loses its dock
card. Two NEW generators in `src/parametric/`:

### `kitchenBase.ts`
v1 kitchenRun MINUS wall cabinets. `id: "kitchenBase"`, label "Kitchen base run",
dims h fixed-ish [0.75, 0.95] mapped to counter height (carcass derives:
`h - PLINTH_H - COUNTER_T`), w [0.6, 6.0], d [0.55, 0.7]. Modules: `drawerUnits`
unchanged. finishes2 = counters. `wallSnap: true`.

### `kitchenWall.ts`
`id: "kitchenWall"`, label "Kitchen wall cabinets". Row of wall cabinets only:
w [0.3, 4.0], d [0.28, 0.4], h [0.35, 0.9] (row height). Same unit logic
(`unitCount = max(1, round(w/0.6))`), single door per unit, hinge alternating,
handle 60mm above bottom edge. No plinth, no counter, no finishes2.
**GeneratorDef gains two optional fields** (add to `types.ts`, wire into `specOf`):

```ts
  defaultElevation?: number; // meters above floor a fresh placement starts at
  noCollide?: boolean;
```

`kitchenWall.defaultElevation = 1.45` (bottom of the row ⇒ standard 600mm above an
840mm counter). `specOf` passes both through to the pseudo-asset; store's
`placeFurniture` must read elevation via `specOf(placing)` instead of
`CATALOG_BY_ID.get(placing.assetId)` (store is unprotected — one-line swap).

### Height moves (the "y axis")
`FurnitureItem.elevation` already exists and FurnitureLayer already renders it
(`position={[item.x, item.elevation ?? 0, item.y]}`). Add to `ParametricSection`, for
`kitchenWall` only: PdNumField "Height off floor" (cm, range 80–210) writing
`item.elevation` via a new store action `setFurnitureElevation(id, m)` (same commit
pattern as `updateFurnitureParametric`). Walkthrough collision already ignores items
above `CFG.furnitureElevationCutoffM` — verify a 1.45m wall row doesn't block walking.

### Align snap to base runs ("actually connect")
New file `src/parametric/kitchenSnap.ts`:

```ts
/** When a kitchenWall row is dragged near a kitchenBase run on the same wall
 *  (|Δrotation| < 6°, back faces within 0.55m in plan), snap its x/y so the
 *  row's left edge aligns to the base run's left edge or its unit grid
 *  (0.6m steps), whichever is nearer; and pull it flush to the same wall.
 *  Returns null when nothing is near. */
export function snapKitchenWall(item: ItemLike & { x: number; y: number; rotation: number }, scene: Scene):
  { x: number; y: number; rotation: number } | null;
```

Called from `FurnitureLayer.tsx` `onPointerMove` (protected — exact diff): after the
existing `snapToWall` block, add

```ts
if (!e.shiftKey && item.parametric?.generator === "kitchenWall") {
  const ks = snapKitchenWall({ ...item, x, y, rotation }, d.base);
  if (ks) { x = ks.x; y = ks.y; rotation = ks.rotation; }
}
```

plus the import. Nothing else in the file (Shift already means "no snapping" —
keep that contract).

### Dock
Kitchen tab custom cards become: "Base run", "Wall cabinets" (two SVG glyphs), replacing
the old single kitchen card.

✔ R2 acceptance: place a base run against a wall; place wall cabinets — they spawn at
1.45m, drag near the base run → left edges click into alignment on the same wall;
inspector height field moves them vertically; walkthrough walks under them; old saved
kitchenRun items still render but no card creates new ones.

---

## R3 — Run-draw placement (drag start→finish, corner = L)

Replaces click-to-place for `kitchenBase`/`kitchenWall` ONLY (wardrobe/sofa keep the
ghost). Model: the two-click drag-confirm pattern the Wall tool uses (see
`src/viewport3d/buildTools` for conventions).

### Schema (`src/schema/scene.ts` — protected, one line)

```ts
  /** Items placed as one gesture (e.g. both legs of an L kitchen). Group
   *  members delete together; ids are opaque. */
  group?: Id;
```
on `FurnitureItem`.

### Store (unprotected)
New slice `placingRun: { generator: "kitchenBase" | "kitchenWall"; spec: ParametricSpec } | null`
+ `setPlacingRun(...)` (arming it clears `placing`/`brush` and vice versa — follow the
existing mutual-exclusion pattern at ~:764). New action
`placeKitchenRun(legs: { x: number; y: number; rotation: number; w: number }[])`:
creates one FurnitureItem per leg (spec = placingRun.spec with `dims.w` per leg),
sharing a fresh `group` id when >1 leg, one undo commit "Place kitchen run".
`deleteSelected3d` extends: deleting a grouped item deletes every item with the same
`group` (toast "Removed kitchen run").

### Ghost component — `src/parametric/RunDrawGhost.tsx` (NEW)
Mounted in `Viewport.tsx` (protected — exactly one line, next to
`<FurnitureLayer scene={scene} offset={offset} />` at ~:406: `<RunDrawGhost offset={offset} />`).
Renders null unless `placingRun` is set. Behavior:

1. Invisible ground plane catches moves/clicks (copy `PlacementGhost`'s plane).
2. Before first click: a 1-unit-wide ghost run wall-snapped under the cursor
   (reuse `snapToWall` with the generator's spec probe).
3. First click: anchors the START. The start leg locks to the nearest wall
   (direction = wall direction, back flush; require a wall within 0.45m — show a
   toast "Start against a wall" and ignore the click otherwise).
4. Dragging: run grows from start toward cursor along the wall direction, length
   snapped to 0.1m, live `ParametricModel` ghost (opacity 0.55) with per-frame spec
   `{...spec, dims: {...dims, w: len}}` — cheap enough at ghost cadence; do NOT
   commit to the store per frame.
5. **Corner turn**: when the cursor's projection passes the wall's far corner node by
   > 0.25m and an adjacent wall continues within 80–100° of the current one, leg A
   freezes at corner length, leg B grows along the adjacent wall. Leg B's start is
   inset by leg A's depth `d` (carcass butt joint — counters meet edge-to-edge, the
   standard L junction; no mitre geometry). Only 2 legs max; dragging back before the
   corner un-freezes leg A.
6. Second click: `placeKitchenRun(legs)`. Esc cancels (`setPlacingRun(null)`).
7. Each leg's `w` clamps to the generator `dimLimits.w`; a leg that would be < min
   is dropped (single-leg L collapses to straight).

Dock: the two kitchen cards call `setPlacingRun` instead of `setPlacing`.

✔ R3 acceptance: draw a straight 2.4m base run in one drag; draw an L around a corner —
two legs, counters meet cleanly, no z-fight; select either leg → Delete removes both;
undo restores both; Esc mid-draw leaves no debris; wardrobe/sofa placement unchanged.

---

## R4 — Counter items: sink + cooktop

Two NEW generators, placed like normal furniture (click-to-place ghost), sitting at
counter height automatically.

### Shared behavior
`rooms: ["kitchen"]`, `wallSnap: false`, `noCollide: true` (v1: they must overlap the
base run's OBB to sit on it; the cost — two sinks can overlap each other — is accepted
for now, note it in the commit message), `defaultElevation` = 0.84 (counter surface;
if R2 made counter height variable, still default 0.84 — refinement comes later).
Category `"Kitchen"`. Both appear as custom cards in the Kitchen tab.

### `sink.ts`
dims w [0.45, 0.9] (default 0.56), d fixed-ish [0.44, 0.52], h ignored (fix 0.02 rim).
Geometry (stainless: color `#c6c8ca`, metalness 0.9, roughness 0.3):
- Rim: 20mm-thick slab `w × d`, rounded corners unnecessary.
- Basin: inside a 40mm inset, an open box 180mm deep — 4 walls 8mm + bottom, visible
  from above (normal FrontSide boxes, no CSG).
- Faucet at back-center: base disc Ø40×25mm, riser Ø22mm × 250mm, spout = quarter
  torus r 120mm tube Ø18mm arcing forward-down.
- Modules: `bowls` (min 1, max 2, default 1) — 2 splits the basin with an 8mm divider.
- finishes: `["steel"]` (new non-colorable finish id in materials.ts: the values above);
  fronts/handles: single-option (hidden pickers, sofa precedent).

### `cooktop.ts`
dims w [0.3, 0.9] (default 0.6), d [0.45, 0.55], h ignored (8mm slab).
- Glass: slab 8mm, color `#101113`, roughness 0.1, metalness 0.
- Burners: `burners` module (min 1, max 5, default 4) — flat cylinders Ø160mm×1.5mm
  color `#33363a` arranged 2×2 (5th centered), inset 60mm from edges.
- Front-right: 3 tiny touch-dot discs Ø8mm color `#5a5e63`.
- finishes: `["glass-black"]` (non-colorable, values above).

Store: `placeFurniture` already reads elevation via `specOf` after R2 — nothing new.

✔ R4 acceptance: place sink + 4-burner cooktop on a base run — both rest exactly on
the counter surface, walkthrough shows them at counter height; 2-bowl sink shows
divider; deleting the base run does NOT delete them (independent items — by design);
they never flag red-collision against the run they sit on.

---

## v2 execution notes
- Protected-file diffs in this revision, exhaustive: `scene.ts` (+2 spec fields,
  +1 item field), `FurnitureLayer.tsx` (+kitchenWall snap block), `Viewport.tsx`
  (+1 ghost mount line). Anything beyond these = stop and report.
- After each phase: `npx tsc --noEmit`, browser verification of the ✔ list
  (visible tab — hidden tabs get 0 rAF ticks), commit `R1: …` style.
- Deviations from this doc go in the commit message under "Deviations:".
