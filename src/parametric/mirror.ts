import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { finishMaterial, tagTintOfMaterial } from "./materials";
import { chromeMat, roundedRect, toPath, extrudeUp } from "./bathParts";

// Mirrors — split out of the old "Mirror & accessories" catch-all, which put a
// mirror, a cabinet, two towel rails and a bin behind one card and one set of
// dimensions. A mirror is a product; so is a towel rail; so is a bin.
//
// THE GLASS ACTUALLY REFLECTS. It used to be a MeshStandardMaterial at
// metalness 1 / roughness 0.02, which reflects the ENVIRONMENT map — outdoors
// that is a sky, indoors it is nothing, so the panel read as flat grey paint.
// A mirror shows the ROOM, and the room is only in the scene graph, so this
// needs a planar reflection pass: three's Reflector renders the scene from the
// mirrored camera into a texture each frame. That costs one extra scene render
// per mirror, which is why the texture is kept modest and why mirrors are the
// only thing in the catalog that gets one.

const GLASS_TINT = 0xc9d1d4; // real glass returns ~90% of the light, not 100%
const REFLECT_RES = 512;

/** Reflective pane facing +Z, centred on its own origin. Flagged so
 *  ParametricModel leaves its material alone — the reflection lives in that
 *  material's uniforms, and a clone of it renders a frozen frame. */
function mirrorPane(w: number, h: number, round = false): THREE.Mesh {
  const geo = round
    ? new THREE.CircleGeometry(Math.min(w, h) / 2, 48)
    : new THREE.PlaneGeometry(w, h);
  const pane = new Reflector(geo, {
    color: GLASS_TINT,
    textureWidth: REFLECT_RES,
    textureHeight: REFLECT_RES,
  });
  pane.userData.keepMaterial = true;
  return pane;
}

export const mirrorGenerator: GeneratorDef = {
  id: "mirror",
  label: "Mirror",
  category: "Bathroom",
  rooms: ["bathroom"],
  wallSnap: true,
  dimLimits: { w: [0.25, 1.6], d: [0.02, 0.2], h: [0.25, 1.8] },
  modules: [],
  fronts: ["slab"],
  handles: ["none"],
  finishes: ["painted", "oak", "walnut", "steel"],
  wallMounted: () => true,
  // No defaultElevation: a wall item takes its height from the wall-ray click,
  // and a number here would only ever mislead the floor path.
  hotspotKeywords: ["mirror"],
  variantIsProduct: true,
  variants: [
    { id: "framed", label: "Framed", cardLabel: "Framed mirror", hotspotKeywords: ["mirror"], defaults: { dims: { w: 0.6, d: 0.05, h: 0.8 }, finish: "oak" } },
    { id: "round", label: "Round", cardLabel: "Round mirror", hotspotKeywords: ["mirror"], defaults: { dims: { w: 0.7, d: 0.05, h: 0.7 }, finish: "steel" } },
    { id: "frameless", label: "Frameless", cardLabel: "Frameless mirror", hotspotKeywords: ["mirror"], defaults: { dims: { w: 0.9, d: 0.03, h: 0.7 }, finish: "painted" } },
    { id: "cabinet", label: "Cabinet", cardLabel: "Mirror cabinet", hotspotKeywords: ["mirror", "cabinet"], defaults: { dims: { w: 0.7, d: 0.15, h: 0.65 }, finish: "painted" } },
  ],
  defaultSpec: {
    generator: "mirror",
    dims: { w: 0.6, d: 0.05, h: 0.8 },
    modules: {},
    front: "slab",
    handle: "none",
    finish: "oak",
    variant: "framed",
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d, h } = spec.dims;
    const variant = spec.variant ?? "framed";
    const mat = finishMaterial(spec.finish);
    const group = new THREE.Group();
    // Authored centred (a mirror is symmetric), then lifted so y=0 is its
    // BOTTOM edge — the convention every generator follows and, more to the
    // point, what the wall ghost assumes: it clamps the click height against
    // the item's own height to keep the top under the ceiling. A centred
    // mirror hung half of itself below wherever you clicked.
    const body = new THREE.Group();
    body.position.y = h / 2;
    group.add(body);

    if (variant === "round") {
      const r = Math.min(w, h) / 2;
      // Frame is a shallow drum behind the glass, so the mirror has an edge
      // and a shadow line instead of floating flat on the wall.
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d, 48), mat);
      rim.rotation.x = Math.PI / 2;
      rim.position.z = -d / 2;
      body.add(rim);

      const pane = mirrorPane(r * 1.88, r * 1.88, true);
      pane.position.z = 0.004;
      body.add(pane);
    } else if (variant === "frameless") {
      // No frame at all: the glass itself, with a polished bevel showing as a
      // thin bright edge around a slightly smaller backing plate.
      const back = new THREE.Mesh(new THREE.BoxGeometry(w - 0.012, h - 0.012, d), chromeMat());
      back.position.z = -d / 2;
      body.add(back);

      const pane = mirrorPane(w, h);
      pane.position.z = 0.002;
      body.add(pane);
    } else if (variant === "cabinet") {
      const carcass = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      carcass.position.z = -d / 2;
      body.add(carcass);
      // One shelf, visible along the edges — a mirror cabinet is a cupboard.
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(w - 0.03, 0.012, d - 0.02), mat);
      shelf.position.set(0, 0, -d / 2);
      body.add(shelf);

      const doorT = 0.018;
      const door = new THREE.Mesh(new THREE.BoxGeometry(w - 0.008, h - 0.008, doorT), mat);
      door.position.z = doorT / 2;
      body.add(door);

      const pane = mirrorPane(w - 0.05, h - 0.05);
      pane.position.z = doorT + 0.003;
      body.add(pane);
    } else {
      // Framed: a real frame section with the glass recessed inside it.
      const FRAME = Math.min(0.045, w * 0.12, h * 0.12);
      const shape = roundedRect(w, h, 0.012);
      shape.holes.push(toPath(roundedRect(w - 2 * FRAME, h - 2 * FRAME, 0.008)));
      const frame = extrudeUp(shape, d, mat);
      frame.rotation.x = 0; // stand it against the wall, not flat on the floor
      frame.position.z = -d;
      body.add(frame);

      // Glass sits in a rebate just behind the frame's FRONT face, which is
      // where a framed mirror's glass is. Set at the back of the frame instead
      // — as this was — it lies at the bottom of a 4cm well no wider than the
      // frame, so from any angle but dead-on you see frame edge and no glass
      // at all: a picture frame with nothing in it.
      const pane = mirrorPane(w - 2 * FRAME - 0.004, h - 2 * FRAME - 0.004);
      pane.position.z = -0.005;
      body.add(pane);

      // Backing board behind the glass, so an open frame doesn't show the wall.
      const back = new THREE.Mesh(new THREE.BoxGeometry(w - 2 * FRAME + 0.01, h - 2 * FRAME + 0.01, 0.008), mat);
      back.position.z = -0.02;
      body.add(back);
    }

    tagTintOfMaterial(group, spec.finish, spec.color, mat);
    return group;
  },
};
