"use client";

import { useEffect, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useSceneStore } from "@/store/useSceneStore";
import { pointInPolygon } from "@/lib/rooms/roomArea";
import type { EligibleRoom } from "@/render/roomLighting";
import { DEFAULT_FIXTURE_COLOR_K, kelvinToColor } from "@/render/lightPresets";
import { extendLightPath, fixtureDropM, toFixtureLocal, toFixtureWorld, pathInsideRoom, stripOutline, STRIP_WIDTH_M, STRIP_HEIGHT_M, type LightPoint } from "@/fixtures/linear";
import { rayToPlanAt } from "./dragPlane";
import { FixtureBody } from "./FixtureBody";
import { suppressSceneEvent } from "./camera/panModifier";

type Draft = { origin: LightPoint; rotation: number; height: number; fixed: LightPoint[]; loop: LightPoint[] };
type Preview = Draft & { path: LightPoint[]; valid: boolean };

/** Like the cabinet run, drafting stays transient until a single scene
 * commit. Native capture lets the ceiling tool work from above or below the
 * slab and consumes double-click before the camera's frame handler. */
export function LinearLightGhost({ offset, rooms }: { offset: { cx: number; cz: number }; rooms: EligibleRoom[] }) {
  const { gl, camera } = useThree();
  const draft = useRef<Draft | null>(null);
  const beforeClick = useRef<Draft | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const drop = fixtureDropM("fx:linear");
    const read = (e: MouseEvent | PointerEvent, base = draft.current): Preview | null => {
      const rect = canvas.getBoundingClientRect();
      ndc.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      if (base) {
        const p = rayToPlanAt(raycaster.ray, base.height + drop - STRIP_HEIGHT_M, offset);
        if (!p) return null;
        const path = extendLightPath(base.fixed, toFixtureLocal(p, base.origin, base.rotation));
        const outline = stripOutline(path, STRIP_WIDTH_M).map((v) => toFixtureWorld(v, base.origin, base.rotation));
        return { ...base, path, valid: pathInsideRoom(outline.length ? [...outline, outline[0]] : [base.origin], base.loop) };
      }
      // Resolve actual ceiling intersections, nearest first. A floor-plane
      // projection would put the 2.4m-high preview away from the pointer.
      const hits = rooms.flatMap((room) => {
        const height = room.ceilingHeight - drop;
        const p = rayToPlanAt(raycaster.ray, room.ceilingHeight - STRIP_HEIGHT_M, offset);
        if (!p || !pointInPolygon(p.x, p.y, room.loop)) return [];
        const origin = { x: Math.round(p.x / 0.05) * 0.05, y: Math.round(p.y / 0.05) * 0.05 };
        return [{ origin, height, loop: room.loop, distance: raycaster.ray.origin.distanceTo(new THREE.Vector3(p.x - offset.cx, height, p.y - offset.cz)) }];
      }).sort((a, b) => a.distance - b.distance);
      const hit = hits[0];
      if (!hit) return null;
      const rotation = useSceneStore.getState().placing?.rotation ?? 0;
      return { origin: hit.origin, height: hit.height, loop: hit.loop, rotation, fixed: [{ x: 0, y: 0 }], path: [{ x: 0, y: 0 }], valid: pointInPolygon(hit.origin.x, hit.origin.y, hit.loop) };
    };
    const onMove = (e: PointerEvent) => {
      if (e.buttons !== 0) return; // right orbit / middle pan remain available
      setPreview(read(e));
    };
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (suppressSceneEvent("onClick", e)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.detail > 1) return;
      beforeClick.current = draft.current;
      const next = read(e);
      if (!next || !next.valid) return;
      draft.current = { ...next, fixed: draft.current ? next.path : next.fixed };
      setPreview(next);
    };
    const onDoubleClick = (e: MouseEvent) => {
      if (suppressSceneEvent("onDoubleClick", e)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      // Browser dispatches click(1), click(2), dblclick. Re-evaluate against
      // the state BEFORE click(1), so confirming doesn't add a phantom turn.
      const base = beforeClick.current;
      if (!base) return;
      const next = read(e, base);
      if (!next || !next.valid || next.path.length < 2) return;
      const s = useSceneStore.getState();
      s.placeFixture({ kind: "ceiling", ...next.origin }, next.rotation, next.path);
      s.setPlacing(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (draft.current) {
        draft.current = null;
        beforeClick.current = null;
        setPreview(null);
      } else useSceneStore.getState().setPlacing(null);
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("click", onClick, true);
    canvas.addEventListener("dblclick", onDoubleClick, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("click", onClick, true);
      canvas.removeEventListener("dblclick", onDoubleClick, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [gl, camera, offset, rooms]);

  if (!preview) return null;
  return <group position={[preview.origin.x, preview.height, preview.origin.y]} rotation={[0, -preview.rotation, 0]}>
    <FixtureBody shape="linear" colorHex={kelvinToColor(DEFAULT_FIXTURE_COLOR_K)} path={preview.path} opacity={0.55} tint={preview.valid ? null : "red"} />
  </group>;
}
