// Kitchen, round 4: the two-wall corner Dan picked over round 3's single wall
// (ported from floorplan-3d-refs/navigator-plan-r4/corner.js). Kit axes: back
// wall along +x at y=0, side wall along +y at x=0, corner at the origin; the
// frame mirrors it so the corner sits on the far side in English.
//
// Layout rules from the round-4 review, all measured: tall units only on the
// side wall, ≥85cm from the corner; one upper row; true clearances (60cm
// counter→uppers, 65cm hob→hood); walls cut at 230; the sink shown by a
// SECTION CUT through its cabinet (Dan's idea); the fridge closes the open end
// of the run facing the viewer — a tall appliance on the receding side wall
// shows mostly its blank side panel and reads as a box again.
//
// Hotspot ids are KITCHEN_HOTSPOTS ids (KitchenScene.tsx), so a click filters
// the shelf exactly as the old scene's did. Not drawn here, so not clickable
// in this picture: counter/bar, trash, wall art (the bin was dropped to save
// width in round 4). The clock is added back from the round-3 kitchen, in the
// wall between the window and the hood.

import { Kit, type NavTheme } from "./kit";

export function kitchenCorner(theme: NavTheme) {
  const g = new Kit(theme), t = g.t, DEP = 64;
  const WALL_H = 230, BACK_END = 490, SIDE_END = 162;

  // ── floor + walls ────────────────────────────────────────────────
  g.hot("floor");
  g.slab(0, 0, BACK_END, SIDE_END, 6, "tiles");

  g.deco();
  // back wall face, cut top, open end
  g.poly3([[-12, 0, 0], [BACK_END, 0, 0], [BACK_END, 0, WALL_H], [-12, 0, WALL_H]], { fill: "ink", fop: t.wall, stroke: "faint" });
  g.poly3([[-12, -12, WALL_H], [BACK_END, -12, WALL_H], [BACK_END, 0, WALL_H], [-12, 0, WALL_H]], { fill: "ink", fop: t.cut, stroke: "sil", solid: true });
  g.poly3([[BACK_END, -12, 0], [BACK_END, 0, 0], [BACK_END, 0, WALL_H], [BACK_END, -12, WALL_H]], { fill: "ink", fop: t.cut * 0.7, stroke: "det", solid: true });
  // side wall face, cut top, open end
  g.poly3([[0, 0, 0], [0, SIDE_END, 0], [0, SIDE_END, WALL_H], [0, 0, WALL_H]], { fill: "ink", fop: t.wall * 1.35, stroke: "faint" });
  g.poly3([[-12, -12, WALL_H], [0, -12, WALL_H], [0, SIDE_END, WALL_H], [-12, SIDE_END, WALL_H]], { fill: "ink", fop: t.cut, stroke: "sil", solid: true });
  g.poly3([[-12, SIDE_END, 0], [0, SIDE_END, 0], [0, SIDE_END, WALL_H], [-12, SIDE_END, WALL_H]], { fill: "ink", fop: t.cut * 0.8, stroke: "det", solid: true });
  g.line3([0, 0, 0], [0, 0, WALL_H], { stroke: "faint" });
  // skirting
  g.line3([0, 0, 8], [BACK_END, 0, 8], { stroke: "faint" });
  g.line3([0, 0, 8], [0, SIDE_END, 8], { stroke: "faint" });
  // subway-tile splashback between counter and wall units, skipping the window
  for (let z = 97.5; z < 150; z += 7.5) g.line3([64, 0, z], [384, 0, z], { stroke: "faint", sw: 0.25 });
  for (let z = 90, row = 0; z < 150; z += 7.5, row++)
    for (let x = 64 + (row % 2) * 7.5; x < 384; x += 15) {
      if (x > 120 && x < 198 && z >= 102) continue;
      g.line3([x, 0, z], [x, 0, Math.min(z + 7.5, 150)], { stroke: "faint", sw: 0.25 });
    }
  // window over the sink, set into the wall, with a sill and a small plant
  g.poly3([[124, -10, 106], [194, -10, 106], [194, -10, 200], [124, -10, 200]], { fill: "ink", fop: t.glass * 0.3, stroke: "det" });
  g.line3([130, -10, 196], [142, -10, 166], { stroke: 0.14, sw: 1.4 });
  g.line3([138, -10, 196], [150, -10, 166], { stroke: 0.14, sw: 1.4 });
  g.poly3([[124, -10, 106], [194, -10, 106], [194, 0, 106], [124, 0, 106]], { fill: "ink", fop: t.top, stroke: "det", solid: true });
  g.poly3([[124, -10, 106], [124, 0, 106], [124, 0, 200], [124, -10, 200]], { fill: "ink", fop: t.right * 1.3, stroke: "det", solid: true });
  g.path(g.rect3("y", -9.5, 126, 108, 192, 198), { stroke: "det", sw: 1.1 });
  g.line3([159, -9.5, 108], [159, -9.5, 198], { stroke: "det", sw: 1.1 });
  g.line3([126, -9.5, 160], [192, -9.5, 160], { stroke: "det", sw: 1.1 });
  g.box(120, -10, 102, 78, 14, 4, { tone: 1.2, ao: false });
  g.cyl(180, -3, 106, 8, 4.2, 5, { fop: t.left * 1.3 });
  for (const [dx, h, lean] of [[-3, 12, -4], [0, 15, 1], [3, 11, 5]]) g.curve3([[180 + dx * 0.4, -3, 113], [180 + dx, -3, 113 + h * 0.6], [180 + dx + lean, -3, 113 + h]], { stroke: "sil", sw: 1.1 });
  // soft shadows: under wall units, on the floor under the run
  g.wallShadow([[64, 0, 150], [114, 0, 150], [118, 0, 136], [68, 0, 136]]);
  g.floorShadow(0, 0, 482, 72);
  g.floorShadow(0, 86, 64, 150);
  // runner rug in front of the sink
  g.poly3([[122, 84, 0.3], [262, 84, 0.3], [262, 132, 0.3], [122, 132, 0.3]], { fill: "ink", fop: t.top * 1.3, stroke: "det", solid: true });
  g.poly3([[128, 90, 0.4], [256, 90, 0.4], [256, 126, 0.4], [128, 126, 0.4]], { stroke: "faint" });
  for (let x = 136; x < 250; x += 12) g.line3([x, 90, 0.45], [x + 6, 126, 0.45], { stroke: "faint", sw: 0.3 });
  for (let y = 86; y < 132; y += 3) {
    g.line3([122, y, 0.4], [118, y, 0.4], { stroke: "faint", sw: 0.3 });
    g.line3([262, y, 0.4], [266, y, 0.4], { stroke: "faint", sw: 0.3 });
  }

  const toe = (x0: number, x1: number) => g.path(g.rect3("y", DEP + 0.05, x0 + 0.5, 0, x1 - 0.5, 9), { fill: "shade", fop: t.recess * 0.55, stroke: null });
  const counter = (x0: number, w: number) => g.box(x0, 0, 86, w, DEP, 4, { tone: 1.35, noRight: true, ao: false });

  // ── wall clock, between the window and the hood ──────────────────
  g.hot("clock");
  g.path(g.circle3("y", 0.5, 229, 181, 28, 48), { fill: "ink", fop: t.top * 1.2, stroke: "sil", solid: true });
  g.path(g.circle3("y", 3, 229, 181, 24.5, 48), { fill: "shade", fop: t.recess * 0.22, stroke: "det" });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, r0 = i % 3 === 0 ? 17 : 20;
    g.line3([229 + Math.cos(a) * r0, 3.1, 181 + Math.sin(a) * r0], [229 + Math.cos(a) * 22.5, 3.1, 181 + Math.sin(a) * 22.5], { stroke: "det", sw: i % 3 === 0 ? 0.8 : 0.45 });
  }
  g.line3([229, 3.2, 181], [229, 3.2, 197], { stroke: "sil", sw: 1.1 });
  g.line3([229, 3.2, 181], [240, 3.2, 175], { stroke: "sil", sw: 1.1 });
  g.path(g.circle3("y", 3.3, 229, 181, 1.6, 12), { fill: "ink", fop: t.sil, stroke: null });

  // ── corner unit (hidden behind the fridge; scenery) ──────────────
  g.hot("cabinets");
  g.box(0, 0, 0, 64, DEP, 86, { noRight: true, noTop: true });
  toe(0, 64);
  g.shaker("y", DEP, 4, 12, 60, 84);
  counter(0, 64);

  // ── side wall: a tall larder cabinet, 88 cm out from the corner, doors facing +x ──
  g.hot("cabinets");
  const TY0 = 88, TW = 60, TD = 60, TH = 216;
  g.box(0, TY0, 0, TD, TW, TH, { tone: 1.05 });
  g.path(g.rect3("x", TD + 0.05, TY0 + 0.5, 0, TY0 + TW - 0.5, 9), { fill: "shade", fop: t.recess * 0.55, stroke: null });
  g.shaker("x", TD, TY0, 11, TY0 + TW, 124);
  g.shaker("x", TD, TY0, 126, TY0 + TW, TH - 2);
  g.box(TD, TY0 + TW / 2 - 1, 104, 2.4, 2, 14, { tone: 1.6, edge: "faint", ao: false });
  g.box(TD, TY0 + TW / 2 - 1, 130, 2.4, 2, 14, { tone: 1.6, edge: "faint", ao: false });
  // finished end panel facing the room
  g.shaker("y", TY0 + TW, 0, 11, TD, TH - 2, 6);

  // ── back run, corner outwards: drawers | sink | dishwasher | range | cupboard ──
  g.hot("cabinets");
  g.box(64, 0, 0, 50, DEP, 86, { noRight: true, noTop: true });
  toe(64, 114);
  g.shaker("y", DEP, 64, 12, 114, 34, 3.5);
  g.shaker("y", DEP, 64, 36, 114, 58, 3.5);
  g.shaker("y", DEP, 64, 60, 114, 84, 3.5);
  g.barH(81, DEP, 30, 16);
  g.barH(81, DEP, 54, 16);
  g.barH(81, DEP, 79, 16);
  counter(64, 50);
  g.hot("microwave");
  g.raw(`<path d="${g.d(([[62, 2, 90.2], [113, 2, 90.2], [115, 50, 90.2], [64, 50, 90.2]] as [number, number, number][]).map((p) => g.P(...p)))}" fill="#000" fill-opacity="${t.recess * 0.6}" filter="url(#soft)"/>`);
  g.box(63.5, 4, 90, 50, 42, 38, { tone: 1.2 });
  g.path(g.rect3("y", 46.1, 67, 94, 98, 124), { fill: "shade", fop: t.recess * 0.8, stroke: "det" });
  g.line3([71, 46.2, 121], [79, 46.2, 97], { stroke: 0.14, sw: 1.2 });
  g.path(g.rect3("y", 46.1, 101, 96, 111, 124), { stroke: "faint" });
  for (const z of [103, 109, 115]) g.path(g.circle3("y", 46.2, 106, z, 1, 10), { fill: "ink", fop: t.top * 2, stroke: null });

  // sink base: the front of the cabinet is cut away above the doors to show the basin in section
  g.hot("sink");
  const SX0 = 114, SX1 = 204, CUT_Y = 40, CUT_Z = 50, cx0 = SX0 + 3, cx1 = SX1 - 3;
  g.box(SX0, 0, 0, SX1 - SX0, DEP, 86, { noRight: true, noTop: true });
  toe(SX0, SX1);
  g.shaker("y", DEP, SX0, 12, (SX0 + SX1) / 2, 47);
  g.shaker("y", DEP, (SX0 + SX1) / 2, 12, SX1, 47);
  g.barV((SX0 + SX1) / 2 - 4, DEP, 33, 11);
  g.barV((SX0 + SX1) / 2 + 4, DEP, 33, 11);
  counter(SX0, SX1 - SX0);
  // basin rim seen on the counter behind the cut
  g.path(g.rect3("z", 90.05, 122, 8, 182, CUT_Y), { fill: "shade", fop: t.recess * 0.9, stroke: "det" });
  // the cut: back face, left face, floor of the opening; only the part of the
  // back face seen through the opening is drawn
  const xb = cx1 - (DEP - CUT_Y) * Math.tan(Math.PI / 6), zb = 90 - 10.1;
  g.poly3([[cx0, CUT_Y, CUT_Z], [xb, CUT_Y, CUT_Z], [xb, CUT_Y, zb], [cx1, CUT_Y, 90], [cx0, CUT_Y, 90]], { fill: "ink", fop: t.recess * 0.55, stroke: null, solid: true });
  g.poly3([[cx0, CUT_Y, CUT_Z], [cx0, DEP, CUT_Z], [cx0, DEP, 90], [cx0, CUT_Y, 90]], { fill: "ink", fop: t.right * 1.4, stroke: "det", solid: true });
  g.poly3([[cx0, CUT_Y, CUT_Z], [xb, CUT_Y, CUT_Z], [cx1, DEP, CUT_Z], [cx0, DEP, CUT_Z]], { fill: "ink", fop: t.top * 1.3, stroke: "det", solid: true });
  // section on the cut plane: worktop strip and basin shell in solid ink (poché), bowl interior lighter
  const B = (pts: [number, number][]) => g.d(pts.map(([x, z]) => g.P(x, CUT_Y + 0.1, z)));
  const bowl: [number, number][] = [];
  const arc = (cx: number, cz: number, r: number, a0: number, a1: number) => {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (i / 6) * (a1 - a0);
      bowl.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
  };
  bowl.push([122, 88]);
  arc(128, 74, 6, Math.PI, Math.PI * 1.5);
  arc(176, 74, 6, Math.PI * 1.5, Math.PI * 2);
  bowl.push([182, 88]);
  g.path(B(bowl), { fill: "ink", fop: t.top * 0.9, stroke: null, solid: true });
  g.path(B([[122, 88], ...bowl.slice(1, -1), [182, 88]]).replace(/ Z$/, ""), { stroke: "sil", sw: 2.2 });
  g.path(B([[cx0, 86], [122, 86], [122, 90], [cx0, 90]]), { fill: "ink", fop: 1, stroke: null, solid: true });
  g.path(B([[182, 86], [xb + 8, 86], [xb + 8, 90], [182, 90]]), { fill: "ink", fop: 1, stroke: null, solid: true });
  g.path(B([[120, 88], [184, 88], [184, 90.5], [120, 90.5]]), { fill: "ink", fop: 0.85, stroke: null, solid: true });
  // drain, P-trap and waste pipe back into the wall
  g.path(B([[150.5, 68], [153.5, 68], [153.5, 62], [150.5, 62]]), { fill: "ink", fop: t.sil, stroke: null, solid: true });
  g.curve3([[152, CUT_Y + 0.2, 62], [152, CUT_Y + 0.2, 56], [154, CUT_Y + 0.2, 53.5], [159, CUT_Y + 0.2, 53.5], [161, CUT_Y + 0.2, 56], [161, CUT_Y + 0.2, 60], [xb, CUT_Y + 0.2, 60]], { stroke: "sil", sw: 2.4 });
  // cut edges on the worktop and the right stile
  g.line3([cx0, CUT_Y, 90], [cx1, CUT_Y, 90], { stroke: "sil" });
  g.box(cx1, 0, CUT_Z, 3, DEP, 40, { noRight: true, noTop: true, ao: false, sil: false });
  g.box(cx1, CUT_Y, 86, 3, DEP - CUT_Y, 4, { tone: 1.35, noRight: true, ao: false, sil: false });
  // tap
  g.cyl(152, 5, 90, 3, 2.4);
  const tap: [number, number, number][] = [];
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI;
    tap.push([152, 5 + 10 * (1 - Math.cos(a)), 93 + 22 * Math.sin(a)]);
  }
  tap.push([152, 25, 105]);
  g.curve3(tap, { stroke: "sil", sw: 1.6 });
  g.box(156, 3, 90, 2, 5, 8, { tone: 2, edge: "faint", ao: false, sil: false });

  g.hot("dishwasher");
  g.box(204, 0, 0, 60, DEP, 86, { tone: 1.25, noRight: true, noTop: true });
  toe(204, 264);
  g.line3([205, DEP, 78], [263, DEP, 78], { stroke: "det" });
  g.barH(210, DEP, 73, 48);
  g.path(g.rect3("y", DEP + 0.1, 246, 80, 258, 84), { fill: "ink", fop: t.sil * 0.6, stroke: null });
  for (const x of [216, 228, 240, 252]) g.line3([x, DEP, 14], [x, DEP, 68], { stroke: 0.08, sw: 0.6 });
  counter(204, 60);

  g.hot("stove");
  g.box(264, 0, 0, 60, DEP, 90, { tone: 1.25, noRight: true });
  g.path(g.rect3("z", 90.05, 267, 9, 321, 61), { fill: "shade", fop: t.recess * 0.85, stroke: "det" });
  for (const [cx, cy] of [[279, 23], [309, 23], [279, 48], [309, 48]]) {
    g.ellipseZ(cx, cy, 90.1, 9.5, { stroke: "det" });
    g.ellipseZ(cx, cy, 90.2, 5, { fill: "ink", fop: t.top * 1.2, stroke: "faint" });
  }
  g.box(264, 0, 90, 60, 7, 12, { tone: 1.3, ao: false, noRight: true });
  for (const x of [272, 281, 307, 316]) g.path(g.circle3("y", 7.1, x, 96, 2.4, 16), { fill: "ink", fop: t.top * 1.8, stroke: "det" });
  g.path(g.rect3("y", DEP + 0.1, 267, 14, 321, 72), { stroke: "det" });
  g.path(g.rrect3("y", DEP + 0.15, 273, 25, 315, 60, 2.5), { fill: "shade", fop: t.recess * 0.95, stroke: "det" });
  g.line3([278, DEP + 0.2, 58], [288, DEP + 0.2, 27], { stroke: 0.15, sw: 1.3 });
  g.barH(272, DEP, 77, 44);
  g.path(g.rect3("y", DEP + 0.3, 286, 58, 293, 76.5), { fill: "ink", fop: t.top * 1.4, stroke: "faint" }); // tea towel
  g.line3([265, DEP + 0.1, 10], [323, DEP + 0.1, 10], { stroke: "det" });
  g.deco(); // kettle on the back burner
  g.cyl(309, 23, 90.5, 13, 8.5, 6);
  g.cyl(309, 23, 103.5, 1.8, 1.6);
  const hd: [number, number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI;
    hd.push([309 - 5.5 * Math.cos(a), 23, 103 + 7 * Math.sin(a)]);
  }
  g.curve3(hd, { stroke: "sil", sw: 1.2 });
  g.curve3([[302, 23, 95], [296, 23, 101], [294, 23, 104]], { stroke: "sil", sw: 1.6 });

  g.hot("cabinets");
  g.box(324, 0, 0, 60, DEP, 86, { noTop: true, noRight: true });
  toe(324, 384);
  g.shaker("y", DEP, 324, 12, 354, 84);
  g.shaker("y", DEP, 354, 12, 384, 84);
  g.barV(350, DEP, 66, 12);
  g.barV(358, DEP, 66, 12);
  g.box(324, 0, 86, 64, DEP, 4, { tone: 1.35, ao: false, noRight: true, noTop: true, sil: false });
  // worktop beside the fridge: the triangle the fridge hides from this camera is not drawn
  {
    const hx = 394 - 68 / Math.sqrt(3);
    g.poly3([[324, 0, 90], [hx, 0, 90], [388, 68 - (394 - 388) * Math.sqrt(3), 90], [388, DEP, 90], [324, DEP, 90]], { fill: "ink", fop: t.top * 1.35, stroke: "det", solid: true });
  }

  g.deco(); // fruit bowl
  g.cyl(354, 30, 90, 5, 7, 11, { topFop: t.left * 0.7 });
  for (const [dx, dy, r] of [[-4, 0, 3.4], [2.5, -2, 3.2], [1, 3, 3]]) g.path(g.circle3("y", 30 + dy + 3, 354 + dx, 97 + r * 0.6, r, 16), { fill: "ink", fop: t.top * 1.8, stroke: "det" });

  // ── wall units and hood: one row, 60 cm above the worktop, 65 cm above the hob ──
  g.hot("cabinets");
  g.box(64, 0, 150, 50, 35, 70);
  g.shaker("y", 35, 64, 150, 114, 220);
  g.barV(70, 35, 153, 12);

  g.hot("hood");
  g.wallShadow([[266, 0, 156], [322, 0, 156], [326, 0, 142], [270, 0, 142]]);
  g.box(264, 0, 155, 60, 44, 8, { tone: 1.35, ao: false }); // mantel shelf
  g.poly3([[266, 44, 163], [322, 44, 163], [316, 32, 196], [272, 32, 196]], { fill: "ink", fop: t.left * 1.2, stroke: "det", solid: true });
  g.poly3([[322, 0, 163], [322, 44, 163], [316, 32, 196], [316, 0, 196]], { fill: "ink", fop: t.right * 1.2, stroke: "det", solid: true });
  g.box(272, 0, 196, 44, 32, WALL_H - 196, { tone: 1.2 }); // chimney breast
  g.shaker("y", 32, 272, 199, 316, WALL_H - 3, 4);
  g.line3([270, 44.1, 158.5], [318, 44.1, 158.5], { stroke: "faint" });
  g.path(g.rect3("z", 154.9, 272, 8, 316, 36), { fill: "shade", fop: t.recess * 0.5, stroke: null });

  // ── open end of the run: French-door fridge facing the room ──
  g.hot("fridge");
  const FX0 = 394, FW = 92, FB = 62, FH = 198;
  g.box(FX0, 0, 0, FW, FB, FH, { tone: 1.15, noLeft: true });
  g.line3([FX0 + FW + 0.1, 8, 14], [FX0 + FW + 0.1, 8, FH - 8], { stroke: 0.07, sw: 1.8 });
  g.line3([FX0 + FW + 0.1, 16, 14], [FX0 + FW + 0.1, 16, FH - 8], { stroke: 0.04, sw: 0.8 });
  g.box(FX0 + 2, FB - 3, 0, FW - 4, 3, 9, { tone: 0.7, ao: false, sil: false, noRight: true });
  for (let x = FX0 + 8; x < FX0 + FW - 6; x += 4) g.line3([x, FB + 0.05, 2.5], [x, FB + 0.05, 6.5], { stroke: "det", sw: 0.4 });
  const door = (x0: number, w: number, z0: number, h: number, last: boolean) => {
    g.box(x0, FB, z0, w, 6, h, { tone: 1.9, ao: false, noRight: !last });
    g.path(g.rect3("y", FB + 6.05, x0 + 1.2, z0 + 1.2, x0 + w - 1.2, z0 + h - 1.2), { stroke: "faint" });
    g.raw(`<path d="${g.rect3("y", FB + 6.08, x0 + 3, z0 + 3, x0 + w * 0.42, z0 + h - 3)}" fill="url(#sheen)"/>`);
  };
  door(FX0 + 0.6, FW - 1.2, 9.5, 50, true);
  door(FX0 + 0.6, FW / 2 - 1.1, 61, 136.5, false);
  door(FX0 + FW / 2 + 0.5, FW / 2 - 1.1, 61, 136.5, true);
  g.path(g.rrect3("y", FB + 6.1, FX0 + 9, 118, FX0 + 33, 152, 2.5), { fill: "shade", fop: t.recess * 0.9, stroke: "det" });
  g.path(g.rect3("y", FB + 6.2, FX0 + 17, 128, FX0 + 25, 142), { fill: "ink", fop: t.top * 1.6, stroke: "faint" });
  g.path(g.rect3("y", FB + 6.2, FX0 + 12, 146, FX0 + 30, 149.5), { fill: "ink", fop: t.sil, stroke: null });
  const hv = (x: number, z0: number, len: number) => {
    g.box(x - 1, FB + 6, z0 + 4, 2, 3, 2.5, { tone: 1.8, edge: "faint", ao: false, sil: false });
    g.box(x - 1, FB + 6, z0 + len - 6.5, 2, 3, 2.5, { tone: 1.8, edge: "faint", ao: false, sil: false });
    g.box(x - 1.3, FB + 9, z0, 2.6, 2.6, len, { tone: 2.2, edge: "det", ao: false });
  };
  hv(FX0 + FW / 2 - 5, 96, 74);
  hv(FX0 + FW / 2 + 5, 96, 74);
  g.box(FX0 + 20, FB + 6, 50.5, 2.5, 3, 2, { tone: 1.8, edge: "faint", ao: false, sil: false });
  g.box(FX0 + FW - 22, FB + 6, 50.5, 2.5, 3, 2, { tone: 1.8, edge: "faint", ao: false, sil: false });
  g.box(FX0 + 16, FB + 9, 50, FW - 32, 2.6, 2.8, { tone: 2.2, edge: "det", ao: false });
  g.box(FX0 + 2, FB, FH - 0.5, 6, 6, 1.4, { tone: 2, edge: "faint", ao: false, sil: false });
  g.box(FX0 + FW - 8, FB, FH - 0.5, 6, 6, 1.4, { tone: 2, edge: "faint", ao: false, sil: false });

  return g.result();
}
