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
//
// A kitchenWall run reuses the SAME field for a second relationship — "Match
// run below" (Kitchen v2.2, Dan-approved, additive): `attach.hostId` points
// at a kitchenBase run and the wall run's WHOLE PATH (dims.w/extraLegs/
// legDir), not one point on it, derives from the host every sync — see
// `linkedRunPose`. `along` carries no meaning here (stored 0) since there is
// no single position to measure; it exists only so the field stays one
// shape for both relationships instead of forking the schema.

import type { FurnitureItem, Node, ParametricSpec, Scene, Wall } from "@/schema/scene";
import { DEFAULT_THICKNESS } from "@/schema/constants";
import { GENERATORS, sanitizeSpec } from "@/parametric";
import {
  pathLegs,
  legAtAlong,
  clampAlongToPath,
  runLocalToWorld,
  runWorldToLocal,
} from "./runPath";
import { hostTop, isSurfaceHost, surfaceRects } from "./surfaceHosts";
import { snapKitchenWall, ANGLE_TOL, BACK_TOL, angleDiff, normalOf } from "./kitchenSnap";
import { collinearSpan } from "./wallSpan";

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

/** Value-equal, not reference-equal: a linked wall run's copy of the host's
 *  extraLegs is a NEW array from sanitizeSpec every sync, so `===` would
 *  report "changed" every frame even when nothing about the path moved and
 *  send syncKitchenAttachments into needless re-renders (see its own
 *  "referentially lazy" contract above). */
const sameExtraLegs = (
  a: { turn: 1 | -1; w: number }[] | undefined,
  b: { turn: 1 | -1; w: number }[] | undefined,
): boolean =>
  a === b || (!!a && !!b && a.length === b.length && a.every((l, i) => l.turn === b[i].turn && l.w === b[i].w));

export const isKitchenRun = (f: Pick<FurnitureItem, "parametric">): boolean =>
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

/**
 * Items whose placement `applyKitchenGesture` owns outright: runs glue to a
 * wall, wall items ride the wall grid, counter items bond to a surface.
 *
 * The drag handler must NOT pre-snap these. It used to run collision.ts's
 * generic `snapToWall` (range-limited, projection unclamped, ranked its own
 * way) and then hand the result to `snapRunToWall` here (no range, projection
 * clamped, ranked differently) — two wall magnets with different rules
 * disagreeing about which wall and which face, on every pointer move. Only one
 * of them can be right; this is how the drag path knows which.
 */
export const kitchenOwnsPlacement = (f: Pick<FurnitureItem, "parametric">): boolean =>
  !!f.parametric && (isKitchenRun(f) || isWallItem(f) || isCounterItem(f));

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
 * World pose + copied path a LINKED kitchenWall run derives from its
 * kitchenBase host ("Match run below"): same rotation and the same
 * dims.w/extraLegs/legDir, so a reshape of the base run (resize, add a leg,
 * drag to a new wall) carries the wall run with it. dims.d/h, elevation, and
 * the wall run's own finish/front/handle are left alone — a wall cabinet is
 * shallower, shorter and mounted higher than the counter run underneath it,
 * and staying that way is the whole point of keeping them separate items.
 *
 * The two runs' BACK lines — the face flush to the wall — have to coincide,
 * not their centres, because their depths differ. In an item's local frame
 * +z is the front normal (`runLocalToWorld`'s convention; `pathLegs` puts
 * leg 0's back line at local z = -d/2 and its centre at z = 0), so shifting
 * the wall run's centre by -(hostDepth - wallDepth)/2 along the WORLD front
 * normal n = (-sin(rotation), cos(rotation)) walks its back line onto the
 * host's:
 *   hostBack  = hostPos  + n·(-hostDepth/2)
 *   wallBack  = wallPos  + n·(-wallDepth/2)
 *   set equal, solve for wallPos: wallPos = hostPos + n·(wallDepth - hostDepth)/2
 * i.e. shift = -(hostDepth - wallDepth)/2. Get the sign backwards and a
 * shallower-than-base wall cabinet (the normal case) walks its centre the
 * WRONG way along n — out past the counter's front edge instead of in toward
 * the wall — which is exactly the "uppers hanging into the room" failure the
 * task calls out. Verified numerically in kitchenLink.test.ts.
 *
 * Run through sanitizeSpec because the copied width isn't guaranteed to fit
 * kitchenWall's own dimLimits.w (a base run can run wider than a wall run
 * ever could) — the spec must never leave here holding a width its own
 * generator wouldn't accept.
 */
export function linkedRunPose(
  host: FurnitureItem,
  wallSpec: ParametricSpec,
): { x: number; y: number; rotation: number; spec: ParametricSpec } {
  const hostSpec = host.parametric!;
  const [nx, ny] = normalOf(host.rotation);
  const shift = -(hostSpec.dims.d - wallSpec.dims.d) / 2;
  const spec = sanitizeSpec({
    ...wallSpec,
    dims: { ...wallSpec.dims, w: hostSpec.dims.w },
    extraLegs: hostSpec.extraLegs,
    legDir: hostSpec.legDir,
  });
  return {
    x: host.x + nx * shift,
    y: host.y + ny * shift,
    rotation: host.rotation,
    spec,
  };
}

/**
 * The kitchenBase run the "Match run below" toggle would link `item` to:
 * nearest one on the same wall/face, using the identical gate
 * `snapKitchenWall`'s one-shot drag-time align already applies (ANGLE_TOL
 * rotation, BACK_TOL perpendicular back-to-back distance) — so the control
 * never offers a base run a drag wouldn't itself have snapped to. Null when
 * none qualifies; the inspector disables the toggle rather than hiding it,
 * so a wall cabinet with no run under it still shows the option exists.
 */
export function nearestLinkableBase(
  item: Pick<FurnitureItem, "x" | "y" | "rotation" | "parametric">,
  scene: Scene,
): FurnitureItem | null {
  const spec = item.parametric;
  if (!spec) return null;
  const [nx, ny] = normalOf(item.rotation);
  const itemBackX = item.x - nx * (spec.dims.d / 2);
  const itemBackY = item.y - ny * (spec.dims.d / 2);
  let best: FurnitureItem | null = null;
  let bestDist = Infinity;
  for (const f of scene.furniture) {
    if (!isCounterHost(f)) continue;
    if (Math.abs(angleDiff(item.rotation, f.rotation)) > ANGLE_TOL) continue;
    const [bnx, bny] = normalOf(f.rotation);
    const backX = f.x - bnx * (f.parametric!.dims.d / 2);
    const backY = f.y - bny * (f.parametric!.dims.d / 2);
    const dist = Math.abs((itemBackX - backX) * bnx + (itemBackY - backY) * bny);
    if (dist > BACK_TOL || dist >= bestDist) continue;
    bestDist = dist;
    best = f;
  }
  return best;
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
    if (f.parametric.generator === "kitchenWall") {
      // "Match run below": a linked wall run bonds to exactly one kitchenBase
      // run and derives its whole path from it (see linkedRunPose) — never a
      // single point on a surface, which is what the generic branch below
      // would do to it (attachedPose treats an unrecognized host as
      // something the item merely STANDS ON, sized by its own d, not the
      // run's leg path). A host that stopped being a kitchenBase (asset
      // swapped under it) can't satisfy that relationship at all, so the
      // bond dissolves rather than falling through to nonsense math.
      if (!isCounterHost(host)) {
        changed = true;
        const { attach: _a, ...free } = f;
        return free;
      }
      const derived = linkedRunPose(host, f.parametric);
      const specSame =
        f.parametric.dims.w === derived.spec.dims.w &&
        f.parametric.dims.d === derived.spec.dims.d &&
        f.parametric.dims.h === derived.spec.dims.h &&
        sameExtraLegs(f.parametric.extraLegs, derived.spec.extraLegs) &&
        f.parametric.legDir === derived.spec.legDir;
      if (
        specSame &&
        f.x === derived.x && f.y === derived.y && f.rotation === derived.rotation
      ) return f;
      changed = true;
      return { ...f, x: derived.x, y: derived.y, rotation: derived.rotation, parametric: derived.spec };
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
export interface SnapRunOpts {
  /** Along-wall quantisation. Defaults to the kitchen grid. */
  step?: number;
  /** The rotation the item ALREADY has, when it is being dragged rather
   *  than placed. Turns the snap sticky: it prefers the wall and the face
   *  the item is on, and only changes face when the cursor clearly means
   *  it. Omit for a fresh placement, which has no face to keep. */
  keepFacing?: number;
  /** Consider ONLY this wall. Used when the gesture is a RESIZE: growing a
   *  run is not moving it, so it must stay on the wall it is on. Without
   *  this the run's centre shifts as it grows, another wall wins the
   *  nearest-wall ranking, and the whole run jumps to a different wall —
   *  or the far face of its own. */
  lockWallId?: string;
}

function solveRunWall(
  item: Pick<FurnitureItem, "x" | "y" | "parametric">,
  scene: Scene,
  opts: SnapRunOpts = {},
): { wallId: string; x: number; y: number; rotation: number } | null {
  const spec = item.parametric;
  if (!spec) return null;
  const step = opts.step ?? ALONG_STEP;
  const keep = opts.keepFacing;
  // The outward normal the item currently wears: rotation = atan2(-nx, ny).
  const keepN = keep === undefined ? null : { x: -Math.sin(keep), y: Math.cos(keep) };
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  let best: { rank: number; wallId: string; x: number; y: number; rotation: number } | null = null;
  for (const w of scene.walls) {
    if (w.kind === "rail" || w.kind === "portal") continue;
    if (opts.lockWallId !== undefined && w.id !== opts.lockWallId) continue;
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
    // Keep the run on the straight SURFACE — which is not this Wall record.
    // A long wall is usually several collinear segments (the tracer splits it
    // wherever anything tees in), and clamping to one of them left the run
    // stuck part-way along a visibly straight wall, then teleporting to the
    // next segment's own limit. See wallSpan.ts.
    const span = collinearSpan(scene, w, nx, ny);
    const half = Math.min(spec.dims.w / 2, (span.hi - span.lo) / 2);
    let tc = clamp(
      roundTo(tRaw, step),
      span.lo + half,
      Math.max(span.hi - half, span.lo + half),
    );
    if (spec.extraLegs?.length) {
      const travel = sign * (spec.legDir ?? 1); // leg 0's direction along (ux, uy)
      const endT = tRaw + travel * (spec.dims.w / 2);
      const face = cornerFaceAlong(scene, nodes, w, a, ux, uy, nx, ny, endT, travel);
      if (face !== null) tc = clamp(face - travel * (spec.dims.w / 2), span.lo, span.hi);
    }
    best = {
      rank,
      wallId: w.id,
      x: a.x + ux * tc + nx * off,
      y: a.y + uy * tc + ny * off,
      rotation: Math.atan2(-nx, ny),
    };
  }
  return best && { wallId: best.wallId, x: best.x, y: best.y, rotation: best.rotation };
}

/** Which wall a run currently belongs to — the one `snapRunToWall` would glue
 *  it to right now. Captured at the start of a RESIZE so the gesture can lock
 *  onto it: growing a run moves its centre, and without a lock that shift is
 *  enough for a neighbouring wall to win the ranking and take the whole run. */
export function runWallId(
  item: Pick<FurnitureItem, "x" | "y" | "parametric">,
  scene: Scene,
  keepFacing?: number,
): string | null {
  return solveRunWall(item, scene, keepFacing === undefined ? {} : { keepFacing })?.wallId ?? null;
}

/** Glue a kitchen run to a wall — see solveRunWall for the ranking. */
export function snapRunToWall(
  item: Pick<FurnitureItem, "x" | "y" | "parametric">,
  scene: Scene,
  opts: SnapRunOpts = {},
): { x: number; y: number; rotation: number } | null {
  const r = solveRunWall(item, scene, opts);
  return r && { x: r.x, y: r.y, rotation: r.rotation };
}

/**
 * Re-glue every kitchen piece to the walls as they now stand, without a drag.
 *
 * For the one case where walls move under a kitchen that is already built:
 * regenerating from the trace. Squaring up shifts corners by a few centimetres,
 * which is enough to leave a run floating off its wall or a hair inside it.
 * `keepFacing` is passed so a re-glue can never flip a run to the far side of
 * its wall — the walls moved, the design decisions did not.
 */
export function reglueKitchen(scene: Scene): Scene {
  let changed = false;
  const furniture = scene.furniture.map((f) => {
    if (!f.parametric || !(isKitchenRun(f) || isWallItem(f))) return f;
    const step = isKitchenRun(f) ? ALONG_STEP : WALL_ITEM_STEP;
    const snapped = snapRunToWall(f, scene, { step, keepFacing: f.rotation });
    if (!snapped || (snapped.x === f.x && snapped.y === f.y && snapped.rotation === f.rotation)) return f;
    changed = true;
    return { ...f, ...snapped };
  });
  return syncKitchenAttachments(changed ? { ...scene, furniture } : scene);
}

/**
 * Store-side gesture hook: given the scene a drag wants (`next`) and the
 * scene as it currently is (`prev`), re-glue whichever kitchen pieces the
 * drag moved, then re-derive every attachment. Furniture entries are
 * compared by reference — only actually-touched items pay for a wall snap.
 */
export function applyKitchenGesture(
  next: Scene,
  prev: Scene,
  /** Set while a RESIZE gesture is in flight: that run stays on the wall it
   *  started on. Growing a run moves its centre, and without the lock that
   *  shift alone is enough for a neighbouring wall to win the nearest-wall
   *  ranking and carry the whole run off to it. */
  lock?: { itemId: string; wallId: string } | null,
): Scene {
  const prevById = new Map(prev.furniture.map((f) => [f.id, f]));
  let furniture = next.furniture;
  let changed = false;

  furniture = furniture.map((f) => {
    const before = prevById.get(f.id);
    if (before === f || !f.parametric) return f; // untouched by this update
    if (isKitchenRun(f)) {
      let item = f;
      if (item.parametric!.generator === "kitchenWall" && item.attach) {
        // The user grabbed a LINKED wall run directly (drag or resize handle)
        // and moved it — the natural "I want it somewhere else" gesture. Its
        // pose normally DERIVES from the host on every sync (pass 1 of
        // syncKitchenAttachments, which runs after this whole map, below): if
        // `attach` survived the touch, that pass would snap the run straight
        // back onto the host's pose next frame and the drag would visibly
        // fight the pointer. Dropping it here — unconditionally, whatever the
        // snap below decides — is what lets the drag win; it must not depend
        // on the snapped pose actually differing, or an unlink that happens
        // to land back on the same spot would silently stay linked.
        const { attach: _drop, ...unlinked } = item;
        item = unlinked;
        changed = true;
      }
      // `keepFacing` is the whole difference between a run that stays where you
      // put it and one that pops through to the far side of the wall. Without
      // it the face came straight from `Math.sign(side)` off the run's CENTRE,
      // and a drag that pushes the run into the wall carries that centre past
      // the centreline within a few centimetres — at which point the run snaps
      // flush to the OUTSIDE of the house. Wall items have had the hysteresis
      // since they were written; runs were simply never given it.
      let snapped = snapRunToWall(item, next, {
        keepFacing: before?.rotation ?? item.rotation,
        ...(lock && lock.itemId === item.id ? { lockWallId: lock.wallId } : {}),
      });
      if (snapped && item.parametric!.generator === "kitchenWall") {
        // Align to the base run underneath, from the WALL-SNAPPED pose. This
        // used to run in the drag handler, one snap earlier, off a rotation
        // that was still the previous wall's — so a row crossing a corner
        // measured its offset against the wrong axis for a frame.
        const aligned = snapKitchenWall({ ...item, ...snapped }, next);
        if (aligned) snapped = aligned;
      }
      if (snapped && (snapped.x !== item.x || snapped.y !== item.y || snapped.rotation !== item.rotation)) {
        changed = true;
        return { ...item, ...snapped };
      }
      return item;
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
