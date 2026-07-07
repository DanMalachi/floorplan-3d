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
  // "rail" = a low, see-through barrier (balcony railing / balustrade / low
  // parapet) rather than a solid wall. Bounds rooms like a wall in the graph,
  // but renders low and transparent. Absent = wall. Mirrors TraceSegment.type.
  kind?: "wall" | "rail";
}

export type OpeningType = "door" | "window";

/** An opening cut into a wall, expressed in wall-local space. */
export interface Opening {
  id: Id;
  type: OpeningType;
  wallId: Id;
  offset: number; // center distance along the wall from node a, in meters
  width: number; // meters
  height: number; // meters
  sill: number; // meters above floor (doors typically 0)
}

export type FloorStyle = "wood" | "tile" | "concrete";

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
  sharesWallWith: Id[]; // room ids sharing >= 1 wall
  connectedVia: { room: Id; opening: Id }[]; // rooms reachable through a door/window
  // future: opensInto, receivesLightFrom, accessibleFrom, parentZone
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
}

/** A placed furniture piece. Geometry lives in the catalog asset; the scene
 *  stores only placement. Front faces local +Z; back (wall side) is -Z. */
export interface FurnitureItem {
  id: Id;
  assetId: string; // catalog key, e.g. "loungeSofa"
  x: number; // plan meters (center)
  y: number;
  rotation: number; // radians about world up
  elevation?: number; // meters above floor (default 0)
}

export interface Scene {
  schemaVersion: 2;
  units: "meters";
  nodes: Node[];
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  furniture: FurnitureItem[];
  building?: BuildingSemantics; // Building Knowledge Layer — house-level verdict
}
