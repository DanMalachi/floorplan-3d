"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useSceneStore } from "@/store/useSceneStore";

// F5.3 — City / high-rise preset: the model sits on a raised rooftop terrace
// slab with a parapet, and an instanced skyline of towers falls away below and
// around it, receding into the shared time-of-day haze. Most tower tops sit
// BELOW the terrace so you look out and DOWN over the city — that, plus fog, is
// what sells the altitude. At night, baked window emissive lights the towers.
// All procedural + instanced (no asset fetch), deterministic via a seeded PRNG,
// mirroring Suburb.tsx. Model is centred at world origin; footprint half-extents
// halfX/halfZ come from useSceneBounds, so the terrace hugs the real footprint.

const TOWER_CAP = 200; // per facade variant
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _sc = new THREE.Vector3();
const _e = new THREE.Euler();
const _col = new THREE.Color();

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Night factor 0..1 from the hour (matches Environment3d's sun sweep): 0 in
 *  full day, ~0.5 at dusk, 1 once the sun is below the horizon. Drives the
 *  glow of the towers' lit windows. */
function nightFactor(t: number) {
  const sunY = Math.sin(((t - 6) / 12) * Math.PI);
  return 1 - smoothstep(-0.04, 0.14, sunY);
}

// --- Tower facades -----------------------------------------------------------
// Box towers use default box UVs (0..1 per face), so a fixed window grid stretches
// with the building — fine at skyline distance and consistent with Suburb houses.
// Two textures per variant: `map` (daytime glass/spandrel) and `emissive` (only
// the lit windows, black elsewhere) faded up at night via emissiveIntensity.
interface TVariant { cols: number; rows: number; spandrel: string; glass: string; }
const TVARIANTS: TVariant[] = [
  { cols: 5, rows: 16, spandrel: "#39434f", glass: "#4c5b6b" }, // glass slab
  { cols: 4, rows: 20, spandrel: "#4a4740", glass: "#5a5b52" }, // concrete tower
  { cols: 6, rows: 12, spandrel: "#2f3a46", glass: "#43586a" }, // wide curtain-wall
];

interface TowerTex { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture; }
const towerCache = new Map<number, TowerTex>();
function towerTexture(v: number): TowerTex {
  let tex = towerCache.get(v);
  if (!tex) {
    const { cols, rows, spandrel, glass } = TVARIANTS[v];
    const W = 128, H = 256;
    const lit = mulberry32(7000 + v * 13); // deterministic lit-window pattern
    // Day facade.
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = spandrel; ctx.fillRect(0, 0, W, H);
    // Night emissive map (black = off).
    const ec = document.createElement("canvas");
    ec.width = W; ec.height = H;
    const ectx = ec.getContext("2d")!;
    ectx.fillStyle = "#000"; ectx.fillRect(0, 0, W, H);

    const mX = W * 0.06, mY = H * 0.04;
    const gw = (W - 2 * mX) / cols, gh = (H - 2 * mY) / rows;
    const ww = gw * 0.64, wh = gh * 0.62;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const wx = mX + i * gw + (gw - ww) / 2, wy = mY + j * gh + (gh - wh) / 2;
        ctx.fillStyle = glass; ctx.fillRect(wx, wy, ww, wh);
        ctx.fillStyle = "rgba(255,255,255,0.06)"; ctx.fillRect(wx, wy, ww, wh * 0.4); // sky sheen
        if (lit() < 0.28) {
          // A lit window: warm on both maps so it reads day (bright pane) + night (glow).
          const warm = lit() < 0.5 ? "#ffd79a" : "#ffe9c4";
          ctx.fillStyle = warm; ctx.fillRect(wx, wy, ww, wh);
          ectx.fillStyle = warm; ectx.fillRect(wx, wy, ww, wh);
        }
      }
    }
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    const emissive = new THREE.CanvasTexture(ec);
    emissive.colorSpace = THREE.SRGBColorSpace;
    tex = { map, emissive };
    towerCache.set(v, tex);
  }
  return tex;
}

const TINTS = ["#c3ccd6", "#b7bcc2", "#cdd3da", "#aeb6bf", "#c8c2b6", "#b9c2cc"]; // subtle instance tints

interface Tower { x: number; z: number; w: number; d: number; base: number; top: number; rot: number; variant: number; tint: string; }

function buildSkyline(span: number, halfX: number, halfZ: number) {
  // Terrace slab hugs the footprint with a small margin; parapet rides its edge.
  const margin = Math.max(span * 0.12, 1.2);
  const terraceHalfX = halfX + margin, terraceHalfZ = halfZ + margin;
  // Keep towers off the terrace + a plaza gap around it.
  const clearR = Math.hypot(terraceHalfX, terraceHalfZ) + Math.max(span * 0.6, 10);
  const reach = Math.max(span * 13, 150); // tied to the fog far so towers fade into haze
  const step = Math.max(clearR * 0.5, 20);
  const BASE = -95; // towers plunge into the fog far below the terrace

  const rnd = mulberry32(404);
  const towers: Tower[] = [];
  for (let gx = -reach; gx <= reach; gx += step) {
    for (let gz = -reach; gz <= reach; gz += step) {
      const jit = step * 0.42;
      const x = gx + (rnd() * 2 - 1) * jit;
      const z = gz + (rnd() * 2 - 1) * jit;
      const dd = Math.hypot(x, z);
      if (dd < clearR || dd > reach) continue;
      if (rnd() < 0.18) continue; // thin the grid a touch
      // Most tops sit below the terrace (look down); ~12% are landmarks poking up.
      const top = rnd() < 0.12 ? rnd() * 16 : -6 - Math.pow(rnd(), 1.4) * 46;
      const variant = Math.floor(rnd() * TVARIANTS.length);
      towers.push({
        x, z,
        w: 8 + rnd() * 12,
        d: 8 + rnd() * 12,
        base: BASE,
        top,
        rot: rnd() < 0.5 ? 0 : Math.PI / 2, // stay on the city grid; occasional 90°
        variant,
        tint: TINTS[Math.floor(rnd() * TINTS.length)],
      });
    }
  }
  return { towers, terraceHalfX, terraceHalfZ, deckY: BASE + 6 };
}

export function City({ span, halfX, halfZ }: { span: number; halfX: number; halfZ: number }) {
  const timeOfDay = useSceneStore((s) => s.timeOfDay);
  const { towers, terraceHalfX, terraceHalfZ, deckY } = useMemo(
    () => buildSkyline(span, halfX, halfZ),
    [span, halfX, halfZ],
  );

  // Geometry + materials (owned here; r3f disposes on unmount).
  const towerGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const towerMats = useMemo(
    () =>
      TVARIANTS.map((_, v) => {
        const { map, emissive } = towerTexture(v);
        return new THREE.MeshStandardMaterial({
          map,
          emissive: new THREE.Color("#ffdca6"),
          emissiveMap: emissive,
          emissiveIntensity: 0,
          roughness: 0.72,
          metalness: 0.1,
        });
      }),
    [],
  );

  const slabMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#8f9195", roughness: 0.92, metalness: 0 }), []);
  const parapetMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#9a9ca0", roughness: 0.9, metalness: 0 }), []);
  const hazeMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#2a2f38", fog: true }), []);

  const towerRefs = [useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null)];

  useLayoutEffect(() => {
    _q.identity();
    TVARIANTS.forEach((_, v) => {
      const mesh = towerRefs[v].current;
      if (!mesh) return;
      const list = towers.filter((t) => t.variant === v);
      list.forEach((t, i) => {
        _e.set(0, t.rot, 0); _q.setFromEuler(_e);
        const h = t.top - t.base;
        _p.set(t.x, (t.top + t.base) / 2, t.z);
        _sc.set(t.w, h, t.d);
        mesh.setMatrixAt(i, _m.compose(_p, _q, _sc));
        mesh.setColorAt(i, _col.set(t.tint));
      });
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }, [towers]);

  // Night window glow — fade emissive up as the sun drops.
  useLayoutEffect(() => {
    const g = nightFactor(timeOfDay);
    towerMats.forEach((m) => {
      m.emissiveIntensity = g * 1.15;
      m.needsUpdate = false; // only a uniform changed
    });
  }, [timeOfDay, towerMats]);

  // Parapet = four coping rails around the terrace edge.
  const parapetH = 1.0, parapetT = 0.24;
  const rails: { pos: [number, number, number]; scale: [number, number, number] }[] = [
    { pos: [0, parapetH / 2, terraceHalfZ], scale: [terraceHalfX * 2 + parapetT, parapetH, parapetT] },
    { pos: [0, parapetH / 2, -terraceHalfZ], scale: [terraceHalfX * 2 + parapetT, parapetH, parapetT] },
    { pos: [terraceHalfX, parapetH / 2, 0], scale: [parapetT, parapetH, terraceHalfZ * 2 + parapetT] },
    { pos: [-terraceHalfX, parapetH / 2, 0], scale: [parapetT, parapetH, terraceHalfZ * 2 + parapetT] },
  ];

  return (
    <>
      {/* Rooftop terrace slab — the model's shadow catcher (top at y=0). */}
      <mesh position={[0, -1.5, 0]} material={slabMat} receiveShadow>
        <boxGeometry args={[terraceHalfX * 2, 3, terraceHalfZ * 2]} />
      </mesh>

      {/* Parapet edge you look over. */}
      {rails.map((r, i) => (
        <mesh key={i} position={r.pos} scale={r.scale} material={parapetMat} castShadow receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      ))}

      {/* Skyline towers, split by variant. Context — no shadow casting/receiving. */}
      {TVARIANTS.map((_, v) => (
        <instancedMesh key={v} ref={towerRefs[v]} args={[towerGeo, towerMats[v], TOWER_CAP]} frustumCulled={false} />
      ))}

      {/* Deep haze floor so looking straight down reads as hazy depth, not void. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, deckY, 0]} material={hazeMat}>
        <circleGeometry args={[Math.max(span * 16, 220), 48]} />
      </mesh>
    </>
  );
}
