import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "../types";
import { Part, finish, piping, place, puff, rng, roundedBox } from "./geom";
import { factoryMaterial } from "./materials";

// Block-arm 3-seat sofa — live port of the approved factory build
// assets/furniture/seating/block-arm-sofa/r001/build_sofa.py (shipped as
// factory:block-arm-sofa). Blender axes throughout, line for line with the
// script; geom.ts `finish()` converts. Width/depth/height mean what the
// script's --width/--depth/--height mean; every other number is the script's.
//
// Parity with the script is gated by src/parametric/factory/factory.test.ts
// against fixtures exported from it at min/default/max.

export const BLOCK_ARM_DEFAULT_COLOR = "#8a8f96";

const LEG_H = 0.17;
const FZ = 0.31; // top of the fabric base frame
const SEAT_T = 0.17; // seat cushion thickness
const SEAT_TOP = FZ + SEAT_T - 0.015; // cushion compressed slightly into the frame
const AT = 0.17; // arm thickness
const PAD_T = 0.07; // arm pad on top of the arm
const BACK_T = 0.14; // back frame thickness (rear)
const TILT = THREE.MathUtils.degToRad(9);
const FAB_TILE = 0.271; // rough_linen real-world tile (m)
const OAK_TILE = 1.83;

/** Tapered, splayed oak leg (`leg()` in the script). Its 2mm bevel is left
 *  out — invisible at room scale — so it is shaded flat instead of smooth. */
function leg(name: string, x: number, y: number, mat: THREE.Material, sx: number, sy: number): Part {
  const top = 0.056, bot = 0.034, splay = 0.028;
  const p = new Part(name, mat);
  p.smooth = false;
  const v: number[][] = [];
  for (const z of [-0.5, 0.5]) {
    for (const [cx, cy] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
      const t = z > 0 ? 1 : 0;
      const s = bot + (top - bot) * t;
      v.push([cx * s + sx * splay * (1 - t) + x, cy * s + sy * splay * (1 - t) + y, (z + 0.5) * (LEG_H + 0.012)]);
    }
  }
  const id = v.map(([a, b, c]) => p.addVert(a, b, c));
  const [b0, b1, b2, b3, t0, t1, t2, t3] = id;
  p.quad(b3, b2, b1, b0); // bottom
  p.quad(t0, t1, t2, t3); // top
  p.quad(b0, b1, t1, t0);
  p.quad(b1, b2, t2, t1);
  p.quad(b2, b3, t3, t2);
  p.quad(b3, b0, t0, t3);
  p.fabricUV(OAK_TILE);
  return p;
}

export function buildBlockArmSofa(W: number, D: number, H: number, color: string): THREE.Group {
  const random = rng(11);
  const AH = Math.min(0.62, H * 0.74); // arm top height
  const INNER_W = W - 2 * AT;
  const fab = factoryMaterial("rough-linen");
  const oak = factoryMaterial("oak-veneer-01");
  const parts: Part[] = [];
  const yFront = -D / 2, yBack = D / 2;

  // legs (oak, tapered, splayed outward)
  const lx = W / 2 - 0.1, ly = D / 2 - 0.1;
  ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).forEach(([sx, sy], i) =>
    parts.push(leg(`leg${i}`, sx * lx, sy * ly, oak, sx, sy)));

  // base frame between the arms
  const base = roundedBox("base", INNER_W + 0.04, D - 0.03, FZ - LEG_H, 0, 0.018, 2, fab, FAB_TILE);
  place(base, 0, 0, LEG_H);
  parts.push(base);

  // arms (fabric body + slightly wider pad on top for the seam shadow)
  for (const [s, nm] of [[-1, "armL"], [1, "armR"]] as const) {
    const arm = roundedBox(nm, AT - 0.008, D - 0.012, AH - PAD_T - LEG_H, 0, 0.03, 3, fab, FAB_TILE);
    place(arm, s * (W / 2 - AT / 2), 0, LEG_H);
    const pad = roundedBox(nm + "_pad", AT, D, PAD_T, 0, 0.032, 3, fab, FAB_TILE);
    puff(pad, 0.006, 0.004, 0.0015, 0, random);
    place(pad, s * (W / 2 - AT / 2), 0, AH - PAD_T);
    parts.push(arm, pad);
  }

  // back frame (rear), behind the back cushions
  const back = roundedBox("backframe", INNER_W + 0.04, BACK_T, AH - 0.05 - LEG_H, 0, 0.03, 3, fab, FAB_TILE);
  place(back, 0, yBack - BACK_T / 2, LEG_H);
  parts.push(back);

  // seat cushions: two, crowned; front proud of the base by 1 cm
  const seatD = D - BACK_T - 0.01;
  const cw = (INNER_W - 0.006) / 2;
  ([-1, 1] as const).forEach((s, i) => {
    const c = roundedBox(`seat${i}`, cw - 0.004, seatD, SEAT_T, 0, 0.04, 4, fab, FAB_TILE);
    puff(c, 0.028, 0.016, 0.0025, 0, random);
    const bz0 = c.minZ();
    const ps = [0.02, SEAT_T - 0.024].map((z, k) =>
      piping(`seatpipe${i}${k}`, (cw - 0.004) / 2 - 0.003, seatD / 2 - 0.003, bz0 + z, 0.04, 0.0055, fab, FAB_TILE));
    for (const o of [c, ...ps]) place(o, s * (cw / 2 + 0.001), yFront + seatD / 2 + 0.005, FZ - 0.015, 0, bz0);
    parts.push(c, ...ps);
  });

  // back cushions: two, leaned back ~9 deg, top reaches H
  const bcZ0 = SEAT_TOP - 0.03;
  const bcH = (H - bcZ0) / Math.cos(TILT) - 0.005;
  ([-1, 1] as const).forEach((s, i) => {
    const c = roundedBox(`backc${i}`, cw - 0.004, 0.19, bcH, 0, 0.05, 4, fab, FAB_TILE);
    puff(c, 0.0, 0.03, 0.003, 0.03, random);
    const bz0 = c.minZ();
    const ps = [0.02, bcH - 0.022].map((z, k) =>
      piping(`backpipe${i}${k}`, (cw - 0.004) / 2 - 0.004, 0.19 / 2 - 0.004, bz0 + z, 0.05, 0.0055, fab, FAB_TILE));
    for (const o of [c, ...ps]) place(o, s * (cw / 2 + 0.001), yBack - BACK_T - 0.055, bcZ0, -TILT, bz0);
    parts.push(c, ...ps);
  });

  const group = finish(parts);
  // Upholstery is a grey weave that MUST be multiplied by a colour — tag every
  // fabric mesh, default colour included, or the approved grey reads as 0.72
  // neutral. ParametricModel applies it on its per-instance material clone.
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material === fab) o.userData.tintColor = color;
  });
  return group;
}

export const sofaBlockArmGenerator: GeneratorDef = {
  id: "sofaBlockArm",
  labelKey: "sofaBlockArm.label",
  category: "Seating",
  rooms: ["living"],
  wallSnap: true,
  // Dan, 2026-09-23: "wide" range, height capped at 0.90 (above it the arm
  // clamp min(0.62, H·0.74) leaves the arms low against a tall back).
  dimLimits: { w: [1.5, 2.8], d: [0.8, 1.1], h: [0.74, 0.9] },
  modules: [],
  fronts: ["slab"],
  handles: ["none"],
  finishes: ["factory-rough-linen"],
  hotspotKeywords: ["sofa", "couch"],
  thumbnail: "/furniture/factory/block-arm-sofa.png",
  replacesAsset: "factory:block-arm-sofa",
  defaultSpec: {
    generator: "sofaBlockArm",
    dims: { w: 2.1, d: 0.94, h: 0.84 },
    modules: {},
    front: "slab",
    handle: "none",
    finish: "factory-rough-linen",
    color: BLOCK_ARM_DEFAULT_COLOR,
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d, h } = spec.dims;
    return buildBlockArmSofa(w, d, h, spec.color ?? BLOCK_ARM_DEFAULT_COLOR);
  },
};
