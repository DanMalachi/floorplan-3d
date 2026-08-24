import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { cabinetRow, barHandle, knobHandle, handleMat, PLINTH_H, COUNTER_T, COUNTER_OVER } from "./parts";
import { finishMaterial, tagTint } from "./materials";
import { pathLegs, legAtAlong, rowPlacement, type RunLeg } from "./runPath";

function handleFor(spec: ParametricSpec): THREE.Object3D | null {
  if (spec.handle === "none") return null;
  const mat = handleMat();
  return spec.handle === "knob" ? knobHandle(mat) : barHandle(mat);
}

/**
 * One continuous countertop slab covering the whole path: back polyline along
 * the legs' back edges, front offset by depth + overhang, mitred at each
 * right-angle corner, flush end caps — extruded as a single Shape with REAL
 * holes for the cutouts. Local origin: the slab's bottom plane at y=0 (the
 * caller lifts it to the carcass top).
 */
function counterSlabForPath(
  legs: RunLeg[],
  d: number,
  cutouts: readonly { along: number; w: number; d: number }[],
  mat: THREE.Material,
): THREE.Mesh {
  const D = d + COUNTER_OVER;
  // Back points: leg starts + final end.
  const back: { x: number; z: number }[] = legs.map((l) => ({ x: l.sx, z: l.sz }));
  const last = legs[legs.length - 1];
  back.push({ x: last.sx + last.dx * last.len, z: last.sz + last.dz * last.len });
  // Front points, walked backward: end cap, then mitres (corner + fᵢ·D +
  // fᵢ₊₁·D — exact for right angles), then the start cap point.
  const front: { x: number; z: number }[] = [
    { x: back[back.length - 1].x + last.fx * D, z: back[back.length - 1].z + last.fz * D },
  ];
  for (let i = legs.length - 1; i >= 1; i--) {
    const a = legs[i - 1];
    const b = legs[i];
    front.push({ x: b.sx + a.fx * D + b.fx * D, z: b.sz + a.fz * D + b.fz * D });
  }
  front.push({ x: back[0].x + legs[0].fx * D, z: back[0].z + legs[0].fz * D });

  // three's -90°-about-X extrusion maps shape (x, y) → world (x, z = -y).
  const shape = new THREE.Shape();
  const ring = [...back, ...front];
  shape.moveTo(ring[0].x, -ring[0].z);
  for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i].x, -ring[i].z);
  shape.closePath();

  for (const c of cutouts) {
    const { leg, u } = legAtAlong(legs, c.along);
    const cx = leg.sx + leg.dx * u + leg.fx * (d / 2);
    const cz = leg.sz + leg.dz * u + leg.fz * (d / 2);
    const hw = Math.min(c.w, d - 0.03) / 2;
    const hd = Math.min(c.d, d - 0.03) / 2;
    const hole = new THREE.Path();
    const corners = [
      { x: cx - leg.dx * hw - leg.fx * hd, z: cz - leg.dz * hw - leg.fz * hd },
      { x: cx + leg.dx * hw - leg.fx * hd, z: cz + leg.dz * hw - leg.fz * hd },
      { x: cx + leg.dx * hw + leg.fx * hd, z: cz + leg.dz * hw + leg.fz * hd },
      { x: cx - leg.dx * hw + leg.fx * hd, z: cz - leg.dz * hw + leg.fz * hd },
    ];
    hole.moveTo(corners[0].x, -corners[0].z);
    for (let i = 1; i < 4; i++) hole.lineTo(corners[i].x, -corners[i].z);
    hole.closePath();
    shape.holes.push(hole);
  }

  const geo = new THREE.ExtrudeGeometry(shape, { depth: COUNTER_T, bevelEnabled: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export const kitchenBaseGenerator: GeneratorDef = {
  id: "kitchenBase",
  label: "Kitchen base run",
  category: "Kitchen",
  rooms: ["kitchen"],
  wallSnap: true,
  // dims.h IS the counter surface height (v1 kitchenRun fixed this at 0.84 —
  // here it's the dimension the user sets); carcass height derives from it.
  dimLimits: { w: [0.6, 6.0], d: [0.55, 0.7], h: [0.75, 0.95] },
  modules: [{ key: "drawerUnits", label: "Drawer units", min: 0, max: 4, default: 1 }],
  fronts: ["slab", "shaker", "farmhouse"],
  handles: ["bar", "knob", "none"],
  finishes: ["painted", "laminate-matte", "laminate-gloss", "oak", "walnut", "wood-walnut-dark", "wood-plank-pale"],
  finishes2: ["counter-oak", "counter-white", "counter-dark"],
  hotspotKeywords: ["cabinet", "counter", "island"],
  defaultSpec: {
    generator: "kitchenBase",
    dims: { w: 2.4, d: 0.6, h: 0.84 },
    modules: { drawerUnits: 1 },
    front: "slab",
    handle: "bar",
    finish: "painted",
    finish2: "counter-oak",
  },
  build(spec: ParametricSpec): THREE.Group {
    const { d, h } = spec.dims;
    const drawerUnits = Math.max(0, Math.round(spec.modules.drawerUnits ?? 1));
    const mat = finishMaterial(spec.finish);
    const counterMat = finishMaterial(spec.finish2 ?? "counter-oak");
    const carcassH = Math.max(h - PLINTH_H - COUNTER_T, 0.3);
    const group = new THREE.Group();
    const legs = pathLegs(spec);

    // Where each cutout falls in its leg's row-local x, so the units under a
    // sink/hob lose their top panel and the basin hangs INTO the cabinet.
    const openTop: { x0: number; x1: number }[][] = legs.map(() => []);
    for (const c of spec.cutouts ?? []) {
      const { leg, u } = legAtAlong(legs, c.along);
      const i = legs.indexOf(leg);
      if (i < 0) continue;
      const lead = i > 0 ? d : 0;
      openTop[i].push({ x0: u - lead - c.w / 2, x1: u - lead + c.w / 2 });
    }

    // Cabinet rows per leg (corner squares excluded), corner blanks between.
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      const lead = i > 0 ? d : 0;
      const trail = i < legs.length - 1 ? d : 0;
      const spanLen = leg.len - lead - trail;
      if (spanLen > 0.05) {
        const row = cabinetRow({
          len: spanLen, d, carcassH, yBase: PLINTH_H, mat,
          front: spec.front,
          handle: () => handleFor(spec),
          drawerUnits: i === 0 ? drawerUnits : 0,
          handleAt: "top",
          withPlinth: true,
          openTop: openTop[i],
        });
        tagTint(row, spec.finish, spec.color);
        // Oriented off the FRONT normal, not the travel direction — see
        // rowPlacement. Taking it from travel mirrored the cabinets onto the
        // far side of the wall whenever a run was drawn backwards along it.
        const at = rowPlacement(leg, lead, trail);
        row.position.set(at.x, 0, at.z);
        row.rotation.y = at.yaw;
        group.add(row);
      }
      if (i > 0) {
        // Blank corner unit filling the d×d square, plinth under it.
        const ccx = leg.sx + leg.dx * (d / 2) + leg.fx * (d / 2);
        const ccz = leg.sz + leg.dz * (d / 2) + leg.fz * (d / 2);
        const blank = new THREE.Mesh(new THREE.BoxGeometry(d, carcassH, d), mat);
        blank.position.set(ccx, PLINTH_H + carcassH / 2, ccz);
        const cPlinth = new THREE.Mesh(new THREE.BoxGeometry(d - 0.03, PLINTH_H, d - 0.03), mat);
        cPlinth.position.set(ccx, PLINTH_H / 2, ccz);
        tagTint(blank, spec.finish, spec.color);
        tagTint(cPlinth, spec.finish, spec.color);
        group.add(blank, cPlinth);
      }
    }

    // ONE continuous countertop following the whole path — mitred at the
    // corners, front overhang throughout, REAL holes for attached cutouts.
    const counter = counterSlabForPath(legs, d, spec.cutouts ?? [], counterMat);
    tagTint(counter, spec.finish2 ?? "counter-oak", spec.color2);
    counter.position.y = PLINTH_H + carcassH;
    group.add(counter);

    return group;
  },
};
