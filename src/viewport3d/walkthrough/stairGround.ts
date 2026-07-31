// The walking SURFACE under the player (§ stairs): how high the floor is at a
// given point, which is 0 everywhere except on a staircase.
//
// This is what makes a traced stair climbable rather than an obstacle. The rig
// samples this every frame, moves the eye to `ground + eyeHeight`, and refuses
// a move that would gain more height than a step (`stepUpM`) — one rule that
// both lets you walk UP a flight from its foot and stops you walking onto the
// side of one at head height, with no extra collider.
//
// World space, like every other collider here: plan (x, y) minus the recenter
// offset becomes world (x, z). Heights need no offset — the floor is y=0.

import type { Scene } from "@/schema/scene";
import { stairLandings, stairMetrics } from "@/lib/stairs/stairGeometry";

/** One flight, as a strip you can stand on: a local frame plus its step run. */
interface FlightSurface {
  ox: number; // foot, world
  oz: number;
  dx: number; // unit direction, world
  dz: number;
  run: number;
  halfW: number;
  base: number; // height of the flight's foot
  top: number; // height of its head
  riser: number;
  going: number;
}

/** A landing, as a flat polygon at one height. */
interface LandingSurface {
  poly: { x: number; z: number }[]; // convex, world
  top: number;
}

export interface StairGround {
  flights: FlightSurface[];
  landings: LandingSurface[];
}

export const EMPTY_STAIR_GROUND: StairGround = { flights: [], landings: [] };

/** Precompute every stair surface in the scene, in world space. */
export function buildStairGround(scene: Scene, offset: { cx: number; cz: number }): StairGround {
  const flights: FlightSurface[] = [];
  const landings: LandingSurface[] = [];

  for (const stair of scene.stairs ?? []) {
    const m = stairMetrics(stair);

    stair.flights.forEach((f, i) => {
      const fm = m.flights[i];
      if (!fm || fm.steps < 1) return;
      const dx = f.x1 - f.x0;
      const dy = f.y1 - f.y0;
      const len = Math.hypot(dx, dy);
      if (len <= 1e-6) return;
      flights.push({
        ox: f.x0 - offset.cx,
        oz: f.y0 - offset.cz,
        dx: dx / len,
        dz: dy / len,
        run: fm.run,
        halfW: stair.width / 2,
        base: fm.baseHeight,
        top: fm.topHeight,
        riser: m.riser,
        going: fm.going,
      });
    });

    for (const l of stairLandings(stair)) {
      if (l.poly.length < 3) continue;
      landings.push({
        poly: l.poly.map((p) => ({ x: p.x - offset.cx, z: p.y - offset.cz })),
        top: l.top,
      });
    }
  }

  return { flights, landings };
}

/** Inside a CONVEX polygon (the landing hulls are convex by construction):
 *  every edge cross-product shares a sign. */
function insideConvex(poly: { x: number; z: number }[], x: number, z: number): boolean {
  let neg = false;
  let pos = false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cross = (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x);
    if (cross < -1e-9) neg = true;
    else if (cross > 1e-9) pos = true;
    if (neg && pos) return false;
  }
  return true;
}

/**
 * Height of the walking surface at a world point — the tread or landing under
 * it, else the floor at 0.
 *
 * A flight is sampled by which STEP the point falls in, so the climb is a
 * staircase of discrete levels rather than a ramp: tread i spans
 * `[i*going, (i+1)*going]` along the run and its top sits `(i+1)*riser` above
 * the flight's base, exactly like the extruded mesh.
 *
 * Overlaps take the highest surface — a landing sits at the head of the flight
 * that feeds it, and the walker should be on top of both.
 */
export function groundHeightAt(ground: StairGround, x: number, z: number): number {
  let h = 0;

  for (const f of ground.flights) {
    const px = x - f.ox;
    const pz = z - f.oz;
    const u = px * f.dx + pz * f.dz; // along the run
    if (u < 0 || u > f.run) continue;
    const v = px * -f.dz + pz * f.dx; // across it
    if (Math.abs(v) > f.halfW) continue;
    const step = f.going > 1e-9 ? Math.floor(u / f.going) + 1 : 1;
    const top = Math.min(f.top, f.base + step * f.riser);
    if (top > h) h = top;
  }

  for (const l of ground.landings) {
    if (l.top > h && insideConvex(l.poly, x, z)) h = l.top;
  }

  return h;
}
