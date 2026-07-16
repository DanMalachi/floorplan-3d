// Door proximity auto-open + state-driven collision (§5c). Drives the
// existing swingDeg/slide.open fields by proximity — there is no separate
// open()/close() API or is-open boolean in this schema (confirmed at the
// Phase 0 discovery), so "opening" a door means patching those same fields
// the manual UI slider already patches. The patch itself is animated (a
// swift damped ease, not an instant snap) — see dampOpeningValue below.

import * as THREE from "three";
import type { Node, Opening, Scene, Wall } from "@/schema/scene";
import { DEFAULT_THICKNESS, WALL_HEIGHT } from "@/schema/constants";
import { buildJoinery, type JoineryFrame } from "../geometry/buildJoinery";
import { WALKTHROUGH_CONFIG as CFG } from "./config";
import type { FurnitureOBB } from "./furnitureCollision";

// Settle thresholds — once within this of the target, snap exactly there and
// consider the transition finished. Different units (degrees vs. a 0..1
// fraction) need different tolerances.
const SWING_SETTLE_DEG = 0.5;
const SLIDE_SETTLE_FRAC = 0.01;

export interface DoorAnchor {
  openingId: string;
  x: number; // world, offset-adjusted
  z: number;
}

function hostFrame(wall: Wall, nodes: Map<string, Node>): JoineryFrame | null {
  const a = nodes.get(wall.a);
  const b = nodes.get(wall.b);
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return null;
  return {
    ax: a.x,
    ay: a.y,
    ux: dx / L,
    uy: dy / L,
    L,
    th: wall.thickness ?? DEFAULT_THICKNESS,
    wallH: wall.height ?? WALL_HEIGHT,
  };
}

/** Is this door currently closed? Swing doors: swingDeg ~0. Sliding doors
 *  (opening.slide present): slide.open ~0. */
export function isDoorClosed(opening: Opening): boolean {
  if (opening.slide) return (opening.slide.open ?? 0) <= 1e-3;
  return (opening.swingDeg ?? 0) <= 1e-3;
}

/** The door's own live position value: swingDeg (degrees) for a hinged door,
 *  slide.open (0..1 fraction) for a sliding one — whichever field applies. */
export function currentOpeningValue(opening: Opening): number {
  if (opening.slide) return opening.slide.open ?? 0;
  return opening.swingDeg ?? 0;
}

/** The rest-value this door animates toward when fully open — a fixed swing
 *  angle for a hinged door, fully-slid (1) for a sliding one. */
export function targetOpenValue(opening: Opening): number {
  return opening.slide ? 1 : CFG.doorOpenSwingDeg;
}

/** Write `value` into whichever field this door type uses. */
export function applyOpeningValue(opening: Opening, value: number): Partial<Opening> {
  if (opening.slide) return { slide: { ...opening.slide, open: value } };
  return { swingDeg: value };
}

/**
 * One damped step toward `target` (§: smooth but swift, not an instant
 * snap) — same `THREE.MathUtils.damp` ease already used elsewhere in this
 * codebase (WallMesh's selection-glow fades) for consistency. Once within
 * the settle tolerance, snaps exactly to target and reports `settled: true`
 * so the caller can fold the whole open/close gesture into one undo step.
 */
export function dampOpeningValue(
  opening: Opening,
  target: number,
  delta: number,
): { value: number; settled: boolean } {
  const current = currentOpeningValue(opening);
  const eps = opening.slide ? SLIDE_SETTLE_FRAC : SWING_SETTLE_DEG;
  if (Math.abs(current - target) <= eps) return { value: target, settled: true };
  return { value: THREE.MathUtils.damp(current, target, CFG.doorSwingLambda, delta), settled: false };
}

/**
 * Anchor point per door: the hinge for a swing door, the opening's center
 * for a sliding one (it has no hinge). This is the FIXED point proximity is
 * measured from — never the leaf, which moves.
 */
export function buildDoorAnchors(
  scene: Scene,
  nodes: Map<string, Node>,
  offset: { cx: number; cz: number },
): DoorAnchor[] {
  const out: DoorAnchor[] = [];
  for (const opening of scene.openings) {
    if (opening.type !== "door") continue;
    const wall = scene.walls.find((w) => w.id === opening.wallId);
    if (!wall) continue;
    const f = hostFrame(wall, nodes);
    if (!f) continue;

    let s: number;
    if (opening.slide) {
      s = opening.offset;
    } else {
      const hinge = opening.hinge ?? "start";
      s = hinge === "end" ? opening.offset + opening.width / 2 : opening.offset - opening.width / 2;
    }
    out.push({ openingId: opening.id, x: f.ax + f.ux * s - offset.cx, z: f.ay + f.uy * s - offset.cz });
  }
  return out;
}

/**
 * Collision proxies for every CURRENTLY CLOSED door's leaf, in its closed
 * (flush, unswung) position — built by asking `buildJoinery` for the leaf
 * geometry with swingDeg/slide.open forced to 0, regardless of the door's
 * real live angle, so this always reflects "the leaf as it sits when shut,"
 * the same authoritative geometry the renderer uses (no duplicated math).
 * Only "leaf" and "glass" pieces count (a glazed sliding panel is still a
 * solid barrier); frame/handle/threshold/track are cosmetic, not obstacles.
 * Open doors contribute nothing here — the wall collider already treats
 * their opening as a permanent gap (§5a); this only ADDS a blocker while
 * shut, on top of that gap, matching §5c's "closed blocks, open passes."
 */
export function buildClosedDoorColliders(
  scene: Scene,
  nodes: Map<string, Node>,
  offset: { cx: number; cz: number },
): FurnitureOBB[] {
  const out: FurnitureOBB[] = [];
  for (const opening of scene.openings) {
    if (opening.type !== "door") continue;
    if (!isDoorClosed(opening)) continue;
    const wall = scene.walls.find((w) => w.id === opening.wallId);
    if (!wall) continue;
    const f = hostFrame(wall, nodes);
    if (!f) continue;

    const closed: Opening = opening.slide
      ? { ...opening, slide: { ...opening.slide, open: 0 } }
      : { ...opening, swingDeg: 0 };
    const pieces = buildJoinery(closed, f);
    for (const p of pieces) {
      if (p.role !== "leaf" && p.role !== "glass") continue;
      const halfW = p.size[0] / 2;
      const halfD = p.size[2] / 2;
      out.push({
        cx: p.position[0] - offset.cx,
        cz: p.position[2] - offset.cz,
        halfW,
        halfD,
        // JoineryPiece.rotationY uses the three.js Y-rotation convention
        // (rotY(dx,dy) = -atan2(dy,dx), same as buildWallSegments); FurnitureOBB
        // uses the plan-rotation convention (item.rotation, verified against
        // the editor's own furnitureOBB in Phase 4) — negate to convert.
        angle: -p.rotationY,
        cr: Math.hypot(halfW, halfD),
      });
    }
  }
  return out;
}
