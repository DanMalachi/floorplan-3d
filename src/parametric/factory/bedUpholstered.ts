import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "../types";
import { Part, finish, roundedGrid, solidifyGrid, tubePath, vertexUV } from "./geom";
import { factoryMaterial } from "./materials";

// Astra upholstered bed — live port of the approved build
// scripts/curated/build-bed-benchmark.py (codex/furniture-expansion worktree;
// shipped as factory:upholstered-queen-bed), with Dan's V3-3 sizes
// (2026-09-23): mattress 90×190 single → 200×200, one centred pillow below a
// 1.20 m mattress. The Blender variant carrying those two changes is
// floorplan-3d-refs/parametric-factory/upholstered-queen-bed/v3-3/build-bed-v33.py
// and is what the parity fixtures were exported from.
//
// Blender axes throughout, line for line with the script; geom.ts `finish()`
// converts. Width/depth are the script's --width/--depth (the upholstered
// FRAME; mattress = frame − 0.15 × − 0.18). Height is fixed by design.
// Every other number is the script's, including its delta method: rigid
// members keep their thickness and move by DW/DD, headboard panels and
// pillow offsets scale with WR, fabric wrinkles stay in real metres.

export const BED_UPHOLSTERED_DEFAULT_COLOR = "#918473";

const TILE = 0.42; // the script's triplanar / surface UV divisor (m)

// The script multiplies its colour into a weave that averages 0.935; the
// shared grey tile is normalised to 0.72 like the sofas' (tex/manifest.json).
// Restore the script's brightness on the tint: (0.935/0.72) in sRGB is this
// factor on the linear colour three multiplies with.
const TINT_GAIN = Math.pow(0.935 / 0.72, 2.2);

/** Blender names a second object of the same name "<name>.001". */
function namer(): (base: string) => string {
  const seen = new Map<string, number>();
  return (base) => {
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}.${String(n).padStart(3, "0")}`;
  };
}

/** `cube()`: a bevelled box (6 segments = rounded grid of 3 per band) with
 *  triplanar UVs in its own centred space, then moved to `loc`. */
function cube(name: string, dims: [number, number, number], loc: [number, number, number], mat: THREE.Material, radius = 0.025): Part {
  const r = Math.min(radius, Math.min(...dims) * 0.45);
  const p = roundedGrid(name, dims[0], dims[1], dims[2], -dims[2] / 2, r, 3, [1, 1, 1], mat, TILE);
  p.transform(new THREE.Matrix4().makeTranslation(...loc));
  return p;
}

type Fn = (u: number, v: number) => [number, number, number];

/** `surface()`: an (nu × nv) grid of fn(u, v), UVs as the script sets them,
 *  optionally given the SOLIDIFY modifier (offset 0: ±t/2 along the vertex
 *  normal, inner shell reversed, a rim on every boundary edge). */
function surface(name: string, nu: number, nv: number, fn: Fn, mat: THREE.Material, thickness = 0): Part {
  const p = new Part(name, mat);
  const uv: number[] = [];
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv;
      p.addVert(...fn(u, v));
      uv.push((u * 2.05) / TILE, (v * 1.75) / TILE);
    }
  const at = (i: number, j: number) => j * (nu + 1) + i;
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) p.quad(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
  if (thickness) solidifyGrid(p, nu, nv, thickness, 0, uv);
  vertexUV(p, uv);
  return p;
}

/** `pipe()`: a POLY curve with bevel_depth = radius, bevel_resolution 2 —
 *  an 8-sided tube, no caps. */
function pipe(name: string, coords: [number, number, number][], mat: THREE.Material, radius = 0.002, closed = false): Part {
  const p = tubePath(name, coords, mat, radius, closed, 8);
  vertexUV(p, new Array(p.vertexCount * 2).fill(0));
  return p;
}

/** The closed edge loop the script walks around a surface for its seams. */
function edgeLoop(fn: Fn, k: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i <= k; i++) out.push(fn(i / k, 0));
  for (let i = 1; i <= k; i++) out.push(fn(1, i / k));
  for (let i = 1; i <= k; i++) out.push(fn(1 - i / k, 1));
  for (let i = 1; i < k; i++) out.push(fn(0, 1 - i / k));
  return out;
}

function roundedRect(w: number, d: number, z: number, radius = 0.07, yoff = 0): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (const [cx, cy, start] of [[w / 2 - radius, d / 2 - radius, 0], [-w / 2 + radius, d / 2 - radius, 90], [-w / 2 + radius, -d / 2 + radius, 180], [w / 2 - radius, -d / 2 + radius, 270]]) {
    for (let k = 0; k < 17; k++) {
      const a = THREE.MathUtils.degToRad(start + (k * 90) / 16);
      pts.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a) + yoff, z]);
    }
  }
  return pts;
}

export function buildUpholsteredBed(FW: number, FD: number, color: string): THREE.Group {
  const DW = FW - 1.75, DD = FD - 2.18, WR = FW / 1.75;
  const UPH = factoryMaterial("oatmeal-upholstery");
  const LINEN = factoryMaterial("ivory-washed-linen");
  const OAK = factoryMaterial("bed-natural-oak");
  const nm = namer();
  const parts: Part[] = [];
  const add = <T extends Part>(p: T) => (parts.push(p), p);

  // Frame: two side rails, foot rail, inset platform.
  add(cube("inset natural-oak plinth", [1.47 + DW, 1.87 + DD, 0.115], [0, -0.035, 0.0575], OAK, 0.015));
  add(cube("left padded side rail", [0.105, 2.06 + DD, 0.215], [-0.8225 - DW / 2, -0.025, 0.2375], UPH, 0.028));
  add(cube("right padded side rail", [0.105, 2.06 + DD, 0.215], [0.8225 + DW / 2, -0.025, 0.2375], UPH, 0.028));
  add(cube("padded foot rail", [1.75 + DW, 0.105, 0.215], [0, -1.0275 - DD / 2, 0.2375], UPH, 0.028));
  add(cube("recessed mattress support", [1.59 + DW, 1.97 + DD, 0.075], [0, -0.02, 0.295], UPH, 0.018));
  add(cube("headboard upholstered rear shell", [1.75 + DW, 0.14, 1.1], [0, 1.02 + DD / 2, 0.55], UPH, 0.052));

  // Headboard: a plump front face with a pulled-in edge seam per panel.
  const panelW = 0.552 * WR;
  for (const cx of [-0.568 * WR, 0, 0.568 * WR]) {
    const fn: Fn = (u, v) => {
      const x = (u - 0.5) * panelW, z = 0.09 + v * 0.982;
      const envelope = Math.max(0, Math.sin(Math.PI * u) * Math.sin(Math.PI * v)) ** 0.55;
      let y = 0.941 + DD / 2 - 0.029 * envelope;
      const edge = Math.exp(-Math.min(u, 1 - u, v, 1 - v) * 32);
      y += 0.0007 * edge * Math.sin(u * 73 + v * 65);
      return [x + cx, y, z];
    };
    add(surface(nm("sewn padded headboard panel"), 42, 46, fn, UPH, 0.007));
    add(pipe(nm("headboard welt seam"), edgeLoop(fn, 80).map(([x, y, z]) => [x, y - 0.002, z]), UPH, 0.0025, true));
  }
  for (const x of [-0.285 * WR, 0.285 * WR]) {
    const pts: [number, number, number][] = [];
    for (let k = 0; k < 80; k++) pts.push([x, 1.091 + DD / 2, 0.045 + (1.01 * k) / 79]);
    add(pipe(nm("rear headboard panel stitch"), pts, UPH, 0.0014));
  }
  add(cube("rounded pocket-spring mattress", [1.6 + DW, 2.0 + DD, 0.26], [0, -0.025, 0.465], LINEN, 0.07));
  for (const z of [0.36, 0.56]) add(pipe(nm("mattress taped edge"), roundedRect(1.585 + DW, 1.985 + DD, z, 0.07, -0.025), LINEN, 0.0032, true));

  // Pillows: two sewn cloth faces sharing their seam, volume swelling centrally.
  const pillow = (cx: number, cy: number, yaw: number, seed: number, w = 0.705) => {
    const d = 0.455, ang = THREE.MathUtils.degToRad(yaw), ca = Math.cos(ang), sa = Math.sin(ang);
    const local = (u: number, v: number, side = 1): [number, number, number] => {
      const a = 2 * u - 1, b = 2 * v - 1;
      const x = ((a * w) / 2) * (1 - 0.09 * Math.abs(b) ** 9);
      const y = ((b * d) / 2) * (1 - 0.1 * Math.abs(a) ** 9);
      const envelope = Math.max(0, (1 - a * a) * (1 - b * b)) ** 0.48;
      const edge = Math.min(1 - Math.abs(a), 1 - Math.abs(b));
      const fold = 0.003 * Math.sin(a * 44 + b * 17 + seed) * Math.exp(-edge * 9) * Math.sin(Math.PI * Math.min(1, edge * 8));
      let z = 0.02 + side * (0.106 * envelope + fold);
      z += y * 0.22 + 0.676; // head edge gently raised against the headboard
      return [cx + x * ca - y * sa, cy + x * sa + y * ca, z];
    };
    add(surface(nm("linen pillow upper tailored surface"), 58, 42, (u, v) => local(u, v, 1), LINEN));
    add(surface(nm("linen pillow lower tailored surface"), 58, 42, (u, v) => local(1 - u, v, -1), LINEN));
    add(pipe(nm("pillow cotton piping"), edgeLoop((u, v) => local(u, v), 90), LINEN, 0.0021, true));
  };
  // Dan, 2026-09-23: a mattress under 1.20 m gets ONE centred pillow.
  if (FW - 0.15 < 1.2 - 1e-9) pillow(0, 0.6145 + DD / 2, -1, 1);
  else {
    // Offsets scale with width; on a 1.20–1.39 m mattress each pillow
    // narrows to its own half so the pair never overlaps (default unchanged).
    const lx = Math.max(0.3, 0.395 * WR), rx = Math.max(0.3, 0.388 * WR);
    pillow(-lx, 0.617 + DD / 2, -4, 1, Math.min(0.705, 2 * lx - 0.005));
    pillow(rx, 0.612 + DD / 2, 3, 3, Math.min(0.705, 2 * rx - 0.005));
  }

  // Duvet: settled folds, arcing over the mattress side into a hanging skirt.
  const SHOULDER_X = 0.75 + DW / 2, FOOT_SHOULDER = 0.94 + DD / 2;
  const drape: Fn = (u, v) => {
    const sx = (u - 0.5) * (2.1 + DW);
    const sy = -1.27 - DD / 2 + v * (1.77 + DD);
    const ax = Math.abs(sx);
    const t = Math.max(0, (ax - SHOULDER_X) / 0.3);
    let xx = ax > SHOULDER_X ? Math.sign(sx) * (SHOULDER_X + 0.13 * Math.sin((Math.min(t, 1) * Math.PI) / 2)) : sx;
    const dropx = 0.285 * t ** 1.38;
    const foot = Math.max(0, (-sy - FOOT_SHOULDER) / 0.33);
    let yy = sy < -FOOT_SHOULDER ? -FOOT_SHOULDER - 0.13 * Math.sin((Math.min(foot, 1) * Math.PI) / 2) : sy;
    const dropy = 0.31 * foot ** 1.35;
    let z = 0.651 - Math.max(dropx, dropy);
    let folds = 0.018 * Math.sin(sx * 13 + sy * 3) + 0.012 * Math.sin(sy * 18 + sx * 5) + 0.006 * Math.sin(sx * 27 - sy * 11);
    folds += 0.0035 * Math.sin(sx * 91 + sy * 29 + Math.sin(sy * 21)) * Math.sin(sy * 38 + sx * 17);
    for (const [anchor, phase] of [[-0.7, 0], [-0.23, 1.4], [0.2, 3.1]]) {
      const ridge = sy - anchor - 0.18 * Math.sin(sx * 3 + phase);
      folds += 0.014 * Math.exp(-((ridge / 0.035) ** 2)) * (0.4 + 0.6 * Math.abs(sx));
    }
    folds *= 0.7 + 0.3 * Math.max(t, foot);
    z += folds;
    // copysign(…, sx): Python's copysign(x, 0.0) is +x.
    xx += (sx < 0 ? -1 : 1) * Math.abs((0.012 * Math.sin(sy * 38 + 1) + 0.006 * Math.sin(sy * 71)) * t);
    yy += (0.014 * Math.sin(sx * 26) + 0.008 * Math.sin(sx * 51)) * foot;
    return [xx, yy, z];
  };
  add(surface("ivory duvet with settled folds and draped skirt", 110, 100, drape, LINEN, 0.016));
  add(pipe("duvet sewn rolled hem", edgeLoop(drape, 150), LINEN, 0.0032, true));

  const turnback: Fn = (u, v) => {
    const x = (u - 0.5) * (1.62 + DW);
    const y = 0.25 + DD / 2 + v * 0.23;
    const z = 0.689 + 0.018 * Math.sin(v * Math.PI) + 0.012 * Math.sin(x * 15 + v * 3) + 0.004 * Math.sin(x * 61 + v * 17);
    return [x, y, z];
  };
  add(surface("turned-back duvet edge", 80, 22, turnback, LINEN, 0.012));
  const seam: [number, number, number][] = [];
  for (let k = 0; k <= 130; k++) seam.push(turnback(k / 130, 0));
  add(pipe("duvet turnback seam", seam, LINEN, 0.0022));

  const group = finish(parts);
  // Upholstery is a grey weave that MUST be multiplied by a colour (see
  // block-arm); linen and oak keep the colour the script bakes into them.
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material === UPH) {
      o.userData.tintColor = color;
      o.userData.tintGain = TINT_GAIN;
    }
  });
  return group;
}

export const bedUpholsteredGenerator: GeneratorDef = {
  id: "bedUpholstered",
  labelKey: "bedUpholstered.label",
  category: "Beds",
  rooms: ["bedroom"],
  wallSnap: true,
  // Dan, 2026-09-23: mattress 90×190 single up to 200×200; the frame adds
  // 0.15 / 0.18. Height is the headboard's, fixed by design.
  dimLimits: { w: [1.05, 2.15], d: [2.08, 2.18], h: [1.1, 1.1] },
  modules: [],
  fronts: ["slab"],
  handles: ["none"],
  finishes: ["factory-oatmeal"],
  hotspotKeywords: ["bed", "double bed", "single bed"],
  thumbnail: "/furniture/factory/upholstered-queen-bed.png",
  replacesAsset: "factory:upholstered-queen-bed",
  defaultSpec: {
    generator: "bedUpholstered",
    dims: { w: 1.75, d: 2.18, h: 1.1 },
    modules: {},
    front: "slab",
    handle: "none",
    finish: "factory-oatmeal",
    color: BED_UPHOLSTERED_DEFAULT_COLOR,
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d } = spec.dims;
    return buildUpholsteredBed(w, d, spec.color ?? BED_UPHOLSTERED_DEFAULT_COLOR);
  },
};
