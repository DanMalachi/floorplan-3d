"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ParametricSpec } from "@/schema/scene";
import { GENERATORS, sanitizeSpec } from "@/parametric";
import { applyShadowClass } from "@/render/materialClass";

/** Content equality for the memo key below. The spec is a value object rebuilt
 *  each render, so it must be compared deeply — but `JSON.stringify` paid for a
 *  full walk plus a fresh string on EVERY render, before the memo was allowed
 *  to skip anything. This allocates nothing but the key lists, exits at the
 *  first mismatch, and exits on line one for the common case where the store
 *  hands back the same object. Key order is significant to stringify and not to
 *  this, so it rebuilds strictly less often, never more. */
function sameSpec(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // Mid-drag a dim can briefly be NaN. stringify writes both sides as `null`
  // and calls them equal; `===` does not, and without this the group would
  // rebuild on every frame of that gesture.
  if (typeof a === "number" && typeof b === "number") return Number.isNaN(a) && Number.isNaN(b);
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameSpec(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    if (!(k in b)) return false;
    if (!sameSpec((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}

/** A stable identity for the spec, which callers rebuild on every render: the
 *  last one is held and swapped only when the CONTENT changed, so the memo below
 *  can key on an object reference instead of on a string it must re-derive first.
 *  Identity alone would not do — CounterItemGhost builds its ghost spec inline,
 *  so that is a fresh object on every frame of a drag. */
function useStableSpec(spec: ParametricSpec): ParametricSpec {
  /* eslint-disable react-hooks/refs -- reading AND writing during render is the
     point here: the value is consumed by the same render that writes it, so it
     cannot go stale, and comparing a render against the previous one is not
     possible without holding it. Same "latest ref" idiom as src/dev/GtLab.tsx. */
  const held = useRef(spec);
  if (held.current !== spec && !sameSpec(held.current, spec)) held.current = spec;
  return held.current;
  /* eslint-enable react-hooks/refs */
}

/** Renders a parametric item's procedurally-built group. No <Suspense> needed
 *  — building is synchronous, unlike GlbModel's async GLTF load. */
export function ParametricModel({ spec, tint, opacity }: {
  spec: ParametricSpec;
  tint?: "red" | null;
  opacity?: number;
}) {
  const stableSpec = useStableSpec(spec);

  const group = useMemo(() => {
    const g = GENERATORS[stableSpec.generator].build(sanitizeSpec(stableSpec));
    // Same conventions FurnitureLayer's normalize() applies to loaded GLTFs —
    // copied rather than imported, since normalize() isn't exported and
    // FurnitureLayer.tsx must not be refactored (protected file).
    applyShadowClass(g, opacity !== undefined ? "transient" : "opaqueArchitecture");
    // Cloning is what makes tint/opacity safe: without it a placement ghost
    // would write its transparency straight into materials.ts's module cache
    // and every other item on that finish would go see-through. But a material
    // this instance never writes to has nothing to protect, and leaving the
    // shared one in place is what lets three batch a whole kitchen run by
    // program instead of rebinding per draw — ~90 materials per run collapse to
    // ~3. The three writes in the loop below are the complete set of writes, so
    // this predicate IS the condition for needing a copy. FurnitureLayer decides
    // the same thing once for a whole group; here it is per mesh, because
    // `tintColor` is tagged per mesh by the generators.
    const needsOwnCopy = (o: THREE.Mesh, m: THREE.Material) =>
      opacity !== undefined ||
      ((tint === "red" || !!o.userData.tintColor) && m instanceof THREE.MeshStandardMaterial);
    // The clones — and therefore the exact set this group is allowed to free.
    const owned = new Set<THREE.Material>();
    g.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      // A mirror's reflection lives in its material's uniforms, refreshed each
      // frame by the Reflector that owns it. Cloning that material hands the
      // renderer a copy nobody updates — a mirror showing one frozen frame —
      // so flagged meshes keep the material (and the tint/opacity that would
      // mean nothing on it).
      if (o.userData.keepMaterial) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (!mats.some((m) => needsOwnCopy(o, m))) return;
      o.material = (Array.isArray(o.material)
        ? mats.map((m) => (needsOwnCopy(o, m) ? m.clone() : m))
        : mats[0].clone()) as THREE.Material | THREE.Material[];
      const applied = Array.isArray(o.material) ? o.material : [o.material];
      for (let i = 0; i < applied.length; i++) {
        const m = applied[i];
        // Same object as before: a slot on a mixed mesh that nothing writes to.
        // Not ours to mutate, and not ours to dispose.
        if (m === mats[i]) continue;
        owned.add(m);
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
    // Carried on the group so the disposer below reaches it from its one dep,
    // the same way FurnitureLayer records `ownsMaterials` for its own caller.
    g.userData.ownedMaterials = owned;
    return g;
  }, [stableSpec, tint, opacity]);

  // We own every geometry here (the generators build them per instance) and
  // exactly the materials we cloned — dispose those when this group is replaced
  // or unmounted. What is NOT in that set is the point: now that the clone is
  // conditional, an untinted mesh renders materials.ts's shared instance, and
  // disposing one of those would blank every other item wearing that finish.
  useEffect(() => {
    return () => {
      group.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        o.geometry.dispose();
        if (!o.userData.keepMaterial) return;
        // Never cloned, but still built per instance and still ours. A Reflector
        // additionally owns a render target that only its own dispose() frees;
        // the flat ones (TV glare, art glazing) just free the material.
        const asReflector = o as THREE.Mesh & { dispose?: () => void };
        if (typeof asReflector.dispose === "function") asReflector.dispose();
        else for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      });
      for (const m of group.userData.ownedMaterials as Set<THREE.Material>) m.dispose();
    };
  }, [group]);

  return <primitive object={group} />;
}
