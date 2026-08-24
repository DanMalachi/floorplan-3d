import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { finishMaterial, tagTintOfMaterial } from "./materials";
import { chromeMat, wasteMat, roundedRect, toPath, extrudeUp } from "./bathParts";

// Shower — Phase 1 bathroom fixture #3.
//
// Three parts, each optional by variant: a TRAY (the acrylic base), an
// ENCLOSURE (glass + chrome frame) and the BRASSWARE (riser rail, head, hose).
// The variants are really "how much of the enclosure is there":
//   enclosure  tray + two glass sides meeting at a corner  — the common case
//   walk-in    tray + one fixed glass panel                — wet-room look
//   wet-room   no tray, a floor drain and the brassware    — tiled-in
//
// GLASS: plain alpha, deliberately NOT transmission. Transmission needs the
// renderer's separate transmission pass and, combined with a near-zero
// roughness, it turned the panels into mirrors that reflected the room instead
// of showing it. What a shower screen actually does is let you see through it
// while softening what's behind — so this is a mostly-transparent surface with
// a HIGH roughness (the milky part) and a weak environment response, which is
// stable under any lighting and reads as glass from every angle.

const TRAY_H = 0.06;
const FRAME_T = 0.02; // chrome frame profile
const GLASS_T = 0.008;

let _glass: THREE.MeshStandardMaterial | null = null;
function glassMat(): THREE.MeshStandardMaterial {
  if (!_glass) {
    _glass = new THREE.MeshStandardMaterial({
      color: "#eef3f4", // barely-there cool tint; the panel is nearly colourless
      metalness: 0,
      roughness: 0.55, // the frost — a broad, soft highlight instead of a mirror
      transparent: true,
      opacity: 0.24, // see-through first, present second
      envMapIntensity: 0.25, // enough to catch the room, far too weak to mirror it
      side: THREE.DoubleSide, // seen from inside the enclosure too
      depthWrite: false, // don't let the panel occlude what's behind it
    });
  }
  return _glass;
}

/** Riser rail with a slider, hose and head — the part that says "shower"
 *  even in a thumbnail. Origin at the wall, rail running up. */
function brassware(height: number): THREE.Group {
  const g = new THREE.Group();
  const mat = chromeMat();

  const railTop = Math.min(height - 0.15, 1.95);
  const railBottom = 0.9;
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, railTop - railBottom, 12), mat);
  rail.position.y = (railTop + railBottom) / 2;
  g.add(rail);

  for (const y of [railBottom, railTop]) {
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.035), mat);
    bracket.position.set(0, y, -0.018);
    g.add(bracket);
  }

  // Slider + handset, angled down off the rail.
  const headY = railTop - 0.18;
  const slider = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.05, 12), mat);
  slider.position.y = headY;
  g.add(slider);

  const handset = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.03, 0.14, 14), mat);
  handset.rotation.x = Math.PI / 2.6;
  handset.position.set(0, headY - 0.04, 0.055);
  g.add(handset);

  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.008, 16), wasteMat());
  face.rotation.x = Math.PI / 2.6;
  face.position.set(0, headY - 0.095, 0.105);
  g.add(face);

  // Mixer bar with two levers, at the standard 1.1m.
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.19, 14), mat);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 1.1, 0.03);
  g.add(bar);
  for (const sx of [-1, 1]) {
    const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 12), mat);
    lever.rotation.z = Math.PI / 2;
    lever.position.set(sx * 0.115, 1.1, 0.03);
    g.add(lever);
  }

  // Hose looping from the mixer up to the handset.
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.02, 1.1, 0.05),
    new THREE.Vector3(0.06, 0.98, 0.11),
    new THREE.Vector3(0.02, 1.05, 0.14),
    new THREE.Vector3(0, headY - 0.09, 0.09),
  ]);
  const hose = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.009, 8, false), mat);
  g.add(hose);

  return g;
}

/** A glass panel with its chrome edge posts, standing on the tray. */
function glassPanel(width: number, height: number): THREE.Group {
  const g = new THREE.Group();
  const pane = new THREE.Mesh(new THREE.BoxGeometry(width, height, GLASS_T), glassMat());
  pane.position.y = height / 2;
  g.add(pane);
  for (const sx of [-1, 1]) {
    // Posts sit INSIDE the panel's width — centring them on the edge would
    // push the frame out past the tray it stands on.
    const post = new THREE.Mesh(new THREE.BoxGeometry(FRAME_T, height, FRAME_T), chromeMat());
    post.position.set((sx * (width - FRAME_T)) / 2, height / 2, 0);
    g.add(post);
  }
  return g;
}

export const showerGenerator: GeneratorDef = {
  id: "shower",
  label: "Shower",
  category: "Bathroom",
  rooms: ["bathroom"],
  wallSnap: true,
  dimLimits: { w: [0.7, 1.6], d: [0.7, 1.2], h: [1.8, 2.2] },
  modules: [{ key: "brassware", label: "Brassware", min: 0, max: 1, default: 1, toggle: { on: "With rail", off: "Head only" } }],
  fronts: ["slab"],
  handles: ["none"],
  finishes: ["acrylic", "ceramic"],
  variants: [
    { id: "enclosure", label: "Enclosure", cardLabel: "Shower enclosure" },
    { id: "walk-in", label: "Walk-in", cardLabel: "Walk-in shower" },
    { id: "wet-room", label: "Wet room", cardLabel: "Wet-room shower" },
  ],
  hotspotKeywords: ["shower"],
  defaultSpec: {
    generator: "shower",
    dims: { w: 0.9, d: 0.9, h: 2.0 },
    modules: { brassware: 1 },
    front: "slab",
    handle: "none",
    finish: "acrylic",
    variant: "enclosure",
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d, h } = spec.dims;
    const variant = spec.variant ?? "enclosure";
    const withRail = (spec.modules.brassware ?? 1) >= 1;
    const mat = finishMaterial(spec.finish);
    const group = new THREE.Group();

    const wetRoom = variant === "wet-room";
    const trayH = wetRoom ? 0 : TRAY_H;

    if (!wetRoom) {
      // Tray with a shallow dished top: the outer shell is a rounded slab and
      // the drain sits in a recess, so water visibly has somewhere to go.
      const tray = extrudeUp(roundedRect(w, d, 0.03), trayH, mat);
      group.add(tray);

      const dish = roundedRect(w - 0.06, d - 0.06, 0.025);
      dish.holes.push(toPath(roundedRect(0.1, 0.1, 0.02)));
      const dishMesh = extrudeUp(dish, 0.006, mat);
      dishMesh.position.y = trayH;
      group.add(dishMesh);
    }

    const waste = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.006, 18), wasteMat());
    waste.position.y = trayH + 0.001;
    group.add(waste);

    // Enclosure. The walls are at -X and -Z (the two the item snaps against),
    // so the glass closes the other two.
    // Panels stand off by half a frame profile, so the frame's outer face is
    // flush with the tray edge rather than proud of it.
    const inset = FRAME_T / 2;
    if (variant === "enclosure") {
      const front = glassPanel(w, h - trayH);
      front.position.set(0, trayH, d / 2 - inset);
      group.add(front);

      const side = glassPanel(d, h - trayH);
      side.rotation.y = Math.PI / 2;
      side.position.set(w / 2 - inset, trayH, 0);
      group.add(side);
    } else if (variant === "walk-in") {
      // One fixed panel covering about two thirds of the opening.
      const panel = glassPanel(w * 0.66, h - trayH);
      panel.position.set(-w * 0.17, trayH, d / 2 - inset);
      group.add(panel);
    }

    if (withRail) {
      const rail = brassware(h);
      rail.position.set(0, trayH, -d / 2 + 0.02);
      group.add(rail);
    } else {
      // Fixed head on a short arm off the wall.
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.26, 12), chromeMat());
      arm.rotation.x = Math.PI / 2;
      arm.position.set(0, trayH + 1.98, -d / 2 + 0.15);
      group.add(arm);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.016, 20), chromeMat());
      head.position.set(0, trayH + 1.96, -d / 2 + 0.28);
      group.add(head);
    }

    tagTintOfMaterial(group, spec.finish, spec.color, mat);
    return group;
  },
};
