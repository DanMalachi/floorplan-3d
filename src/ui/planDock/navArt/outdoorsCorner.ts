// Balcony / patio, round 4 kit. The back wall is the house front: a sliding
// glass door and a wall light. A glass railing on posts stands where the side
// wall would be. Deck boards. Corner outwards: a tall planter in the corner |
// bench under the window line | the gas grill closing the run. A round table
// with three chairs in the open, a trough planter along the railing.
// Ids = OUTDOORS_HOTSPOTS.

import { Kit, type NavTheme } from "./kit";
import { shell, plant, chair } from "./props";

export function outdoorsCorner(theme: NavTheme) {
  const g = new Kit(theme), t = g.t;
  const B = 450, S = 240;
  shell(g, { back: B, side: S, floor: "planks", sideWall: false });

  // ── the house front: sliding door + wall light ──────────────────
  g.deco();
  const SX0 = 150, SX1 = 310, SZ = 212;
  g.poly3([[SX0, -10, 0], [SX1, -10, 0], [SX1, -10, SZ], [SX0, -10, SZ]], { fill: "ink", fop: t.glass * 0.3, stroke: "det" });
  g.poly3([[SX0, -10, 0], [SX0, 0, 0], [SX0, 0, SZ], [SX0, -10, SZ]], { fill: "ink", fop: t.right * 1.3, stroke: "det", solid: true });
  g.path(g.rect3("y", -9.5, SX0 + 3, 3, (SX0 + SX1) / 2 + 2, SZ - 3), { stroke: "det", sw: 1.3 });
  g.path(g.rect3("y", -7.5, (SX0 + SX1) / 2 - 2, 3, SX1 - 3, SZ - 3), { stroke: "det", sw: 1.3 });
  g.line3([SX0 + 12, -9.5, SZ - 10], [SX0 + 30, -9.5, SZ - 60], { stroke: 0.14, sw: 1.4 });
  g.line3([SX0 + 22, -9.5, SZ - 10], [SX0 + 40, -9.5, SZ - 60], { stroke: 0.1, sw: 1 });
  g.box((SX0 + SX1) / 2 + 8, -7.5, 90, 2.5, 3, 26, { tone: 1.8, edge: "faint", ao: false });
  g.box(SX0 - 4, -10, SZ, SX1 - SX0 + 8, 12, 4, { tone: 1.2, ao: false });
  g.box(332, 0, 176, 10, 8, 16, { tone: 1.9, edge: "det", ao: false }); // wall light
  g.floorShadow(50, 0, 142, 52);
  g.floorShadow(338, 0, 420, 66);

  // ── corner planter, bench ────────────────────────────────────────
  g.hot("decor");
  g.box(10, 8, 0, 44, 44, 50, { tone: 1.3 });
  g.path(g.rect3("z", 50.05, 14, 12, 50, 48), { fill: "shade", fop: t.recess * 0.9, stroke: "faint" });
  plant(g, 32, 30, 48, 0, 0, 96, 13, 44);

  g.hot("seating");
  const BX0 = 62, BX1 = 140;
  for (const x of [BX0 + 4, BX1 - 10]) g.box(x, 2, 0, 6, 6, 84, { tone: 1.2, ao: false }); // back posts
  for (const z of [56, 68, 80]) g.box(BX0 + 2, 3, z, BX1 - BX0 - 4, 3, 7, { tone: 1.4, ao: false }); // back slats
  for (const x of [BX0 + 4, BX1 - 10]) g.box(x, 38, 0, 6, 6, 40, { tone: 1.2, ao: false }); // front legs
  g.box(BX0, 6, 40, BX1 - BX0, 40, 5, { tone: 1.4, ao: false }); // seat
  g.softBox(BX0 + 3, 8, 45, BX1 - BX0 - 6, 36, 6, 3, { tone: 1.9 }); // seat pad

  // ── gas grill closing the run ────────────────────────────────────
  g.hot("grill");
  const GX = 340, GW = 78, GD = 56;
  for (const x of [GX + 4, GX + GW - 8]) g.cyl(x, GD - 6, 0, 8, 4, 4);
  g.box(GX, 2, 8, GW, GD - 4, 72, { tone: 1.3 }); // cart
  g.shaker("y", GD - 2, GX, 12, GX + GW / 2, 76, 4);
  g.shaker("y", GD - 2, GX + GW / 2, 12, GX + GW, 76, 4);
  g.box(GX + 4, 4, 80, GW - 8, GD - 8, 12, { tone: 1.5 }); // firebox
  for (const x of [GX + 14, GX + 30, GX + 46, GX + 62]) g.path(g.circle3("y", GD - 4 + 0.1, x, 86, 2.4, 12), { fill: "ink", fop: t.top * 2, stroke: "det" });
  // domed lid: a half-cylinder along x — the swept surface, then the end cap we can see
  const arc: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI;
    arc.push([4 + (GD - 8) * (1 - Math.cos(a)) * 0.5, 92 + 20 * Math.sin(a)]);
  }
  const at = (x: number) => arc.map(([y, z]) => [x, y, z] as [number, number, number]);
  g.poly3([...at(GX + 4), ...at(GX + GW - 4).reverse()], { fill: "ink", fop: t.top * 1.7, stroke: "det", solid: true });
  g.poly3(at(GX + GW - 4), { fill: "ink", fop: t.right * 1.8, stroke: "sil", solid: true });
  g.line3([GX + 16, GD - 3, 100], [GX + GW - 16, GD - 3, 100], { stroke: "sil", sw: 2 }); // lid handle
  g.box(GX + GW, 8, 78, 26, 40, 3, { tone: 1.5, ao: false }); // side shelf

  // ── glass railing on the side: posts, top rail, panels ───────────
  g.deco();
  for (const y of [4, 118, 232]) g.box(0, y, 0, 5, 5, 104, { tone: 1.6, ao: false });
  g.poly3([[2, 8, 6], [2, 118, 6], [2, 118, 98], [2, 8, 98]], { fill: "ink", fop: t.glass * 0.35, stroke: "det" });
  g.poly3([[2, 122, 6], [2, 232, 6], [2, 232, 98], [2, 122, 98]], { fill: "ink", fop: t.glass * 0.35, stroke: "det" });
  g.line3([2, 20, 90], [2, 50, 30], { stroke: 0.12, sw: 1.2 });
  g.line3([2, 134, 90], [2, 164, 30], { stroke: 0.12, sw: 1.2 });
  g.box(0, 0, 104, 7, S, 4, { tone: 1.6, ao: false });

  // ── trough planter along the railing ─────────────────────────────
  g.hot("decor");
  g.box(12, 130, 0, 30, 90, 36, { tone: 1.3 });
  for (const [y, h, n] of [[150, 40, 7], [176, 52, 9], [202, 36, 7]] as [number, number, number][]) plant(g, 27, y, 34, 0, 0, h, n, 26);

  // ── table and chairs in the open ─────────────────────────────────
  g.hot("seating");
  chair(g, 196, 84, "+y", { back: 84 });
  chair(g, 128, 142, "+x", { back: 84 });
  g.hot("table");
  const TX = 218, TY = 150, TR = 42;
  g.floorShadow(TX - 40, TY - 30, TX + 40, TY + 30);
  g.cyl(TX, TY, 0, 3, 22, 22);
  g.cyl(TX, TY, 3, 66, 3.5, 3.5);
  g.cyl(TX, TY, 69, 4, TR, TR, { fop: t.left * 1.3, topFop: t.top * 1.5 });
  g.cyl(TX - 12, TY - 8, 73, 10, 3, 3, { fop: t.left * 1.8 }); // a glass
  g.hot("seating");
  chair(g, 272, 128, "-x", { back: 84 });

  return g.result();
}
