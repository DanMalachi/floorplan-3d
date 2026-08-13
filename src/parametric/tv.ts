import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { finishMaterial, tagTintOfMaterial } from "./materials";
import { anodisedMaterial, glarePlane, housingMaterial, screenGeometry, screenMaterial, standbyLed } from "./tvParts";

// Televisions — Phase 3, soft decor.
//
// The shape is trivial (a slab) and the material is everything, so most of the
// work is in `tvParts.ts`. What geometry has to get right is the SILHOUETTE:
// a modern TV is 8mm thick at the top edge and thickens into an electronics
// housing over the bottom half of its back. A uniform 5cm box reads as a
// monitor from 2005 from any angle except dead-on, which is the one angle a 3D
// plan is never viewed from.
//
// Mounting is per VARIANT, not per generator: three cards hang on a wall and
// two stand on the floor, so there is no `defaultElevation` here — a flat
// number would be applied by `placeFurniture` and float the stands (the bug
// Phase 2 fixed for the bathroom bin). Wall height comes from the wall-ray
// click; see `elevationOf` in index.ts.

/** Panel sandwich: glass + backplate at the thin top edge. */
const PANEL_T = 0.008;
/** Side and top bezel. Modern sets are near-bezel-less, but under 8mm the
 *  frame stops being a visible line at room distance and the set reads as a
 *  black hole in the wall — checked at eye level, not from the plan camera. */
const BEZEL = 0.009;
/** The chin is always deeper than the sides — that asymmetry is most of what
 *  makes a dark rectangle read as a television. */
const CHIN = 0.019;
/** Rear electronics housing, and how much of the panel's height it covers. */
const HOUSING_T = 0.032;
const HOUSING_FRAC = 0.55;

type Mount = "wall" | "floor";
type Stand = "none" | "pedestal" | "feet";

const MOUNT: Record<string, Mount> = {
  "wall-55": "wall",
  "wall-65": "wall",
  "wall-75": "wall",
  "pedestal-55": "floor",
  "feet-43": "floor",
};

const STAND: Record<string, Stand> = {
  "wall-55": "none",
  "wall-65": "none",
  "wall-75": "none",
  "pedestal-55": "pedestal",
  "feet-43": "feet",
};

function variantOf(spec: ParametricSpec): string {
  return spec.variant ?? "wall-55";
}

/** How much of the declared height belongs to the stand. The PANEL takes the
 *  rest — a card's `h` is the whole object, so a TV on a pedestal is not
 *  secretly 10cm taller than it says it is. */
function standHeight(variant: string): number {
  const s = STAND[variant] ?? "none";
  if (s === "pedestal") return 0.1;
  if (s === "feet") return 0.075;
  return 0;
}

function screenIsOn(spec: ParametricSpec): boolean {
  return (spec.modules.screenOn ?? 0) > 0;
}

// ── Size, in inches ────────────────────────────────────────────────────────
//
// Nobody buys a 1.23m television. A set is sold by the DIAGONAL of its picture
// at 16:9, and both dimensions follow from that one number — which is why the
// inspector shows inches and no width field at all. The conversion lives here
// because only this generator knows what its own bezel, chin and stand add to
// the picture area.

const IN_PER_M = 39.3701;
const ASPECT = 16 / 9;
/** Picture width as a fraction of the diagonal, at 16:9. */
const DIAG_TO_W = 16 / Math.hypot(16, 9);

/** Picture diagonal in inches, from the outer panel this spec declares. */
export function diagonalInches(spec: ParametricSpec): number {
  const pictureW = Math.max(0.05, spec.dims.w - 2 * BEZEL);
  const pictureH = pictureW / ASPECT;
  return Math.hypot(pictureW, pictureH) * IN_PER_M;
}

/** Outer dims for a screen size — width AND height together, at a fixed
 *  aspect, with the stand's own height still included in `h`. */
export function dimsForInches(spec: ParametricSpec, inches: number): { w: number; d: number; h: number } {
  const diag = Math.min(110, Math.max(24, inches)) / IN_PER_M;
  const pictureW = diag * DIAG_TO_W;
  const pictureH = pictureW / ASPECT;
  const variant = variantOf(spec);
  return {
    w: pictureW + 2 * BEZEL,
    // Depth grows a little with size: a 75" is not built on a 43"'s chassis.
    d: STAND[variant] === "none" ? (pictureW > 1.5 ? 0.08 : 0.07) : Math.max(0.22, Math.min(0.34, pictureW * 0.22)),
    h: pictureH + BEZEL + CHIN + standHeight(variant),
  };
}

/** The panel: frame, screen, rear housing, standby LED. Authored with its
 *  bottom edge at y=0 and its face toward +Z, the convention every generator
 *  in the catalog follows.
 *
 *  `face` is where the glass sits in local Z. It is NOT zero: like the kitchen
 *  carcass, an item is authored CENTRED on its own depth (z from -d/2 to +d/2)
 *  because that is what placement assumes when it backs the item onto a wall.
 *  Authored with the glass at z=0 instead, a wall-mounted set placed flush
 *  ended up buried IN the plaster: the only thing left in the room was the
 *  screen plane itself, which is why it rendered as a black rectangle with no
 *  bezel, no housing and no edge. */
function buildPanel(w: number, h: number, face: number, on: boolean, bezelMat: THREE.Material): THREE.Group {
  const g = new THREE.Group();

  // Front frame: the thin part. Its front face sits at `face`, and everything
  // else measures backward from the glass.
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h, PANEL_T), bezelMat);
  frame.position.set(0, h / 2, face - PANEL_T / 2);
  g.add(frame);

  const sw = Math.max(0.05, w - 2 * BEZEL);
  const sh = Math.max(0.05, h - BEZEL - CHIN);
  const screen = new THREE.Mesh(screenGeometry(sw, sh), screenMaterial(on));
  // Centred on the picture area, which is pushed UP by the deeper chin.
  screen.position.set(0, CHIN + sh / 2, face + 0.0012);
  g.add(screen);

  // The room's reflection, faked. Only when the set is off: a lit panel washes
  // its own glare out, and leaving it on top of the picture reads as a smear.
  if (!on) {
    const glare = glarePlane(sw, sh);
    glare.position.set(0, CHIN + sh / 2, face + 0.0016);
    g.add(glare);
  }

  // Rear housing: the bulge that carries the boards and the ports. Narrower
  // than the panel and only over the lower half — seen from the side, this is
  // the whole difference between a TV and a slab.
  const hw = w * 0.86;
  const hh = Math.max(0.06, h * HOUSING_FRAC);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(hw, hh, HOUSING_T), housingMaterial());
  housing.position.set(0, hh / 2 + h * 0.03, face - PANEL_T - HOUSING_T / 2);
  g.add(housing);

  const led = standbyLed(on);
  led.position.set(0, CHIN * 0.45, face + 0.002);
  g.add(led);

  return g;
}

/** Two blade feet, splayed outward, each with a pad. Kept inside the panel's
 *  own width so the declared footprint still contains everything. */
function buildFeet(w: number, d: number, standH: number, back: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const padD = Math.min(d - 0.02, 0.2);
  for (const sx of [-1, 1]) {
    const foot = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.016, standH, 0.028), mat);
    blade.position.y = standH / 2;
    foot.add(blade);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.01, padD), mat);
    // The pad reaches BACKWARD from the panel — a set on feet tips forward
    // otherwise, and the footprint it declares is mostly behind the glass.
    pad.position.set(0, 0.005, -padD * 0.5);
    foot.add(pad);
    foot.position.set(sx * w * 0.36, 0, back);
    // A few degrees of splay: parallel blades read as a shop display stand.
    foot.rotation.z = -sx * 0.07;
    g.add(foot);
  }
  return g;
}

/** Central column on an oval plate. */
function buildPedestal(w: number, d: number, standH: number, back: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  // Oval plate centred in the footprint: it reaches behind the panel, which is
  // what stops a screen this size from being nose-heavy.
  const plateR = Math.min(d * 0.46, w * 0.22);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(plateR, plateR, 0.012, 40), mat);
  plate.scale.set(1.45, 1, 1);
  plate.position.set(0, 0.006, 0);
  g.add(plate);

  const colZ = back - 0.03;
  const col = new THREE.Mesh(new THREE.BoxGeometry(w * 0.1, standH - 0.012, 0.03), mat);
  col.position.set(0, 0.012 + (standH - 0.012) / 2, colZ);
  g.add(col);

  // A short neck bridging the column forward to the panel's back, so the panel
  // is not balanced on a knife edge.
  const neck = new THREE.Mesh(new THREE.BoxGeometry(w * 0.16, 0.02, Math.max(0.05, back - colZ + 0.03)), mat);
  neck.position.set(0, standH - 0.01, (colZ + back) / 2);
  g.add(neck);
  return g;
}

/** The wall plate a mounted set hangs on: unseen from the front, but it is
 *  what holds the panel off the wall instead of embedding it in the plaster.
 *  `back` is the rear of the housing, `wall` the rear of the footprint — the
 *  plane placement pushes against the wall face. */
function buildBracket(w: number, h: number, back: number, wall: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const gap = Math.max(0.008, back - wall);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(w * 0.34, h * 0.4, 0.01), mat);
  plate.position.set(0, h * 0.45, wall + 0.005);
  g.add(plate);
  for (const sy of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, 0.03, gap), mat);
    arm.position.set(0, h * 0.45 + sy * h * 0.15, wall + gap / 2);
    g.add(arm);
  }
  return g;
}

/** Card dims straight from the size on the card's own label — so a "55\"" TV
 *  measures 55", and nobody has to keep two numbers in step by hand. */
const cardDims = (variant: string, inches: number) =>
  dimsForInches({ variant } as ParametricSpec, inches);

export const tvGenerator: GeneratorDef = {
  id: "tv",
  label: "TV",
  category: "Decor",
  // Living only for now: a card nobody can reach through the illustrated room
  // does not exist, and living is the one room with a TV button today. The
  // wide roll-out (bedroom / study / kids) adds the buttons and the art in one
  // pass, and this list grows with it.
  rooms: ["living"],
  wallSnap: true,
  dimLimits: { w: [0.5, 2.2], d: [0.05, 0.4], h: [0.3, 1.3] },
  modules: [
    {
      key: "screenOn",
      label: "Screen",
      min: 0,
      max: 1,
      default: 1,
      // Two states get named buttons, never a 0/1 stepper.
      toggle: { on: "Screen on", off: "Screen off" },
    },
  ],
  fronts: ["slab"],
  handles: ["none"],
  // The frame tone. The screen and the rear housing are intrinsic — nobody
  // ships an oak bezel — so this list is deliberately short.
  finishes: ["glass-black", "steel", "painted"],
  // The stand, and only the stand: hidden on the wall-mounted cards, where it
  // would be a control that does nothing.
  finishes2: ["steel", "oak", "walnut", "painted"],
  finishes2Label: "Stand",
  showFinishes2: (spec) => STAND[variantOf(spec)] !== "none",
  wallMounted: (spec) => MOUNT[variantOf(spec)] === "wall",
  // A set on a stand goes where a set on a stand goes: on top of the media
  // unit, the sideboard, the chest of drawers — parametric or IKEA, whatever
  // is under it — and on the floor when there is nothing. Same bonding the
  // worktop microwave uses (FurnitureItem.attach), with the host set widened
  // to every surface in the room (surfaceHosts.ts).
  counterItem: (spec) => STAND[variantOf(spec)] !== "none",
  surfaceOptional: true,
  cutoutSize: () => null, // a TV stands ON a surface; it cuts nothing
  sizeInches: {
    label: "Screen",
    presets: [32, 43, 50, 55, 65, 75, 85],
    of: diagonalInches,
    dims: dimsForInches,
  },
  hotspotKeywords: ["tv", "television"],
  // A 75" on the wall and a 43" on feet are two products, not two styles of
  // one: switching variant on a placed item would keep the old size.
  variantIsProduct: true,
  variants: [
    {
      id: "wall-55",
      label: "55\" wall",
      cardLabel: "Wall-mounted TV 55\"",
      hotspotKeywords: ["tv", "television"],
      defaults: { dims: cardDims("wall-55", 55), finish: "glass-black" },
    },
    {
      id: "wall-65",
      label: "65\" wall",
      cardLabel: "Wall-mounted TV 65\"",
      hotspotKeywords: ["tv", "television"],
      defaults: { dims: cardDims("wall-65", 65), finish: "glass-black" },
    },
    {
      id: "wall-75",
      label: "75\" wall",
      cardLabel: "Wall-mounted TV 75\"",
      hotspotKeywords: ["tv", "television"],
      defaults: { dims: cardDims("wall-75", 75), finish: "glass-black" },
    },
    {
      id: "pedestal-55",
      label: "55\" pedestal",
      cardLabel: "TV on pedestal 55\"",
      hotspotKeywords: ["tv", "television"],
      defaults: { dims: cardDims("pedestal-55", 55), finish: "glass-black", finish2: "steel" },
    },
    {
      id: "feet-43",
      label: "43\" feet",
      cardLabel: "TV on feet 43\"",
      hotspotKeywords: ["tv", "television"],
      defaults: { dims: cardDims("feet-43", 43), finish: "steel", finish2: "steel" },
    },
  ],
  defaultSpec: {
    generator: "tv",
    dims: { w: 1.23, d: 0.07, h: 0.71 },
    modules: { screenOn: 1 },
    front: "slab",
    handle: "none",
    finish: "glass-black",
    finish2: "steel",
    variant: "wall-55",
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d, h } = spec.dims;
    const variant = variantOf(spec);
    const stand = STAND[variant] ?? "none";
    const on = screenIsOn(spec);
    const group = new THREE.Group();

    // The bezel wears the chosen frame finish, but an anodised bezel is the
    // default look, so `glass-black` maps to the brushed dark metal rather
    // than to the flat dark glass the kitchen uses for oven doors.
    const frameMat = spec.finish === "glass-black" ? anodisedMaterial() : finishMaterial(spec.finish);
    const standMat = finishMaterial(spec.finish2 ?? "steel");

    const standH = standHeight(variant);
    const panelH = Math.max(0.2, h - standH);
    // Authored centred on the declared depth, like the kitchen carcass: glass
    // at the front face, everything else measured back from it.
    const face = d / 2;
    const back = face - PANEL_T - HOUSING_T;
    const panel = buildPanel(w, panelH, face, on, frameMat);
    panel.position.y = standH;
    group.add(panel);

    if (stand === "pedestal") group.add(buildPedestal(w, d, standH, back, standMat));
    else if (stand === "feet") group.add(buildFeet(w, d, standH, back, standMat));
    else group.add(buildBracket(w, panelH, back, -d / 2, housingMaterial()));

    // Only meshes actually wearing the chosen finishes take the wheel's
    // colour: tinting the group wholesale would paint the screen.
    tagTintOfMaterial(group, spec.finish, spec.color, frameMat);
    tagTintOfMaterial(group, spec.finish2 ?? "steel", spec.color2, standMat);
    return group;
  },
};
