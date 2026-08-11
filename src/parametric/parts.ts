// Shared geometry parts for parametric furniture generators. Dumb builders —
// boxes/cylinders in, mesh out — positioning and instancing is the caller's
// job. All dimensions in meters.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

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

/**
 * Countertop with REAL holes (Kitchen v2): a Shape-with-holes extrusion, so a
 * sink basin actually hangs through the slab and a cooktop sits in a well —
 * no CSG library. `cutouts[].along` is meters from the slab's LEFT edge to
 * the hole center; holes are clamped to keep ≥15mm of slab at every edge.
 *
 * Placement contract (differs from `countertop`, whose box is center-origin):
 * the mesh's local origin is the slab's BOTTOM plane at the carcass center —
 * position it at (0, counterBottomY, COUNTER_OVER / 2) and the slab spans the
 * same volume the box version did, holes centered on the carcass centerline.
 */
export function countertopWithCutouts(
  w: number,
  d: number,
  cutouts: readonly { along: number; w: number; d: number }[],
  mat: THREE.Material,
): THREE.Mesh {
  const D = d + COUNTER_OVER;
  const EDGE = 0.015;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, -D / 2);
  shape.lineTo(w / 2, -D / 2);
  shape.lineTo(w / 2, D / 2);
  shape.lineTo(-w / 2, D / 2);
  shape.closePath();

  for (const c of cutouts) {
    const hw = Math.min(c.w, w - 2 * EDGE) / 2;
    const hd = Math.min(c.d, d - 2 * EDGE) / 2;
    if (hw <= 0.01 || hd <= 0.01) continue;
    const cx = Math.min(Math.max(c.along - w / 2, -w / 2 + EDGE + hw), w / 2 - EDGE - hw);
    // Shape-y maps to world -z after the -90° X rotation below; the carcass
    // centerline (world z = 0) is shape-y = +COUNTER_OVER / 2.
    const cy = COUNTER_OVER / 2;
    const hole = new THREE.Path();
    hole.moveTo(cx - hw, cy - hd);
    hole.lineTo(cx + hw, cy - hd);
    hole.lineTo(cx + hw, cy + hd);
    hole.lineTo(cx - hw, cy + hd);
    hole.closePath();
    shape.holes.push(hole);
  }

  const geo = new THREE.ExtrudeGeometry(shape, { depth: COUNTER_T, bevelEnabled: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/**
 * One straight row of cabinets for a run leg (Kitchen v2.1). Local frame:
 * x 0→len, back plane z=0, front z=d, carcass bottom at yBase. The caller
 * positions/rotates the returned group onto its leg. Tinting is the caller's
 * job (it owns the spec).
 */
export function cabinetRow(o: {
  len: number;
  d: number;
  carcassH: number;
  yBase: number;
  mat: THREE.Material;
  front: "slab" | "shaker" | "farmhouse";
  handle: (() => THREE.Object3D | null) | null;
  drawerUnits?: number; // leading units built as 3-drawer stacks
  handleAt: "top" | "bottom"; // door-handle edge
  withPlinth?: boolean;
}): THREE.Group {
  const g = new THREE.Group();
  if (o.len < 0.05) return g;
  const HANDLE_INSET = 0.04;
  const unitCount = Math.max(1, Math.round(o.len / 0.6));
  const unitW = o.len / unitCount;
  const drawersEff = Math.min(o.drawerUnits ?? 0, unitCount);
  const frontBandH = Math.max(o.carcassH - 2 * REVEAL, 0.1);
  const frontBandBottom = o.yBase + REVEAL;
  const frontZ = o.d + FRONT_T / 2;

  for (let i = 0; i < unitCount; i++) {
    const x = unitW * (i + 0.5);
    const unit = carcass(unitW, o.d, o.carcassH, o.mat);
    unit.position.set(x, o.yBase, o.d / 2);
    g.add(unit);

    const frontBandW = Math.max(unitW - 2 * REVEAL, 0.1);
    if (i < drawersEff) {
      const thirdH = frontBandH / 3;
      for (let j = 0; j < 3; j++) {
        const y = frontBandBottom + j * thirdH + thirdH / 2;
        const front = frontOf(o.front, frontBandW, thirdH - GAP, o.mat);
        front.position.set(x, y, frontZ);
        g.add(front);
        const h = o.handle?.();
        if (h) {
          h.rotation.z = Math.PI / 2; // horizontal, drawer convention
          h.position.set(x, y, frontZ);
          g.add(h);
        }
      }
    } else {
      const y = frontBandBottom + frontBandH / 2;
      const front = frontOf(o.front, frontBandW, frontBandH, o.mat);
      front.position.set(x, y, frontZ);
      g.add(front);
      const h = o.handle?.();
      if (h) {
        const hingeLeft = i % 2 === 0;
        const hx = hingeLeft ? x + frontBandW / 2 - HANDLE_INSET : x - frontBandW / 2 + HANDLE_INSET;
        const hy = o.handleAt === "top" ? frontBandBottom + frontBandH - 0.06 : frontBandBottom + 0.06;
        h.position.set(hx, hy, frontZ);
        g.add(h);
      }
    }
  }

  if (o.withPlinth) {
    const p = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(o.len - 0.04, 0.01), PLINTH_H, Math.max(o.d - 0.03, 0.01)),
      o.mat,
    );
    p.position.set(o.len / 2, PLINTH_H / 2, o.d / 2 - 0.015);
    g.add(p);
  }
  return g;
}

/** Soft-edged box for sofa seat/back cushions, arms and pillows. */
export function cushion(w: number, d: number, h: number, mat: THREE.Material): THREE.Mesh {
  const radius = Math.min(w, d, h) * 0.18;
  return new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, radius), mat);
}
