import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "../types";
import {
  Part, button, coneLeg, finish, member, piping, place, puff, rng, roundedBox, roundedGrid, smoothstep,
} from "./geom";
import { factoryMaterial } from "./materials";

// Tufted mid-century 3-seat sofa — live port of the approved factory build
// assets/furniture/seating/tufted-sage-sofa/r001/build_sofa.py (shipped as
// factory:tufted-sage-sofa). Blender axes throughout, line for line with the
// script; geom.ts `finish()` converts.
//
// The tufting is fixed in METRES (6×2 buttons, divot depth/width, fold
// amplitude), exactly as the script keeps it: a wider sofa spaces the same
// buttons further apart, it never grows bigger divots.
//
// Parity with the script is gated by src/parametric/factory/factory.test.ts.

export const TUFTED_SAGE_DEFAULT_COLOR = "#9ca993";

const LEG_H = 0.15; // leg length, floor to the underside of the oak base
const RAIL_H = 0.045; // oak base frame height
const BASE_Z = LEG_H + RAIL_H; // underside of the fabric body
const FZ = 0.3; // top of the fabric base frame
const SEAT_T = 0.17;
const SEAT_TOP = FZ + SEAT_T - 0.02;
const AT = 0.17; // arm thickness
const FLARE = 0.07; // arm top leans outward by this much
const SLOPE = 0.05; // arm top drops toward the front by this much
const ARM_Z0 = BASE_Z; // arms sit directly on the oak base
const BACK_T = 0.15;
const TILT = THREE.MathUtils.degToRad(10);
const FAB_TILE = 0.284; // velour_velvet real-world tile (m)
const OAK_TILE = 1.83;
const BTN_COLS = 6, BTN_ROWS = 2;
const PLUMP = 0.032; // padding dome height
const DIVOT = 0.052; // depth pulled in at each button
const SIGMA = 0.055; // divot width
const FOLD = 0.0045; // radial pull-fold amplitude
const CURVE = 0.045; // back wraps forward at both ends by this much

/** `flare(ob, s, amount)`: shear so the top leans outward, thickness kept. */
function flare(part: Part, s: number, amount: number): void {
  const { lo, hi } = part.bounds();
  const p = part.pos;
  for (let i = 0; i < p.length; i += 3) p[i] += (s * amount * (p[i + 2] - lo.z)) / (hi.z - lo.z);
}

/** `slope_arm(ob, drop)`: lower the arm top toward the front (-Y). */
function slopeArm(part: Part, drop: number): void {
  const { lo, hi } = part.bounds();
  const p = part.pos;
  for (let i = 0; i < p.length; i += 3)
    p[i + 2] -= drop * (1 - (p[i + 1] - lo.y) / (hi.y - lo.y)) * ((p[i + 2] - lo.z) / (hi.z - lo.z));
}

/** `tufted_slab`: a rounded slab whose -Y face is one plump padded dome held
 *  down by buttons — each pulls the fabric INTO a divot with faint radial
 *  pull-folds. Returns the slab and each button's seat on the surface. */
function tuftedSlab(
  name: string, sx: number, sy: number, sz: number, r: number, nx: number, nz: number,
  mat: THREE.Material, region: [number, number, number, number], buttons: [number, number][],
): { slab: Part; seats: [number, number, number][] } {
  const [tx0, tx1, tz0, tz1] = region;
  // bevel(segments=8) + subdivide x/z/y edges by nx/nz/2 cuts.
  const slab = roundedGrid(name, sx, sy, sz, 0, r, 4, [nx + 1, 3, nz + 1], mat, FAB_TILE);
  const hx = (tx1 - tx0) / 2, hz = (tz1 - tz0) / 2;
  const mx = (tx0 + tx1) / 2, mz = (tz0 + tz1) / 2;
  const bulge = (x: number, z: number): number => {
    const edge = Math.min(x - tx0, tx1 - x, z - tz0, tz1 - z);
    if (edge <= 0) return 0;
    const win = smoothstep(edge / 0.07);
    const u = (x - mx) / hx, w = (z - mz) / hz;
    let v = PLUMP * (1 - 0.35 * u * u - 0.25 * w * w); // one padded dome
    buttons.forEach(([bx, bz], k) => {
      const dx = x - bx, dz = z - bz;
      const rr = Math.hypot(dx, dz);
      v -= DIVOT * (1 + (rr / SIGMA) ** 2) ** -1.5; // tension divot around the button
      const th = Math.atan2(dz, dx);
      v += FOLD * Math.cos(7 * th + k * 1.7) * Math.exp(-((rr / 0.075) ** 2)) * smoothstep(rr / 0.02); // pull-folds
    });
    return v * win;
  };
  const p = slab.pos;
  for (let i = 0; i < p.length; i += 3) {
    const front = p[i + 1] < -sy / 2 + 0.006; // front flat face only
    p[i + 1] -= CURVE * (p[i] / (sx / 2)) ** 2; // wrap the whole slab forward at the ends
    if (front) p[i + 1] -= bulge(p[i], p[i + 2]);
  }
  const seats = buttons.map(([bx, bz]): [number, number, number] =>
    [bx, -sy / 2 - CURVE * (bx / (sx / 2)) ** 2 - bulge(bx, bz), bz]);
  return { slab, seats };
}

export function buildTuftedSageSofa(W: number, D: number, H: number, color: string): THREE.Group {
  const random = rng(31);
  const AH = Math.min(0.64, H * 0.76); // arm top height (rear)
  const INNER_W = W - 2 * (AT + 0.4 * FLARE);
  const fab = factoryMaterial("velour-velvet");
  const oak = factoryMaterial("oak-veneer-01");
  const parts: Part[] = [];
  const yFront = -D / 2, yBack = D / 2;

  // oak base: a 4.5 cm perimeter frame the body sits on, legs splaying from its corners
  const FT = 0.034;
  const FX = W / 2 - FLARE - FT / 2; // outer face flush with the arm underside
  const FY = (D - 0.01) / 2 - FT / 2; // ... and with the arm front/back faces
  parts.push(
    member("basefront", 0, -FY, LEG_H, 2 * FX + FT, FT, RAIL_H, 0, oak, OAK_TILE, random),
    member("baseback", 0, FY, LEG_H, 2 * FX + FT, FT, RAIL_H, 0, oak, OAK_TILE, random),
  );
  ([-1, 1] as const).forEach((s, k) =>
    parts.push(member(`baseside${k}`, s * FX, 0, LEG_H, FT, 2 * FY - FT, RAIL_H, 1, oak, OAK_TILE, random)));
  ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).forEach(([sx, sy], i) =>
    parts.push(coneLeg(`leg${i}`, sx * (FX - 0.045), sy * (FY - 0.065), LEG_H + 0.012, 0.019, 0.03, 0.06, 0.9, sx, sy, oak, OAK_TILE)));

  // base frame between the arms
  const base = roundedBox("base", INNER_W + 0.06, D - 0.04, FZ - BASE_Z, 0, 0.02, 1, fab, FAB_TILE, 8);
  place(base, 0, 0, BASE_Z);
  parts.push(base);

  // arms: one continuous rounded form, leaning outward, sloping down toward the front
  for (const [s, nm] of [[-1, "armL"], [1, "armR"]] as const) {
    const arm = roundedBox(nm, AT, D - 0.01, AH - ARM_Z0, 0, 0.04, 2, fab, FAB_TILE, 8);
    puff(arm, 0.008, 0.004, 0.002, 0, random);
    place(arm, 0, 0, ARM_Z0);
    slopeArm(arm, SLOPE);
    flare(arm, s, FLARE);
    arm.transform(new THREE.Matrix4().makeTranslation(s * (W / 2 - AT / 2 - FLARE), 0, 0));
    parts.push(arm);
  }

  // tufted back: one slab, wraps forward at the ends, leans back
  const bzWorld = FZ - 0.02;
  const bh = (H - bzWorld) / Math.cos(TILT) - 0.005;
  const tz0 = SEAT_TOP + 0.005 - bzWorld;
  const tz1 = bh - 0.05;
  const tx = (INNER_W - 0.03) / 2;
  const bspan = (2 * tx) / BTN_COLS;
  const btns: [number, number][] = [];
  for (let i = 0; i < BTN_COLS; i++)
    for (let j = 0; j < BTN_ROWS; j++) btns.push([-tx + (i + 0.5) * bspan, tz0 + ((j + 1) * (tz1 - tz0)) / (BTN_ROWS + 1)]);
  const { slab, seats } = tuftedSlab("backtuft", INNER_W + 0.08, BACK_T, bh, 0.045, 96, 40, fab, [-tx, tx, tz0, tz1], btns);
  const bobs = [slab, ...seats.map(([x, y, z], i) => button(`btn${i}`, x, y, z, 0.0135, fab, FAB_TILE))];
  const bzb = slab.minZ();
  for (const o of bobs) place(o, 0, yBack - BACK_T / 2 - 0.09, bzWorld, -TILT, bzb);
  parts.push(...bobs);

  // seat cushions: two, crowned, front proud of the frame by 2 cm
  const seatD = D - BACK_T - 0.01;
  const cw = (INNER_W - 0.006) / 2;
  ([-1, 1] as const).forEach((s, i) => {
    const c = roundedBox(`seat${i}`, cw - 0.004, seatD, SEAT_T, 0, 0.05, 3, fab, FAB_TILE, 8);
    puff(c, 0.03, 0.018, 0.0025, 0, random);
    const bz0 = c.minZ();
    const ps = [0.02, SEAT_T - 0.026].map((z, k) =>
      piping(`seatpipe${i}${k}`, (cw - 0.004) / 2 - 0.003, seatD / 2 - 0.003, bz0 + z, 0.05, 0.0045, fab, FAB_TILE, 8));
    for (const o of [c, ...ps]) place(o, s * (cw / 2 + 0.001), yFront + seatD / 2 + 0.02, FZ - 0.02, 0, bz0);
    parts.push(c, ...ps);
  });

  const group = finish(parts);
  // Grey pile × colour, default colour included (see sofaBlockArm.ts).
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material === fab) {
      o.userData.tintColor = color;
      o.userData.keepSheen = true; // the baked GLB's pale sheen, not the tint
    }
  });
  return group;
}

export const sofaTuftedSageGenerator: GeneratorDef = {
  id: "sofaTuftedSage",
  labelKey: "sofaTuftedSage.label",
  category: "Seating",
  rooms: ["living"],
  wallSnap: true,
  // Dan, 2026-09-23: block-arm proportions around this default; width floor
  // 1.70 because the fixed 6×2 buttons crowd below it.
  dimLimits: { w: [1.7, 2.8], d: [0.8, 1.08], h: [0.74, 0.9] },
  modules: [],
  fronts: ["slab"],
  handles: ["none"],
  finishes: ["factory-velour"],
  hotspotKeywords: ["sofa", "couch"],
  thumbnail: "/furniture/factory/tufted-sage-sofa.png",
  replacesAsset: "factory:tufted-sage-sofa",
  defaultSpec: {
    generator: "sofaTuftedSage",
    dims: { w: 2.1, d: 0.92, h: 0.84 },
    modules: {},
    front: "slab",
    handle: "none",
    finish: "factory-velour",
    color: TUFTED_SAGE_DEFAULT_COLOR,
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d, h } = spec.dims;
    return buildTuftedSageSofa(w, d, h, spec.color ?? TUFTED_SAGE_DEFAULT_COLOR);
  },
};
