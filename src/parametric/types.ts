import type * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { FurnitureCategory, RoomType } from "@/furniture/catalog";

export interface ModuleDef {
  key: string; // key into spec.modules
  label: string; // "Doors", "Drawers", …
  min: number;
  max: number; // hard clamp; generator may clamp further by dims
  default: number;
}

export interface GeneratorDef {
  id: ParametricSpec["generator"];
  label: string; // "Custom wardrobe"
  category: FurnitureCategory; // dock category chip
  rooms: RoomType[]; // which room tabs show the Custom card
  wallSnap: boolean;
  dimLimits: { w: [number, number]; d: [number, number]; h: [number, number] }; // meters
  modules: ModuleDef[];
  fronts: ParametricSpec["front"][]; // subset relevant to this generator
  handles: ParametricSpec["handle"][];
  finishes: string[]; // primary finish ids (ordered, first = default)
  finishes2?: string[]; // secondary finish ids, when applicable
  defaultSpec: ParametricSpec;
  /** Pure build: spec → group. Origin at floor center (y=0 at floor, x/z centered),
   *  front faces +Z — same convention FurnitureLayer's normalize() produces. */
  build(spec: ParametricSpec): THREE.Group;
}
