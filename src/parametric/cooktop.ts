import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { finishMaterial } from "./materials";

const GLASS_T = 0.008;
const BURNER_R = 0.08; // 160mm diameter
const BURNER_H = 0.0015;
const BURNER_INSET = 0.06;
const DOT_R = 0.004;

let burnerMatCache: THREE.MeshStandardMaterial | null = null;
function burnerMat(): THREE.MeshStandardMaterial {
  if (!burnerMatCache) burnerMatCache = new THREE.MeshStandardMaterial({ color: "#33363a", metalness: 0.4, roughness: 0.5 });
  return burnerMatCache;
}

let touchMatCache: THREE.MeshStandardMaterial | null = null;
function touchMat(): THREE.MeshStandardMaterial {
  if (!touchMatCache) touchMatCache = new THREE.MeshStandardMaterial({ color: "#5a5e63", metalness: 0.3, roughness: 0.4 });
  return touchMatCache;
}

export const cooktopGenerator: GeneratorDef = {
  id: "cooktop",
  label: "Cooktop",
  category: "Kitchen",
  rooms: ["kitchen"],
  wallSnap: false,
  noCollide: true,
  defaultElevation: 0.84,
  dimLimits: { w: [0.3, 0.9], d: [0.45, 0.55], h: [0.008, 0.008] },
  modules: [{ key: "burners", label: "Burners", min: 1, max: 5, default: 4 }],
  fronts: ["slab"],
  handles: ["none"],
  finishes: ["glass-black"],
  defaultSpec: {
    generator: "cooktop",
    dims: { w: 0.6, d: 0.5, h: 0.008 },
    modules: { burners: 4 },
    front: "slab",
    handle: "none",
    finish: "glass-black",
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d } = spec.dims;
    const burners = Math.min(5, Math.max(1, Math.round(spec.modules.burners ?? 4)));
    const mat = finishMaterial(spec.finish);

    const group = new THREE.Group();

    const glass = new THREE.Mesh(new THREE.BoxGeometry(w, GLASS_T, d), mat);
    glass.position.set(0, GLASS_T / 2, 0);
    group.add(glass);

    const hw = w / 2 - BURNER_INSET;
    const hd = d / 2 - BURNER_INSET;
    // 4 corners first (2x2), 5th slot is centered — "arranged 2x2 (5th centered)".
    const slots: { x: number; z: number }[] = [
      { x: -hw, z: hd },
      { x: hw, z: hd },
      { x: -hw, z: -hd },
      { x: hw, z: -hd },
      { x: 0, z: 0 },
    ];
    const burnerY = GLASS_T + BURNER_H / 2;
    for (let i = 0; i < burners; i++) {
      const slot = slots[i];
      const burner = new THREE.Mesh(new THREE.CylinderGeometry(BURNER_R, BURNER_R, BURNER_H, 24), burnerMat());
      burner.position.set(slot.x, burnerY, slot.z);
      group.add(burner);
    }

    // 3 touch-dot discs, front-right.
    const dotY = GLASS_T + 0.0005;
    for (let i = 0; i < 3; i++) {
      const dot = new THREE.Mesh(new THREE.CylinderGeometry(DOT_R, DOT_R, 0.001, 12), touchMat());
      dot.position.set(w / 2 - 0.08 - i * 0.05, dotY, d / 2 - 0.05);
      group.add(dot);
    }

    return group;
  },
};
