"use client";

// Keyboard camera channel (P2 T3): WASD/arrows truck, Q/E orbit azimuth, T
// toggles top view, F frames the selection, Home frames the whole house.
//
// This is the load-bearing task of the phase, not a nice-to-have: it is a
// channel the pointer can never steal (CameraRig.tsx's LEFT-button
// arbitration only ever costs a mouse button, never this one), and it closes
// the trackpad gap P0 opened by moving pan onto the middle button — a
// trackpad has no middle button, but it has a keyboard.

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { CameraControls } from "@react-three/drei";
import { useSceneStore, type WallViewMode } from "@/store/useSceneStore";
import { WALL_HEIGHT } from "@/schema/constants";
import { CAMERA } from "./CameraRig";
import { findPickObject3D } from "./pickObject3D";

// e.code (physical key), not e.key — same reason Viewport.tsx's onKeyDown
// gives: a Hebrew/Russian/... layout types a different character on the same
// physical key, and e.key matching would dead-key these shortcuts for them.
const TRUCK_KEYS: Record<string, "fwd" | "back" | "left" | "right"> = {
  KeyW: "fwd", ArrowUp: "fwd",
  KeyS: "back", ArrowDown: "back",
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right",
};
const ORBIT_KEYS: Record<string, "left" | "right"> = {
  KeyQ: "left",
  KeyE: "right",
};

const FRAME_PADDING = {
  paddingLeft: CAMERA.framePaddingM,
  paddingRight: CAMERA.framePaddingM,
  paddingTop: CAMERA.framePaddingM,
  paddingBottom: CAMERA.framePaddingM,
};

/** Ignore the shortcut while the user is typing, or while walkthrough mode
 *  owns WASD for actual walking (this channel steps aside rather than
 *  fighting it for the same keys). */
function shouldIgnore(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return true;
  const s = useSceneStore.getState();
  return s.walkthroughActive || s.appMode === "trace";
}

export function CameraKeyboardRig({ halfX, halfZ }: { halfX: number; halfZ: number }) {
  const controls = useThree((s) => s.controls) as CameraControls | null;
  const rootScene = useThree((s) => s.scene);
  const heldRef = useRef({ fwd: false, back: false, left: false, right: false, orbitLeft: false, orbitRight: false });
  // What "T" restores when toggling back OUT of top view — top itself is
  // never a valid "previous" mode to restore into.
  const lastWallModeRef = useRef<WallViewMode>("full");

  // Held-key truck/orbit: keydown/keyup pairs tracked in a ref, applied every
  // frame in useFrame below — same pattern WalkthroughMode uses for WASD.
  useEffect(() => {
    const held = heldRef.current;
    const setKey = (e: KeyboardEvent, down: boolean) => {
      if (shouldIgnore(e)) return;
      const truck = TRUCK_KEYS[e.code];
      if (truck) {
        held[truck] = down;
        e.preventDefault(); // arrows must not scroll the page
        return;
      }
      const orbit = ORBIT_KEYS[e.code];
      if (orbit) held[orbit === "left" ? "orbitLeft" : "orbitRight"] = down;
    };
    const onKeyDown = (e: KeyboardEvent) => setKey(e, true);
    const onKeyUp = (e: KeyboardEvent) => setKey(e, false);
    // A key held down when focus/window is lost (Alt-tab etc.) never gets
    // its keyup — without this the camera would truck forever in one
    // direction, same failure mode WalkthroughMode's own blur handler guards.
    const onBlur = () => {
      held.fwd = held.back = held.left = held.right = held.orbitLeft = held.orbitRight = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // One-shot actions: T / F / Home. Edge-triggered on keydown, separate from
  // the held-key loop above — holding F down shouldn't re-fire a fitToBox
  // transition every frame.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnore(e)) return;
      if (!controls) return;
      const s = useSceneStore.getState();
      if (e.code === "KeyT" && !e.ctrlKey && !e.metaKey) {
        if (s.wallMode === "top") {
          s.setWallMode(lastWallModeRef.current);
        } else {
          lastWallModeRef.current = s.wallMode;
          s.setWallMode("top");
        }
      } else if (e.code === "KeyF") {
        if (!s.sel3d) return;
        const obj = findPickObject3D(rootScene, s.sel3d);
        if (!obj) return;
        controls.fitToBox(obj, true, FRAME_PADDING);
      } else if (e.code === "Home") {
        const box = new THREE.Box3(
          new THREE.Vector3(-halfX, 0, -halfZ),
          new THREE.Vector3(halfX, WALL_HEIGHT, halfZ),
        );
        controls.fitToBox(box, true, FRAME_PADDING);
      } else {
        return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [controls, rootScene, halfX, halfZ]);

  useFrame((_state, rawDelta) => {
    if (!controls) return;
    const delta = Math.min(rawDelta, 0.1); // clamp huge tab-away/lag spikes
    const held = heldRef.current;
    if (!held.fwd && !held.back && !held.left && !held.right && !held.orbitLeft && !held.orbitRight) return;

    const truckStep = controls.distance * CAMERA.kbTruckSpeedPerS * delta;
    if (held.fwd) controls.forward(truckStep);
    if (held.back) controls.forward(-truckStep);
    if (held.right) controls.truck(truckStep, 0);
    if (held.left) controls.truck(-truckStep, 0);

    const orbitStep = THREE.MathUtils.degToRad(CAMERA.kbOrbitSpeedDegS) * delta;
    if (held.orbitRight) controls.rotate(orbitStep, 0);
    if (held.orbitLeft) controls.rotate(-orbitStep, 0);
  });

  return null;
}
