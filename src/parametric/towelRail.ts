import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { finishMaterial, tagTintOfMaterial } from "./materials";
import { chromeMat } from "./bathParts";

// Towel storage — the second piece split out of the old "Mirror & accessories"
// card. Four ways to hang a towel, each its own product and its own size: a
// 60cm rail and a 15cm ring were sharing one set of dimensions.
//
// Everything here hangs on a wall, and the towel is the point — the bracket is
// just what holds it, so each variant is drawn WITH cloth on it.

/**
 * Towel folded over a horizontal bar, hanging from the group's origin: a
 * half-tube over the bar plus the two panels that hang off it.
 *
 * `drop` is how far the cloth hangs BELOW the origin, which is the bar itself.
 * The old one used a torus whose RADIUS was the drop, so a towel asked for
 * 34cm hung 17, and it was scaled along the wrong axis — a 60cm rail's towel
 * stuck 30cm out into the room instead of running 60cm across it.
 */
function drapedTowel(width: number, drop: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const FOLD_R = 0.032;
  const PANEL_T = 0.014;

  // Open half-tube over the bar: the rounded top edge of the fold. The
  // GEOMETRY is rotated, not the mesh — a cylinder's shell starts at +Z and
  // sweeps toward +X, so one rotation about Z lays the axis along the bar and
  // leaves the opening facing down. Stacking mesh Eulers to get there swung
  // the axis into Z instead and blew the towel out into the room.
  const foldGeo = new THREE.CylinderGeometry(FOLD_R, FOLD_R, width, 14, 1, true, 0, Math.PI);
  foldGeo.rotateZ(Math.PI / 2);
  const fold = new THREE.Mesh(foldGeo, mat);
  fold.material.side = THREE.DoubleSide;
  g.add(fold);

  const panelH = Math.max(drop, 0.02);
  for (const sz of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(width, panelH, PANEL_T), mat);
    panel.position.set(0, -panelH / 2, sz * (FOLD_R - PANEL_T / 2));
    g.add(panel);
  }
  // Hem line across the bottom — the detail that reads as cloth, not card.
  const hem = new THREE.Mesh(new THREE.BoxGeometry(width * 0.94, 0.006, FOLD_R * 2 + 0.004), mat);
  hem.position.y = -panelH + 0.01;
  g.add(hem);
  return g;
}

/** Wall bracket: a round backplate and a standoff, the joint every one of
 *  these has where it meets the wall. */
function bracket(z: number, r = 0.022): THREE.Group {
  const g = new THREE.Group();
  const chrome = chromeMat();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.006, 14), chrome);
  plate.rotation.x = Math.PI / 2;
  plate.position.z = -z;
  g.add(plate);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, z, 12), chrome);
  post.rotation.x = Math.PI / 2;
  post.position.z = -z / 2;
  g.add(post);
  return g;
}

export const towelRailGenerator: GeneratorDef = {
  id: "towelRail",
  label: "Towel rail",
  category: "Bathroom",
  rooms: ["bathroom"],
  wallSnap: true,
  dimLimits: { w: [0.1, 1.2], d: [0.06, 0.25], h: [0.08, 1.4] },
  modules: [],
  fronts: ["slab"],
  handles: ["none"],
  finishes: ["painted", "ceramic", "oak", "walnut"],
  wallMounted: () => true,
  hotspotKeywords: ["towel"],
  variantIsProduct: true,
  variants: [
    { id: "rail", label: "Rail", cardLabel: "Towel rail", hotspotKeywords: ["towel"], defaults: { dims: { w: 0.6, d: 0.12, h: 0.28 } } },
    { id: "ladder", label: "Ladder", cardLabel: "Heated towel ladder", hotspotKeywords: ["towel"], defaults: { dims: { w: 0.5, d: 0.12, h: 1.1 } } },
    { id: "ring", label: "Ring", cardLabel: "Towel ring", hotspotKeywords: ["towel"], defaults: { dims: { w: 0.18, d: 0.1, h: 0.34 } } },
    { id: "hooks", label: "Hooks", cardLabel: "Towel hooks", hotspotKeywords: ["towel", "hook"], defaults: { dims: { w: 0.34, d: 0.08, h: 0.4 } } },
  ],
  defaultSpec: {
    generator: "towelRail",
    dims: { w: 0.6, d: 0.12, h: 0.28 },
    modules: {},
    front: "slab",
    handle: "none",
    finish: "painted",
    variant: "rail",
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d, h } = spec.dims;
    const variant = spec.variant ?? "rail";
    const mat = finishMaterial(spec.finish);
    const chrome = chromeMat();
    const group = new THREE.Group();

    if (variant === "ladder") {
      // Heated ladder: uprights standing off the wall, a stack of rungs, and a
      // towel over one of them. Origin at its BASE, like every wall item —
      // the click picks where the bottom of it sits.
      const rungs = Math.max(4, Math.round(h / 0.14));
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, h, 12), chrome);
        post.position.set((sx * (w - 0.03)) / 2, h / 2, -0.02);
        group.add(post);
      }
      for (let i = 0; i < rungs; i++) {
        const y = (h / rungs) * (i + 0.5);
        const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, w - 0.03, 10), chrome);
        rung.rotation.z = Math.PI / 2;
        rung.position.set(0, y, -0.02);
        group.add(rung);
      }
      for (const y of [h * 0.16, h * 0.62]) {
        const b = bracket(0.05, 0.02);
        b.position.set(0, y, -0.02);
        group.add(b);
      }
      const towel = drapedTowel(w * 0.42, Math.min(0.34, h * 0.6), mat);
      towel.position.set(w * 0.12, h * 0.66, -0.02);
      group.add(towel);
    } else if (variant === "ring") {
      // Ring on a short arm — the small one that lives beside a basin.
      const r = Math.min(w, h * 0.5) / 2;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 8, 28), chrome);
      ring.position.set(0, h - r - 0.03, 0);
      group.add(ring);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 10), chrome);
      arm.rotation.x = Math.PI / 2;
      arm.position.set(0, h - 0.02, -0.025);
      group.add(arm);
      const plate = bracket(0.05, 0.018);
      plate.position.set(0, h - 0.02, 0);
      group.add(plate);

      const towel = drapedTowel(r * 1.2, h - r - 0.036, mat);
      towel.position.set(0, h - r - 0.03, 0);
      group.add(towel);
    } else if (variant === "hooks") {
      // Backplate with a row of hooks; the towel hangs off one of them.
      const plate = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.012), mat);
      plate.position.set(0, h - 0.025, -0.006);
      group.add(plate);
      const n = Math.max(2, Math.round(w / 0.12));
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + (w * (i + 0.5)) / n;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.05, 10), chrome);
        stem.rotation.x = Math.PI / 2;
        stem.position.set(x, h - 0.025, 0.025);
        group.add(stem);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), chrome);
        tip.position.set(x, h - 0.04, 0.05);
        group.add(tip);
      }
      const towel = drapedTowel(w * 0.3, h - 0.056, mat);
      towel.position.set(-w * 0.2, h - 0.05, 0.02);
      group.add(towel);
    } else {
      // Plain rail: bar, two brackets, two towels folded over it. The item's
      // height is the whole thing — bar at the top, cloth hanging to the
      // bottom — so a click places the rail and the towel lands under it.
      const railY = h - 0.02;
      const BR = 0.022; // bracket plate radius — the bar stops short so they fit
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, w - 2 * BR, 12), chrome);
      rail.rotation.z = Math.PI / 2;
      rail.position.y = railY;
      group.add(rail);
      for (const sx of [-1, 1]) {
        const b = bracket(0.06, BR);
        b.position.set(sx * (w / 2 - BR), railY, 0);
        group.add(b);
      }
      for (const sx of [-1, 1]) {
        const towel = drapedTowel(w * 0.3, railY - 0.006, mat);
        towel.position.set(sx * w * 0.22, railY, 0);
        group.add(towel);
      }
    }

    tagTintOfMaterial(group, spec.finish, spec.color, mat);
    return group;
  },
};
