import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { finishMaterial } from "./materials";

// Kitchen v2: a counter item. Local origin sits ON the host run's counter
// surface (elevation = host dims.h via the attachment sync); the rim laps the
// countertop and the basin hangs through the REAL hole the host cuts for it
// (spec.cutouts on the run — see kitchenAttach.ts / countertopWithCutouts).

const RIM_T = 0.012; // rim slab above the counter
const RIM_LIP = 0.015; // rim overlap past the cutout edge, each side
const INSET = 0.045; // rim edge -> basin wall
const BASIN_D = 0.21; // real bowl depth below the counter (standard is 18-22cm)
const WALL_T = 0.008;
const DIVIDER_T = 0.008;
const FAUCET_BASE_R = 0.02;
const FAUCET_BASE_H = 0.025;
const RISER_R = 0.011;
const RISER_H = 0.28;
const SPOUT_R = 0.12;
const SPOUT_TUBE = 0.009;

let darkMatCache: THREE.MeshStandardMaterial | null = null;
function drainMat(): THREE.MeshStandardMaterial {
  if (!darkMatCache) darkMatCache = new THREE.MeshStandardMaterial({ color: "#3c3f42", metalness: 0.7, roughness: 0.45 });
  return darkMatCache;
}

/** Open-top bowl (bottom + 4 walls) from y=0 (counter level) down to
 *  y=-depth, with a drain puck on the floor. */
function basin(w: number, d: number, depth: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_T, d), mat);
  bottom.position.set(0, -depth + WALL_T / 2, 0);
  g.add(bottom);
  for (const sx of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(WALL_T, depth, d), mat);
    wall.position.set((sx * (w - WALL_T)) / 2, -depth / 2, 0);
    g.add(wall);
  }
  for (const sz of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, depth, WALL_T), mat);
    wall.position.set(0, -depth / 2, (sz * (d - WALL_T)) / 2);
    g.add(wall);
  }
  const drain = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.004, 16), drainMat());
  drain.position.set(0, -depth + WALL_T + 0.002, 0);
  g.add(drain);
  return g;
}

export const sinkGenerator: GeneratorDef = {
  id: "sink",
  label: "Sink",
  category: "Kitchen",
  rooms: ["kitchen"],
  wallSnap: false,
  noCollide: true,
  counterItem: true,
  // The hole the host countertop cuts: rim minus its lip on every side.
  cutoutSize: (spec: ParametricSpec) => ({
    w: Math.max(spec.dims.w - 2 * RIM_LIP, 0.1),
    d: Math.max(spec.dims.d - 2 * RIM_LIP, 0.1),
  }),
  defaultElevation: 0.84, // fallback only — attached items derive from their host
  dimLimits: { w: [0.45, 1.2], d: [0.44, 0.52], h: [0.02, 0.02] },
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

    // Bowl openings (also the rim's holes). The rim is a FRAME around open
    // bowls — a solid slab here is what made the sink read as a flat plate
    // with a tap: it capped its own basins.
    const bw = Math.max(w - 2 * INSET, 0.12);
    const bd = Math.max(d - 2 * INSET, 0.12);
    const openings: { cx: number; w: number }[] = [];
    if (bowls === 1) {
      openings.push({ cx: 0, w: bw });
    } else {
      const each = Math.max((bw - DIVIDER_T) / 2, 0.08);
      for (const sx of [-1, 1]) openings.push({ cx: (sx * (each + DIVIDER_T)) / 2, w: each });
    }

    // Rim: extruded frame with a real hole per bowl (slightly smaller than
    // the bowl interior, so the rim lips over the basin walls).
    const rimShape = new THREE.Shape();
    rimShape.moveTo(-w / 2, -d / 2);
    rimShape.lineTo(w / 2, -d / 2);
    rimShape.lineTo(w / 2, d / 2);
    rimShape.lineTo(-w / 2, d / 2);
    rimShape.closePath();
    for (const o of openings) {
      const hw = Math.max(o.w / 2 - 0.012, 0.03);
      const hd = Math.max(bd / 2 - 0.012, 0.03);
      const hole = new THREE.Path();
      hole.moveTo(o.cx - hw, -hd);
      hole.lineTo(o.cx + hw, -hd);
      hole.lineTo(o.cx + hw, hd);
      hole.lineTo(o.cx - hw, hd);
      hole.closePath();
      rimShape.holes.push(hole);
    }
    const rim = new THREE.Mesh(
      new THREE.ExtrudeGeometry(rimShape, { depth: RIM_T, bevelEnabled: false }),
      mat,
    );
    rim.rotation.x = -Math.PI / 2; // shape y → -z; rects are symmetric, so exact
    group.add(rim);

    // Open bowls with REAL depth below the counter, visible through the rim.
    if (bowls === 1) {
      group.add(basin(bw, bd, BASIN_D, mat));
    } else {
      for (const o of openings) {
        const b = basin(o.w, bd, BASIN_D, mat);
        b.position.set(o.cx, 0, 0);
        group.add(b);
      }
      const divider = new THREE.Mesh(new THREE.BoxGeometry(DIVIDER_T, BASIN_D, bd), mat);
      divider.position.set(0, -BASIN_D / 2, 0);
      group.add(divider);
    }

    // Faucet on the rim's back band (back = -Z), gooseneck + lever.
    const faucetZ = -d / 2 + 0.045;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(FAUCET_BASE_R, FAUCET_BASE_R * 1.15, FAUCET_BASE_H, 16), mat);
    base.position.set(0, RIM_T + FAUCET_BASE_H / 2, faucetZ);
    group.add(base);

    const riser = new THREE.Mesh(new THREE.CylinderGeometry(RISER_R, RISER_R, RISER_H, 12), mat);
    const riserBaseY = RIM_T + FAUCET_BASE_H;
    riser.position.set(0, riserBaseY + RISER_H / 2, faucetZ);
    group.add(riser);

    // Gooseneck: quarter torus sweeping from the riser top to a forward spout.
    const spout = new THREE.Mesh(new THREE.TorusGeometry(SPOUT_R, SPOUT_TUBE, 8, 16, Math.PI / 2), mat);
    spout.rotation.y = -Math.PI / 2;
    spout.position.set(0, riserBaseY + RISER_H - SPOUT_R, faucetZ);
    group.add(spout);

    // Down-tip at the spout end so water would point at the bowl.
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(SPOUT_TUBE, SPOUT_TUBE * 0.9, 0.035, 10), mat);
    tip.position.set(0, riserBaseY + RISER_H - SPOUT_R - 0.017, faucetZ + SPOUT_R);
    group.add(tip);

    // Single lever handle, angled back-right.
    const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.09, 10), mat);
    lever.rotation.z = -Math.PI / 3.2;
    lever.position.set(0.045, riserBaseY + 0.02, faucetZ);
    group.add(lever);

    return group;
  },
};
