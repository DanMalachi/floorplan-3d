// Wall-plane raycasting (Kitchen v2.1): anything wall-mounted is placed by
// pointing AT a wall face — the pointer ray is intersected with every solid
// wall's two vertical face planes analytically, no mesh raycast, no floor
// projection. Gives the hit wall, which FACE (the one looking at the camera),
// the along-wall offset and the HEIGHT on the wall — the whole wall-grid
// coordinate in one shot.

import type * as THREE from "three";
import type { Scene } from "@/schema/scene";
import { DEFAULT_THICKNESS, WALL_HEIGHT } from "@/schema/constants";
import { pointInPolygon } from "@/lib/rooms/roomArea";

export interface WallRayHit {
  wallId: string;
  side: "a" | "b"; // face convention matches WallMesh/roomLighting: "a" = +normal (-uy, ux)
  along: number; // meters from node a along the wall
  height: number; // meters above the floor at the hit point
  x: number; // plan point of the hit (on the face)
  y: number;
  L: number; // wall length, for clamping by callers
  t: number; // ray distance to the face — lets callers pick it over a floor hit
  onTop: boolean; // the ray landed on the wall's TOP, so `side` was inferred
}

/** Which side of a wall a room lies on, at a given plan point, or `fallback`
 *  when the rooms don't decide it (a room on both sides, or on neither).
 *  (nx, ny) is the wall's +normal, i.e. the "a" side. */
function roomSideAt(
  scene: Scene,
  x: number,
  y: number,
  nx: number,
  ny: number,
  fallback: 1 | -1,
): 1 | -1 {
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  const probe = 0.35;
  let hitPlus = false;
  let hitMinus = false;
  for (const room of scene.rooms) {
    const poly = room.loop.map((id) => nodes.get(id)).filter((n): n is NonNullable<typeof n> => !!n);
    if (poly.length < 3) continue;
    if (pointInPolygon(x + nx * probe, y + ny * probe, poly)) hitPlus = true;
    if (pointInPolygon(x - nx * probe, y - ny * probe, poly)) hitMinus = true;
  }
  if (hitPlus !== hitMinus) return hitPlus ? 1 : -1;
  return fallback;
}

/**
 * The face of `wallId` that a room is on, defaulting to the face that was
 * pointed at. Cabinets belong in a room: a camera outside the building sees
 * (and a ray therefore lands on) the EXTERIOR face, and gluing a kitchen run
 * to the outside of the house was the single worst placement bug. When both
 * sides are rooms — an internal wall — the face you pointed at is the one you
 * meant, and this changes nothing.
 */
export function roomFacingSide(
  scene: Scene,
  wallId: string,
  x: number,
  y: number,
  pointed: "a" | "b",
): "a" | "b" {
  const w = scene.walls.find((s) => s.id === wallId);
  if (!w) return pointed;
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  const a = nodes.get(w.a);
  const b = nodes.get(w.b);
  if (!a || !b) return pointed;
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1e-6) return pointed;
  const ux = (b.x - a.x) / L;
  const uy = (b.y - a.y) / L;
  return roomSideAt(scene, x, y, -uy, ux, pointed === "a" ? 1 : -1) === 1 ? "a" : "b";
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
  /** Also count a hit on a wall's TOP (see below). Opt-in: a fixture pointing
   *  at a wall means a face, while a run being drawn from above means the
   *  wall itself. */
  tops = false,
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
      best = { t, wallId: w.id, side, along, height: hy, x: hx, y: hz, L, onTop: false };
    }

    // The wall's TOP. From above (Top view, or any steep angle) the pointer
    // lands here, not on a face, and the ray then carries on to the floor
    // BEHIND the wall — which is how a run ended up glued to the exterior
    // side. Pointing at a wall means that wall; the side is the one a room is
    // on, or failing that the one the camera is on.
    const h = w.height ?? WALL_HEIGHT;
    if (tops && dy < -1e-9) {
      const t = (h - oy) / dy;
      if (t > 0 && (!best || t < best.t)) {
        const hx = ox + dx * t;
        const hz = oz + dz * t;
        const along = (hx - a.x) * ux + (hz - a.y) * uy;
        const lat = (hx - a.x) * -uy + (hz - a.y) * ux;
        if (along >= 0 && along <= L && Math.abs(lat) <= th / 2 + 1e-6) {
          const cameraSide = (ox - a.x) * -uy + (oz - a.y) * ux >= 0 ? 1 : -1;
          const sign = roomSideAt(scene, hx, hz, -uy, ux, cameraSide as 1 | -1);
          best = {
            t, wallId: w.id, side: sign === 1 ? "a" : "b", along, height: h,
            // Report the point on the chosen FACE, like a face hit does.
            x: a.x + ux * along + -uy * sign * (th / 2),
            y: a.y + uy * along + ux * sign * (th / 2),
            L, onTop: true,
          };
        }
      }
    }
  }
  return best && {
    wallId: best.wallId, side: best.side, along: best.along,
    height: best.height, x: best.x, y: best.y, L: best.L, t: best.t, onTop: best.onTop,
  };
}
