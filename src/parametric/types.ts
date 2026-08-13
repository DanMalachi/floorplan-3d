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
  /** Variants this control means anything for. Absent = all of them. One
   *  generator covering twelve appliances would otherwise offer a fridge a
   *  burner count: the value is harmless (sanitizeSpec still carries it), the
   *  control is not — a dead knob teaches people the inspector lies. */
  appliesTo?: (spec: ParametricSpec) => boolean;
}

export interface GeneratorDef {
  id: ParametricSpec["generator"];
  label: string; // "Custom wardrobe"
  category: FurnitureCategory; // dock category chip
  rooms: RoomType[]; // which room tabs show the Custom card
  wallSnap: boolean;
  dimLimits: { w: [number, number]; d: [number, number]; h: [number, number] }; // meters
  /** Some products are not sold by width and height — a television is sold by
   *  its screen DIAGONAL in inches, at a fixed aspect, and the two dimensions
   *  move together. When present the inspector shows this control instead of
   *  the Width/Height fields, and the generator owns the conversion (only it
   *  knows what its bezel, chin and stand add to the picture). */
  sizeInches?: {
    label: string;
    /** Standard sizes offered as chips, e.g. [43, 50, 55, 65, 75]. */
    presets: number[];
    /** Screen diagonal of a spec, in inches. */
    of: (spec: ParametricSpec) => number;
    /** Dims for a diagonal, keeping the aspect and whatever else is bundled
     *  into the declared height (a stand). */
    dims: (spec: ParametricSpec, inches: number) => { w: number; d: number; h: number };
  };
  modules: ModuleDef[];
  fronts: ParametricSpec["front"][]; // subset relevant to this generator
  /** Whether the front-profile chips mean anything for this spec. Absent =
   *  shown whenever more than one front is offered. Same reasoning as
   *  `ModuleDef.appliesTo`: only the integrated dishwasher of the appliance
   *  set wears a door profile, and a steel fridge must not be offered one. */
  showFronts?: (spec: ParametricSpec) => boolean;
  handles: ParametricSpec["handle"][];
  finishes: string[]; // primary finish ids (ordered, first = default)
  finishes2?: string[]; // secondary finish ids, when applicable
  /** Whether the secondary swatch row means anything for this spec — the same
   *  dead-control rule `showFronts` follows. A TV's second finish paints its
   *  STAND, so the three wall-mounted cards must not offer it. Absent = shown
   *  whenever `finishes2` exists. */
  showFinishes2?: (spec: ParametricSpec) => boolean;
  /** What the secondary row is called in the inspector ("Counter", "Stand").
   *  Absent = the inspector's own default for the kitchen/sofa generators. */
  finishes2Label?: string;
  defaultSpec: ParametricSpec;
  /** Meters above floor a fresh placement starts at — wall-mounted items
   *  (kitchen wall cabinets, counter drop-ins). Absent = floor level.
   *
   *  A function when one generator mixes mounting types, and it must return
   *  undefined for the floor-standing ones: this number is applied by
   *  `placeFurniture`, so a flat value on a mixed generator silently hangs the
   *  floor variants in mid-air (which is what put the bathroom bin 1.25m up).
   *  Read it through `elevationOf` in ./index, never directly. */
  defaultElevation?: number | ((spec: ParametricSpec) => number | undefined);
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
  /** Kitchen v2: this item lives ON a kitchenBase counter — placed via
   *  CounterItemGhost, bonded through FurnitureItem.attach, rides its host.
   *  A predicate on the spec for the same reason `wallMounted` is one: the
   *  appliance set is counter-bound for a worktop microwave and floor-standing
   *  for the fridge that shares its generator. */
  counterItem?: (spec: ParametricSpec) => boolean;
  /** This item may stand on ANY furniture top (sideboard, chest of drawers,
   *  IKEA TV bench) and, unlike a sink, is perfectly fine on the floor when
   *  there is nothing under it. A TV on a stand is the case: placement offers
   *  every surface in the room but never refuses the click. */
  surfaceOptional?: boolean;
  /** Meters ABOVE the host's counter surface a counter item bonds at. Absent
   *  or 0 = sitting on the worktop (sinks, hobs, a microwave). An extractor
   *  over an island is the case that needs it: it belongs to the run — it must
   *  ride when the island moves — but it hangs in the air above it. */
  counterLift?: (spec: ParametricSpec) => number;
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
   *  mirror and not the bin that shares its generator.
   *
   *  `defaults` patches the generator's `defaultSpec` for THIS card. Appliances
   *  forced it: one generator covers a 0.6m washing machine and a 0.9m
   *  side-by-side fridge, and placing every card at one shared size would put a
   *  microwave into the world as big as a cooker. `rooms` narrows which room
   *  tabs the card appears in — a washing machine belongs to Laundry and the
   *  bathroom, not to the Kitchen tab its fridge shares a generator with. */
  variants?: {
    id: string;
    label: string;
    cardLabel?: string;
    hotspotKeywords?: string[];
    defaults?: Partial<ParametricSpec>;
    rooms?: RoomType[];
  }[];
  /** These variants are DIFFERENT PRODUCTS, not styles of one: the picker is
   *  the only place to choose between them and the inspector must not offer to
   *  switch a placed item. Set it wherever the variants carry their own
   *  `defaults` — flipping a 1.85m fridge to "oven" in the inspector keeps the
   *  fridge's dimensions and produces a fridge-sized oven. Absent = the
   *  variants are alternatives of one thing (a toilet's three mountings), so
   *  switching a placed one is legitimate. */
  variantIsProduct?: boolean;
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
