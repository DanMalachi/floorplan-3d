"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { grassTexture, GRASS_COVER } from "../textures";

// F5.2 — Suburb preset: a grass lawn under the model plus a jittered neighbourhood
// of low-poly houses and trees receding into the fog, so a traced home reads as
// sited on its own lot. Everything is procedural + instanced (no asset fetch),
// deterministic via a seeded PRNG, and static (no per-frame cost). Distant context
// casts no shadow — the sun's shadow frustum only covers the model near the origin.

// Fixed instance capacities so the InstancedMesh buffers are allocated once and
// never reconstructed as the model span changes; the drawn `count` is set per fill.
const HOUSE_CAP = 700;
const TREE_CAP = 280;

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _sc = new THREE.Vector3();
const _e = new THREE.Euler();
const _col = new THREE.Color();

/** Deterministic PRNG (mirrors textures.ts) so the neighbourhood is stable. */
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

const WALL_COLORS = ["#d9c9a6", "#c9b899", "#bcc4cb", "#d3b6a0", "#cfc9bd", "#aab19f", "#c6b7a6"];
const ROOF_COLORS = ["#6b4a3a", "#7c5a48", "#495059", "#5b5149", "#7f3f34", "#3f4650"];
const FOLIAGE_COLORS = ["#4d7a38", "#5c8a44", "#436e30", "#6f9a4a", "#3f6b2f"];

interface House { x: number; z: number; w: number; d: number; h: number; roofH: number; rot: number; wall: string; roof: string; }
interface Tree { x: number; z: number; h: number; r: number; foliage: string; }

/** A gable-roof prism: unit footprint (±0.5 in x/z), base at y=0, ridge at y=1
 *  running along z. Six outward-wound triangles; the hidden bottom is omitted.
 *  Flat-shaded for a crisp low-poly silhouette. */
function gableGeometry(): THREE.BufferGeometry {
  const A = [-0.5, 0, -0.5], B = [0.5, 0, -0.5], C = [0.5, 0, 0.5], D = [-0.5, 0, 0.5];
  const E = [0, 1, -0.5], F = [0, 1, 0.5];
  const tri = (...v: number[][]) => v.flat();
  const pos = [
    ...tri(A, D, F), ...tri(A, F, E), // left slope
    ...tri(B, E, F), ...tri(B, F, C), // right slope
    ...tri(A, E, B), // front gable
    ...tri(D, C, F), // back gable
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Grid-placed houses (jittered) and scattered trees around a clear central lot,
 *  scaled so context recedes into the fog. Absolute house sizes (a neighbour is a
 *  house whatever the model's size); only placement radius scales with span. */
function buildNeighborhood(span: number): { houses: House[]; trees: Tree[] } {
  const clearR = Math.max(span * 1.4, 16); // keep neighbours off the lot
  const reach = Math.max(span * 6, 90);
  const step = 18;

  const rnd = mulberry32(101);
  const houses: House[] = [];
  for (let gx = -reach; gx <= reach && houses.length < HOUSE_CAP; gx += step) {
    for (let gz = -reach; gz <= reach && houses.length < HOUSE_CAP; gz += step) {
      const x = gx + (rnd() * 2 - 1) * 4.5;
      const z = gz + (rnd() * 2 - 1) * 4.5;
      const dd = Math.hypot(x, z);
      if (dd < clearR || dd > reach) continue;
      houses.push({
        x, z,
        w: 7 + rnd() * 4,
        d: 7 + rnd() * 4,
        h: 4.5 + rnd() * 2.5,
        roofH: 1.8 + rnd() * 1.5,
        rot: Math.floor(rnd() * 4) * (Math.PI / 2) + (rnd() * 2 - 1) * 0.12,
        wall: WALL_COLORS[Math.floor(rnd() * WALL_COLORS.length)],
        roof: ROOF_COLORS[Math.floor(rnd() * ROOF_COLORS.length)],
      });
    }
  }

  const trnd = mulberry32(202);
  const trees: Tree[] = [];
  for (let i = 0; i < 260 && trees.length < TREE_CAP; i++) {
    const ang = trnd() * Math.PI * 2;
    const rad = clearR * 0.92 + trnd() * (reach - clearR * 0.92);
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    if (houses.some((hh) => Math.hypot(hh.x - x, hh.z - z) < 4.5)) continue; // keep out of houses
    trees.push({
      x, z,
      h: 2.2 + trnd() * 2.6,
      r: 1.3 + trnd() * 1.1,
      foliage: FOLIAGE_COLORS[Math.floor(trnd() * FOLIAGE_COLORS.length)],
    });
  }

  return { houses, trees };
}

export function Suburb({ span }: { span: number }) {
  const grass = grassTexture();
  const groundR = Math.max(span * 18, 250);

  // Meter-scale tiling for this ground size (cached texture, single consumer).
  useLayoutEffect(() => {
    const rep = (groundR * 2) / GRASS_COVER;
    grass.map.repeat.set(rep, rep);
    grass.normalMap.repeat.set(rep, rep);
  }, [grass, groundR]);

  const { houses, trees } = useMemo(() => buildNeighborhood(span), [span]);

  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const roofRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const foliageRef = useRef<THREE.InstancedMesh>(null);

  // Geometries + materials owned by this component (disposed on unmount by r3f).
  const bodyGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const roofGeo = useMemo(() => gableGeometry(), []);
  const trunkGeo = useMemo(() => new THREE.CylinderGeometry(0.16, 0.22, 1, 5), []);
  const foliageGeo = useMemo(() => new THREE.IcosahedronGeometry(1, 0), []);
  const wallMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 }), []);
  const roofMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, flatShading: true }), []);
  const trunkMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#5a4632", roughness: 0.95, metalness: 0 }), []);
  const foliageMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, flatShading: true }), []);

  useLayoutEffect(() => {
    const body = bodyRef.current, roof = roofRef.current;
    if (!body || !roof) return;
    houses.forEach((h, i) => {
      _e.set(0, h.rot, 0);
      _q.setFromEuler(_e);
      // Body: unit box, lifted so its base sits on the lawn.
      _p.set(h.x, h.h / 2, h.z);
      _sc.set(h.w, h.h, h.d);
      body.setMatrixAt(i, _m.compose(_p, _q, _sc));
      body.setColorAt(i, _col.set(h.wall));
      // Roof: unit gable on top of the body, slight eave overhang.
      _p.set(h.x, h.h, h.z);
      _sc.set(h.w * 1.04, h.roofH, h.d * 1.04);
      roof.setMatrixAt(i, _m.compose(_p, _q, _sc));
      roof.setColorAt(i, _col.set(h.roof));
    });
    body.count = roof.count = houses.length;
    body.instanceMatrix.needsUpdate = roof.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    if (roof.instanceColor) roof.instanceColor.needsUpdate = true;
  }, [houses]);

  useLayoutEffect(() => {
    const trunk = trunkRef.current, foliage = foliageRef.current;
    if (!trunk || !foliage) return;
    _q.identity();
    trees.forEach((t, i) => {
      _p.set(t.x, t.h / 2, t.z);
      _sc.set(1, t.h, 1);
      trunk.setMatrixAt(i, _m.compose(_p, _q, _sc));
      _p.set(t.x, t.h + t.r * 0.6, t.z);
      _sc.set(t.r, t.r * 1.2, t.r);
      foliage.setMatrixAt(i, _m.compose(_p, _q, _sc));
      foliage.setColorAt(i, _col.set(t.foliage));
    });
    trunk.count = foliage.count = trees.length;
    trunk.instanceMatrix.needsUpdate = foliage.instanceMatrix.needsUpdate = true;
    if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true;
  }, [trees]);

  return (
    <>
      {/* Lawn — also the shadow catcher for the model. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[groundR, 96]} />
        <meshStandardMaterial map={grass.map} normalMap={grass.normalMap} normalScale={[0.5, 0.5]} roughness={0.97} metalness={0} />
      </mesh>

      {/* Distant context: instanced, frustum-cull disabled (unit-box bounds don't
          reflect the instance spread), no shadows (outside the sun frustum). */}
      <instancedMesh ref={bodyRef} args={[bodyGeo, wallMat, HOUSE_CAP]} frustumCulled={false} />
      <instancedMesh ref={roofRef} args={[roofGeo, roofMat, HOUSE_CAP]} frustumCulled={false} />
      <instancedMesh ref={trunkRef} args={[trunkGeo, trunkMat, TREE_CAP]} frustumCulled={false} />
      <instancedMesh ref={foliageRef} args={[foliageGeo, foliageMat, TREE_CAP]} frustumCulled={false} />
    </>
  );
}
