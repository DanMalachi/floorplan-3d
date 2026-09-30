// Living room, round 4 kit. Back wall, corner outwards: floor lamp | three-
// seat sofa facing the viewer, print over it | side table with a plant, the
// clock over it | a tall plant at the open end. Side wall: media console with
// the TV over it, facing the sofa's end of the room. Rug with a coffee table
// in front of the sofa. Ids = LIVING_HOTSPOTS.

import { Kit, type NavTheme } from "./kit";
import { shell, art, clock, tv, plant, floorLamp, rug } from "./props";

export function livingCorner(theme: NavTheme) {
  const g = new Kit(theme), t = g.t;
  const B = 460, S = 260;
  shell(g, { back: B, side: S, floor: "planks" });
  g.floorShadow(84, 0, 318, 100);

  g.hot("rug");
  rug(g, 100, 112, 336, 246, "border");

  g.hot("art");
  art(g, "back", 150, 118, 100, 60, "circle");
  g.hot("clock");
  clock(g, "back", 346, 170, 17);

  g.hot("decor");
  floorLamp(g, 44, 34, 158);

  // ── side wall: media console, TV over it ─────────────────────────
  g.hot("tv");
  g.box(0, 58, 0, 42, 172, 46, { tone: 1.1 });
  g.path(g.rect3("x", 42.05, 58.5, 0, 229.5, 6), { fill: "shade", fop: t.recess * 0.55, stroke: null });
  for (const [a0, a1] of [[60, 114], [116, 172], [174, 228]]) g.shaker("x", 42, a0, 8, a1, 44, 4);
  tv(g, "side", 82, 78, 124, 70);

  // ── sofa ─────────────────────────────────────────────────────────
  g.hot("sofa");
  const X = 90, W = 220, D = 92;
  for (const x of [X + 4, X + W - 10]) g.box(x, D - 10, 0, 6, 6, 12, { tone: 1.2, ao: false }); // front feet
  g.box(X, 0, 12, W, 22, 70, { tone: 1.25 }); // back frame
  g.softBox(X + 22, 18, 44, (W - 44) / 2 - 2, 20, 36, 7, { tone: 1.6 }); // back cushions
  g.softBox(X + W / 2 + 1, 18, 44, (W - 44) / 2 - 2, 20, 36, 7, { tone: 1.6 });
  g.box(X, 0, 12, 20, D, 50, { tone: 1.3 }); // left arm
  g.box(X + 20, 22, 12, W - 40, D - 22, 22, { tone: 1.15, noLeft: false }); // seat base
  g.softBox(X + 20, 30, 34, (W - 40) / 2 - 1, D - 32, 12, 5, { tone: 1.7 }); // seat cushions
  g.softBox(X + W / 2 + 1, 30, 34, (W - 40) / 2 - 1, D - 32, 12, 5, { tone: 1.7 });
  g.softBox(X + W - 58, 30, 46, 34, 14, 30, 7, { tone: 2.2 }); // throw pillow
  g.box(X + W - 20, 0, 12, 20, D, 50, { tone: 1.3 }); // right arm

  // ── side table with a plant, tall plant at the open end ─────────
  g.deco();
  g.cyl(344, 32, 0, 50, 3, 3);
  g.cyl(344, 32, 50, 3, 22, 22, { topFop: t.top * 1.4 });
  g.hot("decor");
  plant(g, 344, 32, 53, 8, 16, 34, 7);
  plant(g, 418, 36, 0, 17, 44, 96, 11);

  // ── coffee table on the rug ─────────────────────────────────────
  g.deco();
  g.floorShadow(166, 146, 276, 202);
  g.box(168, 148, 0, 106, 52, 34, { tone: 1.2 });
  g.path(g.rect3("y", 200.05, 172, 6, 270, 28), { fill: "shade", fop: t.recess * 0.5, stroke: "faint" });
  g.box(166, 146, 34, 110, 56, 4, { tone: 1.45, ao: false });
  g.box(186, 160, 38, 30, 22, 3, { tone: 2, edge: "faint", ao: false });
  g.box(188, 162, 41, 26, 18, 3, { tone: 1.6, edge: "faint", ao: false });
  g.cyl(248, 176, 38, 6, 11, 13, { topFop: t.recess * 0.9 });

  return g.result();
}
