// Lighting, round 4 kit: an empty corner holding only lights, one of each
// kind (Dan, 2026-10-01: one wall light, one ceiling light, one pendant, a
// floor lamp and a desk lamp, big and spaced out; no other furniture). The
// ceiling is a faint glass plane, since a 20° camera looks down on it and
// could never see a fitting's underside: the flush light sits on it, the
// pendant hangs from it on a cord. Corner outwards: floor lamp + desk lamp
// along the side wall | box sconce low on the back wall | ceiling light |
// pendant. The pendant sits furthest from the corner on screen: at this
// camera anything a metre out from the back wall draws over what hangs on
// it. Ids = LIGHTING_HOTSPOTS.

import { Kit, type NavTheme } from "./kit";
import { shell, floorLamp, tableLamp } from "./props";

const H = 230;

export function lightingCorner(theme: NavTheme) {
  const g = new Kit(theme), t = g.t;
  const B = 340, S = 150;
  shell(g, { back: B, side: S, floor: "planks", wallH: H });

  // ── the ceiling: a faint plane over the room ────────────────────
  g.deco();
  g.poly3([[0, 0, H], [B, 0, H], [B, S, H], [0, S, H]], { fill: "ink", fop: t.wall * 0.55, stroke: "faint" });

  // ── wall light: a plain box sconce with a lit front, ~1 m up ────
  const WX = 120, WZ = 90;
  g.hot("wall");
  g.box(WX - 13, 0, WZ, 26, 12, 46, { tone: 1.4, ao: false });
  g.path(g.rect3("y", 12.05, WX - 9, WZ + 5, WX + 9, WZ + 41), { fill: "ink", fop: t.top * 2.4, stroke: "det", solid: true });

  // ── floor and desk lamps along the side wall, well apart ────────
  g.hot("floorLamp");
  floorLamp(g, 30, 34, 164);
  g.hot("tableLamp");
  tableLamp(g, 30, 118, 0, 1.6);

  // ── ceiling light: a round flush fitting ────────────────────────
  g.hot("ceiling");
  g.cyl(160, 56, H - 18, 18, 37, 43, { fop: t.left * 2.2, topFop: t.top * 1.6 });

  // ── pendant: a cone on a cord, well out from the back wall ──────
  const PX = 276, PY = 104;
  g.hot("pendant");
  g.cyl(PX, PY, H - 4, 4, 8, 8); // ceiling rose
  g.line3([PX, PY, H - 4], [PX, PY, 156], { stroke: "sil", sw: 1 });
  g.cyl(PX, PY, 124, 32, 34, 8, { fop: t.left * 2.2, topFop: t.recess });

  return g.result();
}
