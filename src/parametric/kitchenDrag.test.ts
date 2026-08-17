// Headless: the FEEL bugs in placing and editing kitchen cabinets — the
// far-side flip, the double snap, the wall-cabinet drag plane, and the red
// tint on a correctly placed run. Every case here is a symptom Dan reported,
// pinned so it can't come back.
// Run: npx tsx src/parametric/kitchenDrag.test.ts

import type { FurnitureItem, Scene } from "@/schema/scene";
import {
  applyKitchenGesture,
  isWallItem,
  kitchenOwnsPlacement,
  reglueKitchen,
  snapRunToWall,
} from "./kitchenAttach";
import { sanitizeSpec, GENERATORS } from "@/parametric";
import { placementCollides } from "@/viewport3d/collision";
import { squareUpScene } from "@/lib/scene/squareUp";
import { collinearSpan } from "./wallSpan";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

/** A 4×3 room. Wall w1 runs (0,0)→(4,0); the room is on its +y side, so a run
 *  against w1 sits at y = th/2 + d/2 and faces +y. */
const scene = (furniture: FurnitureItem[] = [], thickness = 0.1): Scene => ({
  schemaVersion: 2,
  units: "meters",
  nodes: [
    { id: "n0", x: 0, y: 0 }, { id: "n1", x: 4, y: 0 },
    { id: "n2", x: 4, y: 3 }, { id: "n3", x: 0, y: 3 },
  ],
  walls: [
    { id: "w1", a: "n0", b: "n1", thickness },
    { id: "w2", a: "n1", b: "n2", thickness },
    { id: "w3", a: "n2", b: "n3", thickness },
    { id: "w4", a: "n3", b: "n0", thickness },
  ],
  openings: [],
  rooms: [],
  furniture,
} as unknown as Scene);

const baseRun = (over: Partial<FurnitureItem> = {}): FurnitureItem => ({
  id: "run1",
  assetId: "param:kitchenBase",
  x: 2,
  y: 0.35, // th/2 + d/2 = 0.05 + 0.30
  rotation: 0, // normal +y, facing into the room
  parametric: sanitizeSpec({
    generator: "kitchenBase",
    dims: { w: 2.4, d: 0.6, h: 0.84 },
    modules: { drawerUnits: 1 },
    front: "slab", handle: "bar", finish: "painted", finish2: "counter-oak",
  }),
  ...over,
});

const wallRun = (over: Partial<FurnitureItem> = {}): FurnitureItem => ({
  id: "wrun1",
  assetId: "param:kitchenWall",
  x: 2,
  y: 0.21, // th/2 + d/2 = 0.05 + 0.16
  rotation: 0,
  elevation: 1.45,
  parametric: sanitizeSpec(GENERATORS.kitchenWall.defaultSpec),
  ...over,
});

/** Which side of w1 an item sits on: +1 is the room, -1 is outdoors. */
const sideOf = (f: { y: number }) => Math.sign(f.y);

// ---------------------------------------------------------------------------
console.log("\na dragged run does not pop through to the other side of the wall");
{
  // The gesture: the pointer pushes the run INTO the wall, carrying its centre
  // past the centreline — a few centimetres of over-drag, which is what
  // happens every time you shove a run back to make sure it's seated.
  const before = baseRun();
  const prev = scene([before]);
  // The face only changes once the pointer is as far out as hanging the run on
  // the FAR face would put it — th/2 + d/2, less a little slack. Everything
  // short of that is over-drag and must be held.
  const FLIP_AT = 0.05 + 0.3 - 0.005;
  for (const overshoot of [0.01, 0.05, 0.2, FLIP_AT - 0.005]) {
    const dragged = { ...before, y: -overshoot };
    const out = applyKitchenGesture(scene([dragged]), prev);
    const after = out.furniture[0];
    check(
      `over-dragged ${(overshoot * 100).toFixed(0)}cm into the wall: stays in the room`,
      sideOf(after) === 1 && Math.abs(after.rotation - before.rotation) < 1e-9,
      `y=${after.y.toFixed(3)} rotation=${after.rotation.toFixed(3)}`,
    );
    check(
      `over-dragged ${(overshoot * 100).toFixed(0)}cm into the wall: comes back flush`,
      Math.abs(after.y - 0.35) < 1e-9,
      `y=${after.y.toFixed(4)}`,
    );
  }
  // …and past it, the flip is what you asked for. Held and released, so the
  // guard above can't be satisfied by simply refusing to ever change face.
  const past = applyKitchenGesture(scene([{ ...before, y: -(FLIP_AT + 0.02) }]), prev).furniture[0];
  check("past the threshold the face does change", sideOf(past) === -1, `y=${past.y.toFixed(3)}`);
}

{
  // The mechanism, isolated: without `keepFacing` the same input flips. This is
  // what the old code passed, so the case above is a real regression guard and
  // not a tautology.
  const f = { ...baseRun(), y: -0.05 };
  const sc = scene([f]);
  const naive = snapRunToWall(f, sc)!;
  const sticky = snapRunToWall(f, sc, { keepFacing: f.rotation })!;
  check("without keepFacing the run DOES flip (the bug being fixed)", naive.y < 0,
    `y=${naive.y.toFixed(3)}`);
  check("with keepFacing it does not", sticky.y > 0, `y=${sticky.y.toFixed(3)}`);
}

{
  // But a deliberate move to the far face must still work — hysteresis is not
  // a lock. Pointing well outside the building is unambiguous.
  const f = { ...baseRun(), y: -0.9 };
  const sticky = snapRunToWall(f, scene([f]), { keepFacing: 0 })!;
  check("a clear move to the outside face is still allowed", sticky.y < 0,
    `y=${sticky.y.toFixed(3)}`);
}

// ---------------------------------------------------------------------------
console.log("\na correctly placed run is not reported as colliding");
{
  const run = baseRun();
  const sc = scene([run]);
  const snapped = snapRunToWall(run, sc, { keepFacing: run.rotation })!;
  const seated = { ...run, ...snapped };
  check("flush against the wall is not a collision",
    !placementCollides(seated, scene([seated])));
  // And a real overlap still is — the epsilon must not blind the test.
  check("a run buried 10cm in the wall still collides",
    placementCollides({ ...seated, y: seated.y - 0.1 }, scene([{ ...seated, y: seated.y - 0.1 }])));
}

// ---------------------------------------------------------------------------
console.log("\nthe kitchen owns its own placement");
{
  check("a wall cabinet is a wall item (so it drags on the WALL, not the floor)",
    isWallItem(wallRun()));
  check("a base run is kitchen-owned", kitchenOwnsPlacement(baseRun()));
  check("a wall cabinet is kitchen-owned", kitchenOwnsPlacement(wallRun()));
  check("a sink is kitchen-owned", kitchenOwnsPlacement({
    parametric: sanitizeSpec(GENERATORS.sink.defaultSpec),
  }));
  check("a plain catalog item is NOT kitchen-owned", !kitchenOwnsPlacement({}));
}

// ---------------------------------------------------------------------------
console.log("\nsquaring up carries the kitchen with it");
{
  // Wall w1 traced 1.5° out. The run was glued to it as drawn; after the
  // square-up it must be flush to where the wall now is, on the same side.
  const bent = scene([baseRun()]);
  bent.nodes = bent.nodes.map((n) => (n.id === "n1" ? { ...n, y: -0.105 } : n)); // 4m at ~1.5°
  const run = snapRunToWall(bent.furniture[0], bent, { keepFacing: 0 })!;
  const glued = { ...bent, furniture: [{ ...bent.furniture[0], ...run }] };

  const { scene: squared, report } = squareUpScene(glued);
  check("the bent wall was straightened", report.straightened >= 1, `${report.straightened}`);

  const after = reglueKitchen(squared).furniture[0];
  const n0 = squared.nodes.find((n) => n.id === "n0")!;
  const n1 = squared.nodes.find((n) => n.id === "n1")!;
  const L = Math.hypot(n1.x - n0.x, n1.y - n0.y);
  const ux = (n1.x - n0.x) / L;
  const uy = (n1.y - n0.y) / L;
  const lat = (after.x - n0.x) * -uy + (after.y - n0.y) * ux; // signed distance off w1
  check("the run is flush to the wall's new line", Math.abs(Math.abs(lat) - 0.35) < 1e-9,
    `off-wall ${lat.toFixed(4)}m, want ±0.35`);
  check("and still on the room side", sideOf(after) === 1, `y=${after.y.toFixed(3)}`);
}

// ---------------------------------------------------------------------------
console.log("\na straight wall made of several segments drags as ONE wall");
{
  // The south wall of an 8×5 room. `split` mints a node halfway along it —
  // exactly what the tracer does wherever an interior wall tees in, or
  // wherever the user happened to click an extra point.
  const room = (furniture: FurnitureItem[], split: boolean): Scene => ({
    schemaVersion: 2, units: "meters",
    nodes: [
      { id: "n0", x: 0, y: 0 }, { id: "nm", x: 4, y: 0 }, { id: "n1", x: 8, y: 0 },
      { id: "n2", x: 8, y: 5 }, { id: "n3", x: 0, y: 5 },
    ],
    walls: [
      ...(split
        ? [{ id: "wA", a: "n0", b: "nm", thickness: 0.1 }, { id: "wB", a: "nm", b: "n1", thickness: 0.1 }]
        : [{ id: "wA", a: "n0", b: "n1", thickness: 0.1 }]),
      { id: "w2", a: "n1", b: "n2", thickness: 0.1 },
      { id: "w3", a: "n2", b: "n3", thickness: 0.1 },
      { id: "w4", a: "n3", b: "n0", thickness: 0.1 },
    ],
    openings: [], rooms: [], furniture,
  } as unknown as Scene);

  /** Drag the run from x=2 rightwards, one 0.5m step at a time, and record
   *  where it actually ends up. */
  const sweep = (split: boolean): number[] => {
    const out: number[] = [];
    let cur = baseRun();
    let prev = room([cur], split);
    for (let cx = 2; cx <= 7.5; cx += 0.5) {
      const next = applyKitchenGesture(room([{ ...cur, x: cx, y: 0.35 }], split), prev);
      cur = next.furniture[0];
      prev = next;
      out.push(cur.x);
    }
    return out;
  };

  const one = sweep(false);
  const two = sweep(true);
  check("splitting a wall in two changes nothing about the drag",
    one.every((v, i) => Math.abs(v - two[i]) < 1e-9),
    `one=[${one.map((v) => v.toFixed(2))}] two=[${two.map((v) => v.toFixed(2))}]`);

  // No dead zone: every step of the cursor moves the run, until it reaches the
  // real end of the wall. Before the fix the split wall stalled for 1.2m at
  // the first segment's limit and then teleported 2.4m to the second's.
  let stalls = 0;
  let jumps = 0;
  for (let i = 1; i < two.length; i++) {
    const d = two[i] - two[i - 1];
    if (Math.abs(d) < 1e-9 && two[i] < 6.7) stalls++;
    if (d > 0.55) jumps++;
  }
  check("no dead zone part-way along the wall", stalls === 0, `${stalls} stalled steps`);
  check("no teleport across the joint", jumps === 0, `${jumps} jumps`);
  check("it does still stop at the real end of the wall",
    Math.abs(two[two.length - 1] - 6.75) < 1e-9, `${two[two.length - 1].toFixed(3)}`);
}

console.log("\nthe span ends where the SURFACE ends, not at every node");
{
  const wallsOf = (extra: { id: string; a: string; b: string }[]): Scene => ({
    schemaVersion: 2, units: "meters",
    nodes: [
      { id: "n0", x: 0, y: 0 }, { id: "nm", x: 4, y: 0 }, { id: "n1", x: 8, y: 0 },
      { id: "near", x: 4, y: 3 },   // tees in on the run's side (+y)
      { id: "far", x: 4, y: -3 },   // tees in on the far side
    ],
    walls: [
      { id: "wA", a: "n0", b: "nm", thickness: 0.1 },
      { id: "wB", a: "nm", b: "n1", thickness: 0.1 },
      ...extra.map((e) => ({ ...e, thickness: 0.2 })),
    ],
    openings: [], rooms: [], furniture: [],
  } as unknown as Scene);

  const seed = (sc: Scene) => sc.walls.find((w) => w.id === "wA")!;
  const plain = collinearSpan(wallsOf([]), seed(wallsOf([])), 0, 1);
  check("two collinear segments read as one 8m surface",
    Math.abs(plain.lo) < 1e-9 && Math.abs(plain.hi - 8) < 1e-9,
    `[${plain.lo.toFixed(3)}, ${plain.hi.toFixed(3)}]`);

  const farScene = wallsOf([{ id: "wf", a: "nm", b: "far" }]);
  const far = collinearSpan(farScene, seed(farScene), 0, 1);
  check("a wall teeing in on the FAR side does not break the surface",
    Math.abs(far.hi - 8) < 1e-9, `hi=${far.hi.toFixed(3)}`);

  const nearScene = wallsOf([{ id: "wn", a: "nm", b: "near" }]);
  const near = collinearSpan(nearScene, seed(nearScene), 0, 1);
  check("a wall turning in ON the run's side ends the surface at its face",
    Math.abs(near.hi - 3.9) < 1e-9, `hi=${near.hi.toFixed(3)}, want 3.9 (4 - 0.2/2)`);
}

console.log(failures === 0 ? "\nall kitchen drag checks passed" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
