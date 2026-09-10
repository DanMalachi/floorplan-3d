"use client";

import * as THREE from "three";
import type { FixtureShape } from "@/fixtures/catalog";
import { shadowProps } from "@/render/materialClass";
import { ROOM_LIGHT } from "@/render/contract";
import { WALL_FIXTURE_GAP_M } from "@/render/roomLighting";
import { fixtureTexture } from "./fixtureTexture";
import { stripOutline, fixtureDropM, STRIP_WIDTH_M, STRIP_HEIGHT_M, type LightPoint } from "@/fixtures/linear";

/** A shape's procedural body, local origin at the light source (matches
 *  `RoomLight.position`). MVP visuals: plain primitives, not GLBs — "basic
 *  lights that can later be changed." `colorHex` mirrors the fixture's own
 *  authored color temperature, so the glow you place is the color you get. */
export function FixtureBody({ shape, colorHex, tint, opacity, path }: {
  shape: FixtureShape;
  colorHex: string;
  tint?: "red" | null;
  opacity?: number;
  path?: LightPoint[];
}) {
  // castShadow deliberately forced off: a fixture's own point light sits at
  // its local origin (RoomLight.position), so if the housing casts a shadow
  // it occludes its own cube map and the room it's meant to light goes dark
  // (Sprint 3b). A 6-20cm housing's shadow is imperceptible either way.
  const shadow = { ...shadowProps(opacity !== undefined ? "transient" : "opaqueArchitecture"), castShadow: false };
  const bodyColor = tint === "red" ? "#ff3b30" : "#e8e2d5";
  const emissive = tint === "red" ? "#000000" : colorHex;
  const emissiveIntensity = tint === "red" ? 0 : 0.6;
  // Sprint 9: a brushed-metal micro-roughness/normal pair — previously flat-
  // shaded plastic-looking primitives. Cylinder/cone/box geometries already
  // carry default UVs (no wallGeometry.ts-style geometry change needed).
  const { normalMap, roughnessMap } = fixtureTexture();
  const matProps = {
    color: bodyColor,
    emissive,
    emissiveIntensity,
    roughness: 0.6,
    normalMap,
    roughnessMap,
    transparent: opacity !== undefined,
    opacity: opacity ?? 1,
    depthWrite: opacity === undefined,
  };

  // Dark hardware (stem/plate/arm) shared by every shape — never emissive.
  const hardware = { color: tint === "red" ? "#ff3b30" : "#3a3a3a", roughness: 0.5, normalMap, roughnessMap,
    transparent: opacity !== undefined, opacity: opacity ?? 1, depthWrite: opacity === undefined };

  if (shape === "linear") {
    const drop = fixtureDropM("fx:linear");
    const outline = (width: number) => new THREE.Shape(stripOutline(path ?? [], width).map((p) => new THREE.Vector2(p.x, p.y)));
    if (!path || path.length < 1) return null;
    return <group>
      <mesh position={[0, drop, 0]} rotation={[Math.PI / 2, 0, 0]} {...shadow}>
        <extrudeGeometry args={[outline(STRIP_WIDTH_M), { depth: STRIP_HEIGHT_M - 0.002, bevelEnabled: false }]} />
        <meshStandardMaterial {...hardware} />
      </mesh>
      <mesh position={[0, drop - STRIP_HEIGHT_M + 0.002, 0]} rotation={[Math.PI / 2, 0, 0]} {...shadow}>
        <extrudeGeometry args={[outline(STRIP_WIDTH_M - 0.008), { depth: 0.002, bevelEnabled: false }]} />
        <meshStandardMaterial {...matProps} />
      </mesh>
    </group>;
  }

  if (shape === "globePendant" || shape === "drumPendant") {
    const drop = fixtureDropM(`fx:${shape}`);
    return <group>
      <mesh position={[0, drop - 0.012, 0]} {...shadow}>
        <cylinderGeometry args={[0.055, 0.055, 0.024, 24]} />
        <meshStandardMaterial {...hardware} />
      </mesh>
      <mesh position={[0, (drop + 0.1) / 2, 0]} {...shadow}>
        <cylinderGeometry args={[0.004, 0.004, drop - 0.1, 8]} />
        <meshStandardMaterial {...hardware} />
      </mesh>
      <mesh {...shadow}>
        {shape === "globePendant" ? <sphereGeometry args={[0.14, 32, 20]} /> : <cylinderGeometry args={[0.22, 0.22, 0.22, 32]} />}
        <meshStandardMaterial {...matProps} />
      </mesh>
    </group>;
  }

  if (shape === "globeSconce" || shape === "boxSconce") {
    return <group>
      <mesh position={[0, 0, -WALL_FIXTURE_GAP_M + 0.012]} {...shadow}>
        <boxGeometry args={[0.1, 0.2, 0.024]} />
        <meshStandardMaterial {...hardware} />
      </mesh>
      <mesh position={[0, 0, -WALL_FIXTURE_GAP_M / 2]} {...shadow}>
        <boxGeometry args={[0.02, 0.02, WALL_FIXTURE_GAP_M]} />
        <meshStandardMaterial {...hardware} />
      </mesh>
      <mesh {...shadow}>
        {shape === "globeSconce" ? <sphereGeometry args={[0.09, 24, 16]} /> : <boxGeometry args={[0.12, 0.26, 0.1]} />}
        <meshStandardMaterial {...matProps} />
      </mesh>
    </group>;
  }

  if (shape === "flushSquare") {
    return <group>
      <mesh position={[0, ROOM_LIGHT.dropBelowCeilingM - 0.012, 0]} {...shadow}>
        <boxGeometry args={[0.3, 0.024, 0.3]} />
        <meshStandardMaterial {...hardware} />
      </mesh>
      <mesh position={[0, ROOM_LIGHT.dropBelowCeilingM - 0.037, 0]} {...shadow}>
        <boxGeometry args={[0.27, 0.026, 0.27]} />
        <meshStandardMaterial {...matProps} />
      </mesh>
    </group>;
  }

  // The local origin of every shape is the LIGHT SOURCE (RoomLight.position):
  // ROOM_LIGHT.dropBelowCeilingM below the ceiling for ceiling mounts,
  // WALL_FIXTURE_GAP_M off the wall face for wall mounts. Bodies must span
  // from the origin back to that surface, or the fixture visibly floats.

  if (shape === "pendant") {
    // Ceiling rose on the slab, cord down to a cone shade with a bulb in it.
    return (
      <group>
        <mesh position={[0, ROOM_LIGHT.dropBelowCeilingM - 0.011, 0]} {...shadow}>
          <cylinderGeometry args={[0.045, 0.045, 0.022, 16]} />
          <meshStandardMaterial {...hardware} />
        </mesh>
        <mesh position={[0, ROOM_LIGHT.dropBelowCeilingM / 2, 0]} {...shadow}>
          <cylinderGeometry args={[0.008, 0.008, ROOM_LIGHT.dropBelowCeilingM, 8]} />
          <meshStandardMaterial {...hardware} />
        </mesh>
        <mesh position={[0, -0.06, 0]} {...shadow}>
          <coneGeometry args={[0.14, 0.16, 16, 1, true]} />
          <meshStandardMaterial {...matProps} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.1, 0]} {...shadow}>
          <sphereGeometry args={[0.032, 16, 12]} />
          <meshStandardMaterial {...matProps} emissiveIntensity={emissiveIntensity * 1.6} />
        </mesh>
      </group>
    );
  }

  if (shape === "sconce") {
    // Anchored to the wall FACE at local z = -WALL_FIXTURE_GAP_M (the resolved
    // origin is pushed that far into the room for the lighting math — Sprint
    // 3c): backplate on the wall, arm out to a glowing open-cylinder shade
    // around the light source. Front is +Z toward the room, per
    // FurnitureItem's own "front faces local +Z" convention.
    return (
      <group>
        <mesh position={[0, 0, -WALL_FIXTURE_GAP_M + 0.011]} {...shadow}>
          <boxGeometry args={[0.09, 0.18, 0.022]} />
          <meshStandardMaterial {...hardware} />
        </mesh>
        <mesh position={[0, 0, -WALL_FIXTURE_GAP_M / 2]} rotation={[Math.PI / 2, 0, 0]} {...shadow}>
          <cylinderGeometry args={[0.012, 0.012, WALL_FIXTURE_GAP_M, 8]} />
          <meshStandardMaterial {...hardware} />
        </mesh>
        <mesh {...shadow}>
          <cylinderGeometry args={[0.05, 0.062, 0.16, 16, 1, true]} />
          <meshStandardMaterial {...matProps} side={THREE.DoubleSide} />
        </mesh>
      </group>
    );
  }

  // flushDisc — trim plate tight against the ceiling, shallow diffuser dome
  // below it. The origin (light source) hangs under the housing; the housing
  // itself reaches up to the slab.
  return (
    <group>
      <mesh position={[0, ROOM_LIGHT.dropBelowCeilingM - 0.011, 0]} {...shadow}>
        <cylinderGeometry args={[0.15, 0.15, 0.022, 24]} />
        <meshStandardMaterial {...hardware} />
      </mesh>
      <mesh position={[0, ROOM_LIGHT.dropBelowCeilingM - 0.022, 0]} scale={[1, 0.42, 1]} {...shadow}>
        <sphereGeometry args={[0.135, 24, 16]} />
        <meshStandardMaterial {...matProps} />
      </mesh>
    </group>
  );
}
