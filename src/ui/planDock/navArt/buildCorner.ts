// Build, round 4 kit: a corner of a house going up, where every object is one
// of the Build tools. Back wall, corner outwards: plain wall | window (glass,
// reveal, sill) | wall | doorway with its door swung open into the room. Side
// wall: plain, with a patch freshly rolled. On the floor: a paint tray, roller
// and can by the side wall; a tape measure with its blade run out along the
// floor in front. The floor itself is the Floors hotspot.
//
// The walls are the objects here, so they are solid boxes with cut tops, not
// the translucent shell the Decorate rooms use. The window and doorway are
// real holes (wall pieces around them), so their reveals show the thickness.
// The tape measure is drawn ~2.5× life size: at true size its case is 4 px.
// Ids = BUILD_NAV_HOTSPOTS (BuildNavigator.tsx); "floor" is the Floors jump.

import { Kit, type NavTheme } from "./kit";

const H = 230, T = 12;

export function buildCorner(theme: NavTheme) {
  const g = new Kit(theme), t = g.t;
  const B = 360, S = 210;

  // ── floor ───────────────────────────────────────────────────────
  g.hot("floor");
  g.slab(0, 0, B, S, 6, "planks");

  // ── what sits behind the wall faces: window glass, doorway dark ─
  const W0 = 120, W1 = 200, WZ0 = 90, WZ1 = 200;
  const D0 = 235, D1 = 315, DZ = 210;
  g.hot("windows");
  g.path(g.rect3("y", -6, W0, WZ0, W1, WZ1), { fill: "ink", fop: t.glass * 0.35, stroke: "det" });
  g.line3([W0 + 8, -6, WZ1 - 6], [W0 + 22, -6, WZ1 - 40], { stroke: 0.14, sw: 1.4 });
  g.line3([W0 + 18, -6, WZ1 - 6], [W0 + 32, -6, WZ1 - 40], { stroke: 0.14, sw: 1.4 });
  g.path(g.rect3("y", -5.5, W0 + 2, WZ0 + 2, W1 - 2, WZ1 - 2), { stroke: "det", sw: 1.1 });
  g.line3([(W0 + W1) / 2, -5.5, WZ0 + 2], [(W0 + W1) / 2, -5.5, WZ1 - 2], { stroke: "det", sw: 1.1 });
  g.line3([W0 + 2, -5.5, (WZ0 + WZ1) / 2 + 10], [W1 - 2, -5.5, (WZ0 + WZ1) / 2 + 10], { stroke: "det", sw: 0.8 });
  g.hot("doors");
  g.path(g.rect3("y", -T, D0, 0, D1, DZ), { fill: "shade", fop: t.recess * 1.7, stroke: "det" });

  // ── walls: the back wall in pieces around the two holes ─────────
  g.hot("walls");
  g.box(-T, -T, 0, W0 + T, T, H, { noRight: false }); // corner → window
  g.box(W0, -T, 0, W1 - W0, T, WZ0, { noRight: true }); // under the sill
  g.box(W0, -T, WZ1, W1 - W0, T, H - WZ1, { noRight: true }); // window head
  g.box(W1, -T, 0, D0 - W1, T, H); // pier between window and door
  g.box(D0, -T, DZ, D1 - D0, T, H - DZ, { noRight: true }); // door head
  g.box(D1, -T, 0, B - D1, T, H); // door → open end
  // courses on the cut tops, so they read as built walls, not panels
  for (let x = 30; x < B; x += 40) if ((x < D0 || x > D1) && (x < W0 || x > W1)) g.line3([x, -T, H], [x, 0, H], { stroke: "faint", sw: 0.3 });
  // bare block courses on the first stretch: the wall as something you build
  for (let z = 20, row = 0; z < H; z += 20, row++) {
    g.line3([0, 0.2, z], [W0, 0.2, z], { stroke: "faint", sw: 0.3 });
    for (let x = row % 2 ? 20 : 40; x < W0; x += 40) g.line3([x, 0.2, z - 20], [x, 0.2, z], { stroke: "faint", sw: 0.3 });
  }
  // side wall, drawn after the back wall so it covers the corner join
  g.box(-T, 0, 0, T, S, H);
  for (let y = 30; y < S; y += 40) g.line3([-T, y, H], [0, y, H], { stroke: "faint", sw: 0.3 });
  g.line3([0, 0, 8], [0, S, 8], { stroke: "faint" });
  g.line3([0, 0, 8], [W0, 0, 8], { stroke: "faint" });
  g.line3([W1, 0, 8], [D0, 0, 8], { stroke: "faint" });
  g.line3([D1, 0, 8], [B, 0, 8], { stroke: "faint" });

  // ── window: sill and inner frame, in front of the wall face ─────
  g.hot("windows");
  g.box(W0 - 5, -6, WZ0 - 4, W1 - W0 + 10, 12, 4, { tone: 1.3, ao: false });

  // ── door: casing, threshold, and the leaf open into the room ────
  g.hot("doors");
  g.box(D0 - 5, 0, 0, 5, 2, DZ + 5, { tone: 1.3, ao: false });
  g.box(D0 - 5, 0, DZ, D1 - D0 + 10, 2, 5, { tone: 1.3, ao: false });
  g.box(D1, 0, 0, 5, 2, DZ + 5, { tone: 1.3, ao: false, noRight: true });
  g.box(D0, -T, 0, D1 - D0, T + 2, 1.5, { tone: 1.6, ao: false });
  // leaf: hinged on the right jamb, swung 90° into the room
  const LY = D1 - D0 - 6;
  g.floorShadow(D1, 2, D1 + 10, LY);
  g.box(D1, 2, 0, 4, LY, DZ - 4, { tone: 1.25 });
  g.shaker("x", D1 + 4.05, 10, 112, LY - 8, DZ - 14, 6);
  g.shaker("x", D1 + 4.05, 10, 12, LY - 8, 100, 6);
  g.box(D1 + 4, LY - 12, 98, 3, 10, 2.5, { tone: 2, edge: "faint", ao: false });
  g.box(D1 + 4, LY - 6, 92, 3, 3, 9, { tone: 2, edge: "faint", ao: false });

  // ── paint: a rolled patch on the side wall, tray, roller, can ───
  g.hot("paint");
  {
    const pts: [number, number, number][] = [];
    const y0 = 40, y1 = 150, z0 = 16, z1 = 196;
    for (let z = z0; z <= z1; z += 12) pts.push([0.3, y1 + Math.sin(z * 0.21) * 5, z]);
    for (let y = y1; y >= y0; y -= 11) pts.push([0.3, y, z1 + Math.sin(y * 0.33) * 4]);
    for (let z = z1; z >= z0; z -= 12) pts.push([0.3, y0 + Math.sin(z * 0.17) * 4, z]);
    g.poly3(pts, { fill: "ink", fop: t.right * 1.4, stroke: "faint" });
    for (let y = y0 + 22; y < y1; y += 22) g.line3([0.35, y, z0 + 4], [0.35, y, z1 - 4], { stroke: 0.08, sw: 0.4 });
  }
  g.floorShadow(32, 120, 100, 176);
  // tray: shallow box with a sloped well
  g.box(34, 122, 0, 52, 48, 6, { tone: 1.5, ao: false });
  g.poly3([[38, 126, 6.1], [82, 126, 6.1], [82, 150, 6.1], [38, 150, 6.1]], { fill: "shade", fop: t.recess * 0.9, stroke: "faint" });
  for (let y = 154; y < 168; y += 4) g.line3([38, y, 6.2], [82, y, 6.2], { stroke: "faint", sw: 0.3 });
  // roller resting across the tray, handle up towards the viewer
  g.softBox(42, 150, 6, 36, 10, 10, 4.8, { tone: 2.1 });
  g.line3([78, 155, 11], [92, 155, 11], { stroke: "sil", sw: 1.2 });
  g.line3([92, 155, 11], [96, 180, 18], { stroke: "sil", sw: 1.2 });
  g.box(94, 178, 15, 6, 18, 6, { tone: 1.8, ao: false });
  // can, lid off, beside the tray
  g.cyl(118, 132, 0, 22, 11, 11, { topFop: t.recess * 1.2 });
  g.ellipseZ(118, 132, 22.1, 8, { fill: "ink", fop: t.right * 1.6, stroke: null, solid: true });

  // ── measure: tape case on the floor, blade run out to the right ─
  g.hot("measure");
  const MX = 150, MY = 168;
  g.floorShadow(MX, MY, MX + 26, MY + 12);
  // blade first: the case stands on its start
  g.box(MX + 22, MY + 2, 0, 120, 7, 0.8, { tone: 2.4, edge: "det", ao: false, sil: false });
  for (let x = MX + 30; x < MX + 140; x += 10) g.line3([x, MY + 2, 0.9], [x, MY + ((x - MX) % 50 === 0 ? 8 : 5), 0.9], { stroke: "det", sw: 0.4 });
  g.box(MX + 140, MY + 1, 0, 3, 9, 5, { tone: 1.3, ao: false });
  // case: a rounded box, hub on its face, belt clip on top
  g.softBox(MX, MY, 0, 26, 12, 26, 6, { tone: 1.9 });
  g.path(g.circle3("y", MY + 12.1, MX + 12, 13, 7, 28), { stroke: "sil", sw: 0.9 });
  g.path(g.circle3("y", MY + 12.2, MX + 12, 13, 2.4, 14), { fill: "ink", fop: t.sil, stroke: null });
  g.box(MX + 4, MY + 3, 26, 14, 5, 2, { tone: 1.3, ao: false });

  return g.result();
}
