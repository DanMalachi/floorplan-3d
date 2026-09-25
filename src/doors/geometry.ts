import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { DoorDesign, DoorLook, HandleId, TrimId } from "./look";

/**
 * Door geometry, built to the opening's real size every time.
 *
 * LEAF FRAME (what `buildLeaf` returns): origin at the leaf's centre, +X from
 * the hinge edge toward the latch edge, +Y up, +Z its left normal. The body is
 * symmetric through its thickness; only the hinge knuckles (`hingeFace`, the
 * face the leaf swings toward) and an entry pull bar (`outsideFace`) pick a
 * face. The leaf spans
 * x in [-W/2, W/2], y in [-H/2, H/2], z in [-T/2, T/2].
 *
 * UVs are in METRES in that frame, so a texture keeps its physical size on any
 * door, and every part lays its grain the way a joiner would: up the stiles
 * and panels, across the rails. Parts cut from one sheet (a flush slab split
 * by grooves) share one projection, so the grain runs straight through.
 *
 * Nothing here is a scaled template: resizing a door re-runs the builder, so
 * stile widths, rail heights, groove pitch, hardware and bevels stay at their
 * real measurements (docs: done-furniture-factory parametric.md).
 */

/** `recess` is body material seen at the bottom of a narrow channel (a
 *  routed groove): the renderer has no AO, so it carries its own occlusion. */
export type Slot = "body" | "recess" | "glass" | "hardware" | "seal";
export type LeafParts = Partial<Record<Slot, THREE.BufferGeometry>>;

type Grain = "x" | "y";

// --- Primitive helpers ---------------------------------------------------------

/** Rewrite UVs as a metric box projection in the geometry's current space,
 *  choosing the plane by each vertex normal's dominant axis. `grain` is the
 *  axis the wood fibre runs along (U of every veneer tile). */
function metricUV(g: THREE.BufferGeometry, grain: Grain, ou = 0, ov = 0): THREE.BufferGeometry {
  const p = g.getAttribute("position");
  const n = g.getAttribute("normal");
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u: number, v: number;
    if (az >= ax && az >= ay) {
      [u, v] = grain === "y" ? [y, x] : [x, y];
    } else if (ax >= ay) {
      [u, v] = grain === "y" ? [y, z] : [z, y];
    } else {
      [u, v] = grain === "x" ? [x, z] : [z, x];
    }
    uv[i * 2] = u + ou;
    uv[i * 2 + 1] = v + ov;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Keep only position/normal/uv, non-indexed, so everything merges. */
function clean(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (!["position", "normal", "uv"].includes(k)) out.deleteAttribute(k);
  if (!out.getAttribute("normal")) out.computeVertexNormals();
  if (!out.getAttribute("uv")) out.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(out.getAttribute("position").count * 2), 2));
  return out;
}

/** Box with eased (rounded) edges, centred at (cx,cy,cz). `r` is the edge
 *  radius — 1.5-2 mm is a sanded arris; it is what catches the highlight that
 *  makes a part read as real joinery instead of a CG box. */
function ebox(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, grain: Grain, r = 0.0015, ou = 0, ov = 0) {
  const rr = Math.min(r, sx / 2 - 1e-4, sy / 2 - 1e-4, sz / 2 - 1e-4);
  const g = rr > 2e-4 ? new RoundedBoxGeometry(sx, sy, sz, 2, rr) : new THREE.BoxGeometry(sx, sy, sz);
  g.translate(cx, cy, cz);
  return clean(metricUV(g, grain, ou, ov));
}

// Curved hardware keeps its NATIVE UVs (around x along): a box projection
// flips at every plane change, and the brushed-metal anisotropy and normal
// map build their tangent frame from UV derivatives, so each flip showed as a
// dark wedge. Native UVs are continuous and run the brushing along the part.
// Scaled to roughly metres so the brushed tile keeps its size.
function scaleUV(g: THREE.BufferGeometry, su: number, sv: number) {
  const uv = g.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

function cylinder(r: number, len: number, axis: "x" | "y" | "z", cx: number, cy: number, cz: number, seg = 24, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, len, seg, 1);
  scaleUV(g, 2 * Math.PI * r, len);
  if (axis === "x") g.rotateZ(-Math.PI / 2);
  if (axis === "z") g.rotateX(Math.PI / 2);
  g.translate(cx, cy, cz);
  return clean(g);
}

function sphere(r: number, cx: number, cy: number, cz: number) {
  const g = new THREE.SphereGeometry(r, 20, 14);
  scaleUV(g, 2 * Math.PI * r, Math.PI * r);
  g.translate(cx, cy, cz);
  return clean(g);
}

/** Swept round bar along a path, capped with a sphere at its free end. */
function tube(out: THREE.BufferGeometry[], pts: THREE.Vector3[], r: number) {
  const path = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  const g = new THREE.TubeGeometry(path, 48, r, 18, false);
  scaleUV(g, path.getLength(), 2 * Math.PI * r);
  out.push(clean(g));
  const end = pts[pts.length - 1];
  out.push(sphere(r, end.x, end.y, end.z));
}

/** Raised panel: a flat field whose border bevels down to a thin tongue — the
 *  classic fielded panel, as an extruded rectangle with a wide shallow bevel. */
function raisedPanel(cx: number, cy: number, w: number, h: number, tongue: number, raise: number, border: number) {
  const s = new THREE.Shape();
  const hw = w / 2 - border, hh = h / 2 - border;
  s.moveTo(-hw, -hh);
  s.lineTo(hw, -hh);
  s.lineTo(hw, hh);
  s.lineTo(-hw, hh);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: tongue,
    bevelEnabled: true,
    bevelThickness: raise,
    bevelSize: border,
    bevelSegments: 1,
    curveSegments: 1,
  });
  g.translate(cx, cy, -tongue / 2);
  g.computeVertexNormals();
  return clean(metricUV(g, "y"));
}

// --- Leaf ----------------------------------------------------------------------

interface Frame {
  stile: number; // stile width
  top: number; // top rail
  bottom: number; // bottom rail
  mid: number; // intermediate rails
}

function frameFor(design: DoorDesign, W: number): Frame {
  const clampStile = (s: number) => Math.min(s, W * 0.22);
  if (design === "glass-lites") return { stile: clampStile(0.065), top: 0.065, bottom: 0.1, mid: 0.028 };
  if (design === "raised-4") return { stile: clampStile(0.12), top: 0.12, bottom: 0.22, mid: 0.16 };
  return { stile: clampStile(0.11), top: 0.11, bottom: 0.2, mid: 0.09 };
}

const RECESS = 0.008; // flat panel sits 8 mm below the frame face, each side
const GROOVE_W = 0.006;
const GROOVE_D = 0.003;
const BEAD = 0.012; // glazing bead section
const GLASS_T = 0.006;

interface Acc {
  body: THREE.BufferGeometry[];
  recess: THREE.BufferGeometry[];
  glass: THREE.BufferGeometry[];
  hardware: THREE.BufferGeometry[];
  seal: THREE.BufferGeometry[];
}

/** Stiles + rails around `rows` openings (heights proportional to `weights`);
 *  returns each opening's rectangle so the caller can fill it. */
function stileAndRail(a: Acc, W: number, H: number, T: number, f: Frame, weights: number[]) {
  const x0 = -W / 2, x1 = W / 2, y0 = -H / 2, y1 = H / 2;
  // Stiles run full height (grain up); rails sit between them (grain across).
  a.body.push(ebox(x0 + f.stile / 2, 0, 0, f.stile, H, T, "y"));
  a.body.push(ebox(x1 - f.stile / 2, 0, 0, f.stile, H, T, "y", 0.0015, 0.37));
  const iw = W - 2 * f.stile;
  const cx = 0;
  a.body.push(ebox(cx, y1 - f.top / 2, 0, iw, f.top, T, "x", 0.0015, 0.21, 0.4));
  a.body.push(ebox(cx, y0 + f.bottom / 2, 0, iw, f.bottom, T, "x", 0.0015, 0.63, 0.1));
  const n = weights.length;
  const inner = H - f.top - f.bottom - (n - 1) * f.mid;
  const sum = weights.reduce((s, w) => s + w, 0);
  const cells: { cx: number; cy: number; w: number; h: number }[] = [];
  let y = y0 + f.bottom;
  for (let i = 0; i < n; i++) {
    const h = (inner * weights[i]) / sum;
    cells.push({ cx, cy: y + h / 2, w: iw, h });
    y += h;
    if (i < n - 1) {
      a.body.push(ebox(cx, y + f.mid / 2, 0, iw, f.mid, T, "x", 0.0015, 0.13 * i, 0.27 * i));
      y += f.mid;
    }
  }
  return cells;
}

function flatPanel(a: Acc, c: { cx: number; cy: number; w: number; h: number }, T: number, i: number) {
  a.body.push(ebox(c.cx, c.cy, 0, c.w + 0.004, c.h + 0.004, T - 2 * RECESS, "y", 0.001, 0.11 * i, 0.3));
}

/** Glass in an opening, held by beads on both faces. */
function glazedCell(a: Acc, c: { cx: number; cy: number; w: number; h: number }, T: number, beads = true) {
  a.glass.push(ebox(c.cx, c.cy, 0, c.w + 0.01, c.h + 0.01, GLASS_T, "y", 0));
  if (!beads) return;
  const depth = Math.min(BEAD, T / 2 - GLASS_T / 2);
  for (const s of [1, -1]) {
    const z = s * (GLASS_T / 2 + depth / 2);
    a.body.push(ebox(c.cx, c.cy + c.h / 2 - BEAD / 2, z, c.w, BEAD, depth, "x", 0.002));
    a.body.push(ebox(c.cx, c.cy - c.h / 2 + BEAD / 2, z, c.w, BEAD, depth, "x", 0.002));
    a.body.push(ebox(c.cx - c.w / 2 + BEAD / 2, c.cy, z, BEAD, c.h - 2 * BEAD, depth, "y", 0.002));
    a.body.push(ebox(c.cx + c.w / 2 - BEAD / 2, c.cy, z, BEAD, c.h - 2 * BEAD, depth, "y", 0.002));
  }
}

/** Flush slab with horizontal routed grooves on both faces. One veneer sheet:
 *  every strip shares the same projection, so grain runs through. */
function groovedSlab(a: Acc, W: number, H: number, T: number, pitch: number) {
  const n = Math.max(1, Math.round(H / pitch) - 1);
  const p = H / (n + 1);
  let y = -H / 2;
  for (let i = 0; i <= n; i++) {
    const top = i === n ? H / 2 : -H / 2 + p * (i + 1) - GROOVE_W / 2;
    const h = top - y;
    a.body.push(ebox(0, y + h / 2, 0, W, h, T, "y", i === 0 || i === n ? 0.002 : 0.0008));
    if (i < n) a.recess.push(ebox(0, top + GROOVE_W / 2, 0, W, GROOVE_W + 0.0004, T - 2 * GROOVE_D, "y", 0));
    y = top + GROOVE_W;
  }
}

/** Slab with a vertical glass slot near the latch stile. */
function slotSlab(a: Acc, W: number, H: number, T: number) {
  const sw = Math.min(0.12, W * 0.16);
  const sx = W / 2 - Math.min(0.17, W * 0.22) - sw / 2; // slot centre, latch side
  const m = Math.max(0.28, H * 0.13); // margin top/bottom
  const sy0 = -H / 2 + m, sy1 = H / 2 - m;
  const lw = sx - sw / 2 + W / 2; // left block width
  const rw = W / 2 - (sx + sw / 2);
  a.body.push(ebox(-W / 2 + lw / 2, 0, 0, lw, H, T, "y", 0.002));
  a.body.push(ebox(W / 2 - rw / 2, 0, 0, rw, H, T, "y", 0.002));
  a.body.push(ebox(sx, (H / 2 + sy1) / 2, 0, sw, H / 2 - sy1, T, "y", 0.002));
  a.body.push(ebox(sx, (-H / 2 + sy0) / 2, 0, sw, sy0 + H / 2, T, "y", 0.002));
  glazedCell(a, { cx: sx, cy: (sy0 + sy1) / 2, w: sw, h: sy1 - sy0 }, T, false);
  // Flush glazing: a thin dark gasket lines the cut instead of beads.
  const g = 0.003;
  a.seal.push(ebox(sx, 0.5 * (sy0 + sy1), 0, sw, g, T * 0.98, "x", 0).translate(0, (sy1 - sy0) / 2 - g / 2, 0));
  a.seal.push(ebox(sx, 0.5 * (sy0 + sy1), 0, sw, g, T * 0.98, "x", 0).translate(0, -(sy1 - sy0) / 2 + g / 2, 0));
  a.seal.push(ebox(sx - sw / 2 + g / 2, 0.5 * (sy0 + sy1), 0, g, sy1 - sy0, T * 0.98, "y", 0));
  a.seal.push(ebox(sx + sw / 2 - g / 2, 0.5 * (sy0 + sy1), 0, g, sy1 - sy0, T * 0.98, "y", 0));
}

function buildBody(a: Acc, design: DoorDesign, W: number, H: number, T: number) {
  const f = frameFor(design, W);
  switch (design) {
    case "flush":
    case "entry-slab":
      a.body.push(ebox(0, 0, 0, W, H, T, "y", 0.002));
      return;
    case "flush-grooves":
      groovedSlab(a, W, H, T, 0.2);
      return;
    case "entry-grooves":
      groovedSlab(a, W, H, T, 0.16);
      return;
    case "glass-slot":
    case "entry-slot":
      slotSlab(a, W, H, T);
      return;
    case "shaker":
      stileAndRail(a, W, H, T, f, [1]).forEach((c, i) => flatPanel(a, c, T, i));
      return;
    case "shaker-3":
      stileAndRail(a, W, H, T, f, [1, 1, 1]).forEach((c, i) => flatPanel(a, c, T, i));
      return;
    case "panel-5":
      stileAndRail(a, W, H, T, f, [1, 1, 1, 1, 1]).forEach((c, i) => flatPanel(a, c, T, i));
      return;
    case "raised-4": {
      // Two rows of two: a centre muntin splits each row. Top row shorter.
      const cells = stileAndRail(a, W, H, T, f, [0.8, 1.2]);
      for (const c of cells) {
        const mw = f.stile * 0.9;
        a.body.push(ebox(c.cx, c.cy, 0, mw, c.h + 0.002, T, "y", 0.0015, 0.5));
        const pw = (c.w - mw) / 2;
        for (const s of [-1, 1]) {
          const px = c.cx + s * (mw / 2 + pw / 2);
          a.body.push(raisedPanel(px, c.cy, pw + 0.004, c.h + 0.004, T - 2 * 0.012 - 0.008, 0.004, Math.min(0.045, pw * 0.2)));
        }
      }
      return;
    }
    case "glass-full":
      stileAndRail(a, W, H, T, f, [1]).forEach((c) => glazedCell(a, c, T));
      return;
    case "glass-lites":
      stileAndRail(a, W, H, T, f, [1, 1, 1, 1]).forEach((c) => glazedCell(a, c, T, false));
      return;
  }
}

// --- Hardware ------------------------------------------------------------------

const HANDLE_BACKSET = 0.06; // spindle 60 mm in from the latch edge
export const HANDLE_HEIGHT = 1.05; // spindle height above the floor

/** Round lever: rose, neck, then a swept bar turning toward the hinge. */
function leverRound(out: THREE.BufferGeometry[], x: number, y: number, z0: number, s: 1 | -1) {
  out.push(cylinder(0.026, 0.008, "z", x, y, z0 + s * 0.004, 32, 0.025));
  tube(out, [
    new THREE.Vector3(x, y, z0 + s * 0.006),
    new THREE.Vector3(x, y, z0 + s * 0.04),
    new THREE.Vector3(x - 0.012, y, z0 + s * 0.058),
    new THREE.Vector3(x - 0.05, y, z0 + s * 0.064),
    new THREE.Vector3(x - 0.14, y, z0 + s * 0.064),
  ], 0.0095);
}

/** Square lever: flat square rose, square neck, flat bar — crisp modern. */
function leverSquare(out: THREE.BufferGeometry[], x: number, y: number, z0: number, s: 1 | -1) {
  out.push(ebox(x, y, z0 + s * 0.004, 0.052, 0.052, 0.008, "x", 0.0015));
  out.push(ebox(x, y, z0 + s * 0.033, 0.016, 0.016, 0.05, "x", 0.002));
  out.push(ebox(x - 0.062, y, z0 + s * 0.058, 0.14, 0.016, 0.012, "x", 0.003));
}

function leverPlate(out: THREE.BufferGeometry[], x: number, y: number, z0: number, s: 1 | -1) {
  out.push(ebox(x, y - 0.035, z0 + s * 0.0045, 0.046, 0.24, 0.009, "y", 0.004));
  tube(out, [
    new THREE.Vector3(x, y, z0 + s * 0.008),
    new THREE.Vector3(x, y, z0 + s * 0.04),
    new THREE.Vector3(x - 0.015, y, z0 + s * 0.056),
    new THREE.Vector3(x - 0.13, y, z0 + s * 0.058),
  ], 0.0085);
}

function knob(out: THREE.BufferGeometry[], x: number, y: number, z0: number, s: 1 | -1) {
  // Lathe profile (radius, height-out): rose, waisted neck, full knob.
  const pts = [
    [0.0001, 0], [0.027, 0], [0.027, 0.006], [0.011, 0.012], [0.009, 0.03],
    [0.02, 0.04], [0.027, 0.055], [0.026, 0.068], [0.016, 0.077], [0.0001, 0.079],
  ].map(([r, h]) => new THREE.Vector2(r, h));
  const g = new THREE.LatheGeometry(pts, 36);
  scaleUV(g, 0.17, 0.1);
  g.rotateX(s * Math.PI / 2); // lathe axis (+Y) -> +/-Z
  g.translate(x, y, z0);
  out.push(clean(g));
}

/** Long pull bar on two stand-offs, centred on the latch stile. */
function pullBar(out: THREE.BufferGeometry[], x: number, H: number, yMid: number, z0: number, s: 1 | -1) {
  const len = Math.min(1.2, H * 0.55);
  const r = 0.016;
  const off = 0.065; // bar centre stand-off from the face
  out.push(cylinder(r, len, "y", x, yMid, z0 + s * off, 32));
  for (const e of [-1, 1]) {
    const yy = yMid + e * (len / 2 - 0.12);
    out.push(cylinder(0.0095, off, "z", x, yy, z0 + (s * off) / 2, 20));
    out.push(cylinder(0.02, 0.006, "z", x, yy, z0 + s * 0.003, 24));
  }
  // End caps: the tube is open-ended.
  out.push(cylinder(r, 0.002, "y", x, yMid + len / 2, z0 + s * off, 32));
  out.push(cylinder(r, 0.002, "y", x, yMid - len / 2, z0 + s * off, 32));
}

/** Recessed finger pull for sliding leaves: metal rim, dark cup. */
function flushPull(out: THREE.BufferGeometry[], seal: THREE.BufferGeometry[], x: number, y: number, z0: number, s: 1 | -1) {
  const w = 0.03, h = 0.16, rim = 0.004;
  const z = z0 - s * 0.0005;
  out.push(ebox(x, y + h / 2 - rim / 2, z, w, rim, 0.004, "x", 0.001));
  out.push(ebox(x, y - h / 2 + rim / 2, z, w, rim, 0.004, "x", 0.001));
  out.push(ebox(x - w / 2 + rim / 2, y, z, rim, h, 0.004, "y", 0.001));
  out.push(ebox(x + w / 2 - rim / 2, y, z, rim, h, 0.004, "y", 0.001));
  seal.push(ebox(x, y, z0 - s * 0.006, w - 2 * rim, h - 2 * rim, 0.004, "y", 0));
}

/** Euro-cylinder escutcheon (key lock), for entry doors. */
function escutcheon(out: THREE.BufferGeometry[], seal: THREE.BufferGeometry[], x: number, y: number, z0: number, s: 1 | -1) {
  out.push(cylinder(0.024, 0.008, "z", x, y, z0 + s * 0.004, 32, 0.023));
  seal.push(ebox(x, y - 0.003, z0 + s * 0.0085, 0.009, 0.02, 0.001, "y", 0));
}

function addHandle(a: Acc, id: HandleId, W: number, H: number, T: number, yLocal: number, face: 1 | -1) {
  const x = W / 2 - HANDLE_BACKSET;
  const z0 = face * (T / 2);
  switch (id) {
    case "lever-round": leverRound(a.hardware, x, yLocal, z0, face); break;
    case "lever-square": leverSquare(a.hardware, x, yLocal, z0, face); break;
    case "lever-plate": leverPlate(a.hardware, x, yLocal, z0, face); break;
    case "knob": knob(a.hardware, x, yLocal, z0, face); break;
    case "pull-bar": pullBar(a.hardware, W / 2 - 0.1, H, yLocal + 0.05, z0, face); break;
    case "flush-pull": flushPull(a.hardware, a.seal, W / 2 - 0.06, yLocal, z0, face); break;
    case "none": break;
  }
}

/** Butt hinges on the hinge edge; the knuckle shows on the swing face. */
function hinges(a: Acc, W: number, H: number, T: number, entry: boolean, face: 1 | -1) {
  const ys = [H / 2 - 0.18, -H / 2 + 0.25];
  if (entry || H > 2.05) ys.push((ys[0] + ys[1]) / 2);
  const len = entry ? 0.12 : 0.1;
  const r = entry ? 0.0085 : 0.0075;
  for (const y of ys) {
    const z = (face * T) / 2;
    a.hardware.push(cylinder(r, len, "y", -W / 2, y, z, 20));
    a.hardware.push(cylinder(r * 0.55, 0.006, "y", -W / 2, y + len / 2 + 0.003, z, 12));
    a.hardware.push(cylinder(r * 0.55, 0.006, "y", -W / 2, y - len / 2 - 0.003, z, 12));
  }
}

export interface LeafOptions {
  /** Leaf size in metres (as buildJoinery sizes it). */
  W: number;
  H: number;
  T: number;
  /** Spindle height in the leaf frame (HANDLE_HEIGHT above the floor). */
  handleY: number;
  /** Sliding leaf: recessed pull, no hinges. */
  sliding?: boolean;
  /** Entry door: extra hinge, key escutcheon. */
  entry?: boolean;
  /** Face (+1 swing face, -1 other) that is OUTSIDE, for an entry door; 0 =
   *  unknown/interior. The pull bar goes outside, a lever inside. */
  outsideFace?: -1 | 0 | 1;
  /** Face the knuckles show on: the face the leaf swings toward. */
  hingeFace?: 1 | -1;
  /** Hide hinges (concealed hinges on a "minimal" trim door). */
  concealedHinges?: boolean;
}

function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry | undefined {
  if (list.length === 0) return undefined;
  const g = mergeGeometries(list, false);
  for (const x of list) x.dispose();
  return g ?? undefined;
}

export function buildLeaf(look: DoorLook, o: LeafOptions): LeafParts {
  const a: Acc = { body: [], recess: [], glass: [], hardware: [], seal: [] };
  const { W, H, T } = o;
  if (W < 0.05 || H < 0.2) return {};
  buildBody(a, look.design, W, H, T);

  const y = Math.min(H / 2 - 0.15, Math.max(-H / 2 + 0.3, o.handleY));
  if (o.sliding) {
    for (const f of [1, -1] as const) addHandle(a, "flush-pull", W, H, T, y, f);
  } else {
    for (const f of [1, -1] as const) {
      let id = look.handle;
      if (id === "flush-pull") id = "lever-square"; // a hinged leaf needs a latch
      // Entry pull bar: outside only when we know which face that is; the
      // inside gets a lever to work the latch.
      if (id === "pull-bar" && o.outsideFace && f !== o.outsideFace) id = "lever-square";
      addHandle(a, id, W, H, T, y, f);
      if (o.entry) escutcheon(a.hardware, a.seal, W / 2 - HANDLE_BACKSET, y - 0.085, f * (T / 2), f);
    }
    if (!o.concealedHinges) hinges(a, W, H, T, !!o.entry, o.hingeFace ?? 1);
  }
  return { body: merge(a.body), recess: merge(a.recess), glass: merge(a.glass), hardware: merge(a.hardware), seal: merge(a.seal) };
}

// --- Trim (casing, stop, lining) -----------------------------------------------

/**
 * TRIM FRAME: wall-local. Origin at the wall's node a, +X along the wall,
 * +Y up, +Z the wall's left normal (-uy, ux). The opening's rough hole spans
 * s in [start, end], y in [0, top]; the wall faces are at z = +/- faceZ.
 */
export interface TrimOptions {
  start: number;
  end: number;
  top: number;
  faceZ: number;
  /** Jamb lining member width (buildJoinery FRAME_W). */
  lining: number;
  /** Which face the leaf swings toward (+1/-1); the stop sits on the other. */
  swingZ: 1 | -1;
  leafT: number;
  /** Wall-local |Z| of the closed leaf's swing face (it hangs flush there). */
  leafFaceZ: number;
  trim: TrimId;
  /** Door stop on the lining (swing doors). */
  stop?: boolean;
}

/** One mitred casing ring on a face: jambs + head, as extruded trapezoids. */
function casingRing(out: THREE.BufferGeometry[], s0: number, s1: number, top: number, w: number, t: number, zFace: number, dir: 1 | -1, bevel: number) {
  const members: [number, number][][] = [
    [[s0 - w, 0], [s0, 0], [s0, top], [s0 - w, top + w]], // left jamb
    [[s1, 0], [s1 + w, 0], [s1 + w, top + w], [s1, top]], // right jamb
    [[s0 - w, top + w], [s0, top], [s1, top], [s1 + w, top + w]], // head
  ];
  members.forEach((pts, i) => {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(sh, {
      depth: Math.max(0.001, t - 2 * bevel),
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 1,
    });
    // Extruded along +Z over [0, t] (the bevel pads both ends); the profile
    // is symmetric through its thickness, so the back face just shifts.
    g.translate(0, 0, bevel + (dir > 0 ? zFace : zFace - t));
    g.computeVertexNormals();
    out.push(clean(metricUV(g, i === 2 ? "x" : "y")));
  });
}

export function buildTrim(o: TrimOptions): THREE.BufferGeometry | undefined {
  const out: THREE.BufferGeometry[] = [];
  const { start, end, top, faceZ, lining } = o;
  const s0 = start + lining - 0.004; // 4 mm reveal onto the lining
  const s1 = end - lining + 0.004;
  const t0 = top - lining + 0.004;
  if (o.trim !== "minimal") {
    for (const dir of [1, -1] as const) {
      const z = dir * faceZ;
      if (o.trim === "flat") casingRing(out, s0, s1, t0, 0.07, 0.016, z, dir, 0.002);
      if (o.trim === "stepped") {
        casingRing(out, s0, s1, t0, 0.075, 0.012, z, dir, 0.0015);
        casingRing(out, s0, s1, t0, 0.035, 0.02, z, dir, 0.0015);
      }
      if (o.trim === "classic") {
        casingRing(out, s0, s1, t0, 0.08, 0.014, z, dir, 0.002);
        casingRing(out, s0 - 0.062, s1 + 0.062, t0 + 0.062, 0.022, 0.024, z, dir, 0.003); // back band
        casingRing(out, s0, s1, t0, 0.018, 0.019, z, dir, 0.003); // inner bead
      }
    }
  }
  // Door stop: 12 mm strip on the lining, just behind the closed leaf's
  // back face (the leaf hangs flush on its swing side, so its back face is
  // leafT further in), so the leaf has something to close against.
  if (o.stop === false) return merge(out);
  const stopD = 0.012, stopW = 0.035;
  const back = o.leafFaceZ - o.leafT - 0.002; // gap to the leaf's back face
  const zc = o.swingZ * (back - stopW / 2);
  const js0 = start + lining, js1 = end - lining, jt = top - lining;
  out.push(ebox(js0 + stopD / 2, jt / 2, zc, stopD, jt, stopW, "y", 0.001));
  out.push(ebox(js1 - stopD / 2, jt / 2, zc, stopD, jt, stopW, "y", 0.001));
  out.push(ebox((js0 + js1) / 2, jt - stopD / 2, zc, js1 - js0 - 2 * stopD, stopD, stopW, "x", 0.001));
  return merge(out);
}

/** Jamb lining boxes (the same placement buildJoinery's frame pieces use) but
 *  with metric UVs, so a wood trim's grain runs up the jambs and doesn't
 *  stretch. Frame: wall-local, as `buildTrim`. */
export function buildLining(start: number, end: number, top: number, depth: number, lining: number): THREE.BufferGeometry | undefined {
  const out: THREE.BufferGeometry[] = [];
  out.push(ebox(start + lining / 2, top / 2, 0, lining, top, depth, "y", 0.001));
  out.push(ebox(end - lining / 2, top / 2, 0, lining, top, depth, "y", 0.001));
  out.push(ebox((start + end) / 2, top - lining / 2, 0, end - start, lining, depth, "x", 0.001));
  return merge(out);
}
