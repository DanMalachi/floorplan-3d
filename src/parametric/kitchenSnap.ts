// Align-to-base-run snapping for kitchenWall (docs/parametric-furniture.md R2
// "actually connect"). Plan-space vector math only — no THREE import needed.
// Local-axis convention matches collision.ts's OBB corners(): for an item at
// `rotation`, local +X (tangent, "right") maps to world (cosθ, sinθ) and
// local +Z (depth/front) maps to world (-sinθ, cosθ) — the same normal
// snapToWall already uses.

import type { Scene } from "@/schema/scene";
import type { ItemLike } from "@/furniture/spec";

const ANGLE_TOL = (6 * Math.PI) / 180;
const BACK_TOL = 0.55;
const UNIT = 0.6;

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

const tangentOf = (rotation: number): [number, number] => [Math.cos(rotation), Math.sin(rotation)];
const normalOf = (rotation: number): [number, number] => [-Math.sin(rotation), Math.cos(rotation)];

/** When a kitchenWall row is dragged near a kitchenBase run on the same wall
 *  (|Δrotation| < 6°, back faces within 0.55m in plan), snap its x/y so the
 *  row's left edge aligns to the base run's left edge or its unit grid
 *  (0.6m steps), whichever is nearer; and pull it flush to the same wall.
 *  Returns null when nothing is near. */
export function snapKitchenWall(
  item: ItemLike & { x: number; y: number; rotation: number },
  scene: Scene,
): { x: number; y: number; rotation: number } | null {
  const spec = item.parametric;
  if (!spec) return null;
  const [tx, ty] = tangentOf(item.rotation);
  const [nx, ny] = normalOf(item.rotation);
  const itemBackX = item.x - nx * (spec.dims.d / 2);
  const itemBackY = item.y - ny * (spec.dims.d / 2);
  const itemLeftX = item.x - tx * (spec.dims.w / 2);
  const itemLeftY = item.y - ty * (spec.dims.w / 2);

  let bestDist = Infinity;
  let bestX = 0;
  let bestY = 0;
  let bestW = 0;
  let bestD = 0;
  let bestRotation = 0;
  let found = false;
  for (const f of scene.furniture) {
    if (f.parametric?.generator !== "kitchenBase") continue;
    if (Math.abs(angleDiff(item.rotation, f.rotation)) > ANGLE_TOL) continue;
    const [bnx, bny] = normalOf(f.rotation);
    const backX = f.x - bnx * (f.parametric.dims.d / 2);
    const backY = f.y - bny * (f.parametric.dims.d / 2);
    // Perpendicular (off-the-wall) offset only — two runs "on the same wall"
    // can sit anywhere along its length, so the along-wall component of the
    // distance between their back-face centers must not count against them.
    const dist = Math.abs((itemBackX - backX) * bnx + (itemBackY - backY) * bny);
    if (dist > BACK_TOL || dist >= bestDist) continue;
    bestDist = dist;
    bestX = f.x;
    bestY = f.y;
    bestW = f.parametric.dims.w;
    bestD = f.parametric.dims.d;
    bestRotation = f.rotation;
    found = true;
  }
  if (!found) return null;

  const [btx, bty] = tangentOf(bestRotation);
  const [bnx, bny] = normalOf(bestRotation);
  const baseBackLeftX = bestX - btx * (bestW / 2) - bnx * (bestD / 2);
  const baseBackLeftY = bestY - bty * (bestW / 2) - bny * (bestD / 2);

  // Candidate A: flush with the base run's own left edge. Candidate B: the
  // nearest 0.6m unit-grid step from that edge. Whichever is nearer to the
  // item's current (pre-snap) left edge wins.
  const alongOffset = (itemLeftX - baseBackLeftX) * btx + (itemLeftY - baseBackLeftY) * bty;
  const gridOffset = Math.max(0, Math.round(alongOffset / UNIT) * UNIT);
  const chosen = Math.abs(alongOffset) <= Math.abs(alongOffset - gridOffset) ? 0 : gridOffset;

  const targetLeftX = baseBackLeftX + btx * chosen;
  const targetLeftY = baseBackLeftY + bty * chosen;
  const x = targetLeftX + btx * (spec.dims.w / 2) + bnx * (spec.dims.d / 2);
  const y = targetLeftY + bty * (spec.dims.w / 2) + bny * (spec.dims.d / 2);
  return { x, y, rotation: bestRotation };
}
