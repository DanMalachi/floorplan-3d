import type { Ray } from "three";
import type { EligibleRoom } from "@/render/roomLighting";
import { pointInPolygon } from "@/lib/rooms/roomArea";
import { rayToPlanAt } from "@/viewport3d/dragPlane";
import { fixtureDropM } from "./linear";
import { FIXTURE_CATALOG_BY_ID } from "./catalog";

/** Cursor tracks the visible body, which can differ from the source origin. */
export function fixturePlacementDropM(assetId: string): number {
  const shape = FIXTURE_CATALOG_BY_ID.get(assetId)?.shape;
  if (shape === "flushSquare") return 0.037;
  if (shape === "flushDisc") return 0.022;
  if (shape === "pendant") return fixtureDropM(assetId) + 0.06;
  return fixtureDropM(assetId);
}

export function ceilingPlacement(ray: Ray, offset: { cx: number; cz: number }, rooms: EligibleRoom[], assetId: string): { x: number; y: number; sourceY: number; distance: number } | null {
  const drop = fixturePlacementDropM(assetId);
  const hits = rooms.flatMap((room) => {
    const height = room.ceilingHeight - drop;
    const p = rayToPlanAt(ray, height, offset);
    if (!p || !pointInPolygon(p.x, p.y, room.loop)) return [];
    const distance = Math.hypot(p.x - offset.cx - ray.origin.x, height - ray.origin.y, p.y - offset.cz - ray.origin.z);
    return [{ ...p, sourceY: room.ceilingHeight - fixtureDropM(assetId), distance }];
  });
  return hits.sort((a, b) => a.distance - b.distance)[0] ?? null;
}
