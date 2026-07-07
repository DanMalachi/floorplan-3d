# Phase 4 — The Build Mode Engine

> **Vision:** This is the project's destination — the editable 3D home design
> experience itself (see [`VISION.md`](VISION.md)). How would the Sims
> architectural engine feel if it shipped in 2026 and was designed by Apple?
> Direct manipulation of everything — every wall, corner, door, window and piece
> of furniture is grabbable and reshapes the house live — wrapped in a calm,
> glassy, precise UI. Zero modal friction; experimentation is always safe because
> undo is instant and universal.

Approved decisions (2026-07-04): furniture from curated **CC0 packs**; **editing
mechanics before UI skin**; the 2D trace editor gets **re-skinned to match** as part
of the shell milestone; signature features in scope: **wall cutaway/fade, grid +
smart snapping, day lighting & shadows**. First-person walk mode is OUT of this
phase (candidate for Phase 5).

---

## Design principles

1. **Direct manipulation over forms.** You never type a wall length into a field
   as the primary flow — you drag the wall and read the live dimension label.
   (An inspector exists for precision, but it's secondary.)
2. **Everything selectable, everything previewed.** Hover = soft highlight.
   Selection = glow + handles. Every drag shows a ghost with live measurements
   and snap guides before commit.
3. **Undo under everything.** Any mutation — drag, delete, place, accept-suggestions —
   is a command on one global stack. Cmd/Ctrl+Z always works. One gesture = one
   undo step (drags coalesce).
4. **The scene stays the single source of truth.** 3D gizmos and 2D trace both
   mutate the same zustand scene; all geometry is derived. No editor state leaks
   into the schema.
5. **Calm surface, playful feedback.** Apple restraint in chrome (glass panels,
   one accent color, SF-style type); Sims joy in feedback (snap pulses, smooth
   eased transitions, satisfying placement).

## Scope

**In:** 3D editing of walls/corners/openings; per-wall height & thickness;
furniture system (catalog, placement, manipulation); snapping engine; undo/redo;
app shell + full visual redesign (incl. 2D trace re-skin); wall cutaway; sun
lighting & shadows; PBR material pass.

**Out (this phase):** first-person walk mode; multi-floor; roofs; terrain;
curved walls; save/share/auth; mobile layout; NL commands. Detection/eval work
continues in parallel but is not part of Phase 4.

---

## Architecture

### Scene schema v2 (`src/schema/scene.ts`)

- `schemaVersion: 2`. v1 scenes upgrade trivially (new fields optional/empty).
- **Furniture** joins the scene:

```ts
interface FurnitureItem {
  id: Id;
  assetId: string;        // catalog key, e.g. "sofa-2seat"
  x: number; y: number;   // plan meters (center)
  rotation: number;       // radians around +Y (world up)
  elevation?: number;     // meters above floor (wall shelves later; default 0)
}
```

- Walls already carry `thickness` and optional `height` — Phase 4 finally
  **propagates real thickness end-to-end** (trace/extraction → scene → extrusion)
  and exposes both per-wall in the inspector.

### Command stack (undo/redo)

Custom lightweight command pattern in the store (not zundo): each command stores
`do/undo` as scene patches; gestures accumulate into a single command committed
on pointer-up (drag coalescing); suggestion-accept and furniture placement are
commands too. Cap history (~200). Rationale: we need gesture coalescing and
selective scoping that temporal-snapshot middleware makes awkward.

### Interaction layer (3D)

- **Selection:** R3F raycasting with a `userData.pick` contract per mesh
  (`{kind: "wall"|"opening"|"furniture"|"node", id}`). One `useSelection` store
  slice: `hovered`, `selected`, `gesture`.
- **Gestures:** a small state machine — `idle → hover → press → drag → commit/cancel`.
  All drags are pointer-capture on an invisible floor-plane (or wall-plane)
  raycast target; Esc cancels mid-drag.
- **Wall drag:** translate along wall normal (both nodes move; connected walls
  follow because geometry derives from nodes). **Corner drag:** move the node.
  **Opening drag:** slide `offset` along host wall, clamped to wall extents ±
  jamb margin; edge handles resize `width` (and `height`/`sill` for windows).
- **Live re-extrusion:** per-wall geometry memoized by `(wall, its openings)`
  hash — during a drag only affected walls rebuild. Current `buildWallSegments`
  is already per-wall; add memo + floor re-triangulation throttled to frames.

### Snapping engine (shared 2D/3D)

One module (`src/lib/snap3d.ts` naming TBD) consumed by both editors:
- grid snap (0.1 m default, Shift disables — matches existing ortho convention),
- alignment guides (extend collinear with existing walls/nodes; equal-spacing),
- angle snap for walls (0/45/90), furniture back-to-wall snap,
- returns `{point, guides[]}` so the renderer draws Sims-style guide lines.

### Furniture pipeline

- **Assets:** curated CC0 (Kenney Furniture Kit + Quaternius as base; license
  files vendored). `public/furniture/<assetId>.glb`, compressed (meshopt/draco).
- **Catalog:** `src/furniture/catalog.ts` manifest — `{assetId, name, category,
  footprint: {w, d}, wallSnap?: boolean, thumb}`. Thumbnails pre-rendered PNGs
  (script renders each glb once, checked in).
- **Loading:** drei `useGLTF` with suspense per item; instanced where repeated.
- **Placement:** click catalog item → ghost follows floor raycast → scroll/R
  rotates in 15° snaps → click places (command). Red tint when footprint
  intersects walls/other furniture (2D AABB/OBB test in plan space — cheap and
  Sims-accurate).

### Rendering & atmosphere

- Directional **sun** with soft shadow map + ambient/hemisphere fill; drei
  `Environment` for IBL; time-of-day slider deferred to M6 stretch.
- **Wall cutaway:** walls whose outward face points toward the camera *and*
  which occlude interior floor fade to ~15% opacity (per-material transparency,
  eased). Toggleable: Full / Cutaway / Top-down (the Sims wall modes).
- **Materials:** PBR presets — painted wall, wood/tile floor per room, glass for
  windows, door slabs. Room floor material assignable in inspector (stretch).

### App shell & design language (M5)

- **Modes:** `Trace · Build · Furnish · View` — top-center segmented control.
  Trace = re-skinned current 2D editor (same features, new chrome). Build =
  3D wall/opening editing. Furnish = catalog + furniture. View = clean orbit.
- **Chrome:** floating glass panels (backdrop-blur, hairline borders, large
  radii), one accent color, SF-stack typography (`-apple-system`), dark-first
  with light support. Contextual **inspector** appears docked right when
  something is selected (dimensions, thickness/height, type swap, delete).
- **Motion:** 150–250 ms ease-out transitions; snap pulse on placement;
  camera eases (drei `CameraControls` with damping replaces OrbitControls).
- Design tokens in one module (`src/ui/tokens.ts`) — no ad-hoc styles.

---

## Milestones

Each milestone must be visually confirmed in `npm run dev` before the next
(project rule). "AC" = acceptance criteria.

- **M0 — this document.** AC: user approves scope + architecture.
- **M1 — Selection + command stack.** Raycast hover/selection with highlight in
  the existing viewport; global undo/redo wired to store; delete selected wall/
  opening as first commands. AC: click-select anything, Z undoes a delete.
- **M2 — Wall & corner manipulation.** Wall drag along normal, corner drag,
  per-wall height/thickness editing (temporary minimal inspector), live
  re-extrusion, grid + guide snapping, dimension labels during drag.
  AC: reshape the 20x45 model entirely in 3D, undo-safe, 60 fps on drag.
- **M3 — Opening manipulation.** Slide/resize doors & windows with clamps and
  validity ghosts; type swap door↔window. AC: move every opening in a real
  traced plan without ever breaking wall geometry.
- **M4 — Furniture.** Schema v2, asset pipeline + ≥20 curated items across
  4 categories, catalog panel (functional, unstyled ok), place/move/rotate/
  delete with collision tint + wall snap. AC: furnish a traced house.
- **M5 — Shell & redesign.** Mode system, glass design language across app,
  2D trace re-skin, contextual inspector, CameraControls polish, wall cutaway
  modes. AC: the app reads as one designed product; all prior features reachable.
- **M6 — Atmosphere.** Sun + shadows, Environment IBL, PBR material presets,
  placement/selection motion polish. AC: a furnished model looks like a game
  screenshot, not a CAD viewport.

Risks: drag-performance on large scenes (mitigate: per-wall memo, throttled
floor rebuild); CC0 asset visual consistency (mitigate: single-pack bias, shared
palette material override); scope creep in M5 (mitigate: token module first,
re-skin second, no new features inside M5).
