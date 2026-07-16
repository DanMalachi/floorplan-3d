// Wall collision for the walkthrough camera (§5a): circle-vs-segment, with
// sliding, against the same post-split geometry the renderer uses — so a
// doorway is genuinely open, not something we have to special-case.

import type { Scene } from "@/schema/scene";
import { isSolidWall } from "@/schema/scene";
import { nodeMap } from "@/lib/rooms/roomArea";
import { buildWallSegments } from "../geometry/buildWallSegments";
import { RAIL_PANEL_THK } from "../WallMesh";
import { WALKTHROUGH_CONFIG as CFG } from "./config";

/** A 2D collision obstacle in WORLD space (already offset-adjusted), as a
 *  thick line segment. `cx`/`cr` are a precomputed bounding circle used for
 *  the broad-phase distance cull before the exact closest-point test. */
export interface Segment2D {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  halfThickness: number;
  cx: number;
  cz: number;
  cr: number;
}

function makeSegment(ax: number, az: number, bx: number, bz: number, halfThickness: number): Segment2D {
  const cx = (ax + bx) / 2;
  const cz = (az + bz) / 2;
  const halfLen = Math.hypot(bx - ax, bz - az) / 2;
  return { ax, az, bx, bz, halfThickness, cx, cz, cr: halfLen + halfThickness };
}

/**
 * Build the walkthrough's wall/rail colliders from the live scene.
 *
 * Solid walls (`kind` undefined/"wall") reuse `buildWallSegments` — the exact
 * same post-opening-split boxes the renderer draws — so a door or passage's
 * gap is genuinely absent from the collider list. But a piece's footprint
 * alone isn't enough: a standard door (say 2.0m in a 2.4m wall) still gets a
 * lintel piece for the header above the frame, and using every piece
 * regardless of height would make that lintel block the player at floor
 * level too — a real doorway with a wall in it. Only a piece whose bottom
 * edge is below `bodyHeightM` gets a collider: a between-openings span or a
 * window's below-sill box always starts at the floor (kept), a lintel over
 * a tall-enough door starts above head height (dropped), and a lintel over a
 * genuinely short opening still blocks (there's no crouching, so that's
 * correct).
 *
 * Rails render no wall body (`buildWallSegments` returns `[]` for them) but
 * are a real physical barrier at torso height, so they get one uncut segment
 * spanning the full wall (rails don't carve openings). Portals are fully
 * open — no collider, same as a real doorway gap.
 */
export function buildWallColliders(scene: Scene, offset: { cx: number; cz: number }): Segment2D[] {
  const nodes = nodeMap(scene.nodes);
  const segments: Segment2D[] = [];

  for (const wall of scene.walls) {
    if (wall.kind === "portal") continue;

    if (wall.kind === "rail") {
      const a = nodes.get(wall.a);
      const b = nodes.get(wall.b);
      if (!a || !b) continue;
      segments.push(
        makeSegment(a.x - offset.cx, a.y - offset.cz, b.x - offset.cx, b.y - offset.cz, RAIL_PANEL_THK / 2),
      );
      continue;
    }

    if (!isSolidWall(wall)) continue;
    const a = nodes.get(wall.a);
    const b = nodes.get(wall.b);
    if (!a || !b) continue;
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-6) continue;
    const ux = (b.x - a.x) / L;
    const uy = (b.y - a.y) / L;

    const wallOpenings = scene.openings.filter((o) => o.wallId === wall.id);
    const pieces = buildWallSegments(wall, wallOpenings, nodes);
    for (const p of pieces) {
      const yBottom = p.position[1] - p.size[1] / 2;
      if (yBottom >= CFG.bodyHeightM) continue; // a lintel above head height — not a real obstacle

      const half = p.size[0] / 2;
      const [px, , pz] = p.position;
      segments.push(
        makeSegment(
          px - ux * half - offset.cx,
          pz - uy * half - offset.cz,
          px + ux * half - offset.cx,
          pz + uy * half - offset.cz,
          p.size[2] / 2,
        ),
      );
    }
  }

  return segments;
}

/** Closest point on segment [a,b] to point p, all in the XZ plane. */
function closestPointOnSegment(px: number, pz: number, seg: Segment2D): { x: number; z: number } {
  const abx = seg.bx - seg.ax;
  const abz = seg.bz - seg.az;
  const lenSq = abx * abx + abz * abz;
  if (lenSq < 1e-12) return { x: seg.ax, z: seg.az };
  let t = ((px - seg.ax) * abx + (pz - seg.az) * abz) / lenSq;
  t = Math.min(1, Math.max(0, t));
  return { x: seg.ax + abx * t, z: seg.az + abz * t };
}

/**
 * Depenetrate `pos` (mutated in place) against every nearby segment.
 *
 * Pushing straight out along the collision normal — rather than cancelling
 * the whole attempted move — is what gives sliding "for free": if the player
 * was already at the wall, the normal push exactly cancels this frame's
 * into-wall component of motion and leaves the tangential component intact.
 * Iterating a few times over all segments lets two walls meeting at a corner
 * settle instead of fighting/jittering or letting the player tunnel through
 * the gap between two single-pass corrections.
 */
export function resolveWallCollision(
  pos: { x: number; z: number },
  segments: Segment2D[],
  playerRadius: number,
  moveLen: number,
): void {
  const searchPad = playerRadius + moveLen;
  for (let iter = 0; iter < 3; iter++) {
    for (const seg of segments) {
      // Broad-phase: cheap bounding-circle distance check before the exact
      // closest-point-on-segment projection.
      const bdx = pos.x - seg.cx;
      const bdz = pos.z - seg.cz;
      if (bdx * bdx + bdz * bdz > (seg.cr + searchPad) * (seg.cr + searchPad)) continue;

      const closest = closestPointOnSegment(pos.x, pos.z, seg);
      const dx = pos.x - closest.x;
      const dz = pos.z - closest.z;
      const dist = Math.hypot(dx, dz);
      const minDist = playerRadius + seg.halfThickness;
      if (dist >= minDist) continue;
      if (dist < 1e-9) {
        // Degenerate: player center exactly on the wall's line. Push along
        // the segment's normal (arbitrary side — this never happens from a
        // legitimate walk, only from a spawn/teleport dropped on a wall).
        const abx = seg.bx - seg.ax;
        const abz = seg.bz - seg.az;
        const len = Math.hypot(abx, abz) || 1;
        pos.x += (-abz / len) * minDist;
        pos.z += (abx / len) * minDist;
        continue;
      }
      const push = (minDist - dist) / dist;
      pos.x += dx * push;
      pos.z += dz * push;
    }
  }
}
