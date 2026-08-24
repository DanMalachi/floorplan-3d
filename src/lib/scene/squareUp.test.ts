// Run: npx tsx src/lib/scene/squareUp.test.ts
//
// Two halves. Synthetic cases pin the contract (graph stays connected, real
// diagonals survive, an already-square plan is a no-op). Then the whole pass
// is measured against the 15 hand-traced plans in legacy/data/floorplan-gt —
// the population the tolerance was chosen from, so the regression bar is the
// corpus itself, not an example.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Node, Scene, Wall } from "@/schema/scene";
import { squareUpScene, DEFAULT_TOLERANCE_DEG } from "./squareUp";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const DEG = 180 / Math.PI;

function sceneOf(nodes: [string, number, number][], walls: [string, string, string][]): Scene {
  return {
    nodes: nodes.map(([id, x, y]): Node => ({ id, x, y })),
    walls: walls.map(([id, a, b]): Wall => ({ id, a, b, thickness: 0.2 })),
    openings: [],
    rooms: [],
    furniture: [],
    fixtures: [],
  } as unknown as Scene;
}

/** Every wall's angle off the nearest axis of `frame`, in degrees. */
function errors(scene: Scene, frame = 0): number[] {
  const by = new Map(scene.nodes.map((n) => [n.id, n]));
  const out: number[] = [];
  for (const w of scene.walls) {
    const a = by.get(w.a)!;
    const b = by.get(w.b)!;
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-9) continue;
    let e = Math.abs((((Math.atan2(b.y - a.y, b.x - a.x) - frame) * DEG) % 90 + 90) % 90);
    if (e > 45) e = 90 - e;
    out.push(e);
  }
  return out;
}

// ---------------------------------------------------------------- synthetic

console.log("\nsynthetic");

{
  // A room whose four corners are each ~1° out — the exact failure the pass
  // exists for. Every wall must come out exactly square, and the graph must
  // still be the same four shared nodes (no wall detached from a corner).
  const s = sceneOf(
    [["n0", 0, 0], ["n1", 5.02, 0.08], ["n2", 5.1, 4.03], ["n3", 0.04, 3.99]],
    [["w0", "n0", "n1"], ["w1", "n1", "n2"], ["w2", "n2", "n3"], ["w3", "n3", "n0"]],
  );
  const { scene: out, report } = squareUpScene(s);
  const worst = Math.max(...errors(out, report.frameAngle));
  check("bent room: all four walls come out square", worst < 1e-9, `worst ${worst.toExponential(2)}°`);
  check("bent room: reports the bent walls straightened", report.straightened >= 3, `got ${report.straightened}`);
  check("bent room: node ids and count unchanged",
    out.nodes.length === 4 && out.nodes.every((n, i) => n.id === s.nodes[i].id));
  check("bent room: walls still reference the same nodes",
    out.walls.every((w, i) => w.a === s.walls[i].a && w.b === s.walls[i].b));
  check("bent room: nothing moved far", report.maxShift < 0.1, `${report.maxShift.toFixed(3)}m`);
}

{
  // A deliberate 40° diagonal spanning a square room must survive untouched,
  // and must not drag the square walls with it.
  const s = sceneOf(
    [["n0", 0, 0], ["n1", 6, 0.05], ["n2", 6, 4], ["n3", 0, 4], ["n4", 2, 0], ["n5", 5, 2.5]],
    [
      ["w0", "n0", "n1"], ["w1", "n1", "n2"], ["w2", "n2", "n3"], ["w3", "n3", "n0"],
      ["wd", "n4", "n5"],
    ],
  );
  const before = new Map(s.nodes.map((n) => [n.id, { ...n }]));
  const { scene: out, report } = squareUpScene(s);
  const by = new Map(out.nodes.map((n) => [n.id, n]));
  const d0 = before.get("n5")!;
  const d1 = by.get("n5")!;
  check("diagonal: counted as a diagonal, not straightened", report.diagonals === 1,
    `diagonals=${report.diagonals} straightened=${report.straightened}`);
  check("diagonal: its free end did not move", Math.hypot(d1.x - d0.x, d1.y - d0.y) < 1e-9);
  const sq = out.walls
    .filter((w) => w.id !== "wd")
    .map((w) => {
      const a = by.get(w.a)!;
      const b = by.get(w.b)!;
      const e = Math.abs((((Math.atan2(b.y - a.y, b.x - a.x) - report.frameAngle) * DEG) % 90 + 90) % 90);
      return e > 45 ? 90 - e : e;
    });
  check("diagonal: the square walls around it still square up", Math.max(...sq) < 1e-9,
    `worst ${Math.max(...sq).toExponential(2)}°`);
}

{
  // A single 43° wall must not rotate the frame — the failure mode a plain
  // circular mean would have.
  const s = sceneOf(
    [["n0", 0, 0], ["n1", 8, 0], ["n2", 8, 6], ["n3", 0, 6], ["n4", 1, 1], ["n5", 4, 3.8]],
    [
      ["w0", "n0", "n1"], ["w1", "n1", "n2"], ["w2", "n2", "n3"], ["w3", "n3", "n0"],
      ["wd", "n4", "n5"],
    ],
  );
  const { report } = squareUpScene(s);
  check("frame estimate ignores the outlier", Math.abs(report.frameAngle) < 1e-6,
    `${(report.frameAngle * DEG).toFixed(4)}°`);
}

{
  // Already square: a no-op that returns the SAME scene object, so a Generate
  // on a clean trace costs nothing and can't churn React identity.
  const s = sceneOf(
    [["n0", 0, 0], ["n1", 5, 0], ["n2", 5, 4], ["n3", 0, 4]],
    [["w0", "n0", "n1"], ["w1", "n1", "n2"], ["w2", "n2", "n3"], ["w3", "n3", "n0"]],
  );
  const { scene: out, report } = squareUpScene(s);
  check("already square: same object back", out === s);
  check("already square: reports nothing straightened", report.straightened === 0);
}

{
  // A building traced 30° off upright: the frame follows it, and the walls
  // come out square TO THE BUILDING, not to the world axes.
  const r = (30 * Math.PI) / 180;
  const rot = (x: number, y: number): [number, number] =>
    [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
  const p = [rot(0, 0), rot(5, 0.06), rot(5.05, 4), rot(0, 4)];
  const s = sceneOf(
    p.map((q, i) => [`n${i}`, q[0], q[1]] as [string, number, number]),
    [["w0", "n0", "n1"], ["w1", "n1", "n2"], ["w2", "n2", "n3"], ["w3", "n3", "n0"]],
  );
  const { scene: out, report } = squareUpScene(s);
  check("rotated building: frame ≈ 30°", Math.abs(Math.abs(report.frameAngle * DEG) - 30) < 0.5,
    `${(report.frameAngle * DEG).toFixed(2)}°`);
  check("rotated building: square in its OWN frame",
    Math.max(...errors(out, report.frameAngle)) < 1e-9);
}

{
  // Openings ride their wall: an offset near the far end stays inside it after
  // the wall's length changes.
  const s = sceneOf(
    [["n0", 0, 0], ["n1", 5.0, 0.15], ["n2", 5, 4], ["n3", 0, 4]],
    [["w0", "n0", "n1"], ["w1", "n1", "n2"], ["w2", "n2", "n3"], ["w3", "n3", "n0"]],
  );
  // Sits inside the wall to begin with (4.4 + 0.45 = 4.85 < 5.0022), so the
  // assertion is about the pass keeping it there, not about a bad fixture.
  s.openings = [
    { id: "o0", type: "door", wallId: "w0", offset: 4.4, width: 0.9, height: 2.1, sill: 0 },
  ] as Scene["openings"];
  const { scene: out } = squareUpScene(s);
  const by = new Map(out.nodes.map((n) => [n.id, n]));
  const a = by.get("n0")!;
  const b = by.get("n1")!;
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  const o = out.openings[0];
  check("opening stays inside its wall", o.offset + o.width / 2 <= L + 1e-9,
    `offset ${o.offset.toFixed(4)} + half-width vs L ${L.toFixed(4)}`);
}

// ------------------------------------------------------------------- corpus

const GT_DIRS = [
  join(process.cwd(), "legacy", "data", "floorplan-gt"),
  join(process.cwd(), "..", "fp-gt-audit", "legacy", "data", "floorplan-gt"),
];
const GT = GT_DIRS.find((d) => existsSync(d));

console.log("\ncorpus");
if (!GT) {
  console.log("  SKIP — no legacy/data/floorplan-gt found");
} else {
  const files = readdirSync(GT).filter((f) => f.endsWith(".gt.json"));
  let totalWalls = 0;
  let bentBefore = 0;
  let bentAfter = 0;
  let diagonalsKept = 0;
  let worstShift = 0;
  let diagonalDrift = 0;
  const regressions: string[] = [];

  for (const f of files) {
    const gt = JSON.parse(readFileSync(join(GT, f), "utf8")) as {
      points: { id: string; x: number; y: number }[];
      segments: { id: string; a: string; b: string }[];
      metersPerPixel: number;
    };
    const mpp = gt.metersPerPixel ?? 1;
    const ids = new Set(gt.points.map((p) => p.id));
    const scene = sceneOf(
      gt.points.map((p) => [p.id, p.x * mpp, p.y * mpp] as [string, number, number]),
      gt.segments
        .filter((s) => ids.has(s.a) && ids.has(s.b))
        .map((s) => [s.id, s.a, s.b] as [string, string, string]),
    );

    const { scene: out, report } = squareUpScene(scene);
    const eb = errors(scene, report.frameAngle);
    const ea = errors(out, report.frameAngle);
    totalWalls += eb.length;
    bentBefore += eb.filter((e) => e > 1e-6 && e <= DEFAULT_TOLERANCE_DEG).length;
    bentAfter += ea.filter((e) => e > 1e-6 && e <= DEFAULT_TOLERANCE_DEG).length;
    diagonalsKept += report.diagonals;
    worstShift = Math.max(worstShift, report.maxShift);

    // A wall that was already exactly square must still be. (A DIAGONAL's own
    // angle is not an invariant: its endpoints are shared with square walls, so
    // when those move it reconnects at a slightly different angle. What is
    // guaranteed is that it was never constrained — that's `report.diagonals`
    // — and that nothing moved far, which the shift bar below covers.)
    for (let i = 0; i < eb.length; i++) {
      if (eb[i] <= 1e-6 && ea[i] > 1e-6) regressions.push(`${f}: square wall #${i} became bent`);
      if (eb[i] > DEFAULT_TOLERANCE_DEG)
        diagonalDrift = Math.max(diagonalDrift, Math.abs(ea[i] - eb[i]));
    }
    if (report.bailed) regressions.push(`${f}: bailed (${report.bailed})`);
  }

  console.log(`  ${files.length} plans, ${totalWalls} walls`);
  console.log(`  bent (0 < e ≤ ${DEFAULT_TOLERANCE_DEG}°): ${bentBefore} before → ${bentAfter} after`);
  console.log(`  real diagonals left unconstrained: ${diagonalsKept}`);
  console.log(`  worst node shift: ${(worstShift * 100).toFixed(1)} cm`);
  console.log(`  worst diagonal reconnect: ${diagonalDrift.toFixed(2)}°`);
  check("every bent wall in the corpus is straightened", bentAfter === 0, `${bentAfter} left`);
  check("the corpus actually had bent walls to fix", bentBefore > 100, `${bentBefore}`);
  check("no already-square wall was bent, nothing bailed",
    regressions.length === 0, regressions.slice(0, 5).join(" | "));
  check("no node moved further than the tolerance can justify", worstShift < 0.5, `${(worstShift * 100).toFixed(1)}cm`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
