// Kitchen v2 attachment engine (Dan-approved schema: FurnitureItem.attach +
// ParametricSpec.cutouts). Pure plan-space math over Scene — the store calls
// these from its actions; nothing here touches THREE or React.
//
// Model: counter items (sink, cooktop, future appliances/decor) bond to a
// kitchenBase run via `attach: { hostId, along }` — `along` in meters from
// the run's LEFT edge (local -w/2). x/y/rotation/elevation of an attached
// item are DERIVED from the host every sync, so dragging or resizing the run
// carries its items; items that cut (GeneratorDef.cutoutSize) also project
// a hole into the host's spec.cutouts, which kitchenBase's build() subtracts
// from the countertop.

import type { FurnitureItem, Node, ParametricSpec, Scene, Wall } from "@/schema/scene";
import { DEFAULT_THICKNESS } from "@/schema/constants";
import { GENERATORS } from "@/parametric";
import {
  pathLegs,
  legAtAlong,
  clampAlongToPath,
  runLocalToWorld,
  runWorldToLocal,
} from "./runPath";
import { hostTop, isSurfaceHost, surfaceRects } from "./surfaceHosts";

const ALONG_STEP = 0.1; // same grid feel as everything else
/** Hung things slide on a 1cm step, not the 10cm one.
 *
 *  A kitchen cabinet wants the coarse grid — it has to line up with the base
 *  run under it. A picture has nothing to line up with, and on the 10cm step a
 *  drag lagged the cursor by up to 5cm and moved in visible jumps, which is
 *  what "feels stuck" was. */
const WALL_ITEM_STEP = 0.01;
/** Slack under the far-face threshold below, in metres. */
const SIDE_FLIP_SLACK = 0.005;
/** Ranking bonus, in metres, for the wall+face the item is already on, so a
 *  near-tie between two walls at a corner doesn't swap faces mid-drag. */
const KEEP_FACING_BONUS = 0.12;
const HOST_SIDE_MARGIN = 0.3; // how far off a counter's plan rect a cursor still finds it
const HOST_END_MARGIN = 0.25;

const roundTo = (v: number, step: number) => Math.round(v / step) * step;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const isKitchenRun = (f: FurnitureItem): boolean =>
  f.parametric?.generator === "kitchenBase" || f.parametric?.generator === "kitchenWall";

export const isCounterHost = (f: FurnitureItem): boolean =>
  f.parametric?.generator === "kitchenBase";

/** Any item something can stand ON: a worktop run, or — new for the TV — the
 *  top of any sideboard, chest, table or IKEA storage unit in the catalog.
 *  See surfaceHosts.ts for how a catalog item's height is known at all. */
export const isAttachHost = (f: FurnitureItem): boolean => isCounterHost(f) || isSurfaceHost(f);

/** Attached items may sit on a plain surface INSTEAD of a counter, and may be
 *  put on the floor when there is nothing under them. A sink cannot; a TV can,
 *  which is the difference this flag carries. */
export const isSurfaceOptional = (spec: ParametricSpec): boolean =>
  GENERATORS[spec.generator]?.surfaceOptional === true;

export const isCounterItem = (f: Pick<FurnitureItem, "parametric">): boolean =>
  !!f.parametric && !!GENERATORS[f.parametric.generator]?.counterItem?.(f.parametric);

/** Hangs on a wall: mirrors, towel rails, chimney/visor hoods, the over-range
 *  microwave. Placement already reads the wall grid; this is what lets EDITING
 *  do the same. */
export const isWallItem = (f: Pick<FurnitureItem, "parametric">): boolean =>
  !!f.parametric && !!GENERATORS[f.parametric.generator]?.wallMounted?.(f.parametric);

/** Metres above the worktop an attached item bonds at. Zero for everything
 *  that sits ON the counter; an extractor over an island is the exception —
 *  it belongs to the run and rides it, but hangs above it. */
export const counterLiftOf = (spec: ParametricSpec): number =>
  GENERATORS[spec.generator]?.counterLift?.(spec) ?? 0;

/** World pose an attached item derives from its host — path-aware: the leg
 *  under `along` supplies position AND orientation, so a sink on a U's
 *  second leg faces that leg's room side. Elevation is the host's counter
 *  surface (kitchenBase dims.h IS that height), plus the item's own lift. */
export function attachedPose(
  host: FurnitureItem,
  along: number,
  lift = 0,
): { x: number; y: number; rotation: number; elevation: number } {
  if (!isCounterHost(host)) return surfacePose(host, along, lift);
  const spec = host.parametric!;
  const legs = pathLegs(spec);
  const { leg, u } = legAtAlong(legs, along);
  const local = {
    x: leg.sx + leg.dx * u + leg.fx * (spec.dims.d / 2),
    z: leg.sz + leg.dz * u + leg.fz * (spec.dims.d / 2),
  };
  const world = runLocalToWorld(host, local);
  return {
    x: world.x,
    y: world.y,
    rotation: host.rotation + Math.atan2(-leg.fx, leg.fz),
    elevation: spec.dims.h + lift,
  };
}

/**
 * Pose on a PLAIN surface — a sideboard, a chest of drawers, a table, an IKEA
 * TV bench. `along` keeps the same meaning it has on a run: metres from the
 * host's left edge, measured across its width. Depth is centred, because
 * something set down on a cabinet sits on the middle of it, and because
 * `attach` carries one number, not two (widening it is a schema change to a
 * protected file, and centred is what you would want anyway).
 */
export function surfacePose(
  host: FurnitureItem,
  along: number,
  lift = 0,
): { x: number; y: number; rotation: number; elevation: number } {
  const w = surfaceWidth(host);
  const off = clamp(along, 0, w) - w / 2;
  // Host-local +X in world, using the scene's rotation convention.
  const ux = Math.cos(host.rotation);
  const uy = -Math.sin(host.rotation);
  return {
    x: host.x + ux * off,
    y: host.y + uy * off,
    rotation: host.rotation,
    elevation: (hostTop(host) ?? host.elevation ?? 0) + lift,
  };
}

function surfaceWidth(host: FurnitureItem): number {
  if (host.parametric) return host.parametric.dims.w;
  return surfaceRects({ furniture: [host] } as Scene).find((r) => r.host.id === host.id)?.w ?? 1;
}

/**
 * The surface a plan point is over, counter or cabinet top. Runs are tried
 * first (their worktop is a path, and the kitchen's own margins apply); plain
 * rectangles are tested in their own local frame, nearest centre wins.
 */
export function findAttachHost(
  x: number,
  y: number,
  scene: Scene,
  itemW = 0,
): { host: FurnitureItem; along: number } | null {
  const run = findHostRun(x, y, scene, itemW);
  if (run) return run;
  let best: { host: FurnitureItem; along: number; lat: number } | null = null;
  for (const rect of surfaceRects(scene)) {
    // World → host-local. Rotation convention matches surfacePose above.
    const dx = x - rect.x;
    const dy = y - rect.y;
    const ux = Math.cos(rect.rotation);
    const uy = -Math.sin(rect.rotation);
    const lx = dx * ux + dy * uy;
    const ly = -dx * uy + dy * ux;
    if (Math.abs(lx) > rect.w / 2 + HOST_END_MARGIN) continue;
    const lat = Math.abs(ly);
    if (lat > rect.d / 2 + HOST_SIDE_MARGIN) continue;
    if (best && lat >= best.lat) continue;
    // Keep the item on the surface: an 85" TV cannot hang off both ends of a
    // 1.2m bench, so it centres instead.
    const half = Math.min(itemW / 2, rect.w / 2);
    const along = clamp(roundTo(lx + rect.w / 2, ALONG_STEP), half, Math.max(rect.w - half, half));
    best = { host: rect.host, along, lat };
  }
  return best && { host: best.host, along: best.along };
}

/**
 * The base run whose counter a plan point is over (or near — margins let the
 * ghost latch before the cursor is pixel-perfect), searched along the WHOLE
 * path of every run. Returns the host and the grid-snapped, interval-clamped
 * `along`. Nearest lateral distance to a counter centerline wins.
 */
export function findHostRun(
  x: number,
  y: number,
  scene: Scene,
  itemW = 0,
): { host: FurnitureItem; along: number } | null {
  let best: { host: FurnitureItem; along: number; lat: number } | null = null;
  for (const f of scene.furniture) {
    if (!isCounterHost(f)) continue;
    const spec = f.parametric!;
    const p = runWorldToLocal(f, { x, y });
    for (const leg of pathLegs(spec)) {
      const u = (p.x - leg.sx) * leg.dx + (p.z - leg.sz) * leg.dz;
      if (u < -HOST_END_MARGIN || u > leg.len + HOST_END_MARGIN) continue;
      // Lateral distance from the counter's centerline (back line + d/2).
      const v = (p.x - leg.sx) * leg.fx + (p.z - leg.sz) * leg.fz;
      const lat = Math.abs(v - spec.dims.d / 2);
      if (lat > spec.dims.d / 2 + HOST_SIDE_MARGIN) continue;
      if (best && lat >= best.lat) continue;
      const along = clampAlongToPath(spec, roundTo(leg.off + u, ALONG_STEP), itemW);
      best = { host: f, along, lat };
    }
  }
  return best && { host: best.host, along: best.along };
}

/** The countertop hole an item wants, or null (surface-only decor). */
function cutoutOf(spec: ParametricSpec): { w: number; d: number } | null {
  return GENERATORS[spec.generator]?.cutoutSize?.(spec) ?? null;
}

/**
 * One pass that makes the whole kitchen consistent. Applied by the store
 * after any mutation that can move/resize/add/remove kitchen pieces:
 *  1. every attached item re-derives x/y/rotation/elevation from its host
 *     (host gone → the bond dissolves and the item goes free where it stood);
 *  2. every kitchenBase's spec.cutouts is rebuilt from the items attached to
 *     it — an exact projection, never hand-edited state that can drift.
 * Referentially lazy: untouched items/specs keep identity so React/memo
 * (ParametricModel keys on JSON) don't rebuild the whole kitchen per drag
 * tick.
 */
export function syncKitchenAttachments(scene: Scene): Scene {
  const byId = new Map(scene.furniture.map((f) => [f.id, f]));
  let changed = false;

  // Pass 1 — derive attached poses.
  let furniture: FurnitureItem[] = scene.furniture.map((f): FurnitureItem => {
    if (!f.attach) return f;
    const host = byId.get(f.attach.hostId);
    if (!host || !isAttachHost(host) || !f.parametric) {
      changed = true;
      const { attach: _a, ...free } = f;
      return free;
    }
    const along = isCounterHost(host)
      ? clampAlongToPath(host.parametric!, f.attach.along, f.parametric.dims.w)
      : f.attach.along;
    const pose = attachedPose(host, along, counterLiftOf(f.parametric));
    if (
      along === f.attach.along &&
      f.x === pose.x && f.y === pose.y &&
      f.rotation === pose.rotation && f.elevation === pose.elevation
    ) return f;
    changed = true;
    return { ...f, ...pose, attach: { hostId: f.attach.hostId, along } };
  });

  // Pass 2 — project cutouts onto hosts.
  const cutoutsByHost = new Map<string, { along: number; w: number; d: number }[]>();
  for (const f of furniture) {
    if (!f.attach || !f.parametric) continue;
    // Only a worktop gets cut. A TV standing on a sideboard does not saw a
    // hole in it, and `cutouts` is a kitchenBase-only field anyway.
    if (!isCounterHost(byId.get(f.attach.hostId) ?? f)) continue;
    const cut = cutoutOf(f.parametric);
    if (!cut) continue;
    const list = cutoutsByHost.get(f.attach.hostId) ?? [];
    list.push({ along: f.attach.along, w: cut.w, d: cut.d });
    cutoutsByHost.set(f.attach.hostId, list);
  }
  furniture = furniture.map((f) => {
    if (!isCounterHost(f)) return f;
    const next = (cutoutsByHost.get(f.id) ?? []).sort((a, b) => a.along - b.along);
    const cur = f.parametric!.cutouts ?? [];
    const same =
      cur.length === next.length &&
      cur.every((c, i) => c.along === next[i].along && c.w === next[i].w && c.d === next[i].d);
    if (same) return f;
    changed = true;
    const { cutouts: _c, ...restSpec } = f.parametric!;
    return {
      ...f,
      parametric: next.length > 0 ? { ...restSpec, cutouts: next } : restSpec,
    };
  });

  return changed ? { ...scene, furniture } : scene;
}

const CORNER_MAGNET = 0.5; // how far an L/U's corner reaches for a real corner

/**
 * Along-wall position of the FACE an L/U run's corner belongs against: the
 * near face of a wall crossing ours within CORNER_MAGNET of where the corner
 * currently sits. The extra legs hang off leg 0's far END, so that end — not
 * the run's centre — is the part that has to stay planted; grid-rounding the
 * centre instead walks a drawn L out of its corner and buries its second leg
 * in the wall.
 */
function cornerFaceAlong(
  scene: Scene,
  nodes: Map<string, Node>,
  wall: Wall,
  a: Node,
  ux: number, uy: number,
  nx: number, ny: number,
  endT: number,
  travel: number,
): number | null {
  let best: { t: number; d: number } | null = null;
  for (const w of scene.walls) {
    if (w.id === wall.id || w.kind === "rail" || w.kind === "portal") continue;
    const p0 = nodes.get(w.a);
    const p1 = nodes.get(w.b);
    if (!p0 || !p1) continue;
    const Lp = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    if (Lp < 1e-6) continue;
    const ex = (p1.x - p0.x) / Lp;
    const ey = (p1.y - p0.y) / Lp;
    const cross = ux * ey - uy * ex; // sin of the angle between the walls
    if (Math.abs(cross) < 0.34) continue; // under 20°: a continuation, not a corner
    const wx = p0.x - a.x;
    const wy = p0.y - a.y;
    const s = (wx * ey - wy * ex) / cross; // crossing, along OUR axis
    const r = (wx * uy - wy * ux) / cross; // crossing, along THEIRS
    if (r < -0.02 || r > Lp + 0.02) continue;
    // It only stops the run if it actually stands on the run's side.
    const n0 = (p0.x - a.x) * nx + (p0.y - a.y) * ny;
    const n1 = (p1.x - a.x) * nx + (p1.y - a.y) * ny;
    if (Math.max(n0, n1) < 0.02) continue;
    const th = w.thickness ?? DEFAULT_THICKNESS;
    const faceT = s - travel * (th / 2 / Math.abs(cross));
    const d = Math.abs(faceT - endT);
    if (d > CORNER_MAGNET) continue;
    if (!best || d < best.d) best = { t: faceT, d };
  }
  return best?.t ?? null;
}

/**
 * Glue a kitchen run (base or wall cabinets) to the nearest solid wall:
 * flush back, facing the room, center's along-wall position preserved,
 * snapped to the 0.1 m grid, clamped so the run stays on the wall segment.
 * Unlike collision.ts's generic snapToWall, the projection is CLAMPED to the
 * segment (a long run whose center passes a wall's end no longer loses its
 * wall entirely) and there is no give-up range — a run always belongs to
 * some wall; the nearest one wins. Returns null only in a wall-less scene.
 * An L/U additionally registers its corner against the crossing wall's face.
 */
export function snapRunToWall(
  item: Pick<FurnitureItem, "x" | "y" | "parametric">,
  scene: Scene,
  opts: {
    /** Along-wall quantisation. Defaults to the kitchen grid. */
    step?: number;
    /** The rotation the item ALREADY has, when it is being dragged rather
     *  than placed. Turns the snap sticky: it prefers the wall and the face
     *  the item is on, and only changes face when the cursor clearly means
     *  it. Omit for a fresh placement, which has no face to keep. */
    keepFacing?: number;
  } = {},
): { x: number; y: number; rotation: number } | null {
  const spec = item.parametric;
  if (!spec) return null;
  const step = opts.step ?? ALONG_STEP;
  const keep = opts.keepFacing;
  // The outward normal the item currently wears: rotation = atan2(-nx, ny).
  const keepN = keep === undefined ? null : { x: -Math.sin(keep), y: Math.cos(keep) };
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  let best: { rank: number; x: number; y: number; rotation: number } | null = null;
  for (const w of scene.walls) {
    if (w.kind === "rail" || w.kind === "portal") continue;
    const a = nodes.get(w.a);
    const b = nodes.get(w.b);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy);
    if (L < 1e-6) continue;
    const ux = dx / L;
    const uy = dy / L;
    const tRaw = (item.x - a.x) * ux + (item.y - a.y) * uy;
    const t = clamp(tRaw, 0, L);
    const px = a.x + ux * t;
    const py = a.y + uy * t;
    const th = w.thickness ?? DEFAULT_THICKNESS;
    const off = th / 2 + spec.dims.d / 2;
    // Rank by how far the run's BACK would have to travel to reach this
    // wall's FACE — not by the distance to its centerline, which makes a
    // thick wall look further away than the surface you actually stand
    // against (half a thickness: 15cm on a 30cm wall).
    const gap = Math.abs(Math.hypot(item.x - px, item.y - py) - off);
    const side = (item.x - px) * -uy + (item.y - py) * ux;
    let sign = Math.sign(side) || 1;
    let rank = gap;
    if (keepN) {
      // Which face of THIS wall the item is on today, if it is on this one.
      const keepSign = Math.sign(keepN.x * -uy + keepN.y * ux);
      if (keepSign !== 0) {
        // Hysteresis. The item only changes face once the incoming point is
        // as far out as hanging it on the OTHER face would put it — which is
        // exactly what pointing at that face produces, and well past anything
        // a wandering floor-plane point reaches near the centreline.
        const flipAt = th / 2 + spec.dims.d / 2 - SIDE_FLIP_SLACK;
        if (keepSign !== sign && Math.abs(side) < flipAt) sign = keepSign;
        if (keepSign === sign) rank -= KEEP_FACING_BONUS;
      }
    }
    if (best && rank >= best.rank) continue;
    const nx = -uy * sign;
    const ny = ux * sign;
    // Keep the run on the segment when it fits; center it when it doesn't.
    const half = Math.min(spec.dims.w / 2, L / 2);
    let tc = clamp(roundTo(tRaw, step), half, Math.max(L - half, half));
    if (spec.extraLegs?.length) {
      const travel = sign * (spec.legDir ?? 1); // leg 0's direction along (ux, uy)
      const endT = tRaw + travel * (spec.dims.w / 2);
      const face = cornerFaceAlong(scene, nodes, w, a, ux, uy, nx, ny, endT, travel);
      if (face !== null) tc = clamp(face - travel * (spec.dims.w / 2), 0, L);
    }
    best = {
      rank,
      x: a.x + ux * tc + nx * off,
      y: a.y + uy * tc + ny * off,
      rotation: Math.atan2(-nx, ny),
    };
  }
  return best && { x: best.x, y: best.y, rotation: best.rotation };
}

/**
 * Store-side gesture hook: given the scene a drag wants (`next`) and the
 * scene as it currently is (`prev`), re-glue whichever kitchen pieces the
 * drag moved, then re-derive every attachment. Furniture entries are
 * compared by reference — only actually-touched items pay for a wall snap.
 */
export function applyKitchenGesture(next: Scene, prev: Scene): Scene {
  const prevById = new Map(prev.furniture.map((f) => [f.id, f]));
  let furniture = next.furniture;
  let changed = false;

  furniture = furniture.map((f) => {
    const before = prevById.get(f.id);
    if (before === f || !f.parametric) return f; // untouched by this update
    if (isKitchenRun(f)) {
      const snapped = snapRunToWall(f, next);
      if (snapped && (snapped.x !== f.x || snapped.y !== f.y || snapped.rotation !== f.rotation)) {
        changed = true;
        return { ...f, ...snapped };
      }
      return f;
    }
    if (isWallItem(f)) {
      // A wall item stays ON the wall grid while it is dragged, exactly as it
      // did when it was placed. The generic drag path snaps to the FLOOR grid,
      // which slid hoods and mirrors out into the middle of the room at their
      // old height. Same projection a run uses (wall FACE, not centerline);
      // elevation is untouched, so it slides along the wall at its own height.
      //
      // Sticky, and finely stepped, because the pointer's floor-plane point is
      // NOT the picture: it wanders several cm around the wall while the
      // cursor sits still on the frame. Ranked straight by distance, that
      // wander flipped a picture to the far face of the wall and back every
      // few frames; quantised to the kitchen's 10cm it also stuttered along
      // the wall behind the cursor. Cabinets keep the coarse step — they line
      // up with the base run under them, and nothing else does.
      const step = f.parametric.generator === "kitchenWall" ? ALONG_STEP : WALL_ITEM_STEP;
      const snapped = snapRunToWall(f, next, { step, keepFacing: before?.rotation ?? f.rotation });
      if (snapped && (snapped.x !== f.x || snapped.y !== f.y || snapped.rotation !== f.rotation)) {
        changed = true;
        return { ...f, ...snapped };
      }
      return f;
    }
    if (isCounterItem(f)) {
      // Dragged counter item: rebond to whatever surface is under it now — a
      // worktop, a sideboard, a chest of drawers. If none is near, a sink
      // stays clamped to its current host (it cannot exist off a counter),
      // while a TV simply comes off the furniture and stands on the floor.
      const found = findAttachHost(f.x, f.y, next, f.parametric.dims.w);
      if (!found && isSurfaceOptional(f.parametric)) {
        if (!f.attach) return f;
        changed = true;
        const { attach: _a, ...free } = f;
        return { ...free, elevation: 0 };
      }
      const hostId = found?.host.id ?? f.attach?.hostId;
      if (!hostId) return f;
      const host = next.furniture.find((h) => h.id === hostId);
      if (!host) return f;
      if (!isCounterHost(host)) {
        changed = true;
        return { ...f, attach: { hostId, along: found?.along ?? f.attach?.along ?? 0 } };
      }
      if (!host.parametric) return f;
      let along: number;
      if (found) {
        along = found.along;
      } else {
        // Off every counter: slide within the CURRENT host — project the
        // cursor onto its path (nearest leg wins) and clamp.
        const p = runWorldToLocal(host, { x: f.x, y: f.y });
        let bestU = 0;
        let bestLat = Infinity;
        for (const leg of pathLegs(host.parametric)) {
          const u = clamp((p.x - leg.sx) * leg.dx + (p.z - leg.sz) * leg.dz, 0, leg.len);
          const v = (p.x - leg.sx) * leg.fx + (p.z - leg.sz) * leg.fz;
          const lat = Math.abs(v - host.parametric.dims.d / 2);
          if (lat < bestLat) {
            bestLat = lat;
            bestU = leg.off + u;
          }
        }
        along = clampAlongToPath(host.parametric, roundTo(bestU, ALONG_STEP), f.parametric.dims.w);
      }
      changed = true;
      return { ...f, attach: { hostId, along } };
    }
    return f;
  });

  const merged = changed ? { ...next, furniture } : next;
  return syncKitchenAttachments(merged);
}
