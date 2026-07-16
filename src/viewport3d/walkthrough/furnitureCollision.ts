// Furniture collision for the walkthrough camera (§5b): circle-vs-OBB, with
// slide, against the same plan-space rotation convention as the existing
// editor placement collider (src/viewport3d/collision.ts's `corners()`) —
// world_x/world_z stand in for plan x/y here (a pure translation by the
// recenter offset), so the rotation math is unchanged.

import type { Scene } from "@/schema/scene";
import { CATALOG_BY_ID } from "@/furniture/catalog";
import { WALKTHROUGH_CONFIG as CFG } from "./config";

export interface FurnitureOBB {
  cx: number;
  cz: number;
  halfW: number;
  halfD: number;
  angle: number; // radians, same convention as FurnitureItem.rotation
  cr: number; // bounding-circle radius, for the broad-phase cull
}

/**
 * Build furniture colliders from the live scene.
 *
 * Inclusion rule (there is no `PlacementType`/`PlacementConstraints` field in
 * this schema — confirmed at the Phase 0 discovery — so these are the only
 * two signals available, both decided with the user up front):
 *   - `FurnitureAsset.noCollide` (already used for rugs) excludes an item.
 *   - `FurnitureItem.elevation` at/above `furnitureElevationCutoffM` excludes
 *     an item (wall-mounted art, ceiling fixtures — anything hung above
 *     roughly chest height that a walking body passes under/beside).
 */
export function buildFurnitureColliders(scene: Scene, offset: { cx: number; cz: number }): FurnitureOBB[] {
  const out: FurnitureOBB[] = [];
  for (const item of scene.furniture) {
    const spec = CATALOG_BY_ID.get(item.assetId);
    if (!spec || spec.noCollide) continue;
    if ((item.elevation ?? 0) >= CFG.furnitureElevationCutoffM) continue;

    const halfW = spec.footprint.w / 2;
    const halfD = spec.footprint.d / 2;
    out.push({
      cx: item.x - offset.cx,
      cz: item.y - offset.cz,
      halfW,
      halfD,
      angle: item.rotation,
      cr: Math.hypot(halfW, halfD),
    });
  }
  return out;
}

/**
 * Depenetrate `pos` (mutated in place) against every nearby OBB. Same
 * push-along-normal-to-slide pattern as wall collision (`resolveWallCollision`
 * in `collision.ts`) — see that function's doc for why a straight normal
 * push produces sliding for free.
 */
export function resolveFurnitureCollision(
  pos: { x: number; z: number },
  obbs: FurnitureOBB[],
  playerRadius: number,
  moveLen: number,
): void {
  const searchPad = playerRadius + moveLen;
  for (let iter = 0; iter < 3; iter++) {
    for (const obb of obbs) {
      const bdx = pos.x - obb.cx;
      const bdz = pos.z - obb.cz;
      if (bdx * bdx + bdz * bdz > (obb.cr + searchPad) * (obb.cr + searchPad)) continue;

      // World delta -> the OBB's local (unrotated) frame.
      const c = Math.cos(obb.angle);
      const s = Math.sin(obb.angle);
      const lx = bdx * c + bdz * s;
      const lz = -bdx * s + bdz * c;
      const clx = Math.min(obb.halfW, Math.max(-obb.halfW, lx));
      const clz = Math.min(obb.halfD, Math.max(-obb.halfD, lz));

      if (clx !== lx || clz !== lz) {
        // Player center is outside the box — clamped point is the true
        // closest boundary point. Local -> world, then push along the
        // world-space normal from that point to the player.
        const wx = obb.cx + clx * c - clz * s;
        const wz = obb.cz + clx * s + clz * c;
        const dx = pos.x - wx;
        const dz = pos.z - wz;
        const dist = Math.hypot(dx, dz);
        if (dist >= playerRadius || dist < 1e-9) continue;
        const push = (playerRadius - dist) / dist;
        pos.x += dx * push;
        pos.z += dz * push;
      } else {
        // Degenerate: center already inside the box (fast move / spawn
        // overlap). Push out along whichever local axis has the least
        // penetration, same idea as a shallow-AABB-penetration resolve.
        const penX = obb.halfW - Math.abs(lx);
        const penZ = obb.halfD - Math.abs(lz);
        let plx = lx;
        let plz = lz;
        if (penX < penZ) plx = lx >= 0 ? obb.halfW + playerRadius : -(obb.halfW + playerRadius);
        else plz = lz >= 0 ? obb.halfD + playerRadius : -(obb.halfD + playerRadius);
        pos.x = obb.cx + plx * c - plz * s;
        pos.z = obb.cz + plx * s + plz * c;
      }
    }
  }
}
