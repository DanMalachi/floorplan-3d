import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { finishMaterial, tagTintOfMaterial } from "./materials";
import { applianceBody, grille, lampLens, sealMat, glassMat } from "./applianceParts";

// Extractor hoods — Phase 2's second generator, separate from `appliance`
// because a hood is the one white good that is never a box on the floor: all
// three variants hang, and two of them hang off a wall.
//
// ORIGIN CONVENTION: y=0 is the hood's UNDERSIDE, not its top. Everything that
// positions a hood is asking "how high is the bottom of it above the hob" —
// the wall-ray click height for the wall variants, the counter lift for the
// island one — so the geometry is authored to make that the number you set.
//
// The island hood is a COUNTER item: it belongs to the run it hangs over (drag
// the island and the hood goes with it), it just bonds `counterLift` metres
// above the worktop instead of on it. That also keeps the ghost honest — the
// preview and the placed item read the same pose from the same host, which a
// floor ghost could not do for something 1.5m in the air.

const FLUE_W = 0.26;
const FLUE_D = 0.24;

const variantOf = (spec: ParametricSpec) => spec.variant ?? "chimney";
const lightsOn = (spec: ParametricSpec) => (spec.modules.lights ?? 1) >= 1;

/** The working face of any hood: grease filters and lamps, looking down at
 *  the hob. It is the only part of a hood anyone ever looks straight at. */
function underside(w: number, d: number, spec: ParametricSpec, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const panels = w > 0.75 ? 2 : 1;
  const pw = (w - 0.09) / panels;
  for (let i = 0; i < panels; i++) {
    const filter = grille(pw - 0.02, d * 0.52, 4, mat);
    filter.rotation.x = Math.PI / 2; // lay the grille flat, slats facing down
    filter.position.set(-w / 2 + 0.045 + pw * (i + 0.5), 0.008, -d * 0.06);
    g.add(filter);
  }
  const on = lightsOn(spec);
  for (const sx of [-1, 1]) {
    const lens = lampLens(Math.min(0.045, w * 0.07), on);
    lens.position.set((sx * w) / 3.2, 0.006, d * 0.3);
    g.add(lens);
  }
  return g;
}

/** Rectangular flue rising from the canopy to the top of the item. */
function flue(fromY: number, toY: number, z: number, mat: THREE.Material): THREE.Mesh | null {
  const len = toY - fromY;
  if (len < 0.03) return null;
  const m = new THREE.Mesh(new THREE.BoxGeometry(FLUE_W, len, FLUE_D), mat);
  m.position.set(0, fromY + len / 2, z);
  return m;
}

export const rangeHoodGenerator: GeneratorDef = {
  id: "rangeHood",
  label: "Range hood",
  category: "Kitchen",
  rooms: ["kitchen"],
  wallSnap: true,
  dimLimits: { w: [0.5, 1.3], d: [0.35, 0.75], h: [0.12, 1.1] },
  modules: [
    { key: "lights", label: "Lights", min: 0, max: 1, default: 1, toggle: { on: "Lights on", off: "Lights off" } },
  ],
  fronts: ["slab"],
  handles: ["none"],
  finishes: ["steel", "glass-black", "painted"],
  // Chimney and visor hang on a wall; the island hood hangs over a counter run.
  wallMounted: (spec) => variantOf(spec) !== "island",
  counterItem: (spec) => variantOf(spec) === "island",
  counterLift: () => 0.65, // canopy underside ~1.55m over a 0.90m worktop
  cutoutSize: () => null,
  noCollide: true, // it hangs in the air; nothing on the floor can hit it
  hotspotKeywords: ["hood", "range hood", "cooker hood", "extractor"],
  // Chosen from the picker only: the three hoods differ in size AND in how
  // they mount, so switching one on a placed item would strand a wall hood in
  // the middle of a room. Same rule as the appliance set.
  variantIsProduct: true,
  variants: [
    {
      id: "chimney",
      label: "Chimney",
      cardLabel: "Chimney hood",
      hotspotKeywords: ["hood", "extractor"],
      defaults: { dims: { w: 0.6, d: 0.5, h: 0.72 }, finish: "steel" },
    },
    {
      id: "island",
      label: "Island",
      cardLabel: "Island hood",
      hotspotKeywords: ["hood", "extractor", "island"],
      defaults: { dims: { w: 0.9, d: 0.6, h: 0.8 }, finish: "steel" },
    },
    {
      id: "visor",
      label: "Visor",
      cardLabel: "Under-cabinet visor hood",
      hotspotKeywords: ["hood", "extractor"],
      defaults: { dims: { w: 0.6, d: 0.46, h: 0.16 }, finish: "steel" },
    },
  ],
  defaultSpec: {
    generator: "rangeHood",
    dims: { w: 0.6, d: 0.5, h: 0.72 },
    modules: { lights: 1 },
    front: "slab",
    handle: "none",
    finish: "steel",
    variant: "chimney",
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d, h } = spec.dims;
    const variant = variantOf(spec);
    const mat = finishMaterial(spec.finish);
    const g = new THREE.Group();

    if (variant === "visor") {
      // Slim under-cabinet unit: a shallow body at the back and a pull-out
      // visor lip standing proud at the front, which is the whole silhouette
      // of this type of hood.
      const bodyD = d * 0.66;
      const body = applianceBody(w, bodyD, h, mat);
      body.position.z = -d / 2 + bodyD / 2;
      g.add(body);

      const visorH = Math.min(0.05, h * 0.45);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(w - 0.01, visorH, d - bodyD), mat);
      visor.position.set(0, visorH / 2 + 0.006, -d / 2 + bodyD + (d - bodyD) / 2);
      g.add(visor);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 0.012, 0.02), sealMat());
      lip.position.set(0, visorH + 0.012, d / 2 - 0.012);
      g.add(lip);

      g.add(underside(w - 0.04, bodyD, spec, mat));
      tagTintOfMaterial(g, spec.finish, spec.color, mat);
      return g;
    }

    const island = variant === "island";
    const canopyH = Math.min(island ? 0.17 : 0.14, h * 0.4);
    const canopy = applianceBody(w, d, canopyH, mat);
    g.add(canopy);
    g.add(underside(w - 0.03, d - 0.03, spec, mat));

    // A dark glass band around the canopy edge: the line that keeps a hood
    // from reading as a plain slab, and where a real one carries its controls.
    const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.006, 0.022, d + 0.006), glassMat());
    band.position.y = canopyH - 0.02;
    g.add(band);

    // Wall hoods put the flue against the wall; an island hood is seen from
    // every side, so its flue is centred.
    const fz = island ? 0 : -d / 2 + FLUE_D / 2 + 0.01;
    const stack = flue(canopyH, h, fz, mat);
    if (stack) g.add(stack);

    tagTintOfMaterial(g, spec.finish, spec.color, mat);
    return g;
  },
};
