"use client";

// Run-draw placement for kitchenBase/kitchenWall (docs/parametric-furniture.md
// R3). Click-drag-click, modeled on buildTools/WallTool.tsx's chained-click
// pattern rather than PlacementGhost's single click — a run has a length the
// user drags out, and can turn one corner into an L.

import { useEffect, useState } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { Node, Scene, Wall } from "@/schema/scene";
import { DEFAULT_THICKNESS } from "@/schema/constants";
import { useSceneStore } from "@/store/useSceneStore";
import { pdToast } from "@/ui/planDock/toast";
import { GENERATORS } from "@/parametric";
import { ParametricModel } from "./ParametricModel";

const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const START_RANGE = 0.45;
const CORNER_OVERSHOOT = 0.25;
const CORNER_ANGLE_MIN = (80 * Math.PI) / 180;
const CORNER_ANGLE_MAX = (100 * Math.PI) / 180;
const LEN_STEP = 0.1;
const yawOf = (rotation: number) => -rotation;

function rayToPlan(e: ThreeEvent<PointerEvent | MouseEvent>, offset: { cx: number; cz: number }) {
  const hit = new THREE.Vector3();
  if (!e.ray.intersectPlane(FLOOR_PLANE, hit)) return null;
  return { x: hit.x + offset.cx, y: hit.z + offset.cz };
}

const roundTo = (v: number, step: number) => Math.round(v / step) * step;

interface WallHit {
  wall: Wall;
  a: Node;
  b: Node;
  ux: number;
  uy: number;
  nx: number;
  ny: number;
  off: number; // flush distance from the wall centerline, toward this hit's side
}

function projectOnWall(x: number, y: number, a: Node, b: Node) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1e-6;
  const ux = dx / L;
  const uy = dy / L;
  const t = (x - a.x) * ux + (y - a.y) * uy;
  const px = a.x + ux * t;
  const py = a.y + uy * t;
  const side = (x - px) * -uy + (y - py) * ux;
  return { ux, uy, t, L, side };
}

function wallHit(wall: Wall, a: Node, b: Node, refX: number, refY: number, depth: number): WallHit {
  const { ux, uy, side } = projectOnWall(refX, refY, a, b);
  const sign = Math.sign(side) || 1;
  const nx = -uy * sign;
  const ny = ux * sign;
  const th = wall.thickness ?? DEFAULT_THICKNESS;
  return { wall, a, b, ux, uy, nx, ny, off: th / 2 + depth / 2 };
}

function alongWallNode(hit: WallHit, node: Node): number {
  return (node.x - hit.a.x) * hit.ux + (node.y - hit.a.y) * hit.uy;
}

/** Nearest real wall within `range`, oriented so its normal points toward
 *  (refX, refY) — same math as collision.ts's snapToWall, plus the wall/node
 *  identity snapToWall doesn't expose (needed here for corner detection). */
function findNearestWall(x: number, y: number, scene: Scene, depth: number, range = START_RANGE): WallHit | null {
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  let best: { hit: WallHit; dist: number } | null = null;
  for (const w of scene.walls) {
    if (w.kind === "rail" || w.kind === "portal") continue;
    const a = nodes.get(w.a);
    const b = nodes.get(w.b);
    if (!a || !b) continue;
    const { t, L, side } = projectOnWall(x, y, a, b);
    if (t < 0 || t > L) continue;
    const dist = Math.abs(side);
    if (dist > range) continue;
    if (best && dist >= best.dist) continue;
    best = { hit: wallHit(w, a, b, x, y, depth), dist };
  }
  return best?.hit ?? null;
}

/** A wall sharing `nodeId` with the current one, continuing within 80-100°
 *  of the incoming direction (i.e. roughly a right-angle corner). */
function findAdjacentWall(
  nodeId: string,
  excludeWallId: string,
  scene: Scene,
  incoming: [number, number],
  refX: number,
  refY: number,
  depth: number,
): { hit: WallHit; dir: number } | null {
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  const [idx, idy] = incoming;
  for (const w of scene.walls) {
    if (w.id === excludeWallId) continue;
    if (w.kind === "rail" || w.kind === "portal") continue;
    if (w.a !== nodeId && w.b !== nodeId) continue;
    const a = nodes.get(w.a);
    const b = nodes.get(w.b);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy);
    if (L < 1e-6) continue;
    const dir = w.a === nodeId ? 1 : -1; // outward from the shared node
    const ox = (dx / L) * dir;
    const oy = (dy / L) * dir;
    const angle = Math.acos(THREE.MathUtils.clamp(idx * ox + idy * oy, -1, 1));
    if (angle < CORNER_ANGLE_MIN || angle > CORNER_ANGLE_MAX) continue;
    return { hit: wallHit(w, a, b, refX, refY, depth), dir };
  }
  return null;
}

interface Leg {
  x: number;
  y: number;
  rotation: number;
  w: number;
}

/** `startAlong` and `len` are measured along hit.a→hit.b; `dir` is which way
 *  the leg grows from the anchor (+1 toward b, -1 toward a). */
function legAt(hit: WallHit, startAlong: number, len: number, dir: number): Leg {
  const flushX = hit.a.x + hit.ux * startAlong + hit.nx * hit.off;
  const flushY = hit.a.y + hit.uy * startAlong + hit.ny * hit.off;
  return {
    x: flushX + hit.ux * dir * (len / 2),
    y: flushY + hit.uy * dir * (len / 2),
    rotation: Math.atan2(-hit.nx, hit.ny),
    w: len,
  };
}

interface StartAnchor {
  hit: WallHit;
  along: number; // hit.a→hit.b distance of the anchor point (drag origin)
}

/** 1 leg normally; 2 once the drag has passed the wall's far corner by more
 *  than CORNER_OVERSHOOT and a ~right-angle wall continues from that corner.
 *  Widths are NOT clamped to dimLimits here — the live ghost shows the raw
 *  drag; clamping/dropping-too-short happens once, at commit. */
function computeLegs(start: StartAnchor, cursor: { x: number; y: number }, scene: Scene, depth: number): Leg[] {
  const { hit, along } = start;
  const alongCursor = (cursor.x - hit.a.x) * hit.ux + (cursor.y - hit.a.y) * hit.uy;
  const dir = Math.sign(alongCursor - along) || 1;
  const rawLen = Math.max(0, (alongCursor - along) * dir);
  const node = dir > 0 ? hit.b : hit.a;
  const distToNode = Math.abs(alongWallNode(hit, node) - along);

  if (rawLen <= distToNode + CORNER_OVERSHOOT) {
    const len = roundTo(Math.min(rawLen, distToNode), LEN_STEP);
    return [legAt(hit, along, Math.max(len, 0.01), dir)];
  }

  const incoming: [number, number] = [hit.ux * dir, hit.uy * dir];
  const adj = findAdjacentWall(node.id, hit.wall.id, scene, incoming, cursor.x, cursor.y, depth);
  if (!adj) {
    return [legAt(hit, along, roundTo(rawLen, LEN_STEP), dir)];
  }

  const legA = legAt(hit, along, Math.max(roundTo(distToNode, LEN_STEP), 0.01), dir);

  const alongB = alongWallNode(adj.hit, node);
  const alongCursorB = (cursor.x - adj.hit.a.x) * adj.hit.ux + (cursor.y - adj.hit.a.y) * adj.hit.uy;
  // Leg B's start is inset from the corner by leg A's own depth (carcass
  // butt joint — the two footprints meet edge-to-edge, no mitre).
  const rawLenB = Math.max(0, (alongCursorB - alongB) * adj.dir - depth);
  const legBLen = roundTo(rawLenB, LEN_STEP);
  if (legBLen < 0.05) return [legA];
  const legB = legAt(adj.hit, alongB + adj.dir * depth, legBLen, adj.dir);
  return [legA, legB];
}

export function RunDrawGhost({ offset }: { offset: { cx: number; cz: number } }) {
  const placingRun = useSceneStore((s) => s.placingRun);
  const [start, setStart] = useState<StartAnchor | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!placingRun) {
      setStart(null);
      setCursor(null);
      return;
    }
    // Capture-phase, same reasoning as WallTool: Viewport's own key handler
    // stops Escape from bubbling once it's handled something.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (start) setStart(null); // first Esc: drop the in-progress leg, stay armed
      else useSceneStore.getState().setPlacingRun(null); // second Esc: drop the tool
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [placingRun, start]);

  if (!placingRun) return null;
  const { generator, spec } = placingRun;
  const depth = spec.dims.d;
  const wLimits = GENERATORS[generator].dimLimits.w;

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const p = rayToPlan(e, offset);
    if (p) setCursor(p);
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const p = rayToPlan(e, offset);
    if (!p) return;
    const scene = useSceneStore.getState().scene;

    if (!start) {
      const hit = findNearestWall(p.x, p.y, scene, depth);
      if (!hit) {
        pdToast("Start against a wall");
        return;
      }
      const along = (p.x - hit.a.x) * hit.ux + (p.y - hit.a.y) * hit.uy;
      setStart({ hit, along });
      return;
    }

    const raw = computeLegs(start, p, scene, depth);
    const legA = { ...raw[0], w: THREE.MathUtils.clamp(raw[0].w, wLimits[0], wLimits[1]) };
    const legs: Leg[] = [legA];
    if (raw[1] && raw[1].w >= wLimits[0]) {
      legs.push({ ...raw[1], w: THREE.MathUtils.clamp(raw[1].w, wLimits[0], wLimits[1]) });
    }
    useSceneStore.getState().placeKitchenRun(legs);
    useSceneStore.getState().setPlacingRun(null);
  };

  const scene = useSceneStore.getState().scene;
  let legs: Leg[] = [];
  if (!start) {
    if (cursor) {
      const hit = findNearestWall(cursor.x, cursor.y, scene, depth);
      if (hit) {
        const along = (cursor.x - hit.a.x) * hit.ux + (cursor.y - hit.a.y) * hit.uy;
        legs = [legAt(hit, along - 0.5, 1, 1)];
      }
    }
  } else if (cursor) {
    legs = computeLegs(start, cursor, scene, depth);
  }

  return (
    <>
      {/* Catch-all ground plane: drives the ghost and takes the place clicks. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[offset.cx, 0.001, offset.cz]}
        onPointerMove={onMove}
        onClick={onClick}
      >
        <planeGeometry args={[600, 600]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {legs.map((leg, i) => (
        <group key={i} position={[leg.x, 0, leg.y]} rotation={[0, yawOf(leg.rotation), 0]}>
          <ParametricModel spec={{ ...spec, dims: { ...spec.dims, w: leg.w } }} opacity={0.55} />
        </group>
      ))}
    </>
  );
}
