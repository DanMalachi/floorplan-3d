import type { Opening, Scene, Wall } from "@/schema/scene";
import { isGlazedDoor } from "@/render/doorStyle";

/**
 * What a door LOOKS like: its design, what it is made of, its hardware, its
 * glass and its trim. Size never lives here: the leaf is built to whatever
 * the opening measures, so one look fits every door in the house.
 *
 * Stored per opening as `Opening.door` (a complete look, never a partial one,
 * so a door reads the same whatever the rest of the house does). A door with
 * no `door` takes the HOUSE look for its kind, see `houseLook`.
 */

export type DoorKind = "interior" | "entry";

export type DoorDesign =
  | "flush" // plain slab, eased edges
  | "flush-grooves" // slab with horizontal routed grooves
  | "shaker" // one recessed flat panel
  | "shaker-2" // two flat panels, mid rail at handle height
  | "shaker-3" // three stacked flat panels
  | "panel-5" // five stacked flat panels
  | "raised-4" // four raised (bevelled) panels, classic
  | "glass-full" // stiles + rails around one glass light
  | "glass-lites" // slim frame, glass split into stacked lites
  | "glass-slot" // slab with a narrow vertical light near the latch
  | "entry-slab" // thick flush entry slab
  | "entry-grooves" // thick entry slab, horizontal grooves
  | "entry-slot" // thick entry slab with a vertical glass slot
  | "panel-2" // two raised panels, mid rail at handle height
  | "flush-inlay" // flush slab with thin metal inlay lines
  | "planked" // vertical boards between a top and bottom rail
  | "glass-grid" // frame with a 2 x 5 grid of glazed lites
  | "french" // 2 x 3 glazed lites over a raised panel
  | "entry-grille" // security entry: glazed top behind a grille, panel below
  | "entry-lines"; // thick slab with an applied relief of raised lines

export type Sheen = "matte" | "satin" | "gloss";

/** What the leaf is made of. Each kind has its own light response in
 *  `materials.ts`: wood is a real veneer scan, paint and powder coat are
 *  dielectric films with their own micro-texture, polymers are moulded
 *  plastics, and metal is a conductor (colour lives in the reflection). */
export type DoorSurface =
  | { kind: "wood"; species: VeneerId; sheen: Sheen }
  | { kind: "paint"; color: string; sheen: Sheen } // painted wood / MDF
  | { kind: "powder"; color: string; sheen: Sheen; metallic?: boolean } // powder-coated steel or aluminium
  | { kind: "polymer"; color: string; polymer: PolymerId }
  | { kind: "metal"; metal: MetalId };

export type VeneerId =
  | "white-oak" | "natural-oak" | "rift-oak" | "smoked-oak" | "grey-oak" | "black-oak"
  | "american-walnut" | "european-walnut" | "figured-walnut"
  | "ash" | "white-maple" | "cherry" | "teak" | "sapele" | "flamed-black";

export type PolymerId =
  | "upvc" // extruded PVC skin: smooth, slightly glossy
  | "hpl" // high-pressure laminate: fine matte texture
  | "supermatte" // nano-matte laminate (fingerprint-free), near-zero sheen
  | "fibreglass"; // moulded GRP entry skin: satin with a soft orange peel

export type MetalId =
  | "stainless-brushed" | "stainless-polished" | "chrome" | "nickel-satin"
  | "brass-satin" | "brass-polished" | "bronze" | "copper"
  | "aluminium-anodised" | "black-matte" | "gunmetal";

export type HandleId =
  | "lever-round" // lever on a round rose
  | "lever-square" // slim square lever on a square rose
  | "lever-plate" // lever on a long backplate with keyhole
  | "knob" // round knob on a rose
  | "pull-bar" // pull bar (entry, outside face)
  | "pull-bar-long" // floor-to-shoulder pull bar (pivot / modern entry)
  | "pull-recessed" // long recessed channel pull, integrated in the leaf
  | "flush-pull" // recessed pull (sliding leaves)
  | "none";

export type GlassId = "clear" | "frosted" | "fluted" | "reeded" | "textured" | "bronze" | "grey";

export type TrimId =
  | "flat" // square-edged flat casing, eased
  | "stepped" // two-step modern profile
  | "classic" // stepped with a back band, traditional
  | "minimal"; // no casing: flush-to-wall frame with a shadow gap

export interface DoorLook {
  design: DoorDesign;
  surface: DoorSurface;
  handle: HandleId;
  hardware: MetalId;
  glass: GlassId;
  trim: TrimId;
  /** Entry doors: a fixed glazed sidelight beside the leaf, on the hinge
   *  side. The leaf narrows to what is left and swings on its own axis. */
  sidelight?: boolean;
  /** Casing + jamb lining finish, for a deliberate combination (oak casing
   *  on a painted door, say). Absent = the casing matches the door itself;
   *  see `trimSurfaceOf`. */
  trimSurface?: DoorSurface;
}

/** Casing for a bare-metal leaf, where a matching metal casing would read as
 *  a steel box: satin white paint. */
export const DEFAULT_TRIM_SURFACE: DoorSurface = { kind: "paint", color: "#f4efea", sheen: "satin" };

/** What the casing and lining are finished in: the look's own trim surface
 *  if it names one, otherwise the door's (Dan, 2026-09-25: casings match the
 *  door unless the look is a special material + colour combination). */
export function trimSurfaceOf(look: DoorLook): DoorSurface {
  if (look.trimSurface) return look.trimSurface;
  return look.surface.kind === "metal" ? DEFAULT_TRIM_SURFACE : look.surface;
}

export const DEFAULT_LOOKS: Record<DoorKind, DoorLook> = {
  // Dan's house default (2026-09-25): white laminate, two shaker panels, in
  // done. fan "Clean Neutral White 02"; brushed stainless lever on a round
  // rose; flat casing in the same finish as the door.
  interior: {
    design: "shaker-2",
    surface: { kind: "polymer", color: "#f4f3f2", polymer: "hpl" },
    handle: "lever-round",
    hardware: "stainless-brushed",
    glass: "frosted",
    trim: "flat",
  },
  entry: {
    design: "entry-grooves",
    surface: { kind: "wood", species: "american-walnut", sheen: "satin" },
    handle: "pull-bar",
    hardware: "black-matte",
    glass: "fluted",
    trim: "flat",
  },
};

/** Designs that carry glass (so the glass picker only shows for these). */
export const GLAZED_DESIGNS: ReadonlySet<DoorDesign> = new Set<DoorDesign>([
  "glass-full", "glass-lites", "glass-slot", "entry-slot", "glass-grid", "french", "entry-grille",
]);

/** Entry designs are built to entry-door thickness. */
export const ENTRY_DESIGNS: ReadonlySet<DoorDesign> = new Set<DoorDesign>([
  "entry-slab", "entry-grooves", "entry-slot", "entry-grille", "entry-lines",
]);

/** Share of the opening a sidelight takes (the leaf gets the rest). */
export const SIDELIGHT_SHARE = 0.27;

/** Leaf thickness a design is built at (metres). Interior doors are 40 mm
 *  hollow/solid-core leaves; entry doors are 68 mm insulated leaves. */
export function leafThickness(design: DoorDesign): number {
  return ENTRY_DESIGNS.has(design) ? 0.068 : 0.04;
}

// --- Which doors this system draws ------------------------------------------

/** Solid doors only: a glazed patio slider is window-family joinery and keeps
 *  the window frame finish (see doorStyle.ts `takesWindowFinish`). */
export function usesDoorLook(o: Opening): boolean {
  return o.type === "door" && !isGlazedDoor(o);
}

// --- Entry vs interior -------------------------------------------------------

/** Wall id -> the ids of the rooms it bounds. A wall that bounds exactly one
 *  room faces outside (same rule as lib/rooms/semanticGraph.ts). */
function wallRoomCounts(scene: Scene): Map<string, number> {
  const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const byPair = new Map<string, string[]>();
  for (const w of scene.walls) {
    const k = pair(w.a, w.b);
    const arr = byPair.get(k);
    if (arr) arr.push(w.id);
    else byPair.set(k, [w.id]);
  }
  const counts = new Map<string, number>();
  for (const room of scene.rooms) {
    const seen = new Set<string>();
    const L = room.loop.length;
    for (let i = 0; i < L; i++) {
      for (const id of byPair.get(pair(room.loop[i], room.loop[(i + 1) % L])) ?? []) seen.add(id);
    }
    for (const id of seen) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

const kindCache = new WeakMap<Scene, Map<string, DoorKind>>();

/** Entry or interior, for every solid door in the scene. A door in an
 *  exterior wall (one room on one side, outside on the other) is an entry
 *  door. Portals and rails never carry doors. With no rooms traced yet,
 *  every door is interior. Cached per scene object (scenes are immutable). */
export function doorKinds(scene: Scene): Map<string, DoorKind> {
  const hit = kindCache.get(scene);
  if (hit) return hit;
  const counts = wallRoomCounts(scene);
  const walls = new Map<string, Wall>(scene.walls.map((w) => [w.id, w]));
  const out = new Map<string, DoorKind>();
  for (const o of scene.openings) {
    if (!usesDoorLook(o)) continue;
    const w = walls.get(o.wallId);
    const exterior = scene.rooms.length > 0 && (counts.get(o.wallId) ?? 0) === 1 && w?.kind !== "portal";
    out.set(o.id, exterior ? "entry" : "interior");
  }
  kindCache.set(scene, out);
  return out;
}

/** Which side of its wall is OUTSIDE, for an entry door: +1 = the wall's left
 *  normal (-uy, ux), -1 = the right. 0 when unknown. Used to put the pull bar
 *  on the outside face and the lever inside. */
export function outsideSide(scene: Scene, o: Opening): -1 | 0 | 1 {
  const w = scene.walls.find((x) => x.id === o.wallId);
  if (!w) return 0;
  const nodes = new Map(scene.nodes.map((n) => [n.id, n]));
  const a = nodes.get(w.a);
  const b = nodes.get(w.b);
  if (!a || !b) return 0;
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1e-6) return 0;
  const ux = (b.x - a.x) / L;
  const uy = (b.y - a.y) / L;
  const px = a.x + ux * o.offset;
  const py = a.y + uy * o.offset;
  // The room that owns this wall: whichever room contains a point a little
  // way off the wall's left face. If it does, outside is to the right.
  const probe = (s: number) => ({ x: px - uy * 0.25 * s, y: py + ux * 0.25 * s });
  const inside = (pt: { x: number; y: number }) =>
    scene.rooms.some((r) => {
      const poly = r.loop.map((id) => nodes.get(id)).filter((n): n is NonNullable<typeof n> => !!n);
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const pi = poly[i];
        const pj = poly[j];
        if (pi.y > pt.y !== pj.y > pt.y && pt.x < ((pj.x - pi.x) * (pt.y - pi.y)) / (pj.y - pi.y) + pi.x) c = !c;
      }
      return c;
    });
  const left = inside(probe(1));
  const right = inside(probe(-1));
  if (left && !right) return -1;
  if (right && !left) return 1;
  return 0;
}

// --- House look --------------------------------------------------------------

/** Key-order-independent identity for a look: two looks built in different
 *  orders (a preset vs an inspector edit) are the same look. */
export function lookKey(l: DoorLook): string {
  const norm = (v: unknown): unknown =>
    v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm((v as Record<string, unknown>)[k])]))
      : v;
  return JSON.stringify(norm(l));
}

/** The legacy `doorMaterial` field, read as a surface. Saved projects carry
 *  it; it keeps meaning what it meant, now as a real material. */
export function legacySurface(o: Opening): DoorSurface | undefined {
  switch (o.doorMaterial) {
    case "walnut":
      return { kind: "wood", species: "american-walnut", sheen: "gloss" };
    case "oak":
      return { kind: "wood", species: "natural-oak", sheen: "satin" };
    case "painted-charcoal":
      return { kind: "paint", color: "#413f44", sheen: "satin" };
    default:
      return undefined; // "painted-white" (the old default) = the house look
  }
}

const houseCache = new WeakMap<Scene, Record<DoorKind, DoorLook>>();

/**
 * The house look for each kind: the look most doors of that kind carry, so
 * "apply to the whole house" and every new door agree without a scene-level
 * field. Ties go to the earliest door. No styled door yet = the default.
 */
export function houseLooks(scene: Scene): Record<DoorKind, DoorLook> {
  const hit = houseCache.get(scene);
  if (hit) return hit;
  const kinds = doorKinds(scene);
  const out = { ...DEFAULT_LOOKS };
  for (const kind of ["interior", "entry"] as const) {
    const tally = new Map<string, { n: number; look: DoorLook }>();
    for (const o of scene.openings) {
      if (!o.door || kinds.get(o.id) !== kind) continue;
      const k = lookKey(o.door);
      const t = tally.get(k);
      if (t) t.n++;
      else tally.set(k, { n: 1, look: o.door });
    }
    let best: { n: number; look: DoorLook } | undefined;
    for (const t of tally.values()) if (!best || t.n > best.n) best = t;
    if (best) out[kind] = best.look;
  }
  houseCache.set(scene, out);
  return out;
}

/** The look this door renders with. */
export function resolveDoorLook(scene: Scene, o: Opening): { look: DoorLook; kind: DoorKind; own: boolean } {
  const kind = doorKinds(scene).get(o.id) ?? "interior";
  if (o.door) return { look: o.door, kind, own: true };
  const house = houseLooks(scene)[kind];
  const legacy = legacySurface(o);
  return { look: legacy ? { ...house, surface: legacy } : house, kind, own: !!legacy };
}

/** Scene patch: give every solid door of `kind` this look (the "whole house"
 *  action). Clears the legacy material so it can't fight the new look. */
export function applyLookToKind(scene: Scene, kind: DoorKind, look: DoorLook): Scene {
  const kinds = doorKinds(scene);
  return {
    ...scene,
    openings: scene.openings.map((o) => {
      if (kinds.get(o.id) !== kind) return o;
      const next: Opening = { ...o, door: look };
      delete next.doorMaterial;
      return next;
    }),
  };
}

// --- Render info (cached per scene) -------------------------------------------

export interface DoorRenderInfo {
  look: DoorLook;
  kind: DoorKind;
  /** Plan side of the wall that is outside (entry doors), see `outsideSide`. */
  outside: -1 | 0 | 1;
}

const infoCache = new WeakMap<Scene, Map<string, string>>();

/**
 * Everything the renderer needs about one door, as a STABLE string: a store
 * selector can return it and only re-render the door when its own look
 * changes, not on every hover or camera tick. Parse with `JSON.parse`.
 */
export function doorRenderKey(scene: Scene, openingId: string): string {
  let m = infoCache.get(scene);
  if (!m) {
    m = new Map();
    infoCache.set(scene, m);
  }
  const hit = m.get(openingId);
  if (hit !== undefined) return hit;
  const o = scene.openings.find((x) => x.id === openingId);
  let key = "";
  if (o && usesDoorLook(o)) {
    const { look, kind } = resolveDoorLook(scene, o);
    const info: DoorRenderInfo = { look, kind, outside: kind === "entry" ? outsideSide(scene, o) : 0 };
    key = JSON.stringify(info);
  }
  m.set(openingId, key);
  return key;
}
