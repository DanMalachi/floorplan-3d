import { BLENDERKIT_ASSETS, IKEA_ASSETS, type FurnitureAsset } from "@/furniture/catalog";
import type { Node, Room, Scene } from "@/schema/scene";
import type { FurnishMix, FurnishOptions } from "./furnishParams";

/**
 * The furnished benchmark scene, as a pure function.
 *
 * `(Scene, FurnishOptions) -> FurnishPlacement[]`, with no I/O, no clock, no
 * `Math.random`, and no dependence on anything but its arguments and the
 * committed catalog JSON. That is the point: the §5 exit bar is a p95 frame time
 * on a furnished scene, and a benchmark scene that differs between runs turns
 * every comparison against `scripts/perf/baselines/` into noise. Same scene,
 * same count, same seed, same mix ⇒ byte-identical placements.
 *
 * The one source of randomness — a small rotation jitter, so a room does not
 * read as a showroom of perfectly parallel objects — runs off an explicit
 * mulberry32 seeded from `options.seed`, never the global RNG.
 *
 * Nothing here produces a `FurnitureItem` or touches the scene store. It emits
 * render instructions that `PerfFurnishRig` hangs on the three.js graph; see the
 * ownership note at the top of that file.
 */

export interface FurnishPlacement {
  /** Stable React key. Encodes the slot, so it survives a re-plan unchanged. */
  key: string;
  assetId: string;
  /** Plan-space meters, exactly like `FurnitureItem.x/y` — the rig converts. */
  x: number;
  y: number;
  /** Plan rotation in radians, same convention as `FurnitureItem.rotation`. */
  rotation: number;
  /** Meters above the floor. Non-zero only for wall-mounted catalog items
   *  landing on a perimeter slot. */
  elevation: number;
}

export interface FurnishPlan {
  placements: FurnishPlacement[];
  /** What was asked for. `placements.length` is what the geometry could hold. */
  requested: number;
  /** Distinct GLB urls across the plan — the number that drives texture memory,
   *  since repeats of one model share their textures in drei's GLTF cache. */
  distinctAssets: number;
  /** Candidate positions the floor plan yielded. Under-capacity is reported
   *  rather than papered over: a furnished run that quietly placed 12 of 40
   *  items is exactly the kind of silently-wrong number this harness exists to
   *  prevent. */
  slotCount: number;
  poolSize: number;
}

// ---------------------------------------------------------------------------
// Deterministic RNG
// ---------------------------------------------------------------------------

/** mulberry32 — 32-bit, seedable, no dependencies, good enough for jitter. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Asset pool
// ---------------------------------------------------------------------------

/**
 * Placement spacing, meters. A real room is not laid out on a grid, but this is
 * a load generator, not a stylist: what matters is that N items sit inside the
 * building envelope, in the camera's way, at plausible scale — not that the
 * sofa faces the television.
 */
const PERIMETER_SPACING = 1.25;
const GRID_SPACING = 1.25;
/** Nominal gap between an item's back and the wall it stands against. */
const WALL_GAP = 0.06;
/** Keep interior items off the walls by at least this. */
const INTERIOR_MARGIN = 0.45;

/**
 * Phase offsets for successive laps over the same floor plan, as a bit-reversal
 * (van der Corput) sequence. Lap 2 lands halfway between lap 1's slots, lap 3
 * halfway between those, and so on — so an over-subscribed plan degrades into a
 * denser arrangement rather than a stack of coincident models, which would share
 * their draw calls' depth range and misreport overdraw.
 */
const LAP_PHASES = [0, 0.5, 0.25, 0.75];

/** Items whose footprint is plausible furniture. Excludes the catalog's very
 *  small parts (knobs, handles) and its outliers, both of which would place
 *  fine and measure nothing useful. */
const usableAsset = (a: FurnitureAsset): boolean => {
  if (!a.realModel) return false;
  const max = Math.max(a.footprint.w, a.footprint.d);
  return max >= 0.25 && max <= 3.0;
};

const byAssetId = (a: FurnitureAsset, b: FurnitureAsset): number =>
  a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0;

/**
 * The ordered pool the plan draws from, most-preferred first.
 *
 * Sorted by `assetId` — a stable, content-derived key — rather than left in
 * catalog order, because catalog order is a build artefact of
 * `scripts/ikea/build-catalog.ts` and would silently reshuffle the benchmark
 * scene the next time that script runs.
 *
 * `mix` INTERLEAVES the two sorted lists rather than concatenating them, so a
 * 40-item run gets 20 of each instead of 40 IKEA items and no BlenderKit at
 * all. The two sources are the two halves of the Phase 3 question.
 */
export function furnishPool(mix: FurnishMix): FurnitureAsset[] {
  const ikea = IKEA_ASSETS.filter(usableAsset).sort(byAssetId);
  const bk = BLENDERKIT_ASSETS.filter(usableAsset).sort(byAssetId);

  if (mix === "ikea") return ikea;
  if (mix === "blenderkit") return bk;

  const out: FurnitureAsset[] = [];
  for (let i = 0; i < Math.max(ikea.length, bk.length); i++) {
    if (i < bk.length) out.push(bk[i]);
    if (i < ikea.length) out.push(ikea[i]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Floor-plan slots
// ---------------------------------------------------------------------------

interface Point {
  x: number;
  y: number;
}

interface Slot {
  key: string;
  x: number;
  y: number;
  /** Unit inward normal at a perimeter slot; the item is pushed this far in by
   *  half its own depth once an asset is assigned. Zero for interior slots. */
  nx: number;
  ny: number;
  rotation: number;
  perimeter: boolean;
}

const polygonOf = (room: Room, nodes: Map<string, Node>): Point[] =>
  room.loop
    .map((id) => nodes.get(id))
    .filter((n): n is Node => n !== undefined)
    .map((n) => ({ x: n.x, y: n.y }));

/** Signed area (shoelace). Sign gives the winding, which the inward normal needs. */
function signedArea(poly: Point[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Ray casting. Boundary cases are irrelevant here — every candidate is already
 *  inset from the edges. */
function insidePolygon(poly: Point[], p: Point): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToEdges(poly: Point[], p: Point): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)));
  }
  return best;
}

/**
 * Plan rotation that points an item's local +depth axis along `(nx, ny)`.
 *
 * `FurnitureLayer` maps plan rotation θ to three yaw −θ, so a model's local +Z
 * (its depth axis, world +Z = plan +y at θ=0) ends up along `(−sin θ, cos θ)` in
 * plan space. Solving for that equalling the inward normal gives this.
 */
const rotationFacing = (nx: number, ny: number): number => Math.atan2(-nx, ny);

/** Slots hugging the walls, one lap of the room's perimeter. */
function perimeterSlots(room: Room, poly: Point[], phase: number, lap: number): Slot[] {
  const inwardSign = signedArea(poly) > 0 ? 1 : -1;
  const slots: Slot[] = [];

  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < PERIMETER_SPACING) continue;

    const ux = dx / len;
    const uy = dy / len;
    // Interior lies to the LEFT of a CCW edge.
    const nx = -uy * inwardSign;
    const ny = ux * inwardSign;
    const rotation = rotationFacing(nx, ny);

    const start = PERIMETER_SPACING * (0.5 + phase);
    for (let t = start; t <= len - PERIMETER_SPACING * 0.5; t += PERIMETER_SPACING) {
      slots.push({
        key: `${room.id}:p${lap}:${i}:${t.toFixed(3)}`,
        x: a.x + ux * t,
        y: a.y + uy * t,
        nx,
        ny,
        rotation,
        perimeter: true,
      });
    }
  }
  return slots;
}

/** Slots on a grid across the room's interior, facing the room's centroid. */
function interiorSlots(room: Room, poly: Point[], phase: number, lap: number): Slot[] {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const cx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const cy = ys.reduce((s, v) => s + v, 0) / ys.length;

  const slots: Slot[] = [];
  const offset = GRID_SPACING * (0.5 + phase);
  for (let x = minX + offset; x < maxX; x += GRID_SPACING) {
    for (let y = minY + offset; y < maxY; y += GRID_SPACING) {
      const p = { x, y };
      if (!insidePolygon(poly, p)) continue;
      if (distanceToEdges(poly, p) < INTERIOR_MARGIN) continue;
      // Face the room's middle, so interior pieces at least look placed rather
      // than scattered. Degenerate at the centroid itself; any value is fine.
      const rotation = rotationFacing(cx - x, cy - y);
      slots.push({
        key: `${room.id}:g${lap}:${x.toFixed(3)}:${y.toFixed(3)}`,
        x,
        y,
        nx: 0,
        ny: 0,
        rotation,
        perimeter: false,
      });
    }
  }
  return slots;
}

/**
 * Every candidate position the plan can use, in placement order.
 *
 * Rooms are visited in `id` order and INTERLEAVED, so a 6-item run puts one item
 * in each of six rooms rather than six along one wall of the first room. Within
 * a lap, all perimeter slots come before all interior slots, because furniture
 * against walls is both the commoner arrangement and the one that keeps the
 * middle of a room clear for the walkthrough camera to move through.
 */
function buildSlots(scene: Scene): Slot[] {
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  const rooms = [...scene.rooms].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const polys = rooms
    .map((room) => ({ room, poly: polygonOf(room, nodes) }))
    .filter((entry) => entry.poly.length >= 3 && Math.abs(signedArea(entry.poly)) >= 1.5);

  const out: Slot[] = [];
  const interleave = (lists: Slot[][]) => {
    const longest = Math.max(0, ...lists.map((l) => l.length));
    for (let i = 0; i < longest; i++) {
      for (const list of lists) if (i < list.length) out.push(list[i]);
    }
  };

  for (let lap = 0; lap < LAP_PHASES.length; lap++) {
    const phase = LAP_PHASES[lap];
    interleave(polys.map(({ room, poly }) => perimeterSlots(room, poly, phase, lap)));
    interleave(polys.map(({ room, poly }) => interiorSlots(room, poly, phase, lap)));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

/** Rotation jitter, radians. Small enough that wall-backed items still read as
 *  wall-backed, large enough to break the showroom-grid look. */
const JITTER = 0.06;

/**
 * Build the furnished scene.
 *
 * Asset i goes to slot i, so a run takes DISTINCT models first and only starts
 * repeating once the pool is exhausted (it never is at realistic counts: the
 * pool is ~400 items). Distinct is the honest worst case for the number Phase 3
 * is about — repeats of one model share one set of GPU textures through drei's
 * GLTF cache, so a 40-item scene built from four models would understate texture
 * memory by an order of magnitude while looking equally furnished.
 */
export function planFurnish(scene: Scene, options: FurnishOptions): FurnishPlan {
  const pool = furnishPool(options.mix);
  const slots = buildSlots(scene);
  const random = rng(options.seed * 2654435761 + options.count);

  const n = Math.min(options.count, slots.length, pool.length * LAP_PHASES.length);
  const placements: FurnishPlacement[] = [];
  const distinct = new Set<string>();

  for (let i = 0; i < n; i++) {
    const slot = slots[i];
    const asset = pool[i % pool.length];
    // Push the item in from the wall by half its own depth, so a 0.4 m nightstand
    // and a 0.9 m wardrobe both stand flush instead of both being centred on the
    // wall line (half of each buried in it).
    const inset = slot.perimeter ? asset.footprint.d / 2 + WALL_GAP : 0;

    distinct.add(asset.realModel ?? asset.assetId);
    placements.push({
      key: `${slot.key}:${asset.assetId}`,
      assetId: asset.assetId,
      x: slot.x + slot.nx * inset,
      y: slot.y + slot.ny * inset,
      rotation: slot.rotation + (random() - 0.5) * 2 * JITTER,
      // Wall-mounted catalog items (range hoods, shower heads, towel rails) carry
      // a default height. Honour it only against a wall — the same item floating
      // 1.6 m up in the middle of a room would be a rendering of a bug.
      elevation: slot.perimeter ? (asset.defaultElevation ?? 0) : 0,
    });
  }

  return {
    placements,
    requested: options.count,
    distinctAssets: distinct.size,
    slotCount: slots.length,
    poolSize: pool.length,
  };
}
