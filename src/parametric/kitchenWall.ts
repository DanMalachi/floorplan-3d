import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { cabinetRow, barHandle, knobHandle, handleMat } from "./parts";
import { finishMaterial, tagTint } from "./materials";
import { pathLegs } from "./runPath";

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
  // A wall cabinet hangs on a wall, so say so. Without this the drag path's
  // `isWallItem` gate read false and a selected wall cabinet followed the
  // FLOOR point under the cursor — metres away from a box at 1.45m, so it
  // slid at a different speed than the pointer. `isSurfaceHost` already
  // excluded kitchenWall by name, so nothing else changes.
  wallMounted: () => true,
  // A fresh placement starts 600mm above a standard 840mm counter, mounted
  // flush to the wall like any other wall-mount item (FurnitureItem.elevation,
  // read once from here at place time — see spec.ts / store.placeFurniture).
  defaultElevation: 1.45,
  dimLimits: { w: [0.3, 4.0], d: [0.28, 0.4], h: [0.35, 0.9] },
  modules: [],
  fronts: ["slab", "shaker", "farmhouse"],
  handles: ["bar", "knob", "none"],
  finishes: ["painted", "laminate-matte", "laminate-gloss", "oak", "walnut", "wood-walnut-dark", "wood-plank-pale"],
  hotspotKeywords: ["cabinet"],
  defaultSpec: {
    generator: "kitchenWall",
    dims: { w: 2.4, d: 0.32, h: 0.7 },
    modules: {},
    front: "slab",
    handle: "bar",
    finish: "painted",
  },
  build(spec: ParametricSpec): THREE.Group {
    const { d, h } = spec.dims;
    const mat = finishMaterial(spec.finish);
    const group = new THREE.Group();
    const legs = pathLegs(spec);

    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      const lead = i > 0 ? d : 0;
      const trail = i < legs.length - 1 ? d : 0;
      const spanLen = leg.len - lead - trail;
      if (spanLen > 0.05) {
        const row = cabinetRow({
          len: spanLen, d, carcassH: h, yBase: 0, mat,
          front: spec.front,
          handle: () => handleFor(spec),
          handleAt: "bottom", // handle 60mm above the bottom edge, wall-cab convention
        });
        tagTint(row, spec.finish, spec.color);
        row.position.set(leg.sx + leg.dx * lead, 0, leg.sz + leg.dz * lead);
        row.rotation.y = Math.atan2(-leg.dz, leg.dx);
        group.add(row);
      }
      if (i > 0) {
        // Blank corner box filling the d×d square.
        const ccx = leg.sx + leg.dx * (d / 2) + leg.fx * (d / 2);
        const ccz = leg.sz + leg.dz * (d / 2) + leg.fz * (d / 2);
        const blank = new THREE.Mesh(new THREE.BoxGeometry(d, h, d), mat);
        blank.position.set(ccx, h / 2, ccz);
        tagTint(blank, spec.finish, spec.color);
        group.add(blank);
      }
    }

    return group;
  },
};
