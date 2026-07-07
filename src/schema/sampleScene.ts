import type { Scene } from "./scene";
import { WALL_HEIGHT, DEFAULT_THICKNESS } from "./constants";

// Hand-written M1 scene: an L-shaped room (non-convex, exercises floor
// triangulation) with one door gap and one window gap. The geometry code is
// angle-agnostic; this sample is axis-aligned for readability, but nothing
// assumes 90° — the real angled test comes with the uploaded plan in M2+.
//
//   y
//   5  n4 ------------- n5
//      |                |
//   3  |        n2 ---- n3
//      |        |
//      | (door) |
//   0  n0 ------ n1
//      0        3       5  x
//
// Loop: n0 -> n1 -> n2 -> n3 -> n4 -> n5 -> (n0)

const t = DEFAULT_THICKNESS;

export const sampleScene: Scene = {
  schemaVersion: 2,
  units: "meters",
  nodes: [
    { id: "n0", x: 0, y: 0 },
    { id: "n1", x: 5, y: 0 },
    { id: "n2", x: 5, y: 3 },
    { id: "n3", x: 3, y: 3 },
    { id: "n4", x: 3, y: 5 },
    { id: "n5", x: 0, y: 5 },
    // Balcony platform above the top wall (n4-n5), fenced by rails.
    { id: "n6", x: 0, y: 7 },
    { id: "n7", x: 3, y: 7 },
  ],
  walls: [
    { id: "w0", a: "n0", b: "n1", thickness: t }, // bottom (has door)
    { id: "w1", a: "n1", b: "n2", thickness: t }, // right lower
    { id: "w2", a: "n2", b: "n3", thickness: t }, // inner horizontal (notch)
    { id: "w3", a: "n3", b: "n4", thickness: t }, // inner vertical (notch)
    { id: "w4", a: "n4", b: "n5", thickness: t }, // top (building edge / balcony back)
    { id: "w5", a: "n5", b: "n0", thickness: t }, // left (has window)
    // Balcony railings: low, see-through barriers on the three open sides.
    { id: "r0w", a: "n5", b: "n6", thickness: t, kind: "rail" }, // left rail
    { id: "r1w", a: "n6", b: "n7", thickness: t, kind: "rail" }, // front rail
    { id: "r2w", a: "n7", b: "n4", thickness: t, kind: "rail" }, // right rail
  ],
  openings: [
    {
      id: "o0",
      type: "door",
      wallId: "w0",
      offset: 2.5, // 2.5 m along bottom wall from n0
      width: 0.9,
      height: 2.0,
      sill: 0,
    },
    {
      id: "o1",
      type: "window",
      wallId: "w5",
      offset: 2.5, // 2.5 m along left wall from n5
      width: 1.2,
      height: 1.2,
      sill: 0.9,
    },
  ],
  rooms: [
    {
      id: "r0",
      name: "L-room",
      loop: ["n0", "n1", "n2", "n3", "n4", "n5"],
    },
    {
      id: "r1",
      name: "Balcony",
      loop: ["n4", "n5", "n6", "n7"], // closed by the top wall + three rails
      floor: "concrete",
    },
  ],
  // A couple of pieces so the furniture pipeline is visible out of the box.
  furniture: [
    { id: "f0", assetId: "loungeSofa", x: 1.1, y: 4.2, rotation: Math.PI },
    { id: "f1", assetId: "tableCoffee", x: 1.1, y: 3.0, rotation: 0 },
  ],
};

export const SAMPLE_WALL_HEIGHT = WALL_HEIGHT;
