// Study, round 4 kit. Back wall, corner outwards: a plant | desk with a
// monitor, keyboard and desk lamp, print and clock over it | full bookcase
// closing the run. Office chair at the desk, seen from behind. Side wall: TV,
// and a reading armchair under it. Rug under the desk chair.
// Ids = STUDY_HOTSPOTS.

import { Kit, type NavTheme } from "./kit";
import { shell, art, clock, tv, plant, rug, tableLamp, bookcase, floorLamp } from "./props";

export function studyCorner(theme: NavTheme) {
  const g = new Kit(theme), t = g.t;
  const B = 460, S = 230;
  shell(g, { back: B, side: S, floor: "planks" });
  g.floorShadow(136, 0, 284, 74);

  g.hot("rug");
  rug(g, 126, 76, 322, 208, "dots");

  g.hot("art");
  art(g, "back", 168, 146, 70, 50, "grid");
  g.hot("clock");
  clock(g, "back", 302, 178, 15);

  g.hot("decor");
  plant(g, 88, 30, 0, 15, 38, 88, 10);

  // ── side wall: TV and a reading armchair ─────────────────────────
  g.hot("tv");
  tv(g, "side", 96, 114, 96, 54);
  g.hot("chair");
  const AY = 120, AW = 78;
  g.box(0, AY, 10, 26, AW, 76, { tone: 1.25 }); // back
  g.box(26, AY, 10, 60, 16, 52, { tone: 1.3 }); // far arm
  g.box(26, AY + 16, 10, 60, AW - 32, 24, { tone: 1.15 }); // seat base
  g.softBox(26, AY + 16, 34, 58, AW - 32, 12, 5, { tone: 1.7 });
  g.box(26, AY + AW - 16, 10, 60, 16, 52, { tone: 1.3 }); // near arm
  for (const y of [AY + 4, AY + AW - 8]) g.box(80, y, 0, 5, 5, 10, { tone: 1.2, ao: false });
  g.hot("decor");
  floorLamp(g, 26, 214, 150);

  // ── desk ─────────────────────────────────────────────────────────
  g.hot("desk");
  const DX = 140, DW = 140, DD = 70, DH = 75;
  for (const [x, y] of [[DX + 3, 3], [DX + 3, DD - 7]]) g.box(x, y, 0, 4, 4, DH - 4, { tone: 1.2, ao: false });
  g.box(DX + DW - 44, 0, 0, 42, DD - 4, DH - 4, { tone: 1.15 }); // drawer pedestal
  for (const [z0, z1] of [[4, 24], [26, 46], [48, 69]]) g.shaker("y", DD - 4, DX + DW - 44, z0, DX + DW - 2, z1, 3.5);
  for (const z of [15, 37, 59]) g.barH(DX + DW - 31, DD - 4, z, 16);
  g.box(DX, 0, DH - 4, DW, DD, 4, { tone: 1.4, ao: false }); // top
  g.box(DX + 52, 12, DH, 16, 12, 2, { tone: 1.7, ao: false }); // monitor foot
  g.box(DX + 58, 16, DH + 2, 4, 3, 14, { tone: 1.7, ao: false }); // neck
  g.box(DX + 26, 14, DH + 14, 68, 3, 40, { tone: 1.3, ao: false }); // monitor
  g.path(g.rect3("y", 17.1, DX + 28, DH + 16, DX + 92, DH + 52), { fill: "shade", fop: t.recess * 1.5, stroke: "det" });
  g.line3([DX + 34, 17.2, DH + 48], [DX + 44, 17.2, DH + 22], { stroke: 0.12, sw: 1.2 });
  g.box(DX + 34, 38, DH, 50, 16, 2, { tone: 1.8, edge: "faint", ao: false }); // keyboard
  for (let x = DX + 37; x < DX + 82; x += 5) g.line3([x, 42, DH + 2.1], [x, 51, DH + 2.1], { stroke: "faint", sw: 0.3 });
  g.cyl(DX + 104, 44, DH, 9, 4, 4, { fop: t.left * 1.6 }); // mug
  g.hot("decor");
  tableLamp(g, DX + 118, 20, DH, 0.85);

  // ── bookcase closing the run ─────────────────────────────────────
  g.hot("bookcase");
  bookcase(g, 352, 100, 36, 200, 5, 4);

  // ── office chair at the desk, seen from behind ───────────────────
  g.hot("chair");
  const CX = 212, CY = 118;
  for (let i = 0; i < 5; i++) {
    const q = (i / 5) * Math.PI * 2 + 0.3;
    g.line3([CX, CY, 6], [CX + Math.cos(q) * 28, CY + Math.sin(q) * 28, 3], { stroke: "sil", sw: 1.6 });
    g.cyl(CX + Math.cos(q) * 28, CY + Math.sin(q) * 28, 0, 3, 3, 3);
  }
  g.cyl(CX, CY, 6, 36, 2.5, 2.5);
  g.softBox(CX - 26, CY - 24, 42, 52, 48, 9, 5, { tone: 1.5 }); // seat
  for (const x of [CX - 26, CX + 22]) g.box(x, CY - 12, 51, 4, 26, 3, { tone: 1.3, ao: false }); // arm rests
  for (const x of [CX - 25, CX + 22]) g.box(x, CY + 10, 42, 3, 3, 10, { tone: 1.3, ao: false });
  g.box(CX - 3, CY + 22, 48, 6, 4, 14, { tone: 1.3, ao: false }); // back post
  g.softBox(CX - 24, CY + 20, 60, 48, 9, 48, 8, { tone: 1.45 }); // backrest

  return g.result();
}
