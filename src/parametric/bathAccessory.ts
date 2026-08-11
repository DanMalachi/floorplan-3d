import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { finishMaterial, tagTintOfMaterial } from "./materials";
import { chromeMat, roundedRect, toPath, extrudeUp } from "./bathParts";

// Bathroom accessories — Phase 1 fixture #5, and the one that fills the dock's
// "Mirror, towel & bin" hotspot.
//
// Five small objects share one generator because they share one decision:
// where on the wall they hang. Splitting them into five generators would mean
// five near-identical files and five cards for what a user thinks of as
// "the small stuff".
//
// Everything here except the bin is WALL-MOUNTED, so `defaultElevation` puts a
// fresh placement at eye/rail height instead of on the floor, and the geometry
// is authored hanging off a wall at -Z, matching the wall-mounted convention
// kitchenWall already uses.

/** True mirror: a near-perfect metal reflector. Roughness has to stay very
 *  low — at even 0.1 the environment smears and it reads as brushed steel. */
let _mirror: THREE.MeshStandardMaterial | null = null;
function mirrorMat(): THREE.MeshStandardMaterial {
  if (!_mirror) {
    _mirror = new THREE.MeshStandardMaterial({ color: "#eef2f4", metalness: 1, roughness: 0.02, envMapIntensity: 1.6 });
  }
  return _mirror;
}

/** Rolled towel draped over a rail: a squashed torus reads as cloth far
 *  better than a flat plane, which vanishes edge-on. */
function towel(width: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const fold = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.028, 8, 20, Math.PI), mat);
  fold.rotation.y = Math.PI / 2;
  fold.scale.set(1, 1, width / 0.09);
  g.add(fold);
  return g;
}

export const bathAccessoryGenerator: GeneratorDef = {
  id: "bathAccessory",
  label: "Mirror & accessories",
  category: "Bathroom",
  rooms: ["bathroom"],
  wallSnap: true,
  dimLimits: { w: [0.15, 1.2], d: [0.06, 0.35], h: [0.1, 1.2] },
  modules: [],
  fronts: ["slab"],
  handles: ["none"],
  finishes: ["painted", "oak", "walnut", "ceramic"],
  defaultElevation: 1.25,
  // Everything here hangs on the wall except the bin, which stands on the
  // floor — so placement mode follows the variant, not the generator.
  wallMounted: (spec) => (spec.variant ?? "mirror") !== "bin",
  // Each accessory stands on its own in the picker — they share a generator
  // only because they share a mounting decision, not because they're one
  // product. Hence per-variant hotspot keywords: the Mirror hotspot must not
  // surface the bin.
  variants: [
    { id: "mirror", label: "Mirror", cardLabel: "Wall mirror", hotspotKeywords: ["mirror"] },
    { id: "cabinet", label: "Cabinet", cardLabel: "Mirror cabinet", hotspotKeywords: ["mirror", "cabinet"] },
    { id: "towel-rail", label: "Rail", cardLabel: "Towel rail", hotspotKeywords: ["towel"] },
    { id: "towel-ladder", label: "Ladder", cardLabel: "Heated towel ladder", hotspotKeywords: ["towel"] },
    { id: "bin", label: "Bin", cardLabel: "Bathroom bin", hotspotKeywords: ["bin", "trash"] },
  ],
  hotspotKeywords: ["mirror", "towel", "bin", "trash"],
  defaultSpec: {
    generator: "bathAccessory",
    dims: { w: 0.6, d: 0.12, h: 0.75 },
    modules: {},
    front: "slab",
    handle: "none",
    finish: "painted",
    variant: "mirror",
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d, h } = spec.dims;
    const variant = spec.variant ?? "mirror";
    const mat = finishMaterial(spec.finish);
    const chrome = chromeMat();
    const group = new THREE.Group();

    if (variant === "mirror") {
      // Frame with the glass recessed into it, so the frame casts a lip.
      const FRAME = 0.03;
      const frameShape = roundedRect(w, h, 0.01);
      frameShape.holes.push(toPath(roundedRect(w - 2 * FRAME, h - 2 * FRAME, 0.008)));
      const frame = extrudeUp(frameShape, 0.035, mat);
      frame.rotation.x = 0; // stand it vertical against the wall, not flat
      group.add(frame);

      const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 2 * FRAME, h - 2 * FRAME), mirrorMat());
      glass.position.z = 0.012;
      group.add(glass);
    } else if (variant === "cabinet") {
      // Shallow carcass with a mirrored door.
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      body.position.z = -d / 2;
      group.add(body);

      const door = new THREE.Mesh(new THREE.BoxGeometry(w - 0.01, h - 0.01, 0.016), mat);
      group.add(door);

      const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.05, h - 0.05), mirrorMat());
      glass.position.z = 0.009;
      group.add(glass);
    } else if (variant === "towel-rail") {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, w, 12), chrome);
      rail.rotation.z = Math.PI / 2;
      group.add(rail);

      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 10), chrome);
        post.rotation.x = Math.PI / 2;
        post.position.set((sx * w) / 2, 0, -0.035);
        group.add(post);

        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.006, 12), chrome);
        plate.rotation.x = Math.PI / 2;
        plate.position.set((sx * w) / 2, 0, -0.07);
        group.add(plate);
      }
      group.add(towel(w * 0.4, mat));
    } else if (variant === "towel-ladder") {
      // Heated-rail look: two uprights and a stack of rungs.
      const rungs = Math.max(3, Math.round(h / 0.13));
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, h, 12), chrome);
        post.position.set((sx * (w - 0.03)) / 2, h / 2, 0);
        group.add(post);
      }
      for (let i = 0; i < rungs; i++) {
        const y = (h / rungs) * (i + 0.5);
        const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, w - 0.03, 10), chrome);
        rung.rotation.z = Math.PI / 2;
        rung.position.y = y;
        group.add(rung);
      }
      const t = towel(w * 0.35, mat);
      t.position.set(w * 0.1, h * 0.62, 0);
      group.add(t);
    } else {
      // Pedal bin: tapered body, a lid disc and a small pedal.
      const r = Math.min(w, d) / 2;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.86, h, 24), mat);
      body.position.y = h / 2;
      group.add(body);

      const lid = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.03, r * 1.03, 0.022, 24), chrome);
      lid.position.y = h + 0.011;
      group.add(lid);

      const pedal = new THREE.Mesh(new THREE.BoxGeometry(r * 0.7, 0.014, 0.05), chrome);
      pedal.position.set(0, 0.02, r * 0.75);
      group.add(pedal);
    }

    tagTintOfMaterial(group, spec.finish, spec.color, mat);
    return group;
  },
};
