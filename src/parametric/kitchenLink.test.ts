// Headless: "Match run below" — a kitchenWall run LINKED to a kitchenBase
// run (Kitchen v2.2). Covers linkedRunPose's path copy + back-line offset
// (the sign that decides whether the uppers hang over the room or bury
// themselves in the wall), the sync/gesture integration points (pass 1
// deriving a linked run instead of treating it as a counter item, pass 2
// never cutting it a hole, a direct drag breaking the link), and
// nearestLinkableBase (the inspector toggle's host search).
// Run: npx tsx src/parametric/kitchenLink.test.ts

import type { FurnitureItem, Scene } from "@/schema/scene";
import {
  linkedRunPose,
  nearestLinkableBase,
  syncKitchenAttachments,
  applyKitchenGesture,
} from "./kitchenAttach";
import { sanitizeSpec, GENERATORS } from "@/parametric";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

/** A 4×3 room, same fixture kitchenDrag.test.ts uses: wall w1 runs
 *  (0,0)→(4,0), the room is on its +y side, so a run against w1 sits at
 *  y = th/2 + d/2 and faces +y (rotation 0). */
const scene = (furniture: FurnitureItem[] = []): Scene => ({
  schemaVersion: 2,
  units: "meters",
  nodes: [
    { id: "n0", x: 0, y: 0 }, { id: "n1", x: 4, y: 0 },
    { id: "n2", x: 4, y: 3 }, { id: "n3", x: 0, y: 3 },
  ],
  walls: [
    { id: "w1", a: "n0", b: "n1", thickness: 0.1 },
    { id: "w2", a: "n1", b: "n2", thickness: 0.1 },
    { id: "w3", a: "n2", b: "n3", thickness: 0.1 },
    { id: "w4", a: "n3", b: "n0", thickness: 0.1 },
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
  rotation: 0,
  parametric: sanitizeSpec({
    generator: "kitchenBase",
    dims: { w: 2.4, d: 0.6, h: 0.84 },
    modules: { drawerUnits: 1 },
    front: "slab", handle: "bar", finish: "painted", finish2: "counter-oak",
  }),
  ...over,
});

/** Unlinked by default (no `attach`) — every test below links it explicitly,
 *  so a case that forgets to link can't pass by accident. */
const wallRun = (over: Partial<FurnitureItem> = {}): FurnitureItem => ({
  id: "wrun1",
  assetId: "param:kitchenWall",
  // Deliberately NOT at the pose a link would derive (2, 0.21, 0) — several
  // cases below check that syncKitchenAttachments actually MOVES it there,
  // which a test that starts it already correct couldn't distinguish from
  // "did nothing".
  x: 0.5,
  y: 1.4,
  rotation: 1.9,
  elevation: 1.45,
  parametric: sanitizeSpec(GENERATORS.kitchenWall.defaultSpec),
  ...over,
});

const linked = (host: FurnitureItem, wall: FurnitureItem = wallRun()): FurnitureItem => ({
  ...wall,
  attach: { hostId: host.id, along: 0 },
});

// ---------------------------------------------------------------------------
console.log("\nlinkedRunPose: back lines coincide (the sign check)");
{
  // Known-good answer, not just self-consistent algebra: kitchenDrag.test.ts's
  // own wallRun() fixture independently hardcodes y=0.21 as "th/2 + d/2 =
  // 0.05 + 0.16" for a wall cabinet on this exact wall — i.e. a cabinet whose
  // own back line sits flush on w1. If linkedRunPose's shift walked the wrong
  // way, this would NOT land on 0.21.
  const host = baseRun(); // d=0.6, y=0.35 (back line at wall face, y=0.05)
  const wall = wallRun(); // d=0.32
  const { x, y, rotation } = linkedRunPose(host, wall.parametric!);
  check("linked wall run lands at the independently-known-correct y=0.21",
    Math.abs(y - 0.21) < 1e-9, `y=${y}`);
  check("x and rotation are untouched (host is a straight run along +x)",
    Math.abs(x - host.x) < 1e-9 && rotation === host.rotation, `x=${x} rotation=${rotation}`);

  // General numeric proof, independent of the fixture: derive the world
  // BACK-LINE point of each run (local z = -d/2, per pathLegs/runLocalToWorld)
  // and check they coincide, for a run at an arbitrary non-axis-aligned pose.
  const rot = 0.7; // radians — not a multiple of 90°, so an axis mix-up shows
  const hostAt = { ...baseRun(), x: -1.3, y: 4.2, rotation: rot };
  const wallSpec = wallRun().parametric!;
  const { x: wx, y: wy, rotation: wr } = linkedRunPose(hostAt, wallSpec);
  const nx = -Math.sin(rot);
  const ny = Math.cos(rot);
  const hostBack = { x: hostAt.x + nx * -(hostAt.parametric!.dims.d / 2), y: hostAt.y + ny * -(hostAt.parametric!.dims.d / 2) };
  const wallBack = { x: wx + nx * -(wallSpec.dims.d / 2), y: wy + ny * -(wallSpec.dims.d / 2) };
  check("back lines coincide at an arbitrary rotation",
    Math.abs(hostBack.x - wallBack.x) < 1e-9 && Math.abs(hostBack.y - wallBack.y) < 1e-9,
    `host back (${hostBack.x.toFixed(4)},${hostBack.y.toFixed(4)}) vs wall back (${wallBack.x.toFixed(4)},${wallBack.y.toFixed(4)})`);
  check("rotation is copied unchanged", wr === rot, `${wr}`);

  // Prove the check bites: the OPPOSITE sign (a plausible typo) does NOT
  // coincide the back lines for this host/wall pair, so the assertion above
  // is not vacuously true for any offset.
  const wrongShift = (hostAt.parametric!.dims.d - wallSpec.dims.d) / 2; // sign flipped
  const wrongX = hostAt.x + nx * wrongShift;
  const wrongY = hostAt.y + ny * wrongShift;
  const wrongBack = { x: wrongX + nx * -(wallSpec.dims.d / 2), y: wrongY + ny * -(wallSpec.dims.d / 2) };
  check("…and the sign genuinely matters: the flipped-sign shift misses",
    Math.abs(hostBack.x - wrongBack.x) > 0.05 || Math.abs(hostBack.y - wrongBack.y) > 0.05);
}

// ---------------------------------------------------------------------------
console.log("\nlinkedRunPose: copies the host's path, keeps its own d/h/elevation");
{
  const host = baseRun({
    parametric: sanitizeSpec({
      ...baseRun().parametric!,
      extraLegs: [{ turn: 1, w: 1.8 }],
    }),
  });
  const wall = wallRun();
  const { spec } = linkedRunPose(host, wall.parametric!);
  check("width copied from host", spec.dims.w === host.parametric!.dims.w, `${spec.dims.w}`);
  check("extraLegs copied from host", JSON.stringify(spec.extraLegs) === JSON.stringify(host.parametric!.extraLegs),
    `${JSON.stringify(spec.extraLegs)}`);
  check("depth stays the wall run's OWN (shallower than the host)",
    spec.dims.d === wall.parametric!.dims.d && spec.dims.d !== host.parametric!.dims.d, `${spec.dims.d}`);
  check("height stays the wall run's OWN", spec.dims.h === wall.parametric!.dims.h, `${spec.dims.h}`);

  // A host wider than kitchenWall's own dimLimits.w must not hand the wall
  // run a spec its OWN generator would reject.
  const wide = baseRun({ parametric: sanitizeSpec({ ...baseRun().parametric!, dims: { ...baseRun().parametric!.dims, w: 5.5 } }) });
  const { spec: clampedSpec } = linkedRunPose(wide, wall.parametric!);
  check("width copied from an over-wide host is clamped to kitchenWall's own limit",
    clampedSpec.dims.w <= GENERATORS.kitchenWall.dimLimits.w[1] + 1e-9, `${clampedSpec.dims.w}`);
}

// ---------------------------------------------------------------------------
console.log("\nsyncKitchenAttachments pass 1: a linked run derives, not attaches-as-counter-item");
{
  const host = baseRun();
  const sc = syncKitchenAttachments(scene([host, linked(host)]));
  const wall = sc.furniture.find((f) => f.id === "wrun1")!;
  check("linked run moved onto the host's derived pose",
    Math.abs(wall.x - 2) < 1e-9 && Math.abs(wall.y - 0.21) < 1e-9 && wall.rotation === 0,
    `x=${wall.x} y=${wall.y} rotation=${wall.rotation}`);
  check("width tracks the host's width", wall.parametric!.dims.w === host.parametric!.dims.w);
  check("elevation is untouched (not re-derived like a counter item's would be)",
    wall.elevation === 1.45, `${wall.elevation}`);
  check("attach survives the sync (still linked)", wall.attach?.hostId === host.id);

  // Idempotent: a second sync on an already-correct scene changes nothing —
  // this is what "referentially lazy" promises, and it also proves the first
  // sync actually reached a fixed point rather than oscillating.
  const twice = syncKitchenAttachments(sc);
  check("a second sync is a no-op (same object identity)", twice === sc);
}

// ---------------------------------------------------------------------------
console.log("\nmoving the host carries the linked run");
{
  const host = baseRun();
  const prev = scene([host, linked(host)]);
  const dragged: Scene = {
    ...prev,
    furniture: prev.furniture.map((f) => (f.id === "run1" ? { ...f, x: 3 } : f)),
  };
  const after = applyKitchenGesture(dragged, prev);
  const host2 = after.furniture.find((f) => f.id === "run1")!;
  const wall = after.furniture.find((f) => f.id === "wrun1")!;
  // Compare against wherever the host's own wall-snap actually put it, not a
  // hand-derived literal — the host's snap clamps its centre to the wall
  // span (a 2.4m run centred at x=3 would hang its far end past a 4m wall),
  // so the exact landing x is solveRunWall's business, not this test's.
  check("host actually moved (the drag had an effect)", host2.x > host.x + 0.1, `${host2.x}`);
  check("linked run followed the host's ACTUAL new x", Math.abs(wall.x - host2.x) < 1e-9,
    `wall.x=${wall.x} host.x=${host2.x}`);
  check("still flush to the same wall", Math.abs(wall.y - 0.21) < 1e-9, `y=${wall.y}`);
  check("still linked", !!wall.attach);
}

// ---------------------------------------------------------------------------
console.log("\nresizing the host carries the linked run");
{
  const host = baseRun();
  const prev = scene([host, linked(host)]);
  const grown: Scene = {
    ...prev,
    furniture: prev.furniture.map((f) =>
      f.id === "run1" ? { ...f, parametric: { ...f.parametric!, dims: { ...f.parametric!.dims, w: 3.6 } } } : f,
    ),
  };
  const after = applyKitchenGesture(grown, prev);
  const wall = after.furniture.find((f) => f.id === "wrun1")!;
  check("linked run's width grew with the host's", wall.parametric!.dims.w === 3.6, `${wall.parametric!.dims.w}`);
}

// ---------------------------------------------------------------------------
console.log("\nunlink leaves the run exactly where it currently is, free");
{
  const host = baseRun();
  const sc = syncKitchenAttachments(scene([host, linked(host)]));
  const before = sc.furniture.find((f) => f.id === "wrun1")!;
  const { attach: _a, ...freed } = before;
  const unlinked = syncKitchenAttachments({
    ...sc,
    furniture: sc.furniture.map((f) => (f.id === "wrun1" ? freed : f)),
  });
  const after = unlinked.furniture.find((f) => f.id === "wrun1")!;
  check("no attach", !after.attach);
  check("pose unchanged", after.x === before.x && after.y === before.y && after.rotation === before.rotation,
    `(${after.x},${after.y},${after.rotation}) vs (${before.x},${before.y},${before.rotation})`);
  check("spec unchanged", after.parametric!.dims.w === before.parametric!.dims.w);

  // And now free, moving the host must NOT drag it any more.
  const hostMoved: Scene = {
    ...unlinked,
    furniture: unlinked.furniture.map((f) => (f.id === "run1" ? { ...f, x: f.x + 1 } : f)),
  };
  const afterHostMove = applyKitchenGesture(hostMoved, unlinked).furniture.find((f) => f.id === "wrun1")!;
  check("free run does not follow the host anymore",
    Math.abs(afterHostMove.x - after.x) < 1e-9, `${afterHostMove.x} vs ${after.x}`);
}

// ---------------------------------------------------------------------------
console.log("\na linked run cuts no hole in the worktop");
{
  const host = baseRun();
  const sc = syncKitchenAttachments(scene([host, linked(host)]));
  const run = sc.furniture.find((f) => f.id === "run1")!;
  check("host gained no cutouts from its linked wall run",
    !run.parametric!.cutouts || run.parametric!.cutouts.length === 0,
    `${JSON.stringify(run.parametric!.cutouts)}`);

  // Positive control: a real counter item on the SAME host DOES cut, so the
  // check above is proof of a real exemption, not of cutouts being broken.
  const sink: FurnitureItem = {
    id: "sink1", assetId: "param:sink", x: 0, y: 0, rotation: 0,
    parametric: sanitizeSpec(GENERATORS.sink.defaultSpec),
    attach: { hostId: "run1", along: 1.2 },
  };
  const withSink = syncKitchenAttachments(scene([host, linked(host), sink]));
  const run2 = withSink.furniture.find((f) => f.id === "run1")!;
  check("…while a real counter item on the same host does cut one",
    run2.parametric!.cutouts?.length === 1, `${JSON.stringify(run2.parametric!.cutouts)}`);
}

// ---------------------------------------------------------------------------
console.log("\ndragging a linked run directly breaks the link");
{
  const host = baseRun();
  const prev = scene([host, linked(host)]);
  const synced = syncKitchenAttachments(prev); // settle to the derived pose first
  const linkedWall = synced.furniture.find((f) => f.id === "wrun1")!;
  check("setup: it starts linked", !!linkedWall.attach);

  // The user grabs the wall run itself and drags it a few cm — host is
  // untouched (same reference), only the wall run gets a new one.
  const dragged: Scene = {
    ...synced,
    furniture: synced.furniture.map((f) => (f.id === "wrun1" ? { ...f, y: f.y + 0.05 } : f)),
  };
  const after = applyKitchenGesture(dragged, synced);
  const wall = after.furniture.find((f) => f.id === "wrun1")!;
  check("the link is broken", !wall.attach);

  // And, freed, it no longer follows the host.
  const hostMoved: Scene = {
    ...after,
    furniture: after.furniture.map((f) => (f.id === "run1" ? { ...f, x: f.x + 1 } : f)),
  };
  const afterHostMove = applyKitchenGesture(hostMoved, after).furniture.find((f) => f.id === "wrun1")!;
  check("…and moving the host afterward does not drag it back",
    Math.abs(afterHostMove.x - wall.x) < 1e-9, `${afterHostMove.x} vs ${wall.x}`);
}

// ---------------------------------------------------------------------------
console.log("\nnearestLinkableBase: the inspector toggle's host search");
{
  const host = baseRun();
  const near = wallRun({ x: 2, y: 0.21, rotation: 0 }); // already on host's wall/face
  const found = nearestLinkableBase(near, scene([host, near]));
  check("finds the base run on the same wall/face", found?.id === host.id, `${found?.id}`);

  const farAway = wallRun({ x: 2, y: 2.5, rotation: Math.PI }); // facing the opposite wall
  check("nothing offered when no base run qualifies",
    nearestLinkableBase(farAway, scene([host, farAway])) === null);

  // A second base run that ALSO qualifies (within BACK_TOL) but sits further
  // off-wall than `host` does — and is listed FIRST, so a pass that returned
  // "the first match" instead of "the nearest match" would get this wrong.
  const host2 = baseRun({ id: "run2", x: 2, y: 0.65, rotation: 0 }); // back line 0.35, dist 0.30
  const twoHosts = scene([host2, host, near]); // host's own back line is 0.05, dist 0 — nearer
  check("nearest (by perpendicular offset) wins over a farther match listed first",
    nearestLinkableBase(near, twoHosts)?.id === host.id, `${nearestLinkableBase(near, twoHosts)?.id}`);
}

console.log(failures === 0 ? "\nall kitchen link checks passed" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
