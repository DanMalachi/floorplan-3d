"use client";

// Camera offer (P3a), Canvas side: watch the armed tool against the current
// camera angle and publish an offer when the surface it targets is unworkable
// from here. Renders nothing — the chip is a DOM overlay
// (ui/planDock/cameraOffer.tsx), because it has to sit above the dock rather
// than inside the 3D scene.
//
// Lives inside the Canvas only because `controls` does. The rules are all in
// camera/offerPolicy.ts and camera/targetPlane.ts, where they are tested
// headlessly; this file is the wiring that connects them to a live camera.

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { CameraControls } from "@react-three/drei";
import { useSceneStore } from "@/store/useSceneStore";
import { armedPlane } from "./camera/armedTarget";
import { legibility } from "./camera/targetPlane";
import { offerVisible, remedyFor, remedyResolves } from "./camera/offerPolicy";
import { setCameraOffer } from "@/ui/planDock/cameraOffer";

export function CameraOfferRig() {
  const controls = useThree((s) => s.controls) as CameraControls | null;
  const visibleRef = useRef(false);
  const dismissedRef = useRef(false);
  // Last published identity, so the per-frame loop only pushes through the
  // pub/sub when something actually changed — this runs every frame and must
  // not re-render the overlay 60 times a second.
  const publishedRef = useRef<string | null>(null);
  const [, force] = useState(0);

  const plane = useSceneStore((s) => armedPlane(s));
  const ceilingsShown = useSceneStore((s) => s.showCeilings && s.wallMode === "full");
  const setShowCeilings = useSceneStore((s) => s.setShowCeilings);

  // A dismissal belongs to the arming that produced it and expires with it.
  // Anything longer would be the app quietly learning from the user, which is
  // the behaviour this whole design refuses.
  useEffect(() => {
    dismissedRef.current = false;
    visibleRef.current = false;
    force((n) => n + 1);
  }, [plane]);

  useEffect(() => () => setCameraOffer(null), []);

  useFrame(() => {
    if (!controls) return;

    const ctx = { polarRad: controls.polarAngle, ceilingsShown };
    const verdict: ReturnType<typeof legibility> = plane
      ? legibility(plane, ctx.polarRad, { ceilingsHidden: !ceilingsShown })
      : "clear";

    const next = offerVisible(visibleRef.current, {
      plane,
      legibility: verdict,
      dismissed: dismissedRef.current,
    });
    visibleRef.current = next;

    if (!next || !plane) {
      if (publishedRef.current !== null) {
        publishedRef.current = null;
        setCameraOffer(null);
      }
      return;
    }

    const remedy = remedyFor(plane, ctx);
    // Never show an offer that would not actually fix the problem — a
    // suggestion that visibly fails costs more trust than one never made.
    if (!remedyResolves(plane, remedy, ctx)) {
      if (publishedRef.current !== null) {
        publishedRef.current = null;
        setCameraOffer(null);
      }
      return;
    }

    const identity = `${plane}|${remedy.label}|${remedy.reason}`;
    if (identity === publishedRef.current) return;
    publishedRef.current = identity;

    setCameraOffer({
      label: remedy.label,
      reason: remedy.reason,
      accept: () => {
        // Only ever presses buttons the user already has: an orbit they could
        // have performed, and the Ceiling toggle in WallModeToggle. Both are
        // visible afterwards, so accepting teaches where the control is rather
        // than handing over an outcome they cannot reproduce.
        if (remedy.hideCeilings) setShowCeilings(false);
        if (remedy.polarDeg !== null) {
          controls.rotatePolarTo(THREE.MathUtils.degToRad(remedy.polarDeg), true);
        }
        // `remedy.faceTargetWall` is deliberately NOT applied yet. Raising the
        // polar angle already makes every wall legible (that is what
        // remedyResolves checks), and turning to face a SPECIFIC wall needs a
        // rule for which wall the user meant — nearest to the orbit target is
        // the obvious candidate and it is a guess, so it wants its own round of
        // design rather than being smuggled in here. Spinning the camera to the
        // wrong wall would be worse than not spinning it at all.
        // Withdraw immediately rather than waiting for the transition to carry
        // legibility over the line — the offer has been taken, and a chip that
        // lingers through its own animation reads as a control that did not work.
        dismissedRef.current = true;
        visibleRef.current = false;
        publishedRef.current = null;
        setCameraOffer(null);
      },
      dismiss: () => {
        dismissedRef.current = true;
        visibleRef.current = false;
        publishedRef.current = null;
        setCameraOffer(null);
      },
    });
  });

  return null;
}
