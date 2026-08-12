// Headless: Kitchen v2 — run-draw chaining (L/U), the attach engine, counter
// cutouts, and the wall glue. Run: npx tsx src/parametric/kitchen.test.ts

import * as THREE from "three";
import type { FurnitureItem, Scene } from "@/schema/scene";
import { advanceChain, chainLegs, commitLegs, findNearestWall, type ChainSeg } from "./RunDrawGhost";
import {
  attachedPose,
  findHostRun,
  snapRunToWall,
  syncKitchenAttachments,
  applyKitchenGesture,
} from "./kitchenAttach";
import { pathLegs, pathLength, clampAlongToPath, legsToSpec, runLocalToWorld } from "./runPath";
import { sanitizeSpec, GENERATORS } from "@/parametric";
import { countertopWithCutouts, COUNTER_T } from "./parts";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

// A 4×3 room: walls w1 (0,0)→(4,0), w2 (4,0)→(4,3), w3 (4,3)→(0,3), w4 (0,3)→(0,0).
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
});

const WLIM = GENERATORS.kitchenBase.dimLimits.w;

const baseRun = (over: Partial<FurnitureItem> = {}): FurnitureItem => ({
  id: "run1",
  assetId: "param:kitchenBase",
  x: 2,
  y: 0.35, // back flush against w1 (th/2 + d/2 = 0.05 + 0.3)
  rotation: Math.atan2(0, 1), // wall along +x, normal +y → rotation 0
  parametric: sanitizeSpec({
    generator: "kitchenBase",
    dims: { w: 2.4, d: 0.6, h: 0.84 },
    modules: { drawerUnits: 1 },
    front: "slab", handle: "bar", finish: "painted", finish2: "counter-oak",
  }),
  ...over,
});

const sinkItem = (over: Partial<FurnitureItem> = {}): FurnitureItem => ({
  id: "sink1",
  assetId: "param:sink",
  x: 0, y: 0, rotation: 0,
  parametric: sanitizeSpec(GENERATORS.sink.defaultSpec),
  attach: { hostId: "run1", along: 1.2 },
  ...over,
});

// ---------------------------------------------------------------------------
console.log("\nrun-draw chain — straight, L, U in one drag");
{
  const sc = scene();
  const depth = 0.6;
  const hit = findNearestWall(1, 0.3, sc, depth)!;
  check("start latches to w1", hit.wall.id === "w1");
  let chain: ChainSeg[] = [{ hit, anchor: 1, dir: 0 }];

  // Straight drag along w1.
  chain = advanceChain(chain, { x: 3.0, y: 0.3 }, sc, depth);
  check("straight stays 1 leg", chain.length === 1);
  let legs = chainLegs(chain, { x: 3.0, y: 0.3 }, sc, WLIM);
  check("straight leg ~2m", Math.abs(legs[0].w - 2) < 0.06, `${legs[0].w}`);

  // Past the corner at n1 → L onto w2.
  chain = advanceChain(chain, { x: 3.9, y: 1.5 }, sc, depth);
  check("L turns onto w2", chain.length === 2 && chain[1].hit.wall.id === "w2");
  legs = chainLegs(chain, { x: 3.9, y: 1.5 }, sc, WLIM);
  // 3m to the node, less half of w2's thickness: the leg ends on w2's FACE.
  check("L leg A runs to the corner FACE", Math.abs(legs[0].w - 2.95) < 1e-9, `${legs[0].w}`);
  check("L leg B inset by depth", Math.abs(legs[1].w - 0.9) < 1e-9, `${legs[1].w}`);

  // Past the second corner at n2 → U onto w3 (endpoint projects BACKWARD on
  // w1 — the case a stateless chain cannot see).
  chain = advanceChain(chain, { x: 1.0, y: 2.7 }, sc, depth);
  check("U turns onto w3", chain.length === 3 && chain[2].hit.wall.id === "w3");
  legs = chainLegs(chain, { x: 1.0, y: 2.7 }, sc, WLIM);
  check("U has 3 legs", legs.length === 3);
  // Leg B spans w2's face from its own inset start (0.05 + 0.6) to w3's face.
  check("U leg B fixed at the face span", Math.abs(legs[1].w - 2.3) < 1e-9, `${legs[1].w}`);

  // Pull back before the second corner → un-turn to L, and the leg handed
  // back to the cursor must follow it again instead of staying full length.
  chain = advanceChain(chain, { x: 3.9, y: 1.0 }, sc, depth);
  check("retreat un-turns to L", chain.length === 2);
  check("un-turned leg is live again", chain[1].len === undefined);
  legs = chainLegs(chain, { x: 3.9, y: 1.0 }, sc, WLIM);
  check("un-turned leg follows the cursor", Math.abs(legs[1].w - 0.35) <= 0.05 + 1e-9, `${legs[1].w}`);
}

// ---------------------------------------------------------------------------
// A cursor a few centimetres round the corner used to satisfy the turn test
// AND, on the leg the turn had just created, the retreat test — so the two
// recursed into each other until the stack overflowed, killing the canvas
// mid-drag. Turning waits until the cursor clears the corner square.
console.log("\nrun-draw chain — just past a corner does not ping-pong");
{
  const sc = scene();
  const depth = 0.6;
  const hit = findNearestWall(1, 0.3, sc, depth)!;
  let chain: ChainSeg[] = [{ hit, anchor: 1, dir: 0 }];
  chain = advanceChain(chain, { x: 3.0, y: 0.3 }, sc, depth);

  for (const y of [0.3, 0.4, 0.5, 0.6, 0.65, 0.7, 0.8, 0.9, 1.0]) {
    let out: ChainSeg[] | null = null;
    let threw = "";
    try {
      out = advanceChain(chain, { x: 3.9, y }, sc, depth);
    } catch (e) {
      threw = e instanceof Error ? e.message : String(e);
    }
    check(`cursor ${y}m past the corner resolves`, !!out, threw);
    if (out) check(`  …to a sane chain at ${y}m`, out.length >= 1 && out.length <= 3, `${out.length} legs`);
  }
  // Once the cursor is genuinely along the next wall, it still turns.
  check("it still turns when the cursor clears the corner", advanceChain(chain, { x: 3.9, y: 1.5 }, sc, depth).length === 2);
}

// ---------------------------------------------------------------------------
console.log("\nthick walls — legs sit on FACES, not centerlines");
{
  const sc = scene([], 0.3); // interior 0.15..3.85 × 0.15..2.85
  const depth = 0.6;
  const hit = findNearestWall(1, 0.5, sc, depth)!;
  check("latch range measures from the face", hit?.wall.id === "w1");
  let chain: ChainSeg[] = [{ hit, anchor: 1, dir: 0 }];
  chain = advanceChain(chain, { x: 3.7, y: 1.5 }, sc, depth);
  check("L turns onto w2", chain.length === 2);
  const legs = commitLegs(chainLegs(chain, { x: 3.7, y: 1.5 }, sc, WLIM), WLIM);
  check("leg A stops at w2's face", Math.abs(legs[0].w - 2.85) < 1e-9, `${legs[0].w}`);

  // The committed item hangs leg 1 off leg 0's far end, so that end IS the
  // corner: it has to land on w2's face (x = 3.85), not its centerline (4.0),
  // or the whole second leg is buried 15cm into the wall.
  const conv = legsToSpec(legs, GENERATORS.kitchenBase.defaultSpec);
  const item = { x: conv.x, y: conv.y, rotation: conv.rotation };
  const p = pathLegs(conv.spec);
  const back1 = runLocalToWorld(item, { x: p[1].sx, z: p[1].sz });
  check("committed corner lands on w2's face", Math.abs(back1.x - 3.85) < 1e-9, `${back1.x}`);
  const back0 = runLocalToWorld(item, { x: p[0].sx, z: p[0].sz });
  check("leg A's back lands on w1's face", Math.abs(back0.y - 0.15) < 1e-9, `${back0.y}`);
  // Both legs stand the same depth off their own wall — the "one leg is
  // shallower and cuts into the wall" bug.
  const front1 = runLocalToWorld(item, { x: p[1].sx + p[1].fx * depth, z: p[1].sz });
  check("both legs are the same depth", Math.abs((3.85 - front1.x) - depth) < 1e-9, `${front1.x}`);
}

// ---------------------------------------------------------------------------
console.log("\nhover preview == what the click starts");
{
  const sc = scene();
  const depth = 0.6;
  const hit = findNearestWall(1.23, 0.3, sc, depth)!;
  // The click anchors where the hover preview drew its left edge, and the
  // run's first leg is born at the generator's minimum width — so nothing
  // moves between the preview and the first frame of the drag.
  const anchor = 1.2; // 1.23 snapped to the 10cm grid
  const seed = chainLegs([{ hit, anchor, dir: 0 }], { x: 1.2, y: 0 }, sc, WLIM);
  check("preview is one minimum-width leg", seed.length === 1 && seed[0].w === WLIM[0], `${seed[0].w}`);
  check("preview starts AT the anchor", Math.abs(seed[0].x - (anchor + WLIM[0] / 2)) < 1e-9, `${seed[0].x}`);
  const justClicked = chainLegs([{ hit, anchor, dir: 0 }], { x: 1.23, y: 0.3 }, sc, WLIM);
  check("click keeps the preview's position", Math.abs(justClicked[0].x - seed[0].x) < 1e-9, `${justClicked[0].x}`);
  check("click keeps the preview's width", justClicked[0].w === seed[0].w);
}

// ---------------------------------------------------------------------------
console.log("\nattach engine — bonded pose, cutouts, cascade");
{
  const sc = syncKitchenAttachments(scene([baseRun(), sinkItem()]));
  const sink = sc.furniture.find((f) => f.id === "sink1")!;
  const run = sc.furniture.find((f) => f.id === "run1")!;
  const pose = attachedPose(run, 1.2);
  check("sink rides the run", Math.abs(sink.x - pose.x) < 1e-9 && Math.abs(sink.y - pose.y) < 1e-9);
  check("sink sits at the counter surface", sink.elevation === 0.84, `${sink.elevation}`);
  check("sink inherits run rotation", sink.rotation === run.rotation);
  check("run gains exactly one cutout", run.parametric!.cutouts?.length === 1);
  const cut = run.parametric!.cutouts![0];
  check("cutout centered under the sink", cut.along === 1.2, `${cut.along}`);
  check("cutout smaller than the sink (rim laps it)", cut.w < GENERATORS.sink.defaultSpec.dims.w);

  // Host drags right: the wall glue clamps the run onto its wall segment
  // and the sink must ride to wherever the run actually lands.
  const dragged = {
    ...sc,
    furniture: sc.furniture.map((f) => (f.id === "run1" ? { ...f, x: f.x + 1 } : f)),
  };
  const after = applyKitchenGesture(dragged, sc);
  const run2 = after.furniture.find((f) => f.id === "run1")!;
  const sink2 = after.furniture.find((f) => f.id === "sink1")!;
  check("host drag moved the run", run2.x > run.x + 0.5, `${run2.x}`);
  check("run clamped onto its wall segment", run2.x <= 4 - 1.2 + 1e-9, `${run2.x}`);
  const expect2 = attachedPose(run2, sink2.attach!.along);
  check("host drag carries the sink", Math.abs(sink2.x - expect2.x) < 1e-9 && Math.abs(sink2.y - expect2.y) < 1e-9,
    `${sink2.x},${sink2.y} vs ${expect2.x},${expect2.y}`);

  // Host shrinks to 1m: along 1.2 must clamp inside the new counter.
  const shrunk = syncKitchenAttachments({
    ...sc,
    furniture: sc.furniture.map((f) =>
      f.id === "run1"
        ? { ...f, parametric: { ...f.parametric!, dims: { ...f.parametric!.dims, w: 1 } } }
        : f,
    ),
  });
  const sink3 = shrunk.furniture.find((f) => f.id === "sink1")!;
  const host3 = shrunk.furniture.find((f) => f.id === "run1")!;
  const clamped = clampAlongToPath(host3.parametric!, 1.2, sink3.parametric!.dims.w);
  check("resize clamps the sink onto the counter", sink3.attach!.along === clamped,
    `along=${sink3.attach!.along} vs ${clamped}`);

  // Deleting the host must not leave a floating sink (store cascades; the
  // sync at least dissolves the bond).
  const orphan = syncKitchenAttachments({
    ...sc,
    furniture: sc.furniture.filter((f) => f.id !== "run1"),
  });
  check("host gone → bond dissolves", !orphan.furniture.find((f) => f.id === "sink1")!.attach);
}

// ---------------------------------------------------------------------------
console.log("\nfindHostRun — the counter under the cursor");
{
  const sc = syncKitchenAttachments(scene([baseRun()]));
  const hit = findHostRun(1.4, 0.4, sc, 0.56);
  check("cursor over the counter finds the run", hit?.host.id === "run1");
  check("along is grid-snapped from the left edge", hit !== null && Math.abs((hit.along * 10) % 1) < 1e-6, `${hit?.along}`);
  check("nothing found in open floor", findHostRun(2, 2.2, sc, 0.56) === null);
  const edge = findHostRun(0.85, 0.4, sc, 0.56)!;
  check("near the left end clamps so the sink stays on", edge.along >= 0.28, `${edge.along}`);
}

// ---------------------------------------------------------------------------
console.log("\none-piece multi-leg runs (v2.1)");
{
  // Ghost → single item: an L along w1 then w2.
  const worldLegs = [
    { x: 2, y: 0.35, rotation: 0, w: 2.4, dir: 1 },
    { x: 3.65, y: 1.5, rotation: Math.atan2(-(-1), 0), w: 1.0, dir: 1 }, // wall w2, facing -x
  ];
  const conv = legsToSpec(worldLegs, GENERATORS.kitchenBase.defaultSpec);
  check("L converts to ONE spec with one extra leg", conv.spec.extraLegs?.length === 1);
  check("pose comes from leg 0", conv.x === 2 && conv.y === 0.35 && conv.rotation === 0);

  // Path math on a hand-built L host.
  const hostL = baseRun({
    parametric: sanitizeSpec({
      ...baseRun().parametric!,
      extraLegs: [{ turn: 1, w: 1 }],
    }),
  });
  const legs = pathLegs(hostL.parametric!);
  check("L path has 2 legs", legs.length === 2);
  check("leg 1 includes the corner square", Math.abs(legs[1].len - 1.6) < 1e-9, `${legs[1].len}`);
  check("path length = w + d + extra", Math.abs(pathLength(hostL.parametric!) - 4.0) < 1e-9);

  // A sink bonded onto the SECOND leg: rides it, rotated with it.
  const pose = attachedPose(hostL, 3.5); // 1.1 m past the corner start
  check("second-leg pose sits on leg 1", Math.abs(pose.x - 2.9) < 1e-9 && Math.abs(pose.y - 1.15) < 1e-9,
    `${pose.x},${pose.y}`);
  check("second-leg pose faces leg 1's room side", Math.abs(pose.rotation - Math.PI / 2) < 1e-9,
    `${pose.rotation}`);

  // Corner exclusion: an along inside the corner square clamps out of it.
  const inCorner = clampAlongToPath(hostL.parametric!, 2.5, 0.56); // corner spans 2.4..3.0
  check("corner square rejects attachments", inCorner <= 2.4 - 0.28 + 1e-9 || inCorner >= 3.0 + 0.28 - 1e-9,
    `${inCorner}`);

  // findHostRun sees the second leg (its counter centerline runs at world
  // x ≈ 2.9 for this hand-built L).
  const scL = scene([hostL]);
  const hit2 = findHostRun(2.9, 1.3, scL, 0.56);
  check("cursor over leg 1 finds the run", hit2?.host.id === "run1", `${hit2?.along}`);
  check("...with a second-leg along", (hit2?.along ?? 0) > 2.4, `${hit2?.along}`);

  // Builders: an L builds (more parts than straight). Headless-safe
  // finishes only — painted/oak build canvas textures and need a DOM.
  const flat = { finish: "laminate-matte", finish2: "counter-white" };
  const straightParts = GENERATORS.kitchenBase.build(
    sanitizeSpec({ ...baseRun().parametric!, ...flat }),
  ).children.length;
  const lParts = GENERATORS.kitchenBase.build(
    sanitizeSpec({ ...hostL.parametric!, ...flat }),
  ).children.length;
  check("L base run builds more parts than straight", lParts > straightParts, `${straightParts} -> ${lParts}`);
  const lWall = GENERATORS.kitchenWall.build(
    sanitizeSpec({ ...GENERATORS.kitchenWall.defaultSpec, finish: "laminate-matte", extraLegs: [{ turn: 1, w: 0.9 }] }),
  );
  check("L wall-cabinet run builds", lWall.children.length > 2, `${lWall.children.length}`);
}

// ---------------------------------------------------------------------------
console.log("\nsnapRunToWall — always glued, clamped to its wall");
{
  const sc = scene();
  const s1 = snapRunToWall({ x: 2, y: 0.9, parametric: baseRun().parametric }, sc)!;
  check("pulls flush to w1", Math.abs(s1.y - 0.35) < 1e-9, `${s1.y}`);
  check("faces into the room", Math.abs(s1.rotation - 0) < 1e-9, `${s1.rotation}`);
  // Center dragged toward the wall's end: the run may not hang past it.
  const s2 = snapRunToWall({ x: 3.5, y: 0.35, parametric: baseRun().parametric }, sc)!;
  check("run stays on its wall segment", s2.x <= 4 - 1.2 + 1e-9 && Math.abs(s2.y - 0.35) < 1e-9,
    `${s2.x},${s2.y}`);

  // An L nudged out of place must click BACK into its corner: the corner (leg
  // 0's far end), not the run's center, is what has to land on the crossing
  // wall's face — 10cm-grid rounding of the center would leave leg 1 buried.
  const thick = scene([], 0.3);
  const lSpec = sanitizeSpec({
    ...baseRun().parametric!,
    dims: { w: 2.85, d: 0.6, h: 0.84 },
    extraLegs: [{ turn: 1, w: 0.8 }],
  });
  const s3 = snapRunToWall({ x: 2.425 + 0.07, y: 0.45 + 0.12, parametric: lSpec }, thick)!;
  check("L re-registers its corner on the face", Math.abs(s3.x - 2.425) < 1e-9, `${s3.x}`);
  check("L stays flush on its own wall", Math.abs(s3.y - 0.45) < 1e-9, `${s3.y}`);
  const corner = runLocalToWorld({ x: s3.x, y: s3.y, rotation: s3.rotation }, { x: 2.85 / 2, z: -0.3 });
  check("corner sits on both faces", Math.abs(corner.x - 3.85) < 1e-9 && Math.abs(corner.y - 0.15) < 1e-9,
    `${corner.x},${corner.y}`);
}

// ---------------------------------------------------------------------------
console.log("\ncountertop with real holes");
{
  const mat = new THREE.MeshStandardMaterial(); // headless: no canvas-textured finishes
  const solid = countertopWithCutouts(2.4, 0.6, [], mat);
  const holed = countertopWithCutouts(2.4, 0.6, [{ along: 1.2, w: 0.53, d: 0.45 }], mat);
  const count = (m: THREE.Mesh) => m.geometry.getAttribute("position").count;
  check("a hole adds geometry (inner walls)", count(holed) > count(solid),
    `${count(solid)} -> ${count(holed)}`);
  check("slab thickness preserved", COUNTER_T === 0.04);
}

// ---------------------------------------------------------------------------
console.log("\nsink drops THROUGH the counter into an open cabinet");
{
  const flat = { finish: "laminate-matte", finish2: "counter-white" };
  const cut = { along: 1.2, w: 0.53, d: 0.45 };
  // The column under the hole, stopping below the counter slab (0.80–0.84):
  // anything in here is something you would see instead of the basin.
  const probe = new THREE.Box3(
    new THREE.Vector3(-0.2, 0.6, -0.15),
    new THREE.Vector3(0.2, 0.79, 0.15),
  );
  const obstructions = (spec: Parameters<typeof GENERATORS.kitchenBase.build>[0]) => {
    const g = GENERATORS.kitchenBase.build(spec);
    g.updateMatrixWorld(true);
    let n = 0;
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && new THREE.Box3().setFromObject(o).intersectsBox(probe)) n++;
    });
    return n;
  };
  const solid = obstructions(sanitizeSpec({ ...baseRun().parametric!, ...flat }));
  const holed = obstructions(sanitizeSpec({ ...baseRun().parametric!, ...flat, cutouts: [cut] }));
  check("a run with no cutout DOES fill that space (probe is real)", solid > 0, `${solid}`);
  check("under a cutout the cabinet is open — no top panel, no side panel", holed === 0,
    `${holed} meshes in the basin's space`);

  // The bowl itself: deep enough to be a sink, and all one material with the
  // rim (the drain puck is the only other one).
  const sink = GENERATORS.sink.build(sanitizeSpec(GENERATORS.sink.defaultSpec));
  sink.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(sink);
  check("bowl hangs at least 20cm below the counter", box.min.y <= -0.2, `${box.min.y.toFixed(3)}`);
  const mats = new Set<THREE.Material>();
  sink.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) mats.add(m.material as THREE.Material);
  });
  check("bowl, rim and tap share one material", mats.size === 2, `${mats.size} materials`);
}

// ---------------------------------------------------------------------------
console.log("\nvariants + builds don't throw");
{
  for (const variant of ["induction", "radiant", "gas"]) {
    const spec = sanitizeSpec({ ...GENERATORS.cooktop.defaultSpec, variant });
    check(`cooktop ${variant} keeps its variant`, spec.variant === variant, `${spec.variant}`);
    const g = GENERATORS.cooktop.build(spec);
    check(`cooktop ${variant} builds`, g.children.length > 3, `${g.children.length} parts`);
  }
  const narrow = GENERATORS.cooktop.build(
    sanitizeSpec({ ...GENERATORS.cooktop.defaultSpec, dims: { w: 0.3, d: 0.5, h: 0.008 }, modules: { burners: 2 } }),
  );
  check("30cm domino builds", narrow.children.length > 2);
  for (const bowls of [1, 2]) {
    const g = GENERATORS.sink.build(sanitizeSpec({ ...GENERATORS.sink.defaultSpec, modules: { bowls } }));
    check(`sink bowls=${bowls} builds`, g.children.length > 3);
  }
  const unknown = sanitizeSpec({ ...GENERATORS.cooktop.defaultSpec, variant: "plasma" });
  check("unknown variant falls back to default", unknown.variant === "induction", `${unknown.variant}`);
}

console.log(failures === 0 ? "\nall kitchen v2 checks passed\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
