// Kids' room, round 4 kit. Back wall, corner outwards: slatted crib, a child's
// drawing over it | changing dresser with the pad on top, clock over it |
// wardrobe closing the run. Side wall: a low toy shelf with bins, the TV over
// it. Round rug with blocks and a ball on it. Ids = KIDS_HOTSPOTS.

import { Kit, type NavTheme } from "./kit";
import { shell, art, clock, tv, roundRug } from "./props";

export function kidsCorner(theme: NavTheme) {
  const g = new Kit(theme), t = g.t;
  const B = 460, S = 230;
  shell(g, { back: B, side: S, floor: "planks" });
  g.floorShadow(50, 0, 196, 78);
  g.floorShadow(346, 0, 452, 62);

  g.hot("rug");
  roundRug(g, 222, 160, 62);

  g.hot("art");
  art(g, "back", 94, 134, 52, 44, "kite");
  g.hot("clock");
  clock(g, "back", 256, 176, 15);

  // ── side wall: toy shelf and TV ──────────────────────────────────
  g.hot("tv");
  tv(g, "side", 90, 112, 84, 48);
  g.hot("toys");
  const TY0 = 70, TY1 = 190, TD = 38, TH = 62;
  g.box(0, TY0, 0, TD, TY1 - TY0, TH, { tone: 1.1 });
  g.path(g.rect3("x", TD + 0.05, TY0 + 3, 4, TY1 - 3, TH - 3), { fill: "shade", fop: t.recess * 0.85, stroke: "det" });
  const bins = (z: number, tones: number[]) => tones.forEach((k, i) => g.box(4, TY0 + 6 + i * 38, z, TD - 6, 32, 24, { tone: k, edge: "det", ao: false }));
  bins(5, [1.8, 1.5, 2]); // bottom row, then the board over their backs, then the top row
  g.box(0, TY0 + 3, 31, TD, TY1 - TY0 - 6, 3, { tone: 1.25, ao: false });
  bins(34, [1.6, 2.1, 1.5]);
  g.softBox(12, TY0 + 50, TH, 16, 14, 18, 6, { tone: 2.1 }); // a plush on top
  g.cyl(22, TY0 + 20, TH, 14, 5, 5, { fop: t.left * 1.8 }); // a toy drum

  // ── crib ─────────────────────────────────────────────────────────
  g.hot("crib");
  const CX0 = 50, CX1 = 190, CD = 72, CH = 96;
  g.box(CX0, 0, 0, 5, 5, CH + 6, { tone: 1.3, ao: false }); // far posts
  g.box(CX1 - 5, 0, 0, 5, 5, CH + 6, { tone: 1.3, ao: false });
  for (let x = CX0 + 10; x < CX1 - 6; x += 9) g.box(x, 1, 26, 2.2, 2.2, CH - 30, { tone: 1.3, edge: "faint", ao: false, sil: false }); // back slats
  g.box(CX0 + 3, 2, 26, CX1 - CX0 - 6, CD - 4, 12, { tone: 1.2, ao: false }); // mattress base
  g.softBox(CX0 + 4, 4, 38, CX1 - CX0 - 8, CD - 8, 10, 4, { tone: 1.9 }); // mattress
  g.softBox(CX0 + 10, 10, 46, 34, 22, 7, 4, { tone: 2.2 }); // pillow
  g.poly3([[CX0 + 60, 8, 48.5], [CX1 - 8, 8, 48.5], [CX1 - 8, CD - 8, 48.5], [CX0 + 60, CD - 8, 48.5]], { fill: "ink", fop: t.top * 2.2, stroke: "det", solid: true }); // blanket
  g.box(CX0, 0, CH - 4, CX1 - CX0, 5, 5, { tone: 1.35, ao: false }); // back top rail
  g.box(CX0, CD - 5, 0, 5, 5, CH + 6, { tone: 1.3, ao: false }); // near-left post
  g.box(CX0, CD - 5, 22, CX1 - CX0, 5, 4, { tone: 1.35, ao: false }); // front bottom rail
  for (let x = CX0 + 10; x < CX1 - 6; x += 9) g.box(x, CD - 4, 26, 2.2, 2.2, CH - 30, { tone: 1.45, edge: "det", ao: false, sil: false }); // front slats
  g.box(CX0, CD - 5, CH - 4, CX1 - CX0, 5, 5, { tone: 1.35, ao: false }); // front top rail
  g.box(CX1 - 5, CD - 5, 0, 5, 5, CH + 6, { tone: 1.3, ao: false }); // near-right post
  g.box(CX1 - 5, 5, CH - 4, 5, CD - 10, 5, { tone: 1.35, ao: false }); // end rail

  // ── changing dresser ─────────────────────────────────────────────
  g.hot("changing");
  const DX = 206, DW = 100, DD = 54, DH = 88;
  g.box(DX, 0, 0, DW, DD, DH, { tone: 1.15 });
  g.path(g.rect3("y", DD + 0.05, DX + 0.5, 0, DX + DW - 0.5, 7), { fill: "shade", fop: t.recess * 0.55, stroke: null });
  for (const [z0, z1] of [[8, 34], [36, 60], [62, 85]]) {
    g.shaker("y", DD, DX, z0, DX + DW / 2, z1, 3.5);
    g.shaker("y", DD, DX + DW / 2, z0, DX + DW, z1, 3.5);
  }
  for (const z of [21, 48, 73]) {
    g.path(g.circle3("y", DD + 0.2, DX + DW / 4, z, 2, 12), { fill: "ink", fop: t.top * 2, stroke: "det" });
    g.path(g.circle3("y", DD + 0.2, DX + (DW * 3) / 4, z, 2, 12), { fill: "ink", fop: t.top * 2, stroke: "det" });
  }
  g.softBox(DX + 6, 4, DH, DW - 12, DD - 8, 10, 4, { tone: 1.9 }); // changing pad
  g.line3([DX + 30, 6, DH + 10.2], [DX + 30, DD - 6, DH + 10.2], { stroke: "faint" });
  g.line3([DX + DW - 30, 6, DH + 10.2], [DX + DW - 30, DD - 6, DH + 10.2], { stroke: "faint" });

  // ── wardrobe closing the run ─────────────────────────────────────
  g.hot("storage");
  const WX = 350, WW = 96, WD = 56, WH = 188;
  g.box(WX, 0, 0, WW, WD, WH, { tone: 1.15 });
  g.path(g.rect3("y", WD + 0.05, WX + 0.5, 0, WX + WW - 0.5, 8), { fill: "shade", fop: t.recess * 0.55, stroke: null });
  g.shaker("y", WD, WX, 9, WX + WW / 2, WH - 2, 5);
  g.shaker("y", WD, WX + WW / 2, 9, WX + WW, WH - 2, 5);
  for (const x of [WX + WW / 2 - 7, WX + WW / 2 + 7]) g.path(g.circle3("y", WD + 0.2, x, 100, 2.4, 12), { fill: "ink", fop: t.top * 2, stroke: "det" });

  // ── toys on the rug ──────────────────────────────────────────────
  g.hot("toys");
  for (const [x, y, z, k] of [[190, 150, 0, 1.6], [202, 150, 0, 2], [196, 150, 12, 1.8], [236, 176, 0, 1.5]] as [number, number, number, number][]) g.box(x, y, z, 11, 11, 11, { tone: k, edge: "det", ao: false });
  g.softBox(252, 128, 0, 22, 22, 22, 11, { tone: 1.9 }); // ball
  g.curve3([[255, 150, 11], [263, 150.5, 16], [272, 150, 11]], { stroke: "det", sw: 0.6 });

  return g.result();
}
