import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

// Shared building blocks for the appliance generators (Phase 2: white goods +
// the extractor hood). Its own module for the same reason bathParts.ts is one —
// parts.ts is cabinet joinery and none of it describes a machine.
//
// What every appliance here has in common is a small vocabulary: a steel body
// with a door proud of it, a bar pull, a control strip, a porthole, a grille.
// Building that vocabulary once is what stops twelve variants from becoming
// twelve piles of boxes.
//
// Convention, unless a doc comment says otherwise: a helper returns a group
// centred on its own origin and facing +Z (the front), and the CALLER puts it
// where it goes — same contract parts.ts uses.

/** Dark rubber/plastic: door gaskets, the recess behind a porthole, vents.
 *  Nearly matte, so it reads as the shadow line between panels. */
let _seal: THREE.MeshStandardMaterial | null = null;
export function sealMat(): THREE.MeshStandardMaterial {
  if (!_seal) _seal = new THREE.MeshStandardMaterial({ color: "#26282b", roughness: 0.85, metalness: 0.1 });
  return _seal;
}

/** Bright chromed trim: pull rails, porthole rings, knob collars. Brighter
 *  than parts.ts's brushed `handleMat()` — appliance hardware is polished. */
let _trim: THREE.MeshStandardMaterial | null = null;
export function trimMat(): THREE.MeshStandardMaterial {
  if (!_trim) _trim = new THREE.MeshStandardMaterial({ color: "#d2d5d8", metalness: 1, roughness: 0.14 });
  return _trim;
}

/** Door glass: oven fronts, microwave windows, porthole panes. Nearly black
 *  and smooth. Deliberately NOT transmissive — the shower-glass lesson from
 *  Phase 1: transmission needs its own render pass and turns panels into
 *  mirrors of the room. A dark, low-roughness opaque pane reads as glass. */
let _glass: THREE.MeshStandardMaterial | null = null;
export function glassMat(): THREE.MeshStandardMaterial {
  if (!_glass) _glass = new THREE.MeshStandardMaterial({ color: "#15171a", metalness: 0.2, roughness: 0.08 });
  return _glass;
}

/** Lit display panel. Emissive so it stays readable at any time of day —
 *  a machine with a dark rectangle where the clock should be looks broken. */
let _display: THREE.MeshStandardMaterial | null = null;
export function displayMat(): THREE.MeshStandardMaterial {
  if (!_display) {
    _display = new THREE.MeshStandardMaterial({
      color: "#0b1418",
      emissive: new THREE.Color("#3fb8d4"),
      emissiveIntensity: 0.75,
      roughness: 0.3,
    });
  }
  return _display;
}

/**
 * Appliance carcass: a box with a slightly softened edge, so the body catches
 * a highlight along its corners instead of dying into a flat silhouette.
 * Origin at the FLOOR centre (bottom y=0), front at +d/2.
 */
export function applianceBody(w: number, d: number, h: number, mat: THREE.Material): THREE.Mesh {
  const r = Math.min(0.012, w / 4, d / 4, h / 4);
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), mat);
  mesh.position.y = h / 2;
  return mesh;
}

/**
 * A door/front panel standing PROUD of the body it covers, with the gasket
 * shadow behind it. Centred on its own origin, facing +Z; the caller puts it
 * at the body's front face.
 */
export function doorPanel(w: number, h: number, mat: THREE.Material, t = 0.022): THREE.Group {
  const g = new THREE.Group();
  const r = Math.min(0.008, w / 4, h / 4);
  const panel = new THREE.Mesh(new RoundedBoxGeometry(w, h, t, 2, r), mat);
  panel.position.z = t / 2;
  g.add(panel);
  // Gasket: a slightly smaller dark slab behind the panel, so the join reads
  // as a seal rather than as two boxes touching.
  const seal = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w - 0.012, 0.01), Math.max(h - 0.012, 0.01), 0.01), sealMat());
  seal.position.z = -0.005;
  g.add(seal);
  return g;
}

/**
 * Tube pull on two standoffs — the fridge/oven/dishwasher handle. `len` is the
 * bar length; the group's origin sits ON the door face and the bar stands off
 * it toward +Z, so a caller only has to position it on the panel.
 * `vertical` runs the bar up the door (fridge); default is across it.
 */
export function barPull(len: number, vertical = false, mat: THREE.Material = trimMat()): THREE.Group {
  const g = new THREE.Group();
  // Kept tight on purpose: a pull is the frontmost thing on an appliance, and
  // the body is sized so the WHOLE assembly fits the declared depth. A deep
  // standoff here comes straight off the carcass behind it.
  const R = 0.01;
  const STANDOFF = 0.028;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(R, R, len, 14), mat);
  bar.rotation.z = Math.PI / 2; // cylinders are Y-up; lay it along X
  bar.position.z = STANDOFF + R;
  g.add(bar);
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, STANDOFF, 10), mat);
    post.rotation.x = Math.PI / 2;
    post.position.set((s * len) / 2 - s * 0.02, 0, STANDOFF / 2);
    g.add(post);
  }
  if (vertical) g.rotation.z = Math.PI / 2;
  return g;
}

/**
 * Washing-machine/dryer porthole: chromed ring, dark glass, and a real recess
 * behind it. The drum is what makes it read as a machine rather than a circle
 * painted on a box — edge-on, a flat disc disappears.
 */
export function porthole(r: number): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.016, 10, 30), trimMat());
  ring.position.z = 0.014;
  g.add(ring);

  const glass = new THREE.Mesh(new THREE.CircleGeometry(Math.max(r - 0.008, 0.01), 30), glassMat());
  glass.position.z = 0.008;
  g.add(glass);

  // Recess: a short cone running back into the body, dark inside.
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(r - 0.01, 0.01), Math.max(r - 0.05, 0.008), 0.12, 24, 1, true), sealMat());
  drum.rotation.x = Math.PI / 2;
  drum.position.z = -0.06;
  g.add(drum);
  const back = new THREE.Mesh(new THREE.CircleGeometry(Math.max(r - 0.05, 0.008), 20), sealMat());
  back.position.z = -0.12;
  g.add(back);
  return g;
}

/**
 * Control strip: an inset dark plate carrying knobs and/or a display. Centred
 * on its own origin, facing +Z. Knob count 0 gives a touch panel.
 */
export function controlStrip(
  w: number,
  h: number,
  o: { knobs?: number; display?: boolean; knobR?: number } = {},
): THREE.Group {
  const g = new THREE.Group();
  const knobs = o.knobs ?? 0;
  const knobR = o.knobR ?? Math.min(h * 0.3, 0.022);

  const plate = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.014), sealMat());
  g.add(plate);

  if (o.display) {
    const dw = Math.min(w * 0.3, 0.14);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(dw, Math.min(h * 0.45, 0.05)), displayMat());
    // Display sits left of centre when knobs share the strip, centred alone.
    screen.position.set(knobs > 0 ? -w / 2 + dw / 2 + 0.02 : 0, 0, 0.008);
    g.add(screen);
  }

  // Knobs occupy the right-hand share of the strip when a display took the left.
  const x0 = o.display && knobs > 0 ? -w * 0.12 : -w / 2;
  const span = o.display && knobs > 0 ? w * 0.62 : w;
  for (let i = 0; i < knobs; i++) {
    const cx = x0 + (span * (i + 1)) / (knobs + 1);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(knobR, knobR, 0.012, 16), trimMat());
    collar.rotation.x = Math.PI / 2;
    collar.position.set(cx, 0, 0.012);
    g.add(collar);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(knobR * 0.72, knobR * 0.82, 0.018, 16), sealMat());
    cap.rotation.x = Math.PI / 2;
    cap.position.set(cx, 0, 0.024);
    g.add(cap);
    // Pointer line, so a knob has an orientation and reads as turnable.
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.0035, knobR * 0.8, 0.004), trimMat());
    mark.position.set(cx, knobR * 0.35, 0.034);
    g.add(mark);
  }
  return g;
}

/** Louvred vent — hood filters, fridge toe grilles, dryer exhausts. Centred,
 *  facing +Z, slats running across the width. */
export function grille(w: number, h: number, slats = 5, mat: THREE.Material = sealMat()): THREE.Group {
  const g = new THREE.Group();
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.006), sealMat());
  g.add(back);
  const pitch = h / slats;
  for (let i = 0; i < slats; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(w - 0.012, pitch * 0.45, 0.008), mat);
    slat.position.set(0, -h / 2 + pitch * (i + 0.5), 0.006);
    g.add(slat);
  }
  return g;
}

/** Gas burner: a cast trivet ring over a dark cap. Origin on the hob surface,
 *  which is where a caller has it. */
export function burner(r: number): THREE.Group {
  const g = new THREE.Group();
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.65, 0.022, 18), sealMat());
  cap.position.y = 0.011;
  g.add(cap);
  const crown = new THREE.Mesh(new THREE.TorusGeometry(r * 0.62, 0.006, 8, 20), trimMat());
  crown.rotation.x = Math.PI / 2;
  crown.position.y = 0.026;
  g.add(crown);
  // Four trivet fingers, the shape that says "gas" from across a room.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const finger = new THREE.Mesh(new THREE.BoxGeometry(r * 0.9, 0.01, 0.014), sealMat());
    finger.position.set(Math.cos(a) * r * 0.45, 0.032, Math.sin(a) * r * 0.45);
    finger.rotation.y = -a;
    g.add(finger);
  }
  return g;
}

/**
 * Adjustable feet under a freestanding machine, plus the shadow gap they make.
 * Origin at floor centre; returns the feet only — the caller lifts the body.
 */
export function machineFeet(w: number, d: number, lift: number): THREE.Group {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, lift, 10), sealMat());
      foot.position.set((sx * (w - 0.09)) / 2, lift / 2, (sz * (d - 0.09)) / 2);
      g.add(foot);
    }
  }
  return g;
}

/**
 * Swings a door group open about a hinge on one vertical edge. `openAmount` is
 * 0..1 of a 100° swing; `hingeX` is the door-local x of the hinge (±w/2).
 * Wrapping rather than rotating in place, because the panel's own origin is
 * its centre and a door hinges at its edge.
 */
export function hingeSwing(door: THREE.Object3D, hingeX: number, openAmount: number): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.x = hingeX;
  door.position.x -= hingeX;
  pivot.add(door);
  // Hinge on the +x edge opens the other way round from one on -x.
  pivot.rotation.y = ((hingeX > 0 ? 1 : -1) * openAmount * Math.PI * 100) / 180;
  // Wrapped in an outer group whose origin is still the door's CENTRE, so a
  // caller positions a hinged door exactly as it would a plain panel. Handing
  // back the pivot itself would make every caller add the hinge offset back,
  // and one of them wouldn't.
  return new THREE.Group().add(pivot);
}

/** Downlight lens on the underside of a hood or an over-range microwave. Lit
 *  is emissive (it has to look like a source, not a white sticker); unlit is a
 *  plain frosted disc. Not cached — `on` makes two different materials. */
export function lampLens(r: number, on: boolean): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color: on ? "#fff4dd" : "#d8d9d6",
    emissive: new THREE.Color(on ? "#ffe6b0" : "#000000"),
    emissiveIntensity: on ? 1.2 : 0,
    roughness: 0.35,
  });
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.88, 0.012, 18), mat);
  return lens;
}

/** Moulded interior lining — fridge cavities, oven enamel, dishwasher tub.
 *  Light and matte, so an open door shows a bright inside rather than a hole. */
let _liner: THREE.MeshStandardMaterial | null = null;
export function linerMat(): THREE.MeshStandardMaterial {
  if (!_liner) _liner = new THREE.MeshStandardMaterial({ color: "#e7e9ea", roughness: 0.55, metalness: 0.05 });
  return _liner;
}

/**
 * The body as a SHELL, open at the front — what a machine has to be the moment
 * its door opens. (Closed, the solid `applianceBody` is cheaper and identical
 * to look at.) Outside wears `mat`, the cavity wears the liner. Origin at floor
 * centre, bottom y=0, opening facing +Z.
 */
export function hollowBody(w: number, d: number, h: number, mat: THREE.Material, wall = 0.045): THREE.Group {
  const g = new THREE.Group();
  const liner = linerMat();
  const add = (geo: THREE.BoxGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    g.add(mesh);
  };
  // Outer skin: sides/top/bottom/back in the finish.
  add(new THREE.BoxGeometry(wall, h, d), mat, -w / 2 + wall / 2, h / 2, 0);
  add(new THREE.BoxGeometry(wall, h, d), mat, w / 2 - wall / 2, h / 2, 0);
  add(new THREE.BoxGeometry(w, wall, d), mat, 0, h - wall / 2, 0);
  add(new THREE.BoxGeometry(w, wall, d), mat, 0, wall / 2, 0);
  add(new THREE.BoxGeometry(w, h, wall), mat, 0, h / 2, -d / 2 + wall / 2);
  // Cavity lining, just inside the skin, so the inside reads white/enamel.
  const iw = Math.max(w - 2 * wall, 0.05);
  const ih = Math.max(h - 2 * wall, 0.05);
  const id = Math.max(d - wall, 0.05);
  const t = 0.006;
  add(new THREE.BoxGeometry(t, ih, id), liner, -iw / 2, h / 2, wall / 2);
  add(new THREE.BoxGeometry(t, ih, id), liner, iw / 2, h / 2, wall / 2);
  add(new THREE.BoxGeometry(iw, t, id), liner, 0, h - wall, wall / 2);
  add(new THREE.BoxGeometry(iw, t, id), liner, 0, wall, wall / 2);
  add(new THREE.BoxGeometry(iw, ih, t), liner, 0, h / 2, -d / 2 + wall);
  return g;
}

/** Wire shelf — oven rack, dishwasher basket. Flat in XZ, centred on its own
 *  origin, `bars` running front-to-back with two cross rails. */
export function wireRack(w: number, d: number, bars = 7): THREE.Group {
  const g = new THREE.Group();
  const R = 0.0035;
  const mat = trimMat();
  for (let i = 0; i < bars; i++) {
    const x = -w / 2 + (w * (i + 0.5)) / bars;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(R, R, d, 6), mat);
    bar.rotation.x = Math.PI / 2;
    bar.position.x = x;
    g.add(bar);
  }
  for (const sz of [-0.4, 0.4]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.3, R * 1.3, w, 6), mat);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, R * 2, d * sz);
    g.add(rail);
  }
  return g;
}

/** Drop-down door (ovens, dishwashers): hinges along its BOTTOM edge. Same
 *  outer-group contract as `hingeSwing`. */
export function hingeDrop(door: THREE.Object3D, halfH: number, openAmount: number): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.y = -halfH;
  door.position.y += halfH;
  pivot.add(door);
  pivot.rotation.x = openAmount * (Math.PI / 2);
  return new THREE.Group().add(pivot);
}
