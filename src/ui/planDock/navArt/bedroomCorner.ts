// Bedroom, round 4 kit. Back wall, corner outwards: nightstand + lamp | queen
// bed, headboard to the wall, foot toward the viewer | nightstand + lamp |
// plant | wardrobe closing the run (a tall unit at the open end reads as a
// front, not a blank side). A wide print over the headboard. Side wall: a
// chest of drawers with the TV mounted over it, across from the bed. Rug
// under the foot of the bed. Ids = BEDROOM_HOTSPOTS.

import { Kit, type NavTheme } from "./kit";
import { shell, art, tv, tableLamp, plant, rug } from "./props";

export function bedroomCorner(theme: NavTheme) {
  const g = new Kit(theme), t = g.t;
  const B = 500, S = 270;
  shell(g, { back: B, side: S, floor: "planks" });
  g.floorShadow(114, 0, 290, 212);
  g.floorShadow(386, 0, 494, 64);

  g.hot("rug");
  rug(g, 96, 150, 316, 262, "stripes");

  g.hot("art");
  art(g, "back", 150, 124, 104, 58, "hills");

  const nightstand = (x: number) => {
    g.hot("nightstand");
    g.box(x, 0, 0, 44, 40, 54, { tone: 1.15 });
    g.shaker("y", 40, x, 30, x + 44, 51, 3.5);
    g.shaker("y", 40, x, 6, x + 44, 28, 3.5);
    g.barH(x + 14, 40, 43, 16);
    g.barH(x + 14, 40, 19, 16);
    g.hot("decor");
    tableLamp(g, x + 22, 18, 54);
  };
  nightstand(70);

  // ── side wall: chest of drawers and the TV over it ─────────────
  g.deco();
  g.box(0, 70, 0, 44, 120, 76, { tone: 1.1 });
  for (const [z0, z1] of [[6, 28], [30, 52], [54, 74]]) {
    g.shaker("x", 44, 71, z0, 129, z1, 3.5);
    g.shaker("x", 44, 131, z0, 189, z1, 3.5);
  }
  g.cyl(24, 160, 76, 16, 5, 4, { fop: t.left * 1.5 }); // vase
  g.hot("tv");
  tv(g, "side", 88, 104, 96, 54);

  // ── bed ──────────────────────────────────────────────────────────
  g.hot("bed");
  const BX = 120, BW = 164, BL = 205;
  g.box(BX - 2, 0, 0, BW + 4, 8, 112, { tone: 1.2 }); // headboard
  g.shaker("y", 8, BX + 4, 38, BX + BW - 4, 106, 5);
  for (const x of [BX + 44, BX + 82, BX + 120]) g.line3([x, 8.1, 43], [x, 8.1, 101], { stroke: "faint" });
  g.path(g.rect3("y", BL + 0.05, BX + 3, 0, BX + BW - 3, 8), { fill: "shade", fop: t.recess * 0.6, stroke: null }); // plinth shadow
  g.box(BX, 8, 8, BW, BL - 8, 24, { tone: 1.1 }); // frame
  g.softBox(BX + 4, 10, 32, BW - 8, BL - 14, 20, 5, { tone: 1.55 }); // mattress
  g.softBox(BX + 10, 14, 50, 68, 36, 13, 6, { tone: 2 }); // pillows
  g.softBox(BX + BW - 78, 14, 50, 68, 36, 13, 6, { tone: 2 });
  g.softBox(BX + 1, 74, 38, BW - 2, BL - 76, 17, 6, { tone: 1.8 }); // duvet
  g.line3([BX + 4, 80, 55.2], [BX + BW - 4, 80, 55.2], { stroke: "det" }); // turned-down edge
  g.poly3([[BX + 1, 158, 55.3], [BX + BW - 1, 158, 55.3], [BX + BW - 1, 184, 55.3], [BX + 1, 184, 55.3]], { fill: "ink", fop: t.top * 2.4, stroke: "faint", solid: true }); // throw
  g.poly3([[BX + 1, BL - 1, 55], [BX + BW - 1, BL - 1, 55], [BX + BW - 1, BL - 1, 36], [BX + 1, BL - 1, 36]], { fill: "ink", fop: t.left * 2.4, stroke: "det", solid: true }); // duvet overhang

  nightstand(292);

  g.hot("decor");
  plant(g, 362, 26, 0, 13, 34, 74);

  // ── wardrobe closing the run ─────────────────────────────────────
  g.hot("wardrobe");
  const WX = 390, WW = 100, WD = 60, WH = 216;
  g.box(WX, 0, 0, WW, WD, WH, { tone: 1.15 });
  g.path(g.rect3("y", WD + 0.05, WX + 0.5, 0, WX + WW - 0.5, 8), { fill: "shade", fop: t.recess * 0.55, stroke: null });
  g.shaker("y", WD, WX, 9, WX + WW / 2, WH - 2, 5);
  g.shaker("y", WD, WX + WW / 2, 9, WX + WW, WH - 2, 5);
  g.barV(WX + WW / 2 - 5, WD, 100, 30);
  g.barV(WX + WW / 2 + 5, WD, 100, 30);

  return g.result();
}
