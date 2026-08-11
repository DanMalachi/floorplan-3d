import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { finishMaterial, tagTintOfMaterial } from "./materials";
import { roundedRect, toPath, extrudeUp, gooseneckTap, wasteMat } from "./bathParts";

// Bathtub — Phase 1 bathroom fixture #2.
//
// Built as a SHELL, never a solid: the outer profile is extruded with the
// basin opening punched through it, so the top face of that extrusion is the
// rim and the recess below it is real depth. A tub modelled as a box with a
// darker top face reads as a block from every angle except straight down,
// which is the angle nobody uses.
//
// The three variants are three plan profiles of the same shell:
//   alcove        square-ish, tight corner radius — drops between three walls
//   freestanding  generous radius + a recessed plinth, reads as sculptural
//   corner        one corner swept away by a large arc, for a diagonal fit
// Standard alcove is 1.70 x 0.70 x 0.55, which is the default.

const RIM_W = 0.055; // rim width from outer edge to basin wall
const FLOOR_T = 0.025; // basin floor slab
const SKIRT = 0.1; // shell height left below the basin floor

/** Plan profile of the tub's outer edge, per variant. A corner variant was
 *  built and dropped on review — a corner tub only earns its shape at sizes
 *  that don't fit the rooms this app is used to design. */
function outerShape(variant: string, w: number, d: number): THREE.Shape {
  if (variant === "freestanding") return roundedRect(w, d, Math.min(w, d) * 0.3);
  return roundedRect(w, d, 0.05); // alcove
}

/** The basin opening, inset from the outer profile by the rim width. */
function basinShape(variant: string, w: number, d: number): THREE.Shape {
  return outerShape(variant, Math.max(w - 2 * RIM_W, 0.2), Math.max(d - 2 * RIM_W, 0.2));
}

export const bathtubGenerator: GeneratorDef = {
  id: "bathtub",
  label: "Bathtub",
  category: "Bathroom",
  rooms: ["bathroom"],
  wallSnap: true,
  dimLimits: { w: [1.0, 2.0], d: [0.6, 1.1], h: [0.4, 0.7] },
  modules: [{ key: "tap", label: "Tap", min: 0, max: 1, default: 1, toggle: { on: "With tap", off: "No tap" } }],
  fronts: ["slab"],
  handles: ["none"],
  finishes: ["acrylic", "ceramic"],
  variants: [
    { id: "alcove", label: "Alcove", cardLabel: "Alcove bath" },
    { id: "freestanding", label: "Freestanding", cardLabel: "Freestanding bath" },
  ],
  hotspotKeywords: ["bathtub", "tub"],
  defaultSpec: {
    generator: "bathtub",
    dims: { w: 1.7, d: 0.7, h: 0.55 },
    modules: { tap: 1 },
    front: "slab",
    handle: "none",
    finish: "acrylic",
    variant: "alcove",
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d, h } = spec.dims;
    const variant = spec.variant ?? "alcove";
    const withTap = (spec.modules.tap ?? 1) >= 1;
    const mat = finishMaterial(spec.finish);
    const group = new THREE.Group();

    const basinDepth = Math.max(h - SKIRT, 0.18);

    // Freestanding tubs read wrong sitting flat on the floor — they stand on a
    // recessed plinth that puts a shadow line under the shell. Everything else
    // is positioned relative to `baseY` so the two cases share one code path.
    const PLINTH_H = 0.035;
    const baseY = variant === "freestanding" ? PLINTH_H : 0;
    if (baseY > 0) group.add(extrudeUp(outerShape(variant, w - 0.14, d - 0.14), PLINTH_H, mat));

    // Shell: outer profile with the basin punched out, extruded the full
    // height. Its top face is the rim.
    const shell = outerShape(variant, w, d);
    shell.holes.push(toPath(basinShape(variant, w, d)));
    const shellMesh = extrudeUp(shell, h, mat);
    shellMesh.position.y = baseY;
    group.add(shellMesh);

    // Basin floor, slightly inset so it meets the basin walls cleanly.
    const floor = extrudeUp(basinShape(variant, w - 0.004, d - 0.004), FLOOR_T, mat);
    floor.position.y = baseY + h - basinDepth;
    group.add(floor);

    // Waste + overflow at the tap end (-X), the same end the tap mounts on.
    const waste = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.006, 16), wasteMat());
    waste.position.set(-w / 2 + RIM_W + 0.13, baseY + h - basinDepth + FLOOR_T, 0);
    group.add(waste);

    const overflow = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.008, 16), wasteMat());
    overflow.rotation.z = Math.PI / 2;
    overflow.position.set(-w / 2 + RIM_W + 0.006, baseY + h - 0.1, 0);
    group.add(overflow);

    if (withTap) {
      // Sits on the rim at the head end, spout reaching over the water.
      const tap = gooseneckTap(1.15);
      tap.rotation.y = Math.PI / 2;
      tap.position.set(-w / 2 + RIM_W / 2, baseY + h, 0);
      group.add(tap);
    }

    tagTintOfMaterial(group, spec.finish, spec.color, mat);
    return group;
  },
};
