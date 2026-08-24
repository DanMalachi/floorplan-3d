import * as THREE from "three";

// Shared building blocks for the bathroom generators (toilet, bathtub, and the
// shower/vanity/accessory generators that follow). Deliberately its own module
// rather than an extension of parts.ts: parts.ts is cabinet joinery (carcass,
// fronts, handles, plinths) and none of it applies to sanitaryware.
//
// Nothing here reads a ParametricSpec — these are pure geometry helpers, so a
// generator stays readable as "shape decisions", not vertex math.

/** Polished chrome for taps, flush plates and hinges. Shinier than parts.ts's
 *  `handleMat()` (brushed cabinet metal) — bathroom brassware reads wrong
 *  unless it's near-mirror. Shared module-level instance; generators never
 *  mutate it. */
let _chrome: THREE.MeshStandardMaterial | null = null;
export function chromeMat(): THREE.MeshStandardMaterial {
  if (!_chrome) _chrome = new THREE.MeshStandardMaterial({ color: "#dcdfe2", metalness: 1, roughness: 0.08 });
  return _chrome;
}

/** Dark drain/waste puck — same role as sink.ts's local `drainMat`. */
let _waste: THREE.MeshStandardMaterial | null = null;
export function wasteMat(): THREE.MeshStandardMaterial {
  if (!_waste) _waste = new THREE.MeshStandardMaterial({ color: "#3c3f42", metalness: 0.7, roughness: 0.45 });
  return _waste;
}

/**
 * Rounded rectangle in the shape plane, centered on the origin.
 *
 * Shapes are authored in XY and extruded along +Z, then rotated -90° about X
 * by the callers, which maps the extrusion to +Y (up) and the shape's +Y to
 * -Z — the same convention sink.ts's rim uses. Every shape here is symmetric
 * about both axes, so the Y→-Z flip never needs correcting for.
 */
export function roundedRect(w: number, d: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const hw = w / 2;
  const hd = d / 2;
  const rr = Math.max(0.001, Math.min(r, hw - 0.001, hd - 0.001));
  s.moveTo(-hw + rr, -hd);
  s.lineTo(hw - rr, -hd);
  s.quadraticCurveTo(hw, -hd, hw, -hd + rr);
  s.lineTo(hw, hd - rr);
  s.quadraticCurveTo(hw, hd, hw - rr, hd);
  s.lineTo(-hw + rr, hd);
  s.quadraticCurveTo(-hw, hd, -hw, hd - rr);
  s.lineTo(-hw, -hd + rr);
  s.quadraticCurveTo(-hw, -hd, -hw + rr, -hd);
  return s;
}

/** Rounded-rect ring, as a hollow shape (outer profile with an inset hole).
 *  Extruded, this is a tub wall band or a seat — a shell, not a solid block. */
export function roundedRectRing(w: number, d: number, r: number, wall: number): THREE.Shape {
  const outer = roundedRect(w, d, r);
  const iw = Math.max(w - 2 * wall, 0.02);
  const id = Math.max(d - 2 * wall, 0.02);
  outer.holes.push(toPath(roundedRect(iw, id, Math.max(r - wall, 0.005))));
  return outer;
}

/** Ellipse ring — the plan profile of a toilet seat. */
export function ellipseRing(rx: number, rz: number, inner: number): THREE.Shape {
  const s = new THREE.Shape();
  s.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false, 0);
  const hole = new THREE.Path();
  hole.absellipse(0, 0, rx * inner, rz * inner, 0, Math.PI * 2, true, 0);
  s.holes.push(hole);
  return s;
}

/** Plain ellipse as a Path — an opening to punch through a vanity top. */
export function ellipsePath(rx: number, rz: number): THREE.Path {
  const p = new THREE.Path();
  p.absellipse(0, 0, rx, rz, 0, Math.PI * 2, true, 0);
  return p;
}

/** Shape → Path, so it can be used as another shape's hole. */
export function toPath(shape: THREE.Shape): THREE.Path {
  const p = new THREE.Path();
  p.curves = shape.curves.slice();
  p.autoClose = true;
  return p;
}

/** Extrudes a shape upward from y=0 and returns it standing in world space. */
export function extrudeUp(shape: THREE.Shape, height: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: Math.max(height, 0.001), bevelEnabled: false, curveSegments: 16 }),
    mat,
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

/**
 * Gooseneck mixer tap: base, riser, quarter-torus spout, down-tip and a lever.
 * Modelled on the faucet in sink.ts but written standalone — sink.ts is
 * shipped, working kitchen code and is not being refactored to share this.
 *
 * Returns a group whose origin is the tap's footprint on the mounting surface,
 * spout pointing toward +Z.
 */
export function gooseneckTap(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const mat = chromeMat();
  const BASE_R = 0.02 * scale;
  const BASE_H = 0.025 * scale;
  const RISER_R = 0.011 * scale;
  const RISER_H = 0.2 * scale;
  const SPOUT_R = 0.1 * scale;
  const TUBE = 0.009 * scale;

  const base = new THREE.Mesh(new THREE.CylinderGeometry(BASE_R, BASE_R * 1.15, BASE_H, 16), mat);
  base.position.y = BASE_H / 2;
  g.add(base);

  const riser = new THREE.Mesh(new THREE.CylinderGeometry(RISER_R, RISER_R, RISER_H, 12), mat);
  riser.position.y = BASE_H + RISER_H / 2;
  g.add(riser);

  // Quarter torus sweeping from the riser top out to a forward-facing spout.
  const spout = new THREE.Mesh(new THREE.TorusGeometry(SPOUT_R, TUBE, 8, 16, Math.PI / 2), mat);
  spout.rotation.y = -Math.PI / 2;
  spout.position.y = BASE_H + RISER_H - SPOUT_R;
  g.add(spout);

  const tip = new THREE.Mesh(new THREE.CylinderGeometry(TUBE, TUBE * 0.9, 0.03 * scale, 10), mat);
  tip.position.set(0, BASE_H + RISER_H - SPOUT_R - 0.015 * scale, SPOUT_R);
  g.add(tip);

  const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.006 * scale, 0.008 * scale, 0.08 * scale, 10), mat);
  lever.rotation.z = -Math.PI / 3.2;
  lever.position.set(0.04 * scale, BASE_H + 0.02 * scale, 0);
  g.add(lever);

  return g;
}

/** Wall flush plate for concealed-cistern toilets — the only visible part of
 *  the cistern on a wall-hung or back-to-wall pan. */
export function flushPlate(w = 0.24, h = 0.16): THREE.Group {
  const g = new THREE.Group();
  const plate = extrudeUp(roundedRect(w, h, 0.012), 0.008, chromeMat());
  // extrudeUp stands the shape up; a wall plate is vertical, so undo that and
  // lay it in the XY plane facing +Z instead.
  plate.rotation.x = 0;
  g.add(plate);
  const button = extrudeUp(roundedRect(w * 0.42, h * 0.5, 0.008), 0.004, chromeMat());
  button.rotation.x = 0;
  button.position.set(-w * 0.16, 0, 0.008);
  g.add(button);
  return g;
}
