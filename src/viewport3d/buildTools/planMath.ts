// Shared plan-space math for the new build tools (WallTool, OpeningTool).
// Deliberately its own file rather than an addition to snap.ts — snap.ts is
// listed as import-only support for the protected 3D layer, and these are
// fresh, scene-agnostic helpers the new tools own outright. No protected
// file is edited or imported-from in a way that changes its behavior.

import type { Node, Scene, Wall } from "@/schema/scene";
import { isSolidWall } from "@/schema/scene";
import { DEFAULT_THICKNESS, WALL_HEIGHT } from "@/schema/constants";

/** Meters — how close a click must land to an existing node to reuse it
 *  (merge) instead of minting a near-duplicate. Matches snap.ts's ALIGN_TOL
 *  "generous, Sims-style magnetic feel" rather than inventing a new constant. */
export const NODE_MERGE_TOL = 0.15;

/** Nearest existing node within NODE_MERGE_TOL, if any. Clicking near a
 *  corner should snap onto it so the new wall mitres into it exactly,
 *  rather than leaving a hairline gap between two almost-coincident nodes. */
export function nearestNode(x: number, y: number, nodes: readonly Node[]): Node | null {
  let best: Node | null = null;
  let bestD = NODE_MERGE_TOL;
  for (const n of nodes) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d <= bestD) {
      best = n;
      bestD = d;
    }
  }
  return best;
}

/** A wall's local frame: origin at node a, unit direction (ux,uy), length,
 *  height and thickness. Mirrors WallMesh.tsx's own (private, unexported)
 *  WallFrame — duplicated deliberately rather than importing from a
 *  protected file, since WallMesh.tsx must not be touched beyond its
 *  approved gate/eyedropper edits. */
export interface WallFrame {
  ax: number;
  ay: number;
  ux: number;
  uy: number;
  L: number;
  wallH: number;
  th: number;
  rotationY: number;
}

export function wallFrameOf(wall: Wall, nodes: ReadonlyMap<string, Node>): WallFrame | null {
  const a = nodes.get(wall.a);
  const b = nodes.get(wall.b);
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  return {
    ax: a.x,
    ay: a.y,
    ux: dx / L,
    uy: dy / L,
    L,
    wallH: wall.height ?? WALL_HEIGHT,
    th: wall.thickness ?? DEFAULT_THICKNESS,
    rotationY: -Math.atan2(dy, dx),
  };
}

/** Nearest SOLID wall to a plan point within `maxDist` of its centerline —
 *  the wall the Opening tool's ghost should ride — plus `s`, how far along
 *  it (meters from node a, clamped to the wall's own span) the point
 *  projects. Rails/portals are never solid (no gap to cut a door into),
 *  same rule WallMesh's own geometry uses via `isSolidWall`. */
export function nearestWallHit(
  x: number,
  y: number,
  scene: Scene,
  maxDist = 0.5,
): { wall: Wall; s: number; frame: WallFrame } | null {
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  let best: { wall: Wall; s: number; frame: WallFrame; d: number } | null = null;
  for (const wall of scene.walls) {
    if (!isSolidWall(wall)) continue;
    const frame = wallFrameOf(wall, nodes);
    if (!frame) continue;
    const sRaw = (x - frame.ax) * frame.ux + (y - frame.ay) * frame.uy;
    const s = Math.min(frame.L, Math.max(0, sRaw));
    const px = frame.ax + frame.ux * s;
    const py = frame.ay + frame.uy * s;
    const d = Math.hypot(x - px, y - py);
    if (d <= maxDist && (!best || d < best.d)) best = { wall, s, frame, d };
  }
  return best ? { wall: best.wall, s: best.s, frame: best.frame } : null;
}
