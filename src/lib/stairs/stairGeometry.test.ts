// Headless: prove the derived stair numbers — step count, uniform riser, the
// step distribution across flights, and the landing hull for all three
// flat-break shapes (straight gap, quarter-turn, half-turn).
// Run: npx tsx src/lib/stairs/stairGeometry.test.ts

import type { Stair } from "@/schema/scene";
import { stairLandings, stairMetrics, stepCount, totalRun } from "./stairGeometry";

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) fails++;
};
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) < tol;

type P = { x: number; y: number };
const area = (poly: P[]) => {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
};
/** Ray cast — used to prove a landing actually covers the turn, not just that
 *  its hull has some points in it. */
const contains = (poly: P[], x: number, y: number) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

const stair = (p: Partial<Stair> & Pick<Stair, "flights">): Stair => ({
  id: "s1",
  width: 0.9,
  rise: 2.4,
  ...p,
});

// 1. A storey-height stair over a comfortable run: sane, silent.
{
  const s = stair({ flights: [{ x0: 0, y0: 0, x1: 4, y1: 0 }] });
  const m = stairMetrics(s);
  ok(m.steps === 14, `storey stair derives 14 steps (got ${m.steps})`);
  ok(near(m.riser, 2.4 / 14), `riser is rise/steps (${m.riser.toFixed(4)} m)`);
  ok(near(m.going, 4 / 14), `going is run/steps (${m.going.toFixed(4)} m)`);
  ok(m.warnings.length === 0, `no warnings (got ${JSON.stringify(m.warnings)})`);
  ok(near(m.flights[0].topHeight, 2.4), "single flight tops out at the full rise");
}

// 2. Same rise crammed into a short run: the tread rule catches it.
{
  const m = stairMetrics(stair({ flights: [{ x0: 0, y0: 0, x1: 1.5, y1: 0 }] }));
  ok(
    m.warnings.some((w) => w.includes("shallow")),
    `cramped run warns on tread depth (got ${JSON.stringify(m.warnings)})`,
  );
}

// 3. An explicit step count overrides the derivation.
{
  const m = stairMetrics(stair({ flights: [{ x0: 0, y0: 0, x1: 4, y1: 0 }], steps: 10 }));
  ok(m.steps === 10, `explicit steps wins (got ${m.steps})`);
  ok(near(m.riser, 0.24), "riser follows the override");
  ok(m.warnings.some((w) => w.includes("steep")), "and the steep riser is reported");
}

// 4. Degenerate run: warns, stays finite.
{
  const s = stair({ flights: [{ x0: 2, y0: 2, x1: 2, y1: 2 }] });
  const m = stairMetrics(s);
  ok(m.warnings.some((w) => w.includes("no length")), "zero-length flight warns");
  ok(Number.isFinite(m.riser) && Number.isFinite(m.going), "no NaN in the metrics");
  ok(stairLandings(s).every((l) => l.poly.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))),
    "no NaN in the landing hulls");
}

// 5. The three flat-break shapes. Each: one interior landing (4-point hull, at
//    the first flight's top height) plus the top stub.
const shapes: Record<string, Stair> = {
  "straight + gap": stair({
    flights: [
      { x0: 0, y0: 0, x1: 3, y1: 0 },
      { x0: 4, y0: 0, x1: 7, y1: 0 },
    ],
  }),
  "L / quarter-turn": stair({
    flights: [
      { x0: 0, y0: 0, x1: 3, y1: 0 },
      { x0: 4, y0: 1, x1: 4, y1: 4 },
    ],
  }),
  "U / half-turn": stair({
    flights: [
      { x0: 0, y0: 0, x1: 3, y1: 0 },
      { x0: 3.9, y0: 1, x1: 0.9, y1: 1 },
    ],
  }),
};

for (const [name, s] of Object.entries(shapes)) {
  const m = stairMetrics(s);
  const ls = stairLandings(s);
  ok(ls.length === 2, `${name}: one landing + the top stub (got ${ls.length})`);
  ok(ls[0]?.poly.length >= 4, `${name}: landing hull is a polygon (got ${ls[0]?.poly.length} points)`);
  // The landing is what you stand on mid-staircase: it must reach BOTH flights.
  // A hull of the two facing cross-sections alone collapses on a turn, so this
  // asserts real area and real coverage, not just a non-empty polygon.
  ok(
    area(ls[0]?.poly ?? []) >= s.width * s.width * 0.9,
    `${name}: landing has at least width² of floor (got ${area(ls[0]?.poly ?? []).toFixed(2)} m²)`,
  );
  const f1 = s.flights[0];
  const f2 = s.flights[1];
  ok(
    contains(ls[0]?.poly ?? [], (f1.x1 + f2.x0) / 2, (f1.y1 + f2.y0) / 2),
    `${name}: the step-off point between the flights is on the landing`,
  );
  ok(ls[0]?.base === 0, `${name}: the landing is built down to the floor`);
  ok(
    near(ls[1]?.base ?? -1, s.rise - 0.15),
    `${name}: the top stub stays a slab (base ${ls[1]?.base?.toFixed(2)})`,
  );
  ok(
    near(ls[0]?.top ?? -1, m.flights[0].topHeight),
    `${name}: landing sits at the first flight's top`,
  );
  ok(near(ls[1]?.top ?? -1, s.rise), `${name}: top stub sits at the full rise`);
  ok(
    m.flights.reduce((a, f) => a + f.steps, 0) === m.steps,
    `${name}: flight steps sum to the total`,
  );
  ok(
    m.flights.every((f) => near(f.topHeight - f.baseHeight, f.steps * m.riser)),
    `${name}: riser is uniform across flights`,
  );
  ok(near(m.flights[1].baseHeight, m.flights[0].topHeight), `${name}: flight 2 starts at the landing`);
}

// 6. A FLUSH half-turn — both flights ending on the same line, which is how a
//    U-stair is naturally traced off a plan. This is the case that used to
//    produce a millimetre-deep sliver (or nothing) and left a void between the
//    flights. It must now build a real landing, silently.
{
  const s = stair({
    flights: [
      { x0: 0, y0: 0, x1: 3, y1: 0 },
      { x0: 3, y0: 1, x1: 0, y1: 1 },
    ],
  });
  const m = stairMetrics(s);
  const ls = stairLandings(s);
  ok(ls.length === 2, `flush half-turn builds a landing + the top stub (got ${ls.length})`);
  ok(
    area(ls[0]?.poly ?? []) >= s.width * (1 + s.width) * 0.9,
    `flush U landing spans both flights (got ${area(ls[0]?.poly ?? []).toFixed(2)} m²)`,
  );
  ok(contains(ls[0]?.poly ?? [], 3.2, 0.5), "and covers the crossover past both flight ends");
  ok(!m.warnings.some((w) => w.includes("head-on")), "no head-on warning for a flush turn");
}

// 6b. Two collinear flights meeting head-on genuinely have nothing to bridge.
{
  const s = stair({
    flights: [
      { x0: 0, y0: 0, x1: 3, y1: 0 },
      { x0: 3, y0: 0, x1: 6, y1: 0 },
    ],
  });
  const m = stairMetrics(s);
  ok(m.warnings.some((w) => w.includes("head-on")), "flush straight continuation warns instead");
  ok(stairLandings(s).length === 1, "and emits only the top stub, not a zero-area quad");
}

// 6c. Style changes what CARRIES the stair, never its footprint or its steps.
{
  const flights = [
    { x0: 0, y0: 0, x1: 3, y1: 0 },
    { x0: 4, y0: 1, x1: 4, y1: 4 },
  ];
  const solid = stair({ flights });
  const open = stair({ flights, style: "open" });
  const ls = stairLandings(solid);
  const lo = stairLandings(open);

  ok(
    near(area(ls[0].poly), area(lo[0].poly)) && near(ls[0].top, lo[0].top),
    "open and solid landings share the same footprint and height",
  );
  ok(ls[0].base === 0, "solid: the turn landing is built down to the floor");
  ok(
    near(lo[0].base, lo[0].top - 0.15),
    `open: the turn landing stays a slab (base ${lo[0].base.toFixed(2)}, top ${lo[0].top.toFixed(2)})`,
  );
  ok(
    stairMetrics(open).steps === stairMetrics(solid).steps,
    "style does not change the step count",
  );
}

// 7. Uneven flight lengths still distribute exactly, never below one step.
{
  const s = stair({
    flights: [
      { x0: 0, y0: 0, x1: 5, y1: 0 },
      { x0: 6, y0: 0, x1: 6.2, y1: 0 },
      { x0: 7, y0: 0, x1: 9, y1: 0 },
    ],
  });
  const m = stairMetrics(s);
  ok(m.flights.reduce((a, f) => a + f.steps, 0) === m.steps, "uneven runs sum exactly");
  ok(m.flights.every((f) => f.steps >= 1), "no flight gets zero steps");
  ok(near(totalRun(s), 7.2), `total run adds up (got ${totalRun(s).toFixed(2)})`);
  ok(stepCount(s) === m.steps, "stepCount agrees with the metrics");
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
