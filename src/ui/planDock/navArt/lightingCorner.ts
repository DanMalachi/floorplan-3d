// Lighting, round 4 kit: an empty corner holding only lights, grouped by kind
// (Dan: no other furniture, "wall next to wall, ceiling next to ceiling").
// The ceiling is a faint glass plane, since a 20° camera looks down on it and
// could never see a fitting's underside: flush lights sit on it, pendants
// hang from it on cords. Corner outwards: floor lamp + table lamp on the
// floor | three wall lights side by side on the back wall (up-light, globe,
// rectangular) with the ceiling row above them (round, square, strip) | three
// pendants side by side (cone, globe, drum). The pendants sit right of the
// wall lights on screen: at this camera anything a metre out from the back
// wall draws over what hangs on it. Ids = LIGHTING_HOTSPOTS.

import { Kit, type NavTheme, type P2 } from "./kit";
import { shell, floorLamp, tableLamp } from "./props";

const H = 230;

/** A sphere: a disc in screen space, a shade crescent below, a highlight. */
function globe(g: Kit, x: number, y: number, z: number, r: number) {
  const t = g.t, [cx, cy] = g.P(x, y, z);
  const ring = (ox: number, oy: number, rr: number, a0 = 0, a1 = Math.PI * 2, n = 32): P2[] =>
    Array.from({ length: n + 1 }, (_, i) => {
      const q = a0 + ((a1 - a0) * i) / n;
      return [ox + rr * Math.cos(q), oy + rr * Math.sin(q)] as P2;
    });
  g.path(g.d(ring(cx, cy, r)), { fill: "ink", fop: t.top * 1.5, stroke: null, solid: true });
  g.path(g.d(ring(cx, cy, r, 0.15, Math.PI - 0.15, 16)), { fill: "shade", fop: t.recess * 0.35, stroke: null });
  g.path(g.d(ring(cx - r * 0.32, cy - r * 0.32, r * 0.38)), { fill: "ink", fop: t.top * 2.6, stroke: null, solid: true });
  g.path(g.d(ring(cx, cy, r)), { stroke: "sil" });
}

/** Ceiling rose and a cord down to `z`. */
function cord(g: Kit, x: number, y: number, z: number) {
  g.cyl(x, y, H - 3, 3, 5, 5);
  g.line3([x, y, H - 3], [x, y, z], { stroke: "sil", sw: 0.7 });
}

export function lightingCorner(theme: NavTheme) {
  const g = new Kit(theme), t = g.t;
  const B = 372, S = 150;
  shell(g, { back: B, side: S, floor: "planks", wallH: H });

  // ── the ceiling: a faint plane over the room ────────────────────
  g.deco();
  g.poly3([[0, 0, H], [B, 0, H], [B, S, H], [0, S, H]], { fill: "ink", fop: t.wall * 0.55, stroke: "faint" });

  // ── wall lights, side by side on the back wall ──────────────────
  const WZ = 150;
  g.hot("wall");
  g.box(116, 0, WZ, 8, 3, 22, { tone: 1.3, ao: false }); // backplate
  g.box(119, 3, WZ + 8, 2, 10, 2, { tone: 1.6, ao: false }); // arm
  g.cyl(120, 14, WZ + 8, 14, 6, 11, { fop: t.left * 2.1, topFop: t.recess * 0.9 }); // up-light shade
  g.hot("wall");
  g.box(150, 0, WZ, 8, 3, 18, { tone: 1.3, ao: false });
  g.box(153, 3, WZ + 10, 2, 7, 2, { tone: 1.6, ao: false });
  globe(g, 154, 14, WZ + 12, 9);
  g.hot("wall");
  g.box(180, 0, WZ - 2, 16, 9, 34, { tone: 1.4, ao: false });
  g.path(g.rect3("y", 9.05, 183, WZ + 2, 193, WZ + 28), { fill: "ink", fop: t.top * 2.4, stroke: "det", solid: true });

  // ── floor lamps in the corner ───────────────────────────────────
  g.hot("floorLamp");
  floorLamp(g, 34, 36, 164);
  g.hot("tableLamp");
  tableLamp(g, 84, 34, 0, 1.4);

  // ── ceiling row over the wall lights: round, square, strip ──────
  const CY = 56;
  g.hot("ceiling");
  g.cyl(128, CY, H - 9, 9, 15, 19, { fop: t.left * 2.2, topFop: t.top * 1.6 });
  g.hot("ceiling");
  g.box(152, CY - 17, H - 6, 34, 34, 6, { tone: 1.5, ao: false });
  g.path(g.rect3("y", CY + 17.05, 155, H - 5, 183, H - 1), { fill: "ink", fop: t.top * 2.6, stroke: null, solid: true });
  g.hot("strip");
  g.box(198, CY - 4, H - 4, 100, 8, 4, { tone: 1.5, ao: false });
  g.path(g.rect3("y", CY + 4.05, 200, H - 3.5, 296, H - 1), { fill: "ink", fop: t.top * 2.8, stroke: null, solid: true });

  // ── pendants, side by side ──────────────────────────────────────
  const PY = 110;
  g.hot("pendant");
  cord(g, 276, PY, 150);
  g.cyl(276, PY, 130, 20, 21, 5, { fop: t.left * 2.2, topFop: t.recess }); // cone
  g.hot("pendant");
  cord(g, 312, PY, 160);
  globe(g, 312, PY, 146, 14);
  g.hot("pendant");
  cord(g, 346, PY, 152);
  g.cyl(346, PY, 132, 20, 17, 17, { fop: t.left * 2.1, topFop: t.top * 1.6 }); // drum

  return g.result();
}
