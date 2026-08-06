import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { carcass, frontOf, barHandle, knobHandle, handleMat, FRONT_T, GAP, REVEAL } from "./parts";
import { finishMaterial, tagTint } from "./materials";

const BASE_GAP = 0.02; // clearance above the floor before the drawer/door band starts
const DRAWER_H = 0.25; // per-drawer band height
const HANDLE_INSET = 0.04; // handle distance from the edge opposite its hinge

function handleFor(spec: ParametricSpec): THREE.Object3D | null {
  if (spec.handle === "none") return null;
  const mat = handleMat();
  return spec.handle === "knob" ? knobHandle(mat) : barHandle(mat);
}

export const wardrobeGenerator: GeneratorDef = {
  id: "wardrobe",
  label: "Custom wardrobe",
  category: "Storage",
  rooms: ["bedroom", "closet", "kids"],
  wallSnap: true,
  dimLimits: { w: [0.5, 4.0], d: [0.35, 0.8], h: [1.2, 2.6] },
  modules: [
    { key: "doors", label: "Doors", min: 1, max: 8, default: 2 },
    { key: "drawers", label: "Drawers", min: 0, max: 3, default: 0 },
  ],
  fronts: ["slab", "shaker", "farmhouse"],
  handles: ["bar", "knob", "none"],
  finishes: ["painted", "laminate-matte", "laminate-gloss", "oak", "walnut", "wood-walnut-dark", "wood-plank-pale"],
  defaultSpec: {
    generator: "wardrobe",
    dims: { w: 1.5, d: 0.6, h: 2.2 },
    modules: { doors: 2, drawers: 0 },
    front: "slab",
    handle: "bar",
    finish: "painted",
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d, h } = spec.dims;
    const doors = Math.max(1, Math.round(spec.modules.doors ?? 2));
    const drawers = Math.max(0, Math.round(spec.modules.drawers ?? 0));
    const mat = finishMaterial(spec.finish);

    const group = new THREE.Group();
    const body = carcass(w, d, h, mat);
    tagTint(body, spec.finish, spec.color);
    group.add(body);

    const frontBandW = Math.max(w - 2 * REVEAL, 0.1);
    const drawerBandH = drawers * DRAWER_H;
    const doorBandBottom = BASE_GAP + drawerBandH;
    const doorBandH = Math.max(h - doorBandBottom - REVEAL, 0.1);
    const frontZ = d / 2 + FRONT_T / 2; // fronts overlay the carcass, proud by FRONT_T

    // Drawer band: full-width fronts stacked from the base gap up.
    for (let i = 0; i < drawers; i++) {
      const y = BASE_GAP + i * DRAWER_H + DRAWER_H / 2;
      const front = frontOf(spec.front, frontBandW, DRAWER_H - GAP, mat);
      tagTint(front, spec.finish, spec.color);
      front.position.set(0, y, frontZ);
      group.add(front);

      const handle = handleFor(spec);
      if (handle) {
        handle.rotation.z = Math.PI / 2; // horizontal, drawer convention
        handle.position.set(0, y, frontZ);
        group.add(handle);
      }
    }

    // Door band: clamp the effective count so no door goes narrower than 30cm.
    let doorCount = doors;
    while (doorCount > 1 && frontBandW / doorCount < 0.3) doorCount--;
    const slotW = frontBandW / doorCount;
    const doorW = slotW - GAP;
    const doorY = doorBandBottom + doorBandH / 2;
    for (let i = 0; i < doorCount; i++) {
      const x = -frontBandW / 2 + slotW * (i + 0.5);
      const front = frontOf(spec.front, doorW, doorBandH, mat);
      tagTint(front, spec.finish, spec.color);
      front.position.set(x, doorY, frontZ);
      group.add(front);

      const handle = handleFor(spec);
      if (handle) {
        // Leftmost door hinges left, then alternates, so handle pairs meet
        // at the gap between adjacent doors.
        const hingeLeft = i % 2 === 0;
        const hx = hingeLeft ? x + doorW / 2 - HANDLE_INSET : x - doorW / 2 + HANDLE_INSET;
        handle.position.set(hx, doorY, frontZ);
        group.add(handle);
      }
    }

    return group;
  },
};
