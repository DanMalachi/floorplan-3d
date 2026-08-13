"use client";

// Camera focus-on-room-click (Plan Dock P8): glides the camera to a plan
// point when NavigatorPanel's room-icon click resolves to a matching
// scene.rooms entry (BottomDock.tsx's focusRoomForTag). New, additive Canvas
// child — reads the new `focusTarget` store field and drives the existing
// drei CameraControls instance (`makeDefault` in Viewport.tsx).
//
// P2 T1: reframes the whole ROOM (frames its loop bbox) instead of just
// re-centering on a point at a fixed eye height. focusRoomForTag only ever
// hands us the room's own loop-vertex centroid, not the room itself, so this
// re-derives which room that point sits in via point-in-polygon before it can
// build a box to fit — the old point-only re-aim survives as the fallback for
// when that resolution comes up empty (a centroid landing outside its own
// concave loop, or no scene.rooms entry at all).

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import type { CameraControls } from "@react-three/drei";
import { useSceneStore } from "@/store/useSceneStore";
import type { Room, Node, Id } from "@/schema/scene";
import { nodeMap, pointInPolygon } from "@/lib/rooms/roomArea";
import { WALL_HEIGHT } from "@/schema/constants";
import { frameBox } from "./frameTarget";

/** Look-at height for the point-only fallback, meters above the floor —
 *  roughly a seated sightline, so the room reads as a space rather than as a
 *  floor plan. */
const AIM_Y = 0.6;

/** Which room (if any) a plan point falls inside, by its loop polygon. First
 *  match wins on overlap, same as focusRoomForTag's own lookup — good enough
 *  for the non-overlapping rooms a trace produces. */
function roomAtPoint(rooms: Room[], nodes: Map<Id, Node>, x: number, y: number): Room | null {
  for (const room of rooms) {
    const poly = room.loop.map((id) => nodes.get(id)).filter((n): n is Node => !!n);
    if (poly.length >= 3 && pointInPolygon(x, y, poly)) return room;
  }
  return null;
}

/** World-space Box3 for a room's floor loop, in the SAME recentered frame
 *  every layer under Viewport's <group position=[-cx,0,-cz]> renders in
 *  (plan x,y -> world x,z, minus offset.cx/cz). */
function roomBox(room: Room, nodes: Map<Id, Node>, offset: { cx: number; cz: number }): THREE.Box3 | null {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const id of room.loop) {
    const n = nodes.get(id);
    if (!n) continue;
    const x = n.x - offset.cx;
    const z = n.y - offset.cz;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  if (!isFinite(minX)) return null;
  return new THREE.Box3(new THREE.Vector3(minX, 0, minZ), new THREE.Vector3(maxX, WALL_HEIGHT, maxZ));
}

export function CameraFocusRig({ offset }: { offset: { cx: number; cz: number } }) {
  const controls = useThree((s) => s.controls) as CameraControls | null;
  const focusTarget = useSceneStore((s) => s.focusTarget);
  // Dedup by VALUE (not a boolean flag): re-clicking the same room mints a
  // fresh {x,y} object each time (see the store field's own comment), so a
  // reference/shallow-equality check here would wrongly skip repeat clicks.
  const consumed = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!controls || !focusTarget) return;
    if (consumed.current && consumed.current.x === focusTarget.x && consumed.current.y === focusTarget.y) return;
    consumed.current = focusTarget;

    const { scene } = useSceneStore.getState();
    const nodes = nodeMap(scene.nodes);
    const room = roomAtPoint(scene.rooms, nodes, focusTarget.x, focusTarget.y);
    const box = room && roomBox(room, nodes, offset);
    if (box) {
      frameBox(controls, box);
      return;
    }

    // Fallback: no room resolved — re-aim at the raw point the old way
    // rather than doing nothing. Keeps the camera's current distance/angle
    // "feel": rebuild the rig vector against the SAME height the camera is
    // then aimed at. Building it against y=0 while aiming at y=AIM_Y would
    // leave a rig of `rig - (0, AIM_Y, 0)`, i.e. the camera sinks by AIM_Y
    // on every fallback focus — the `consumed` dedup only covers repeat
    // clicks on the SAME room, so alternating rooms would apply that sink
    // every time and a handful of clicks would put the camera under the floor.
    const tx = focusTarget.x - offset.cx;
    const tz = focusTarget.y - offset.cz;
    const curPos = new THREE.Vector3();
    const curTarget = new THREE.Vector3();
    controls.getPosition(curPos);
    controls.getTarget(curTarget);
    const rig = curPos.clone().sub(curTarget);
    const nextPos = new THREE.Vector3(tx, AIM_Y, tz).add(rig);
    controls.setLookAt(nextPos.x, nextPos.y, nextPos.z, tx, AIM_Y, tz, true);
  }, [focusTarget, controls, offset]);

  return null;
}
