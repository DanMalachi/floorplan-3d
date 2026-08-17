// Pointer → plan point, on the horizontal plane the gesture is ACTUALLY
// happening on.
//
// Every drag in the app used to intersect the floor (y = 0) and treat the
// result as "where the pointer is". That is only true for something lying on
// the floor. Click the door of a fridge at y = 1.2, and the ray carries on
// past it to land on the floor a metre further from the camera — so the
// gesture is driven by a point that is not the one you grabbed.
//
// Two things go wrong, and both get worse the taller the item:
//
//   1. A constant offset. The grab offset recorded at pointer-down is that
//      whole metre, so the item sits a metre away from the cursor for the
//      rest of the drag.
//   2. A DIFFERENT RATE. Under a perspective camera, screen distance maps to
//      world distance in proportion to how far along the ray the plane is.
//      The floor is further along the ray than the point you grabbed, so the
//      floor point moves faster than the thing under your cursor — the item
//      accelerates away from the pointer as the drag goes on, and no constant
//      offset can correct it.
//
// The repo already found this once, for hung items (`rayForItem`: "dragging
// against the floor plane made the picture slide faster than the cursor and
// wander across the wall's centreline"), and solved it there by raycasting the
// WALL. This is the same fix for everything that stands on the floor: run the
// gesture on the horizontal plane through the point you actually touched, so
// that point stays exactly under the cursor at any camera angle.

import * as THREE from "three";

/**
 * Intersect a pointer ray with the horizontal plane at world height `height`,
 * in plan coordinates (the caller's recentre offset applied).
 *
 * Returns null when the ray is parallel to the plane — a camera at exactly
 * grab height. Callers fall back to the floor plane, which is never worse than
 * what they did before.
 */
export function rayToPlanAt(
  ray: THREE.Ray,
  height: number,
  offset: { cx: number; cz: number },
): { x: number; y: number } | null {
  // THREE.Plane is normal·p + constant = 0; with normal +Y that is p.y = -constant.
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -height);
  const hit = new THREE.Vector3();
  if (!ray.intersectPlane(plane, hit)) return null;
  return { x: hit.x + offset.cx, y: hit.z + offset.cz };
}

/**
 * The height a drag should run at, from the pointer-down event: the world Y of
 * the point on the object the ray actually hit. R3F gives this for free on
 * every pointer event over a mesh — it is the real intersection, so it needs
 * no guessing about how tall the item is or where on it the user aimed.
 *
 * Falls back to the item's own elevation when the event carries no hit point
 * (a synthetic event, or a hit on the catch-all ground plane).
 */
export function grabHeight(
  point: THREE.Vector3 | undefined,
  fallback = 0,
): number {
  return point && Number.isFinite(point.y) ? point.y : fallback;
}
