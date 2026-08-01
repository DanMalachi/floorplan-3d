"use client";

// Stair geometry: one flight per traced run, one slab per derived landing, in
// either of two builds — a closed-stringer SOLID or an open-riser SKELETON.
// Both occupy the same footprint and the same treads; the difference is what
// carries them and what you can see through.
//
// Every number here comes from src/lib/stairs/stairGeometry.ts. This file owns
// no stair maths, so the 2D trace preview and the 3D model can never disagree.

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { Scene, Stair } from "@/schema/scene";
import { shadowProps } from "@/render/materialClass";
import { LANDING_SLAB } from "@/schema/constants";
import { useSceneStore } from "@/store/useSceneStore";
import { stairLandings, stairMetrics } from "@/lib/stairs/stairGeometry";

const STAIR_COLOR = "#e0d8c8"; // painted timber, a shade warmer than the plaster
const ACCENT = "#0a84ff"; // same selection accent as walls and furniture

// Open-riser proportions. A tread you could actually stand on, on stringers
// slim enough that the flight reads as floating rather than boxed in.
const TREAD_THICK = 0.06; // m — the plate you step on
const TREAD_NOSING = 0.02; // m — tread oversail past the step ahead
const STRINGER_W = 0.06; // m — thickness of each side beam
const STRINGER_DEPTH = 0.24; // m — how deep the beam hangs below the tread line

interface Piece {
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
  rotation: [number, number, number];
}

/** Extrude a flight-local profile (u along the run, v = world height) across
 *  `depth`, then place it at the flight's foot, turned to the run's heading.
 *  Plan (x, y) -> world (x, z), the same convention as WallMesh. */
function extrudeAlongFlight(
  profile: THREE.Vector2[],
  depth: number,
  offsetAcross: number,
  foot: { x: number; y: number },
  dir: { x: number; y: number },
): Piece {
  const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(profile), {
    depth,
    bevelEnabled: false,
  });
  geometry.translate(0, 0, offsetAcross);
  return {
    geometry,
    position: [foot.x, 0, foot.y],
    rotation: [0, -Math.atan2(dir.y, dir.x), 0],
  };
}

/**
 * SOLID: the side profile of one flight, extruded across its width.
 *
 * The profile closes down to y=0 rather than to the flight's own base, so an
 * upper flight reads as a closed-stringer solid standing on the floor instead
 * of a staircase floating in midair.
 */
function solidFlight(
  foot: { x: number; y: number },
  dir: { x: number; y: number },
  run: number,
  steps: number,
  going: number,
  riser: number,
  baseHeight: number,
  width: number,
): Piece[] {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
  if (baseHeight > 1e-6) pts.push(new THREE.Vector2(0, baseHeight));
  for (let i = 0; i < steps; i++) {
    const top = baseHeight + (i + 1) * riser;
    pts.push(new THREE.Vector2(i * going, top)); // up the riser
    pts.push(new THREE.Vector2((i + 1) * going, top)); // along the tread
  }
  pts.push(new THREE.Vector2(run, 0)); // down the back face to the floor

  // Straddle the traced centerline: the extrusion grows along local +Z.
  return [extrudeAlongFlight(pts, width, -width / 2, foot, dir)];
}

/**
 * OPEN: floating tread plates carried on two side stringers.
 *
 * Each tread is its own slab, so you see daylight between them; the stringers
 * are slanted beams hanging under the step line, which is what stops the treads
 * reading as a stack of unsupported shelves. Nothing reaches the floor except
 * the two beams, and nothing encloses the space beneath.
 */
function openFlight(
  foot: { x: number; y: number },
  dir: { x: number; y: number },
  run: number,
  steps: number,
  going: number,
  riser: number,
  baseHeight: number,
  width: number,
): Piece[] {
  const pieces: Piece[] = [];

  // Treads. Each sits at the top of its riser and oversails the step ahead by
  // a nosing, exactly as a real open stair does.
  for (let i = 0; i < steps; i++) {
    const top = baseHeight + (i + 1) * riser;
    const u0 = i * going;
    const u1 = (i + 1) * going + TREAD_NOSING;
    const plate = [
      new THREE.Vector2(u0, top - TREAD_THICK),
      new THREE.Vector2(u1, top - TREAD_THICK),
      new THREE.Vector2(u1, top),
      new THREE.Vector2(u0, top),
    ];
    pieces.push(extrudeAlongFlight(plate, width, -width / 2, foot, dir));
  }

  // Two stringers: a slanted beam along each side, following the step line from
  // the flight's foot to its head.
  const topOfRun = baseHeight + steps * riser;
  const beam = [
    new THREE.Vector2(0, baseHeight - STRINGER_DEPTH),
    new THREE.Vector2(run, topOfRun - STRINGER_DEPTH),
    new THREE.Vector2(run, topOfRun),
    new THREE.Vector2(0, baseHeight),
  ];
  for (const side of [-1, 1]) {
    const across = side * (width / 2) - (side < 0 ? 0 : STRINGER_W);
    pieces.push(extrudeAlongFlight(beam, STRINGER_W, across, foot, dir));
  }

  return pieces;
}

/** A landing: its hull polygon, laid flat with its TOP face at `top` and its
 *  underside at `base` (the floor on a solid stair, a slab's thickness on an
 *  open one — see stairLandings). */
function landingPiece(
  poly: { x: number; y: number }[],
  top: number,
  base: number,
): Piece | null {
  if (poly.length < 3) return null;
  const depth = Math.max(top - base, LANDING_SLAB);
  const geometry = new THREE.ExtrudeGeometry(
    new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, p.y))),
    { depth, bevelEnabled: false },
  );
  // Shape XY is the plan; rotating +90° about X sends plan-y to world-z and the
  // extrusion downward, so the shape plane becomes the walking surface.
  geometry.rotateX(Math.PI / 2);
  // The hull is already in absolute plan coords — only the height is placed.
  return { geometry, position: [0, top, 0], rotation: [0, 0, 0] };
}

function buildPieces(stair: Stair): Piece[] {
  const m = stairMetrics(stair);
  const pieces: Piece[] = [];
  const build = stair.style === "open" ? openFlight : solidFlight;

  stair.flights.forEach((f, i) => {
    const fm = m.flights[i];
    if (!fm) return;
    const dx = f.x1 - f.x0;
    const dy = f.y1 - f.y0;
    const len = Math.hypot(dx, dy);
    if (len <= 1e-6 || fm.steps < 1) return;
    pieces.push(
      ...build(
        { x: f.x0, y: f.y0 },
        { x: dx / len, y: dy / len },
        fm.run,
        fm.steps,
        fm.going,
        m.riser,
        fm.baseHeight,
        stair.width,
      ),
    );
  });

  for (const l of stairLandings(stair)) {
    const piece = landingPiece(l.poly, l.top, l.base);
    if (piece) pieces.push(piece);
  }

  return pieces;
}

function StairMesh({ stair }: { stair: Stair }) {
  const selected = useSceneStore((s) => s.sel3d?.kind === "stair" && s.sel3d.id === stair.id);
  const hovered = useSceneStore((s) => s.hover3d?.kind === "stair" && s.hover3d.id === stair.id);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: STAIR_COLOR,
        emissive: new THREE.Color(ACCENT),
        emissiveIntensity: 0,
        roughness: 0.7,
        metalness: 0,
        envMapIntensity: 0.45,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  // Same accent lift walls use, so a selected stair reads like every other
  // selected object rather than inventing its own highlight.
  useEffect(() => {
    material.emissiveIntensity = selected ? 0.14 : hovered ? 0.08 : 0;
  }, [material, selected, hovered]);

  const pieces = useMemo(() => buildPieces(stair), [stair]);
  useEffect(
    () => () => {
      for (const p of pieces) p.geometry.dispose();
    },
    [pieces],
  );

  // Stairs are selected in Build, like walls — and never while furniture is
  // being placed, or the click that drops a chair would select the stair.
  const interactive = (s = useSceneStore.getState()) => s.appMode === "build" && !s.placing;

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const s = useSceneStore.getState();
    if (!interactive(s)) return;
    e.stopPropagation(); // keep the floor behind from stealing the selection
    s.setSel3d({ kind: "stair", id: stair.id });
  };

  return (
    <group
      onClick={onClick}
      onPointerOver={(e) => {
        if (!interactive()) return;
        e.stopPropagation();
        useSceneStore.getState().setHover3d({ kind: "stair", id: stair.id });
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        const s = useSceneStore.getState();
        if (s.hover3d?.kind === "stair" && s.hover3d.id === stair.id) s.setHover3d(null);
      }}
    >
      {pieces.map((p, i) => (
        <mesh
          key={i}
          geometry={p.geometry}
          material={material}
          position={p.position}
          rotation={p.rotation}
          {...shadowProps("opaqueArchitecture")}
        />
      ))}
    </group>
  );
}

export function StairLayer({ scene }: { scene: Scene }) {
  const stairs = scene.stairs ?? [];
  if (stairs.length === 0) return null;
  return (
    <>
      {stairs.map((s) => (
        <StairMesh key={s.id} stair={s} />
      ))}
    </>
  );
}
