import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "../types";
import { Part, crease, finish, noise3, pyRandom, roundedBox, solidifyGrid, tubePath, vertexUV } from "./geom";
import { factoryMaterial } from "./materials";

// Oak platform bed — live port of the approved done-furniture-factory build
// assets/furniture/bedroom/oak-platform-bed/r003/build_bed.py (shipped as
// factory:oak-platform-bed), with Dan's V3-3 sizes (2026-09-23): mattress
// 90×190 single → 200×200, one centred pillow below a 1.20 m mattress. The
// Blender variant carrying those changes (plus the cuff droop following the
// width) is floorplan-3d-refs/parametric-factory/oak-platform-bed/v3-3/
// build-bed-v33.py, which the parity fixtures were exported from.
//
// Blender axes throughout, line for line with the script, EXCEPT the duvet:
// the script drops a sheet in a 110-frame cloth simulation, which no inspector
// drag can wait for. Here it is an analytic drape fitted to the simulated one
// (same grid, same UVs, same crease + thickness passes): flat on the mattress,
// rolling over the side and foot edges and hanging, flaring out at the hem.
// Its parity tolerance is looser than the rest (factory.test.ts).
//
// Width/depth are the script's --width/--depth (the oak frame; mattress =
// frame − 0.12 each way). Height is fixed by design.

// The APPROVED bed (r003, 2026-09-20) wore a greige linen duvet. The
// parametric rework of the script (2026-09-22) moved it onto the sofas'
// tint recipe (grey tile x colour) at #cdba96, which lands ~45% darker than
// what Dan approved. Gain + default below reproduce the approved duvet's
// linear base colour (0.537 / 0.421 / 0.299) within 0.5%.
export const BED_OAK_DEFAULT_COLOR = "#f3dabb";
const DUVET_TINT_GAIN = 1.25;

const POST = 0.06;
const RAIL_T = 0.04, RAIL_Z0 = 0.14, RAIL_Z1 = 0.3;
const HEAD_TOP = 1.04;
const CAP_H = 0.04, CAP_OVER = 0.015;
const BOARD_T = 0.024;
const MATT_INSET = 0.12;
const MATT_H = 0.22;
const DECK_TOP = 0.26;
const TILE = 1.83; // oak_veneer_01 real-world tile (m)
const FAB_TILE = 0.27; // terlenka real-world tile (m)

// Duvet drape, fitted to the r003 simulation's cross-sections (sides and foot
// alike): the sheet rests ~1.2 cm above the mattress, stays flat to 2 cm in
// from the edge, rolls over a 5 cm radius, hangs 13.5 cm below its resting
// height and flares ~4 cm out at the hem; where side and foot meet, the
// corner droops a further ~5 cm into a cone. (The simulated sheet is itself
// lopsided by ~3 cm side to side; this one is symmetric, on its middle.)
const DUV_REST = 0.012;
const DUV_R = 0.05;
const DUV_HANG = 0.135;
const DUV_FLARE = 0.04;
const DUV_CORNER = 0.048;

/** `wood_box()`: a solid oak member, V along the grain, a random UV offset per
 *  member, end-grain faces on the darker material. The 3 mm bevel is left out
 *  (flat-shaded box — see geom `member`). */
function woodBox(
  name: string, cx: number, cy: number, z0: number, sx: number, sy: number, sz: number,
  grain: 0 | 1 | 2, face: THREE.Material, end: THREE.Material, random: () => number,
): Part {
  const p = new Part(name, face);
  p.smooth = false;
  p.mats = [face, end];
  const v = (a: number, b: number, c: number) => p.addVert(cx + (a * sx) / 2, cy + (b * sy) / 2, z0 + ((c + 1) * sz) / 2);
  const [b0, b1, b2, b3] = [v(-1, -1, -1), v(1, -1, -1), v(1, 1, -1), v(-1, 1, -1)];
  const [t0, t1, t2, t3] = [v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1)];
  const faces: [number[], number][] = [
    [[b3, b2, b1, b0], 2], [[t0, t1, t2, t3], 2],
    [[b0, b1, t1, t0], 1], [[b2, b3, t3, t2], 1],
    [[b1, b2, t2, t1], 0], [[b3, b0, t0, t3], 0],
  ];
  const ou = random(), ov = random();
  const others = ([0, 1, 2] as const).filter((a) => a !== grain);
  const mat: number[] = [];
  for (const [[a, b, c, d], n] of faces) {
    p.quad(a, b, c, d);
    mat.push(n === grain ? 1 : 0, n === grain ? 1 : 0);
    const across = n === grain ? others[1] : others.find((ax) => ax !== n)!;
    for (const i of [a, b, c, a, c, d]) p.uv.push(p.pos[i * 3 + across] / TILE + ou, p.pos[i * 3 + grain] / TILE + ov);
  }
  p.triMat = Uint8Array.from(mat);
  return p;
}

/** Mattress piping: a 10-sided tube (bevel_resolution 3) around a rounded
 *  rectangle of 4 × 9 points. */
function piping(name: string, z: number, hx: number, hy: number, rc: number, rt: number, mat: THREE.Material, shift: boolean): Part {
  const pts: [number, number, number][] = [];
  for (const [cxs, cys, a0] of [[1, 1, 0], [-1, 1, 90], [-1, -1, 180], [1, -1, 270]]) {
    for (let i = 0; i < 9; i++) {
      const a = THREE.MathUtils.degToRad(a0 + (i * 90) / 8);
      pts.push([cxs * (hx - rc) + rc * Math.cos(a), cys * (hy - rc) + rc * Math.sin(a), z]);
    }
  }
  const p = tubePath(name, pts, mat, rt, true, 10);
  p.fabricUV(FAB_TILE);
  if (shift) p.transform(new THREE.Matrix4().makeTranslation(0, -0.01, 0));
  return p;
}

/** One side of the drape: plan distance past the flat edge → (outward offset,
 *  drop). k converts plan distance to cloth length so the hang is DUV_HANG. */
function roll(o: number, k: number): [number, number] {
  if (o <= 0) return [o, 0];
  const L1 = (Math.PI * DUV_R) / 2;
  const sMax = L1 + DUV_HANG - DUV_R;
  const s = o * k;
  if (s < L1) {
    const th = s / DUV_R;
    return [DUV_R * Math.sin(th), DUV_R * (1 - Math.cos(th))];
  }
  const h = s - L1;
  return [DUV_R + DUV_FLARE * (h / (sMax - L1)) ** 2, DUV_R + h];
}

export function buildOakPlatformBed(W: number, D: number, color: string): THREE.Group {
  const random = pyRandom(7);
  const MATT_W = W - MATT_INSET, MATT_D = D - MATT_INSET;
  const OAK = factoryMaterial("oak-face");
  const END = factoryMaterial("oak-endgrain");
  const COTTON = factoryMaterial("cotton-offwhite");
  const WHITE = factoryMaterial("cotton-white");
  const DUVET = factoryMaterial("terlenka");
  const parts: Part[] = [];
  const wood = (name: string, cx: number, cy: number, z0: number, sx: number, sy: number, sz: number, grain: 0 | 1 | 2) =>
    parts.push(woodBox(name, cx, cy, z0, sx, sy, sz, grain, OAK, END, random));

  // ---- frame
  const px = W / 2 - POST / 2, py = D / 2 - POST / 2;
  const railH = RAIL_Z1 - RAIL_Z0;
  for (const sx of [-1, 1]) {
    const s = sx < 0 ? "L" : "R";
    wood(`post_head_${s}`, sx * px, py, 0, POST, POST, HEAD_TOP - CAP_H, 2);
    wood(`post_foot_${s}`, sx * px, -py, 0, POST, POST, RAIL_Z1 + 0.03, 2);
  }
  const spanY = D - 2 * POST, spanX = W - 2 * POST;
  for (const sx of [-1, 1]) wood(`rail_side_${sx < 0 ? "L" : "R"}`, sx * (W / 2 - RAIL_T / 2), 0, RAIL_Z0, RAIL_T, spanY, railH, 1);
  wood("rail_foot", 0, -(D / 2 - RAIL_T / 2), RAIL_Z0, spanX, RAIL_T, railH, 0);
  wood("rail_head", 0, D / 2 - RAIL_T / 2, RAIL_Z0, spanX, RAIL_T, railH, 0);
  // ledgers + deck slats
  const ledZ = DECK_TOP - 0.018 - 0.03;
  for (const sx of [-1, 1]) wood(`ledger_${sx < 0 ? "L" : "R"}`, sx * (W / 2 - RAIL_T - 0.015), 0, ledZ, 0.03, spanY, 0.03, 1);
  const nSlats = 16, slatW = 0.07;
  const pitch = (spanY - slatW) / (nSlats - 1);
  for (let i = 0; i < nSlats; i++) {
    const y = -spanY / 2 + slatW / 2 + i * pitch;
    wood(`slat_${String(i).padStart(2, "0")}`, 0, y, DECK_TOP - 0.018, W - 2 * RAIL_T - 0.002, slatW, 0.018, 0);
  }
  // ---- headboard: one continuous slab + cap
  wood("head_panel", 0, D / 2 - POST / 2, RAIL_Z1, spanX, BOARD_T, HEAD_TOP - CAP_H - RAIL_Z1, 2);
  wood("head_cap", 0, D / 2 - POST / 2, HEAD_TOP - CAP_H, W, POST + 2 * CAP_OVER, CAP_H, 0);

  // ---- mattress + piping (the script shifts both 1 cm off the headboard)
  const matt = roundedBox("mattress", MATT_W, MATT_D, MATT_H, DECK_TOP, 0.035, 2, COTTON, FAB_TILE);
  matt.transform(new THREE.Matrix4().makeTranslation(0, -0.01, 0));
  parts.push(matt);
  const inset = 0.035 * (1 - Math.cos(Math.PI / 4));
  // The script sets location.y = -0.01 on both, then bakes it with
  // ob.matrix_world — which Blender has not yet updated for the LAST object
  // created, so the bottom piping (and the cuff below) never actually moves.
  // The approved build is what that produced; keep it.
  parts.push(piping("piping_top", DECK_TOP + MATT_H - inset, MATT_W / 2 - inset + 0.001, MATT_D / 2 - inset + 0.001, 0.03, 0.0065, COTTON, true));
  parts.push(piping("piping_bottom", DECK_TOP + inset, MATT_W / 2 - inset + 0.001, MATT_D / 2 - inset + 0.001, 0.03, 0.0065, COTTON, false));

  // ---- pillows: firm visco slabs, neck contour, propped on the headboard
  const top = DECK_TOP + MATT_H;
  const HEAD_EDGE_Y = MATT_D / 2 - 0.01;
  const PILLOW_Y = HEAD_EDGE_Y - 0.205;
  const pillow = (name: string, cx: number, yaw: number, W_ = 0.62) => {
    const H_ = 0.115;
    const p = roundedBox(name, W_, 0.42, H_, -H_ / 2, 0.042, 4, WHITE, FAB_TILE);
    const P = p.pos;
    for (let i = 0; i < P.length; i += 3) {
      if (P[i + 2] > 0) {
        const k = P[i + 2] / (H_ / 2);
        P[i + 2] -= 0.013 * Math.exp(-((P[i] / 0.15) ** 2)) * k;
        P[i + 2] += 0.006 * (Math.abs(P[i]) / (W_ / 2)) ** 2 * k;
      }
    }
    p.transform(new THREE.Matrix4().makeTranslation(cx, PILLOW_Y, top + 0.122 - 0.008)
      .multiply(new THREE.Matrix4().makeRotationZ(yaw))
      .multiply(new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(18))));
    parts.push(p);
  };
  // Dan, 2026-09-23: a mattress under 1.20 m gets ONE centred pillow; two
  // pillows each fit inside their half (the default 1.60 is unchanged).
  if (MATT_W < 1.2 - 1e-9) pillow("pillow_C", 0, 0);
  else {
    const PW = Math.min(0.62, MATT_W / 2 - 0.02);
    const PX = Math.min(Math.max(0.33, (0.42 * MATT_W) / 1.6), MATT_W / 2 - PW / 2 - 0.01);
    pillow("pillow_L", -PX, 0.03, PW);
    pillow("pillow_R", PX, -0.03, PW);
  }

  // ---- duvet (analytic stand-in for the cloth sim, see header)
  const DW = MATT_W + 0.24;
  const FOOT_EDGE_Y = -MATT_D / 2 - 0.01;
  const Y_FOOT = FOOT_EDGE_Y - 0.13;
  const Y_FOLD = HEAD_EDGE_Y - 0.51;
  const nu = Math.floor(DW / 0.022), nv = 74;
  const X0 = MATT_W / 2 - 0.02, YF = -FOOT_EDGE_Y - 0.02;
  const kx = ((Math.PI * DUV_R) / 2 + DUV_HANG - DUV_R) / (DW / 2 - X0);
  const ky = ((Math.PI * DUV_R) / 2 + DUV_HANG - DUV_R) / (-Y_FOOT - YF);
  const duv = new Part("duvet_sim", DUVET);
  const uv: number[] = [];
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      const x = (i / nu - 0.5) * DW, y = Y_FOOT + (j / nv) * (Y_FOLD - Y_FOOT);
      uv.push(x / 0.3, y / 0.3); // fabric_uv(0.30) on the flat grid
      const [ox, dx] = roll(Math.abs(x) - X0, kx);
      const [oy, dy] = roll(-y - YF, ky);
      duv.addVert(Math.sign(x) * (X0 + ox), y < -YF ? -(YF + oy) : y,
        top + DUV_REST - Math.max(dx, dy) - DUV_CORNER * Math.min(1, Math.min(dx, dy) / (DUV_R + DUV_HANG)));
    }
  const at = (i: number, j: number) => j * (nu + 1) + i;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) duv.quad(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
  crease(duv, 0.017, 2.4, 5.0);
  solidifyGrid(duv, nu, nv, 0.022, 1, uv);
  vertexUV(duv, uv);
  parts.push(duv);

  // The "turned-down cuff": the script means it for the head edge (location.y
  // = Y_FOLD - 0.085) but the same unapplied-matrix bake leaves it at y = 0,
  // so the approved bed carries it as a soft band across the middle of the
  // duvet. Kept where the approved build has it.
  const cuff = roundedBox("duvet_cuff", MATT_W + 0.02, 0.19, 0.066, top + 0.028, 0.03, 3, DUVET, 0.3);
  const droopX = (MATT_W + 0.02) / 2 - 0.26;
  for (let i = 0; i < cuff.pos.length; i += 3) {
    const x = cuff.pos[i], y = cuff.pos[i + 1];
    cuff.pos[i + 2] += 0.006 * Math.sin(x * 5.5) + 0.004 * noise3(x * 3, y * 3, 1) - 0.05 * Math.max(0, (Math.abs(x) - droopX) / 0.26) ** 2;
  }
  crease(cuff, 0.005, 6.0, 9.0);
  parts.push(cuff);

  // centre Y (the head cap overhangs the back by 15 mm); the script does not
  // recentre on the bbox — the duvet hangs past the foot posts.
  for (const p of parts) p.transform(new THREE.Matrix4().makeTranslation(0, -0.0075, 0));
  const group = finish(parts, { centre: false });
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material === DUVET) {
      o.userData.tintColor = color;
      o.userData.tintGain = DUVET_TINT_GAIN;
    }
  });
  return group;
}

export const bedOakPlatformGenerator: GeneratorDef = {
  id: "bedOakPlatform",
  labelKey: "bedOakPlatform.label",
  category: "Beds",
  rooms: ["bedroom"],
  wallSnap: true,
  // Dan, 2026-09-23: mattress 90×190 single up to 200×200; the oak frame adds
  // 0.12 each way. Height is the headboard's, fixed by design.
  dimLimits: { w: [1.02, 2.12], d: [2.02, 2.12], h: [1.04, 1.04] },
  modules: [],
  fronts: ["slab"],
  handles: ["none"],
  finishes: ["factory-terlenka"],
  hotspotKeywords: ["bed", "double bed", "single bed"],
  thumbnail: "/furniture/factory/oak-platform-bed.png",
  replacesAsset: "factory:oak-platform-bed",
  defaultSpec: {
    generator: "bedOakPlatform",
    dims: { w: 1.72, d: 2.12, h: 1.04 },
    modules: {},
    front: "slab",
    handle: "none",
    finish: "factory-terlenka",
    color: BED_OAK_DEFAULT_COLOR,
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d } = spec.dims;
    return buildOakPlatformBed(w, d, spec.color ?? BED_OAK_DEFAULT_COLOR);
  },
};
