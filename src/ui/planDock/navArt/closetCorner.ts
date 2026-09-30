// Walk-in closet, round 4 kit. Back wall: one built-in wardrobe run in three
// open bays — hanging clothes (seen edge-on, as they hang), drawers with
// folded stacks over them, long coats — with storage boxes on the top shelf.
// Side wall: a slanted shoe rack with pairs on it. An ottoman on a round rug
// and a leaning mirror at the open end (scenery). Ids = CLOSET_HOTSPOTS.

import { Kit, type NavTheme } from "./kit";
import { shell, roundRug } from "./props";

export function closetCorner(theme: NavTheme) {
  const g = new Kit(theme), t = g.t;
  const B = 390, S = 220, WD = 60, WH = 222;
  shell(g, { back: B, side: S, floor: "planks" });
  g.floorShadow(16, 0, 326, 66);

  g.deco();
  roundRug(g, 200, 150, 56);

  // ── wardrobe run ─────────────────────────────────────────────────
  g.hot("wardrobe");
  const X0 = 18, X1 = 326, bays = [[X0, 120], [120, 222], [222, X1]];
  g.box(X0, 0, 0, X1 - X0, WD, WH, { tone: 1.05 });
  g.path(g.rect3("y", WD + 0.05, X0 + 3, 8, X1 - 3, WH - 30), { fill: "shade", fop: t.recess * 0.85, stroke: "det" });
  g.path(g.rect3("y", WD + 0.05, X0 + 0.5, 0, X1 - 0.5, 7), { fill: "shade", fop: t.recess * 0.5, stroke: null });
  for (const [a] of bays.slice(1)) g.box(a - 1.5, 0, 8, 3, WD, WH - 38, { tone: 1.2, ao: false }); // dividers
  g.box(X0 + 3, 0, WH - 32, X1 - X0 - 6, WD, 3, { tone: 1.25, ao: false }); // top shelf
  // storage boxes on the top shelf
  for (const [x, w] of [[30, 44], [84, 30], [236, 50], [292, 26]]) g.box(x, 10, WH - 29, w, 36, 22, { tone: 1.5, edge: "det", ao: false });
  // hanging: rail + garments edge-on, varied length and tone
  const hangBay = (a0: number, a1: number, long: boolean, seed: number) => {
    const railZ = WH - 44;
    g.line3([a0 + 3, WD / 2, railZ], [a1 - 3, WD / 2, railZ], { stroke: "sil", sw: 1.4 });
    let i = seed;
    for (let x = a0 + 6; x < a1 - 8; x += 7.5) {
      const len = (long ? 110 : 70) + ((i * 17) % 23), k = 1.35 + ((i * 7) % 6) / 8;
      g.curve3([[x + 1.5, WD / 2, railZ], [x + 1.5, WD / 2, railZ - 5]], { stroke: "det", sw: 0.6 });
      g.box(x, 10, railZ - 6 - len, 3.5, WD - 18, len, { tone: k, edge: "det", ao: false, sil: false });
      i++;
    }
  };
  hangBay(bays[0][0], bays[0][1], false, 1);
  // middle bay: drawers under, folded stacks over
  const [m0, m1] = bays[1];
  g.box(m0 + 3, 0, 8, m1 - m0 - 6, WD - 2, 72, { tone: 1.15 });
  for (const [z0, z1] of [[10, 32], [34, 56], [58, 78]]) {
    g.shaker("y", WD - 2, m0 + 3, z0, m1 - 3, z1, 3.5);
    g.barH((m0 + m1) / 2 - 10, WD - 2, (z0 + z1) / 2, 20);
  }
  for (const z of [118, 152]) {
    g.box(m0 + 3, 0, z - 3, m1 - m0 - 6, WD, 3, { tone: 1.25, ao: false });
    for (const [x, n] of [[m0 + 10, 4], [m0 + 52, 3]] as [number, number][])
      for (let j = 0; j < n; j++) g.box(x, 14, z + j * 6, 36, 34, 6, { tone: 1.5 + (j % 2) * 0.35, edge: "det", ao: false });
  }
  hangBay(bays[2][0], bays[2][1], true, 5);

  // ── side wall: slanted shoe rack ─────────────────────────────────
  g.hot("shoes");
  const SY0 = 80, SY1 = 200, SD = 38, SH = 92;
  g.box(0, SY0, 0, 4, SY1 - SY0, SH, { tone: 1.1 }); // back panel
  g.box(0, SY0, 0, SD, 4, SH, { tone: 1.2 }); // far side
  for (const [z, k] of [[14, 0], [44, 1], [74, 2]] as [number, number][]) {
    g.poly3([[4, SY0 + 4, z + 10], [SD - 2, SY0 + 4, z], [SD - 2, SY1 - 4, z], [4, SY1 - 4, z + 10]], { fill: "ink", fop: t.top * 1.4, stroke: "det", solid: true });
    // pairs of shoes on the slope
    for (let y = SY0 + 10 + k * 4, n = 0; y < SY1 - 22; y += 26, n++) {
      for (const dy of [0, 10]) {
        const yy = y + dy;
        g.softBox(10, yy, z + 3, 26, 8, 8, 3, { tone: 1.6 + ((n + k) % 3) * 0.25 });
      }
    }
  }
  g.box(0, SY1 - 4, 0, SD, 4, SH, { tone: 1.2 }); // near side
  g.box(0, SY0, SH, SD, SY1 - SY0, 3, { tone: 1.35, ao: false }); // top

  // ── scenery: ottoman and a leaning mirror ────────────────────────
  g.deco();
  g.cyl(200, 150, 0, 40, 26, 26, { fop: t.left * 1.35, topFop: t.top * 1.5 });
  g.ellipseZ(200, 150, 40.1, 22, { stroke: "faint" });
  g.poly3([[344, 4, 0], [388, 4, 0], [386, 12, 178], [346, 12, 178]], { fill: "ink", fop: t.left * 1.4, stroke: "sil", solid: true });
  g.raw(`<path d="${g.d([[348, 14, 4], [384, 14, 4], [382, 20, 172], [350, 20, 172]].map(([x, y, z]) => g.P(x, y, z)))}" fill="url(#sheen)"/>`);

  return g.result();
}
