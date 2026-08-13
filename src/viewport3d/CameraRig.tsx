"use client";

/** Orbit-camera behaviour, in one place.
 *
 *  Replaces the `enabled={!toolBusy}` gate this used to live behind in
 *  Viewport.tsx. `enabled` is all-or-nothing — it gates orbit, pan, dolly,
 *  wheel AND touch together — so arming any tool left the camera with zero
 *  available inputs and no recovery move, not even a wheel-out. Phase 3's
 *  rugs turned that from an edge case into the resting state: a 2x3 m rug is
 *  a floor-sized pick target lying exactly where the cursor rests (noCollide
 *  exempts it from placement collision, not from raycasting), so
 *  `hover3d !== null` — one of the gate's six triggers — became true almost
 *  all the time.
 *
 *  The rule that replaces it: LEFT acts on the world, RIGHT orbits, MIDDLE
 *  pans, WHEEL zooms — and only LEFT is ever taken away. Orbit, pan and zoom
 *  are never suppressed by anything, so there is no viewport state with a
 *  dead camera. That is the arrangement The Sims 4 uses in Build mode, and
 *  the reason SketchUp/Blender/Fusion put navigation on a button the active
 *  tool never claims: navigation is an ambient layer, not a tool competing
 *  with the others.
 *
 *  `enabled` keeps exactly one legitimate use — walkthrough, which replaces
 *  the camera wholesale rather than restricting it.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { CameraControlsImpl } from "@react-three/drei";
import { useSceneStore, type AppMode, type PickRef } from "@/store/useSceneStore";

const ACTION = CameraControlsImpl.ACTION;

/** Tunables for the orbit camera. Single source of truth — no magic numbers
 *  scattered through the rig, the same arrangement walkthrough/config.ts uses
 *  for the first-person camera. Every distance is derived from the plan's own
 *  bounds so the envelope resizes with the model instead of being a fixed
 *  guess that only suits one house. */
export const CAMERA = {
  /** Closest dolly, meters. Close enough to read a cabinet handle; below this
   *  a 50 deg FOV camera is already inside the furniture, and eye level is
   *  walkthrough's job, not orbit's. */
  minDistanceM: 0.45,
  /** Furthest dolly = max(span * mul, floor). The floor stops a one-room plan
   *  from getting a claustrophobic ceiling. */
  maxDistanceSpanMul: 3.5,
  maxDistanceFloorM: 18,
  /** Polar angle is measured from +Y, so this is the LOWEST the camera may
   *  swing. 85 deg keeps it 5 deg clear of the floor plane: enough to refuse
   *  the under-the-floor view (unlit backfaces) while still allowing a
   *  near-eye-level hero shot before the floor goes edge-on and vanishes. */
  maxPolarDeg: 85,
  /** Top wall mode is a camera state, not only a wall-render toggle — this is
   *  what makes Full/Cutaway/Top read as three ways of looking at the house
   *  rather than a render switch sitting next to an unrelated camera. */
  topModeMaxPolarDeg: 28,
  /** Meters of slack around the footprint that the orbit TARGET may be
   *  trucked to. The camera itself is deliberately not enclosed (see
   *  boundaryEnclosesCamera below), so viewing the house from outside still
   *  works — it is the point of interest that stays leashed to the house. */
  panMarginM: 4,
  /** Ceiling for the target's height inside the boundary box. */
  panCeilingM: 3,
  /** 0 = hard stop, 1 = immovable. A rubbery edge you feel rather than hit. */
  boundaryFriction: 0.8,
  /** camera.far = maxDistance * this. Derived from the dolly limit rather
   *  than the load-time span (which is what FitCamera uses for its opening
   *  shot) so the two can never disagree and clip the scene at full zoom-out. */
  farMul: 4,

  // --- framing (P2 T1/T2/T3): every fitToBox call site shares these --------
  /** Meters of clearance added on every side of a fitToBox target. Zero
   *  padding puts the object's silhouette exactly at the frame edge, which
   *  reads as a crop, not a "frame". One constant so a room click, a
   *  double-click and the F/Home keys all land with the same comfortable
   *  margin instead of each inventing its own. */
  framePaddingM: 0.5,

  // --- keyboard channel (P2 T3) --------------------------------------------
  /** WASD/arrow truck speed, as a fraction of the CURRENT camera distance
   *  moved per second rather than a flat m/s — mouse-drag truck already
   *  scales with zoom (the same drag covers more ground zoomed out), and a
   *  flat speed would crawl across a whole house zoomed out or overshoot a
   *  close-up zoomed in. */
  kbTruckSpeedPerS: 1.1,
  /** Q/E azimuth-orbit speed, degrees per second held. */
  kbOrbitSpeedDegS: 90,
} as const;

/** Does hovering this pick mean a left press would START A DRAG rather than
 *  orbit? Only kinds whose layer actually has a pointerdown drag handler, and
 *  only in the mode that handler runs in:
 *
 *    furnish -> furniture (FurnitureLayer), fixture (FixtureLayer)
 *    build   -> wall, opening (WallMesh)
 *
 *  `room` and `stair` are deliberately absent: FloorMesh and StairMesh are
 *  click-to-select only. Counting them would cost the left button across every
 *  floor in the plan — the same over-broad mistake, one layer down. */
function hoverClaimsLeft(appMode: AppMode, kind: PickRef["kind"] | undefined): boolean {
  if (!kind) return false;
  if (appMode === "furnish") return kind === "furniture" || kind === "fixture";
  if (appMode === "build") return kind === "wall" || kind === "opening";
  return false;
}

export function CameraRig({ span, halfX, halfZ }: {
  span: number;
  halfX: number;
  halfZ: number;
}) {
  const controls = useThree((s) => s.controls) as CameraControlsImpl | null;
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const wallMode = useSceneStore((s) => s.wallMode);
  // Stable object identities R3F reuses for the life of the canvas — safe to
  // select without triggering extra re-renders, and what T4 below reuses to
  // find whatever surface is under the cursor at orbit-drag start.
  const raycaster = useThree((s) => s.raycaster);
  const pointer = useThree((s) => s.pointer);
  const rootScene = useThree((s) => s.scene);

  /** Every clause here was already in Viewport.tsx's `toolBusy`. What changed
   *  is the lever: it now costs the LEFT BUTTON, not the camera.
   *
   *  Hovering a draggable item has to claim left BEFORE the press, not once
   *  the gesture state lands: camera-controls listens on the canvas DOM
   *  element, so it sees the same pointerdown the item's drag handler does,
   *  and React state arriving a render later is a render too late. Hover is
   *  set on pointer MOVE — you must travel onto an item to press it — so by
   *  the time the press arrives this value is already correct. That timing is
   *  why the hover trigger was right all along; only `enabled` was wrong.
   *
   *  camera-controls resolves the action once, at pointerdown, and keeps it in
   *  its own state for the rest of the drag, so a hover that clears mid-drag
   *  can never flip an in-flight item drag into an orbit. */
  const leftClaimed = useSceneStore((s) =>
    (s.gestureBase !== null && !s.doorGestureActive) ||
    (s.appMode === "build" && s.buildTool !== "select") ||
    s.placing !== null ||
    s.placingRun !== null ||
    s.placingCounter !== null ||
    s.brush !== null ||
    s.eyedropper ||
    hoverClaimsLeft(s.appMode, s.hover3d?.kind),
  );

  /** Touch has no hover to gate on, so one finger is claimed by the whole
   *  editing mode instead: one finger acts, two fingers navigate. Without
   *  this, a one-finger drag on a rug both drags the rug and orbits — the
   *  same bug the mouse had, unfixed, on a second input device. */
  const touchClaimed = useSceneStore((s) => s.appMode === "build" || s.appMode === "furnish");

  // --- button map: the part that never changes -----------------------------
  useEffect(() => {
    if (!controls) return;
    controls.mouseButtons.right = ACTION.ROTATE; // orbit — never suppressed
    controls.mouseButtons.middle = ACTION.TRUCK; // pan  — never suppressed
    controls.mouseButtons.wheel = ACTION.DOLLY; // zoom — never suppressed
    controls.touches.two = ACTION.TOUCH_DOLLY_TRUCK;
    controls.touches.three = ACTION.TOUCH_TRUCK;
    // Zoom and orbit go where you are pointing, the way Fusion, BricsCAD and
    // SketchUp all behave. Without it, inspecting a corner is a
    // zoom-pan-zoom-pan grind instead of one gesture.
    controls.dollyToCursor = true;
    // A real minDistance is the floor for approach; pushing the target on
    // overshoot instead would fight the boundary below.
    controls.infinityDolly = false;
  }, [controls]);

  // --- the part that is claimed contextually -------------------------------
  useEffect(() => {
    if (!controls) return;
    controls.mouseButtons.left = leftClaimed ? ACTION.NONE : ACTION.ROTATE;
  }, [controls, leftClaimed]);

  useEffect(() => {
    if (!controls) return;
    controls.touches.one = touchClaimed ? ACTION.NONE : ACTION.TOUCH_ROTATE;
  }, [controls, touchClaimed]);

  // --- the envelope --------------------------------------------------------
  useEffect(() => {
    if (!controls) return;
    const maxDistance = Math.max(span * CAMERA.maxDistanceSpanMul, CAMERA.maxDistanceFloorM);
    controls.minDistance = CAMERA.minDistanceM;
    controls.maxDistance = maxDistance;

    // Leash the TARGET to the footprint plus a margin; leave the camera free
    // so the house can still be viewed from outside it.
    controls.boundaryFriction = CAMERA.boundaryFriction;
    controls.boundaryEnclosesCamera = false;
    const m = CAMERA.panMarginM;
    controls.setBoundary(
      new THREE.Box3(
        new THREE.Vector3(-(halfX + m), 0, -(halfZ + m)),
        new THREE.Vector3(halfX + m, CAMERA.panCeilingM, halfZ + m),
      ),
    );

    // Derive far from the dolly limit, not from the opening shot's distance,
    // so full zoom-out can never clip. Tighter than FitCamera's span * 20,
    // which also buys back depth precision.
    camera.far = maxDistance * CAMERA.farMul;
    camera.updateProjectionMatrix();
  }, [controls, camera, span, halfX, halfZ]);

  // Top view is a camera state. Clamping here (rather than only restyling the
  // walls) is what stops "Top" from being a render toggle the camera ignores.
  useEffect(() => {
    if (!controls) return;
    const deg = wallMode === "top" ? CAMERA.topModeMaxPolarDeg : CAMERA.maxPolarDeg;
    controls.maxPolarAngle = THREE.MathUtils.degToRad(deg);
  }, [controls, wallMode]);

  // --- Law 3, the orbit half: pivot on whatever is under the cursor --------
  // Recorded every frame (cheap: one boolean read) so the controlstart
  // handler below can tell "the camera was already gliding from a fitToBox/
  // setLookAt call a moment ago" apart from "this drag is the thing that just
  // started" — both read `controls.active === true` AT controlstart itself,
  // since `_state` is set before the event dispatches, so only the PRIOR
  // frame's value distinguishes them.
  const wasActiveRef = useRef(false);
  useFrame(() => {
    if (controls) wasActiveRef.current = controls.active;
  });

  useEffect(() => {
    if (!controls) return;
    const onControlStart = () => {
      // Only an actual orbit gesture should move the pivot — a truck/dolly
      // starting shouldn't touch it.
      const rotating = (controls.currentAction & (ACTION.ROTATE | ACTION.TOUCH_ROTATE)) !== 0;
      if (!rotating) return;
      // setOrbitPoint's own doc: "must not run during an animation" — it
      // fixes the camera's current position immediately, so calling it while
      // still gliding toward a fitToBox/setLookAt target would fix the wrong
      // spot and fight that transition.
      if (wasActiveRef.current) return;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(rootScene.children, true)[0];
      if (!hit) return; // pointer over empty sky/void — leave the existing pivot
      controls.setOrbitPoint(hit.point.x, hit.point.y, hit.point.z);
    };
    controls.addEventListener("controlstart", onControlStart);
    return () => controls.removeEventListener("controlstart", onControlStart);
  }, [controls, raycaster, pointer, camera, rootScene]);

  return null;
}
