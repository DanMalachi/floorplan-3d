// Dining room, round 4 kit. Table for six in the middle of the room: three
// chairs on the far side facing the viewer, one at each end, a bench on the
// near side (low, so it hides nothing). Back wall: sideboard with a print
// over it, the clock, a tall plant in the corner. Centrepiece on the table.
// Rug under it all. Ids = DINING_HOTSPOTS.

import { Kit, type NavTheme } from "./kit";
import { shell, art, clock, plant, rug, table, chair } from "./props";

export function diningCorner(theme: NavTheme) {
  const g = new Kit(theme), t = g.t;
  const B = 440, S = 250;
  shell(g, { back: B, side: S, floor: "planks" });

  g.hot("rug");
  rug(g, 84, 44, 376, 238, "border");

  g.hot("art");
  art(g, "back", 172, 124, 84, 56, "boat");
  g.hot("clock");
  clock(g, "back", 362, 172, 17);

  g.hot("decor");
  plant(g, 34, 32, 0, 17, 42, 100, 11);

  // sideboard (scenery)
  g.deco();
  g.floorShadow(118, 0, 306, 48);
  g.box(120, 0, 10, 184, 44, 72, { tone: 1.1 });
  for (const [a0, a1] of [[121, 182], [183, 243], [244, 303]]) g.shaker("y", 44, a0, 13, a1, 79, 4);
  for (const x of [178, 187, 239, 248]) g.box(x, 44, 42, 2, 2.4, 10, { tone: 1.6, edge: "faint", ao: false });
  for (const x of [124, 296]) g.box(x, 36, 0, 4, 4, 10, { tone: 1.2, ao: false });
  g.cyl(146, 22, 82, 22, 6, 4, { fop: t.left * 1.5 }); // bottle vase
  g.cyl(280, 22, 82, 8, 10, 12, { topFop: t.recess * 0.8 }); // bowl

  // ── far chairs, the table, the end chairs, the bench ─────────────
  g.floorShadow(128, 84, 312, 178);
  g.hot("chairs");
  for (const x of [150, 198, 246]) chair(g, x, 50, "+y");
  chair(g, 92, 108, "+x");

  g.hot("table");
  table(g, 130, 84, 180, 92, 75, { leg: 5, inset: 6 });
  g.hot("decor");
  plant(g, 220, 130, 75, 7, 13, 26, 7);

  g.hot("chairs");
  chair(g, 318, 110, "-x");

  g.hot("bench");
  const BX = 150, BY = 186, BW = 140, BD = 36, BH = 45;
  for (const x of [BX + 8, BX + BW - 14]) g.box(x, BY + 4, 0, 6, BD - 8, BH - 5, { tone: 1.2, ao: false });
  g.box(BX + 14, BY + BD / 2 - 2, 14, BW - 28, 4, 4, { tone: 1.2, ao: false }); // stretcher
  g.box(BX, BY, BH - 5, BW, BD, 5, { tone: 1.4, ao: false });

  return g.result();
}
