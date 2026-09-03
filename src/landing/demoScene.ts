import type { Scene } from "@/schema/scene";
import { GENERATORS, sanitizeSpec } from "@/parametric";
import { seedRoomFixtures } from "@/fixtures/seedRoomFixtures";
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
//  2.5  n9 ---------- n3 ------------------------------- n2
//       |   bathroom   |          sofa + coffee table     |
//       |  vanity/wc   |                                  |
//  0.7  n8 ---------- n7                           [ W2 patio window ]
//       |              | bed                             |   2.55 m
//       |              | + nightstand      dining   cabinet
// -2.5                n0 ------------------------------- n1   stove
//                   -2.1   [ W1 ]      [ D1 ]         3.9     x
//
// Every `assetId` below is a real BlenderKit model, verified against
// data/furniture-blenderkit.catalog.json and public/furniture/blenderkit/opt/.
// The two bathroom fixtures are PARAMETRIC instead — generated in code by
// src/parametric, so they add two pieces of furniture and zero bytes of
// download. The BlenderKit catalog has no toilet or basin, and the IKEA models
// that might are served from Vercel Blob, which is excluded from the git
// deploy and has 404'd in production once already.
// -----------------------------------------------------------------------------

/** A parametric fixture at its generator's own defaults, placed by hand. */
function fixture(
  id: string,
  generator: "toilet" | "vanity",
  x: number,
  y: number,
  rotation: number,
) {
  return {
    id,
    assetId: `param:${generator}`,
    x,
    y,
    rotation,
    parametric: sanitizeSpec(GENERATORS[generator].defaultSpec),
  };
}

export const demoScene: Scene = {
  schemaVersion: 2,
  units: "meters",
  nodes: HERO_NODES,
  walls: heroWalls(),
  openings: heroOpenings(),
  rooms: HERO_ROOMS,
  // 13 pieces — sleeping, living, dining, a kitchenette corner and a bathroom,
  // so the home reads as lived-in rather than as a showroom.
  furniture: [
    // Sleep nook — back against the left wall, below the bathroom.
    { id: "f0", assetId: "blenderkit:3a845132-df64-4f02-8da6-44229fe774e4", x: -0.93, y: -1, rotation: Math.PI / 2 }, // Master bed
    { id: "f1", assetId: "blenderkit:9c201695-6847-410f-89df-7cdc0ec14f23", x: -1.79, y: 0.28, rotation: Math.PI / 2 }, // Painted Wooden Nightstand

    // Living area — back against the top wall, under window W3.
    { id: "f2", assetId: "blenderkit:d19dd7b1-6573-41c7-b12c-b3eccdb7047d", x: 1.1, y: 1.9, rotation: Math.PI }, // Cotton Mini Sofa — y leaves headroom for the deepest swap option (Leather Sofa, d=1.004m)
    { id: "f3", assetId: "blenderkit:4db96473-72ed-4947-80d8-af6dc1c4dee8", x: 1.1, y: 0.67, rotation: 0 }, // Coffee Table
    { id: "f4", assetId: "blenderkit:6122afb7-3fb5-441e-9fa3-f57de7ebed93", x: -0.35, y: 0.5, rotation: Math.PI / 2 }, // Ikea Onnestad Red Armchair
    // Floor lamp — now stands IN FRONT of the patio glazing rather than beside
    // a blank wall, which is where a floor lamp actually goes.
    { id: "f5", assetId: "blenderkit:cd259516-4f81-48a5-9097-77789637cbf4", x: 3.2, y: 1.8, rotation: 0 }, // ÅRSTID Floor lamp

    // Right wall. The cabinet MOVED from y 2.50 to y 1.55: the patio window
    // spans y 2.18-4.73 down to a 0.10 m sill, so its old spot is now glass.
    // It lost nothing by moving — it was placed under the small window that
    // the patio unit replaced, and y 1.55 is the only clear span left between
    // the stove and the glazing.
    { id: "f6", assetId: "blenderkit:30a3d1c5-6554-42fd-a8d0-a1efdff162b3", x: 3.54, y: -0.95, rotation: -Math.PI / 2 }, // Painted Wooden Cabinet
    { id: "f7", assetId: "blenderkit:76e31f48-a0f7-4854-868a-c2f692b68f67", x: 3.52, y: -1.9, rotation: -Math.PI / 2 }, // Electric Stove

    // Small dining nook, clear of the door swing.
    { id: "f8", assetId: "blenderkit:4fd0b237-9527-45d5-b82a-4cfec427f673", x: 0.9, y: -1.4, rotation: 0 }, // Round Wooden Table 02
    { id: "f9", assetId: "blenderkit:0d05c301-90b9-469a-8d52-91f9e9010244", x: 0.9, y: -2.15, rotation: 0 }, // Wooden Chair
    { id: "f10", assetId: "blenderkit:0d05c301-90b9-469a-8d52-91f9e9010244", x: 0.9, y: -0.59, rotation: Math.PI }, // Wooden Chair

    // Bathroom. Interior is x -1.75..-0.05, y 3.25..4.95 once wall thickness is
    // taken off. The toilet backs onto the outer wall (rotation +PI/2, the same
    // facing as the bed against the left wall); the vanity backs onto the top
    // wall (rotation PI, the same facing as the sofa). Both sit clear of the
    // bathroom door and below window W4, whose 1.20 m sill clears them.
    fixture("f11", "toilet", -3.52, 1.12, Math.PI / 2),
    fixture("f12", "vanity", -3.15, 2.22, Math.PI),
  ],
};

/** The floor and window-frame the hero opens with. Exported so the editor's
 *  `?hero=1` route dresses the scene identically — a furnishing session has to
 *  see the same room the visitor does, or the furniture is chosen against the
 *  wrong floor. DemoStage's FLOORS[0]/FRAMES[0] must stay these two values. */
export const HERO_FLOOR = "wood-oak-natural";
export const HERO_FRAME = "#EDEDEA";

/**
 * The hero scene as it is actually shown: ceiling fixtures seeded, floor and
 * frame colour applied.
 *
 * One function, two callers — the hero itself and the editor's furnishing
 * route. Dressing it in each place separately is how the thing Dan furnishes
 * stops being the thing the hero renders.
 */
export function heroDressedScene(): Scene {
  const seeded = seedRoomFixtures(demoScene);
  return frameColorPatch(
    { ...seeded, rooms: seeded.rooms.map((r) => ({ ...r, floor: HERO_FLOOR })) },
    HERO_FRAME,
  );
}
