// Shared furniture and fittings for the navArt rooms, all in the kit's world
// (cm, back wall at y=0 facing +y, side wall at x=0 facing +x). Each prop
// draws itself back-to-front; the ROOM decides the order between props.
//
// Wall-mounted props take a `wall`: "back" hangs on the y=0 wall with `a`
// running along x; "side" hangs on the x=0 wall with `a` running along y.

import type { Kit, P2, P3 } from "./kit";

export type Wall = "back" | "side";
/** A point on a wall: `a` along the wall, `off` out from it, `z` up. */
const onWall = (wall: Wall, a: number, off: number, z: number): P3 => (wall === "back" ? [a, off, z] : [off, a, z]);
const plane = (wall: Wall) => (wall === "back" ? "y" : "x") as "y" | "x";

/** Room shell: floor slab (the "floor" hotspot), then the two cut walls,
 *  skirting and a soft corner line. Leaves the kit in a deco group. */
export function shell(g: Kit, o: { back: number; side: number; floor: "tiles" | "planks" | "concrete"; wallH?: number; sideWall?: boolean }) {
  const t = g.t, H = o.wallH ?? 230, B = o.back, S = o.side;
  g.hot("floor");
  g.slab(0, 0, B, S, 6, o.floor);
  g.deco();
  g.poly3([[-12, 0, 0], [B, 0, 0], [B, 0, H], [-12, 0, H]], { fill: "ink", fop: t.wall, stroke: "faint" });
  g.poly3([[-12, -12, H], [B, -12, H], [B, 0, H], [-12, 0, H]], { fill: "ink", fop: t.cut, stroke: "sil", solid: true });
  g.poly3([[B, -12, 0], [B, 0, 0], [B, 0, H], [B, -12, H]], { fill: "ink", fop: t.cut * 0.7, stroke: "det", solid: true });
  if (o.sideWall !== false) {
    g.poly3([[0, 0, 0], [0, S, 0], [0, S, H], [0, 0, H]], { fill: "ink", fop: t.wall * 1.35, stroke: "faint" });
    g.poly3([[-12, -12, H], [0, -12, H], [0, S, H], [-12, S, H]], { fill: "ink", fop: t.cut, stroke: "sil", solid: true });
    g.poly3([[-12, S, 0], [0, S, 0], [0, S, H], [-12, S, H]], { fill: "ink", fop: t.cut * 0.8, stroke: "det", solid: true });
    g.line3([0, 0, 0], [0, 0, H], { stroke: "faint" });
    g.line3([0, 0, 8], [0, S, 8], { stroke: "faint" });
  }
  g.line3([0, 0, 8], [B, 0, 8], { stroke: "faint" });
}

/** A window set into the back wall: glass, reveal, sill, glazing bars. */
export function backWindow(g: Kit, x0: number, x1: number, z0: number, z1: number, o: { frosted?: boolean; mullions?: number } = {}) {
  const t = g.t;
  g.poly3([[x0, -10, z0], [x1, -10, z0], [x1, -10, z1], [x0, -10, z1]], { fill: "ink", fop: t.glass * (o.frosted ? 0.55 : 0.3), stroke: "det" });
  if (!o.frosted) {
    g.line3([x0 + 6, -10, z1 - 4], [x0 + 18, -10, z1 - 34], { stroke: 0.14, sw: 1.4 });
    g.line3([x0 + 14, -10, z1 - 4], [x0 + 26, -10, z1 - 34], { stroke: 0.14, sw: 1.4 });
  }
  g.poly3([[x0, -10, z0], [x1, -10, z0], [x1, 0, z0], [x0, 0, z0]], { fill: "ink", fop: t.top, stroke: "det", solid: true });
  g.poly3([[x0, -10, z0], [x0, 0, z0], [x0, 0, z1], [x0, -10, z1]], { fill: "ink", fop: t.right * 1.3, stroke: "det", solid: true });
  g.path(g.rect3("y", -9.5, x0 + 2, z0 + 2, x1 - 2, z1 - 2), { stroke: "det", sw: 1.1 });
  const n = o.mullions ?? 1;
  for (let i = 1; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / (n + 1);
    g.line3([x, -9.5, z0 + 2], [x, -9.5, z1 - 2], { stroke: "det", sw: 1.1 });
  }
  g.box(x0 - 4, -10, z0 - 4, x1 - x0 + 8, 14, 4, { tone: 1.2, ao: false });
}

/** Framed print. `motif` gives each room its own picture. */
export function art(g: Kit, wall: Wall, a0: number, z0: number, w: number, h: number, motif: "hills" | "sprig" | "circle" | "boat" | "grid" | "kite" = "hills") {
  const t = g.t, P = (a: number, z: number, off = 3.3) => onWall(wall, a, off, z);
  if (wall === "back") g.box(a0, 0, z0, w, 3, h, { tone: 1.1, ao: false });
  else g.box(0, a0, z0, 3, w, h, { tone: 1.1, ao: false });
  const m = Math.min(w, h) * 0.1, pl = plane(wall);
  g.path(g.rect3(pl, 3.1, a0 + 2, z0 + 2, a0 + w - 2, z0 + h - 2), { fill: "ink", fop: t.top * 1.4, stroke: "faint" });
  const ia0 = a0 + m + 2, ia1 = a0 + w - m - 2, iz0 = z0 + m + 2, iz1 = z0 + h - m - 2, iw = ia1 - ia0, ih = iz1 - iz0;
  g.path(g.rect3(pl, 3.2, ia0, iz0, ia1, iz1), { fill: "shade", fop: t.recess * 0.45, stroke: "faint" });
  const at = (u: number, v: number) => P(ia0 + u * iw, iz0 + v * ih);
  if (motif === "hills") {
    g.curve3([at(0, 0.3), at(0.2, 0.55), at(0.35, 0.42), at(0.55, 0.7), at(0.75, 0.48), at(1, 0.6)], { stroke: "det" });
    g.path(g.circle3(pl, 3.3, ia0 + iw * 0.75, iz0 + ih * 0.8, Math.min(iw, ih) * 0.08, 14), { stroke: "det" });
  } else if (motif === "sprig") {
    g.curve3([at(0.5, 0.08), at(0.5, 0.9)], { stroke: "det", sw: 0.8 });
    for (const [v, d] of [[0.3, -1], [0.45, 1], [0.6, -1], [0.75, 1]]) g.curve3([at(0.5, v), at(0.5 + d * 0.22, v + 0.1), at(0.5 + d * 0.3, v + 0.05)], { stroke: "det", sw: 0.7 });
  } else if (motif === "circle") {
    g.path(g.circle3(pl, 3.3, ia0 + iw * 0.45, iz0 + ih * 0.55, Math.min(iw, ih) * 0.28, 28), { fill: "ink", fop: t.top * 1.6, stroke: "det" });
    g.curve3([at(0.1, 0.2), at(0.9, 0.2)], { stroke: "det", sw: 0.8 });
  } else if (motif === "boat") {
    g.curve3([at(0.2, 0.3), at(0.8, 0.3), at(0.7, 0.2), at(0.3, 0.2), at(0.2, 0.3)], { stroke: "det" });
    g.curve3([at(0.5, 0.3), at(0.5, 0.85), at(0.75, 0.35), at(0.5, 0.35)], { stroke: "det" });
    g.curve3([at(0, 0.15), at(0.3, 0.12), at(0.6, 0.17), at(1, 0.14)], { stroke: "faint" });
  } else if (motif === "grid") {
    for (const u of [0.33, 0.66]) g.curve3([at(u, 0), at(u, 1)], { stroke: "faint" });
    for (const v of [0.5]) g.curve3([at(0, v), at(1, v)], { stroke: "faint" });
    g.path(g.rect3(pl, 3.3, ia0 + iw * 0.36, iz0 + ih * 0.54, ia0 + iw * 0.63, iz0 + ih * 0.96), { fill: "ink", fop: t.top * 1.8, stroke: null });
  } else {
    // kite: a child's drawing — sun, house
    g.path(g.circle3(pl, 3.3, ia0 + iw * 0.78, iz0 + ih * 0.78, Math.min(iw, ih) * 0.12, 14), { stroke: "det" });
    g.curve3([at(0.15, 0.05), at(0.15, 0.4), at(0.35, 0.62), at(0.55, 0.4), at(0.55, 0.05)], { stroke: "det" });
  }
}

/** Round wall clock, face out from the wall. */
export function clock(g: Kit, wall: Wall, a: number, z: number, r: number) {
  const t = g.t, pl = plane(wall);
  g.path(g.circle3(pl, 0.5, a, z, r, 48), { fill: "ink", fop: t.top * 1.2, stroke: "sil", solid: true });
  g.path(g.circle3(pl, 3, a, z, r * 0.87, 48), { fill: "shade", fop: t.recess * 0.22, stroke: "det" });
  for (let i = 0; i < 12; i++) {
    const q = (i / 12) * Math.PI * 2, r0 = r * (i % 3 === 0 ? 0.6 : 0.72);
    g.line3(onWall(wall, a + Math.cos(q) * r0, 3.1, z + Math.sin(q) * r0), onWall(wall, a + Math.cos(q) * r * 0.8, 3.1, z + Math.sin(q) * r * 0.8), { stroke: "det", sw: i % 3 === 0 ? 0.8 : 0.45 });
  }
  g.line3(onWall(wall, a, 3.2, z), onWall(wall, a, 3.2, z + r * 0.58), { stroke: "sil", sw: 1.1 });
  g.line3(onWall(wall, a, 3.2, z), onWall(wall, a + r * 0.4, 3.2, z - r * 0.2), { stroke: "sil", sw: 1.1 });
  g.path(g.circle3(pl, 3.3, a, z, 1.6, 12), { fill: "ink", fop: t.sil, stroke: null });
}

/** Wall-mounted flat TV, dark screen with a sheen line. */
export function tv(g: Kit, wall: Wall, a0: number, z0: number, w: number, h: number) {
  const t = g.t, pl = plane(wall);
  if (wall === "back") g.box(a0, 0, z0, w, 4, h, { tone: 1.3, ao: false });
  else g.box(0, a0, z0, 4, w, h, { tone: 1.3, ao: false });
  g.path(g.rect3(pl, 4.1, a0 + 1.5, z0 + 1.5, a0 + w - 1.5, z0 + h - 1.5), { fill: "shade", fop: t.recess * 1.5, stroke: "det" });
  g.line3(onWall(wall, a0 + w * 0.12, 4.2, z0 + h - 4), onWall(wall, a0 + w * 0.3, 4.2, z0 + 5), { stroke: 0.12, sw: 1.3 });
  g.line3(onWall(wall, a0 + w * 0.2, 4.2, z0 + h - 4), onWall(wall, a0 + w * 0.36, 4.2, z0 + 10), { stroke: 0.08, sw: 0.9 });
}

/** Leaves fanned out of a pot, drawn as filled blades in screen space. */
function leaves(g: Kit, cx: number, cy: number, z: number, h: number, n: number, spread: number) {
  const t = g.t;
  for (let i = 0; i < n; i++) {
    const q = -Math.PI / 2 + ((i + 0.5) / n - 0.5) * Math.PI * 1.5;
    const k = 0.65 + ((i * 37) % 10) / 28;
    const tip = g.P(cx + Math.cos(q) * spread * k, cy + Math.sin(q) * spread * 0.4 * k, z + h * k * (0.6 + 0.4 * Math.abs(Math.cos(q * 0.5))));
    const base = g.P(cx + Math.cos(q) * 2, cy, z);
    const mx = (base[0] + tip[0]) / 2, my = (base[1] + tip[1]) / 2;
    const dx = tip[0] - base[0], dy = tip[1] - base[1], len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * len * 0.16, ny = (dx / len) * len * 0.16;
    const pts: P2[] = [base, [mx + nx, my + ny], tip, [mx - nx, my - ny]];
    g.path(g.d(pts), { fill: "ink", fop: t.left * (1.5 + (i % 3) * 0.25), stroke: "det", solid: true, sw: 0.4 });
    g.path(g.d([base, tip], false), { stroke: "faint", sw: 0.3 });
  }
}

/** Potted plant: a tapered pot and a fan of leaves. `spread` defaults to
 *  the pot's width; pass it for plants set in a planter (no pot of their own). */
export function plant(g: Kit, cx: number, cy: number, z0: number, potR: number, potH: number, h: number, n = 9, spread = potR * 2.2) {
  if (potH > 0) g.cyl(cx, cy, z0, potH, potR * 0.8, potR, { topFop: g.t.recess * 0.8 });
  leaves(g, cx, cy, z0 + potH, h, n, spread);
}

/** Table lamp: foot, stem, drum shade. */
export function tableLamp(g: Kit, cx: number, cy: number, z0: number, s = 1) {
  g.cyl(cx, cy, z0, 3 * s, 7 * s, 7 * s);
  g.cyl(cx, cy, z0 + 3 * s, 22 * s, 1.2 * s, 1.2 * s);
  g.cyl(cx, cy, z0 + 22 * s, 20 * s, 15 * s, 11 * s, { fop: g.t.left * 2.1, topFop: g.t.top * 1.6 });
}

/** Floor lamp: disc base, pole, drum shade. */
export function floorLamp(g: Kit, cx: number, cy: number, h = 160) {
  g.cyl(cx, cy, 0, 3, 14, 14);
  g.cyl(cx, cy, 3, h - 30, 1.5, 1.5);
  g.cyl(cx, cy, h - 32, 32, 22, 16, { fop: g.t.left * 2.1, topFop: g.t.top * 1.6 });
}

/** Rug on the floor: body, inner border, and a pattern. */
export function rug(g: Kit, x0: number, y0: number, x1: number, y1: number, pattern: "stripes" | "border" | "dots" = "border", fringe = true) {
  const t = g.t;
  g.poly3([[x0, y0, 0.3], [x1, y0, 0.3], [x1, y1, 0.3], [x0, y1, 0.3]], { fill: "ink", fop: t.top * 1.3, stroke: "det", solid: true });
  g.poly3([[x0 + 7, y0 + 7, 0.4], [x1 - 7, y0 + 7, 0.4], [x1 - 7, y1 - 7, 0.4], [x0 + 7, y1 - 7, 0.4]], { stroke: "faint" });
  if (pattern === "stripes") for (let x = x0 + 18; x < x1 - 12; x += 14) g.line3([x, y0 + 7, 0.45], [x, y1 - 7, 0.45], { stroke: "faint", sw: 0.35 });
  else if (pattern === "dots") {
    for (let x = x0 + 22; x < x1 - 12; x += 22) for (let y = y0 + 20; y < y1 - 12; y += 20) g.ellipseZ(x, y, 0.45, 3, { fill: "ink", fop: t.top * 1.2, stroke: null });
  } else g.poly3([[x0 + 15, y0 + 15, 0.45], [x1 - 15, y0 + 15, 0.45], [x1 - 15, y1 - 15, 0.45], [x0 + 15, y1 - 15, 0.45]], { stroke: "faint" });
  if (fringe) for (let y = y0 + 3; y < y1; y += 4) {
    g.line3([x0, y, 0.4], [x0 - 4, y, 0.4], { stroke: "faint", sw: 0.3 });
    g.line3([x1, y, 0.4], [x1 + 4, y, 0.4], { stroke: "faint", sw: 0.3 });
  }
}

/** Round rug. */
export function roundRug(g: Kit, cx: number, cy: number, r: number) {
  const t = g.t;
  g.ellipseZ(cx, cy, 0.3, r, { fill: "ink", fop: t.top * 1.3, stroke: "det", solid: true });
  g.ellipseZ(cx, cy, 0.4, r * 0.8, { stroke: "faint" });
  g.ellipseZ(cx, cy, 0.45, r * 0.5, { stroke: "faint" });
}

/** Four-legged table, top last. */
export function table(g: Kit, x0: number, y0: number, w: number, d: number, h: number, o: { leg?: number; tone?: number; inset?: number } = {}) {
  const L = o.leg ?? 4, i = o.inset ?? 4, top = 4;
  for (const [x, y] of [[x0 + i, y0 + i], [x0 + w - i - L, y0 + i], [x0 + i, y0 + d - i - L], [x0 + w - i - L, y0 + d - i - L]])
    g.box(x, y, 0, L, L, h - top, { tone: 1.2, ao: false });
  g.box(x0, y0, h - top, w, d, top, { tone: o.tone ?? 1.35, ao: false });
}

export type Facing = "+y" | "-y" | "+x" | "-x";
/** Dining/desk chair: legs, seat, backrest; `facing` is where a sitter looks. */
export function chair(g: Kit, x0: number, y0: number, facing: Facing, o: { w?: number; seat?: number; back?: number; tone?: number } = {}) {
  const W = o.w ?? 44, SZ = o.seat ?? 45, BZ = o.back ?? 88, k = o.tone ?? 1.3, L = 3;
  const x1 = x0 + W, y1 = y0 + W;
  const legs = () => {
    for (const [x, y] of [[x0 + 2, y0 + 2], [x1 - 2 - L, y0 + 2], [x0 + 2, y1 - 2 - L], [x1 - 2 - L, y1 - 2 - L]]) g.box(x, y, 0, L, L, SZ - 4, { tone: 1.2, ao: false });
  };
  const seat = () => g.box(x0, y0, SZ - 4, W, W, 4, { tone: k, ao: false });
  const back = () => {
    if (facing === "+y") g.box(x0, y0, SZ, W, 3, BZ - SZ, { tone: k, ao: false });
    else if (facing === "-y") g.box(x0, y1 - 3, SZ, W, 3, BZ - SZ, { tone: k, ao: false });
    else if (facing === "+x") g.box(x0, y0, SZ, 3, W, BZ - SZ, { tone: k, ao: false });
    else g.box(x1 - 3, y0, SZ, 3, W, BZ - SZ, { tone: k, ao: false });
  };
  legs();
  // the backrest on the far side paints before the seat, on the near side after
  if (facing === "+y" || facing === "+x") {
    back();
    seat();
  } else {
    seat();
    back();
  }
}

/** A row of books standing on a shelf, spines facing +y (or +x on the side wall). */
export function books(g: Kit, wall: Wall, a0: number, a1: number, z: number, depth: number, maxH: number, seed = 1) {
  let a = a0, i = seed;
  while (a < a1 - 3) {
    const w = 2.5 + ((i * 7) % 5) * 0.8, h = maxH * (0.7 + ((i * 13) % 9) / 30), tone = 1.3 + ((i * 5) % 7) / 10;
    if (a + w > a1) break;
    if (i % 11 === 5) {
      a += 5; // a gap
    } else if (wall === "back") g.box(a, 2, z, w, depth - 4, h, { tone, edge: "faint", ao: false, sil: false });
    else g.box(2, a, z, depth - 4, w, h, { tone, edge: "faint", ao: false, sil: false });
    a += w + 0.4;
    i++;
  }
}

/** Open bookcase against the back wall, `shelves` levels with books. */
export function bookcase(g: Kit, x0: number, w: number, d: number, h: number, shelves: number, seed = 3) {
  const t = g.t;
  g.box(x0, 0, 0, w, d, h, { tone: 1.1 });
  // hollow front: the recess and the shelf edges
  const step = (h - 10) / shelves;
  g.path(g.rect3("y", d + 0.05, x0 + 3, 6, x0 + w - 3, h - 3), { fill: "shade", fop: t.recess * 0.8, stroke: "det" });
  for (let i = 0; i < shelves; i++) {
    const z = 6 + i * step;
    g.box(x0 + 3, 0, z, w - 6, d, 2.5, { tone: 1.25, ao: false, sil: false });
    books(g, "back", x0 + 5, x0 + w - 5, z + 2.5, d - 2, step * 0.72, seed + i * 3);
  }
}
