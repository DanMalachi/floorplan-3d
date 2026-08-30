"use client";

import { Component, Suspense, useEffect, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { CATALOG_BY_ID, type FurnitureAsset } from "@/furniture/catalog";
import { applyShadowClass } from "@/render/materialClass";
import { useSceneStore } from "@/store/useSceneStore";
import { noteItemFailed, noteItemPlaced, noteItemRemoved, notePlan, resetFurnishBridge } from "./furnishBridge";
import { assertKtx2TexturesResolved, useKtx2ExtendLoader } from "@/render/ktx2";
import type { FurnishOptions } from "./furnishParams";
import { planFurnish, type FurnishPlacement } from "./furnishPlan";

/**
 * The furnished benchmark scene (`?perf=1&furnish=N`).
 *
 * =========================================================================
 * THIS CANNOT REACH THE LIVE ROOM. Here is exactly why.
 * =========================================================================
 * `/v/<id>` is a CONTINUOUSLY synced Liveblocks room: the room is the source of
 * truth and `CollabRoom` mirrors it back into IndexedDB (and, signed in, on to
 * Supabase). Anything that put 40 items into that project would corrupt a real
 * design — permanently, and for every device it syncs to. So the mechanism was
 * chosen for what it CANNOT do, not for convenience.
 *
 * There are exactly two code paths from this client to the shared Yjs doc, and
 * this component is on neither:
 *
 *   1. `useSceneStore.commitScene()` / `endGesture()` → `collab.commit(prev,
 *      next)` → `applySceneDiff(doc, …)` (`src/store/useSceneStore.ts` lines
 *      ~597 and ~667; the sink is installed by `CollabRoom.useRoomBinding`).
 *      Those are the ONLY two call sites of `collab.commit` in the repo.
 *   2. `seedSceneDoc(doc, …)` in `CollabRoom.maybeSeed`, which runs once, only
 *      when the doc is empty, and only from a persisted project seed.
 *
 * This file calls neither, and cannot: it has no reference to the store's
 * setters, no reference to the Yjs doc, and — critically — it never produces a
 * `FurnitureItem` at all. `scene.furniture` is untouched, so even the
 * diff-based sink has nothing to observe. The only store interaction here is
 * `useSceneStore((s) => s.scene)`, a read-only subscription used to find out
 * where the rooms are.
 *
 * The furniture exists only as three.js objects hung under this component's
 * `<group>`. It is not in the `Scene`, so it is invisible to `applySceneDiff`,
 * to `scheduleProjectMirror`, to project autosave, to the exporter, to
 * `viewportThumb`, and to walkthrough collision. It disappears the moment the
 * query parameter does, because it never existed anywhere but the render graph.
 *
 * The mount gate in `PerfRig` is the second lock: without `?perf=1&furnish=N`
 * this component is never constructed, so a normal user's page load carries no
 * store subscription, no GLB fetch and no scene-graph mutation from it.
 * =========================================================================
 */

/**
 * Normalize a loaded GLTF the way the product does.
 *
 * This deliberately mirrors the no-tint, no-opacity branch of
 * `normalize()` in the protected `src/viewport3d/FurnitureLayer.tsx`: same
 * corrective rotation, same bbox measurement, same floor-and-centre, same scale
 * to the catalog footprint, same shadow class, and — the load-bearing part —
 * the same decision NOT to clone materials. A plain placement in the product
 * references drei's cached GLTF materials directly, which is what lets three
 * batch repeats of a model by program instead of rebinding per draw. A copy
 * here that cloned materials would inflate both program count and texture
 * memory and would be measuring this file rather than the app.
 *
 * It is a copy rather than an import because `FurnitureLayer.tsx` is a
 * protected path (`docs/PROTECTED_PATHS.md`) and does not export it. If that
 * function changes, this one has drifted and the numbers drift with it.
 */
function normalizeForPerf(
  gltfScene: THREE.Object3D,
  footprint: { w: number; d: number } | undefined,
  rotation: [number, number, number] | undefined,
): THREE.Group {
  const clone = gltfScene.clone(true);
  if (rotation) clone.rotation.set(rotation[0], rotation[1], rotation[2]);
  const box = new THREE.Box3().setFromObject(clone);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const target = footprint ? Math.max(footprint.w, footprint.d) : 1;
  const k = target / (Math.max(size.x, size.z) || 1);
  clone.position.set(-center.x, -box.min.y, -center.z);
  const wrapper = new THREE.Group();
  wrapper.add(clone);
  wrapper.scale.setScalar(k);
  applyShadowClass(clone, "opaqueArchitecture");
  return wrapper;
}

/** One benchmark item. Suspends until its GLB is loaded and decoded. */
function FurnishItem({ placement, spec }: { placement: FurnishPlacement; spec: FurnitureAsset }) {
  // Always point at the local Draco decoder, which is the split `FurnitureLayer`
  // actually makes: `:222` passes `draco: true` for every `realModel`, IKEA or
  // not. An earlier version of this rig guessed from the asset id — IKEA Draco,
  // BlenderKit plain — and it was wrong: `scripts/blenderkit/optimize.ts` Draco's
  // its output too, and 65 of the 75 GLBs under `public/furniture/blenderkit/opt`
  // carry `KHR_draco_mesh_compression`. Every one of those threw in the loader,
  // `ItemBoundary` swallowed it, and `--furnish-mix blenderkit` reported numbers
  // identical to an unfurnished scene while recording `placed 0 / failed 40`.
  // A decoder path costs nothing on a model that does not need one.
  // Same KTX2 hookup as the product path (FurnitureLayer.tsx's GlbModel) —
  // see src/render/ktx2.ts. A no-op for any GLB without KHR_texture_basisu.
  const ktx2ExtendLoader = useKtx2ExtendLoader();
  const gltf = useGLTF(spec.realModel!, "/draco/", false, ktx2ExtendLoader);
  // Throws on a silently-untextured KTX2 model instead of letting it render
  // (and count as "placed") with a texture GLTFLoader quietly dropped — the
  // exact hollow-run shape this rig's own docstring above already warns
  // about, one layer deeper (per-texture, not per-model).
  assertKtx2TexturesResolved(gltf, spec.realModel!);
  const rotKey = spec.modelRotation?.join(",");

  const object = useMemo(
    () => normalizeForPerf(gltf.scene, spec.footprint, spec.modelRotation),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gltf.scene, spec.footprint, rotKey],
  );

  // Reaching here means the model resolved: React only renders past a suspended
  // `useGLTF` once its promise settles.
  const key = placement.key;
  useEffect(() => {
    noteItemPlaced(key);
    return () => noteItemRemoved(key);
  }, [key]);

  return (
    <group
      position={[placement.x, placement.elevation, placement.y]}
      // Plan rotation θ → three yaw −θ (plan y is world z, so the sense flips).
      // Same convention as `yawOf` in FurnitureLayer.
      rotation={[0, -placement.rotation, 0]}
    >
      <primitive object={object} />
    </group>
  );
}

/**
 * Contains a failed model load.
 *
 * The product's equivalent falls through to a grey placeholder box, which is
 * right for a user and wrong here: a placeholder has none of the textures or
 * geometry the benchmark exists to load, so a scene full of them would report
 * cheerful numbers for a scene that failed. This renders NOTHING and records the
 * failure, so the results JSON shows `placed < planned` and the run is visibly
 * suspect instead of quietly wrong.
 */
class ItemBoundary extends Component<{ itemKey: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    noteItemFailed(this.props.itemKey);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Recenters over the origin exactly as `Viewport`'s own `<group position={[-cx,
 * 0, -cz]}>` does, using the same bbox-of-nodes centroid, so a placement's plan
 * coordinates land in the same world position furniture in the real scene would.
 * Duplicated rather than imported for the same reason as `normalizeForPerf`:
 * `Viewport.tsx` is protected and `useSceneBounds` is private to it.
 */
function planCenter(nodes: { x: number; y: number }[]): { cx: number; cz: number } {
  if (nodes.length === 0) return { cx: 0, cz: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y);
    maxY = Math.max(maxY, n.y);
  }
  return { cx: (minX + maxX) / 2, cz: (minY + maxY) / 2 };
}

export function PerfFurnishRig({ options }: { options: FurnishOptions }) {
  // READ ONLY. The one and only store interaction in this subtree — see the
  // ownership note above.
  const scene = useSceneStore((s) => s.scene);

  const plan = useMemo(() => planFurnish(scene, options), [scene, options]);
  const center = useMemo(() => planCenter(scene.nodes), [scene.nodes]);

  const items = useMemo(
    () =>
      plan.placements
        .map((placement) => ({ placement, spec: CATALOG_BY_ID.get(placement.assetId) }))
        .filter((entry): entry is { placement: FurnishPlacement; spec: FurnitureAsset } =>
          Boolean(entry.spec?.realModel),
        ),
    [plan],
  );

  // Publish what was planned before anything loads, so the harness can tell
  // "still loading" (placed < planned) from "the plan is smaller than asked"
  // (planned < requested) rather than guessing from a stalled counter.
  useEffect(() => {
    notePlan({
      requested: plan.requested,
      mix: options.mix,
      seed: options.seed,
      planned: items.length,
      slots: plan.slotCount,
      distinctAssets: plan.distinctAssets,
    });
  }, [plan, items.length, options.mix, options.seed]);

  useEffect(() => resetFurnishBridge, []);

  return (
    <group position={[-center.cx, 0, -center.cz]}>
      {items.map(({ placement, spec }) => (
        <ItemBoundary key={placement.key} itemKey={placement.key}>
          {/* Per item, not one boundary for all: a shared boundary would hold
              the whole scene back until the slowest model arrived, and every
              item would pop in at once at an unpredictable moment. */}
          <Suspense fallback={null}>
            <FurnishItem placement={placement} spec={spec} />
          </Suspense>
        </ItemBoundary>
      ))}
    </group>
  );
}
