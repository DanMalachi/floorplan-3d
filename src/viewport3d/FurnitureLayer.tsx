"use client";

import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { clone as cloneWithSkeletons } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import type { FurnitureItem, Scene } from "@/schema/scene";
import { useSceneStore } from "@/store/useSceneStore";
import { applyShadowClass, shadowProps } from "@/render/materialClass";
import { assertKtx2TexturesResolved, useKtx2ExtendLoader } from "@/render/ktx2";
import { CATALOG_BY_ID } from "@/furniture/catalog";
import { specOf } from "@/furniture/spec";
import { placementCollides, snapToWall, wallOBBs, type OBB } from "./collision";
import { GRID } from "./snap";
import { ACCENT } from "./WallMesh";
import { sampleFurniture } from "@/decorate/eyedropper";
import { ParametricModel } from "@/parametric/ParametricModel";
import { isWallItem, kitchenOwnsPlacement } from "@/parametric/kitchenAttach";
import { grabHeight, rayToPlanAt } from "./dragPlane";
import { rayToWall, wallPose } from "@/parametric/wallRay";

const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function rayToPlan(
  e: ThreeEvent<PointerEvent> | ThreeEvent<MouseEvent>,
  offset: { cx: number; cz: number },
  /** World height the gesture runs at. Defaults to the floor, which is right
   *  for a placement ghost (it lands ON the floor) and wrong for a drag (see
   *  dragPlane.ts) — so drags pass the height they grabbed at. */
  height = 0,
): { x: number; y: number } | null {
  if (height !== 0) return rayToPlanAt(e.ray, height, offset);
  const hit = new THREE.Vector3();
  if (!e.ray.intersectPlane(FLOOR_PLANE, hit)) return null;
  return { x: hit.x + offset.cx, y: hit.z + offset.cz };
}

const snap = (v: number) => Math.round(v / GRID) * GRID;

interface ModelProps {
  assetId: string;
  tint?: "red" | null;
  opacity?: number;
}

/** Clone a loaded GLTF scene and normalize it: plan bbox scaled to the catalog
 *  footprint, floored at y=0, centered. Materials are cloned per instance ONLY
 *  when this instance mutates them, so tinting/opacity still never leak into
 *  drei's shared GLTF cache — see the ownership note on the traverse below. */
function normalize(
  gltfScene: THREE.Object3D,
  footprint: { w: number; d: number } | undefined,
  tint?: "red" | null,
  opacity?: number,
  rotation?: [number, number, number],
): THREE.Group {
  // SkeletonUtils.clone, NOT Object3D.clone. `clone(true)` copies a SkinnedMesh
  // but not its Skeleton, so the copy stays bound to the ORIGINAL bones — which
  // live in drei's useGLTF cache, are never added to any scene, and so sit at the
  // world origin forever. The GPU skins by those bones, so such an item draws in
  // the middle of the model wherever it is placed, while its `matrixWorld`,
  // bounding box and raycast all correctly report the placed position. That split
  // is what made this look like a phantom: an object with "no geometry" anywhere
  // near it, that nothing could select.
  //
  // Exactly one catalog model is skinned today (the BlenderKit Electric Stove,
  // 1 of 465 GLBs), which is why it survived this long. SkeletonUtils.clone
  // clones the bone hierarchy and re-binds each SkinnedMesh to it; on an
  // unskinned model it is an ordinary deep clone.
  const clone = cloneWithSkeletons(gltfScene);
  // Stand up models authored lying down BEFORE measuring, so the bbox we center,
  // floor, and scale to the footprint is the corrected (upright) one.
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
  // Shadow behaviour comes from the declared class, not from flags set here.
  // A placement ghost is `transient`, whose policy currently still casts a
  // full-strength shadow — the known defect the class exists to make fixable in
  // one place (src/render/materialClass.ts), rather than a per-mesh oversight.
  applyShadowClass(clone, opacity !== undefined ? "transient" : "opaqueArchitecture");
  // Material ownership, and who is allowed to dispose what.
  //
  // Cloning is what makes tint/opacity safe: without it a placement ghost would
  // write its transparency straight into drei's cached GLTF materials and every
  // other placement of the same model would go see-through. But an instance with
  // neither tint nor opacity never writes to its material at all, so it can
  // reference the cached originals directly — nothing to clone, nothing to leak,
  // and repeated placements of one model keep sharing a material, which is what
  // lets three batch them by program instead of rebinding per draw.
  //
  // `ownsMaterials` records which of the two branches ran, because the caller
  // has to know what this group is allowed to free. Geometry is deliberately not
  // in that set: `Object3D.clone()` copies the graph and shares the underlying
  // BufferGeometry by reference, so it still belongs to drei's cache.
  const ownsMaterials = opacity !== undefined || tint === "red";
  if (ownsMaterials) {
    clone.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
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
  }
  wrapper.userData.ownsMaterials = ownsMaterials;
  return wrapper;
}

/** Render a specific GLB url, normalized to the asset's footprint. `draco` points
 *  useGLTF at the local decoder for Draco-compressed (IKEA) models. */
function GlbModel({ url, footprint, draco, tint, opacity, rotation }: {
  url: string;
  footprint: { w: number; d: number } | undefined;
  draco?: boolean;
  tint?: "red" | null;
  opacity?: number;
  rotation?: [number, number, number];
}) {
  // extendLoader is a no-op for any GLB that doesn't declare
  // KHR_texture_basisu (every IKEA model, and any BlenderKit model not yet
  // run through scripts/blenderkit/optimize-ktx2.ts) — see src/render/ktx2.ts.
  const ktx2ExtendLoader = useKtx2ExtendLoader();
  const gltf = useGLTF(url, draco ? "/draco/" : false, false, ktx2ExtendLoader);
  // Throws if a KTX2 texture silently failed to transcode — see
  // assertKtx2TexturesResolved's docstring for why GLTFLoader alone won't
  // catch this. ModelBoundary below treats the throw exactly like a 404.
  assertKtx2TexturesResolved(gltf, url);
  const rotKey = rotation?.join(",");
  const obj = useMemo(
    () => normalize(gltf.scene, footprint, tint, opacity, rotation),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gltf.scene, footprint, tint, opacity, rotKey],
  );

  // Free the materials `normalize` cloned when this group is replaced.
  //
  // `tint` is in the memo's dep list and flips on every pointermove while a drag
  // is colliding, so without this each pointer event strands a whole cloned
  // material set — with its compiled program and texture bindings — on the GPU
  // for the life of the tab. That is invisible on a card with 6 GB of dedicated
  // VRAM and is not invisible on a laptop sharing memory with the OS.
  //
  // Only materials, and only when we cloned them: geometry is shared by
  // reference with drei's GLTF cache, so disposing it here would tear it out
  // from under every other placement of the same model.
  useEffect(() => {
    return () => {
      if (!obj.userData.ownsMaterials) return;
      obj.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.dispose();
      });
    };
  }, [obj]);

  return <primitive object={obj} />;
}

/** Swap to a fallback subtree if a child throws (e.g. a real model fails to load).
 *  Resets when `resetKey` changes so a different asset re-attempts its real model. */
class ModelBoundary extends Component<
  { fallback: ReactNode; resetKey: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed)
      this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Neutral stand-in for furniture whose model can't be rendered: a missing/404 GLB,
 *  or an asset dropped from the catalog since the project was saved. Sized to the known
 *  footprint (or a small default) so layouts stay legible. Never loads or throws, so it
 *  is always a safe terminal fallback — one bad item can't crash the scene. */
function PlaceholderBox({ footprint, tint, opacity }: {
  footprint?: { w: number; d: number };
  tint?: "red" | null;
  opacity?: number;
}) {
  const w = footprint?.w ?? 0.5;
  const d = footprint?.d ?? 0.5;
  const h = Math.min(w, d, 0.5);
  return (
    <mesh position={[0, h / 2, 0]} {...shadowProps(opacity !== undefined ? "transient" : "opaqueArchitecture")}>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial
        color={tint === "red" ? "#ff3b30" : "#c8c8c8"}
        transparent={opacity !== undefined}
        opacity={opacity ?? 1}
        depthWrite={opacity === undefined}
        roughness={0.9}
      />
    </mesh>
  );
}

/** A catalog item's 3D body. Renders the best available model and degrades safely:
 *  real branded GLB → CC0 proxy (non-IKEA only) → neutral placeholder box. Every
 *  candidate is wrapped in an error boundary that falls through to the next, so a
 *  missing/404 model — or an assetId no longer in the catalog — can never throw past
 *  this component and unmount the canvas. */
function AssetModel({ assetId, tint, opacity }: ModelProps) {
  const spec = CATALOG_BY_ID.get(assetId);
  const placeholder = (
    <PlaceholderBox footprint={spec?.footprint} tint={tint} opacity={opacity} />
  );
  // Unknown/removed asset (e.g. a saved project referencing an item dropped from the
  // catalog): show the placeholder rather than fetching a guaranteed-404 GLB.
  if (!spec) return placeholder;

  // Candidate models, most-preferred first. IKEA items ship a real model only — their
  // CC0 proxies were dropped in the real-model-only migration — so we must NOT fall
  // back to a /furniture/ikea:*.glb file that no longer exists on the server.
  const isIkea = assetId.startsWith("ikea:");
  const candidates: { url: string; draco?: boolean; rotation?: [number, number, number] }[] = [];
  if (spec.realModel) candidates.push({ url: spec.realModel, draco: true, rotation: spec.modelRotation });
  if (!isIkea) candidates.push({ url: `/furniture/${spec.model ?? assetId}.glb` });

  // Fold the candidates into a fallback chain terminating in the placeholder.
  let node: ReactNode = placeholder;
  for (let i = candidates.length - 1; i >= 0; i--) {
    const c = candidates[i];
    const fallback = node;
    node = (
      <ModelBoundary key={c.url} resetKey={c.url} fallback={fallback}>
        <GlbModel
          url={c.url}
          footprint={spec.footprint}
          draco={c.draco}
          tint={tint}
          opacity={opacity}
          rotation={c.rotation}
        />
      </ModelBoundary>
    );
  }
  return <>{node}</>;
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
  /** Height grabbed relative to the item's own elevation, for hung items. */
  grabE: number;
  start: { x: number; y: number }; // plan point at pointer-down (dead-zone check)
  startE: number; // …and its height, so a straight-up drag counts as movement
  /** World height the whole gesture runs at — where the pointer touched the
   *  item, captured once so the plane can't shift under the drag. */
  planeY: number;
  began: boolean; // gesture opened — only after the dead zone is crossed
}

/**
 * Where the pointer is, for THIS item: a hung item reads the WALL, everything
 * else reads the floor.
 *
 * A picture hangs at eye level, so the floor point under the pointer is metres
 * away from it; dragging against the floor plane made the picture slide faster
 * than the cursor and wander across the wall's centreline. `rayToWall` is the
 * same resolve the placement ghost uses, so moving a hung item and hanging it
 * in the first place now answer to the pointer identically — and the height
 * comes with it, which is what lets a drag slide art UP the wall instead of
 * only along it.
 */
function rayForItem(
  e: ThreeEvent<PointerEvent> | ThreeEvent<MouseEvent>,
  item: FurnitureItem,
  scene: Scene,
  offset: { cx: number; cz: number },
  /** World height this gesture runs at — see dragPlane.ts. A floor-standing
   *  item dragged against the FLOOR plane slides faster than the cursor for
   *  exactly the reason a picture did; this is the same fix, for the plane
   *  case rather than the wall case. */
  planeY = 0,
): { x: number; y: number; elevation?: number } | null {
  if (item.parametric && isWallItem(item)) {
    const hit = rayToWall(e.ray, scene, offset);
    // Decor moves at 1cm; a wall cabinet keeps the 10cm height grid it was
    // placed on, so nudging one sideways can't leave a row of them at four
    // different heights.
    const step = item.parametric.generator === "kitchenWall" ? 0.1 : 0.01;
    const pose = hit && wallPose(hit, scene, item.parametric.dims.d, item.parametric.dims.h, step);
    // Off every wall face (the cursor left the room, or is over furniture in
    // front of the wall) — fall through to the floor rather than freezing.
    if (pose) return { x: pose.x, y: pose.y, elevation: pose.elevation };
  }
  return rayToPlan(e, offset, planeY);
}

/** Plan-space dead zone before a press becomes a drag: a plain click (select)
 *  must never nudge the item, but select-and-drag works in ONE motion — no
 *  click-to-select-then-click-again-to-drag two-step. */
const DRAG_DEAD_ZONE_M = 0.035;

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
  const spec = specOf(item);
  const ringR = spec ? Math.max(spec.footprint.w, spec.footprint.d) / 2 + 0.12 : 0.5;

  // Placement pop: newly mounted furniture springs from 78% to full size.
  const popRef = useRef<THREE.Group>(null);
  const popDone = useRef(false);
  const invalidate = useThree((s) => s.invalidate);
  useFrame((_, dt) => {
    const g = popRef.current;
    if (!g || popDone.current) return;
    const s = THREE.MathUtils.damp(g.scale.x, 1, 11, dt);
    g.scale.setScalar(s);
    if (Math.abs(1 - s) < 1e-3) {
      g.scale.setScalar(1);
      popDone.current = true;
      return; // settled — stop asking for frames
    }
    // The pop is driven imperatively on the group, so nothing else schedules
    // the next frame under demand rendering and the item would freeze at ~85%
    // of full size. Self-terminating: the branch above stops the chain.
    invalidate();
  });

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    const s = useSceneStore.getState();
    if (s.appMode !== "furnish" || s.placing) return; // furniture edits in Furnish only
    e.stopPropagation();
    if (sampleFurniture(item)) return; // eyedropper (Plan Dock P7): sample instead of select
    s.setSel3d({ kind: "furniture", id: item.id });
    // Select AND arm the drag in one press. The gesture itself only opens
    // once the pointer leaves the dead zone, so a plain click never nudges.
    // Where the ray actually met the item, in world height. Everything after
    // this runs on the horizontal plane through that point, so the spot you
    // took hold of stays under the cursor for the whole drag.
    const planeY = grabHeight(e.point, item.elevation ?? 0);
    const p = rayForItem(e, item, s.scene, offset, planeY);
    if (!p) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      base: s.scene,
      walls: wallOBBs(s.scene),
      planeY,
      grab: { dx: p.x - item.x, dy: p.y - item.y },
      // Grab the picture where you took hold of it: without this it jumps so
      // its centre is under the cursor the moment the drag opens.
      grabE: (p.elevation ?? 0) - (item.elevation ?? 0),
      start: p,
      startE: p.elevation ?? 0,
      began: false,
    };
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    e.stopPropagation();
    const p = rayForItem(e, item, d.base, offset, d.planeY);
    if (!p) return;
    if (!d.began) {
      // Height counts as movement. Measured in plan alone, dragging a picture
      // straight UP the wall never left the dead zone, so it could only ever
      // slide sideways.
      const rise = p.elevation !== undefined ? p.elevation - d.startE : 0;
      if (Math.hypot(p.x - d.start.x, p.y - d.start.y, rise) < DRAG_DEAD_ZONE_M) return;
      d.began = true;
      useSceneStore.getState().beginGesture();
    }
    let x = p.x - d.grab.dx;
    let y = p.y - d.grab.dy;
    // A hung item rides the wall in all three axes; everything else keeps
    // whatever height it had.
    const elevation = p.elevation !== undefined ? Math.max(0.05, p.elevation - d.grabE) : item.elevation;
    let rotation = item.rotation;
    // Kitchen pieces are placed by ONE authority — applyKitchenGesture, which
    // the store runs on the scene this handler hands it. Snapping here as well
    // put two wall magnets with different ranges, different projections and
    // different rankings in series, disagreeing about which wall and which
    // face several times a second. The raw pointer position is what that
    // authority wants; grid-rounding it here would also quantise on the WORLD
    // axes, which fight the wall's own grid the moment a wall isn't square.
    if (!e.shiftKey && !kitchenOwnsPlacement(item)) {
      const snapped = snapToWall({ assetId: item.assetId, parametric: item.parametric, x, y }, d.base);
      if (snapped) {
        x = snapped.x;
        y = snapped.y;
        rotation = snapped.rotation;
      } else {
        x = snap(x);
        y = snap(y);
      }
    }
    const candidate = { ...item, x, y, rotation, ...(elevation !== undefined ? { elevation } : {}) };
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
    // A click inside the dead zone never opened a gesture — nothing to commit.
    if (d.began) useSceneStore.getState().endGesture("Move furniture");
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
          {item.parametric
            ? <ParametricModel spec={item.parametric} tint={colliding ? "red" : null} />
            : <AssetModel assetId={item.assetId} tint={colliding ? "red" : null} />}
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
  // `placing` is shared with FixtureLayer's own ghost (kind-less {assetId,
  // rotation}) — without this check, picking a fixture from the Lighting
  // catalog also triggers this ghost, which resolves the unknown assetId to
  // a floor-level PlaceholderBox alongside the real ceiling-height ghost.
  if (!placing || (!placing.parametric && !CATALOG_BY_ID.has(placing.assetId))) return null;

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const p = rayToPlan(e, offset);
    if (!p) return;
    const s = useSceneStore.getState();
    let x = p.x;
    let y = p.y;
    let rotation = s.placing?.rotation ?? 0;
    if (!e.shiftKey) {
      const snapped = snapToWall({ assetId: placing.assetId, parametric: placing.parametric, x, y }, s.scene);
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
      { id: "__ghost__", assetId: placing.assetId, parametric: placing.parametric, x, y, rotation },
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
      {/* Elevation through specOf, not CATALOG_BY_ID: a parametric item has no
          catalog entry, so the ghost drew at floor level while placeFurniture
          (which does use specOf) put the real item at its mounting height —
          preview and placement disagreed by the whole elevation. */}
      {pos && (
        <group
          position={[pos.x, specOf(placing)?.defaultElevation ?? 0, pos.y]}
          rotation={[0, yawOf(state.rotation), 0]}
        >
          <Suspense fallback={null}>
            {placing.parametric ? (
              <ParametricModel spec={placing.parametric} opacity={0.55} tint={state.colliding ? "red" : null} />
            ) : (
              <AssetModel assetId={placing.assetId} opacity={0.55} tint={state.colliding ? "red" : null} />
            )}
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
