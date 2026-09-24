import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "../types";
import {
  HorizontalRaycaster, Part, coneLeg, finish, piping, place, puff, rng, roundedBox, roundedGrid, smoothstep,
  stitchMesh, type Hit,
} from "./geom";
import { factoryMaterial } from "./materials";

// Beige leather 3-seat sofa — live port of the approved factory build
// assets/furniture/seating/beige-leather-sofa/r001/build_sofa.py (shipped as
// factory:beige-leather-sofa). Blender axes throughout, line for line with the
// script; geom.ts `finish()` converts.
//
// Physics as the script models it: each back cushion is foam in a leather
// cover sewn tight across one seam, so the leather pinches INTO a narrow V at
// the stitch line; seat corners gather; stitches are real thread raycast onto
// the shaped surface at a fixed 12.5mm pitch — so the stitch COUNT follows the
// size, and so does the triangle count (the parity test compares it with the
// Blender build at the same size).
//
// Parity with the script is gated by src/parametric/factory/factory.test.ts.

export const BEIGE_LEATHER_DEFAULT_COLOR = "#cdb794";

const LEG_H = 0.17;
const BASE_Z = LEG_H;
const FZ = 0.3;
const SEAT_T = 0.17;
const AT = 0.16;
const FLARE = 0.09;
const SLOPE = 0.05;
const TILT = THREE.MathUtils.degToRad(9);
const FAB_TILE = 0.25; // leather_grain tile, 2048 px = 0.25 m
const OAK_TILE = 1.83;
const PANEL_T = 0.09;
const BACK_T = 0.17;
const PITCH = 0.0125; // stitch pitch (stitch 8.5 mm + 4 mm gap)

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

function frange(a: number, b: number, step: number): number[] {
  const out: number[] = [];
  for (let x = a; x < b; x += step) out.push(x);
  return out;
}

/** Edge-loop positions from lo to hi: 3mm within 3cm of `centre`, 8mm within
 *  8cm, 2cm elsewhere. */
function graded(lo: number, hi: number, centre: number): number[] {
  const out: number[] = [];
  for (let x = lo; x < hi; ) {
    out.push(x);
    const d = Math.abs(x - centre);
    x += d < 0.03 ? 0.003 : d < 0.08 ? 0.008 : 0.02;
  }
  out.push(centre);
  return [...new Set(out.map((p) => Math.round(p * 1e5) / 1e5))].sort((a, b) => a - b);
}

/** `cushion_mesh` + `finish`: a bevelled block (seg 8) cut with edge loops at
 *  the given positions (x, y centred; z from the base), world-scale UVs
 *  rotated at random. */
function cushion(
  name: string, sx: number, sy: number, sz: number, r: number, loops: { x?: number[]; y?: number[]; z?: number[] },
  mat: THREE.Material, random: () => number,
): Part {
  const p = roundedGrid(name, sx, sy, sz, 0, r, 4, [1, 1, 1], mat, FAB_TILE,
    [loops.x, loops.y, loops.z?.map((z) => z - sz / 2)]);
  p.randomiseUV(random);
  return p;
}

/** Split back: two chambers of foam pinched by one stitched seam. */
function backCushion(name: string, sx: number, sy: number, sz: number, r: number, zseam: number, mat: THREE.Material, random: () => number): Part {
  const c = cushion(name, sx, sy, sz, r, { x: frange(-sx / 2 + r, sx / 2 - r + 1e-6, 0.013), z: graded(r, sz - r, zseam) }, mat, random);
  const P = c.pos;
  const front: number[] = [];
  for (let i = 0; i < P.length; i += 3) if (P[i + 1] < -sy / 2 + 1e-4) front.push(i); // flat front, before shaping
  puff(c, 0.01, 0.005, 0, 0, random); // barely-there crown: the outline stays clean
  const [x0, x1, z0, z1] = [-sx / 2 + r, sx / 2 - r, r, sz - r];
  const PLUMP = 0.01, DIV = 0.03, SG = 0.019; // dome height, seam pull depth, seam width
  const ph = random() * 6.28;
  const cxm = (x0 + x1) / 2, hxm = (x1 - x0) / 2, hzm = (z1 - z0) / 2, czm = (z0 + z1) / 2;
  // ONE padded face with a faint dome; the seam pulls the leather INWARD (a
  // divot with a sharp V) and pushes nothing out, tapering at the cushion
  // ends where the hide gathers into wrinkles.
  const bulge = (x: number, z: number): number => {
    const edge = Math.min(x - x0, x1 - x, z - z0, z1 - z);
    if (edge <= 0) return 0;
    const win = smoothstep(edge / 0.06);
    const u = (x - cxm) / hxm, w = (z - czm) / hzm;
    const dome = PLUMP * (1 - 0.3 * u * u - 0.22 * w * w);
    const dz = z - zseam;
    const pull = DIV * (1 + (dz / SG) ** 2) ** -1.5 * smoothstep((x - x0) / 0.035) * smoothstep((x1 - x) / 0.035);
    let val = dome * win - pull;
    for (const ex of [x0 + 0.03, x1 - 0.03]) {
      const dx = x - ex;
      const rr = Math.hypot(dx, dz);
      val += 0.0028 * Math.cos(9 * Math.atan2(dz, dx) + ph) * Math.exp(-((rr / 0.07) ** 2)) * smoothstep(rr / 0.015) * smoothstep(edge / 0.025);
    }
    val += 0.0006 * Math.cos((2 * Math.PI * x) / 0.0315) * Math.exp(-(((z - zseam) / 0.011) ** 2)); // puckers between stitches
    return val;
  };
  for (const i of front) P[i + 1] -= bulge(P[i], P[i + 2]);
  return c;
}

/** Seat cushion: pillow top, hide gathered at the corners. */
function seatCushion(name: string, sx: number, sy: number, sz: number, r: number, mat: THREE.Material, random: () => number): Part {
  const c = cushion(name, sx, sy, sz, r, {
    x: frange(-sx / 2 + r, sx / 2 - r + 1e-6, 0.014),
    y: frange(-sy / 2 + r, sy / 2 - r + 1e-6, 0.014),
    z: frange(0.02, sz - 0.01, 0.014),
  }, mat, random);
  const P = c.pos;
  const top: number[] = [];
  for (let i = 0; i < P.length; i += 3) if (P[i + 2] > sz - 1e-4) top.push(i);
  puff(c, 0.03, 0.018, 0, 0, random);
  const [cx0, cx1, cy0, cy1] = [-sx / 2 + r, sx / 2 - r, -sy / 2 + r, sy / 2 - r];
  const corners = [[cx0, cy0], [cx1, cy0], [cx0, cy1], [cx1, cy1]];
  const phs = corners.map(() => random() * 6.28);
  for (const i of top) {
    const x = P[i], y = P[i + 1];
    const edge = Math.min(x - cx0, cx1 - x, y - cy0, cy1 - y);
    if (edge <= 0) continue;
    let dz = 0;
    corners.forEach(([px, py], k) => {
      const rr = Math.hypot(x - px, y - py);
      dz += 0.0026 * Math.cos(8 * Math.atan2(y - py, x - px) + phs[k]) * Math.exp(-((rr / 0.1) ** 2)) * smoothstep(rr / 0.018);
    });
    P[i + 2] += dz * smoothstep(edge / 0.03);
  }
  return c;
}

/** `rr_path`: rounded-rectangle path (x, y, outward nx, ny), piping's arcs. */
function rrPath(hx: number, hy: number, rc: number, k = 7): number[][] {
  const pts: number[][] = [];
  for (const [cxs, cys, a0] of [[1, 1, 0], [-1, 1, 90], [-1, -1, 180], [1, -1, 270]]) {
    for (let j = 0; j < k; j++) {
      const a = THREE.MathUtils.degToRad(a0 + (90 * j) / (k - 1));
      pts.push([cxs * (hx - rc) + rc * Math.cos(a), cys * (hy - rc) + rc * Math.sin(a), Math.cos(a), Math.sin(a)]);
    }
  }
  return pts;
}

/** `resample`: points every `pitch` along a closed polyline of (x, y, nx, ny). */
function resample(pts: number[][], pitch: number): number[][] {
  const out: number[][] = [];
  let carry = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let d = carry;
    for (; d < L; d += pitch) {
      const t = d / L;
      const nx = a[2] + (b[2] - a[2]) * t, ny = a[3] + (b[3] - a[3]) * t;
      const m = Math.hypot(nx, ny) || 1;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, nx / m, ny / m]);
    }
    carry = d - L;
  }
  return out;
}

const rowAlongX = (rc: HorizontalRaycaster, x0: number, x1: number, z: number): Hit[] => {
  const row: Hit[] = [];
  for (let x = x0; x <= x1; x += PITCH) {
    const hit = rc.cast(x, -1, z, 0, 1);
    if (hit) row.push(hit);
  }
  return row;
};

const rowAround = (rc: HorizontalRaycaster, hx: number, hy: number, r: number, z: number, out = 0.4): Hit[] =>
  resample(rrPath(hx, hy, r), PITCH).flatMap(([x, y, nx, ny]) => rc.cast(x + nx * out, y + ny * out, z, -nx, -ny) ?? []);

/** `thread_material`: a shade darker than the hide — 0.58 × its linear colour. */
function threadHex(color: string): string {
  return `#${new THREE.Color(color).multiplyScalar(0.58).getHexString()}`; // Color works in linear
}

export function buildBeigeLeatherSofa(W: number, D: number, H: number, color: string): THREE.Group {
  const random = rng(17);
  const AH = Math.min(0.62, H * 0.74);
  const INNER_W = W - 2 * (AT + 0.4 * FLARE);
  const fab = factoryMaterial("leather-grain");
  const oak = factoryMaterial("oak-veneer-01");
  const thread = factoryMaterial("thread");
  const parts: Part[] = [];
  const yFront = -D / 2, yBack = D / 2;

  const FX = W / 2 - FLARE;
  ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).forEach(([sx, sy], i) =>
    parts.push(coneLeg(`leg${i}`, sx * (FX - 0.1), sy * (D / 2 - 0.11), LEG_H + 0.012, 0.019, 0.031, 0.06, 0.9, sx, sy, oak, OAK_TILE, 16)));

  const base = roundedBox("base", INNER_W + 0.06, D - 0.04, FZ - BASE_Z, 0, 0.02, 1, fab, FAB_TILE, 8);
  base.randomiseUV(random);
  place(base, 0, 0, BASE_Z);
  parts.push(base);

  for (const [s, nm] of [[-1, "armL"], [1, "armR"]] as const) {
    const arm = roundedBox(nm, AT, D - 0.01, AH - BASE_Z, 0, 0.068, 2, fab, FAB_TILE, 8);
    puff(arm, 0.014, 0.006, 0.003, 0, random);
    arm.randomiseUV(random);
    place(arm, 0, 0, BASE_Z);
    slopeArm(arm, SLOPE);
    flare(arm, s, FLARE);
    arm.transform(new THREE.Matrix4().makeTranslation(s * (W / 2 - AT / 2 - FLARE), 0, 0));
    parts.push(arm);
  }

  const pz0 = FZ - 0.02;
  const panel = roundedBox("backpanel", INNER_W + 0.04, PANEL_T, H - 0.1 - pz0, 0, 0.03, 1, fab, FAB_TILE, 8);
  panel.randomiseUV(random);
  place(panel, 0, yBack - PANEL_T / 2 - 0.005, pz0);
  parts.push(panel);

  const cw = (INNER_W - 0.008) / 2;
  const bh = (H - pz0 - 0.03) / Math.cos(TILT);
  const zseam = bh * 0.6;
  ([-1, 1] as const).forEach((s, i) => {
    const bw = cw - 0.006;
    const c = backCushion(`back${i}`, bw, BACK_T, bh, 0.065, zseam, fab, random);
    const rc = new HorizontalRaycaster(c);
    const rows = [-0.0075, 0.0075].map((dz) => rowAlongX(rc, -bw / 2 + 0.09, bw / 2 - 0.09, zseam + dz));
    const st = stitchMesh(`backstitch${i}`, rows, thread);
    const bz0 = c.minZ();
    for (const o of [c, st]) place(o, s * (cw / 2 + 0.002), yBack - PANEL_T - BACK_T / 2 - 0.015, pz0, -TILT, bz0);
    parts.push(c, st);
  });

  const seatD = D - 0.3;
  ([-1, 1] as const).forEach((s, i) => {
    const sw = cw - 0.004;
    const c = seatCushion(`seat${i}`, sw, seatD, SEAT_T, 0.05, fab, random);
    const bz0 = c.minZ();
    const zw = SEAT_T - 0.026;
    const ps = [0.02, zw].map((z, k) =>
      piping(`seatpipe${i}${k}`, sw / 2 - 0.003, seatD / 2 - 0.003, bz0 + z, 0.05, 0.0045, fab, FAB_TILE, 8));
    const rc = new HorizontalRaycaster(c);
    const rows = [-0.011, 0.011].map((dz) => rowAround(rc, sw / 2, seatD / 2, 0.05, bz0 + zw + dz));
    const st = stitchMesh(`seatstitch${i}`, rows, thread);
    for (const o of [c, st, ...ps]) place(o, s * (cw / 2 + 0.001), yFront + seatD / 2 + 0.02, FZ - 0.02, 0, bz0);
    parts.push(c, st, ...ps);
  });

  // The hide's tone (world-space light/dark patches) is in the material:
  // materials.ts ToneMaterial.
  const group = finish(parts);
  const threadColor = threadHex(color);
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (o.material === fab) o.userData.tintColor = color;
    else if (o.material === thread) o.userData.tintColor = threadColor;
  });
  return group;
}

export const sofaBeigeLeatherGenerator: GeneratorDef = {
  id: "sofaBeigeLeather",
  labelKey: "sofaBeigeLeather.label",
  category: "Seating",
  rooms: ["living"],
  wallSnap: true,
  // Dan, 2026-09-23: block-arm's proportional range around this default.
  dimLimits: { w: [1.5, 2.8], d: [0.8, 1.08], h: [0.74, 0.9] },
  modules: [],
  fronts: ["slab"],
  handles: ["none"],
  finishes: ["factory-leather"],
  hotspotKeywords: ["sofa", "couch", "leather"],
  thumbnail: "/furniture/factory/beige-leather-sofa.png",
  replacesAsset: "factory:beige-leather-sofa",
  defaultSpec: {
    generator: "sofaBeigeLeather",
    dims: { w: 2.1, d: 0.92, h: 0.84 },
    modules: {},
    front: "slab",
    handle: "none",
    finish: "factory-leather",
    color: BEIGE_LEATHER_DEFAULT_COLOR,
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d, h } = spec.dims;
    return buildBeigeLeatherSofa(w, d, h, spec.color ?? BEIGE_LEATHER_DEFAULT_COLOR);
  },
};
