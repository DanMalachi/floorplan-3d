"use client";

// Attachment ghosts for parametric items that don't live on the open floor.
//
// 1. COUNTER items (sink/cooktop/future appliances): the ghost rides the
//    nearest kitchenBase run's countertop — grid-snapped along it, at the
//    run's own counter height and rotation — and a click bonds the item there
//    (FurnitureItem.attach). Off-counter the ghost turns red and clicks are
//    rejected: a sink cannot exist without a counter.
// 2. WALL items (mirrors, towel rails): the ghost reads the WALL grid via
//    wallRay — pointing at a wall face gives position, facing and height in
//    one hit. Off-wall it turns red, for the same reason.
//
// Both live in this one file, and it keeps the `CounterItemGhost` export name,
// because Viewport.tsx already mounts that component and Viewport.tsx is a
// protected file (docs/PROTECTED_PATHS.md) — adding a sibling ghost would mean
// editing it.

import { Suspense, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useSceneStore } from "@/store/useSceneStore";
import { pdToast } from "@/ui/planDock/toast";
import { attachedPose, counterLiftOf, findAttachHost, findHostRun, isCounterHost, isSurfaceOptional } from "./kitchenAttach";
import { recordHostHeight, measuredHeight, surfaceRects } from "./surfaceHosts";
import { CATALOG_BY_ID } from "@/furniture/catalog";
import { ParametricModel } from "./ParametricModel";
import { pathLegs, runLocalToWorld } from "./runPath";
import { rayToWall, wallPose } from "./wallRay";
import type { FurnitureItem, Scene } from "@/schema/scene";

const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const yawOf = (rotation: number) => -rotation;
/** Worktop slabs run a little past the cabinets on every side, so the ghost
 *  latches slightly before the cursor is pixel-perfect — the same forgiveness
 *  findHostRun's own margins give. */
const HOST_SIDE_PAD = 0.12;

function rayToPlan(e: ThreeEvent<PointerEvent | MouseEvent>, offset: { cx: number; cz: number }) {
  const hit = new THREE.Vector3();
  if (!e.ray.intersectPlane(FLOOR_PLANE, hit)) return null;
  return { x: hit.x + offset.cx, y: hit.z + offset.cz };
}

function WallItemGhost({ offset }: { offset: { cx: number; cz: number } }) {
  const placingWall = useSceneStore((s) => s.placingWall);
  const scene = useSceneStore((s) => s.scene);
  const [pose, setPose] = useState<{ x: number; y: number; rotation: number; elevation: number } | null>(null);
  const [miss, setMiss] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!placingWall) {
      setPose(null);
      setMiss(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") useSceneStore.getState().setPlacingWall(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [placingWall]);

  if (!placingWall) return null;
  const spec = placingWall.spec;

  const resolve = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const s = useSceneStore.getState().scene;
    const hit = rayToWall(e.ray, s, offset, true);
    return hit ? wallPose(hit, s, spec.dims.d, spec.dims.h) : null;
  };

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const p = resolve(e);
    setPose(p);
    if (!p) {
      const floor = rayToPlan(e, offset);
      setMiss(floor);
    } else setMiss(null);
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const p = resolve(e);
    if (!p) {
      pdToast("Point at a wall to hang it");
      return;
    }
    useSceneStore.getState().placeWallItem(p);
  };

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[offset.cx, 0.001, offset.cz]} onPointerMove={onMove} onClick={onClick}>
        <planeGeometry args={[600, 600]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {pose && (
        <group position={[pose.x, pose.elevation, pose.y]} rotation={[0, yawOf(pose.rotation), 0]}>
          <ParametricModel spec={spec} opacity={0.55} />
        </group>
      )}
      {!pose && miss && (
        <group position={[miss.x, 1.2, miss.y]}>
          <ParametricModel spec={spec} opacity={0.4} tint="red" />
        </group>
      )}
    </>
  );
}

/**
 * An invisible slab lying ON each counter surface, one per leg of every base
 * run — the thing that makes dropping an item onto a worktop behave the way
 * dropping it on the floor does.
 *
 * Without it the ghost read the FLOOR plane: the cursor sat visually on the
 * counter while the item it was carrying tracked a point on the ground metres
 * further back, and hovering the run handed the pointer to the run itself
 * (select + drag the host instead of placing on it), which is why the ghost
 * appeared to freeze over a counter. The slab sits 4mm above the worktop, so
 * it is the nearest thing under the pointer and answers first.
 */
export function counterSurfaces(scene: Scene): { host: FurnitureItem; x: number; y: number; yaw: number; len: number; d: number; top: number }[] {
  const out: { host: FurnitureItem; x: number; y: number; yaw: number; len: number; d: number; top: number }[] = [];
  for (const host of scene.furniture) {
    if (!isCounterHost(host) || !host.parametric) continue;
    const spec = host.parametric;
    const d = spec.dims.d;
    for (const leg of pathLegs(spec)) {
      const mid = {
        x: leg.sx + leg.dx * (leg.len / 2) + leg.fx * (d / 2),
        z: leg.sz + leg.dz * (leg.len / 2) + leg.fz * (d / 2),
      };
      const p = runLocalToWorld(host, mid);
      out.push({
        host,
        x: p.x,
        y: p.y,
        // The leg's own travel direction, in the same convention attachedPose
        // uses for an attached item's rotation.
        yaw: yawOf(host.rotation + Math.atan2(-leg.fx, leg.fz)),
        len: leg.len,
        d,
        top: (host.elevation ?? 0) + spec.dims.h,
      });
    }
  }
  return out;
}

/**
 * Measures ONE catalog model and records its real height.
 *
 * A `FurnitureAsset` has a footprint and no height — nothing needed one until
 * something had to stand on top of an IKEA sideboard. The viewer scales every
 * GLB uniformly so its larger plan dimension matches the declared footprint
 * (`normalize()` in FurnitureLayer.tsx, a protected file), so the same scale
 * applied to the model's own bounding box gives the height in world metres.
 * Cheap: drei has the GLTF cached already, since the item is on screen.
 */
function HostHeightProbe({ assetId, url, draco }: { assetId: string; url: string; draco: boolean }) {
  const gltf = useGLTF(url, draco ? "/draco/" : false);
  const asset = CATALOG_BY_ID.get(assetId);
  useMemo(() => {
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const target = asset ? Math.max(asset.footprint.w, asset.footprint.d) : 1;
    const k = target / (Math.max(size.x, size.z) || 1);
    recordHostHeight(assetId, size.y * k);
  }, [gltf.scene, assetId, asset]);
  return null;
}

/**
 * Probes catalog items whose height we do not know yet.
 *
 * `hosting` mode measures only the items that already carry something — those
 * have to be measured whether or not anyone is placing, because an attached
 * item's elevation is re-derived from its host's top on every sync, and an
 * unmeasured host would drop the thing standing on it to the estimate. The
 * full sweep runs only while a surface item is armed, so a plan nobody is
 * dropping a TV into loads nothing extra.
 */
function HostHeightProbes({ hosting }: { hosting?: boolean }) {
  const scene = useSceneStore((s) => s.scene);
  const targets = useMemo(() => {
    const seen = new Set<string>();
    const hosts = new Set(scene.furniture.map((f) => f.attach?.hostId).filter(Boolean) as string[]);
    const out: { assetId: string; url: string; draco: boolean }[] = [];
    for (const f of scene.furniture) {
      if (hosting && !hosts.has(f.id)) continue;
      if (f.parametric || seen.has(f.assetId) || measuredHeight(f.assetId) !== undefined) continue;
      const asset = CATALOG_BY_ID.get(f.assetId);
      const url = asset?.realModel ?? (asset?.model ? `/furniture/${asset.model}.glb` : null);
      if (!asset || !url) continue;
      seen.add(f.assetId);
      out.push({ assetId: f.assetId, url, draco: !!asset.realModel });
    }
    return out;
  }, [scene.furniture]);
  return (
    <Suspense fallback={null}>
      {targets.map((t) => (
        <HostHeightProbe key={t.assetId} {...t} />
      ))}
    </Suspense>
  );
}

function CounterGhost({ offset }: { offset: { cx: number; cz: number } }) {
  const placingCounter = useSceneStore((s) => s.placingCounter);
  const scene = useSceneStore((s) => s.scene);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!placingCounter) {
      setCursor(null);
      return;
    }
    // Capture-phase Esc, same reasoning as RunDrawGhost.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") useSceneStore.getState().setPlacingCounter(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [placingCounter]);

  if (!placingCounter) return null;
  const spec = placingCounter.spec;
  const freeStanding = isSurfaceOptional(spec);
  const found = cursor ? findAttachHost(cursor.x, cursor.y, scene, spec.dims.w) : null;
  // Worktops (path-shaped) plus every plain furniture top — a TV goes on a
  // media unit the same way a microwave goes on a counter.
  const surfaces = [
    ...counterSurfaces(scene),
    ...(freeStanding
      ? surfaceRects(scene).map((r) => ({ host: r.host, x: r.x, y: r.y, yaw: yawOf(r.rotation), len: r.w, d: r.d, top: r.top }))
      : []),
  ];

  /** Plan point of whatever the pointer actually touched — the worktop slab
   *  when it's over a counter, the ground plane otherwise. Reading the FLOOR
   *  for both is what made the item lag behind the cursor by the parallax of
   *  the counter's height. */
  const pointToPlan = (e: ThreeEvent<PointerEvent | MouseEvent>) => ({
    x: e.point.x + offset.cx,
    y: e.point.z + offset.cz,
  });

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setCursor(pointToPlan(e));
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const p = pointToPlan(e);
    const hit = findAttachHost(p.x, p.y, useSceneStore.getState().scene, spec.dims.w);
    if (!hit) {
      // A sink cannot exist off a counter; a TV on a stand is happy on the
      // floor, so the same ghost either refuses or just puts it down.
      if (!freeStanding) {
        pdToast("Place it on a kitchen counter");
        return;
      }
      useSceneStore.getState().placeSurfaceItemFree(p.x, p.y);
      return;
    }
    useSceneStore.getState().placeCounterItem(hit.host.id, hit.along);
  };

  // Same lift the store's attachment sync will apply, so an island hood
  // previews where it will actually hang rather than flat on the worktop.
  const pose = found ? attachedPose(found.host, found.along, counterLiftOf(spec)) : null;

  return (
    <>
      {/* Catch-all ground plane: drives the ghost and takes the place click
          everywhere OFF a counter. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[offset.cx, 0.001, offset.cz]}
        onPointerMove={onMove}
        onClick={onClick}
      >
        <planeGeometry args={[600, 600]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* …and a slab on each worktop, which the pointer meets before the run
          itself. Nearest-hit wins in R3F, so stopping propagation here also
          stops the host being selected and dragged by the placing click. */}
      {surfaces.map((s, i) => (
        <mesh
          key={`${s.host.id}:${i}`}
          position={[s.x, s.top + 0.004, s.y]}
          rotation={[0, s.yaw, 0]}
          onPointerMove={onMove}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClick}
        >
          <boxGeometry args={[s.len + HOST_SIDE_PAD, 0.002, s.d + HOST_SIDE_PAD]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
      {pose && (
        <group position={[pose.x, pose.elevation, pose.y]} rotation={[0, yawOf(pose.rotation), 0]}>
          <ParametricModel spec={spec} opacity={0.55} />
        </group>
      )}
      {!pose && cursor && (
        // Nothing under the cursor. For a sink that is an error (red ghost,
        // click rejected); for a TV it is just the floor, so the preview is
        // the ordinary one and the click lands.
        <group position={[cursor.x, 0, cursor.y]}>
          <ParametricModel spec={spec} opacity={freeStanding ? 0.55 : 0.4} tint={freeStanding ? null : "red"} />
        </group>
      )}
      {freeStanding && <HostHeightProbes />}
    </>
  );
}

/** Mounted once by Viewport.tsx. Each inner ghost renders nothing unless its
 *  own placement mode is armed, and the store keeps the modes mutually
 *  exclusive, so at most one is ever live. */
export function CounterItemGhost({ offset }: { offset: { cx: number; cz: number } }) {
  return (
    <>
      <CounterGhost offset={offset} />
      <WallItemGhost offset={offset} />
      {/* Always on: every host that is already carrying something needs its
          real height, or whatever stands on it moves when the plan reopens. */}
      <HostHeightProbes hosting />
    </>
  );
}
