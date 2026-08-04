// IBL audit (contract §7.1 / M1c-R R2a).
//
//   node scripts/render/ibl-audit.mjs
//
// Computes, from the Lightformer rig's GEOMETRY and colours, how much
// irradiance the environment map actually delivers to an up-facing surface —
// so the §7 rescale is derived rather than dialled until a probe looks right.
//
// Why this is computable at all: drei's <Environment> with children renders
// ONLY those children into its own virtual scene (Environment.js — createPortal
// into `virtualScene`). The sky mesh, the ground and the neighbourhood are not
// in the env map. The map is exactly these three rects, and a Lightformer is a
// MeshBasicMaterial with `toneMapped: false` and `side: DoubleSide` whose
// colour is multiplied by `intensity` — so its rendered value IS its radiance,
// in renderer units, and nothing else touches it.
//
// Method: cosine-weighted Monte Carlo about +Y. For samples drawn with pdf
// cosθ/π, the irradiance integral E = ∫ L cosθ dω collapses to π · mean(L).
import * as THREE from "three";
import { RENDER_EXPOSURE, computeSkyLighting } from "../../src/render/lightPresets.ts";

// --------------------------------------------------------------------------
// The rig, transcribed from Environment3d.tsx. `iblScale` is 1 in perspective,
// the only mode that makes a physical claim, so it is omitted here.
// --------------------------------------------------------------------------
const RIG = [
  {
    id: "key",
    color: "#eef3ff",
    intensity: { outdoor: 1.2, studio: 1.6 },
    position: [0, 8, 0],
    rotation: [-Math.PI / 2, 0, 0], // explicit: overrides Lightformer's lookAt
    scale: [14, 14],
  },
  { id: "coolSide", color: "#cfe0ff", intensity: { outdoor: 0.7, studio: 0.7 }, position: [-9, 3, -6], scale: [8, 5] },
  { id: "warmSide", color: "#ffe6c8", intensity: { outdoor: 0.55, studio: 0.55 }, position: [9, 3, 6], scale: [8, 5] },
];

const LUMA = new THREE.Vector3(0.2126, 0.7152, 0.0722);

/** Rec.709 luminance of a colour, in the LINEAR working space. */
function radiance(hex, intensity) {
  const c = new THREE.Color(hex); // ColorManagement on -> hex is sRGB, decoded
  return (c.r * LUMA.x + c.g * LUMA.y + c.b * LUMA.z) * intensity;
}

/** World basis of a Lightformer: normal (+z), and the two in-plane axes. */
function basis(rect) {
  if (rect.rotation) {
    const e = new THREE.Euler(...rect.rotation);
    return {
      n: new THREE.Vector3(0, 0, 1).applyEuler(e),
      u: new THREE.Vector3(1, 0, 0).applyEuler(e),
      v: new THREE.Vector3(0, 1, 0).applyEuler(e),
    };
  }
  // No rotation prop -> Lightformer runs `lookAt(target)` with target [0,0,0].
  // Object3D.lookAt on a non-camera builds `Matrix4.lookAt(target, position)`,
  // whose +Z column is normalize(target - position): the panel faces the scene
  // centre. These two are aimed softboxes, not sky regions — see §7.1.
  const C = new THREE.Vector3(...rect.position);
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), C, new THREE.Vector3(0, 1, 0));
  return {
    n: new THREE.Vector3().setFromMatrixColumn(m, 2),
    u: new THREE.Vector3().setFromMatrixColumn(m, 0),
    v: new THREE.Vector3().setFromMatrixColumn(m, 1),
  };
}

/** Nearest rect a ray from the origin hits, or null. DoubleSide: either face. */
function trace(dir, rects) {
  let best = null;
  for (const r of rects) {
    const denom = dir.dot(r.n);
    if (Math.abs(denom) < 1e-9) continue;
    const t = r.C.clone().sub(new THREE.Vector3(0, 0, 0)).dot(r.n) / denom;
    if (t <= 1e-6) continue;
    const p = dir.clone().multiplyScalar(t).sub(r.C);
    if (Math.abs(p.dot(r.u)) > r.hu || Math.abs(p.dot(r.v)) > r.hv) continue;
    if (!best || t < best.t) best = { t, rect: r };
  }
  return best;
}

function audit(mode, N = 400_000) {
  const rects = RIG.map((r) => {
    const b = basis(r);
    return {
      id: r.id,
      C: new THREE.Vector3(...r.position),
      n: b.n, u: b.u, v: b.v,
      hu: r.scale[0] / 2,
      hv: r.scale[1] / 2,
      L: radiance(r.color, r.intensity[mode]),
    };
  });

  // Cosine-weighted hemisphere sampling about +Y (Malley's method).
  let sum = 0;
  const per = Object.fromEntries(rects.map((r) => [r.id, 0]));
  const hits = Object.fromEntries(rects.map((r) => [r.id, 0]));
  for (let i = 0; i < N; i++) {
    const r1 = Math.random(), r2 = Math.random();
    const rr = Math.sqrt(r1), phi = 2 * Math.PI * r2;
    const dir = new THREE.Vector3(rr * Math.cos(phi), Math.sqrt(1 - r1), rr * Math.sin(phi));
    const hit = trace(dir, rects);
    if (!hit) continue;
    sum += hit.rect.L;
    per[hit.rect.id] += hit.rect.L;
    hits[hit.rect.id]++;
  }

  const E = (Math.PI * sum) / N; // renderer units
  const lux = E / RENDER_EXPOSURE;
  return { rects, E, lux, per, hits, N };
}

const fmt = (n, d = 0) => n.toLocaleString("en-US", { maximumFractionDigits: d });

for (const mode of ["outdoor", "studio"]) {
  const a = audit(mode);
  console.log(`\n=== ${mode} ===`);
  console.log("rect        radiance(rend)      nits   proj.solid.angle(sr)   share of E");
  for (const r of a.rects) {
    const Ei = (Math.PI * a.per[r.id]) / a.N;
    // Projected solid angle recovered from the same samples: E_i = L_i * omega_p
    const omega = r.L > 0 ? Ei / r.L : 0;
    console.log(
      `${r.id.padEnd(10)} ${r.L.toFixed(4).padStart(12)} ${fmt(r.L / RENDER_EXPOSURE).padStart(10)}` +
      ` ${omega.toFixed(4).padStart(18)} ${((Ei / a.E) * 100).toFixed(1).padStart(11)}%`,
    );
  }
  console.log(`TOTAL env irradiance on an up-facing surface: ${fmt(a.lux)} lx`);
  // The rig's geometric gain: irradiance delivered per unit KEY radiance, with
  // the three intensities held in their current ratio. This is what a rescale
  // multiplies, so it is the number the R2b derivation needs.
  const G = a.E / a.rects[0].L;
  console.log(`geometric gain G = E / L_key = ${G.toFixed(3)} sr   (a full uniform dome would be PI = ${Math.PI.toFixed(3)})`);
  console.log(`rig covers ${((G / Math.PI) * 100).toFixed(1)}% of the projected hemisphere`);
}

// --------------------------------------------------------------------------
// What the sky SHOULD be, at the canonical hour.
// --------------------------------------------------------------------------
const CANONICAL_HOUR = 10;
const sky = computeSkyLighting(CANONICAL_HOUR, 0);
console.log(`\n=== the physically authored sky at hour ${CANONICAL_HOUR} ===`);
console.log(`skyLux (hemisphereLight)      ${fmt(sky.skyLux)} lx`);
console.log(`sunLux (directionalLight)     ${fmt(sky.sunLux)} lx`);
console.log(`uniform-dome luminance for that irradiance = skyLux / PI = ${fmt(sky.skyLux / Math.PI)} nits`);
console.log(`  (contract §4.1 clear sky: 5,000-8,000 nits)`);

console.log(`\n=== the sun disc, for the double-counting audit ===`);
const SUN_LUMINANCE = 1.6e9; // cd/m^2, standard value for the clear-sky solar disc
const SUN_HALF_ANGLE = (0.53 / 2) * (Math.PI / 180);
const sunOmega = Math.PI * Math.sin(SUN_HALF_ANGLE) ** 2;
console.log(`solar disc luminance   ${SUN_LUMINANCE.toExponential(2)} nits`);
console.log(`solar disc solid angle ${sunOmega.toExponential(2)} sr`);
console.log(`=> normal-incidence illuminance ${fmt(SUN_LUMINANCE * sunOmega)} lx  (matches REFERENCE_SUN_LUX)`);
