// Navigator scene kit (round 4, 2026-09-30): the drawing kit Dan approved the
// two-wall kitchen corner in, ported from floorplan-3d-refs/navigator-plan-r4/
// kit.js. Monochrome: ONE ink colour at varying strength, no hue (Dan: "no
// colour at all"). Object faces are SOLID paper↔ink mixes; only walls/floor
// are translucent — translucent ink-only faces read as an x-ray wireframe
// (round 2 lesson).
//
// Camera: orthographic, azimuth 30° (x axis turns down-right), elevation 20°
// (Dan's choice, "closer to Sims"). World units are cm. Visible faces are
// always top, +y ("left" / front) and +x ("right" side). Scenes emit an SVG
// markup STRING — built in the browser from ~200 lines of scene code rather
// than shipped as ~120KB of baked SVG per room per theme.

const DEG = Math.PI / 180;
export const CAM = { a: 30 * DEG, e: 20 * DEG };
const ca = Math.cos(CAM.a), sa = Math.sin(CAM.a), se = Math.sin(CAM.e), ce = Math.cos(CAM.e);

export type NavTheme = "dark" | "light";
type Rgb = [number, number, number];
export interface ThemeTable {
  ink: Rgb; paper: Rgb;
  top: number; left: number; right: number; floor: number; wall: number;
  sil: number; det: number; faint: number; recess: number; glass: number; cut: number;
  glow: string; glowOp: number; bright: number;
}

export const THEME: Record<NavTheme, ThemeTable> = {
  dark: { ink: [255, 255, 255], paper: [35, 35, 43], top: 0.26, left: 0.15, right: 0.08, floor: 0.06, wall: 0.07, sil: 0.62, det: 0.38, faint: 0.2, recess: 0.38, glass: 0.3, cut: 0.42, glow: "#ffffff", glowOp: 0.95, bright: 1.25 },
  light: { ink: [27, 28, 32], paper: [239, 238, 233], top: 0.02, left: 0.08, right: 0.16, floor: 0.05, wall: 0.05, sil: 0.58, det: 0.34, faint: 0.18, recess: 0.2, glass: 0.16, cut: 0.28, glow: "#1b1c20", glowOp: 0.38, bright: 1.12 },
};

export const r2 = (n: number) => Math.round(n * 100) / 100;
export const rgb = (c: number[]) => `rgb(${c.map(Math.round).join(",")})`;

export type P2 = [number, number];
export type P3 = [number, number, number];
type Axis = "x" | "y" | "z";
type StrokeKey = "sil" | "det" | "faint";
export interface PathOpts { fill?: "ink" | "shade" | null; fop?: number; stroke?: StrokeKey | number | null; sw?: number; solid?: boolean }
export interface BoxOpts { tone?: number; noTop?: boolean; noLeft?: boolean; noRight?: boolean; rightZ0?: number; edge?: StrokeKey; alpha?: boolean; ao?: boolean; sil?: boolean }

export class Kit {
  t: ThemeTable;
  private out: string[] = [];
  private open = false;
  bounds: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];

  constructor(theme: NavTheme) {
    this.t = THEME[theme];
  }

  P(x: number, y: number, z: number): P2 {
    return [x * ca - y * sa, (x * sa + y * ca) * se - z * ce];
  }
  d(pts: P2[], close = true): string {
    const b = this.bounds;
    for (const p of pts) {
      if (p[0] < b[0]) b[0] = p[0];
      if (p[1] < b[1]) b[1] = p[1];
      if (p[0] > b[2]) b[2] = p[0];
      if (p[1] > b[3]) b[3] = p[1];
    }
    return "M" + pts.map((p) => r2(p[0]) + " " + r2(p[1])).join(" L") + (close ? " Z" : "");
  }
  private solidFill(a: number) {
    const t = this.t;
    return `fill="${rgb(t.paper.map((p, i) => p + (t.ink[i] - p) * Math.min(1, a)))}"`;
  }
  path(d: string, { fill = null, fop = 0, stroke = "det", sw, solid = false }: PathOpts = {}) {
    const t = this.t;
    const sop = stroke ? (typeof stroke === "number" ? stroke : t[stroke]) : 0;
    // Stroke attrs common to every path (join/cap/non-scaling) live on the
    // scene's root <g>, not repeated ~550 times.
    const width = sw ?? (stroke === "sil" ? 0.85 : stroke === "faint" ? 0.35 : 0.5);
    let a = `d="${d}"`;
    if (fill === "shade") a += ` fill="#000" fill-opacity="${r2(fop)}"`;
    else if (fill && solid) a += " " + this.solidFill(fop);
    else if (fill) a += ` fill="${rgb(t.ink)}" fill-opacity="${r2(fop)}"`;
    else a += ' fill="none"';
    if (sop) a += ` stroke="${rgb(t.ink)}" stroke-opacity="${r2(sop)}" stroke-width="${width}"`;
    this.out.push(`<path ${a}/>`);
  }
  raw(s: string) {
    this.out.push(s);
  }
  poly3(p3: P3[], o?: PathOpts) {
    this.path(this.d(p3.map((p) => this.P(...p))), o);
  }
  line3(a: P3, b: P3, o: PathOpts = {}) {
    this.path(this.d([this.P(...a), this.P(...b)], false), { stroke: "det", ...o });
  }
  curve3(p3: P3[], o: PathOpts = {}) {
    this.path(this.d(p3.map((p) => this.P(...p)), false), { stroke: "det", ...o });
  }
  /** Starts a hotspot group. Several groups may share an id (the kitchen's
   *  cabinets are five pieces in paint order); NavArtScene treats them as one
   *  object — one glow, one accessible button. */
  hot(id: string) {
    this.close();
    this.out.push(`<g class="hot" data-id="${id}">`);
    this.open = true;
  }
  deco() {
    this.close();
    this.out.push('<g class="deco">');
    this.open = true;
  }
  close() {
    if (this.open) this.out.push("</g>");
    this.open = false;
  }
  hull(pts: P2[]): P2[] {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo: P2[] = [];
    for (const q of p) {
      while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
      lo.push(q);
    }
    const up: P2[] = [];
    for (const q of p.slice().reverse()) {
      while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
      up.push(q);
    }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  /** Draws only faces that can be seen. noRight/noLeft skip a face a flush
   *  neighbour hides; rightZ0 draws the right face only above that height. */
  box(x0: number, y0: number, z0: number, w: number, dd: number, h: number, o: BoxOpts = {}) {
    const t = this.t, k = o.tone ?? 1, x1 = x0 + w, y1 = y0 + dd, z1 = z0 + h;
    const rz = Math.max(z0, o.rightZ0 ?? z0);
    const F: [string, P3[], number][] = [];
    if (!o.noTop) F.push(["top", [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], t.top]);
    if (!o.noLeft) F.push(["left", [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], t.left]);
    if (!o.noRight && rz < z1) F.push(["right", [[x1, y0, rz], [x1, y1, rz], [x1, y1, z1], [x1, y0, z1]], t.right]);
    for (const [, pts, a] of F) this.poly3(pts, { fill: "ink", fop: a * k, stroke: o.edge ?? "det", solid: !o.alpha });
    if (h > 30 && o.ao !== false) for (const [n, pts] of F) if (n !== "top") this.raw(`<path d="${this.d(pts.map((p) => this.P(...p)))}" fill="url(#aoV)"/>`);
    if (o.sil !== false && F.length) this.path(this.d(this.hull(F.flatMap((f) => f[1].map((p) => this.P(...p))))), { stroke: "sil" });
  }
  map(axis: Axis, v: number, a: number, b: number): P3 {
    return axis === "z" ? [a, b, v] : axis === "y" ? [a, v, b] : [v, a, b];
  }
  rrect3(axis: Axis, v: number, a0: number, b0: number, a1: number, b1: number, r: number, seg = 5) {
    const pts: P2[] = [];
    for (const [cA, cB, st] of [[a1 - r, b0 + r, -Math.PI / 2], [a1 - r, b1 - r, 0], [a0 + r, b1 - r, Math.PI / 2], [a0 + r, b0 + r, Math.PI]])
      for (let i = 0; i <= seg; i++) {
        const g = st + (i / seg) * (Math.PI / 2);
        pts.push([cA + r * Math.cos(g), cB + r * Math.sin(g)]);
      }
    return this.d(pts.map(([a, b]) => this.P(...this.map(axis, v, a, b))));
  }
  rect3(axis: Axis, v: number, a0: number, b0: number, a1: number, b1: number) {
    return this.d(([[a0, b0], [a1, b0], [a1, b1], [a0, b1]] as P2[]).map(([a, b]) => this.P(...this.map(axis, v, a, b))));
  }
  circle3(axis: Axis, v: number, cA: number, cB: number, r: number, seg = 36) {
    const pts: P2[] = [];
    for (let i = 0; i < seg; i++) {
      const g = (i / seg) * Math.PI * 2;
      pts.push(this.P(...this.map(axis, v, cA + r * Math.cos(g), cB + r * Math.sin(g))));
    }
    return this.d(pts);
  }
  /** Vertical cylinder / frustum. A horizontal circle of radius r projects to
   *  an ellipse r × r·sin(E). */
  cyl(cx: number, cy: number, z0: number, h: number, r0: number, r1 = r0, o: { fop?: number; topFop?: number } = {}) {
    const t = this.t, [bx, by] = this.P(cx, cy, z0), [tx, ty] = this.P(cx, cy, z0 + h), q = se;
    this.d([[bx - r0, by + r0 * q], [bx + r0, by + r0 * q], [tx - r1, ty - r1 * q], [tx + r1, ty - r1 * q]]);
    const body = `M${r2(tx - r1)} ${r2(ty)} L${r2(bx - r0)} ${r2(by)} A${r2(r0)} ${r2(r0 * q)} 0 0 0 ${r2(bx + r0)} ${r2(by)} L${r2(tx + r1)} ${r2(ty)} Z`;
    this.path(body, { fill: "ink", fop: o.fop ?? t.left, stroke: null, solid: true });
    this.path(`M${r2(tx)} ${r2(ty + r1 * q)} L${r2(bx)} ${r2(by + r0 * q)} A${r2(r0)} ${r2(r0 * q)} 0 0 0 ${r2(bx + r0)} ${r2(by)} L${r2(tx + r1)} ${r2(ty)} A${r2(r1)} ${r2(r1 * q)} 0 0 1 ${r2(tx)} ${r2(ty + r1 * q)} Z`, { fill: "shade", fop: t.recess * 0.18, stroke: null });
    this.path(`M${r2(tx - r1)} ${r2(ty)} A${r2(r1)} ${r2(r1 * q)} 0 1 0 ${r2(tx + r1)} ${r2(ty)} A${r2(r1)} ${r2(r1 * q)} 0 1 0 ${r2(tx - r1)} ${r2(ty)} Z`, { fill: "ink", fop: o.topFop ?? t.top, stroke: "det", solid: true });
    this.path(body, { stroke: "sil" });
  }
  softBox(x0: number, y0: number, z0: number, w: number, dd: number, h: number, r: number, o: { tone?: number } = {}) {
    const t = this.t, x1 = x0 + w, y1 = y0 + dd, z1 = z0 + h, pts: P2[] = [], N = 5;
    for (const [cx, sx] of [[x0 + r, -1], [x1 - r, 1]])
      for (const [cy, sy] of [[y0 + r, -1], [y1 - r, 1]])
        for (const [cz, sz] of [[z0 + r, -1], [z1 - r, 1]])
          for (let i = 0; i <= N; i++)
            for (let j = 0; j <= N; j++) {
              const a = (i / N) * (Math.PI / 2), b = (j / N) * (Math.PI / 2);
              pts.push(this.P(cx + sx * r * Math.cos(a) * Math.cos(b), cy + sy * r * Math.sin(a) * Math.cos(b), cz + sz * r * Math.sin(b)));
            }
    const H = this.d(this.hull(pts));
    this.path(H, { fill: "ink", fop: t.right * (o.tone ?? 1), stroke: null, solid: true });
    this.path(this.rrect3("y", y1, x0, z0, x1, z1 - r * 0.6, r), { fill: "ink", fop: t.left * (o.tone ?? 1) * 0.9, stroke: null, solid: true });
    this.path(this.rrect3("z", z1, x0, y0, x1, y1, r), { fill: "ink", fop: t.top * (o.tone ?? 1), stroke: "faint", solid: true });
    this.path(H, { stroke: "sil" });
  }
  ellipseZ(cx: number, cy: number, z: number, r: number, o?: PathOpts) {
    this.path(this.circle3("z", z, cx, cy, r), o);
  }
  floorShadow(x0: number, y0: number, x1: number, y1: number) {
    this.raw(`<path d="${this.d(([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]] as P3[]).map((p) => this.P(...p)))}" fill="#000" fill-opacity="${r2(this.t.recess * 0.55)}" filter="url(#soft)"/>`);
  }
  wallShadow(p3: P3[]) {
    this.raw(`<path d="${this.d(p3.map((p) => this.P(...p)))}" fill="#000" fill-opacity="${r2(this.t.recess * 0.5)}" filter="url(#soft)"/>`);
  }
  shaker(axis: Axis, v: number, a0: number, z0: number, a1: number, z1: number, inset = 5) {
    this.path(this.rect3(axis, v, a0 + 0.5, z0 + 0.5, a1 - 0.5, z1 - 0.5), { stroke: "det" });
    this.path(this.rect3(axis, v, a0 + inset, z0 + inset, a1 - inset, z1 - inset), { fill: "shade", fop: this.t.recess * 0.18, stroke: "faint" });
  }
  barV(x: number, y: number, z0: number, len: number) {
    this.box(x - 1, y, z0, 2, 2.4, len, { tone: 1.6, edge: "faint", ao: false });
  }
  barH(x0: number, y: number, z: number, len: number) {
    this.box(x0, y, z - 1, len, 2.4, 2, { tone: 1.6, edge: "faint", ao: false });
  }
  /** Floor slab: top + front and right edges. */
  slab(x0: number, y0: number, x1: number, y1: number, th: number, tiles: "tiles" | "planks") {
    const t = this.t;
    this.poly3([[x0, y1, -th], [x1, y1, -th], [x1, y1, 0], [x0, y1, 0]], { fill: "ink", fop: t.left * 0.9, stroke: "det", solid: true });
    this.poly3([[x1, y0, -th], [x1, y1, -th], [x1, y1, 0], [x1, y0, 0]], { fill: "ink", fop: t.right * 0.9, stroke: "det", solid: true });
    this.poly3([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], { fill: "ink", fop: t.floor * 1.4, stroke: "det", solid: true });
    if (tiles === "planks") {
      for (let y = y0 + 16, row = 0; y < y1; y += 16, row++) {
        this.line3([x0, y, 0], [x1, y, 0], { stroke: "faint", sw: 0.3 });
        for (let x = x0 + ((row * 47) % 110) + 18; x < x1; x += 110) this.line3([x, y - 16, 0], [x, y, 0], { stroke: "faint", sw: 0.3 });
      }
    } else {
      for (let x = x0 + 40; x < x1; x += 40) this.line3([x, y0, 0], [x, y1, 0], { stroke: "faint", sw: 0.3 });
      for (let y = y0 + 40; y < y1; y += 40) this.line3([x0, y, 0], [x1, y, 0], { stroke: "faint", sw: 0.3 });
    }
  }
  result() {
    this.close();
    return { html: this.out.join(""), bounds: this.bounds };
  }
}

export type SceneFn = (theme: NavTheme) => { html: string; bounds: [number, number, number, number] };

/** Frames a scene into a W×H box (the panel's scene area), with the defs its
 *  paths reference. `mirror` flips it horizontally: the art is drawn with the
 *  corner on the LEFT, and English wants it on the right (the far side from
 *  the panel's inline-start edge), so English mirrors and Hebrew does not.
 *  Ported from navigator-plan-r4/render.js. */
export function frameScene(scene: SceneFn, theme: NavTheme, o: { w: number; h: number; mirror: boolean; id: string; pad?: number }) {
  const { html, bounds } = scene(theme);
  const pad = o.pad ?? 5;
  let [x0, y0, x1, y1] = bounds;
  x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
  let vw = x1 - x0, vh = y1 - y0;
  const want = o.w / o.h;
  if (vw / vh < want) {
    const nw = vh * want;
    x0 -= (nw - vw) / 2;
    vw = nw;
  } else {
    // Extra height goes ABOVE the art: the panel's empty space belongs over
    // the wall, where the readout pill sits, not under the floor.
    const nh = vw / want;
    y0 -= nh - vh;
    vh = nh;
  }
  const scale = o.w / vw, th = THEME[theme], dark = theme === "dark", id = o.id;
  const defs = `<defs>
<linearGradient id="aoV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${rgb(th.ink)}" stop-opacity="${dark ? 0.05 : 0}"/><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${dark ? 0.22 : 0.1}"/></linearGradient>
<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${dark ? 0.16 : 0.55}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${r2(1.6 / scale)}"/></filter>
<filter id="glow-${id}" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB"><feMorphology in="SourceAlpha" operator="dilate" radius="${r2(0.6 / scale)}" result="d"/><feGaussianBlur in="d" stdDeviation="${r2((dark ? 3.2 : 2.6) / scale)}" result="b"/><feFlood flood-color="${th.glow}" flood-opacity="${th.glowOp}"/><feComposite in2="b" operator="in" result="g"/><feComponentTransfer in="SourceGraphic" result="lit"><feFuncR type="linear" slope="${th.bright}" intercept="0.02"/><feFuncG type="linear" slope="${th.bright}" intercept="0.02"/><feFuncB type="linear" slope="${th.bright}" intercept="0.02"/></feComponentTransfer><feMerge><feMergeNode in="g"/><feMergeNode in="lit"/></feMerge></filter>
</defs>`;
  const viewBox = o.mirror ? `${r2(-x0 - vw)} ${r2(y0)} ${r2(vw)} ${r2(vh)}` : `${r2(x0)} ${r2(y0)} ${r2(vw)} ${r2(vh)}`;
  const body = `<g stroke-linejoin="round" stroke-linecap="round"${o.mirror ? ' transform="scale(-1 1)"' : ""}>${html}</g>`;
  return { viewBox, markup: defs + body, scale, glowFilter: `url(#glow-${id})` };
}
