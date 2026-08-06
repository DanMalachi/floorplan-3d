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
      }
    });
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(spec), tint, opacity]);

  // We own these geometries/materials (unlike GLTF clones, which drei's cache
  // still owns) — dispose them when this group is replaced or unmounted.
  useEffect(() => {
    return () => {
      group.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.dispose();
      });
    };
  }, [group]);

  return <primitive object={group} />;
}
