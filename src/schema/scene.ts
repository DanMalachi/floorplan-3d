// Single source of truth for the 3D model. Decoupled from Three.js.
// Units: meters everywhere. Plan coords are (x, y) in the floor plane;
// the renderer maps plan (x, y) -> world (x, z), with Y up.

export type Id = string;

/** A point in the 2D floor plane, in meters. */
export interface Node {
  id: Id;
  x: number;
  y: number;
}

/** A straight wall segment between two nodes. Arbitrary angle — never axis-aligned-only. */
export interface Wall {
  id: Id;
  a: Id; // start node id
  b: Id; // end node id
  thickness: number; // meters
  height?: number; // meters; falls back to WALL_HEIGHT when undefined
  // What KIND of boundary this edge is. Every kind bounds rooms identically in
  // the graph — closure is topology, not construction — but each builds
  // different geometry. Absent = wall. Mirrors TraceSegment.type.
  //   "rail"   = a low, see-through barrier (balcony railing / balustrade /
  //              low parapet). Renders low and transparent.
  //   "portal" = an OPEN boundary: no barrier at all, just the line where one
  //              space becomes another (a living room giving onto a corridor).
  //              Renders nothing. It exists so a room can be closed for area
  //              and floor purposes WITHOUT inventing a wall that isn't there
  //              and then punching a fake door through it.
  kind?: "wall" | "rail" | "portal";
  // Per-face paint. A wall has two long faces (one per adjacent room). Side "a"
  // is the wall-local +Z face, side "b" the -Z face. A hex string paints that
  // face; undefined leaves it default plaster. Painted independently.
  paintA?: string;
  paintB?: string;
}

/**
 * Does this wall contribute a solid, full-thickness body to the 3D model?
 *
 * The single source of truth for "is this a real wall" — wall junctions, wall
 * bodies and baseboards all gate on it, so a new non-solid `kind` only has to
 * be taught here. Rails render as their own thin barrier and portals render
 * nothing; neither ever takes part in a corner join, so a wall running into
 * one gets a square-capped jamb rather than a mitre into thin air.
 */
export const isSolidWall = (w: Wall): boolean =>
  w.kind !== "rail" && w.kind !== "portal";

// "passage" = a cased opening: a real hole in the wall with NO door in it, for
// spaces that connect openly but are still divided by a wall. (Where there is
// no wall at all, that's a portal — see Wall.kind.)
export type OpeningType = "door" | "window" | "passage";

/**
 * How a door's leaves move. Absent = an ordinary hinged swing door.
 *
 *  "bypass"  = panels run in tracks INSIDE the wall's depth and slide past one
 *              another — a 2-panel glazed patio slider, or wardrobe bypass
 *              doors. The panels stack up at one jamb.
 *  "surface" = a single leaf hangs on the wall FACE and slides clear of the
 *              opening along it — a barn door. Wider than the hole it covers.
 *
 * There's no pocket door: that would need the wall to model a cavity.
 */
export interface SlideSpec {
  style: "bypass" | "surface";
  panels: number; // bypass: 2-3. surface: always 1.
  glazed?: boolean; // true = glazed sash (patio); false/absent = solid leaf
  open?: number; // 0 = shut, 1 = slid fully open (default 0)
  side?: "start" | "end"; // the jamb the panels stack at (default "end")
}

/** An opening cut into a wall, expressed in wall-local space. */
export interface Opening {
  id: Id;
  type: OpeningType;
  wallId: Id;
  offset: number; // center distance along the wall from node a, in meters
  width: number; // meters
  height: number; // meters
  sill: number; // meters above floor (doors typically 0)
  // --- Joinery (all optional, additive; doors/windows render real geometry) ---
  swingDeg?: number; // door leaf open angle, 0 = closed (default). Swing doors only.
  hinge?: "start" | "end"; // which jamb the leaf hinges on (default "start"). Swing doors only.
  slide?: SlideSpec; // present = a SLIDING door; swingDeg/hinge are then unused
  mullions?: { cols: number; rows: number }; // window glazing-bar grid (default {cols:2,rows:1})
  lining?: boolean; // passages only: jamb+head casing (default true; false = bare reveal)
  // --- Materials (Realism sprint, additive) ---
  doorMaterial?: "walnut" | "painted-white" | "painted-charcoal" | "oak"; // doors only (default "painted-white")
  frameMaterial?: "aluminum-matte" | "aluminum-glossy" | "painted"; // windows only (default "aluminum-matte")
  frameColor?: string; // windows only: hex tint over the frame material's own color (absent = natural)
}

/**
 * A floor material id, persisted per room.
 *
 * Was a closed union of "wood" | "tile" | "concrete" — the three procedurally
 * drawn styles. Widened to a string so rooms can also reference the image-based
 * PBR catalog in src/materials/registry.ts, whose ids look like
 * "wood-oak-natural" or "tile-hex-white".
 *
 * The three original values remain valid and keep resolving to the procedural
 * textures, so projects saved before the catalog existed still render.
 */
export type FloorStyle = string;

// ---------------------------------------------------------------------------
// Building Knowledge Layer — semantics sit ON TOP of geometry, never inside it.
// "Deterministic code owns geometry; the model owns meaning." Every field below
// is additive/optional and carries its provenance, so the whole layer can be
// recomputed, cached and versioned without ever touching walls/openings/rooms.
// ---------------------------------------------------------------------------

/** Where a semantic fact came from — enables recompute, debug, and comparing
 *  rule-based vs AI-based inferences. */
export type FactSource = "geometry" | "rule" | "ocr" | "vlm";

/** One reason behind a classification, with provenance and contribution. */
export interface Evidence {
  feature: string; // e.g. "hasCloset", "adjacentBathroom", "ocrLabel"
  value?: string | number | boolean; // the observed value, when meaningful
  weight: number; // 0..1 contribution to the decision
  source: FactSource;
}

/** Room type is an OPEN vocabulary (plain string) so "nursery", "mud room",
 *  "tatami room" never require a release. KNOWN_ROOM_TYPES (src/lib/roomTaxonomy)
 *  is a hint list the rule classifier and UI use, not a constraint. */
export type RoomType = string;

/** Deterministic, geometry-derived description of a room. All free to compute. */
export interface RoomFeatures {
  areaM2: number;
  doorCount: number;
  windowCount: number;
  exteriorWallCount: number; // boundary walls bordering only this room
  railWallCount: number; // boundary edges that are rails — strong outdoor (balcony/deck) signal
  portalWallCount: number; // boundary edges that are open portals — an open-plan signal
  longestWallM: number;
  perimeterM: number;
  aspectRatio: number; // bbox long / short
  hasCloset: boolean; // a small windowless single-door room opens off this one
  hasPlumbing?: boolean; // fixture-derived — populated once fixture detection exists
  contains?: string[]; // fixture/furniture ids in the room — future
}

/** Extensible room-to-room relationships. Only the two deterministic ones are
 *  populated in v1; the rest are left open for later layers. */
export interface RoomRelationships {
  sharesWallWith: Id[]; // room ids sharing >= 1 boundary edge of any kind
  connectedVia: { room: Id; opening: Id }[]; // rooms reachable through a door/window
  // Rooms this one flows into without opening anything: a portal (no wall at
  // all) or a passage (a cased hole in one). Different construction, same fact.
  opensInto: Id[];
  // future: receivesLightFrom, accessibleFrom, parentZone
}

/** The semantic verdict for one room. Recomputable and provenance-tracked. */
export interface RoomSemantics {
  type: RoomType; // best label (open vocab)
  alternatives: string[]; // ranked runner-up labels
  function?: string; // "sleeping" | "hygiene" | "circulation" | ... (open vocab)
  confidence: number; // 0..1
  evidence: Evidence[]; // structured reasons + provenance
  features: RoomFeatures;
  relationships: RoomRelationships;
  source: FactSource; // what decided `type`: "rule" | "vlm"
}

/** House-level understanding above the rooms. Global consistency lives here
 *  (≈ one kitchen, one entry; infer the leftover room from the whole set). */
export interface BuildingSemantics {
  archetype?: string; // e.g. "3-bedroom single-family" (open vocab)
  roomCounts: Record<string, number>; // type -> count
  confidence: number;
  evidence: Evidence[];
  source: FactSource;
}

/** A closed room loop -> floor polygon. */
export interface Room {
  id: Id;
  name?: string;
  loop: Id[]; // ordered node ids; closure is implied (last connects to first)
  floor?: FloorStyle; // defaults to "wood"
  semantics?: RoomSemantics; // Building Knowledge Layer — additive, recomputable
  // Authored ceiling state (M2 lighting, render-contract.md §8.3) — a room is
  // roofed by design or open to the sky by design. Undefined means unauthored
  // (no authoring UI ships in M2 yet): src/lib/rooms/roomCeiling.ts is the one
  // place allowed to fall back to a geometric guess (rail adjacency) when this
  // is absent. Lighting code itself must only ever read this field — never
  // mesh mount state (`visible`/`wallMode`) or rail edges directly, since that
  // is the render layer's own inference and it will diverge (§8.3).
  ceiling?: "roofed" | "open";
  // Authored per-room ceiling height, meters. Undefined falls back to the
  // existing derived rule (tallest wall on the room's own perimeter) — see
  // src/render/ceilingHeight.ts, the one place both FloorMesh.tsx's Ceilings
  // component and roomLighting.ts's ceilingHeights() resolve this from, so
  // the two can never disagree about where a room's ceiling actually sits.
  ceilingHeight?: number;
}

/** Config for a procedurally generated furniture item (parametric furniture).
 *  Geometry is rebuilt deterministically from this spec at render time by
 *  src/parametric/ — the scene stores only the recipe, never meshes. */
export interface ParametricSpec {
  generator: "wardrobe" | "kitchenRun" | "sofa";
  /** Outer bounding dims in meters: w along local X, d along local Z, h up. */
  dims: { w: number; d: number; h: number };
  /** Generator-specific integer counts, e.g. { doors: 3, drawers: 2 }.
   *  Missing keys fall back to the generator's defaults. */
  modules: Record<string, number>;
  front: "slab" | "shaker" | "farmhouse";
  handle: "bar" | "knob" | "none";
  /** Finish id resolved by src/parametric/materials.ts (carcass + fronts,
   *  or upholstery for the sofa). */
  finish: string;
  /** Secondary finish: kitchen countertop / sofa accent pillows. */
  finish2?: string;
}

/** A placed furniture piece. Geometry lives in the catalog asset; the scene
 *  stores only placement. Front faces local +Z; back (wall side) is -Z. */
export interface FurnitureItem {
  id: Id;
  assetId: string; // catalog key, e.g. "loungeSofa"; parametric items use "param:<generator>"
  x: number; // plan meters (center)
  y: number;
  rotation: number; // radians about world up
  elevation?: number; // meters above floor (default 0)
  parametric?: ParametricSpec; // present ⇔ assetId starts with "param:"
}

/**
 * A placed lighting fixture. Ceiling fixtures store raw plan coordinates,
 * same as furniture; which room's light they drive is derived at read time
 * via point-in-polygon against `scene.rooms` (`src/render/roomLighting.ts`),
 * never stored, so it can't desync when a room's loop changes. Wall fixtures
 * anchor the same way `Opening` does (`wallId` + `offset`) rather than raw
 * xy, since they need to stay glued to a wall face.
 */
export type FixtureMount =
  | { kind: "ceiling"; x: number; y: number }
  // `side` picks which of the wall's two faces the fixture is mounted on and
  // therefore which room it lights — mirrors `Wall.paintA`/`paintB`'s "a" =
  // wall-local +Z face, "b" = -Z face convention, so a shared wall between
  // two rooms can carry a light on either side unambiguously.
  | { kind: "wall"; wallId: Id; offset: number; sill: number; side: "a" | "b" };

export interface FixtureItem {
  id: Id;
  assetId: string; // catalog key, e.g. "fx:flushDisc"
  rotation: number; // radians about world up
  mount: FixtureMount;
  // Per-fixture brightness/color overrides (undefined = the catalog default —
  // see DEFAULT_FIXTURE_LUX/DEFAULT_FIXTURE_COLOR_K in render/lightPresets.ts).
  // Physical units, same convention as every other light in this renderer:
  // lux, not an eyeballed 0-1 "strength".
  targetLux?: number;
  colorK?: number; // color temperature, Kelvin
}

/** One straight flight within a staircase. Centerline, plan meters. */
export interface StairFlight {
  x0: number;
  y0: number; // foot (lower end)
  x1: number;
  y1: number; // head (upper end)
}

/**
 * A staircase: one or more straight flights climbing to a single total `rise`.
 *
 * NOT part of the wall graph. The endpoints are free coordinates rather than
 * node ids on purpose: a stair bounds no room, splits no wall and joins no
 * corner, so it must never reach `analyzeLoops` or the junction solver.
 *
 * Flights are stored in walking order and are deliberately NOT connected: the
 * GAP between consecutive flights is what a landing is, and its footprint is
 * derived (convex hull of the two facing cross-sections). That is why this is
 * a list of flights and not a polyline — the type encodes the rule.
 *
 * `rise` is the TOTAL climb, not per flight: the step count derives from it
 * once and is distributed across the flights, so the riser is uniform over the
 * whole staircase by construction and a landing can never sit at a height that
 * doesn't line up.
 *
 * With no second floor modeled, the last flight terminates at a landing stub
 * whose top sits at `rise` — "the floor above starts here". `rise` is always
 * positive (up); descending stairs need a void in the floor slab, a later tier.
 */
export interface Stair {
  id: Id;
  flights: StairFlight[]; // >= 1, walking order, bottom first
  width: number; // meters, perpendicular to the run; one width for the whole stair
  rise: number; // meters, TOTAL climb, > 0
  // Absent = derived from `rise` and COMFORT_RISER (see src/lib/stairs).
  // Present = the user matched the tread count drawn on the plan.
  steps?: number; // TOTAL across all flights
  // How the stair is BUILT, which is a look, not a shape: both styles occupy
  // the same footprint and the same treads.
  //   "solid" = closed stringer — a masonry/boxed-in flight sitting on the
  //             floor, and landings built down to the floor with it.
  //   "open"  = open riser — floating treads on two side stringers, landings
  //             carried as slabs. You can see through and under it.
  // Absent = "solid".
  style?: "solid" | "open";
}

export interface Scene {
  schemaVersion: 2;
  units: "meters";
  nodes: Node[];
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  furniture: FurnitureItem[];
  // Optional forever: every project saved before stairs existed has no such key
  // at runtime, whatever the type says. Consumers read `scene.stairs ?? []`.
  stairs?: Stair[];
  // Optional forever, same convention as stairs: every project saved before
  // fixtures existed has no such key. `undefined` (never seeded) is distinct
  // from `[]` (seeded, then user cleared it) — `seedRoomFixtures` only ever
  // acts on the former. Consumers read `scene.fixtures ?? []`.
  fixtures?: FixtureItem[];
  building?: BuildingSemantics; // Building Knowledge Layer — house-level verdict
}
