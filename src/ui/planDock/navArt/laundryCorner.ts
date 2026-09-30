// Laundry, round 4 kit. Back wall, corner outwards: utility sink cabinet |
// front-loading washer | dryer (smaller porthole, lint drawer), a shelf of
// detergents over the pair | a small print. Ironing board with the iron,
// parallel to the side wall; a folding drying rack with clothes on it in
// front of the print. Tiled splash band to 120. Ids = LAUNDRY_HOTSPOTS.

import { Kit, type NavTheme } from "./kit";
import { shell, art } from "./props";

export function laundryCorner(theme: NavTheme) {
  const g = new Kit(theme), t = g.t;
  const B = 400, S = 210;
  shell(g, { back: B, side: S, floor: "tiles" });
  for (let z = 20; z <= 120; z += 20) g.line3([0, 0, z], [236, 0, z], { stroke: "faint", sw: 0.25 });
  for (let x = 20; x < 236; x += 20) g.line3([x, 0, 90], [x, 0, 120], { stroke: "faint", sw: 0.25 });
  g.floorShadow(16, 0, 216, 62);

  g.hot("art");
  art(g, "back", 262, 128, 44, 56, "sprig");

  // shelf with detergents over the machines (scenery)
  g.deco();
  g.box(84, 0, 150, 132, 28, 3, { tone: 1.35, ao: false });
  for (const [x, w, h, k] of [[92, 14, 24, 1.5], [110, 10, 18, 1.9], [124, 12, 28, 1.4], [156, 22, 16, 1.7], [186, 12, 22, 1.5]] as [number, number, number, number][]) g.box(x, 6, 153, w, 14, h, { tone: k, edge: "det", ao: false });
  for (const x of [96, 204]) g.box(x, 0, 140, 3, 20, 10, { tone: 1.3, ao: false }); // brackets

  // ── utility sink ────────────────────────────────────────────────
  g.hot("sink");
  g.box(18, 0, 0, 62, 56, 86, { tone: 1.1, noTop: true, noRight: true });
  g.path(g.rect3("y", 56.05, 18.5, 0, 79.5, 8), { fill: "shade", fop: t.recess * 0.55, stroke: null });
  g.shaker("y", 56, 18, 10, 49, 84);
  g.shaker("y", 56, 49, 10, 80, 84);
  g.barV(45, 56, 64, 12);
  g.barV(53, 56, 64, 12);
  g.box(16, 0, 86, 66, 58, 6, { tone: 1.4, ao: false, noRight: true });
  g.path(g.rrect3("z", 92.05, 22, 8, 76, 50, 4), { fill: "shade", fop: t.recess * 1.1, stroke: "det" });
  g.cyl(49, 5, 92, 3, 2.4);
  const tap: [number, number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI;
    tap.push([49, 5 + 9 * (1 - Math.cos(a)), 95 + 20 * Math.sin(a)]);
  }
  g.curve3(tap, { stroke: "sil", sw: 1.6 });

  const machine = (x0: number, dryer: boolean) => {
    const W = 60, D = 60, H = 86;
    g.box(x0, 0, 0, W, D, H, { tone: 1.3 });
    g.line3([x0 + 1, D + 0.05, 72], [x0 + W - 1, D + 0.05, 72], { stroke: "det" });
    g.path(g.rect3("y", D + 0.1, x0 + 4, 75, x0 + 20, 83), { stroke: "det" });
    g.path(g.rect3("y", D + 0.1, x0 + 26, 76, x0 + 40, 82), { fill: "shade", fop: t.recess * 0.9, stroke: "faint" });
    g.path(g.circle3("y", D + 0.1, x0 + 51, 79, 3.4, 16), { fill: "ink", fop: t.top * 1.8, stroke: "det" });
    const r = dryer ? 19 : 22;
    g.path(g.circle3("y", D + 0.1, x0 + W / 2, 37, r, 40), { fill: "ink", fop: t.top * 1.7, stroke: "det", solid: true });
    g.path(g.circle3("y", D + 0.2, x0 + W / 2, 37, r - 6, 40), { fill: "shade", fop: t.recess * 1.4, stroke: "det" });
    if (dryer) for (const dz of [-6, 0, 6]) g.line3([x0 + W / 2 - 7, D + 0.3, 37 + dz], [x0 + W / 2 + 7, D + 0.3, 37 + dz], { stroke: 0.14, sw: 0.6 });
    else g.curve3([[x0 + 20, D + 0.3, 43], [x0 + 23, D + 0.3, 48], [x0 + 28, D + 0.3, 50]], { stroke: 0.2, sw: 1.2 });
    g.line3([x0 + 1, D + 0.05, 4], [x0 + W - 1, D + 0.05, 4], { stroke: "faint" });
  };
  g.hot("washer");
  machine(86, false);
  g.hot("dryer");
  machine(152, true);

  // ── ironing board along the side wall, with the iron ─────────────
  g.hot("iron");
  const IX0 = 26, IX1 = 64, IY0 = 86, IY1 = 196, IZ = 86, xm = (IX0 + IX1) / 2;
  g.line3([xm - 8, IY0 + 22, 0], [xm - 8, IY1 - 38, IZ - 2], { stroke: "sil", sw: 1.8 });
  g.line3([xm + 8, IY0 + 22, 0], [xm + 8, IY1 - 38, IZ - 2], { stroke: "sil", sw: 1.8 });
  g.line3([xm - 8, IY1 - 30, 0], [xm - 8, IY0 + 30, IZ - 2], { stroke: "sil", sw: 1.8 });
  g.line3([xm + 8, IY1 - 30, 0], [xm + 8, IY0 + 30, IZ - 2], { stroke: "sil", sw: 1.8 });
  const nose: [number, number, number][] = [[IX0, IY0, IZ], [IX1, IY0, IZ], [IX1, IY1 - 26, IZ]];
  for (let i = 1; i < 8; i++) {
    const a = (i / 8) * Math.PI;
    nose.push([xm + ((IX1 - IX0) / 2) * Math.cos(a), IY1 - 26 + 26 * Math.sin(a), IZ]);
  }
  nose.push([IX0, IY1 - 26, IZ]);
  g.poly3(nose.map(([x, y, z]) => [x, y, z - 3] as [number, number, number]), { fill: "ink", fop: t.left * 1.3, stroke: "det", solid: true });
  g.poly3(nose, { fill: "ink", fop: t.top * 1.9, stroke: "sil", solid: true });
  for (let y = IY0 + 10; y < IY1 - 30; y += 10) g.line3([IX0 + 3, y, IZ + 0.1], [IX1 - 3, y + 6, IZ + 0.1], { stroke: "faint", sw: 0.3 });
  g.box(IX0 + 8, IY0 + 42, IZ, 22, 12, 7, { tone: 1.9, edge: "det", ao: false }); // iron body
  g.curve3([[IX0 + 12, IY0 + 48, IZ + 7], [IX0 + 16, IY0 + 48, IZ + 14], [IX0 + 26, IY0 + 48, IZ + 14], [IX0 + 28, IY0 + 48, IZ + 7]], { stroke: "sil", sw: 1.6 });

  // ── folding drying rack with clothes ─────────────────────────────
  g.hot("rack");
  const RX0 = 250, RX1 = 364, RY0 = 64, RY1 = 124, RYM = (RY0 + RY1) / 2, RZ = 104;
  for (const x of [RX0, RX1]) {
    g.line3([x, RY0, 0], [x, RYM, RZ], { stroke: "sil", sw: 1.4 });
    g.line3([x, RY1, 0], [x, RYM, RZ], { stroke: "sil", sw: 1.4 });
  }
  const rodsAt = [0.35, 0.6, 0.85];
  for (const k of rodsAt) {
    const z = RZ * k;
    for (const y of [RYM - (RYM - RY0) * (1 - k), RYM + (RY1 - RYM) * (1 - k)]) g.line3([RX0, y, z], [RX1, y, z], { stroke: "det", sw: 0.7 });
  }
  // clothes over the near rods: a towel, a shirt, a pair of socks
  const hang = (x0: number, x1: number, drop: number, k: number, tone: number) => {
    const z = RZ * k, y = RYM + (RY1 - RYM) * (1 - k);
    g.poly3([[x0, y, z], [x1, y, z], [x1, y + 2, z - drop], [x0, y + 2, z - drop]], { fill: "ink", fop: t.left * tone, stroke: "det", solid: true });
  };
  hang(262, 300, 46, 0.85, 2);
  hang(308, 348, 30, 0.85, 1.6);
  hang(270, 282, 18, 0.6, 2.4);
  hang(286, 298, 18, 0.6, 2.4);
  hang(320, 356, 24, 0.35, 1.8);

  return g.result();
}
