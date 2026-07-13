"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useSceneStore } from "@/store/useSceneStore";

// F5.3 — City / high-rise preset. The model reads as the TOP UNIT of an
// apartment building: a windowed host tower rises directly under the model's
// footprint down into the city, so the plan sits on it like a penthouse — not a
// house on the ground. Around it, an instanced skyline of towers falls away and
// recedes into the shared time-of-day haze, so you look out and DOWN over the
// city. At night, baked window emissive lights every tower.
//
// All procedural + instanced (no asset fetch), deterministic via a seeded PRNG,
// mirroring Suburb.tsx. Model is centred at world origin; footprint half-extents
// halfX/halfZ come from useSceneBounds, so the host tower hugs the real plan.

const TOWER_CAP = 220; // per facade variant

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
 *  full day, ~0.5 at dusk, 1 once the sun is below the horizon. Fades up the
 *  glow of every tower's lit windows. */
function nightFactor(t: number) {
  const sunY = Math.sin(((t - 6) / 12) * Math.PI);
  return 1 - smoothstep(-0.04, 0.14, sunY);
}

// --- Facades -----------------------------------------------------------------
// A box tower is drawn with a 6-material array so the SIDES get the window
// facade and the TOP gets a plain roof (previously the whole box, roof included,
// showed windows). Two facade textures per variant: `map` (daytime glass +
// spandrel bands) and `emissive` (only the lit windows, black elsewhere) faded
// up at night. Default box UVs map each side to the full texture; the texture
// bakes many floors so windows stay small on tall towers.
interface TVariant { cols: number; rows: number; spandrel: string; glass: string; band: string; }
const TVARIANTS: TVariant[] = [
  { cols: 5, rows: 22, spandrel: "#3a4653", glass: "#54697d", band: "#2c343f" }, // blue glass slab
  { cols: 4, rows: 26, spandrel: "#4c4a42", glass: "#63645a", band: "#3a3830" }, // concrete tower
  { cols: 7, rows: 18, spandrel: "#313d49", glass: "#4a6076", band: "#26303a" }, // wide curtain wall
];

interface FacadeTex { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture; }
const facadeCache = new Map<number, FacadeTex>();
function facadeTexture(v: number): FacadeTex {
  let tex = facadeCache.get(v);
  if (!tex) {
    const { cols, rows, spandrel, glass, band } = TVARIANTS[v];
    const W = 160, H = 512;
    const litRnd = mulberry32(7000 + v * 13); // deterministic lit-window pattern
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const ctx = c.getContext("2d")!;
    const ec = document.createElement("canvas"); ec.width = W; ec.height = H;
    const ectx = ec.getContext("2d")!;
    ctx.fillStyle = spandrel; ctx.fillRect(0, 0, W, H);
    ectx.fillStyle = "#000"; ectx.fillRect(0, 0, W, H);

    const mX = W * 0.05;
    const gw = (W - 2 * mX) / cols, gh = H / rows;
    const ww = gw * 0.66, wh = gh * 0.6;
    for (let j = 0; j < rows; j++) {
      // A darker spandrel band under each floor line, for depth.
      ctx.fillStyle = band; ctx.fillRect(0, j * gh + gh * 0.82, W, gh * 0.18);
      for (let i = 0; i < cols; i++) {
        const wx = mX + i * gw + (gw - ww) / 2, wy = j * gh + gh * 0.16;
        ctx.fillStyle = glass; ctx.fillRect(wx, wy, ww, wh);
        ctx.fillStyle = "rgba(255,255,255,0.07)"; ctx.fillRect(wx, wy, ww, wh * 0.42); // sky sheen
        if (litRnd() < 0.26) {
          const warm = litRnd() < 0.5 ? "#ffd493" : "#ffe6bd";
          ctx.fillStyle = warm; ctx.fillRect(wx, wy, ww, wh);
          ectx.fillStyle = warm; ectx.fillRect(wx, wy, ww, wh);
        }
      }
    }
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
    const emissive = new THREE.CanvasTexture(ec);
    emissive.colorSpace = THREE.SRGBColorSpace;
    tex = { map, emissive };
    facadeCache.set(v, tex);
  }
  return tex;
}

const TINTS = ["#c7d0da", "#bcc1c8", "#d0d6dd", "#b3bbc4", "#ccc6ba", "#bfc8d2"];

interface Tower { x: number; z: number; w: number; d: number; base: number; top: number; rot: number; variant: number; tint: string; }

function buildSkyline(span: number, halfX: number, halfZ: number) {
  // Host tower footprint hugs the model, with a small overhang so the plan reads
  // as its top floor.
  const bhx = halfX + 0.6, bhz = halfZ + 0.6;
  const hostTop = -0.05; // just under the model floor (which hides the seam)
  const hostH = Math.max(span * 4, 60);
  const hostDiag = Math.hypot(bhx, bhz);

  // Neighbour towers: cleared off the host + a plaza gap, on a jittered grid,
  // most tops below the terrace so you look down; ~12% landmarks poke up.
  const clearR = hostDiag + Math.max(span * 0.9, 16);
  const reach = Math.max(span * 13, 150); // tied to the fog far → fades into haze
  const step = Math.max(clearR * 0.5, 22);
  const BASE = -95;

  const rnd = mulberry32(404);
  const towers: Tower[] = [];
  for (let gx = -reach; gx <= reach; gx += step) {
    for (let gz = -reach; gz <= reach; gz += step) {
      const jit = step * 0.42;
      const x = gx + (rnd() * 2 - 1) * jit;
      const z = gz + (rnd() * 2 - 1) * jit;
      const dd = Math.hypot(x, z);
      if (dd < clearR || dd > reach) continue;
      if (rnd() < 0.16) continue;
      const top = rnd() < 0.12 ? rnd() * 18 : -5 - Math.pow(rnd(), 1.4) * 48;
      towers.push({
        x, z,
        w: 7 + rnd() * 11,
        d: 7 + rnd() * 11,
        base: BASE,
        top,
        rot: rnd() < 0.5 ? 0 : Math.PI / 2,
        variant: Math.floor(rnd() * TVARIANTS.length),
        tint: TINTS[Math.floor(rnd() * TINTS.length)],
      });
    }
  }
  return { towers, bhx, bhz, hostTop, hostH, hazeY: BASE + 6 };
}

export function City({ span, halfX, halfZ }: { span: number; halfX: number; halfZ: number }) {
  const timeOfDay = useSceneStore((s) => s.timeOfDay);
  const { towers, bhx, bhz, hostTop, hostH, hazeY } = useMemo(
    () => buildSkyline(span, halfX, halfZ),
    [span, halfX, halfZ],
  );

  const boxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const roofMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#3c3f45", roughness: 0.94, metalness: 0 }), []);
  const undersideMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#181a1e", roughness: 1, metalness: 0 }), []);
  const parapetMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#9a9ca0", roughness: 0.9, metalness: 0 }), []);
  const hazeMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#2a2f38", fog: true }), []);

  // One facade material per variant; the flat list is what the night-glow effect
  // mutates. Box face order: [+X, -X, +Y(top), -Y(bottom), +Z, -Z].
  const facadeMats = useMemo(
    () =>
      TVARIANTS.map((_, v) => {
        const { map, emissive } = facadeTexture(v);
        return new THREE.MeshStandardMaterial({
          map, emissive: new THREE.Color("#ffdca6"), emissiveMap: emissive,
          emissiveIntensity: 0, roughness: 0.68, metalness: 0.12,
        });
      }),
    [],
  );
  const matArrays = useMemo(
    () => facadeMats.map((f) => [f, f, roofMat, undersideMat, f, f]),
    [facadeMats, roofMat, undersideMat],
  );

  const towerRefs = [useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null), useRef<THREE.InstancedMesh>(null)];

  useLayoutEffect(() => {
    _q.identity();
    TVARIANTS.forEach((_, v) => {
      const mesh = towerRefs[v].current;
      if (!mesh) return;
      const list = towers.filter((t) => t.variant === v);
      list.forEach((t, i) => {
        _e.set(0, t.rot, 0); _q.setFromEuler(_e);
        _p.set(t.x, (t.top + t.base) / 2, t.z);
        _sc.set(t.w, t.top - t.base, t.d);
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
    const g = nightFactor(timeOfDay) * 1.15;
    facadeMats.forEach((m) => { m.emissiveIntensity = g; });
  }, [timeOfDay, facadeMats]);

  // Host tower under the model. A plain box with a single facade material (a
  // material array on a non-instanced mesh silently fails to apply the map here),
  // capped by a flat roof quad so the top shows no windows.
  const hostCY = hostTop - hostH / 2;

  // Slim parapet around the host roof edge — the penthouse detail you look over.
  const paH = 0.7, paT = 0.2;
  const rails: { pos: [number, number, number]; scale: [number, number, number] }[] = [
    { pos: [0, hostTop + paH / 2, bhz], scale: [bhx * 2 + paT, paH, paT] },
    { pos: [0, hostTop + paH / 2, -bhz], scale: [bhx * 2 + paT, paH, paT] },
    { pos: [bhx, hostTop + paH / 2, 0], scale: [paT, paH, bhz * 2 + paT] },
    { pos: [-bhx, hostTop + paH / 2, 0], scale: [paT, paH, bhz * 2 + paT] },
  ];

  return (
    <>
      {/* Host tower: the apartment building whose top floor is the model. */}
      <mesh geometry={boxGeo} material={facadeMats[0]} position={[0, hostCY, 0]} scale={[bhx * 2, hostH, bhz * 2]} receiveShadow />
      {/* Flat roof cap (hides the box top's windows, incl. any L-notch). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, hostTop + 0.01, 0]} material={roofMat}>
        <planeGeometry args={[bhx * 2, bhz * 2]} />
      </mesh>

      {/* Parapet edge you look over the city from. */}
      {rails.map((r, i) => (
        <mesh key={i} position={r.pos} scale={r.scale} material={parapetMat} castShadow receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      ))}

      {/* Skyline towers, split by variant. Context — no shadow casting. */}
      {TVARIANTS.map((_, v) => (
        <instancedMesh key={v} ref={towerRefs[v]} args={[boxGeo, matArrays[v], TOWER_CAP]} frustumCulled={false} />
      ))}

      {/* Deep haze floor so looking straight down reads as hazy depth, not void. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, hazeY, 0]} material={hazeMat}>
        <circleGeometry args={[Math.max(span * 16, 220), 48]} />
      </mesh>
    </>
  );
}
