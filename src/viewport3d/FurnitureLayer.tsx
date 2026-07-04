"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import type { FurnitureItem, Scene } from "@/schema/scene";
import { useSceneStore } from "@/store/useSceneStore";
import { CATALOG_BY_ID } from "@/furniture/catalog";
import { placementCollides, snapToWall, wallOBBs, type OBB } from "./collision";
import { GRID } from "./snap";
import { ACCENT } from "./WallMesh";

const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function rayToPlan(
  e: ThreeEvent<PointerEvent> | ThreeEvent<MouseEvent>,
  offset: { cx: number; cz: number },
): { x: number; y: number } | null {
  const hit = new THREE.Vector3();
  if (!e.ray.intersectPlane(FLOOR_PLANE, hit)) return null;
  return { x: hit.x + offset.cx, y: hit.z + offset.cz };
}

const snap = (v: number) => Math.round(v / GRID) * GRID;

/** Load + normalize a catalog GLB: plan bbox scaled to the catalog footprint,
 *  floored at y=0, centered. Materials are always cloned per instance so
 *  tinting never leaks into drei's shared GLTF cache. */
function AssetModel({ assetId, tint, opacity }: {
  assetId: string;
  tint?: "red" | null;
  opacity?: number;
}) {
  const gltf = useGLTF(`/furniture/${assetId}.glb`);
  const obj = useMemo(() => {
    const spec = CATALOG_BY_ID.get(assetId);
    const clone = gltf.scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const target = spec ? Math.max(spec.footprint.w, spec.footprint.d) : 1;
    const k = target / (Math.max(size.x, size.z) || 1);
    clone.position.set(-center.x, -box.min.y, -center.z);
    const wrapper = new THREE.Group();
    wrapper.add(clone);
    wrapper.scale.setScalar(k);
    clone.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.castShadow = true;
      o.receiveShadow = true;
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
    return wrapper;
  }, [gltf.scene, assetId, tint, opacity]);
  return <primitive object={obj} />;
}

/** Plan rotation θ → three.js yaw (plan y is world z, so the sense flips). */
const yawOf = (rotation: number) => -rotation;

function SelectionRing({ radius, dim }: { radius: number; dim?: boolean }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
      <ringGeometry args={[radius * 0.9, radius, 40]} />
      <meshBasicMaterial color={ACCENT} transparent opacity={dim ? 0.35 : 0.85} side={THREE.DoubleSide} />
    </mesh>
  );
}

interface FurnDrag {
  pointerId: number;
  base: Scene;
  walls: OBB[];
  grab: { dx: number; dy: number }; // grab point relative to item center
}

function FurnitureItemView({ item, offset }: {
  item: FurnitureItem;
  offset: { cx: number; cz: number };
}) {
  const hovered = useSceneStore(
    (s) => s.hover3d?.kind === "furniture" && s.hover3d.id === item.id,
  );
  const selected = useSceneStore(
    (s) => s.sel3d?.kind === "furniture" && s.sel3d.id === item.id,
  );
  const drag = useRef<FurnDrag | null>(null);
  const [colliding, setColliding] = useState(false);
  const spec = CATALOG_BY_ID.get(item.assetId);
  const ringR = spec ? Math.max(spec.footprint.w, spec.footprint.d) / 2 + 0.12 : 0.5;

  // Placement pop: newly mounted furniture springs from 78% to full size.
  const popRef = useRef<THREE.Group>(null);
  const popDone = useRef(false);
  useFrame((_, dt) => {
    const g = popRef.current;
    if (!g || popDone.current) return;
    const s = THREE.MathUtils.damp(g.scale.x, 1, 11, dt);
    g.scale.setScalar(s);
    if (Math.abs(1 - s) < 1e-3) {
      g.scale.setScalar(1);
      popDone.current = true;
    }
  });

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    const s = useSceneStore.getState();
    if (s.appMode !== "furnish" || s.placing) return; // furniture edits in Furnish only
    e.stopPropagation();
    s.setSel3d({ kind: "furniture", id: item.id });
    const p = rayToPlan(e, offset);
    if (!p) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      base: s.scene,
      walls: wallOBBs(s.scene),
      grab: { dx: p.x - item.x, dy: p.y - item.y },
    };
    s.beginGesture();
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    e.stopPropagation();
    const p = rayToPlan(e, offset);
    if (!p) return;
    let x = p.x - d.grab.dx;
    let y = p.y - d.grab.dy;
    let rotation = item.rotation;
    if (!e.shiftKey) {
      const snapped = snapToWall({ assetId: item.assetId, x, y }, d.base);
      if (snapped) {
        x = snapped.x;
        y = snapped.y;
        rotation = snapped.rotation;
      } else {
        x = snap(x);
        y = snap(y);
      }
    }
    const candidate = { ...item, x, y, rotation };
    setColliding(placementCollides(candidate, d.base, d.walls));
    const next: Scene = {
      ...d.base,
      furniture: d.base.furniture.map((f) => (f.id === item.id ? candidate : f)),
    };
    useSceneStore.getState().updateGesture(next, { guides: [], labels: [] });
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    e.stopPropagation();
    (e.target as Element).releasePointerCapture(e.pointerId);
    drag.current = null;
    setColliding(false);
    useSceneStore.getState().endGesture("Move furniture");
  };

  return (
    <group
      position={[item.x, item.elevation ?? 0, item.y]}
      rotation={[0, yawOf(item.rotation), 0]}
      userData={{ pick: { kind: "furniture", id: item.id } }}
      onPointerOver={(e) => {
        const s = useSceneStore.getState();
        if (s.appMode !== "furnish" || s.placing) return;
        e.stopPropagation();
        s.setHover3d({ kind: "furniture", id: item.id });
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        const cur = useSceneStore.getState().hover3d;
        if (cur?.kind === "furniture" && cur.id === item.id)
          useSceneStore.getState().setHover3d(null);
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <group ref={popRef} scale={0.78}>
        <Suspense fallback={null}>
          <AssetModel assetId={item.assetId} tint={colliding ? "red" : null} />
        </Suspense>
      </group>
      {(selected || hovered) && <SelectionRing radius={ringR} dim={!selected} />}
    </group>
  );
}

/** Ghost + click-to-place. Rendered only while a catalog item is active. */
function PlacementGhost({ offset }: { offset: { cx: number; cz: number } }) {
  const placing = useSceneStore((s) => s.placing);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [state, setState] = useState<{ rotation: number; colliding: boolean }>({
    rotation: 0,
    colliding: false,
  });
  if (!placing) return null;

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const p = rayToPlan(e, offset);
    if (!p) return;
    const s = useSceneStore.getState();
    let x = p.x;
    let y = p.y;
    let rotation = s.placing?.rotation ?? 0;
    if (!e.shiftKey) {
      const snapped = snapToWall({ assetId: placing.assetId, x, y }, s.scene);
      if (snapped) {
        x = snapped.x;
        y = snapped.y;
        rotation = snapped.rotation;
      } else {
        x = snap(x);
        y = snap(y);
      }
    }
    const colliding = placementCollides(
      { id: "__ghost__", assetId: placing.assetId, x, y, rotation },
      s.scene,
    );
    setPos({ x, y });
    setState({ rotation, colliding });
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (!pos) return;
    useSceneStore.getState().placeFurniture(pos.x, pos.y, state.rotation);
  };

  return (
    <>
      {/* Catch-all ground plane: drives the ghost and takes the place click. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[offset.cx, 0.001, offset.cz]}
        onPointerMove={onMove}
        onClick={onClick}
      >
        <planeGeometry args={[600, 600]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {pos && (
        <group position={[pos.x, 0, pos.y]} rotation={[0, yawOf(state.rotation), 0]}>
          <Suspense fallback={null}>
            <AssetModel
              assetId={placing.assetId}
              opacity={0.55}
              tint={state.colliding ? "red" : null}
            />
          </Suspense>
        </group>
      )}
    </>
  );
}

export function FurnitureLayer({ scene, offset }: {
  scene: Scene;
  offset: { cx: number; cz: number };
}) {
  return (
    <group>
      {scene.furniture.map((item) => (
        <FurnitureItemView key={item.id} item={item} offset={offset} />
      ))}
      <PlacementGhost offset={offset} />
    </group>
  );
}
