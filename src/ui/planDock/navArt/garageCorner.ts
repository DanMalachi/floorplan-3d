// Garage, round 4 kit. Back wall, corner outwards: workbench with a vise and a
// toolbox on it, a pegboard of hanging tools over it | rolling tool chest |
// metal shelving rack of bins and boxes closing the run. Side wall: the
// sectional garage door. Concrete slab. Ids = GARAGE_HOTSPOTS.

import { Kit, type NavTheme } from "./kit";
import { shell } from "./props";

export function garageCorner(theme: NavTheme) {
  const g = new Kit(theme), t = g.t;
  const B = 470, S = 240;
  shell(g, { back: B, side: S, floor: "concrete" });
  g.floorShadow(46, 0, 236, 70);
  g.floorShadow(326, 0, 446, 50);

  // side wall: sectional door, four panels, with a handle
  g.deco();
  const DY0 = 30, DY1 = 220, DZ1 = 212;
  g.poly3([[0.3, DY0, 0], [0.3, DY1, 0], [0.3, DY1, DZ1], [0.3, DY0, DZ1]], { fill: "ink", fop: t.right * 1.5, stroke: "det", solid: true });
  for (let i = 1; i < 4; i++) g.line3([0.4, DY0, (DZ1 * i) / 4], [0.4, DY1, (DZ1 * i) / 4], { stroke: "det" });
  for (let i = 0; i < 4; i++) for (let y = DY0 + 8; y < DY1 - 20; y += 48) g.path(g.rect3("x", 0.5, y, (DZ1 * i) / 4 + 8, y + 38, (DZ1 * (i + 1)) / 4 - 8), { stroke: "faint" });
  g.box(0, (DY0 + DY1) / 2 - 10, 42, 3, 20, 3, { tone: 1.8, ao: false });

  // ── pegboard of tools (the "tools" hotspot, with the chest) ─────
  g.hot("tools");
  const PX0 = 56, PX1 = 226, PZ0 = 110, PZ1 = 196;
  g.box(PX0, 0, PZ0, PX1 - PX0, 2, PZ1 - PZ0, { tone: 1.2, ao: false });
  for (let x = PX0 + 6; x < PX1 - 3; x += 7) for (let z = PZ0 + 6; z < PZ1 - 3; z += 7) g.path(g.circle3("y", 2.1, x, z, 0.7, 6), { fill: "shade", fop: t.recess * 1.2, stroke: null });
  // hammer, wrenches, a saw, screwdrivers, a coil of cable
  const T = (pts: [number, number][], sw = 1.6) => g.curve3(pts.map(([x, z]) => [x, 3, z] as [number, number, number]), { stroke: "sil", sw });
  T([[72, 124], [72, 170]], 2.2);
  g.box(64, 1, 170, 16, 4, 7, { tone: 2, edge: "det", ao: false });
  for (const [x, l] of [[92, 34], [100, 40], [108, 46]]) {
    T([[x, 184 - l], [x, 184]], 1.3);
    g.path(g.circle3("y", 3, x, 184 - l, 2.6, 12), { stroke: "sil", sw: 1 });
  }
  g.poly3([[122, 3, 186], [168, 3, 186], [168, 3, 176], [126, 3, 170]], { fill: "ink", fop: t.top * 1.9, stroke: "det", solid: true });
  g.box(166, 1, 176, 10, 4, 12, { tone: 1.9, edge: "det", ao: false });
  for (const x of [186, 194, 202]) {
    g.box(x - 1.5, 1, 160, 3, 3, 12, { tone: 2, edge: "det", ao: false });
    T([[x, 160], [x, 140]], 0.9);
  }
  g.path(g.circle3("y", 3, 214, 130, 9, 20), { stroke: "sil", sw: 1.6 });
  g.path(g.circle3("y", 3, 214, 130, 5, 16), { stroke: "det", sw: 1.2 });

  // ── workbench ────────────────────────────────────────────────────
  g.hot("workbench");
  const WX0 = 50, WX1 = 232, WD = 64, WH = 90;
  for (const [x, y] of [[WX0 + 3, 3], [WX1 - 9, 3], [WX0 + 3, WD - 9], [WX1 - 9, WD - 9]]) g.box(x, y, 0, 6, 6, WH - 6, { tone: 1.2, ao: false });
  g.box(WX0 + 4, 4, 18, WX1 - WX0 - 8, WD - 8, 3, { tone: 1.25, ao: false }); // lower shelf
  for (const [x, w, k] of [[62, 40, 1.6], [110, 34, 1.9], [150, 44, 1.5]] as [number, number, number][]) g.box(x, 10, 21, w, 40, 26, { tone: k, edge: "det", ao: false });
  g.box(WX0, 0, WH - 6, WX1 - WX0, WD, 6, { tone: 1.45, ao: false }); // top
  for (let x = WX0 + 10; x < WX1; x += 26) g.line3([x, 0, WH + 0.05], [x, WD, WH + 0.05], { stroke: "faint", sw: 0.3 });
  g.box(WX0 + 8, 30, WH, 22, 26, 12, { tone: 1.8, edge: "det", ao: false }); // vise
  g.box(WX0 + 8, WD - 4, WH + 2, 22, 6, 8, { tone: 2, edge: "det", ao: false });
  g.line3([WX0 + 6, WD + 3, WH + 6], [WX0 + 32, WD + 3, WH + 6], { stroke: "sil", sw: 1.6 });
  g.box(150, 14, WH, 56, 26, 20, { tone: 1.9, edge: "det" }); // toolbox
  g.curve3([[164, 27, WH + 20], [166, 27, WH + 27], [190, 27, WH + 27], [192, 27, WH + 20]], { stroke: "sil", sw: 1.4 });

  // ── rolling tool chest ───────────────────────────────────────────
  g.hot("tools");
  const CX = 246, CW = 62, CD = 46, CH = 104;
  for (const x of [CX + 6, CX + CW - 10]) g.cyl(x, CD - 6, 0, 8, 4, 4);
  g.box(CX, 0, 8, CW, CD, CH - 8, { tone: 1.3 });
  let z = 12;
  for (const h of [22, 18, 14, 14, 12, 10]) {
    g.path(g.rect3("y", CD + 0.05, CX + 3, z, CX + CW - 3, z + h - 2), { stroke: "det" });
    g.box(CX + 12, CD, z + h - 7, CW - 24, 2.4, 2, { tone: 1.9, edge: "faint", ao: false });
    z += h;
  }
  g.box(CX - 1, 0, CH, CW + 2, CD + 2, 3, { tone: 1.6, ao: false });

  // ── metal shelving rack ──────────────────────────────────────────
  g.hot("shelving");
  const RX0 = 330, RX1 = 444, RD = 46, RH = 200;
  for (const [x, y] of [[RX0, 0], [RX1 - 3, 0]]) g.box(x, y, 0, 3, 3, RH, { tone: 1.5, ao: false });
  const levels = [8, 58, 108, 158, RH - 3];
  const stuff: [number, number, number, number, number][] = [
    [336, 11, 50, 34, 1.7], [390, 11, 46, 28, 2],
    [334, 61, 30, 38, 1.5], [368, 61, 34, 30, 1.9], [406, 61, 32, 40, 1.6],
    [338, 111, 60, 26, 1.8], [402, 111, 36, 36, 1.5],
    [340, 161, 44, 30, 2], [390, 161, 48, 22, 1.7],
  ];
  // bottom-up, board then what stands on it: each board must paint over the
  // backs of the boxes on the level below
  for (const lz of levels) {
    g.box(RX0, 0, lz, RX1 - RX0, RD, 3, { tone: 1.4, ao: false });
    for (const [x, sz, w, h, k] of stuff) if (sz === lz + 3) g.box(x, 6, sz, w, RD - 10, h, { tone: k, edge: "det", ao: false });
  }
  for (const [x, y] of [[RX0, RD - 3], [RX1 - 3, RD - 3]]) g.box(x, y, 0, 3, 3, RH, { tone: 1.6, ao: false });
  for (const lz of levels) g.line3([RX0, RD, lz + 1.5], [RX1, RD, lz + 1.5], { stroke: "sil", sw: 1.1 });

  return g.result();
}
