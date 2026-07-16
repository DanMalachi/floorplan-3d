// Headless: prove wall bodies MEET at shared nodes — no gap, no overlap.
// Run: npx tsx src/viewport3d/geometry/wallJunctions.test.ts

import type { Node, Wall } from "@/schema/scene";
import { solveJunctions, SQUARE_ENDS, type WallEnds } from "./wallJunctions";

const T = 0.1;
const H = T / 2; // half-thickness — every expected corner lands on a multiple

let failures = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

function checkEnds(name: string, got: WallEnds | undefined, want: WallEnds) {
  if (!got) return check(name, false, "no ends solved");
  const ok =
    near(got.x0L, want.x0L) && near(got.x0R, want.x0R) &&
    near(got.x1L, want.x1L) && near(got.x1R, want.x1R);
  check(name, ok, ok ? "" : `got ${fmt(got)} want ${fmt(want)}`);
}

const fmt = (e: WallEnds) =>
  `{x0L:${e.x0L.toFixed(4)} x0R:${e.x0R.toFixed(4)} x1L:${e.x1L.toFixed(4)} x1R:${e.x1R.toFixed(4)}}`;

const nodeMap = (ns: Node[]) => new Map(ns.map((n) => [n.id, n]));
const wall = (id: string, a: string, b: string, extra: Partial<Wall> = {}): Wall => ({
  id, a, b, thickness: T, ...extra,
});

type XY = [number, number];

/** The wall's four corners in PLAN space, given its solved ends. This is the
 *  shape the renderer actually extrudes, so it's what "they meet" is about. */
function planCorners(w: Wall, ends: WallEnds, nodes: Map<string, Node>) {
  const a = nodes.get(w.a)!;
  const b = nodes.get(w.b)!;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  const ux = dx / L;
  const uy = dy / L;
  const nx = -uy; // wall-local +z, the "left" / side-A face
  const ny = ux;
  const h = (w.thickness ?? T) / 2;
  const at = (x: number, s: number): XY => [a.x + ux * x + nx * h * s, a.y + uy * x + ny * h * s];
  return {
    startLeft: at(ends.x0L, 1),
    startRight: at(ends.x0R, -1),
    endLeft: at(L + ends.x1L, 1),
    endRight: at(L + ends.x1R, -1),
  };
}

const samePt = (p: XY, q: XY) => near(p[0], q[0], 1e-9) && near(p[1], q[1], 1e-9);

// ---------------------------------------------------------------------------
console.log("\nfree end (degree 1) — square cap");
{
  const nodes = nodeMap([{ id: "n0", x: 0, y: 0 }, { id: "n1", x: 5, y: 0 }]);
  const ends = solveJunctions([wall("w", "n0", "n1")], nodes);
  checkEnds("lone wall stays a plain box", ends.get("w"), SQUARE_ENDS);
}

// ---------------------------------------------------------------------------
console.log("\nL-corner (degree 2) — mitre");
{
  // A runs +x into (10,0); B leaves it going +y.
  const nodes = nodeMap([
    { id: "n0", x: 0, y: 0 }, { id: "n1", x: 10, y: 0 }, { id: "n2", x: 10, y: 10 },
  ]);
  const A = wall("A", "n0", "n1");
  const B = wall("B", "n1", "n2");
  const ends = solveJunctions([A, B], nodes);

  // Inner corner pulls back by half a thickness, outer pushes past by the same.
  checkEnds("A mitres at its far end", ends.get("A"), { x0L: 0, x0R: 0, x1L: -H, x1R: H });
  checkEnds("B mitres at its near end", ends.get("B"), { x0L: H, x0R: -H, x1L: 0, x1R: 0 });

  // The watertight property: A's end face IS B's start face, same two points.
  const ca = planCorners(A, ends.get("A")!, nodes);
  const cb = planCorners(B, ends.get("B")!, nodes);
  check("corner is shared (inner)", samePt(ca.endLeft, cb.startLeft),
    `${ca.endLeft} vs ${cb.startLeft}`);
  check("corner is shared (outer)", samePt(ca.endRight, cb.startRight),
    `${ca.endRight} vs ${cb.startRight}`);
  check("inner corner sits at the reflex quadrant", samePt(ca.endLeft, [10 - H, H]));
  check("outer corner sits past the node", samePt(ca.endRight, [10 + H, -H]));
}

// ---------------------------------------------------------------------------
console.log("\ncollinear run (degree 2) — flush, no mitre");
{
  const nodes = nodeMap([
    { id: "n0", x: 0, y: 0 }, { id: "n1", x: 5, y: 0 }, { id: "n2", x: 9, y: 0 },
  ]);
  const ends = solveJunctions([wall("A", "n0", "n1"), wall("B", "n1", "n2")], nodes);
  // Parallel faces never cross; both keep square caps and butt flush.
  checkEnds("A stays square", ends.get("A"), SQUARE_ENDS);
  checkEnds("B stays square", ends.get("B"), SQUARE_ENDS);
}

// ---------------------------------------------------------------------------
console.log("\nT-junction (degree 3) — through + butt");
{
  // A---B runs straight through (0,0); C stands on it going +y.
  const nodes = nodeMap([
    { id: "nA", x: -10, y: 0 }, { id: "n0", x: 0, y: 0 },
    { id: "nB", x: 10, y: 0 }, { id: "nC", x: 0, y: 10 },
  ]);
  const A = wall("A", "nA", "n0");
  const B = wall("B", "n0", "nB");
  const C = wall("C", "n0", "nC");
  const ends = solveJunctions([A, B, C], nodes);

  // The through-wall must NOT be mitred — a naive pairwise solve pulls A and B
  // apart here and leaves a triangular hole (plus an unpainted strip) at the
  // centre of the joint.
  checkEnds("A runs through square", ends.get("A"), SQUARE_ENDS);
  checkEnds("B runs through square", ends.get("B"), SQUARE_ENDS);
  // C stops flat against the through-wall's near face.
  checkEnds("C butts flat onto A-B's face", ends.get("C"), { x0L: H, x0R: H, x1L: 0, x1R: 0 });

  const cc = planCorners(C, ends.get("C")!, nodes);
  check("C's foot lands on the through-wall face", near(cc.startLeft[1], H) && near(cc.startRight[1], H));
  check("A and B meet flush at the node",
    samePt(planCorners(A, ends.get("A")!, nodes).endLeft,
           planCorners(B, ends.get("B")!, nodes).startLeft));
}

// ---------------------------------------------------------------------------
console.log("\nT-junction from the other side — butt flips face");
{
  // Same T, but the stem hangs DOWN. It must butt onto the far face (-y).
  const nodes = nodeMap([
    { id: "nA", x: -10, y: 0 }, { id: "n0", x: 0, y: 0 },
    { id: "nB", x: 10, y: 0 }, { id: "nC", x: 0, y: -10 },
  ]);
  const C = wall("C", "n0", "nC");
  const ends = solveJunctions([wall("A", "nA", "n0"), wall("B", "n0", "nB"), C], nodes);
  checkEnds("C butts onto the -y face", ends.get("C"), { x0L: H, x0R: H, x1L: 0, x1R: 0 });
  const cc = planCorners(C, ends.get("C")!, nodes);
  check("C's foot lands on y = -H", near(cc.startLeft[1], -H) && near(cc.startRight[1], -H));
}

// ---------------------------------------------------------------------------
console.log("\nX-junction (degree 4) — one pair through, two butt");
{
  const nodes = nodeMap([
    { id: "n0", x: 0, y: 0 },
    { id: "nW", x: -10, y: 0 }, { id: "nE", x: 10, y: 0 },
    { id: "nN", x: 0, y: 10 }, { id: "nS", x: 0, y: -10 },
  ]);
  const ends = solveJunctions([
    wall("W", "nW", "n0"), wall("E", "n0", "nE"),
    wall("N", "n0", "nN"), wall("S", "n0", "nS"),
  ], nodes);
  // W-E is found first as the opposed pair, so it runs through.
  checkEnds("W runs through", ends.get("W"), SQUARE_ENDS);
  checkEnds("E runs through", ends.get("E"), SQUARE_ENDS);
  checkEnds("N butts up onto it", ends.get("N"), { x0L: H, x0R: H, x1L: 0, x1R: 0 });
  checkEnds("S butts down onto it", ends.get("S"), { x0L: H, x0R: H, x1L: 0, x1R: 0 });
}

// ---------------------------------------------------------------------------
console.log("\nrails are not walls — they never join");
{
  // A and B form an L; a rail also lands on the shared node. The rail must not
  // turn the corner into a 3-way junction, and gets no ends of its own.
  const nodes = nodeMap([
    { id: "n0", x: 0, y: 0 }, { id: "n1", x: 10, y: 0 },
    { id: "n2", x: 10, y: 10 }, { id: "n3", x: 20, y: 0 },
  ]);
  const ends = solveJunctions([
    wall("A", "n0", "n1"), wall("B", "n1", "n2"),
    wall("R", "n1", "n3", { kind: "rail" }),
  ], nodes);
  check("rail gets no joinery", ends.get("R") === undefined);
  checkEnds("A still mitres cleanly through the rail", ends.get("A"),
    { x0L: 0, x0R: 0, x1L: -H, x1R: H });
  checkEnds("B still mitres cleanly through the rail", ends.get("B"),
    { x0L: H, x0R: -H, x1L: 0, x1R: 0 });
}

// ---------------------------------------------------------------------------
console.log("\nwall ending at a lone rail — square-capped jamb");
{
  const nodes = nodeMap([
    { id: "n0", x: 0, y: 0 }, { id: "n1", x: 10, y: 0 }, { id: "n2", x: 10, y: 10 },
  ]);
  const ends = solveJunctions([
    wall("A", "n0", "n1"), wall("R", "n1", "n2", { kind: "rail" }),
  ], nodes);
  checkEnds("A caps square where the rail takes over", ends.get("A"), SQUARE_ENDS);
}

// ---------------------------------------------------------------------------
console.log("\n45-degree corner — well inside the limit, still mitres");
{
  const nodes = nodeMap([
    { id: "n0", x: 0, y: 0 }, { id: "n1", x: 10, y: 0 }, { id: "n2", x: 20, y: 10 },
  ]);
  const A = wall("A", "n0", "n1");
  const B = wall("B", "n1", "n2");
  const ends = solveJunctions([A, B], nodes);
  const ca = planCorners(A, ends.get("A")!, nodes);
  const cb = planCorners(B, ends.get("B")!, nodes);
  check("angled corner still mitres", ends.get("A")!.x1L !== 0);
  check("angled corner is shared (inner)", samePt(ca.endLeft, cb.startLeft));
  check("angled corner is shared (outer)", samePt(ca.endRight, cb.startRight));
}

// ---------------------------------------------------------------------------
console.log("\nacute corner — no needle, degrades to square caps");
{
  // ~6 degrees between the walls. The true mitre crosses ~1 m past the node —
  // a needle 20x the wall's thickness. It has to be given up, not shortened:
  // a corner only sits on both walls' faces at the exact crossing, so pulling
  // it in would tear the joint open instead of closing it.
  const nodes = nodeMap([
    { id: "n0", x: 0, y: 0 }, { id: "n1", x: 10, y: 0 }, { id: "n2", x: 0, y: 1 },
  ]);
  const A = wall("A", "n0", "n1");
  const B = wall("B", "n1", "n2");
  const ends = solveJunctions([A, B], nodes);
  checkEnds("A gives up the mitre", ends.get("A"), SQUARE_ENDS);
  checkEnds("B gives up the mitre", ends.get("B"), SQUARE_ENDS);

  const ca = planCorners(A, ends.get("A")!, nodes);
  const dist = (p: XY) => Math.hypot(p[0] - 10, p[1] - 0);
  check("no corner runs away from the node",
    dist(ca.endLeft) <= 4 * H + 1e-9 && dist(ca.endRight) <= 4 * H + 1e-9,
    `${dist(ca.endRight).toFixed(3)} m out`);
}

// ---------------------------------------------------------------------------
console.log("\nmixed thickness — corners follow the real faces");
{
  const nodes = nodeMap([
    { id: "n0", x: 0, y: 0 }, { id: "n1", x: 10, y: 0 }, { id: "n2", x: 10, y: 10 },
  ]);
  const A = wall("A", "n0", "n1", { thickness: 0.3 }); // a MAMAD-ish thick wall
  const B = wall("B", "n1", "n2", { thickness: 0.1 });
  const ends = solveJunctions([A, B], nodes);
  const ca = planCorners(A, ends.get("A")!, nodes);
  const cb = planCorners(B, ends.get("B")!, nodes);
  check("thick/thin corner is shared (inner)", samePt(ca.endLeft, cb.startLeft));
  check("thick/thin corner is shared (outer)", samePt(ca.endRight, cb.startRight));
  // A's face sits 0.15 out, B's 0.05 out: they cross at (9.95, 0.15).
  check("inner corner is where the two faces actually cross", samePt(ca.endLeft, [10 - 0.05, 0.15]));
}

// ---------------------------------------------------------------------------
console.log("\nbaseboard inflate — a proud band re-solves on its own width");
{
  const nodes = nodeMap([
    { id: "n0", x: 0, y: 0 }, { id: "n1", x: 10, y: 0 }, { id: "n2", x: 10, y: 10 },
  ]);
  const walls = [wall("A", "n0", "n1"), wall("B", "n1", "n2")];
  const ends = solveJunctions(walls, nodes, 0.02); // BASEBOARD_PROUD
  checkEnds("A's band mitres at its own half-width", ends.get("A"),
    { x0L: 0, x0R: 0, x1L: -(H + 0.02), x1R: H + 0.02 });
}

// ---------------------------------------------------------------------------
console.log("\ndegenerate input is survivable");
{
  const nodes = nodeMap([{ id: "n0", x: 0, y: 0 }, { id: "n1", x: 0, y: 0 }]);
  const ends = solveJunctions([
    wall("zero", "n0", "n1"), // zero length
    wall("dangling", "n0", "nope"), // node that isn't there
  ], nodes);
  check("zero-length wall is skipped", ends.get("zero") === undefined);
  check("dangling wall is skipped", ends.get("dangling") === undefined);
}

console.log(
  failures === 0 ? "\nall wall-junction checks passed\n" : `\n${failures} FAILED\n`,
);
process.exit(failures === 0 ? 0 : 1);
