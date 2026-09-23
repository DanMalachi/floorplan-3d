import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "../types";
import { Part, finish, piping, place, puff, rng, roundedBox } from "./geom";
import { factoryMaterial, type FactoryMaterialId } from "./materials";

// Flare-arm and plain-block 3-seat sofas — live ports of the approved factory
// builds assets/furniture/seating/{flare-arm-sofa,plain-block-sofa}/r001/
// build_sofa.py (shipped as factory:flare-arm-sofa / factory:plain-block-sofa).
// The two scripts are one script with different constants (a diff of them is
// only the numbers in `FlareArmStyle`), so they share this builder. Blender
// axes throughout; geom.ts `finish()` converts.
//
// Parity with the scripts is gated by src/parametric/factory/factory.test.ts.

interface FlareArmStyle {
  seed: number;
  LEG_H: number;
  FZ: number; // top of the fabric base frame
  AT: number; // arm thickness
  armTop: (H: number) => number; // AH
  FLARE: number; // arm top leans outward by this much (absolute metres)
  TILT: number; // back cushion lean (degrees)
  fabric: FactoryMaterialId;
  FAB_TILE: number;
  /** "block" = tapered bevelled square leg; "cone" = 28-sided turned leg. */
  leg: { kind: "block" | "cone"; top: number; bot: number; splay: number; inX: number; inY: number };
  base: { sub: number; seg: number };
  arm: { r: number; sub: number; seg: number; crown: number; belly: number };
  backframe: { sub: number; seg: number };
  cushion: { seatSub: number; backSub: number; seg: number };
  pipeRad: number;
  /** Piping ring count the SHIPPED GLB was built with (furniture_lib's
   *  default moved 6 → 8 after flare-arm shipped). */
  pipeRing: number;
}

const SEAT_T = 0.19;
const BACK_T = 0.13;
const BC_T = 0.2;
const OAK_TILE = 1.83;

const FLARE_ARM: FlareArmStyle = {
  seed: 23,
  LEG_H: 0.19,
  FZ: 0.3,
  AT: 0.15,
  armTop: (H) => Math.min(0.6, H * 0.73),
  FLARE: 0.05,
  TILT: 11,
  fabric: "curly-teddy-natural",
  FAB_TILE: 0.333,
  leg: { kind: "block", top: 0.055, bot: 0.03, splay: 0.05, inX: 0.2, inY: 0.13 },
  base: { sub: 2, seg: 4 },
  arm: { r: 0.05, sub: 3, seg: 4, crown: 0.01, belly: 0.006 },
  backframe: { sub: 3, seg: 4 },
  cushion: { seatSub: 4, backSub: 4, seg: 4 },
  pipeRad: 0.0055,
  pipeRing: 6,
};

const PLAIN_BLOCK: FlareArmStyle = {
  seed: 23,
  LEG_H: 0.15,
  FZ: 0.26,
  AT: 0.2,
  armTop: (H) => Math.min(0.62, H * 0.75),
  FLARE: 0,
  TILT: 12,
  fabric: "hessian-380-plain",
  FAB_TILE: 0.274,
  leg: { kind: "cone", top: 0.04, bot: 0.03, splay: 0.02, inX: 0.15, inY: 0.11 },
  base: { sub: 1, seg: 8 },
  arm: { r: 0.035, sub: 2, seg: 8, crown: 0.008, belly: 0.004 },
  backframe: { sub: 1, seg: 8 },
  cushion: { seatSub: 3, backSub: 3, seg: 8 },
  pipeRad: 0.0045,
  pipeRing: 8,
};

/** `leg()`: a tapered leg splayed outward (x fully, y at 0.7). The block
 *  variant's 2mm bevel is left out — invisible at room scale. */
function leg(st: FlareArmStyle, name: string, x: number, y: number, mat: THREE.Material, sx: number, sy: number): Part {
  const { kind, top, bot, splay } = st.leg;
  const h = st.LEG_H + 0.012;
  const p = new Part(name, mat);
  const at = (cx: number, cy: number, t: number): number =>
    p.addVert(cx + sx * splay * (1 - t) + x, cy + sy * splay * 0.7 * (1 - t) + y, t * h);
  if (kind === "block") {
    p.smooth = false;
    const ring = (t: number) => {
      const s = bot + (top - bot) * t;
      return [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([cx, cy]) => at(cx * s, cy * s, t));
    };
    const [b0, b1, b2, b3] = ring(0), [t0, t1, t2, t3] = ring(1);
    p.quad(b3, b2, b1, b0);
    p.quad(t0, t1, t2, t3);
    p.quad(b0, b1, t1, t0);
    p.quad(b1, b2, t2, t1);
    p.quad(b2, b3, t3, t2);
    p.quad(b3, b0, t0, t3);
  } else {
    // bmesh create_cone(segments=28, radius1=bot, radius2=top): smooth sides,
    // n-gon caps (fan-triangulated, as the glTF exporter does).
    const N = 28;
    const ring = (r: number, t: number) =>
      Array.from({ length: N }, (_, i) => at(r * Math.cos((2 * Math.PI * i) / N), r * Math.sin((2 * Math.PI * i) / N), t));
    const B = ring(bot, 0), T = ring(top, 1);
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      p.quad(B[i], B[j], T[j], T[i]);
    }
    for (let i = 1; i < N - 1; i++) {
      p.tris.push(T[0], T[i], T[i + 1]);
      p.tris.push(B[0], B[i + 1], B[i]);
    }
  }
  p.fabricUV(OAK_TILE);
  return p;
}

/** `flare(ob, s, amount)`: shear so the top leans outward, thickness kept. */
function flare(part: Part, s: number, amount: number): void {
  const { lo, hi } = part.bounds();
  const p = part.pos;
  for (let i = 0; i < p.length; i += 3) p[i] += (s * amount * (p[i + 2] - lo.z)) / (hi.z - lo.z);
}

function build(st: FlareArmStyle, W: number, D: number, H: number, color: string): THREE.Group {
  const random = rng(st.seed);
  const { LEG_H, FZ, AT, FLARE, FAB_TILE } = st;
  const AH = st.armTop(H);
  const SEAT_TOP = FZ + SEAT_T - 0.02;
  const ARM_Z0 = LEG_H + 0.005;
  const TILT = THREE.MathUtils.degToRad(st.TILT);
  const INNER_W = W - 2 * (AT + 0.4 * FLARE);
  const fab = factoryMaterial(st.fabric);
  const oak = factoryMaterial("oak-veneer-01");
  const parts: Part[] = [];
  const yFront = -D / 2, yBack = D / 2;

  // legs (oak, tapered, splayed outward), inset under the frame
  const lx = W / 2 - st.leg.inX, ly = D / 2 - st.leg.inY;
  ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).forEach(([sx, sy], i) =>
    parts.push(leg(st, `leg${i}`, sx * lx, sy * ly, oak, sx, sy)));

  // base frame between the arms
  const base = roundedBox("base", INNER_W + 0.06, D - 0.04, FZ - LEG_H, 0, 0.02, st.base.sub, fab, FAB_TILE, st.base.seg);
  place(base, 0, 0, LEG_H);
  parts.push(base);

  // arms: one continuous rounded form that leans outward (no separate pad)
  for (const [s, nm] of [[-1, "armL"], [1, "armR"]] as const) {
    const arm = roundedBox(nm, AT, D - 0.01, AH - ARM_Z0, 0, st.arm.r, st.arm.sub, fab, FAB_TILE, st.arm.seg);
    puff(arm, st.arm.crown, st.arm.belly, 0.002, 0, random);
    place(arm, 0, 0, ARM_Z0);
    flare(arm, s, FLARE);
    arm.transform(new THREE.Matrix4().makeTranslation(s * (W / 2 - AT / 2 - FLARE), 0, 0));
    parts.push(arm);
  }

  // back frame (rear)
  const back = roundedBox("backframe", INNER_W + 0.06, BACK_T, AH - 0.06 - LEG_H, 0, 0.035, st.backframe.sub, fab, FAB_TILE, st.backframe.seg);
  place(back, 0, yBack - BACK_T / 2, LEG_H);
  parts.push(back);

  // seat cushions: two, crowned, front proud of the frame by 2 cm
  const seatD = D - BACK_T - 0.01;
  const cw = (INNER_W - 0.006) / 2;
  ([-1, 1] as const).forEach((s, i) => {
    const c = roundedBox(`seat${i}`, cw - 0.004, seatD, SEAT_T, 0, 0.05, st.cushion.seatSub, fab, FAB_TILE, st.cushion.seg);
    puff(c, 0.034, 0.02, 0.0025, 0, random);
    const bz0 = c.minZ();
    const ps = [0.02, SEAT_T - 0.026].map((z, k) =>
      piping(`seatpipe${i}${k}`, (cw - 0.004) / 2 - 0.003, seatD / 2 - 0.003, bz0 + z, 0.05, st.pipeRad, fab, FAB_TILE, st.pipeRing));
    for (const o of [c, ...ps]) place(o, s * (cw / 2 + 0.001), yFront + seatD / 2 + 0.02, FZ - 0.02, 0, bz0);
    parts.push(c, ...ps);
  });

  // back cushions: two, plump, leaned back, top reaches H
  const bcZ0 = SEAT_TOP - 0.03;
  const bcH = (H - bcZ0) / Math.cos(TILT) - 0.005;
  ([-1, 1] as const).forEach((s, i) => {
    const c = roundedBox(`backc${i}`, cw - 0.004, BC_T, bcH, 0, 0.06, st.cushion.backSub, fab, FAB_TILE, st.cushion.seg);
    puff(c, 0.0, 0.04, 0.004, 0.05, random);
    const bz0 = c.minZ();
    const ps = [0.02, bcH - 0.022].map((z, k) =>
      piping(`backpipe${i}${k}`, (cw - 0.004) / 2 - 0.004, BC_T / 2 - 0.004, bz0 + z, 0.06, st.pipeRad, fab, FAB_TILE, st.pipeRing));
    for (const o of [c, ...ps]) place(o, s * (cw / 2 + 0.001), yBack - BACK_T - 0.06, bcZ0, -TILT, bz0);
    parts.push(c, ...ps);
  });

  const group = finish(parts);
  // Grey weave × colour, default colour included (see sofaBlockArm.ts).
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material === fab) o.userData.tintColor = color;
  });
  return group;
}

export const FLARE_ARM_DEFAULT_COLOR = "#f1eadb";
export const PLAIN_BLOCK_DEFAULT_COLOR = "#d8cab2";

export const buildFlareArmSofa = (W: number, D: number, H: number, color: string) => build(FLARE_ARM, W, D, H, color);
export const buildPlainBlockSofa = (W: number, D: number, H: number, color: string) => build(PLAIN_BLOCK, W, D, H, color);

export const sofaFlareArmGenerator: GeneratorDef = {
  id: "sofaFlareArm",
  labelKey: "sofaFlareArm.label",
  category: "Seating",
  rooms: ["living"],
  wallSnap: true,
  // Dan, 2026-09-23: block-arm's proportional range around this sofa's default.
  dimLimits: { w: [1.5, 2.8], d: [0.8, 1.08], h: [0.72, 0.88] },
  modules: [],
  fronts: ["slab"],
  handles: ["none"],
  finishes: ["factory-curly-teddy"],
  hotspotKeywords: ["sofa", "couch"],
  thumbnail: "/furniture/factory/flare-arm-sofa.png",
  replacesAsset: "factory:flare-arm-sofa",
  defaultSpec: {
    generator: "sofaFlareArm",
    dims: { w: 2.1, d: 0.92, h: 0.82 },
    modules: {},
    front: "slab",
    handle: "none",
    finish: "factory-curly-teddy",
    color: FLARE_ARM_DEFAULT_COLOR,
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d, h } = spec.dims;
    return buildFlareArmSofa(w, d, h, spec.color ?? FLARE_ARM_DEFAULT_COLOR);
  },
};

export const sofaPlainBlockGenerator: GeneratorDef = {
  id: "sofaPlainBlock",
  labelKey: "sofaPlainBlock.label",
  category: "Seating",
  rooms: ["living"],
  wallSnap: true,
  // Dan, 2026-09-23: block-arm's proportional range around this sofa's default.
  dimLimits: { w: [1.5, 2.8], d: [0.8, 1.08], h: [0.72, 0.88] },
  modules: [],
  fronts: ["slab"],
  handles: ["none"],
  finishes: ["factory-hessian"],
  hotspotKeywords: ["sofa", "couch"],
  thumbnail: "/furniture/factory/plain-block-sofa.png",
  replacesAsset: "factory:plain-block-sofa",
  defaultSpec: {
    generator: "sofaPlainBlock",
    dims: { w: 2.1, d: 0.92, h: 0.82 },
    modules: {},
    front: "slab",
    handle: "none",
    finish: "factory-hessian",
    color: PLAIN_BLOCK_DEFAULT_COLOR,
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d, h } = spec.dims;
    return buildPlainBlockSofa(w, d, h, spec.color ?? PLAIN_BLOCK_DEFAULT_COLOR);
  },
};
