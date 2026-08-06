import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { carcass, frontOf, barHandle, knobHandle, handleMat, FRONT_T, REVEAL } from "./parts";
import { finishMaterial, tagTint } from "./materials";

const HANDLE_INSET = 0.04;

function handleFor(spec: ParametricSpec): THREE.Object3D | null {
  if (spec.handle === "none") return null;
  const mat = handleMat();
  return spec.handle === "knob" ? knobHandle(mat) : barHandle(mat);
}

export const kitchenWallGenerator: GeneratorDef = {
  id: "kitchenWall",
  label: "Kitchen wall cabinets",
  category: "Kitchen",
  rooms: ["kitchen"],
  wallSnap: true,
  // A fresh placement starts 600mm above a standard 840mm counter, mounted
  // flush to the wall like any other wall-mount item (FurnitureItem.elevation,
  // read once from here at place time — see spec.ts / store.placeFurniture).
  defaultElevation: 1.45,
  dimLimits: { w: [0.3, 4.0], d: [0.28, 0.4], h: [0.35, 0.9] },
  modules: [],
  fronts: ["slab", "shaker", "farmhouse"],
  handles: ["bar", "knob", "none"],
  finishes: ["painted", "laminate-matte", "laminate-gloss", "oak", "walnut", "wood-walnut-dark", "wood-plank-pale"],
  defaultSpec: {
    generator: "kitchenWall",
    dims: { w: 2.4, d: 0.32, h: 0.7 },
    modules: {},
    front: "slab",
    handle: "bar",
    finish: "painted",
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d, h } = spec.dims;
    const mat = finishMaterial(spec.finish);

    const group = new THREE.Group();

    const unitCount = Math.max(1, Math.round(w / 0.6));
    const unitW = w / unitCount;
    const frontBandH = Math.max(h - 2 * REVEAL, 0.1);
    const frontBandBottom = REVEAL;
    const frontZ = d / 2 + FRONT_T / 2;

    for (let i = 0; i < unitCount; i++) {
      const x = -w / 2 + unitW * (i + 0.5);
      const cab = carcass(unitW, d, h, mat);
      tagTint(cab, spec.finish, spec.color);
      cab.position.set(x, 0, 0);
      group.add(cab);

      // Single door, hinge alternating, handle 60mm above the bottom edge.
      const frontBandW = Math.max(unitW - 2 * REVEAL, 0.1);
      const y = frontBandBottom + frontBandH / 2;
      const front = frontOf(spec.front, frontBandW, frontBandH, mat);
      tagTint(front, spec.finish, spec.color);
      front.position.set(x, y, frontZ);
      group.add(front);

      const handle = handleFor(spec);
      if (handle) {
        const hingeLeft = i % 2 === 0;
        const hx = hingeLeft ? x + frontBandW / 2 - HANDLE_INSET : x - frontBandW / 2 + HANDLE_INSET;
        const hy = frontBandBottom + 0.06;
        handle.position.set(hx, hy, frontZ);
        group.add(handle);
      }
    }

    return group;
  },
};
