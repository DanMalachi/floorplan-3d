import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { finishMaterial, tagTintOfMaterial } from "./materials";
import { chromeMat } from "./bathParts";
import { sealMat } from "./applianceParts";

// Bins — the third piece out of the old "Mirror & accessories" card, and the
// one that was least at home there: a bin is not a bathroom accessory, it is a
// thing every room has. It belongs to the kitchen's Trash button as much as to
// the bathroom's.
//
// The old one was a cone with a flat disc on top and a box for a pedal, which
// read as a paper cup. What makes a bin a bin is the LID LINE — the shadow gap
// between body and lid — plus the rim it sits on and the foot it stands on.

const LID_GAP = 0.006; // the shadow line that says "this opens"
const DOME_ARC = 0.34 * Math.PI; // how much of the sphere a soft-close lid is

/** How tall a lid stands above the body, so the body can be sized to leave
 *  room for it — a lid that overshoots is how the bin ended up taller than
 *  the height it was asked for. */
function lidHeight(r: number, domed: boolean): number {
  const cap = r * 1.03 * (1 - Math.cos(DOME_ARC));
  return 0.018 + LID_GAP + (domed ? cap : 0.016);
}

/** Stepped rim + lid, the pair that reads as a lid rather than a painted disc.
 *  Returns a group whose origin is the top of the body. */
function lidStack(r: number, mat: THREE.Material, domed: boolean): THREE.Group {
  const g = new THREE.Group();
  // Rim: a slightly wider collar the lid rests in.
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r, 0.018, 32), mat);
  rim.position.y = 0.009;
  g.add(rim);
  // The dark gap under the lid — this is what makes it read as a separate part.
  const gap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.99, r * 0.99, LID_GAP, 32), sealMat());
  gap.position.y = 0.018 + LID_GAP / 2;
  g.add(gap);

  const lidY = 0.018 + LID_GAP;
  if (domed) {
    // Sliced sphere: a soft-close bathroom lid is a shallow dome, not a plate.
    // Positioned by where its CAP has to land, not by its centre — a sphere
    // placed by its centre puts most of a radius above the bin.
    const R = r * 1.03;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 12, 0, Math.PI * 2, 0, DOME_ARC), mat);
    dome.position.y = lidY + R * (1 - Math.cos(DOME_ARC)) - R;
    g.add(dome);
  } else {
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.03, r * 1.03, 0.016, 32), mat);
    lid.position.y = lidY + 0.008;
    g.add(lid);
  }
  return g;
}

/** Pedal linkage at the foot: bracket, pivot and the plate you step on. Kept
 *  inside the bin's own footprint — a pedal poking out past the declared depth
 *  is the item passing through whatever it's parked against. */
function pedal(r: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const chrome = chromeMat();
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.012), chrome);
  arm.position.set(0, 0.03, r * 0.7);
  g.add(arm);
  const plate = new THREE.Mesh(new RoundedBoxGeometry(r * 0.7, 0.012, 0.04, 2, 0.005), mat);
  plate.position.set(0, 0.022, r * 0.8);
  g.add(plate);
  return g;
}

export const binGenerator: GeneratorDef = {
  id: "bin",
  label: "Bin",
  category: "Storage",
  rooms: ["bathroom", "kitchen"],
  wallSnap: false,
  dimLimits: { w: [0.15, 0.7], d: [0.15, 0.55], h: [0.2, 0.9] },
  modules: [],
  fronts: ["slab"],
  handles: ["none"],
  finishes: ["steel", "painted", "ceramic", "laminate-matte"],
  hotspotKeywords: ["bin", "trash", "waste", "recycling"],
  variantIsProduct: true,
  variants: [
    {
      id: "pedal",
      label: "Pedal",
      cardLabel: "Pedal bin",
      hotspotKeywords: ["bin", "trash", "waste"],
      defaults: { dims: { w: 0.25, d: 0.25, h: 0.32 }, finish: "steel" },
    },
    {
      id: "kitchen",
      label: "Kitchen",
      cardLabel: "Kitchen pedal bin",
      hotspotKeywords: ["bin", "trash", "waste"],
      rooms: ["kitchen"],
      defaults: { dims: { w: 0.35, d: 0.35, h: 0.7 }, finish: "steel" },
    },
    {
      id: "recycling",
      label: "Recycling",
      cardLabel: "Recycling twin bin",
      hotspotKeywords: ["bin", "trash", "recycling", "waste"],
      rooms: ["kitchen"],
      defaults: { dims: { w: 0.6, d: 0.34, h: 0.65 }, finish: "steel" },
    },
    {
      id: "open",
      label: "Open",
      cardLabel: "Open waste basket",
      hotspotKeywords: ["bin", "trash", "waste"],
      defaults: { dims: { w: 0.24, d: 0.24, h: 0.28 }, finish: "painted" },
    },
  ],
  defaultSpec: {
    generator: "bin",
    dims: { w: 0.25, d: 0.25, h: 0.32 },
    modules: {},
    front: "slab",
    handle: "none",
    finish: "steel",
    variant: "pedal",
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d, h } = spec.dims;
    const variant = spec.variant ?? "pedal";
    const mat = finishMaterial(spec.finish);
    const group = new THREE.Group();

    if (variant === "recycling") {
      // Two bays under one top, the shape of a sorting bin. Rectangular, not
      // round — that is how these are actually built, and it lets it sit flat
      // against a run of units.
      const bayW = (w - 0.012) / 2;
      const bodyH = h - 0.03;
      for (const sx of [-1, 1]) {
        const body = new THREE.Mesh(new RoundedBoxGeometry(bayW, bodyH, d, 3, 0.02), mat);
        body.position.set((sx * (bayW + 0.012)) / 2, bodyH / 2 + 0.02, 0);
        group.add(body);

        // Lid, split from the body by the same dark gap the round bins use, and
        // tinted apart so the two streams read as two streams.
        const lidMat = sx < 0 ? mat : sealMat();
        const gap = new THREE.Mesh(new THREE.BoxGeometry(bayW - 0.004, LID_GAP, d - 0.004), sealMat());
        gap.position.set((sx * (bayW + 0.012)) / 2, bodyH + 0.02 + LID_GAP / 2, 0);
        group.add(gap);
        const lid = new THREE.Mesh(new RoundedBoxGeometry(bayW + 0.004, 0.018, d + 0.004, 2, 0.006), lidMat);
        lid.position.set((sx * (bayW + 0.012)) / 2, bodyH + 0.02 + LID_GAP + 0.009, 0);
        group.add(lid);
        // Flap opening in each lid.
        const slot = new THREE.Mesh(new THREE.BoxGeometry(bayW * 0.5, 0.004, d * 0.5), sealMat());
        slot.position.set((sx * (bayW + 0.012)) / 2, bodyH + 0.02 + LID_GAP + 0.019, 0);
        group.add(slot);
      }
      // Plinth, so it doesn't read as a box dropped on the floor.
      const base = new THREE.Mesh(new THREE.BoxGeometry(w - 0.03, 0.02, d - 0.03), sealMat());
      base.position.y = 0.01;
      group.add(base);
      tagTintOfMaterial(group, spec.finish, spec.color, mat);
      return group;
    }

    const r = Math.min(w, d) / 2;
    const FOOT = 0.014;

    if (variant === "open") {
      // Open basket: genuinely hollow, because you look straight into it. An
      // open-ended cone plus an inner floor — the same lesson the toilet pan
      // and the sink bowl taught, a "hollow" that is a solid reads as a plug.
      const wall = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r * 0.78, h - FOOT, 32, 1, true),
        mat,
      );
      wall.position.y = (h - FOOT) / 2 + FOOT;
      wall.material.side = THREE.DoubleSide;
      group.add(wall);

      const floor = new THREE.Mesh(new THREE.CircleGeometry(r * 0.78, 32), mat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = FOOT + 0.004;
      group.add(floor);

      // Rolled rim at the mouth: the edge you see first, and what keeps the
      // open cone from ending in a paper-thin line.
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 8, 36), mat);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = h - 0.004;
      group.add(rim);

      const foot = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.78, r * 0.74, FOOT, 32), sealMat());
      foot.position.y = FOOT / 2;
      group.add(foot);

      tagTintOfMaterial(group, spec.finish, spec.color, mat);
      return group;
    }

    // Pedal bins (bathroom small, kitchen tall): tapered body, stepped rim and
    // lid, a foot it stands on, and the pedal that opens it.
    const domed = variant === "pedal";
    const bodyH = Math.max(h - lidHeight(r, domed) - FOOT, 0.05);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, bodyH, 32), mat);
    body.position.y = FOOT + bodyH / 2;
    group.add(body);

    // Seam a third of the way up — the join between the shell and its liner.
    const seam = new THREE.Mesh(new THREE.TorusGeometry(r * 0.955, 0.0025, 6, 36), sealMat());
    seam.rotation.x = Math.PI / 2;
    seam.position.y = FOOT + bodyH * 0.34;
    group.add(seam);

    const foot = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.86, FOOT, 32), sealMat());
    foot.position.y = FOOT / 2;
    group.add(foot);

    const lid = lidStack(r, mat, domed);
    lid.position.y = FOOT + bodyH;
    group.add(lid);

    const ped = pedal(r, mat);
    group.add(ped);

    tagTintOfMaterial(group, spec.finish, spec.color, mat);
    return group;
  },
};
