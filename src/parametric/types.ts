import type * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { FurnitureCategory, RoomType } from "@/furniture/catalog";

export interface ModuleDef {
  key: string; // key into spec.modules
  label: string; // "Doors", "Drawers", …
  min: number;
  max: number; // hard clamp; generator may clamp further by dims
  default: number;
  /** Two-state module (min 0 / max 1): the inspector renders a labelled pair
   *  of buttons instead of a +/- stepper, because "Lid open: 0" is a number
   *  standing in for a word. `on` is the label for value 1. */
  toggle?: { on: string; off: string };
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
  /** Meters above floor a fresh placement starts at — wall-mounted items
   *  (kitchen wall cabinets, counter drop-ins). Absent = floor level. */
  defaultElevation?: number;
  /** Flat/overlappable items that neither block nor get blocked by
   *  collision (counter drop-ins sitting on a base run's own OBB). */
  noCollide?: boolean;
  /** This item hangs on a WALL, not on the floor: placement points at a wall
   *  face and reads the wall grid (position, facing and height in one hit),
   *  the same interaction kitchenWall runs use. A predicate rather than a
   *  boolean because one generator can cover both — the bathroom accessory
   *  set is wall-mounted for a mirror or towel rail and floor-standing for a
   *  bin. Absent = floor item. */
  wallMounted?: (spec: ParametricSpec) => boolean;
  /** Kitchen v2: this generator lives ON a kitchenBase counter — placed via
   *  CounterItemGhost, bonded through FurnitureItem.attach, rides its host.
   *  Any future counter appliance/decor generator just sets this. */
  counterItem?: boolean;
  /** Kitchen v2: the countertop hole this item needs, in meters — attachment
   *  sync writes it into the host's spec.cutouts. Return null for items that
   *  sit on the surface without cutting (decor, small appliances). */
  cutoutSize?: (spec: ParametricSpec) => { w: number; d: number } | null;
  /** Variants are separate PIECES, not just inspector chips: the dock renders
   *  one browsable card per variant, so a generator with 4 variants reads as 4
   *  products when someone is shopping. Only choices that change what the
   *  thing IS belong here — styling that a placed item can be re-tuned to
   *  (front profile, handle, dimensions, finish, colour) stays in the
   *  inspector. First entry is the default.
   *
   *  `label` is the short inspector chip ("Doors"); `cardLabel` is the name
   *  that has to stand on its own in the picker ("Vanity with doors") and
   *  falls back to "<generator> · <label>". `hotspotKeywords` narrows the
   *  room-scene match to this variant, so the Mirror hotspot surfaces the
   *  mirror and not the bin that shares its generator. */
  variants?: { id: string; label: string; cardLabel?: string; hotspotKeywords?: string[] }[];
  /** Words the room-scene hotspots match this generator against, so clicking
   *  "Toilet" in the illustrated room surfaces the toilet generator and not
   *  every custom card in the room. Defaults to the generator's label, which
   *  is enough when the label already says what the thing is ("Toilet",
   *  "Shower") — spell it out when it doesn't ("Mirror & accessories" also
   *  covers towels and bins). */
  hotspotKeywords?: string[];
  /** Pure build: spec → group. Origin at floor center (y=0 at floor, x/z centered),
   *  front faces +Z — same convention FurnitureLayer's normalize() produces. */
  build(spec: ParametricSpec): THREE.Group;
}
