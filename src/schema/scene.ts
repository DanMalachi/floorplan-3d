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

/** A closed room loop -> floor polygon. */
export interface Room {
  id: Id;
  name?: string;
  loop: Id[]; // ordered node ids; closure is implied (last connects to first)
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
}
