"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import { GENERATORS, sanitizeSpec } from "@/parametric";
import { applyShadowClass } from "@/render/materialClass";

/** Renders a parametric item's procedurally-built group. No <Suspense> needed
 *  — building is synchronous, unlike GlbModel's async GLTF load. */
export function ParametricModel({ spec, tint, opacity }: {
  spec: ParametricSpec;
  tint?: "red" | null;
  opacity?: number;
}) {
  const group = useMemo(() => {
    const g = GENERATORS[spec.generator].build(sanitizeSpec(spec));
    // Same conventions FurnitureLayer's normalize() applies to loaded GLTFs —
    // copied rather than imported, since normalize() isn't exported and
    // FurnitureLayer.tsx must not be refactored (protected file).
    applyShadowClass(g, opacity !== undefined ? "transient" : "opaqueArchitecture");
    g.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      // A mirror's reflection lives in its material's uniforms, refreshed each
      // frame by the Reflector that owns it. Cloning that material hands the
      // renderer a copy nobody updates — a mirror showing one frozen frame —
      // so flagged meshes keep the material (and the tint/opacity that would
      // mean nothing on it).
      if (o.userData.keepMaterial) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      o.material = (Array.isArray(o.material) ? mats.map((m) => m.clone()) : mats[0].clone()) as
        | THREE.Material
        | THREE.Material[];
      const applied = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of applied) {
        if (opacity !== undefined) {
          m.transparent = true;
          m.opacity = opacity;
          m.depthWrite = false;
        }
        if (tint === "red" && m instanceof THREE.MeshStandardMaterial) {
          m.emissive = new THREE.Color("#ff3b30");
          m.emissiveIntensity = 0.55;
        }
        // Color-wheel tint (docs/parametric-furniture.md R1): generators tag
        // colorable meshes with userData.tintColor; applied on the CLONE only
        // — the shared base material in materials.ts's cache never mutates.
        if (o.userData.tintColor && m instanceof THREE.MeshStandardMaterial) {
          m.color.set(o.userData.tintColor);
          if (m instanceof THREE.MeshPhysicalMaterial) m.sheenColor?.set(o.userData.tintColor);
        }
      }
    });
    return g;
    // JSON.stringify is deliberate: the spec is a value object rebuilt each render,
    // so it must be compared deeply, not by identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  }, [JSON.stringify(spec), tint, opacity]);

  // We own these geometries/materials (unlike GLTF clones, which drei's cache
  // still owns) — dispose them when this group is replaced or unmounted.
  useEffect(() => {
    return () => {
      group.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        o.geometry.dispose();
        // A Reflector also owns a render target; its own dispose() frees that.
        const asReflector = o as THREE.Mesh & { dispose?: () => void };
        if (o.userData.keepMaterial && typeof asReflector.dispose === "function") {
          asReflector.dispose();
          return;
        }
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.dispose();
      });
    };
  }, [group]);

  return <primitive object={group} />;
}
