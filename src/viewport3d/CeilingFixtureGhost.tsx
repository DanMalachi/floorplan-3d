"use client";

import { useEffect, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { ceilingPlacement } from "@/fixtures/placement";
import { FIXTURE_CATALOG_BY_ID } from "@/fixtures/catalog";
import { useSceneStore } from "@/store/useSceneStore";
import type { EligibleRoom } from "@/render/roomLighting";
import { DEFAULT_FIXTURE_COLOR_K, kelvinToColor } from "@/render/lightPresets";
import { GRID } from "./snap";
import { FixtureBody } from "./FixtureBody";
import { suppressSceneEvent } from "./camera/panModifier";

export function CeilingFixtureGhost({ offset, rooms, assetId }: {
  offset: { cx: number; cz: number }; rooms: EligibleRoom[]; assetId: string;
}) {
  const { gl, camera } = useThree();
  const rotation = useSceneStore((s) => s.placing?.rotation ?? 0);
  const [pos, setPos] = useState<ReturnType<typeof ceilingPlacement>>(null);
  useEffect(() => {
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const read = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      ndc.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = ceilingPlacement(raycaster.ray, offset, rooms, assetId);
      return hit && { ...hit, x: e.shiftKey ? hit.x : Math.round(hit.x / GRID) * GRID, y: e.shiftKey ? hit.y : Math.round(hit.y / GRID) * GRID };
    };
    const move = (e: PointerEvent) => { if (!e.buttons) setPos(read(e)); };
    const click = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (suppressSceneEvent("onClick", e)) return;
      e.stopImmediatePropagation();
      const hit = read(e); // click and preview use the same current ray
      if (hit) useSceneStore.getState().placeFixture({ kind: "ceiling", x: hit.x, y: hit.y }, useSceneStore.getState().placing?.rotation ?? 0);
    };
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("click", click, true);
    return () => {
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("click", click, true);
    };
  }, [gl, camera, offset, rooms, assetId]);
  if (!pos) return null;
  return <group position={[pos.x, pos.sourceY, pos.y]} rotation={[0, -rotation, 0]}>
    <FixtureBody shape={FIXTURE_CATALOG_BY_ID.get(assetId)!.shape} colorHex={kelvinToColor(DEFAULT_FIXTURE_COLOR_K)} opacity={0.55} />
  </group>;
}
