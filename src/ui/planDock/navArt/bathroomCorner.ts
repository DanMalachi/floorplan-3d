// Bathroom, round 4 kit: same two-wall corner as the kitchen (back wall along
// +x at y=0, side wall along +y at x=0, corner at the origin; mirrored in
// English). Real sizes in cm. Drawn back-to-front: the camera sees +x and +y
// faces, so larger x / larger y is nearer and paints later.
//
// Back wall, corner outwards: bathtub (170×75) with a glass shower screen and
// riser rail at its tap end | close-coupled toilet, lid up (the approved icon's
// recipe), a small print over it | wall-hung vanity with a vessel basin,
// mirror and light bar over it | front-loading washer closing the run (Israeli
// bathrooms routinely hold the laundry pair). Side wall: heated towel ladder,
// pedal bin. Bath mat in front of the tub.
//
// Hotspot ids are BATHROOM_HOTSPOTS ids (BathroomScene.tsx) — all ten drawn.

import { Kit, type NavTheme, type P3 } from "./kit";

export function bathroomCorner(theme: NavTheme) {
  const g = new Kit(theme), t = g.t;
  const WALL_H = 230, BACK_END = 430, SIDE_END = 170;

  // ── floor + walls ────────────────────────────────────────────────
  g.hot("floor");
  g.slab(0, 0, BACK_END, SIDE_END, 6, "tiles");

  g.deco();
  g.poly3([[-12, 0, 0], [BACK_END, 0, 0], [BACK_END, 0, WALL_H], [-12, 0, WALL_H]], { fill: "ink", fop: t.wall, stroke: "faint" });
  g.poly3([[-12, -12, WALL_H], [BACK_END, -12, WALL_H], [BACK_END, 0, WALL_H], [-12, 0, WALL_H]], { fill: "ink", fop: t.cut, stroke: "sil", solid: true });
  g.poly3([[BACK_END, -12, 0], [BACK_END, 0, 0], [BACK_END, 0, WALL_H], [BACK_END, -12, WALL_H]], { fill: "ink", fop: t.cut * 0.7, stroke: "det", solid: true });
  g.poly3([[0, 0, 0], [0, SIDE_END, 0], [0, SIDE_END, WALL_H], [0, 0, WALL_H]], { fill: "ink", fop: t.wall * 1.35, stroke: "faint" });
  g.poly3([[-12, -12, WALL_H], [0, -12, WALL_H], [0, SIDE_END, WALL_H], [-12, SIDE_END, WALL_H]], { fill: "ink", fop: t.cut, stroke: "sil", solid: true });
  g.poly3([[-12, SIDE_END, 0], [0, SIDE_END, 0], [0, SIDE_END, WALL_H], [-12, SIDE_END, WALL_H]], { fill: "ink", fop: t.cut * 0.8, stroke: "det", solid: true });
  g.line3([0, 0, 0], [0, 0, WALL_H], { stroke: "faint" });
  // wet zone: 30cm tiles to 200 around the tub, and a tiled band to 120 elsewhere
  for (let z = 30; z <= 200; z += 30) g.line3([0, 0, z], [178, 0, z], { stroke: "faint", sw: 0.25 });
  for (let x = 30; x < 178; x += 30) g.line3([x, 0, 56], [x, 0, 200], { stroke: "faint", sw: 0.25 });
  for (let z = 30; z <= 200; z += 30) g.line3([0, 0, z], [0, 80, z], { stroke: "faint", sw: 0.25 });
  for (let y = 30; y < 80; y += 30) g.line3([0, y, 56], [0, y, 200], { stroke: "faint", sw: 0.25 });
  g.line3([178, 0, 120], [BACK_END, 0, 120], { stroke: "faint" });
  g.line3([0, 80, 120], [0, SIDE_END, 120], { stroke: "faint" });
  // frosted window high over the tub
  g.poly3([[40, -10, 150], [104, -10, 150], [104, -10, 204], [40, -10, 204]], { fill: "ink", fop: t.glass * 0.55, stroke: "det" });
  g.poly3([[40, -10, 150], [104, -10, 150], [104, 0, 150], [40, 0, 150]], { fill: "ink", fop: t.top, stroke: "det", solid: true });
  g.poly3([[40, -10, 150], [40, 0, 150], [40, 0, 204], [40, -10, 204]], { fill: "ink", fop: t.right * 1.3, stroke: "det", solid: true });
  g.path(g.rect3("y", -9.5, 42, 152, 102, 202), { stroke: "det", sw: 1.1 });
  g.line3([72, -9.5, 152], [72, -9.5, 202], { stroke: "det", sw: 1.1 });
  // soft shadows
  g.floorShadow(0, 0, 176, 80);
  g.floorShadow(186, 0, 226, 70);
  g.floorShadow(352, 0, 418, 64);
  g.wallShadow([[247, 0, 18], [345, 0, 18], [349, 0, 8], [251, 0, 8]]);

  // ── bath mat (on the floor, so first) ────────────────────────────
  g.hot("rug");
  g.poly3([[34, 88, 0.3], [124, 88, 0.3], [124, 136, 0.3], [34, 136, 0.3]], { fill: "ink", fop: t.top * 1.4, stroke: "det", solid: true });
  g.poly3([[40, 94, 0.4], [118, 94, 0.4], [118, 130, 0.4], [40, 130, 0.4]], { stroke: "faint" });
  for (let x = 46; x < 116; x += 5) g.line3([x, 94, 0.45], [x, 130, 0.45], { stroke: "faint", sw: 0.25 });

  // ── bathtub in the corner ────────────────────────────────────────
  g.hot("bathtub");
  const TW = 170, TD = 75, TH = 56;
  g.box(0, 0, 0, TW, TD, TH, { tone: 1.35 });
  g.path(g.rect3("y", TD + 0.05, 1, 0, TW - 1, 7), { fill: "shade", fop: t.recess * 0.45, stroke: null }); // plinth recess
  g.path(g.rect3("y", TD + 0.05, 6, 11, TW - 6, TH - 6), { stroke: "faint" }); // apron panel
  g.path(g.rrect3("z", TH + 0.05, 7, 7, TW - 7, TD - 7, 16), { fill: "shade", fop: t.recess * 0.75, stroke: "det" });
  g.path(g.rrect3("z", TH + 0.1, 14, 13, TW - 14, TD - 13, 12), { fill: "ink", fop: t.top * 0.9, stroke: "faint", solid: true });
  g.path(g.circle3("z", TH + 0.15, TW - 26, TD / 2, 2.4, 14), { fill: "ink", fop: t.sil, stroke: null }); // drain
  // mixer + spout at the tap end, on the wall
  g.box(142, 0, 66, 18, 5, 7, { tone: 1.8, edge: "det", ao: false });
  g.curve3([[151, 5, 69], [151, 12, 69], [151, 16, 64]], { stroke: "sil", sw: 1.8 });

  // ── shower: riser rail, head, hose, glass screen on the rim ──────
  g.hot("shower");
  g.box(149, 0, 96, 3, 3, 108, { tone: 1.8, edge: "faint", ao: false }); // riser rail
  g.box(146, 0, 90, 9, 5, 6, { tone: 1.8, edge: "det", ao: false }); // valve
  g.curve3([[150.5, 3, 190], [150.5, 16, 190]], { stroke: "sil", sw: 1.6 });
  g.path(g.circle3("z", 189, 150.5, 20, 7, 20), { fill: "ink", fop: t.top * 1.8, stroke: "sil", solid: true }); // head
  g.curve3([[150.5, 4, 93], [146, 10, 80], [140, 12, 74], [142, 8, 130], [150.5, 16, 186]], { stroke: "det", sw: 0.8 }); // hose
  const SX0 = 92, SX1 = TW - 2, SY = TD - 3, SZ0 = TH, SZ1 = 200;
  g.poly3([[SX0, SY, SZ0], [SX1, SY, SZ0], [SX1, SY, SZ1], [SX0, SY, SZ1]], { fill: "ink", fop: t.glass * 0.28, stroke: "det" });
  g.line3([SX0, SY, SZ1], [SX1, SY, SZ1], { stroke: "sil", sw: 1.2 });
  g.line3([SX1, SY, SZ0], [SX1, SY, SZ1], { stroke: "sil", sw: 1.2 });
  g.line3([SX0 + 10, SY, SZ1 - 14], [SX0 + 30, SY, SZ1 - 64], { stroke: 0.14, sw: 1.4 });
  g.line3([SX0 + 18, SY, SZ1 - 14], [SX0 + 38, SY, SZ1 - 64], { stroke: 0.1, sw: 1 });
  g.box(SX1 - 2, 0, SZ1 - 3, 2, SY, 2, { tone: 1.8, edge: "faint", ao: false }); // stay bar to the wall

  // ── print over the toilet ────────────────────────────────────────
  g.hot("art");
  g.box(188, 0, 126, 36, 3, 46, { tone: 1.1, ao: false });
  g.path(g.rect3("y", 3.1, 191, 129, 221, 169), { fill: "ink", fop: t.top * 1.4, stroke: "faint" });
  g.path(g.rect3("y", 3.2, 195, 134, 217, 164), { fill: "shade", fop: t.recess * 0.45, stroke: "faint" });
  g.curve3([[206, 3.3, 136], [206, 3.3, 156]], { stroke: "det", sw: 0.8 });
  for (const [dz, dir] of [[142, -1], [148, 1], [153, -1], [158, 1]] as [number, number][]) g.curve3([[206, 3.3, dz], [206 + dir * 5, 3.3, dz + 3], [206 + dir * 7, 3.3, dz + 1]], { stroke: "det", sw: 0.7 });

  // ── toilet, close-coupled, lid up ────────────────────────────────
  g.hot("toilet");
  const CX = 206;
  g.box(CX - 19, 0, 38, 38, 17, 42, { tone: 1.45 }); // cistern
  g.path(g.circle3("z", 80.05, CX, 8.5, 3.2, 16), { fill: "ink", fop: t.top * 1.9, stroke: "det" }); // flush button
  g.path(g.rrect3("y", 18, CX - 17, 41, CX + 17, 88, 13), { fill: "ink", fop: t.left * 1.6, stroke: "det", solid: true }); // raised lid
  g.path(g.rrect3("y", 18.1, CX - 13, 45, CX + 13, 84, 10), { stroke: "faint" });
  g.box(CX - 9, 20, 0, 18, 30, 26, { tone: 1.4 }); // pedestal
  g.softBox(CX - 18, 16, 24, 36, 52, 15, 8, { tone: 1.45 }); // bowl
  g.path(g.rrect3("z", 39.2, CX - 17, 18, CX + 17, 67, 14), { fill: "ink", fop: t.top * 1.6, stroke: "det", solid: true }); // seat
  g.path(g.rrect3("z", 39.3, CX - 11, 25, CX + 11, 60, 9), { fill: "shade", fop: t.recess * 1.2, stroke: null }); // opening

  // ── mirror + light over the vanity ───────────────────────────────
  g.hot("mirror");
  g.box(254, 0, 108, 82, 3, 80, { tone: 1.6, ao: false });
  g.raw(`<path d="${g.rect3("y", 3.1, 257, 111, 333, 185)}" fill="url(#sheen)"/>`);
  g.line3([262, 3.1, 176], [276, 3.1, 150], { stroke: 0.16, sw: 1.3 });
  g.line3([270, 3.1, 176], [284, 3.1, 150], { stroke: 0.1, sw: 0.9 });
  g.box(270, 0, 196, 50, 9, 4, { tone: 2, edge: "det", ao: false }); // light bar

  // ── wall-hung vanity, two drawers, vessel basin ──────────────────
  g.hot("vanity");
  const VX0 = 246, VW = 100, VD = 48;
  g.box(VX0, 0, 22, VW, VD, 60, { tone: 1.1 });
  g.shaker("y", VD, VX0 + 1, 24, VX0 + VW - 1, 51, 3.5);
  g.shaker("y", VD, VX0 + 1, 53, VX0 + VW - 1, 80, 3.5);
  g.barH(VX0 + 36, VD, 47, 28);
  g.barH(VX0 + 36, VD, 76, 28);
  g.box(VX0 - 2, 0, 82, VW + 4, VD + 2, 4, { tone: 1.35, ao: false }); // top
  g.cyl(296, 24, 86, 14, 15, 20, { topFop: t.top * 1.4 });
  g.ellipseZ(296, 24, 100.1, 16.5, { fill: "shade", fop: t.recess * 0.8, stroke: "faint" });
  g.box(294, 0, 86, 4, 6, 26, { tone: 1.8, edge: "det", ao: false }); // tall tap
  g.curve3([[296, 6, 110], [296, 14, 110], [296, 18, 105]], { stroke: "sil", sw: 1.6 });
  g.deco(); // soap and a bottle
  g.cyl(262, 20, 86, 12, 3.2, 3.2, { fop: t.left * 1.4 });
  g.cyl(262, 20, 98, 3, 1, 1);
  g.cyl(330, 22, 86, 3, 5, 5, { fop: t.left * 1.2 });

  // ── front-loading washer closing the run ─────────────────────────
  g.hot("washer");
  const WX0 = 356, WW = 60, WD = 60, WH = 85;
  g.box(WX0, 0, 0, WW, WD, WH, { tone: 1.3 });
  g.line3([WX0 + 1, WD + 0.05, 71], [WX0 + WW - 1, WD + 0.05, 71], { stroke: "det" });
  g.path(g.rect3("y", WD + 0.1, WX0 + 4, 74, WX0 + 22, 82), { stroke: "det" }); // detergent drawer
  g.path(g.rect3("y", WD + 0.1, WX0 + 28, 75, WX0 + 42, 81), { fill: "shade", fop: t.recess * 0.9, stroke: "faint" }); // display
  g.path(g.circle3("y", WD + 0.1, WX0 + 51, 78, 3.4, 16), { fill: "ink", fop: t.top * 1.8, stroke: "det" }); // dial
  g.path(g.circle3("y", WD + 0.1, WX0 + WW / 2, 36, 22, 40), { fill: "ink", fop: t.top * 1.7, stroke: "det", solid: true }); // door ring
  g.path(g.circle3("y", WD + 0.2, WX0 + WW / 2, 36, 15.5, 40), { fill: "shade", fop: t.recess * 1.4, stroke: "det" }); // door glass
  g.curve3([[WX0 + 20, WD + 0.3, 42], [WX0 + 23, WD + 0.3, 47], [WX0 + 28, WD + 0.3, 49]], { stroke: 0.2, sw: 1.2 });
  g.box(WX0 + WW / 2 + 19, WD, 32, 2.5, 2, 8, { tone: 1.8, edge: "faint", ao: false }); // door catch
  g.line3([WX0 + 1, WD + 0.05, 4], [WX0 + WW - 1, WD + 0.05, 4], { stroke: "faint" });

  // ── side wall: heated towel ladder with a towel ──────────────────
  g.hot("towels");
  const LY0 = 98, LY1 = 146, LX = 5;
  for (const y of [LY0, LY1]) g.box(0, y - 1.5, 30, LX, 3, 124, { tone: 1.8, edge: "faint", ao: false });
  for (let z = 40; z <= 150; z += 12) g.box(LX - 1.5, LY0, z, 2.4, LY1 - LY0, 2, { tone: 1.7, edge: "faint", ao: false, noRight: false });
  const towel: P3[] = [[LX + 2, LY0 + 4, 147], [LX + 2, LY1 - 4, 147], [LX + 2.5, LY1 - 6, 96], [LX + 2.5, (LY0 + LY1) / 2 + 6, 101], [LX + 2.5, (LY0 + LY1) / 2 - 2, 97], [LX + 2.5, LY0 + 6, 100]];
  g.poly3(towel, { fill: "ink", fop: t.right * 2.2, stroke: "det", solid: true });
  g.line3([LX + 2.6, LY0 + 5, 140], [LX + 2.6, LY1 - 5, 140], { stroke: "faint" });
  g.line3([LX + 2.6, LY0 + 5, 108], [LX + 2.6, LY1 - 5, 108], { stroke: "faint" });

  // ── pedal bin on the floor by the side wall ──────────────────────
  g.hot("bin");
  g.floorShadow(10, 140, 34, 164);
  g.cyl(22, 152, 0, 30, 11, 11, { fop: t.left * 1.3 });
  g.cyl(22, 152, 30, 3, 11.6, 11.2, { topFop: t.top * 1.5 });
  g.box(16, 162, 0, 12, 5, 3, { tone: 1.5, edge: "faint", ao: false });

  return g.result();
}
