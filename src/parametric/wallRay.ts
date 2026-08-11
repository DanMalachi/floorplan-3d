// Wall-plane raycasting (Kitchen v2.1): anything wall-mounted is placed by
// pointing AT a wall face — the pointer ray is intersected with every solid
// wall's two vertical face planes analytically, no mesh raycast, no floor
// projection. Gives the hit wall, which FACE (the one looking at the camera),
// the along-wall offset and the HEIGHT on the wall — the whole wall-grid
// coordinate in one shot.

import type * as THREE from "three";
import type { Scene } from "@/schema/scene";
import { DEFAULT_THICKNESS, WALL_HEIGHT } from "@/schema/constants";

export interface WallRayHit {
  wallId: string;
  side: "a" | "b"; // face convention matches WallMesh/roomLighting: "a" = +normal (-uy, ux)
  along: number; // meters from node a along the wall
  height: number; // meters above the floor at the hit point
  x: number; // plan point of the hit (on the face)
  y: number;
  L: number; // wall length, for clamping by callers
}

/**
 * Nearest wall FACE along the pointer ray, in plan coordinates (the caller's
 * recentre offset is applied here). Only front-facing planes count — the ray
 * lands on the face you see, never the far side of the wall.
 */
export function rayToWall(
  ray: THREE.Ray,
  scene: Scene,
  offset: { cx: number; cz: number },
): WallRayHit | null {
  const ox = ray.origin.x + offset.cx;
  const oy = ray.origin.y;
  const oz = ray.origin.z + offset.cz;
  const dx = ray.direction.x;
  const dy = ray.direction.y;
  const dz = ray.direction.z;

  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  let best: (WallRayHit & { t: number }) | null = null;

  for (const w of scene.walls) {
    if (w.kind === "rail" || w.kind === "portal") continue;
    const a = nodes.get(w.a);
    const b = nodes.get(w.b);
    if (!a || !b) continue;
    const wx = b.x - a.x;
    const wy = b.y - a.y;
    const L = Math.hypot(wx, wy);
    if (L < 1e-6) continue;
    const ux = wx / L;
    const uy = wy / L;
    const th = w.thickness ?? DEFAULT_THICKNESS;

    for (const side of ["a", "b"] as const) {
      const sign = side === "a" ? 1 : -1;
      const nx = -uy * sign; // plan normal of this face
      const ny = ux * sign;
      const denom = dx * nx + dz * ny;
      if (denom >= -1e-9) continue; // parallel or back-facing — you can't see this face
      // Plane point: wall line pushed out to the face.
      const px = a.x + nx * (th / 2);
      const py = a.y + ny * (th / 2);
      const t = ((px - ox) * nx + (py - oz) * ny) / denom;
      if (t <= 0 || (best && t >= best.t)) continue;
      const hx = ox + dx * t;
      const hy = oy + dy * t;
      const hz = oz + dz * t;
      const along = (hx - a.x) * ux + (hz - a.y) * uy;
      if (along < 0 || along > L) continue;
      if (hy < 0.02 || hy > WALL_HEIGHT) continue;
      best = { t, wallId: w.id, side, along, height: hy, x: hx, y: hz, L };
    }
  }
  return best && {
    wallId: best.wallId, side: best.side, along: best.along,
    height: best.height, x: best.x, y: best.y, L: best.L,
  };
}
