import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { finishMaterial, tagTintOfMaterial } from "./materials";
import { frontOf, barHandle, knobHandle, handleMat, FRONT_T, GAP, REVEAL, PANEL } from "./parts";
import { wasteMat, roundedRect, ellipsePath, toPath, extrudeUp, gooseneckTap } from "./bathParts";

// Basin & vanity — Phase 1 bathroom fixture #4.
//
// This is the one fixture that is half cabinet, so it borrows the cabinet
// joinery from parts.ts (fronts, handles, reveals) rather than reinventing it.
// What it does NOT borrow is the carcass: a vanity's basin has to cut into the
// top, so the top is built here with a real opening in it — the same reason
// sink.ts extrudes a rim with holes instead of laying a slab.
//
// Variants are the four ways a basin meets its support:
//   vanity-doors   cabinet with hinged doors, basin inset into the top
//   vanity-drawers cabinet with drawer fronts
//   countertop     cabinet with a solid top and a bowl SITTING ON it
//   pedestal       no cabinet — basin on a tapered ceramic column

const BASIN_D = 0.14; // bowl depth: shallower than a kitchen sink
const TOP_T = 0.03;
const WALL_T = 0.008;

/** Inset bowl: an open box that hangs below the vanity top's opening. */
function insetBowl(w: number, d: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_T, d), mat);
  floor.position.y = -BASIN_D + WALL_T / 2;
  g.add(floor);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(WALL_T, BASIN_D, d), mat);
    side.position.set((sx * (w - WALL_T)) / 2, -BASIN_D / 2, 0);
    g.add(side);
  }
  for (const sz of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(w, BASIN_D, WALL_T), mat);
    side.position.set(0, -BASIN_D / 2, (sz * (d - WALL_T)) / 2);
    g.add(side);
  }
  const waste = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.005, 14), wasteMat());
  waste.position.y = -BASIN_D + WALL_T;
  g.add(waste);
  return g;
}

/** Counter-top bowl: a shallow oval vessel that SITS on the surface. Built as
 *  a lathe so it keeps a ceramic silhouette, then squashed to an oval. */
function vesselBowl(rx: number, rz: number, mat: THREE.Material): THREE.Group {
  const profile: [number, number][] = [
    [0.004, 0.0],
    [0.055, 0.0],
    [0.085, 0.022],
    [0.115, 0.07],
    [0.128, 0.12],
    [0.13, 0.135], // rim
    [0.121, 0.135],
    [0.116, 0.11],
    [0.1, 0.06],
    [0.06, 0.025],
    [0.02, 0.018],
    [0.006, 0.022],
  ];
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y));
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(pts, 26), mat);
  const g = new THREE.Group();
  mesh.scale.set(rx / 0.13, 1, rz / 0.13);
  g.add(mesh);
  const waste = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.005, 14), wasteMat());
  waste.position.y = 0.021;
  g.add(waste);
  return g;
}

export const vanityGenerator: GeneratorDef = {
  id: "vanity",
  label: "Basin & vanity",
  category: "Bathroom",
  rooms: ["bathroom"],
  wallSnap: true,
  dimLimits: { w: [0.4, 1.6], d: [0.35, 0.6], h: [0.75, 0.95] },
  modules: [{ key: "doors", label: "Doors", min: 1, max: 4, default: 2 }],
  fronts: ["slab", "shaker"],
  handles: ["bar", "knob", "none"],
  finishes: ["painted", "oak", "walnut", "laminate-matte", "ceramic"],
  variants: [
    { id: "vanity-doors", label: "Doors", cardLabel: "Vanity with doors" },
    { id: "vanity-drawers", label: "Drawers", cardLabel: "Vanity with drawers" },
    { id: "countertop", label: "Vessel", cardLabel: "Vessel basin unit" },
    { id: "pedestal", label: "Pedestal", cardLabel: "Pedestal basin" },
  ],
  hotspotKeywords: ["sink", "basin", "vanity"],
  defaultSpec: {
    generator: "vanity",
    dims: { w: 0.8, d: 0.46, h: 0.85 },
    modules: { doors: 2 },
    front: "slab",
    handle: "bar",
    finish: "painted",
    variant: "vanity-doors",
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d, h } = spec.dims;
    const variant = spec.variant ?? "vanity-doors";
    const mat = finishMaterial(spec.finish);
    const ceramic = finishMaterial("ceramic");
    const group = new THREE.Group();

    const bowlW = Math.min(w * 0.55, 0.42);
    const bowlD = Math.min(d * 0.62, 0.32);

    if (variant === "pedestal") {
      // Basin carried on a tapered column: no cabinet, so the basin is the
      // full width of the item.
      const colTop = h - 0.12;
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, colTop, 20), ceramic);
      column.scale.set(1, 1, 0.75);
      column.position.y = colTop / 2;
      group.add(column);

      const basinShape = roundedRect(w, d, 0.05);
      basinShape.holes.push(toPath(roundedRect(w - 0.09, d - 0.09, 0.04)));
      const rim = extrudeUp(basinShape, 0.035, ceramic);
      rim.position.y = colTop;
      group.add(rim);

      const bowl = insetBowl(w - 0.09, d - 0.09, ceramic);
      bowl.position.y = colTop + 0.035;
      group.add(bowl);

      const tap = gooseneckTap();
      tap.position.set(0, colTop + 0.035, -d / 2 + 0.05);
      group.add(tap);

      tagTintOfMaterial(group, spec.finish, spec.color, mat);
      return group;
    }

    // ── Cabinet variants ──────────────────────────────────────────────────
    const doors = Math.max(1, Math.round(spec.modules.doors ?? 2));
    const bodyH = h - TOP_T;

    // Carcass: open-fronted box (fronts overlay it), on a small recessed base.
    const BASE = 0.06;
    const sides = new THREE.Group();
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(PANEL, bodyH - BASE, d), mat);
      side.position.set((sx * (w - PANEL)) / 2, BASE + (bodyH - BASE) / 2, 0);
      sides.add(side);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(w, bodyH - BASE, PANEL), mat);
    back.position.set(0, BASE + (bodyH - BASE) / 2, -d / 2 + PANEL / 2);
    sides.add(back);
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(w - 2 * PANEL, PANEL, d - PANEL), mat);
    bottom.position.set(0, BASE + PANEL / 2, PANEL / 2);
    sides.add(bottom);
    group.add(sides);

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w - 0.04, BASE, d - 0.03), mat);
    plinth.position.set(0, BASE / 2, -0.015);
    group.add(plinth);

    // Fronts.
    const frontZ = d / 2 + FRONT_T / 2;
    const bandH = bodyH - BASE - REVEAL;
    const handle = spec.handle === "none" ? null : spec.handle === "knob" ? knobHandle(handleMat()) : barHandle(handleMat());

    if (variant === "vanity-drawers") {
      const rows = 2;
      const rowH = bandH / rows;
      for (let i = 0; i < rows; i++) {
        const y = BASE + i * rowH + rowH / 2;
        const front = frontOf(spec.front, w - 2 * REVEAL, rowH - GAP, mat);
        front.position.set(0, y, frontZ);
        group.add(front);
        if (handle) {
          const hh = handle.clone();
          hh.rotation.z = Math.PI / 2; // horizontal, drawer convention (wardrobe.ts)
          hh.position.set(0, y, frontZ); // the handle group stands itself off the front
          group.add(hh);
        }
      }
    } else {
      const doorW = (w - 2 * REVEAL) / doors;
      for (let i = 0; i < doors; i++) {
        const cx = -w / 2 + REVEAL + doorW * (i + 0.5);
        const front = frontOf(spec.front, doorW - GAP, bandH, mat);
        front.position.set(cx, BASE + bandH / 2, frontZ);
        group.add(front);
        if (handle) {
          const hh = handle.clone();
          // Doors hinge outward in pairs, so handles meet at the centre gap.
          const dir = i < doors / 2 ? 1 : -1;
          hh.position.set(cx + dir * (doorW / 2 - 0.045), BASE + bandH / 2, frontZ);
          group.add(hh);
        }
      }
    }

    // Top. Inset variants get a real hole; the vessel variant keeps it solid.
    const inset = variant !== "countertop";
    const topShape = roundedRect(w, d, 0.012);
    if (inset) topShape.holes.push(ellipsePath(bowlW / 2, bowlD / 2));
    const top = extrudeUp(topShape, TOP_T, spec.finish === "ceramic" ? mat : ceramic);
    top.position.y = bodyH;
    group.add(top);

    const bowlZ = 0.01;
    if (inset) {
      const bowl = insetBowl(bowlW - 0.012, bowlD - 0.012, ceramic);
      bowl.position.set(0, bodyH + TOP_T, bowlZ);
      group.add(bowl);
    } else {
      const bowl = vesselBowl(bowlW / 2, bowlD / 2, ceramic);
      bowl.position.set(0, bodyH + TOP_T, bowlZ);
      group.add(bowl);
    }

    // Tap sits behind the bowl; a vessel basin needs a taller one to clear it.
    const tap = gooseneckTap(variant === "countertop" ? 1.5 : 1);
    tap.position.set(0, bodyH + TOP_T, -d / 2 + 0.06);
    group.add(tap);

    tagTintOfMaterial(group, spec.finish, spec.color, mat);
    return group;
  },
};
