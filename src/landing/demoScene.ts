import type { Scene } from "@/schema/scene";
import { DEFAULT_THICKNESS } from "@/schema/constants";

// -----------------------------------------------------------------------------
// The marketing hero's furnished studio — a small, believable one-room
// apartment a visitor can orbit and re-furnish without signing in.
//
// A doll's-house model, not a floorplan: one rectangular room, 6m x 5m, axis-
// aligned for readability (same convention as src/schema/sampleScene.ts).
// Every `assetId` below is a real BlenderKit model — verified against
// data/furniture-blenderkit.catalog.json and public/furniture/blenderkit/opt/
// (see the landing-page build report for the exact check run).
//
//   y
//   5  n3 ------------------------- n2      (window B, centered ~x3.1-4.3,
//      |      sofa + coffee table    |        over the sofa)
//      |      + armchair             |
//   3  |                        cabinet  <- window A (right wall, y1.9-3.1)
//      | bed                         |
//      | + nightstand      dining    stove
//   0  n0 ------------------------- n1
//      0          (door, x4.05-4.95) 6      x
//
// Loop: n0 -> n1 -> n2 -> n3 -> (n0)

const t = DEFAULT_THICKNESS;

export const demoScene: Scene = {
  schemaVersion: 2,
  units: "meters",
  nodes: [
    { id: "n0", x: 0, y: 0 },
    { id: "n1", x: 6, y: 0 },
    { id: "n2", x: 6, y: 5 },
    { id: "n3", x: 0, y: 5 },
  ],
  walls: [
    { id: "w0", a: "n0", b: "n1", thickness: t }, // bottom — has the door
    { id: "w1", a: "n1", b: "n2", thickness: t }, // right — has window A
    { id: "w2", a: "n2", b: "n3", thickness: t }, // top — has window B, behind the sofa
    { id: "w3", a: "n3", b: "n0", thickness: t }, // left — blank, bed backs onto it
  ],
  openings: [
    {
      id: "o0",
      type: "door",
      wallId: "w0",
      offset: 4.5, // near the kitchenette/dining corner, clear of the bed
      width: 0.9,
      height: 2.0,
      sill: 0,
    },
    {
      id: "o1",
      type: "window",
      wallId: "w1",
      offset: 2.5, // right wall, above the storage cabinet
      width: 1.2,
      height: 1.2,
      sill: 0.9,
    },
    {
      id: "o2",
      type: "window",
      wallId: "w2",
      offset: 2.3, // top wall, over the sofa
      width: 1.2,
      height: 1.2,
      sill: 0.9,
    },
  ],
  rooms: [
    {
      id: "r0",
      name: "Studio",
      loop: ["n0", "n1", "n2", "n3"],
    },
  ],
  // 11 pieces — sleeping, living, dining and a kitchenette corner, so the
  // studio reads as a lived-in home rather than a showroom.
  furniture: [
    // Sleep nook — back against the left (blank) wall.
    { id: "f0", assetId: "blenderkit:3a845132-df64-4f02-8da6-44229fe774e4", x: 1.17, y: 1.5, rotation: Math.PI / 2 }, // Master bed
    { id: "f1", assetId: "blenderkit:9c201695-6847-410f-89df-7cdc0ec14f23", x: 0.31, y: 2.78, rotation: Math.PI / 2 }, // Painted Wooden Nightstand

    // Living area — back against the top wall, under window B.
    { id: "f2", assetId: "blenderkit:d19dd7b1-6573-41c7-b12c-b3eccdb7047d", x: 3.2, y: 4.40, rotation: Math.PI }, // Cotton Mini Sofa — y leaves headroom for the deepest swap option (Leather Sofa, d=1.004m)
    { id: "f3", assetId: "blenderkit:4db96473-72ed-4947-80d8-af6dc1c4dee8", x: 3.2, y: 3.17, rotation: 0 }, // Coffee Table
    { id: "f4", assetId: "blenderkit:6122afb7-3fb5-441e-9fa3-f57de7ebed93", x: 1.75, y: 3.0, rotation: Math.PI / 2 }, // Ikea Onnestad Red Armchair
    { id: "f5", assetId: "blenderkit:cd259516-4f81-48a5-9097-77789637cbf4", x: 5.3, y: 4.3, rotation: 0 }, // ÅRSTID Floor lamp

    // Right wall — storage under window A, kitchenette stove below it.
    { id: "f6", assetId: "blenderkit:30a3d1c5-6554-42fd-a8d0-a1efdff162b3", x: 5.64, y: 2.5, rotation: -Math.PI / 2 }, // Painted Wooden Cabinet
    { id: "f7", assetId: "blenderkit:76e31f48-a0f7-4854-868a-c2f692b68f67", x: 5.62, y: 0.6, rotation: -Math.PI / 2 }, // Electric Stove

    // Small dining nook, clear of the door swing.
    { id: "f8", assetId: "blenderkit:4fd0b237-9527-45d5-b82a-4cfec427f673", x: 3.0, y: 1.1, rotation: 0 }, // Round Wooden Table 02
    { id: "f9", assetId: "blenderkit:0d05c301-90b9-469a-8d52-91f9e9010244", x: 3.0, y: 0.35, rotation: 0 }, // Wooden Chair
    { id: "f10", assetId: "blenderkit:0d05c301-90b9-469a-8d52-91f9e9010244", x: 3.0, y: 1.91, rotation: Math.PI }, // Wooden Chair
  ],
};
