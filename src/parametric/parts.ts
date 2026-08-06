// Shared geometry parts for parametric furniture generators. Dumb builders —
// boxes/cylinders in, mesh out — positioning and instancing is the caller's
// job. All dimensions in meters.

import * as THREE from "three";

export const PANEL = 0.018; // carcass panel thickness
export const FRONT_T = 0.019; // door/drawer front thickness
export const GAP = 0.003; // gap between adjacent fronts
export const REVEAL = 0.002; // outer reveal at carcass edges
export const PLINTH_H = 0.08; // kitchen plinth height
export const COUNTER_T = 0.04; // countertop thickness
export const COUNTER_OVER = 0.02; // countertop front overhang

const BACK_T = 0.012;

/** 5-panel open-front carcass: 2 sides (full height), top, bottom (between
 *  the sides), and a back inset flush at the rear. */
export function carcass(w: number, d: number, h: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const innerW = Math.max(w - 2 * PANEL, 0.01);

  const left = new THREE.Mesh(new THREE.BoxGeometry(PANEL, h, d), mat);
  left.position.set(-w / 2 + PANEL / 2, h / 2, 0);
  const right = new THREE.Mesh(new THREE.BoxGeometry(PANEL, h, d), mat);
  right.position.set(w / 2 - PANEL / 2, h / 2, 0);

  const top = new THREE.Mesh(new THREE.BoxGeometry(innerW, PANEL, d), mat);
  top.position.set(0, h - PANEL / 2, 0);
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(innerW, PANEL, d), mat);
  bottom.position.set(0, PANEL / 2, 0);

  const back = new THREE.Mesh(new THREE.BoxGeometry(innerW, Math.max(h - 2 * PANEL, 0.01), BACK_T), mat);
  back.position.set(0, h / 2, -d / 2 + BACK_T / 2);

  g.add(left, right, top, bottom, back);
  return g;
}

export function slabFront(w: number, h: number, mat: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, FRONT_T), mat);
}

/** 4-rail frame (60mm) around a recessed center panel. A frame too small for
 *  its stiles/rails (drawer-front territory) degrades to a plain slab. */
export function shakerFront(w: number, h: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  if (w < 0.18 || h < 0.18) {
    g.add(slabFront(w, h, mat));
    return g;
  }
  const RAIL_W = 0.06;
  const PANEL_T = 0.01;
  const RECESS = 0.008;
  const innerW = Math.max(w - 2 * RAIL_W, 0.01);
  const innerH = Math.max(h - 2 * RAIL_W, 0.01);

  const topRail = new THREE.Mesh(new THREE.BoxGeometry(w, RAIL_W, FRONT_T), mat);
  topRail.position.set(0, h / 2 - RAIL_W / 2, 0);
  const bottomRail = new THREE.Mesh(new THREE.BoxGeometry(w, RAIL_W, FRONT_T), mat);
  bottomRail.position.set(0, -h / 2 + RAIL_W / 2, 0);
  const leftStile = new THREE.Mesh(new THREE.BoxGeometry(RAIL_W, innerH, FRONT_T), mat);
  leftStile.position.set(-w / 2 + RAIL_W / 2, 0, 0);
  const rightStile = new THREE.Mesh(new THREE.BoxGeometry(RAIL_W, innerH, FRONT_T), mat);
  rightStile.position.set(w / 2 - RAIL_W / 2, 0, 0);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(innerW, innerH, PANEL_T), mat);
  panel.position.set(0, 0, FRONT_T / 2 - RECESS - PANEL_T / 2);

  g.add(topRail, bottomRail, leftStile, rightStile, panel);
  return g;
}

/** Slab + evenly spaced vertical battens (~100mm pitch), proud of the face.
 *  Short fronts (drawer territory) read as a plain slab. */
export function farmhouseFront(w: number, h: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.add(slabFront(w, h, mat));
  if (h < 0.25) return g;
  const BATTEN_W = 0.06;
  const BATTEN_PROUD = 0.006;
  const count = Math.max(0, Math.round(w / 0.1) - 1);
  for (let i = 0; i < count; i++) {
    const x = -w / 2 + (w * (i + 1)) / (count + 1);
    const batten = new THREE.Mesh(new THREE.BoxGeometry(BATTEN_W, h, BATTEN_PROUD), mat);
    batten.position.set(x, 0, FRONT_T / 2 + BATTEN_PROUD / 2);
    g.add(batten);
  }
  return g;
}

export function frontOf(
  style: "slab" | "shaker" | "farmhouse",
  w: number,
  h: number,
  mat: THREE.Material,
): THREE.Object3D {
  if (style === "shaker") return shakerFront(w, h, mat);
  if (style === "farmhouse") return farmhouseFront(w, h, mat);
  return slabFront(w, h, mat);
}

/** Vertical bar handle (doors' default orientation) with two mounting
 *  standoffs. Rotate 90° about local Z for the horizontal drawer convention. */
export function barHandle(mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const BAR_R = 0.006;
  const BAR_LEN = 0.15;
  const STANDOFF_R = 0.005;
  const STANDOFF_LEN = 0.035;
  const standoffZ = STANDOFF_LEN / 2;
  const barZ = STANDOFF_LEN + BAR_R;

  const bar = new THREE.Mesh(new THREE.CylinderGeometry(BAR_R, BAR_R, BAR_LEN, 12), mat);
  bar.position.set(0, 0, barZ);
  g.add(bar);

  for (const sy of [-1, 1]) {
    const standoff = new THREE.Mesh(new THREE.CylinderGeometry(STANDOFF_R, STANDOFF_R, STANDOFF_LEN, 8), mat);
    standoff.rotation.x = Math.PI / 2;
    standoff.position.set(0, (sy * BAR_LEN) / 2, standoffZ);
    g.add(standoff);
  }
  return g;
}

export function knobHandle(mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const SPHERE_R = 0.015;
  const STEM_R = 0.0075;
  const STEM_LEN = 0.02;

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(STEM_R, STEM_R, STEM_LEN, 8), mat);
  stem.rotation.x = Math.PI / 2;
  stem.position.set(0, 0, STEM_LEN / 2);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(SPHERE_R, 12, 10), mat);
  sphere.position.set(0, 0, STEM_LEN + SPHERE_R);

  g.add(stem, sphere);
  return g;
}

let _handleMat: THREE.MeshStandardMaterial | null = null;
/** Fixed brushed-metal finish, shared by every handle instance. */
export function handleMat(): THREE.MeshStandardMaterial {
  if (!_handleMat) _handleMat = new THREE.MeshStandardMaterial({ color: "#b8babd", metalness: 0.9, roughness: 0.35 });
  return _handleMat;
}

/** Kitchen kickboard, recessed 30mm from the carcass front face. */
export function plinth(w: number, d: number, mat: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(Math.max(w - 0.04, 0.01), PLINTH_H, Math.max(d - 0.03, 0.01)), mat);
}

/** Kitchen countertop, overhanging the carcass front face. */
export function countertop(w: number, d: number, mat: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, COUNTER_T, d + COUNTER_OVER), mat);
}
