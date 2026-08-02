"use client";

/**
 * The material chart that stands on the M1c calibration terrace, plus the empty
 * slot a candidate asset is dropped into.
 *
 * Everything here moves one variable at a time. The roughness row changes
 * nothing but roughness; the metalness row changes nothing but metalness. A
 * chart where two properties move together cannot tell you which one is wrong,
 * which is the failure this exists to prevent — an asset that reads badly gets
 * blamed on "the lighting", and the lighting gets nudged.
 *
 * Nothing in this file is a look knob. If a sphere reads wrong here, the
 * renderer or the contract is wrong. See docs/render-contract.md §2.4.
 */

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { applyShadowClass, shadowProps } from "@/render/materialClass";
import { CANONICAL_HOUR } from "./referenceScene";

// ---------------------------------------------------------------------------
// Layout — plan coordinates, matching referenceScene.ts.
// x is width (screen-horizontal in the hero shot), y is depth. The chart lives
// on the terrace (x > 5), which is rail-bounded and therefore open to the sky.
// ---------------------------------------------------------------------------

/** Front bench: the two gradients, low so the back bench clears it. */
const BENCH_A = { y: 4.6, top: 0.5, depth: 0.6, x0: 5.4, x1: 10 };
/** Back bench: raised, carrying the second gradient and the chrome sphere. */
const BENCH_B = { y: 3, top: 0.95, depth: 0.6, x0: 5.4, x1: 11.2 };

const SPHERE_R = 0.25;
const SPHERE_STEP = 0.62;
const GRADIENT_N = 7;
/** First sphere centre. Both rows share it, so the columns line up vertically. */
const ROW_X0 = 5.9;

/** Chart albedos, written in LINEAR working space — see `linearGrey`. */
const DIELECTRIC_ALBEDO = 0.18; // the grey-card value, so only roughness moves
const METAL_ALBEDO = 0.55; // bright enough that the metal end reads as metal
const CHROME_ALBEDO = 0.9;

/** Fixed roughness for the metalness row, per the M1c spec. */
const METAL_ROW_ROUGHNESS = 0.3;

/** Reserved volume for the candidate asset, and where it stands. */
export const CANDIDATE_SLOT = { x: 3.9, y: 3.4, w: 1.4, h: 2 };

/** The free-standing grey card: plan position and the card centre's height. */
const CARD = { x: 11, y: 5.2, h: 1.35 };

/**
 * The `full` hero camera, duplicated from REFERENCE_SHOTS in page.tsx purely to
 * aim the grey card. Only the DIRECTION matters, so a small drift between the
 * two is harmless; a large one means the card is no longer pointed at the
 * viewer and this should be re-synced.
 */
const HERO_EYE = { x: 5.5, y: 15.5, h: 4.2 };

/**
 * A hex literal is decoded as sRGB and lands on a different number; `setRGB`
 * writes the working (linear) space directly. The grey card is only a grey card
 * if 0.18 means 0.18.
 */
const linearGrey = (v: number) => new THREE.Color().setRGB(v, v, v);

/** The sun's unit direction at the canonical hour — the same construction as
 *  `computeSkyLighting`, used here only to aim the grey card at it. */
const sunDirection = () => {
  const phi = ((CANONICAL_HOUR - 6) / 12) * Math.PI;
  return new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0.35).normalize();
};

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

function Bench({ b }: { b: typeof BENCH_A }) {
  const solid = shadowProps("opaqueArchitecture");
  const mat = useMemo(() => {
    // Matte 18% grey: a neutral, non-tinting backdrop, so a sphere's bounce
    // light carries no colour that is not the sphere's own.
    const m = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
    m.color.copy(linearGrey(DIELECTRIC_ALBEDO));
    return m;
  }, []);
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <mesh material={mat} position={[(b.x0 + b.x1) / 2, b.top / 2, b.y]} {...solid}>
      <boxGeometry args={[b.x1 - b.x0, b.top, b.depth]} />
    </mesh>
  );
}

/** One gradient row. `vary` is the property that moves; everything else is fixed. */
function GradientRow({
  vary,
  bench,
  albedo,
  fixedRoughness,
}: {
  vary: "roughness" | "metalness";
  bench: typeof BENCH_A;
  albedo: number;
  fixedRoughness: number;
}) {
  const solid = shadowProps("opaqueArchitecture");
  const mats = useMemo(
    () =>
      Array.from({ length: GRADIENT_N }, (_, i) => {
        const k = i / (GRADIENT_N - 1); // 0 -> 1 inclusive at both ends
        const m = new THREE.MeshStandardMaterial({
          roughness: vary === "roughness" ? k : fixedRoughness,
          metalness: vary === "metalness" ? k : 0,
        });
        m.color.copy(linearGrey(albedo));
        return m;
      }),
    [vary, albedo, fixedRoughness],
  );
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);

  return (
    <>
      {mats.map((m, i) => (
        <mesh
          key={i}
          material={m}
          position={[ROW_X0 + i * SPHERE_STEP, bench.top + SPHERE_R, bench.y]}
          {...solid}
        >
          <sphereGeometry args={[SPHERE_R, 48, 32]} />
        </mesh>
      ))}
    </>
  );
}

/**
 * Chrome: metalness 1, roughness 0. It reflects the environment and almost
 * nothing else, so it is the only object here that reports on the IBL rig
 * rather than on the direct lights — a mirror shows you the sky you actually
 * built. It is also the first thing to break if a preset switches the
 * environment map off, which §7 forbids.
 */
function ChromeSphere() {
  const solid = shadowProps("opaqueArchitecture");
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0 });
    m.color.copy(linearGrey(CHROME_ALBEDO));
    return m;
  }, []);
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <mesh material={mat} position={[10.6, BENCH_B.top + 0.34, BENCH_B.y]} {...solid}>
      <sphereGeometry args={[0.34, 64, 48]} />
    </mesh>
  );
}

/**
 * A free-standing 18% card.
 *
 * It is angled onto the BISECTOR of the sun direction and the direction to the
 * hero camera, not square to the sun. Square to the sun is what a photographer
 * does and it was the first attempt — but at the canonical hour the sun sits at
 * 55° elevation, so a card facing it lies almost flat and the hero shot sees it
 * edge-on as a sliver. The bisector keeps it legible while still taking
 * `dotNL` ~0.78 of full sun.
 *
 * It is NOT the exposure instrument, and the angle is half the reason: the
 * `exposure` rig is sun-only, no sky, no IBL, at normal incidence, which is
 * what makes ITS number mean something. This card also sees the open sky and
 * the environment map. Reading a number off it and "correcting"
 * RENDER_EXPOSURE against it would cancel the calibration the exposure rig
 * establishes.
 *
 * What it is for: a fixed, known-albedo surface at a fixed angle, so a drift in
 * overall exposure between one baseline set and the next is visible without
 * measuring anything.
 */
function GreyCard() {
  const solid = shadowProps("opaqueArchitecture");
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    m.color.copy(linearGrey(DIELECTRIC_ALBEDO));
    return m;
  }, []);
  useEffect(() => () => mat.dispose(), [mat]);

  const quat = useMemo(() => {
    const toCamera = new THREE.Vector3(
      HERO_EYE.x - CARD.x,
      HERO_EYE.h - CARD.h,
      HERO_EYE.y - CARD.y,
    ).normalize();
    const normal = sunDirection().add(toCamera).normalize();
    // A plane's own normal is +z; rotate that onto the bisector.
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  }, []);

  const postMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
    m.color.copy(linearGrey(0.05));
    return m;
  }, []);
  useEffect(() => () => postMat.dispose(), [postMat]);

  return (
    <group position={[CARD.x, 0, CARD.y]}>
      <mesh material={postMat} position={[0, 0.5, 0]} {...solid}>
        <boxGeometry args={[0.06, 1, 0.06]} />
      </mesh>
      <mesh material={mat} position={[0, CARD.h, 0]} quaternion={quat} {...solid}>
        <planeGeometry args={[0.8, 0.8]} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Candidate slot
// ---------------------------------------------------------------------------

/**
 * The empty slot. A candidate asset is dropped in and judged against the chart
 * beside it under the frozen lighting — never the other way round.
 *
 * It stands in the ROOFED room, not on the terrace, and inside the beam the
 * slider throws: an asset has to hold up where it will actually be used, which
 * is indoors, half in a sun patch and half in ambient. Judging it on the open
 * terrace would flatter it.
 *
 * The asset is placed at its AUTHORED scale, deliberately unnormalised: a model
 * that arrives 10x too large is a defect of the model, and a slot that silently
 * rescales it hides the one thing worth catching first. The cage is 2 m tall so
 * a correctly-scaled piece of furniture reads against it at a glance.
 */
function SlotCage({ occupied }: { occupied: boolean }) {
  const geo = useMemo(
    () =>
      new THREE.EdgesGeometry(
        new THREE.BoxGeometry(CANDIDATE_SLOT.w, CANDIDATE_SLOT.h, CANDIDATE_SLOT.w),
      ),
    [],
  );
  const mat = useMemo(
    () => new THREE.LineBasicMaterial({ color: "#8892a6", transparent: true, opacity: 0.5 }),
    [],
  );
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);

  // No pad slab. An asset's contact shadow has to land on the room's own floor
  // — a plinth under it would hide exactly the gap that says "this thing is
  // floating", which is the first thing a shadow check is for.
  if (occupied) return null;
  return (
    <lineSegments
      geometry={geo}
      material={mat}
      position={[CANDIDATE_SLOT.x, CANDIDATE_SLOT.h / 2, CANDIDATE_SLOT.y]}
    />
  );
}

export interface CandidateInfo {
  name: string;
  /** Authored bounding-box size in metres, as loaded. */
  size: [number, number, number];
}

// ---------------------------------------------------------------------------
// Material candidate — material-spec.md §7's conformance test.
//
// A material isn't object-shaped, so it doesn't go through the GLB `Candidate`
// loader below. It gets a flat panel standing where the furniture candidate
// would, at the same authored-scale, judged-in-place principle: it stands in
// the roofed room, inside the slider's sun patch, half in direct sun and half
// in ambient — the same reasoning `SlotCage`'s doc comment gives for not
// flattering a candidate on the open terrace.
// ---------------------------------------------------------------------------

export interface MaterialCandidateInfo {
  class: string;
  albedoUrl: string;
  normalUrl: string;
  ormUrl: string;
  /** Metres one texture repeat spans (material-spec.md §3.1's `coverM`). */
  coverM: number;
}

const PANEL = { w: 1.2, h: 1.8, thickness: 0.05 };

// One loader, `detectSupport` called at most once per renderer — mirrors
// src/materials/loaderKtx2.ts's product-side loader exactly, kept as a
// separate instance because this file is deliberately self-contained
// (not in PROTECTED_PATHS.md, but calibration-only — it doesn't import
// product modules, the same way it has its own GLTFLoader/DRACOLoader
// rather than reusing the viewer's).
let ktx2Loader: KTX2Loader | null = null;
let ktx2DetectedFor: THREE.WebGLRenderer | null = null;
function getKtx2Loader(gl: THREE.WebGLRenderer): KTX2Loader {
  ktx2Loader ??= new KTX2Loader().setTranscoderPath("/basis/");
  if (ktx2DetectedFor !== gl) {
    ktx2Loader.detectSupport(gl);
    ktx2DetectedFor = gl;
  }
  return ktx2Loader;
}

function MaterialPanel({ info }: { info: MaterialCandidateInfo }) {
  const [material, setMaterial] = useState<THREE.MeshStandardMaterial | null>(null);
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    let cancelled = false;
    const ktx2 = getKtx2Loader(gl);
    const tile = (tex: THREE.Texture) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(PANEL.w / info.coverM, PANEL.h / info.coverM);
      tex.anisotropy = 8;
    };

    (async () => {
      // Found at M3d/D4: KTX2Loader's worker-pool transcoding is not safe to
      // fire concurrently from one loader instance — three requests in
      // flight together (via Promise.all) intermittently cross-assigned
      // results (a normal map's data landing in the albedo slot). Sequential
      // avoids it. Filed as a real, reproduced finding, not a superstition —
      // see the M3d/D4 commit for the before/after.
      //
      // Colour space is NOT hand-tagged — material-spec.md §5.1 forbids it
      // by name. KTX2Loader reads each container's own embedded transfer-
      // function metadata (written by the encoder's `--assign-tf`,
      // material-spec.md §5.1) and assigns `colorSpace` itself.
      const albedo = await ktx2.loadAsync(info.albedoUrl);
      if (cancelled) return;
      tile(albedo);

      const normal = await ktx2.loadAsync(info.normalUrl);
      if (cancelled) return;
      tile(normal);

      // ORM packing (material-spec.md §6): one texture, bound three times.
      // Each slot's own shader chunk samples the channel it's specified to
      // read — aoMap.r, roughnessMap.g, metalnessMap.b — so no manual
      // channel split is needed here. roughness/metalness scalars stay at
      // 1.0: the ingest pipeline always bakes the true value into the map (a
      // flat fill when the source had no map — §1.2), so a scalar here
      // would be the "scalar tuning a map" defect §2.1 forbids.
      const orm = await ktx2.loadAsync(info.ormUrl);
      if (cancelled) return;
      tile(orm);

      gl.initTexture(albedo);
      gl.initTexture(normal);
      gl.initTexture(orm);

      const mat = new THREE.MeshStandardMaterial({
        map: albedo,
        normalMap: normal,
        aoMap: orm,
        roughnessMap: orm,
        metalnessMap: orm,
        roughness: 1,
        metalness: 1,
        aoMapIntensity: 1,
      });
      if (cancelled) {
        albedo.dispose();
        normal.dispose();
        orm.dispose();
        mat.dispose();
        return;
      }
      setMaterial((prev) => {
        // A material's own dispose() releases its GPU program only, not the
        // textures it references — dispose those explicitly or a candidate
        // swap leaks the previous one's three KTX2 textures.
        if (prev) {
          prev.map?.dispose();
          prev.normalMap?.dispose();
          prev.aoMap?.dispose();
          prev.dispose();
        }
        return mat;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [info.albedoUrl, info.normalUrl, info.ormUrl, info.coverM, gl]);

  const solid = shadowProps("opaqueArchitecture");
  if (!material) return null;
  return (
    <mesh
      material={material}
      position={[CANDIDATE_SLOT.x, PANEL.h / 2, CANDIDATE_SLOT.y]}
      {...solid}
    >
      {/* aoMap reads from BoxGeometry's own `uv` (channel 0) — no second UV
          set needed. `Texture.channel` defaults to 0 in the pinned three
          build (material-spec.md §3.2, verified against three.core.js). */}
      <boxGeometry args={[PANEL.w, PANEL.h, PANEL.thickness]} />
    </mesh>
  );
}

function Candidate({
  file,
  onLoaded,
}: {
  file: File;
  onLoaded: (info: CandidateInfo | null) => void;
}) {
  const [root, setRoot] = useState<THREE.Object3D | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = URL.createObjectURL(file);
    const loader = new GLTFLoader();
    // The IKEA catalog ships Draco-compressed, and the decoder is already
    // served from /draco for the furniture layer.
    const draco = new DRACOLoader().setDecoderPath("/draco/");
    loader.setDRACOLoader(draco);

    loader.load(
      url,
      (gltf) => {
        if (cancelled) return;
        // Class-assigned, never per-mesh flags — a candidate asset inherits the
        // same shadow behaviour it will have in the product (§6).
        applyShadowClass(gltf.scene, "opaqueArchitecture");
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = new THREE.Vector3();
        box.getSize(size);
        // Seat it on the floor and centre it in plan. Position is normalised;
        // SCALE deliberately is not.
        gltf.scene.position.set(
          -(box.min.x + box.max.x) / 2,
          -box.min.y,
          -(box.min.z + box.max.z) / 2,
        );
        setRoot(gltf.scene);
        onLoaded({ name: file.name, size: [size.x, size.y, size.z] });
      },
      undefined,
      (err) => {
        if (cancelled) return;
        console.error("[calibration] candidate failed to load", err);
        onLoaded(null);
      },
    );

    return () => {
      cancelled = true;
      draco.dispose();
      URL.revokeObjectURL(url);
    };
  }, [file, onLoaded]);

  if (!root) return null;
  return (
    <group position={[CANDIDATE_SLOT.x, 0, CANDIDATE_SLOT.y]}>
      <primitive object={root} />
    </group>
  );
}

// ---------------------------------------------------------------------------

export function ReferenceRig({
  candidate,
  onCandidateLoaded,
  materialCandidate,
}: {
  candidate: File | null;
  onCandidateLoaded: (info: CandidateInfo | null) => void;
  materialCandidate?: MaterialCandidateInfo | null;
}) {
  const occupied = !!candidate || !!materialCandidate;
  return (
    <group>
      <Bench b={BENCH_A} />
      <Bench b={BENCH_B} />
      <GradientRow vary="roughness" bench={BENCH_A} albedo={DIELECTRIC_ALBEDO} fixedRoughness={0} />
      <GradientRow
        vary="metalness"
        bench={BENCH_B}
        albedo={METAL_ALBEDO}
        fixedRoughness={METAL_ROW_ROUGHNESS}
      />
      <ChromeSphere />
      <GreyCard />
      <SlotCage occupied={occupied} />
      {candidate && (
        <Candidate
          key={candidate.name + candidate.size}
          file={candidate}
          onLoaded={onCandidateLoaded}
        />
      )}
      {materialCandidate && (
        <MaterialPanel
          key={materialCandidate.albedoUrl}
          info={materialCandidate}
        />
      )}
    </group>
  );
}
