import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "../types";
import {
  HorizontalRaycaster, Part, button, coneLeg, finish, piping, place, puff, pyRandom, rng, roundedBox, roundedGrid, smoothstep,
} from "./geom";
import { factoryMaterial } from "./materials";

// Grey L-shape chaise sectional — live port of the approved factory build
// assets/furniture/seating/grey-chaise-sectional/r001/build_sofa.py (shipped
// as factory:grey-chaise-sectional). Blender axes throughout, line for line
// with the script; geom.ts `finish()` converts.
//
// Script arguments: --width, --depth (the 3-seat RUN's depth), --chaise-len
// (how far the chaise reaches forward of the run), --height, --chaise-side.
// Three tufted back units, 3×2 buttons each — every button a little
// different (depth, width, ellipse, fold), seeded per unit, as the script
// does it; the buttons sit on the shaped surface by raycast.
//
// Parity with the script is gated by src/parametric/factory/factory.test.ts.

export const GREY_CHAISE_DEFAULT_COLOR = "#b9bbbe";

const LEG_H = 0.15; // floor to the underside of the fabric base
const BASE_Z = LEG_H;
const FZ = 0.3; // top of the fabric base
const SEAT_T = 0.17;
const SEAT_TOP = FZ + SEAT_T - 0.02;
const AT = 0.15; // arm thickness
const BACK_T = 0.15; // tufted back cushion thickness
const PANEL_T = 0.1; // back panel behind the cushions
const TILT = THREE.MathUtils.degToRad(9);
const FAB_TILE = 0.274; // hessian_380 real-world tile (m)
const PLUMP = 0.02; // padding dome height (kept small: outline stays clean)
const DIVOT = 0.036; // depth pulled in at each button
const SIGMA = 0.045; // divot width
const FOLD = 0.0035; // radial pull-fold amplitude
const CURVE = 0.01; // back cushions wrap forward at the ends by this much

/** The script's per-unit `random.Random(seed)`: seed from the unit's name. */
const nameSeed = (name: string) => [...name].reduce((s, c, i) => s + c.charCodeAt(0) * (i + 3), 0) + 5;

const uniform = (r: () => number, a: number, b: number) => a + (b - a) * r();

/** `tufted_slab` (chaise version): a padded panel held down by buttons, each
 *  one different; divots only pull INWARD from the dome. Buttons are seated
 *  on the FINAL surface by raycast — an undersampled pit is shallower than
 *  the formula, so an analytic seat buries the button. */
function tuftedSlab(
  name: string, sx: number, sy: number, sz: number, r: number, nx: number, nz: number,
  mat: THREE.Material, region: [number, number, number, number], buttons: [number, number][], curve: number, wear: number,
): { slab: Part; seats: [number, number, number][] } {
  const [tx0, tx1, tz0, tz1] = region;
  const slab = roundedGrid(name, sx, sy, sz, 0, r, 4, [nx + 1, 3, nz + 1], mat, FAB_TILE);
  // Fabric stretches over padding and settles with use: per-button depth,
  // width, ellipse, fold amplitude/phase and a few mm of position.
  const rr = pyRandom(nameSeed(name)); // exactly the script's random.Random(seed)
  const zc = (tz0 + tz1) / 2;
  const bt = buttons.map(([bx, bz]) => {
    const low = Math.max(0, (zc - bz) / Math.max(1e-6, (tz1 - tz0) / 2)); // lower buttons pulled harder
    return {
      x: bx + uniform(rr, -0.007, 0.007), z: bz + uniform(rr, -0.007, 0.007),
      dk: wear * uniform(rr, 0.62, 1.32) * (1 + 0.22 * low), sk: uniform(rr, 0.82, 1.28),
      ek: uniform(rr, 1, 1.55), ak: uniform(rr, 0, Math.PI), fk: uniform(rr, 0.5, 1.5), pk: uniform(rr, 0, 6.283),
    };
  });
  const hx = (tx1 - tx0) / 2, hz = (tz1 - tz0) / 2, mx = (tx0 + tx1) / 2, mz = (tz0 + tz1) / 2;
  const bulge = (x: number, z: number): number => {
    const edge = Math.min(x - tx0, tx1 - x, z - tz0, tz1 - z);
    if (edge <= 0) return 0;
    const win = smoothstep(edge / 0.06);
    const u = (x - mx) / hx, w = (z - mz) / hz;
    let v = PLUMP * (1 - 0.35 * u * u - 0.25 * w * w);
    for (const b of bt) {
      const dx = x - b.x, dz = z - b.z;
      const ex = dx * Math.cos(b.ak) + dz * Math.sin(b.ak);
      const ez = -dx * Math.sin(b.ak) + dz * Math.cos(b.ak);
      const d = Math.hypot(ex, ez * b.ek);
      v -= DIVOT * b.dk * (1 + (d / (SIGMA * b.sk)) ** 2) ** -1.5;
      const th = Math.atan2(dz, dx);
      v += FOLD * b.fk * Math.cos(7 * th + b.pk) * Math.exp(-((d / (0.065 * b.sk)) ** 2)) * smoothstep(d / 0.018);
    }
    return v * win;
  };
  const p = slab.pos;
  for (let i = 0; i < p.length; i += 3) {
    const front = p[i + 1] < -sy / 2 + 0.006;
    p[i + 1] -= curve * (p[i] / (sx / 2)) ** 2;
    if (front) p[i + 1] -= bulge(p[i], p[i + 2]);
  }
  const rc = new HorizontalRaycaster(slab);
  const seats = bt.map((b): [number, number, number] => {
    const hit = rc.cast(b.x, -1, b.z, 0, 1);
    const y = hit ? hit.p[1] : -sy / 2 - curve * (b.x / (sx / 2)) ** 2 - bulge(b.x, b.z);
    return [b.x, y - 0.0015, b.z];
  });
  return { slab, seats };
}

/** Run depth D, chaise reach CHL (metres), chaise on the left or mirrored. */
export function buildGreyChaise(W: number, D: number, CHL: number, H: number, side: "left" | "right", color: string): THREE.Group {
  const random = rng(41);
  const AH = Math.min(0.62, H * 0.76); // arm top
  const INNER0 = -W / 2 + AT, INNER1 = W / 2 - AT;
  const SW = (INNER1 - INNER0) / 3; // one seat / back unit
  const yBack = D / 2, yRunFront = -D / 2, yChaiseFront = yRunFront - CHL;
  const fab = factoryMaterial("hessian-380-chaise");
  const nickel = factoryMaterial("nickel");
  const parts: Part[] = [];

  // fabric base: run between the arms, plus the chaise base
  const runW = INNER1 - INNER0 + 0.06;
  const runBase = roundedBox("runbase", runW, D - 0.02, FZ - BASE_Z, 0, 0.02, 1, fab, FAB_TILE, 8);
  runBase.randomiseUV(random);
  place(runBase, 0, 0, BASE_Z);
  const runSeam = piping("runbaseseam", runW / 2 - 0.002, (D - 0.02) / 2 - 0.002, FZ - BASE_Z - 0.03, 0.02, 0.0045, fab, FAB_TILE, 8);
  place(runSeam, 0, 0, BASE_Z, 0, 0);
  const chW = AT + SW;
  const chBase = roundedBox("chaisebase", chW, CHL - 0.01, FZ - BASE_Z, 0, 0.02, 1, fab, FAB_TILE, 8);
  chBase.randomiseUV(random);
  const chX = -W / 2 + chW / 2, chY = yRunFront - CHL / 2 + 0.005;
  place(chBase, chX, chY, BASE_Z);
  const chSeam = piping("chbaseseam", chW / 2 - 0.002, (CHL - 0.01) / 2 - 0.002, FZ - BASE_Z - 0.03, 0.02, 0.0045, fab, FAB_TILE, 8);
  place(chSeam, chX, chY, BASE_Z, 0, 0);
  parts.push(runBase, runSeam, chBase, chSeam);

  // legs: run corners, mid back, mid front, chaise front corners — slim nickel pins splaying outward
  const LI = 0.09;
  const lx = W / 2 - LI, chx0 = -W / 2 + LI, chx1 = -W / 2 + chW - LI;
  const legs = [
    [-lx, yBack - LI, -1, 1], [lx, yBack - LI, 1, 1], [lx, yRunFront + LI, 1, -1], [0, yBack - LI, 0, 1],
    [chx0, yChaiseFront + LI, -1, -1], [chx1, yChaiseFront + LI, 1, -1], [0.35, yRunFront + LI, 0, -1],
  ];
  legs.forEach(([x, y, sx, sy], i) => {
    const l = coneLeg(`leg${i}`, x, y, LEG_H + 0.012, 0.0085, 0.015, 0.05, 1, sx, sy, nickel, 1, 20);
    l.uv = []; // plain metal, no UVs (the script never projects any)
    l.uvAxis = null;
    parts.push(l);
  });

  // arms: padded block; the chaise side has no arm in front of it
  for (const [s, nm] of [[-1, "armL"], [1, "armR"]] as const) {
    const arm = roundedBox(nm, AT, D - 0.01, AH - BASE_Z, 0, 0.035, 2, fab, FAB_TILE, 8);
    puff(arm, 0.008, 0.004, 0.002, 0, random);
    arm.randomiseUV(random);
    const abz = arm.minZ();
    const seam = piping(`${nm}seam`, AT / 2 - 0.002, (D - 0.01) / 2 - 0.002, abz + AH - BASE_Z - 0.028, 0.035, 0.0045, fab, FAB_TILE, 8);
    for (const o of [arm, seam]) {
      place(o, 0, 0, BASE_Z, 0, abz);
      o.transform(new THREE.Matrix4().makeTranslation(s * (W / 2 - AT / 2), 0, 0));
    }
    parts.push(arm, seam);
  }

  // back panel behind the cushions (blocks light through the gaps)
  const bp = roundedBox("backpanel", INNER1 - INNER0 + 0.04, PANEL_T, H - 0.12 - (FZ - 0.02), 0, 0.03, 1, fab, FAB_TILE, 8);
  bp.randomiseUV(random);
  place(bp, 0, yBack - PANEL_T / 2, FZ - 0.02);
  parts.push(bp);

  // three tufted back cushions, leaned back
  const bzWorld = FZ - 0.02;
  const bh = (H - bzWorld) / Math.cos(TILT) - 0.005;
  const tzLo = SEAT_TOP + 0.005 - bzWorld;
  const WEAR = [0.95, 1.18, 1.02];
  for (let i = 0; i < 3; i++) {
    const cx = INNER0 + (i + 0.5) * SW;
    const tx = (SW - 0.012) / 2 - 0.075; // grid_buttons(margin 0.075) half width
    const zLo = tzLo + 0.05, zHi = bh - 0.06; // padding starts above the seat, stops below the top
    const btns: [number, number][] = [];
    for (let a = 0; a < 3; a++)
      for (let b = 0; b < 2; b++) btns.push([-tx + ((a + 0.5) * (2 * tx)) / 3, zLo + ((b + 0.5) * (zHi - zLo)) / 2]);
    const { slab, seats } = tuftedSlab(`back${i}`, SW - 0.012, BACK_T, bh, 0.045, 36, 26, fab, [-tx, tx, zLo, zHi], btns, CURVE, WEAR[i]);
    slab.randomiseUV(random);
    const bobs = [slab, ...seats.map(([x, y, z], k) => button(`back${i}btn${k}`, x, y, z, 0.0125, fab, FAB_TILE))];
    const bzb = slab.minZ();
    for (const o of bobs) place(o, cx, yBack - PANEL_T - BACK_T / 2 + 0.005, bzWorld, -TILT, bzb);
    parts.push(...bobs);
  }

  // seating: three run units plus the chaise extension — plain crowned
  // cushions with welts, each a little different
  const seatD = D - PANEL_T - BACK_T * 0.5;
  const seat = (name: string, w: number, l: number, cx: number, cy: number, crown: number, belly: number, wr: number) => {
    const c = roundedBox(name, w, l, SEAT_T, 0, 0.05, 2, fab, FAB_TILE, 8);
    puff(c, crown, belly, wr, 0, random);
    c.randomiseUV(random);
    const bz0 = c.minZ();
    const ps = [0.02, SEAT_T - 0.026].map((z, k) =>
      piping(`${name}pipe${k}`, w / 2 - 0.003, l / 2 - 0.003, bz0 + z, 0.05, 0.0045, fab, FAB_TILE, 8));
    for (const o of [c, ...ps]) place(o, cx, cy, FZ - 0.02, 0, bz0);
    parts.push(c, ...ps);
  };
  ([[0.03, 0.018, 0.0032], [0.024, 0.014, 0.0028], [0.033, 0.017, 0.0024]] as const).forEach(([crown, belly, wr], i) =>
    seat(`seat${i}`, SW - 0.008, seatD, INNER0 + (i + 0.5) * SW, yRunFront + seatD / 2 + 0.02, crown, belly, wr));
  seat("chaiseext", chW - 0.012, CHL + 0.02, -W / 2 + chW / 2, yChaiseFront + (CHL + 0.02) / 2, 0.028, 0.016, 0.003);

  if (side === "right") {
    // Mirror in X, winding reversed so faces still point out.
    for (const p of parts) {
      for (let i = 0; i < p.pos.length; i += 3) p.pos[i] = -p.pos[i];
      for (let t = 0; t < p.tris.length; t += 3) {
        [p.tris[t + 1], p.tris[t + 2]] = [p.tris[t + 2], p.tris[t + 1]];
        for (let k = 0; k < 2; k++) {
          const a = (t + 1) * 2 + k, b = (t + 2) * 2 + k;
          if (p.uv.length) [p.uv[a], p.uv[b]] = [p.uv[b], p.uv[a]];
        }
        if (p.uvAxis) [p.uvAxis[t + 1], p.uvAxis[t + 2]] = [p.uvAxis[t + 2], p.uvAxis[t + 1]];
      }
    }
  }

  // Tone (world-space light/dark patches) lives in the material: ToneMaterial.
  const group = finish(parts);
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material === fab) o.userData.tintColor = color;
  });
  return group;
}

// Inspector mapping (Dan, 2026-09-23): Depth is the whole footprint (run +
// chaise), so the bounding-box contract of ParametricSpec.dims holds. Chaise
// length is its own control and moves ONLY the chaise: `reconcile` grows the
// footprint with it, the run keeps its depth. Width 2.30–2.85 (approved).
const CHAISE_LEN = { min: 55, max: 95, default: 70 }; // cm
const RUN_D: [number, number] = [0.8, 1.1];

export const sofaGreyChaiseGenerator: GeneratorDef = {
  id: "sofaGreyChaise",
  labelKey: "sofaGreyChaise.label",
  category: "Seating",
  rooms: ["living"],
  wallSnap: true,
  dimLimits: { w: [2.3, 2.85], d: [RUN_D[0] + CHAISE_LEN.min / 100, RUN_D[1] + CHAISE_LEN.max / 100], h: [0.72, 0.88] },
  modules: [
    { key: "chaiseLen", labelKey: "sofaGreyChaise.modules.chaiseLen.label", ...CHAISE_LEN },
    {
      key: "chaiseRight", labelKey: "sofaGreyChaise.modules.chaiseRight.label", min: 0, max: 1, default: 0,
      toggle: { onKey: "sofaGreyChaise.modules.chaiseRight.toggle.on", offKey: "sofaGreyChaise.modules.chaiseRight.toggle.off" },
    },
  ],
  fronts: ["slab"],
  handles: ["none"],
  finishes: ["factory-hessian-chaise"],
  hotspotKeywords: ["sofa", "couch", "sectional", "chaise"],
  thumbnail: "/furniture/factory/grey-chaise-sectional.png",
  replacesAsset: "factory:grey-chaise-sectional",
  defaultSpec: {
    generator: "sofaGreyChaise",
    dims: { w: 2.85, d: 0.95 + 0.7, h: 0.82 },
    modules: { chaiseLen: 70, chaiseRight: 0 },
    front: "slab",
    handle: "none",
    finish: "factory-hessian-chaise",
    color: GREY_CHAISE_DEFAULT_COLOR,
  },
  reconcile(prev, next) {
    const chl = (next.modules.chaiseLen ?? CHAISE_LEN.default) / 100;
    const was = (prev.modules.chaiseLen ?? CHAISE_LEN.default) / 100;
    // Chaise length changed: the run keeps its depth, the footprint follows.
    let d = next.dims.d + (chl - was);
    // Any depth must leave the run inside its own range at this chaise length.
    d = Math.min(RUN_D[1] + chl, Math.max(RUN_D[0] + chl, d));
    return { ...next, dims: { ...next.dims, d } };
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d, h } = spec.dims;
    const chl = (spec.modules.chaiseLen ?? CHAISE_LEN.default) / 100;
    const run = Math.min(RUN_D[1], Math.max(RUN_D[0], d - chl));
    return buildGreyChaise(w, run, chl, h, spec.modules.chaiseRight ? "right" : "left", spec.color ?? GREY_CHAISE_DEFAULT_COLOR);
  },
};
