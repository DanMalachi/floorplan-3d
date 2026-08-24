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
 *  pans, WHEEL zooms — and the camera buttons are never suppressed by
 *  anything, so there is no viewport state with a dead camera. That is the
 *  arrangement The Sims 4 uses in Build mode, and the reason
 *  SketchUp/Blender/Fusion put navigation on a button the active tool never
 *  claims: navigation is an ambient layer, not a tool competing with the
 *  others.
 *
 *  A first pass at this let LEFT orbit too whenever nothing was hovered or
 *  armed, keeping a contextual arbitration to decide when. That was wrong in
 *  use: left and right did the same job most of the time, and a button whose
 *  meaning depends on what happens to be under the cursor is precisely what
 *  Law 2 forbids. Left is now never a camera button anywhere, and the
 *  arbitration is gone with it.
 *
 *  `enabled` keeps exactly one legitimate use — walkthrough, which replaces
 *  the camera wholesale rather than restricting it.
 */

import { useEffect } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { CameraControlsImpl } from "@react-three/drei";
import { useSceneStore } from "@/store/useSceneStore";

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
  /** Vertical room for the orbit target inside the boundary box. Deliberately
   *  well clear of a storey height in both directions: `truck` moves the
   *  target along the camera's up vector, so ordinary panning has a large
   *  vertical component, and a tight ceiling here turns every pan into a fight
   *  with the boundary. The XZ leash is what actually keeps the house
   *  findable; these two only stop the target running away to nowhere. */
  panCeilingM: 14,
  panBelowM: 3,
  /** camera.far = maxDistance * this. Derived from the dolly limit rather
   *  than the load-time span (which is what FitCamera uses for its opening
   *  shot) so the two can never disagree and clip the scene at full zoom-out. */
  farMul: 4,

  // --- framing (P2 T1/T2/T3): every framing call site shares this ----------
  /** Meters of clearance added to the framed target's bounding-sphere RADIUS.
   *  Zero padding puts the silhouette exactly at the frame edge, which reads
   *  as a crop, not a "frame". One constant so a room click, a double-click
   *  and the F/Home keys all land with the same comfortable margin instead of
   *  each inventing its own. Applied to the radius rather than per-side
   *  because framing goes through `fitToSphere`, which takes no padding
   *  option — see frameTarget.ts for why it is not `fitToBox`. */
  framePaddingM: 0.5,

  // --- keyboard channel (P2 T3) --------------------------------------------
  /** WASD/arrow truck speed, as a fraction of the CURRENT camera distance
   *  moved per second rather than a flat m/s — mouse-drag truck already
   *  scales with zoom (the same drag covers more ground zoomed out), and a
   *  flat speed would crawl across a whole house zoomed out or overshoot a
   *  close-up zoomed in. */
  kbTruckSpeedPerS: 1.1,
  /** Comma/period azimuth-orbit speed, degrees per second held. */
  kbOrbitSpeedDegS: 90,
} as const;

export function CameraRig({ span, halfX, halfZ }: {
  span: number;
  halfX: number;
  halfZ: number;
}) {
  const controls = useThree((s) => s.controls) as CameraControlsImpl | null;
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const wallMode = useSceneStore((s) => s.wallMode);

  /** Touch has no hover to gate on, so one finger is claimed by the whole
   *  editing mode instead: one finger acts, two fingers navigate. Without
   *  this, a one-finger drag on a rug both drags the rug and orbits — the
   *  same bug the mouse had, unfixed, on a second input device. */
  const touchClaimed = useSceneStore((s) => s.appMode === "build" || s.appMode === "furnish");

  // --- button map: the part that never changes -----------------------------
  useEffect(() => {
    if (!controls) return;
    // LEFT IS NEVER A CAMERA BUTTON. It used to orbit whenever nothing was
    // hovered or armed, which meant left and right did the same job most of
    // the time — and a button whose meaning depends on what happens to be
    // under the cursor is exactly what Law 2 forbids. One button, one meaning,
    // everywhere: left acts on the world and only on the world. That also
    // retires the whole contextual-claim mechanism, since there is no longer
    // anything to claim, and with it the hover-timing subtlety that mechanism
    // existed to handle.
    //
    // Sims 4 Build mode behaves the same way — left-drag never orbits there
    // either — so a dead left-drag over empty floor is the convention, not an
    // oversight.
    controls.mouseButtons.left = ACTION.NONE;
    controls.mouseButtons.right = ACTION.ROTATE; // orbit — never suppressed
    controls.mouseButtons.middle = ACTION.TRUCK; // pan  — never suppressed
    controls.mouseButtons.wheel = ACTION.DOLLY; // zoom — never suppressed
    controls.touches.two = ACTION.TOUCH_DOLLY_TRUCK;
    controls.touches.three = ACTION.TOUCH_TRUCK;
    // ZOOM goes where you are pointing, the way Fusion, BricsCAD and SketchUp
    // all behave. Without it, inspecting a corner is a zoom-pan-zoom-pan grind
    // instead of one gesture. ORBIT deliberately does NOT — see the note where
    // setOrbitPoint used to be called.
    controls.dollyToCursor = true;
    // A real minDistance is the floor for approach; pushing the target on
    // overshoot instead would fight the boundary below.
    controls.infinityDolly = false;
  }, [controls]);

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
    //
    // friction MUST stay 0. camera-controls' friction branch divides by
    // `offset.dot(deltaClampedTarget)` (dist/camera-controls.module.js:2429),
    // and that dot product goes to zero whenever the pan slides ALONG a
    // boundary face instead of into it — which is the common case, not a
    // corner case. The factor explodes, the target is flung to infinity, and
    // the viewport is unrecoverable without a reload. It showed up first as
    // panning going slow and uneven (the denominator shrinking) and then as
    // being shot into space (it reaching zero). `friction === 0` takes a
    // different branch entirely, with no division in it: a clean projection
    // back onto the boundary.
    //
    // So the edge is a hard stop rather than the rubbery one originally
    // wanted. A rubbery edge is a nicer idea sitting on an unstable code path.
    controls.boundaryFriction = 0;
    controls.boundaryEnclosesCamera = false;
    const m = CAMERA.panMarginM;
    // Generous vertically. The box used to stop at 3 m, but `truck` moves the
    // target along the camera's own up vector, which at any normal orbit angle
    // has a large world-Y component — so ordinary panning drove the target
    // into the ceiling face constantly, making "sliding along a boundary" the
    // normal case and the instability above a routine occurrence rather than
    // a rarity. The vertical limits exist only to stop the target running away
    // to nowhere; the XZ leash is the one doing the real work.
    controls.setBoundary(
      new THREE.Box3(
        new THREE.Vector3(-(halfX + m), -CAMERA.panBelowM, -(halfZ + m)),
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

  // --- orbit does NOT re-pivot on the cursor -------------------------------
  // There used to be a `controlstart` handler here that raycast under the
  // cursor and called `setOrbitPoint`, on the theory (Law 3) that orbit should
  // pivot where you point, the way Fusion and BricsCAD document it.
  //
  // In the hand it fails. `setOrbitPoint` "will immediately fix the positions"
  // — it moves the camera to preserve framing while swapping the target — so
  // every single orbit drag began with a visible jump to wherever the cursor
  // happened to be. During continuous back-and-forth orbiting that reads as
  // the camera snapping around the screen rather than turning around the model.
  //
  // The distinction worth keeping: the cursor is a good anchor for a MONOTONIC
  // gesture like a wheel zoom, where each tick moves toward a point you are
  // deliberately aiming at, and a bad one for a RECIPROCATING gesture like an
  // orbit drag, where re-anchoring on every press turns small hand movements
  // into large camera jumps. So `dollyToCursor` stays on and orbit keeps
  // pivoting on the existing target — which the F / Home / double-click
  // framing commands already put where the user asked for it.

  return null;
}
