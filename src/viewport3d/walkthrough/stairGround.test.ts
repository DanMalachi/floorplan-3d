// Headless: prove the walking surface a stair presents to the walkthrough rig.
// Run: npx tsx src/viewport3d/walkthrough/stairGround.test.ts

import type { Scene, Stair } from "@/schema/scene";
import { stairMetrics } from "@/lib/stairs/stairGeometry";
import { buildStairGround, groundHeightAt } from "./stairGround";

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) fails++;
};
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) < tol;

const NONE = { cx: 0, cz: 0 };
const scene = (stairs: Stair[]): Scene => ({
  schemaVersion: 2,
  units: "meters",
  nodes: [],
  walls: [],
  openings: [],
  rooms: [],
  furniture: [],
  stairs,
});

// A storey stair running +X from the origin: 4 m run, 2.4 m rise, 0.9 m wide.
const straight: Stair = {
  id: "st0",
  flights: [{ x0: 0, y0: 0, x1: 4, y1: 0 }],
  width: 0.9,
  rise: 2.4,
};

{
  const m = stairMetrics(straight);
  const g = buildStairGround(scene([straight]), NONE);
  const at = (x: number, z: number) => groundHeightAt(g, x, z);

  ok(at(-0.5, 0) === 0, "the floor in front of the stair is 0");
  ok(at(5, 0) === 0, "the floor past the head is 0");
  ok(at(2, 1.2) === 0, "beside the flight, outside its width, is 0");
  ok(near(at(2, 0.4), at(2, -0.4)), "both sides of the centerline are the same step");

  ok(near(at(0.01, 0), m.riser), "the very foot is already the FIRST tread, one riser up");
  const step5 = m.flights[0].going * 4 + 0.01; // just inside tread index 4
  ok(near(at(step5, 0), m.riser * 5), `mid-flight is step 5 (got ${at(step5, 0).toFixed(3)} m)`);
  ok(near(at(3.999, 0), 2.4), "the head of the flight is the full rise");

  // Every sample climbs by at most one riser as you walk the centerline: the
  // rig's step-up rule depends on it.
  let worst = 0;
  let prev = 0;
  for (let x = -0.2; x <= 4.2; x += 0.01) {
    const h = at(x, 0);
    worst = Math.max(worst, h - prev);
    prev = h;
  }
  ok(near(worst, m.riser, 1e-9), `walking up gains at most one riser per sample (${worst.toFixed(3)} m)`);
}

// The top landing stub is standable, at the full rise.
{
  const g = buildStairGround(scene([straight]), NONE);
  ok(near(groundHeightAt(g, 4.4, 0), 2.4), "the landing stub past the head carries you at rise");
  ok(groundHeightAt(g, 4.4, 2) === 0, "but only within its own footprint");
}

// A U-stair: the turn landing is standable at the first flight's top, and the
// second flight continues up from there.
{
  const u: Stair = {
    id: "st1",
    flights: [
      { x0: 0, y0: 0, x1: 3, y1: 0 },
      { x0: 3, y0: 1, x1: 0, y1: 1 },
    ],
    width: 0.9,
    rise: 2.4,
  };
  const m = stairMetrics(u);
  const g = buildStairGround(scene([u]), NONE);
  const landing = groundHeightAt(g, 3.5, 0.5);
  ok(near(landing, m.flights[0].topHeight), `the U's turn landing is at flight 1's top (${landing.toFixed(2)} m)`);
  // Flight 2 runs BACK along -X: its foot is at x=3, its head at x=0.
  ok(
    near(groundHeightAt(g, 2.99, 1), m.flights[0].topHeight + m.riser),
    "stepping off the landing onto flight 2 is exactly one riser up",
  );
  ok(near(groundHeightAt(g, 0.01, 1), 2.4), "and its head tops out at the full rise");
}

// The recenter offset is applied: the rig samples WORLD coords, not plan ones.
{
  const g = buildStairGround(scene([straight]), { cx: 10, cz: 5 });
  ok(groundHeightAt(g, 2, 0) === 0, "plan coords no longer hit the stair");
  ok(groundHeightAt(g, 2 - 10, 0 - 5) > 0, "world coords do");
}

// A scene with no stairs is flat, and cheap.
{
  const g = buildStairGround(scene([]), NONE);
  ok(groundHeightAt(g, 1, 1) === 0 && g.flights.length === 0, "no stairs, no surfaces");
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
