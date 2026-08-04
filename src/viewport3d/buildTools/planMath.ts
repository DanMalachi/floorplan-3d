// Shared plan-space math for the new build tools (WallTool, OpeningTool,
// MeasureTool). Deliberately its own file rather than an addition to
// snap.ts — snap.ts is listed as import-only support for the protected 3D
// layer, and these are fresh, scene-agnostic helpers the new tools own
// outright. No protected file is edited or imported-from in a way that
// changes its behavior.

import * as THREE from "three";
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

export interface SurfaceHit {
  /** Group-local coordinates — same convention as `rayToPlan`'s output and
   *  everything else rendered inside Viewport.tsx's `<group position={[-cx,
   *  0, -cz]}>`: x/z are plan (x,y) and y is real world height. Callers can
   *  feed this straight into a mesh's `position` prop without further
   *  conversion. */
  point: THREE.Vector3;
  kind: "floor" | "ceiling" | "wall";
  wallId?: string;
}

const WORLD_FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const WORLD_CEILING_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), -WALL_HEIGHT);

// The ceiling plane is mathematically infinite, but a real ceiling mesh only
// exists over the building's own footprint — and, per FloorMesh.tsx's own
// `Ceilings` component (`hidden = !show || wallMode !== "full"`), only
// renders at all in Full view with the Ceilings toggle on. Left unconditional,
// an overhead orbit camera's ray (the norm in Cutaway/Top, where the ceiling
// is deliberately hidden so you can see inside) crosses y=WALL_HEIGHT closer
// to the camera than it ever reaches y=0 — so it "wins" nearest-wins even
// when the user is clearly clicking the floor well inside a room, just
// because the ray's shallow downward angle drifts it sideways between the
// two heights. Two gates: (1) the caller-supplied `ceilingVisible` mirrors
// FloorMesh.tsx's own visibility condition so a hidden ceiling never
// competes at all; (2) even when visible, bound it to the building's
// plan-space bounding box (+ slack for wall-thickness overhang) so it can't
// win from a stray ray that never comes near the building. The floor plane
// stays unbounded and unconditional — it's the explicit fallback baseline.
const CEILING_BOUNDS_SLACK = 0.5;

function planBoundsOf(nodes: ReadonlyMap<string, Node>): { minX: number; maxX: number; minY: number; maxY: number } | null {
  if (nodes.size === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of nodes.values()) {
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y);
    maxY = Math.max(maxY, n.y);
  }
  return { minX: minX - CEILING_BOUNDS_SLACK, maxX: maxX + CEILING_BOUNDS_SLACK, minY: minY - CEILING_BOUNDS_SLACK, maxY: maxY + CEILING_BOUNDS_SLACK };
}

/** Casts `ray` (world-space, e.g. a ThreeEvent's `e.ray`) against the floor,
 *  the ceiling, and every solid wall's two faces, and returns whichever
 *  valid hit sits nearest the ray origin — a cheap stand-in for real mesh
 *  raycasting (nearest visible surface wins) that doesn't require touching
 *  protected WallMesh.tsx geometry. Built for MeasureTool's wall/ceiling
 *  picking; `offset` is the same `{cx, cz}` every other tool in this file
 *  already threads through (Viewport's recenter group's negated position).
 *  Rails/portals are skipped via `isSolidWall`, same as `nearestWallHit`.
 *
 *  `nodes` is `scene.nodes` pre-indexed by id (what `wallFrameOf` needs) —
 *  taken as a parameter rather than rebuilt here so a pointer-move-rate
 *  caller can build it once via `useMemo` instead of on every call.
 *  `ceilingVisible` should mirror `wallMode === "full" && showCeilings` —
 *  see the note above. */
export function raycastSceneSurfaces(
  ray: THREE.Ray,
  scene: Scene,
  offset: { cx: number; cz: number },
  nodes: ReadonlyMap<string, Node>,
  ceilingVisible: boolean,
): SurfaceHit | null {
  let best: { point: THREE.Vector3; kind: SurfaceHit["kind"]; wallId?: string; dist: number } | null = null;
  const consider = (worldHit: THREE.Vector3, kind: SurfaceHit["kind"], wallId?: string) => {
    const dist = ray.origin.distanceTo(worldHit);
    if (!best || dist < best.dist) {
      best = {
        point: new THREE.Vector3(worldHit.x + offset.cx, worldHit.y, worldHit.z + offset.cz),
        kind,
        wallId,
        dist,
      };
    }
  };

  const tmp = new THREE.Vector3();
  if (ray.intersectPlane(WORLD_FLOOR_PLANE, tmp)) consider(tmp, "floor");
  if (ceilingVisible && ray.intersectPlane(WORLD_CEILING_PLANE, tmp)) {
    const bounds = planBoundsOf(nodes);
    const localX = tmp.x + offset.cx;
    const localZ = tmp.z + offset.cz;
    const inBounds = !bounds || (localX >= bounds.minX && localX <= bounds.maxX && localZ >= bounds.minY && localZ <= bounds.maxY);
    if (inBounds) consider(tmp, "ceiling");
  }

  for (const wall of scene.walls) {
    if (!isSolidWall(wall)) continue;
    const frame = wallFrameOf(wall, nodes);
    if (!frame) continue;
    // Plan-space outward normal, rotated 90° from the wall's unit direction.
    const nx = -frame.uy;
    const ny = frame.ux;
    for (const side of [1, -1] as const) {
      const localFaceX = frame.ax + nx * (frame.th / 2) * side;
      const localFaceZ = frame.ay + ny * (frame.th / 2) * side;
      const worldFaceX = localFaceX - offset.cx;
      const worldFaceZ = localFaceZ - offset.cz;
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        new THREE.Vector3(nx * side, 0, ny * side),
        new THREE.Vector3(worldFaceX, 0, worldFaceZ),
      );
      const hit = new THREE.Vector3();
      if (!ray.intersectPlane(plane, hit)) continue;
      // Validate against the wall's actual span/height in plan space.
      const localX = hit.x + offset.cx;
      const localZ = hit.z + offset.cz;
      const s = (localX - frame.ax) * frame.ux + (localZ - frame.ay) * frame.uy;
      if (s < 0 || s > frame.L) continue;
      if (hit.y < 0 || hit.y > frame.wallH) continue;
      consider(hit, "wall", wall.id);
    }
  }

  return best;
}
