import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { finishMaterial } from "./materials";

const RIM_T = 0.02;
const INSET = 0.04;
const BASIN_D = 0.18;
const WALL_T = 0.008;
const DIVIDER_T = 0.008;
const FAUCET_BASE_R = 0.02;
const FAUCET_BASE_H = 0.025;
const RISER_R = 0.011;
const RISER_H = 0.25;
const SPOUT_R = 0.12;
const SPOUT_TUBE = 0.009;

/** Open-top box (bottom + 4 walls, no lid — visible from above) spanning
 *  local y=0 (counter level) down to y=-depth. */
function basin(w: number, d: number, depth: number, wallT: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(w, wallT, d), mat);
  bottom.position.set(0, -depth + wallT / 2, 0);
  g.add(bottom);
  for (const sx of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(wallT, depth, d), mat);
    wall.position.set((sx * (w - wallT)) / 2, -depth / 2, 0);
    g.add(wall);
  }
  for (const sz of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, depth, wallT), mat);
    wall.position.set(0, -depth / 2, (sz * (d - wallT)) / 2);
    g.add(wall);
  }
  return g;
}

export const sinkGenerator: GeneratorDef = {
  id: "sink",
  label: "Sink",
  category: "Kitchen",
  rooms: ["kitchen"],
  wallSnap: false,
  // v1: sinks/cooktops must overlap the base run's OBB to visually sit on
  // it — noCollide means they never flag red against it (or each other; two
  // sinks CAN overlap in v1, accepted for now per the doc).
  noCollide: true,
  defaultElevation: 0.84, // standard counter surface height
  dimLimits: { w: [0.45, 0.9], d: [0.44, 0.52], h: [0.02, 0.02] },
  modules: [{ key: "bowls", label: "Bowls", min: 1, max: 2, default: 1 }],
  fronts: ["slab"],
  handles: ["none"],
  finishes: ["steel"],
  defaultSpec: {
    generator: "sink",
    dims: { w: 0.56, d: 0.48, h: 0.02 },
    modules: { bowls: 1 },
    front: "slab",
    handle: "none",
    finish: "steel",
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d } = spec.dims;
    const bowls = Math.min(2, Math.max(1, Math.round(spec.modules.bowls ?? 1)));
    const mat = finishMaterial(spec.finish);

    const group = new THREE.Group();

    const rim = new THREE.Mesh(new THREE.BoxGeometry(w, RIM_T, d), mat);
    rim.position.set(0, RIM_T / 2, 0);
    group.add(rim);

    const bw = Math.max(w - 2 * INSET, 0.1);
    const bd = Math.max(d - 2 * INSET, 0.1);
    if (bowls === 1) {
      group.add(basin(bw, bd, BASIN_D, WALL_T, mat));
    } else {
      const each = Math.max((bw - DIVIDER_T) / 2, 0.05);
      for (const sx of [-1, 1]) {
        const b = basin(each, bd, BASIN_D, WALL_T, mat);
        b.position.set((sx * (each + DIVIDER_T)) / 2, 0, 0);
        group.add(b);
      }
      const divider = new THREE.Mesh(new THREE.BoxGeometry(DIVIDER_T, BASIN_D, bd), mat);
      divider.position.set(0, -BASIN_D / 2, 0);
      group.add(divider);
    }

    // Faucet, back-center (back = -Z per convention).
    const faucetZ = -d / 2 + 0.05;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(FAUCET_BASE_R, FAUCET_BASE_R, FAUCET_BASE_H, 16), mat);
    base.position.set(0, FAUCET_BASE_H / 2, faucetZ);
    group.add(base);

    const riser = new THREE.Mesh(new THREE.CylinderGeometry(RISER_R, RISER_R, RISER_H, 12), mat);
    const riserTopY = FAUCET_BASE_H + RISER_H;
    riser.position.set(0, FAUCET_BASE_H + RISER_H / 2, faucetZ);
    group.add(riser);

    // Quarter-torus ring lies in the XY plane by default (θ=0 at local +X);
    // rotating -90° about Y swings it into the Y-Z plane so it sweeps from
    // "up" (θ=π/2, attached at the riser top) to "forward" (θ=0, SPOUT_R
    // out and SPOUT_R down from the riser top) — the classic gooseneck arc.
    const spout = new THREE.Mesh(new THREE.TorusGeometry(SPOUT_R, SPOUT_TUBE, 8, 16, Math.PI / 2), mat);
    spout.rotation.y = -Math.PI / 2;
    spout.position.set(0, riserTopY - SPOUT_R, faucetZ);
    group.add(spout);

    return group;
  },
};
