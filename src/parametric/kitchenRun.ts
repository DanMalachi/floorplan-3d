import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { carcass, frontOf, plinth, countertop, barHandle, knobHandle, handleMat, PLINTH_H, COUNTER_T, COUNTER_OVER, FRONT_T, GAP, REVEAL } from "./parts";
import { finishMaterial, tagTint } from "./materials";

const CARCASS_H = 0.72; // base-unit carcass height; counter surface sits at PLINTH_H + CARCASS_H + COUNTER_T = 0.84
const WALL_CAB_D = 0.32;
const WALL_CAB_H = 0.7;
const HANDLE_INSET = 0.04;

function handleFor(spec: ParametricSpec): THREE.Object3D | null {
  if (spec.handle === "none") return null;
  const mat = handleMat();
  return spec.handle === "knob" ? knobHandle(mat) : barHandle(mat);
}

export const kitchenRunGenerator: GeneratorDef = {
  id: "kitchenRun",
  label: "Custom kitchen run",
  category: "Kitchen",
  rooms: ["kitchen"],
  wallSnap: true,
  dimLimits: { w: [0.6, 6.0], d: [0.55, 0.7], h: [1.4, 2.6] },
  modules: [
    { key: "drawerUnits", label: "Drawer units", min: 0, max: 4, default: 1 },
    { key: "wallCabinets", label: "Wall cabinets", min: 0, max: 6, default: 2 },
  ],
  fronts: ["slab", "shaker", "farmhouse"],
  handles: ["bar", "knob", "none"],
  finishes: ["painted", "laminate-matte", "laminate-gloss", "oak", "walnut", "wood-walnut-dark", "wood-plank-pale"],
  finishes2: ["counter-oak", "counter-white", "counter-dark"],
  defaultSpec: {
    generator: "kitchenRun",
    dims: { w: 2.4, d: 0.6, h: 2.2 },
    modules: { drawerUnits: 1, wallCabinets: 2 },
    front: "slab",
    handle: "bar",
    finish: "painted",
    finish2: "counter-oak",
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d, h } = spec.dims;
    const drawerUnits = Math.max(0, Math.round(spec.modules.drawerUnits ?? 1));
    const wallCabinets = Math.max(0, Math.round(spec.modules.wallCabinets ?? 2));
    const mat = finishMaterial(spec.finish);
    const counterMat = finishMaterial(spec.finish2 ?? "counter-oak");

    const group = new THREE.Group();

    const unitCount = Math.max(1, Math.round(w / 0.6));
    const unitW = w / unitCount;
    const drawerUnitsEff = Math.min(drawerUnits, unitCount);
    const frontBandH = CARCASS_H - 2 * REVEAL;
    const frontBandBottom = PLINTH_H + REVEAL;
    const frontZ = d / 2 + FRONT_T / 2;

    for (let i = 0; i < unitCount; i++) {
      const x = -w / 2 + unitW * (i + 0.5);
      const unit = carcass(unitW, d, CARCASS_H, mat);
      tagTint(unit, spec.finish, spec.color);
      unit.position.set(x, PLINTH_H, 0);
      group.add(unit);

      const frontBandW = Math.max(unitW - 2 * REVEAL, 0.1);

      if (i < drawerUnitsEff) {
        // 3-drawer stack, equal thirds of the front band.
        const thirdH = frontBandH / 3;
        for (let j = 0; j < 3; j++) {
          const y = frontBandBottom + j * thirdH + thirdH / 2;
          const front = frontOf(spec.front, frontBandW, thirdH - GAP, mat);
          tagTint(front, spec.finish, spec.color);
          front.position.set(x, y, frontZ);
          group.add(front);
          const handle = handleFor(spec);
          if (handle) {
            handle.rotation.z = Math.PI / 2; // horizontal, drawer convention
            handle.position.set(x, y, frontZ);
            group.add(handle);
          }
        }
      } else {
        // Single door, hinge alternating, handle 60mm below the top edge.
        const y = frontBandBottom + frontBandH / 2;
        const front = frontOf(spec.front, frontBandW, frontBandH, mat);
        tagTint(front, spec.finish, spec.color);
        front.position.set(x, y, frontZ);
        group.add(front);
        const handle = handleFor(spec);
        if (handle) {
          const hingeLeft = i % 2 === 0;
          const hx = hingeLeft ? x + frontBandW / 2 - HANDLE_INSET : x - frontBandW / 2 + HANDLE_INSET;
          const hy = frontBandBottom + frontBandH - 0.06;
          handle.position.set(hx, hy, frontZ);
          group.add(handle);
        }
      }
    }

    // Plinth + countertop span the full run, backs flush with the carcasses'.
    const plinthMesh = plinth(w, d, mat);
    tagTint(plinthMesh, spec.finish, spec.color);
    plinthMesh.position.set(0, PLINTH_H / 2, -0.015);
    group.add(plinthMesh);

    const counter = countertop(w, d, counterMat);
    tagTint(counter, spec.finish2 ?? "counter-oak", spec.color2);
    counter.position.set(0, PLINTH_H + CARCASS_H + COUNTER_T / 2, COUNTER_OVER / 2);
    group.add(counter);

    // Wall cabinets: left-aligned on the same unit grid, flush to the back
    // plane, top pinned to dims.h (ignored entirely when wallCabinets is 0).
    const wallCabEff = Math.min(wallCabinets, unitCount);
    const wallCabZ = -d / 2 + WALL_CAB_D / 2;
    const wallFrontZ = wallCabZ + WALL_CAB_D / 2 + FRONT_T / 2;
    for (let i = 0; i < wallCabEff; i++) {
      const x = -w / 2 + unitW * (i + 0.5);
      const cab = carcass(unitW, WALL_CAB_D, WALL_CAB_H, mat);
      tagTint(cab, spec.finish, spec.color);
      cab.position.set(x, h - WALL_CAB_H, wallCabZ);
      group.add(cab);

      const frontBandW = Math.max(unitW - 2 * REVEAL, 0.1);
      const cabFrontH = WALL_CAB_H - 2 * REVEAL;
      const y = h - WALL_CAB_H + WALL_CAB_H / 2;
      const front = frontOf(spec.front, frontBandW, cabFrontH, mat);
      tagTint(front, spec.finish, spec.color);
      front.position.set(x, y, wallFrontZ);
      group.add(front);

      const handle = handleFor(spec);
      if (handle) {
        const hingeLeft = i % 2 === 0;
        const hx = hingeLeft ? x + frontBandW / 2 - HANDLE_INSET : x - frontBandW / 2 + HANDLE_INSET;
        const hy = h - WALL_CAB_H + 0.06;
        handle.position.set(hx, hy, wallFrontZ);
        group.add(handle);
      }
    }

    return group;
  },
};
