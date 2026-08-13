"use client";

// Shared by the double-click-to-frame handler (P2 T2) and the keyboard "F"
// (frame selection) shortcut (P2 T3): both need to go from a PickRef to the
// actual rendered Object3D, so fitToBox uses the model's real drawn bounds
// (the true GLB/parametric mesh extents) instead of a hand-rolled
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

/** Walk DOWN the scene graph to find the Object3D a stored PickRef refers to
 *  (e.g. the current 3D selection) — the inverse direction of `pickOf`, used
 *  where there's no raycast hit to start from. */
export function findPickObject3D(root: THREE.Object3D, pick: PickRef): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (found) return;
    const p = o.userData?.pick as PickRef | undefined;
    if (p && p.kind === pick.kind && p.id === pick.id) found = o;
  });
  return found;
}
