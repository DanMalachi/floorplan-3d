"use client";

// Used by the double-click-to-frame handler (P2 T2) to go from a raycast hit
// to the actual rendered Object3D, so fitToBox uses the model's real drawn
// bounds (the true GLB/parametric mesh extents) instead of a hand-rolled
// approximation that would drift from what's actually on screen.

import type * as THREE from "three";
import type { PickRef } from "@/store/useSceneStore";

/** Walk UP from a raycast hit to the nearest ancestor tagged with a pick ref.
 *  Layers tag the WRAPPING group (FurnitureLayer, FixtureLayer), not every
 *  child mesh inside it — a GLTF's own node tree sits underneath — so the
 *  mesh a raycast actually lands on is rarely the tagged node itself. */
export function pickOf(object: THREE.Object3D | null): { object: THREE.Object3D; pick: PickRef } | null {
  let o = object;
  while (o) {
    const pick = o.userData?.pick as PickRef | undefined;
    if (pick) return { object: o, pick };
    o = o.parent;
  }
  return null;
}
