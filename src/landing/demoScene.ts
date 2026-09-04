import type { Scene } from "@/schema/scene";
import { sanitizeSpec } from "@/parametric";
import { FIXTURE_LUX_MAX } from "@/render/lightPresets";
import { frameColorPatch } from "@/render/frameFinish";
import { HERO_NODES, HERO_ROOMS, heroOpenings, heroWalls } from "./heroPlan";

// -----------------------------------------------------------------------------
// The marketing hero's furnished apartment — a small, believable home a visitor
// can watch being drawn, then orbit and re-furnish without signing in.
//
// A doll's-house model, not a floorplan: a 6 x 5 m studio with a 1.8 x 1.8 m
// bathroom off its left wall, axis-aligned for readability (same convention as
// src/schema/sampleScene.ts).
//
// ── The geometry is NOT authored here ───────────────────────────────────────
// Nodes, walls, openings and room loops all come from ./heroPlan, because the
// hero draws this plan by hand before it builds it. Two copies of the
// coordinates would mean the visitor watches one building get traced and a
// different one stand up, the first time anyone nudged a wall. Only the
// FURNITURE lives here — nothing traces furniture.
//
// Coordinates are CENTRED ON THE ORIGIN — see the note in ./heroPlan for why
// that is not cosmetic (every camera that frames this model looks at 0,0,0).
//
//    y
//  2.5  n9 ---------- n3 ------- dining -------------------- n2
//       |   bathroom   |     table + 2 chairs, art above      |
//       |  bath · wc   |                         sofa · TV    |
//       |  vanity      |                       coffee table   |
//  0.7  n8 ---------- n7                       [ W2 patio window ]
//       |              | hood                      sofa   |   2.55 m
//       |              | cooker      side table           |
//       |              | fridge · bin                     |
// -2.5                n0 ---- kitchen run + sink -------- n1
//                   -2.1   [ W1 ]      [ D1 ]         3.9     x
//
// ── Where these values come from ────────────────────────────────────────────
// NOT typed by hand. `/design?hero=1` opens this exact scene in the real
// editor, in Decorate mode, and its "Copy furniture →" button hands back
// `scene.furniture` as JSON — the array below is that dump, with ids renamed to
// `f0…fN` in render order, coordinates rounded to 0.1 mm, and rotations written
// as `Math.PI` expressions. Re-furnish there rather than nudging numbers here.
// That route saves NOTHING: the copy button is the only way out of a session.
//
// Two ASSET FAMILIES are in play and they ship differently:
//
//   `param:*`  — generated in code by src/parametric. Zero bytes of download
//                and nothing to 404, which is why every fixture, every piece of
//                wall art and both rugs is one of these.
//   `ikea:*`   — real GLBs served from VERCEL BLOB, deliberately excluded from
//                the deployment upload (~400 MB; see .vercelignore) and
//                resolved by URL through data/furniture-ikea.blob.json.
//
// The IKEA dependency is the one that can break the hero from outside the
// repo, and `npm run furniture:verify-deploy` will NOT catch it — that script
// skips absolute URLs by design. All six were checked live on 2026-09-04 and
// returned 206. If the hero ever renders grey placeholder boxes where the
// sofas are, check Blob before anything else.
//
// Every `parametric` spec below is passed through `sanitizeSpec`, so an invalid
// finish or variant can never reach the marketing page — verified as a no-op
// against this exact array, i.e. nothing here is being silently rewritten.
// -----------------------------------------------------------------------------

/** Shorthand for the sanitizer, so each spec below reads as one line of data
 *  rather than a function call wrapped around one. See the header note: this is
 *  a no-op on the current array by measurement, and stays here so it cannot
 *  stop being one unnoticed. */
const spec = sanitizeSpec;

export const demoScene: Scene = {
  schemaVersion: 2,
  units: "meters",
  nodes: HERO_NODES,
  walls: heroWalls(),
  openings: heroOpenings(),
  rooms: HERO_ROOMS,
  // 30 pieces — a bathroom, a kitchen, a dining corner and a living end, so
  // the home reads as lived-in rather than as a showroom. No bed: this is a
  // studio, and Dan has not found one in the catalog worth putting on the
  // marketing page.
  furniture: [
    // Bathroom — top-left, x -3.9..-2.1 by y 0.7..2.5.
    { id: "f0", assetId: "param:bathtub", x: -3.5, y: 1.5841, rotation: -Math.PI / 2, parametric: spec({ generator: "bathtub", dims: { w: 1.7, d: 0.7, h: 0.55 }, modules: { tap: 1 }, front: "slab", handle: "none", finish: "acrylic", variant: "alcove" }) },
    { id: "f1", assetId: "param:vanity", x: -2.5739, y: 2.22, rotation: Math.PI, parametric: spec({ generator: "vanity", dims: { w: 0.8, d: 0.46, h: 0.85 }, modules: { doors: 2 }, front: "slab", handle: "bar", finish: "oak", variant: "countertop" }) },
    { id: "f2", assetId: "param:mirror", x: -2.5853, y: 2.425, rotation: Math.PI, elevation: 1.2, parametric: spec({ generator: "mirror", dims: { w: 0.7, d: 0.05, h: 0.7 }, modules: {}, front: "slab", handle: "none", finish: "steel", variant: "round" }) },
    { id: "f3", assetId: "param:toilet", x: -2.698, y: 1.08, rotation: 0, parametric: spec({ generator: "toilet", dims: { w: 0.36, d: 0.66, h: 0.78 }, modules: { lidOpen: 1 }, front: "slab", handle: "none", finish: "ceramic", variant: "wall-hung" }) },
    { id: "f4", assetId: "param:towelRail", x: -3.4929, y: 0.81, rotation: 0, elevation: 0.9, parametric: spec({ generator: "towelRail", dims: { w: 0.5, d: 0.12, h: 1.1 }, modules: {}, front: "slab", handle: "none", finish: "painted", variant: "ladder" }) },
    { id: "f5", assetId: "param:towelRail", x: -2.2, y: 2.2252, rotation: Math.PI / 2, elevation: 1, parametric: spec({ generator: "towelRail", dims: { w: 0.18, d: 0.1, h: 0.34 }, modules: {}, front: "slab", handle: "none", finish: "painted", variant: "ring" }) },
    { id: "f6", assetId: "param:rug", x: -2.6, y: 1.7, rotation: 0, parametric: spec({ generator: "rug", dims: { w: 0.6, d: 0.6, h: 0.038 }, modules: {}, front: "slab", handle: "none", finish: "rug-shag", variant: "round" }) },
    { id: "f7", assetId: "param:wallArt", x: -2.6792, y: 0.7725, rotation: 0, elevation: 1.4, parametric: spec({ generator: "wallArt", dims: { w: 0.72, d: 0.045, h: 0.52 }, modules: { mount: 1 }, front: "slab", handle: "none", finish: "art-wave", finish2: "walnut", variant: "framed-landscape" }) },

    // Kitchen — an L-run along the bottom wall with a return up the left one.
    { id: "f8", assetId: "param:kitchenBase", x: -0.675, y: -2.15, rotation: 0, parametric: spec({ generator: "kitchenBase", dims: { w: 2.75, d: 0.6, h: 0.84 }, modules: { drawerUnits: 0 }, front: "shaker", handle: "knob", finish: "painted", finish2: "counter-white", cutouts: [{ along: 1.2, w: 0.64, d: 0.45 }], extraLegs: [{ turn: -1, w: 1.3 }], legDir: -1 }) },
    { id: "f9", assetId: "param:sink", x: -0.5, y: -2.15, rotation: 0, elevation: 0.84, attach: { hostId: "f8", along: 1.2 }, parametric: spec({ generator: "sink", dims: { w: 0.67, d: 0.48, h: 0.02 }, modules: { bowls: 1 }, front: "slab", handle: "none", finish: "steel" }) },
    { id: "f10", assetId: "param:appliance", x: -1.75, y: -1.4, rotation: -Math.PI / 2, elevation: 0.84, attach: { hostId: "f8", along: 3.8 }, parametric: spec({ generator: "appliance", dims: { w: 0.5, d: 0.38, h: 0.3 }, modules: { doorOpen: 0, burners: 5 }, front: "slab", handle: "none", finish: "steel", variant: "microwave" }) },
    { id: "f11", assetId: "param:appliance", x: -1.725, y: -0.2381, rotation: -Math.PI / 2, parametric: spec({ generator: "appliance", dims: { w: 0.61, d: 0.65, h: 0.87 }, modules: { doorOpen: 0, burners: 5 }, front: "slab", handle: "none", finish: "steel", variant: "range-cooker" }) },
    { id: "f12", assetId: "param:rangeHood", x: -1.8, y: -0.2408, rotation: -Math.PI / 2, elevation: 1.68, parametric: spec({ generator: "rangeHood", dims: { w: 0.6, d: 0.5, h: 0.72 }, modules: { lights: 1 }, front: "slab", handle: "none", finish: "steel", variant: "chimney" }) },
    { id: "f13", assetId: "param:appliance", x: 1.1629, y: -2.09, rotation: 0, parametric: spec({ generator: "appliance", dims: { w: 0.91, d: 0.72, h: 1.78 }, modules: { doorOpen: 0, burners: 5 }, front: "slab", handle: "none", finish: "steel", variant: "fridge-side-by-side" }) },
    { id: "f14", assetId: "param:bin", x: -1.8, y: 0.3, rotation: 0, parametric: spec({ generator: "bin", dims: { w: 0.35, d: 0.35, h: 0.7 }, modules: {}, front: "slab", handle: "none", finish: "steel", variant: "kitchen" }) },
    { id: "f15", assetId: "param:rug", x: -0.5163, y: -1.5927, rotation: -Math.PI / 2, parametric: spec({ generator: "rug", dims: { w: 0.6, d: 0.8, h: 0.014 }, modules: {}, front: "slab", handle: "none", finish: "rug-persian", variant: "persian" }) },
    { id: "f16", assetId: "param:wallClock", x: -1.5527, y: -2.425, rotation: 0, elevation: 1.5, parametric: spec({ generator: "wallClock", dims: { w: 0.3, d: 0.05, h: 0.3 }, modules: { secondHand: 1 }, front: "slab", handle: "none", finish: "painted", color: "#23262b", variant: "minimal" }) },
    { id: "f17", assetId: "param:wallArt", x: -2.029, y: -1.5657, rotation: -Math.PI / 2, elevation: 1.3, parametric: spec({ generator: "wallArt", dims: { w: 1.35, d: 0.042, h: 0.78 }, modules: { mount: 1 }, front: "slab", handle: "none", finish: "art-cannons", finish2: "painted", color2: "#23252b", variant: "gallery-3" }) },

    // Dining — table centred on the top wall, a chair to each side.
    { id: "f18", assetId: "ikea:40563776", x: -0.7, y: 2, rotation: 0 },
    { id: "f19", assetId: "ikea:40423559", x: -0.2, y: 2, rotation: Math.PI / 2 },
    { id: "f20", assetId: "ikea:40423559", x: -1.1, y: 2, rotation: -Math.PI / 2 },
    { id: "f21", assetId: "param:wallArt", x: -0.6759, y: 2.4225, rotation: Math.PI, elevation: 1.2, parametric: spec({ generator: "wallArt", dims: { w: 1.1, d: 0.055, h: 0.85 }, modules: { mount: 1 }, front: "slab", handle: "none", finish: "art-bedroom", finish2: "painted", color2: "#23252b", variant: "framed-large" }) },

    // Living — two sofas around a coffee table, TV on the cabinet.
    { id: "f22", assetId: "ikea:40399314", x: 2.3, y: -0.2, rotation: 0 },
    { id: "f23", assetId: "ikea:40399314", x: 0.9, y: 1.3, rotation: -Math.PI / 2 },
    { id: "f24", assetId: "param:rug", x: 2.1, y: 1.1, rotation: 0, parametric: spec({ generator: "rug", dims: { w: 2.51, d: 2.5, h: 0.016 }, modules: {}, front: "slab", handle: "none", finish: "rug-modern", variant: "modern" }) },
    { id: "f25", assetId: "ikea:90500121", x: 2.1, y: 0.9, rotation: 0 },
    { id: "f26", assetId: "ikea:60340389", x: 1.2, y: 0.2, rotation: 0 },
    { id: "f27", assetId: "ikea:00489236", x: 3.3, y: 1.9, rotation: (3 * Math.PI) / 4 },
    { id: "f28", assetId: "param:tv", x: 3.3, y: 1.9, rotation: (3 * Math.PI) / 4, elevation: 0.9024, attach: { hostId: "f27", along: 0.41 }, parametric: spec({ generator: "tv", dims: { w: 1.1249, d: 0.2435, h: 0.7506 }, modules: { screenOn: 1 }, front: "slab", handle: "none", finish: "glass-black", finish2: "steel", variant: "pedestal-55" }) },
    { id: "f29", assetId: "param:wallArt", x: 3.79, y: -1.52, rotation: Math.PI / 2, elevation: 1.31, parametric: spec({ generator: "wallArt", dims: { w: 1.5, d: 0.12, h: 0.52 }, modules: { mount: 1 }, front: "slab", handle: "none", finish: "art-mono", finish2: "oak", variant: "ledge" }) },
  ],
};

/** The two rooms, by id rather than by index — the Floor control writes to the
 *  main room ALONE, and an index would silently start painting the bathroom the
 *  first time `HERO_ROOMS` is reordered. */
export const HERO_MAIN_ROOM_ID = "r0";
export const HERO_BATH_ROOM_ID = "r1";

/** The floors and window-frame the hero opens with. Exported so the editor's
 *  `?hero=1` route dresses the scene identically — a furnishing session has to
 *  see the same room the visitor does, or the furniture is chosen against the
 *  wrong floor. DemoStage's FLOORS[0]/FRAMES[0] must stay `HERO_FLOOR` and
 *  `HERO_FRAME`. */
export const HERO_FLOOR = "wood-chevron";
/** The bathroom is NOT the Floor row's business — it is a design choice, and
 *  the row rewrites only the main room so a visitor trying Concrete cannot take
 *  the black gloss with it. */
export const HERO_BATH_FLOOR = "tile-black-gloss";
export const HERO_FRAME = "#1C1D1F";

/**
 * Wall paint, per FACE.
 *
 * A wall has two long faces and the schema names them by geometry, not by room:
 * "a" is the wall-local +Z face, "b" the -Z face. The wall group is rotated by
 * `-atan2(uy, ux)` about Y and plan (x, y) maps to world (x, ·, y), so face "a"
 * lands on the plan-space LEFT normal of a→b — `(-uy, ux)`. Derived rather than
 * eyeballed, then checked by probing 0.25 m off each face's midpoint against
 * the room loops:
 *
 *     w0  n0->n1   A=Studio    B=outside      w7  n3->n9   A=Bathroom  B=outside
 *     w1  n1->n2   A=Studio    B=outside      w8  n9->n8   A=Bathroom  B=outside
 *     w2  n2->n3   A=Studio    B=outside      w9  n8->n7   A=Bathroom  B=outside
 *     w3a n3->n7   A=Studio    B=Bathroom     w3b n7->n0   A=Studio    B=outside
 *
 * So the bathroom's four faces are w7/w8/w9 face A plus w3a face **B** — the
 * shared wall is the one that breaks the pattern, and painting its A face would
 * put the bathroom colour on the studio side of it.
 *
 * The accent wall is the one you face walking in: the front door D1 sits on w0
 * (the bottom wall) at offset 4.5, so entering looks up +y at w2, and w2's
 * studio side is face A.
 */
const BATH_PAINT = "#b3c6b7"; // Tambour 0891P "SERENE OASIS /T" — soft sage
const ACCENT_PAINT = "#9d4a43"; // Tambour 0175A "Just Terracotta"

const WALL_PAINT: Record<string, { a?: string; b?: string }> = {
  w7: { a: BATH_PAINT },
  w8: { a: BATH_PAINT },
  w9: { a: BATH_PAINT },
  w3a: { b: BATH_PAINT },
  w2: { a: ACCENT_PAINT },
};

/**
 * The hero's ceiling lights, placed rather than seeded.
 *
 * `seedRoomFixtures` drops one fixture at each room's pole of inaccessibility,
 * which is a sound default and the wrong answer here: the studio's pole is the
 * middle of the floor, where nothing is. Naming them explicitly also makes this
 * a no-op — `seedRoomFixtures` only acts when `fixtures` is `undefined`, so
 * defining the array is what turns the seeding off.
 *
 * 4400 K on all three, matching `DemoStage`'s WHITE_K, so the Lighting row opens
 * with "White" genuinely lit rather than merely looking that way.
 */
const HERO_LIGHT_K = 4400;

const HERO_FIXTURES: NonNullable<Scene["fixtures"]> = [
  // Over the kitchen run, not over the middle of the room.
  { id: "fx0", assetId: "fx:flushDisc", rotation: 0, mount: { kind: "ceiling", x: -1.2, y: -1.4 }, targetLux: FIXTURE_LUX_MAX, colorK: HERO_LIGHT_K },
  // Over the coffee table (f25, at 2.1, 0.9) — a pendant reads as a choice
  // someone made, which a second flush disc would not.
  { id: "fx1", assetId: "fx:pendant", rotation: 0, mount: { kind: "ceiling", x: 2.1, y: 0.9 }, targetLux: FIXTURE_LUX_MAX, colorK: HERO_LIGHT_K },
  // The bathroom keeps its own, near the pole it would have been seeded at.
  { id: "fx2", assetId: "fx:flushDisc", rotation: 0, mount: { kind: "ceiling", x: -3, y: 1.6 }, targetLux: FIXTURE_LUX_MAX, colorK: HERO_LIGHT_K },
];

/**
 * The hero scene as it is actually shown: lights placed, floors laid, walls
 * painted, frame colour applied.
 *
 * One function, two callers — the hero itself and the editor's furnishing
 * route. Dressing it in each place separately is how the thing Dan furnishes
 * stops being the thing the hero renders.
 */
export function heroDressedScene(): Scene {
  const painted = demoScene.walls.map((w) => {
    const p = WALL_PAINT[w.id];
    return p ? { ...w, ...(p.a ? { paintA: p.a } : {}), ...(p.b ? { paintB: p.b } : {}) } : w;
  });
  const rooms = demoScene.rooms.map((r) => ({
    ...r,
    floor: r.id === HERO_BATH_ROOM_ID ? HERO_BATH_FLOOR : HERO_FLOOR,
  }));
  return frameColorPatch(
    { ...demoScene, walls: painted, rooms, fixtures: HERO_FIXTURES },
    HERO_FRAME,
  );
}
