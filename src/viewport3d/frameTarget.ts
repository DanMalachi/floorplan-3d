// Framing a target — shared by room focus (CameraFocusRig), double-click
// (CameraDoubleClickRig) and the F / Home keys (CameraKeyboardRig), so all
// four entry points land the same way instead of each inventing its own.
//
// NOT `fitToBox`, which looks like the obvious primitive for this and is not.
// Its first act is to throw the camera's angle away (camera-controls 3.1.2,
// dist/camera-controls.module.js:1627):
//
//     // round to closest axis ( forward | backward | right | left | top | bottom )
//     const theta = roundToStep( this._sphericalEnd.theta, PI_HALF );
//     const phi   = roundToStep( this._sphericalEnd.phi,   PI_HALF );
//     promises.push( this.rotateTo( theta, phi, enableTransition ) );
//
// So it is a "square-on elevation / plan view" primitive, not a "frame this
// thing" one — and it runs no occlusion test whatsoever, being pure
// box-vs-frustum math. Together those put the camera inside or behind a wall
// routinely: with P0's 85 deg polar clamp in force, fitToBox's 90 deg phi snap
// resolves to exactly 85 deg, which is how framing a sofa produced a
// full-frame shot of plaster.
//
// `fitToSphere` is `moveTo` + `dollyTo` and never touches theta/phi, so the
// user keeps the oblique three-quarter view they were already reading the room
// in. That is also what framing SHOULD do — Law 5's "moves, not cuts" is about
// not losing the user's place, and silently rotating them to a plan view loses
// it as thoroughly as a cut would. It is what CameraFocusRig's original
// comment asked for before any of this existed: "keep the camera's current
// distance/angle feel".

import * as THREE from "three";
import type { CameraControls } from "@react-three/drei";
import { CAMERA } from "./CameraRig";

const _sphere = new THREE.Sphere();
const _box = new THREE.Box3();

/** Frame a world-space box, keeping the camera's current angle.
 *
 *  Padding is applied to the RADIUS rather than per side: fitToSphere takes no
 *  padding option, and inflating the bounding sphere is the same intent in the
 *  units it does accept. The sphere circumscribes the box, so framing is
 *  already slightly generous by construction — which is the right way to be
 *  wrong for a "show me this" command. */
export function frameBox(controls: CameraControls, box: THREE.Box3): void {
  if (box.isEmpty()) return;
  box.getBoundingSphere(_sphere);
  _sphere.radius += CAMERA.framePaddingM;
  controls.fitToSphere(_sphere, true);
}

/** Frame a rendered object by its real drawn bounds. */
export function frameObject(controls: CameraControls, obj: THREE.Object3D): void {
  frameBox(controls, _box.setFromObject(obj));
}
