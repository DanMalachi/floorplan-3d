// What can something STAND ON.
//
// Kitchen v2 answered this for worktops only: `isCounterHost` means "a
// kitchenBase run", and a sink or a microwave bonds to its path. But a TV on a
// stand goes on a media unit, a chest of drawers, a sideboard — in real life
// on top of whatever is under it — and most of those are IKEA GLBs, not
// parametric generators. So the host set has to be the whole catalog.
//
// Two problems to solve for a catalog item, both handled here:
//
//  1. **Its height is not in the catalog.** `FurnitureAsset` carries a
//     footprint (w × d) and nothing vertical, because until now nothing needed
//     it. The real height is in the GLB, which the viewer has already loaded
//     and scaled — so the measurement is taken from the model at render time
//     (see `HostHeightProbe` in CounterItemGhost) and recorded here. Until an
//     item has been measured, a per-kind estimate stands in, so the first
//     hover is never dead.
//  2. **Not everything with a top is a surface.** A wardrobe's top is 2m up, a
//     rug's is on the floor, a wall cabinet's is over your head. A host has to
//     be somewhere between a coffee table and a chest of drawers.

import type { FurnitureItem, Scene } from "@/schema/scene";
import { specOf } from "@/furniture/spec";
import { CATALOG_BY_ID } from "@/furniture/catalog";
import { GENERATORS } from "./index";

/** Anything whose top is below this is a footstool; above it, a wardrobe. */
export const SURFACE_MIN = 0.25;
export const SURFACE_MAX = 1.35;

/** Measured GLB heights, keyed by assetId, in world metres after the viewer's
 *  footprint normalisation. Filled in as models render.
 *
 *  Persisted, because an attached item's elevation is DERIVED from its host's
 *  top on every sync: with the measurements only in memory, reopening a plan
 *  would re-derive every bonded item from the coarse estimate instead, and a
 *  TV that sat on its sideboard yesterday would sink into it or float above
 *  it today. */
const STORE_KEY = "furniture:hostHeights1";
const measured = new Map<string, number>(readStored());

function readStored(): [string, number][] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((e) => Array.isArray(e) && typeof e[1] === "number") : [];
  } catch {
    return [];
  }
}

export function recordHostHeight(assetId: string, height: number): void {
  if (!Number.isFinite(height) || height <= 0) return;
  const prev = measured.get(assetId);
  if (prev !== undefined && Math.abs(prev - height) < 0.005) return;
  measured.set(assetId, height);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify([...measured]));
  } catch {
    // A full or blocked storage is not a reason to fail a placement.
  }
}

export function measuredHeight(assetId: string): number | undefined {
  return measured.get(assetId);
}

/** Stand-in heights by catalog `kind`, used until the GLB has been measured.
 *  Deliberately coarse: it decides whether an item is offered as a surface at
 *  all, and the real number replaces it as soon as the model is on screen. */
const KIND_HEIGHT: [RegExp, number][] = [
  [/tv (bench|unit)|media|sideboard|console/i, 0.5],
  [/chest of drawers|dresser|drawer unit/i, 0.8],
  [/coffee table|side table|bedside|nightstand|night table/i, 0.45],
  [/desk|dining table|table/i, 0.75],
  [/cabinet|cupboard|shelving unit|bookcase|shelf/i, 0.9],
  [/counter|worktop|island/i, 0.9],
];

function estimatedHeight(item: FurnitureItem): number | undefined {
  const asset = CATALOG_BY_ID.get(item.assetId);
  if (!asset) return undefined;
  const text = `${asset.name} ${asset.kind ?? ""} ${(asset.typeTags ?? []).join(" ")}`;
  for (const [re, h] of KIND_HEIGHT) if (re.test(text)) return h;
  return undefined;
}

/** Height of an item's top surface above the floor, or undefined when we have
 *  no honest answer for it. */
export function hostTop(item: FurnitureItem): number | undefined {
  const base = item.elevation ?? 0;
  if (item.parametric) return base + item.parametric.dims.h;
  const h = measured.get(item.assetId) ?? estimatedHeight(item);
  return h === undefined ? undefined : base + h;
}

/** A rectangle you can put something down on: plan centre, facing, and size. */
export interface SurfaceRect {
  host: FurnitureItem;
  x: number;
  y: number;
  /** Item rotation, in the scene's own convention (not the THREE yaw). */
  rotation: number;
  w: number;
  d: number;
  top: number;
}

/** Whether this item offers its top to other furniture. Excludes the things
 *  that have a "top" only in the arithmetic sense: rugs (flat), wall-mounted
 *  items (nothing stands on a mirror), and anything already at eye level. */
export function isSurfaceHost(item: FurnitureItem): boolean {
  const asset = specOf(item);
  if (!asset || asset.noCollide) return false;
  if (item.parametric) {
    const g = GENERATORS[item.parametric.generator];
    if (g.wallMounted?.(item.parametric)) return false;
    // A run's worktop is handled by the kitchen path, which knows its legs;
    // everything else parametric is a plain box with a top.
    if (item.parametric.generator === "kitchenWall") return false;
  }
  const top = hostTop(item);
  if (top === undefined) return false;
  if (top < SURFACE_MIN || top > SURFACE_MAX) return false;
  // Something the size of a bin is not a surface, whatever its height.
  return asset.footprint.w >= 0.3 && asset.footprint.d >= 0.22;
}

/** Every plain (non-run) surface in the scene. Kitchen runs are excluded —
 *  `counterSurfaces` in CounterItemGhost covers those, because a worktop's
 *  shape is its path, not a rectangle. */
export function surfaceRects(scene: Scene): SurfaceRect[] {
  const out: SurfaceRect[] = [];
  for (const host of scene.furniture) {
    if (host.parametric?.generator === "kitchenBase") continue;
    if (!isSurfaceHost(host)) continue;
    const asset = specOf(host)!;
    out.push({
      host,
      x: host.x,
      y: host.y,
      rotation: host.rotation,
      w: asset.footprint.w,
      d: asset.footprint.d,
      top: hostTop(host)!,
    });
  }
  return out;
}
