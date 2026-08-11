import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { ParametricSpec } from "@/schema/scene";
import type { GeneratorDef } from "./types";
import { finishMaterial } from "./materials";

// Kitchen v2: a counter item with real style variants. Local origin sits ON
// the host counter surface; the host cuts a well (spec.cutouts) and the top
// plate laps it — flush-set, the way a real hob mounts.

const PLATE_T = 0.008; // glass / tray thickness above the counter
const PLATE_LIP = 0.015; // plate overlap past the cutout, each side
const BURNER_INSET = 0.075;
const DOT_R = 0.004;

const sharedMat = (() => {
  const cache = new Map<string, THREE.MeshStandardMaterial>();
  return (key: string, make: () => THREE.MeshStandardMaterial) => {
    let m = cache.get(key);
    if (!m) {
      m = make();
      cache.set(key, m);
    }
    return m;
  };
})();

const ringMat = () => sharedMat("ring", () => new THREE.MeshStandardMaterial({ color: "#4a4e53", metalness: 0.35, roughness: 0.5 }));
const radiantMat = () => sharedMat("radiant", () => new THREE.MeshStandardMaterial({ color: "#6a2a22", roughness: 0.55 }));
const touchMat = () => sharedMat("touch", () => new THREE.MeshStandardMaterial({ color: "#7a7e84", metalness: 0.3, roughness: 0.4 }));
const grateMat = () => sharedMat("grate", () => new THREE.MeshStandardMaterial({ color: "#26282b", metalness: 0.25, roughness: 0.7 }));
const capMat = () => sharedMat("cap", () => new THREE.MeshStandardMaterial({ color: "#1d1f21", metalness: 0.3, roughness: 0.55 }));
const brassMat = () => sharedMat("brass", () => new THREE.MeshStandardMaterial({ color: "#a8823c", metalness: 0.85, roughness: 0.35 }));
const steelMat = () => sharedMat("steel", () => new THREE.MeshStandardMaterial({ color: "#b8babd", metalness: 0.8, roughness: 0.35 }));
const knobMat = () => sharedMat("knob", () => new THREE.MeshStandardMaterial({ color: "#2c2e31", metalness: 0.4, roughness: 0.5 }));

/** Burner centers for n burners on a w×d plate: 4 corner slots (2×2), the
 *  5th centered; narrow (domino) plates fall back to a single centered
 *  column. Radius scales with the space a slot actually has. */
function burnerSlots(w: number, d: number, n: number): { x: number; z: number; r: number }[] {
  const usableW = w - 2 * BURNER_INSET;
  const usableD = d - 2 * BURNER_INSET;
  if (w < 0.45 || n <= 2) {
    // Domino column, front-to-back.
    const r = Math.min(0.075, usableW / 2, usableD / (2 * Math.max(n, 1)));
    return Array.from({ length: n }, (_, i) => ({
      x: 0,
      z: n === 1 ? 0 : -usableD / 2 + (usableD * i) / (n - 1),
      r,
    }));
  }
  const hw = usableW / 2;
  const hd = usableD / 2;
  const r = Math.min(0.08, hw / 1.6, hd / 1.15);
  const slots = [
    { x: -hw / 1.6, z: hd / 1.4, r },
    { x: hw / 1.6, z: hd / 1.4, r: r * 0.82 },
    { x: -hw / 1.6, z: -hd / 1.4, r: r * 0.82 },
    { x: hw / 1.6, z: -hd / 1.4, r: r * 1.1 },
    { x: 0, z: 0, r },
  ];
  return slots.slice(0, Math.min(n, 5));
}

export const cooktopGenerator: GeneratorDef = {
  id: "cooktop",
  label: "Cooktop",
  category: "Kitchen",
  rooms: ["kitchen"],
  wallSnap: false,
  noCollide: true,
  counterItem: true,
  cutoutSize: (spec: ParametricSpec) => ({
    w: Math.max(spec.dims.w - 2 * PLATE_LIP, 0.1),
    d: Math.max(spec.dims.d - 2 * PLATE_LIP, 0.1),
  }),
  variants: [
    { id: "induction", label: "Induction" },
    { id: "radiant", label: "Radiant" },
    { id: "gas", label: "Gas" },
  ],
  defaultElevation: 0.84, // fallback only — attached items derive from their host
  dimLimits: { w: [0.3, 0.9], d: [0.45, 0.55], h: [0.008, 0.008] },
  modules: [{ key: "burners", label: "Burners", min: 1, max: 5, default: 4 }],
  fronts: ["slab"],
  handles: ["none"],
  finishes: ["glass-black"],
  defaultSpec: {
    generator: "cooktop",
    dims: { w: 0.6, d: 0.5, h: 0.008 },
    modules: { burners: 4 },
    front: "slab",
    handle: "none",
    finish: "glass-black",
    variant: "induction",
  },
  build(spec: ParametricSpec): THREE.Group {
    const { w, d } = spec.dims;
    const burners = Math.min(5, Math.max(1, Math.round(spec.modules.burners ?? 4)));
    const variant = spec.variant ?? "induction";
    const group = new THREE.Group();
    const slots = burnerSlots(w, d, burners);

    if (variant === "gas") {
      // Stainless tray, per-burner cast grate + two-tier cap, front knobs.
      const tray = new THREE.Mesh(new RoundedBoxGeometry(w, PLATE_T, d, 3, 0.003), steelMat());
      tray.position.set(0, PLATE_T / 2, 0);
      group.add(tray);

      for (const s of slots) {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(s.r * 0.42, s.r * 0.5, 0.014, 16), capMat());
        base.position.set(s.x, PLATE_T + 0.007, s.z);
        group.add(base);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(s.r * 0.3, s.r * 0.3, 0.006, 16), brassMat());
        cap.position.set(s.x, PLATE_T + 0.017, s.z);
        group.add(cap);
        // Grate: ring + 4 fingers.
        const ring = new THREE.Mesh(new THREE.TorusGeometry(s.r * 0.92, 0.005, 8, 24), grateMat());
        ring.rotation.x = Math.PI / 2;
        ring.position.set(s.x, PLATE_T + 0.02, s.z);
        group.add(ring);
        for (let k = 0; k < 4; k++) {
          const finger = new THREE.Mesh(new THREE.BoxGeometry(s.r * 1.9, 0.006, 0.012), grateMat());
          finger.rotation.y = Math.PI / 4 + (k * Math.PI) / 2;
          finger.position.set(s.x, PLATE_T + 0.02, s.z);
          group.add(finger);
        }
      }
      // Control knobs along the front edge.
      for (let i = 0; i < Math.min(burners, 5); i++) {
        const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.014, 14), knobMat());
        knob.position.set(-w / 2 + 0.06 + i * 0.05, PLATE_T + 0.007, d / 2 - 0.035);
        group.add(knob);
      }
      return group;
    }

    // Glass variants: black slab + per-burner ring markings.
    const glass = new THREE.Mesh(new RoundedBoxGeometry(w, PLATE_T, d, 3, 0.003), finishMaterial(spec.finish));
    glass.position.set(0, PLATE_T / 2, 0);
    group.add(glass);

    const markMat = variant === "radiant" ? radiantMat() : ringMat();
    for (const s of slots) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(s.r, 0.0022, 6, 32), markMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(s.x, PLATE_T + 0.0012, s.z);
      group.add(ring);
      if (variant === "radiant") {
        const inner = new THREE.Mesh(new THREE.TorusGeometry(s.r * 0.55, 0.0022, 6, 24), markMat);
        inner.rotation.x = Math.PI / 2;
        inner.position.set(s.x, PLATE_T + 0.0012, s.z);
        group.add(inner);
      } else {
        // Induction: crosshair ticks instead of a hot ring.
        for (let k = 0; k < 4; k++) {
          const tick = new THREE.Mesh(new THREE.BoxGeometry(s.r * 0.5, 0.001, 0.004), markMat);
          tick.rotation.y = (k * Math.PI) / 2;
          tick.position.set(s.x, PLATE_T + 0.0012, s.z);
          group.add(tick);
        }
      }
    }

    // Touch strip, front-right.
    for (let i = 0; i < 3; i++) {
      const dot = new THREE.Mesh(new THREE.CylinderGeometry(DOT_R, DOT_R, 0.001, 12), touchMat());
      dot.position.set(w / 2 - 0.07 - i * 0.045, PLATE_T + 0.001, d / 2 - 0.045);
      group.add(dot);
    }

    return group;
  },
};
