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

import type { FurnitureItem, ParametricSpec, Scene } from "@/schema/scene";
import { DEFAULT_THICKNESS } from "@/schema/constants";
import { GENERATORS } from "@/parametric";
import {
  pathLegs,
  legAtAlong,
  clampAlongToPath,
  runLocalToWorld,
  runWorldToLocal,
} from "./runPath";

const ALONG_STEP = 0.1; // same grid feel as everything else
const HOST_SIDE_MARGIN = 0.3; // how far off a counter's plan rect a cursor still finds it
const HOST_END_MARGIN = 0.25;

const roundTo = (v: number, step: number) => Math.round(v / step) * step;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const isKitchenRun = (f: FurnitureItem): boolean =>
  f.parametric?.generator === "kitchenBase" || f.parametric?.generator === "kitchenWall";

export const isCounterHost = (f: FurnitureItem): boolean =>
  f.parametric?.generator === "kitchenBase";

export const isCounterItem = (f: Pick<FurnitureItem, "parametric">): boolean =>
  !!f.parametric && !!GENERATORS[f.parametric.generator]?.counterItem;

/** World pose an attached item derives from its host — path-aware: the leg
 *  under `along` supplies position AND orientation, so a sink on a U's
 *  second leg faces that leg's room side. Elevation is the host's counter
 *  surface (kitchenBase dims.h IS that height). */
export function attachedPose(
  host: FurnitureItem,
  along: number,
): { x: number; y: number; rotation: number; elevation: number } {
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
    elevation: spec.dims.h,
  };
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
    if (!host || !isCounterHost(host) || !f.parametric) {
      changed = true;
      const { attach: _a, ...free } = f;
      return free;
    }
    const along = clampAlongToPath(host.parametric!, f.attach.along, f.parametric.dims.w);
    const pose = attachedPose(host, along);
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

/**
 * Glue a kitchen run (base or wall cabinets) to the nearest solid wall:
 * flush back, facing the room, center's along-wall position preserved,
 * snapped to the 0.1 m grid, clamped so the run stays on the wall segment.
 * Unlike collision.ts's generic snapToWall, the projection is CLAMPED to the
 * segment (a long run whose center passes a wall's end no longer loses its
 * wall entirely) and there is no give-up range — a run always belongs to
 * some wall; the nearest one wins. Returns null only in a wall-less scene.
 */
export function snapRunToWall(
  item: Pick<FurnitureItem, "x" | "y" | "parametric">,
  scene: Scene,
): { x: number; y: number; rotation: number } | null {
  const spec = item.parametric;
  if (!spec) return null;
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  let best: { dist: number; x: number; y: number; rotation: number } | null = null;
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
    const dist = Math.hypot(item.x - px, item.y - py);
    if (best && dist >= best.dist) continue;
    const side = (item.x - px) * -uy + (item.y - py) * ux;
    const sign = Math.sign(side) || 1;
    const nx = -uy * sign;
    const ny = ux * sign;
    const off = (w.thickness ?? DEFAULT_THICKNESS) / 2 + spec.dims.d / 2;
    // Keep the run on the segment when it fits; center it when it doesn't.
    const half = Math.min(spec.dims.w / 2, L / 2);
    const tc = clamp(roundTo(tRaw, ALONG_STEP), half, Math.max(L - half, half));
    best = {
      dist,
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
    if (isCounterItem(f)) {
      // Dragged counter item: rebond to whatever run is under it now; if
      // none is near, it stays clamped to its current host (a sink can't
      // be dropped in mid-air off the edge of its counter).
      const found = findHostRun(f.x, f.y, next, f.parametric.dims.w);
      const hostId = found?.host.id ?? f.attach?.hostId;
      if (!hostId) return f;
      const host = next.furniture.find((h) => h.id === hostId);
      if (!host?.parametric) return f;
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
