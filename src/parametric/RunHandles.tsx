"use client";

// Kitchen v2 direct-manipulation resize, path-aware (v2.1): a selected
// kitchen run grows arrow handles at the two FREE ENDS of its path — leg 0's
// start and the last leg's end. Dragging an end lengthens/shortens that leg
// in 10cm steps while everything else (corners included) stays planted. The
// store's gesture hook keeps the run glued to its wall and carries attached
// sinks/cooktops while it resizes.

import { useRef, useState } from "react";
import * as THREE from "three";

import type { ThreeEvent } from "@react-three/fiber";
import type { FurnitureItem, Scene } from "@/schema/scene";
import { useSceneStore } from "@/store/useSceneStore";
import { GENERATORS, elevationOf } from "@/parametric";
import { isKitchenRun, runWallId } from "./kitchenAttach";
import { pathLegs, runLocalToWorld } from "./runPath";
import { ACCENT } from "@/viewport3d/WallMesh";
import { rayToPlanAt } from "@/viewport3d/dragPlane";
import { legWorldDir, resizeRunEnd } from "./runResize";

const STEP = 0.1;

/** Draw order for the handles. Walls are `transparent: true`, so they render
 *  in the transparent queue AFTER opaque geometry and painted straight over
 *  the arrows even with depth testing off. A high renderOrder puts the handles
 *  last in that queue, so they are always visible — which is the whole point
 *  of a manipulator. */
const HANDLE_RENDER_ORDER = 1000;

/**
 * Raycast that reports zero distance, so R3F's nearest-first event dispatch
 * always offers the handle the pointer before anything in front of it.
 *
 * Drawing on top is only half the fix. R3F sorts intersections by distance and
 * walks them in order, and WallMesh's handlers call `stopPropagation()` — so a
 * wall between the camera and the handle ate every press and the arrows could
 * not be grabbed at all, however clearly they were drawn. Rewriting the
 * distance is what makes a manipulator behave like an overlay rather than like
 * another object in the room.
 */
function overlayRaycast(
  this: THREE.Object3D,
  raycaster: THREE.Raycaster,
  intersects: THREE.Intersection[],
): void {
  const own: THREE.Intersection[] = [];
  THREE.Mesh.prototype.raycast.call(this as THREE.Mesh, raycaster, own);
  for (const hit of own) intersects.push({ ...hit, distance: 0 });
}

function EndHandle({ item, end, offset }: {
  item: FurnitureItem;
  end: 1 | -1; // -1 = path start (leg 0), +1 = path end (last leg)
  offset: { cx: number; cz: number };
}) {
  const spec = item.parametric!;
  const g = GENERATORS[spec.generator];
  const [hovered, setHovered] = useState(false);
  // The whole gesture is computed from this snapshot, never from the live
  // item: the store re-snaps the run to its wall on every update, so deriving
  // the planted end from the CURRENT pose let it drift a step per frame until
  // the run walked onto a wall in another room. See runResize.ts.
  const drag = useRef<{ pointerId: number; base: Scene; item: FurnitureItem; planeY: number } | null>(null);

  const d = spec.dims.d;
  const legs = pathLegs(spec);
  const leg = end === -1 ? legs[0] : legs[legs.length - 1];

  const dirW = legWorldDir(item, leg);
  // Pointing direction: out of this end of the path.
  const point = end === -1 ? { x: -dirW.x, y: -dirW.y } : dirW;

  const endLocal =
    end === -1
      ? { x: leg.sx, z: leg.sz }
      : { x: leg.sx + leg.dx * leg.len, z: leg.sz + leg.dz * leg.len };
  const gripLocal = {
    x: endLocal.x + leg.fx * (d / 2) + (end === -1 ? -leg.dx : leg.dx) * 0.09,
    z: endLocal.z + leg.fz * (d / 2) + (end === -1 ? -leg.dz : leg.dz) * 0.09,
  };
  const grip = runLocalToWorld(item, gripLocal);
  const handleY =
    spec.generator === "kitchenWall"
      ? (item.elevation ?? elevationOf(spec) ?? 0) + spec.dims.h / 2
      : spec.dims.h + 0.06;

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const s = useSceneStore.getState();
    drag.current = { pointerId: e.pointerId, base: s.scene, item, planeY: handleY };
    // Pin the run to the wall it is on for the whole resize. Growing a run
    // moves its centre, and the wall snap ranks purely by proximity — so
    // without this, widening a run far enough hands it to a neighbouring wall
    // (or the far face of its own) and the whole thing jumps rooms.
    const wallId = runWallId(item, s.scene, item.rotation);
    s.setGestureLock(wallId ? { itemId: item.id, wallId } : null);
    s.beginGesture();
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const dr = drag.current;
    if (!dr || e.pointerId !== dr.pointerId) return;
    e.stopPropagation();
    // The handle is what you are dragging, and it floats at counter height (or
    // higher, on a wall run). Read the pointer on the handle's OWN plane —
    // against the floor plane the run stretched faster than the cursor, so the
    // arrow ran away from it. See viewport3d/dragPlane.ts.
    const p = rayToPlanAt(e.ray, dr.planeY, offset);
    if (!p) return;
    const { x, y, parametric, width } = resizeRunEnd(dr.item, end, p, g.dimLimits.w, STEP);
    // Rebuilt from the pointer-down BASELINE every frame, so the gesture is a
    // pure function of the cursor: holding still changes nothing, and dragging
    // out and back lands exactly where it started.
    const next: Scene = {
      ...dr.base,
      furniture: dr.base.furniture.map((f) =>
        f.id === dr.item.id
          ? { ...f, parametric, ...(x !== undefined ? { x, y: y! } : {}) }
          : f,
      ),
    };
    useSceneStore.getState().updateGesture(next, {
      guides: [],
      labels: [{ world: [grip.x, handleY + 0.12, grip.y], text: `${Math.round(width * 100)} cm` }],
    });
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    const dr = drag.current;
    if (!dr || e.pointerId !== dr.pointerId) return;
    e.stopPropagation();
    (e.target as Element).releasePointerCapture(e.pointerId);
    drag.current = null;
    useSceneStore.getState().endGesture("Resize kitchen run");
  };

  return (
    <group position={[grip.x, handleY, grip.y]} rotation={[0, Math.atan2(-point.y, point.x), 0]}>
      {/* Arrow cone pointing out of this end. */}
      <mesh rotation={[0, 0, -Math.PI / 2]} renderOrder={HANDLE_RENDER_ORDER}>
        <coneGeometry args={[0.045, 0.11, 12]} />
        <meshBasicMaterial color={ACCENT} transparent opacity={hovered ? 1 : 0.75} depthTest={false} depthWrite={false} />
      </mesh>
      {/* Fat invisible hit target — the cone alone is a sniper shot. */}
      <mesh
        raycast={overlayRaycast}
        renderOrder={HANDLE_RENDER_ORDER}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          // Registers as hover so the camera locks BEFORE the press (same
          // hover-gate the furniture layers use).
          useSceneStore.getState().setHover3d({ kind: "furniture", id: item.id });
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          const cur = useSceneStore.getState().hover3d;
          if (cur?.kind === "furniture" && cur.id === item.id) useSceneStore.getState().setHover3d(null);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <sphereGeometry args={[0.14, 12, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Mounts the two path-end handles for the selected kitchen run (Furnish mode). */
export function RunHandles({ offset }: { offset: { cx: number; cz: number } }) {
  const appMode = useSceneStore((s) => s.appMode);
  const sel3d = useSceneStore((s) => s.sel3d);
  const scene = useSceneStore((s) => s.scene);
  if (appMode !== "furnish" || sel3d?.kind !== "furniture") return null;
  const item = scene.furniture.find((f) => f.id === sel3d.id);
  if (!item || !isKitchenRun(item)) return null;
  return (
    <group>
      <EndHandle key={`${item.id}-`} item={item} end={-1} offset={offset} />
      <EndHandle key={`${item.id}+`} item={item} end={1} offset={offset} />
    </group>
  );
}
