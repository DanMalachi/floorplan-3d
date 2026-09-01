"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { B, microLabel } from "@/brand/tokens";

// -----------------------------------------------------------------------------
// The hero's interactive room — the light half.
//
// This file owns the frame, the placeholder, the capability checks and the
// scroll gate. It must NOT import the scene store, the fixtures seeder, the
// Viewport, the demo scene or anything else that reaches the 3D layer: all of
// that lives in ./DemoStage, which is only ever reached through the dynamic
// import below.
//
// That boundary is load-bearing and was arrived at by measurement, not
// caution. `useSceneStore` transitively imports `@/parametric`, whose furniture
// generators import `three` — so a single static store import here would put
// THREE.WebGLRenderer back into the marketing page's first load even though the
// canvas itself is lazily loaded. There is no error when that happens; the page
// just quietly gets megabytes heavier. See the header of ./DemoStage.tsx.
//
// What the visitor gets: a real, live render of the product — not a screenshot.
// The only static imagery anywhere here is no imagery at all; when WebGL is
// unavailable the placeholder stays, because a picture of an interaction
// pretending to be one is worse than an honest empty frame.
// -----------------------------------------------------------------------------

const DemoStage = dynamic(() => import("./DemoStage"), {
  ssr: false,
  loading: () => <DemoPlaceholder />,
});

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** The quiet, same-size stand-in shown before the canvas mounts, while it is
 *  loading, and permanently on any no-WebGL or reduced-motion browser. */
function DemoPlaceholder() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        // Transparent: the stand-in should be an absence, not a grey panel that
        // has to fade out when the canvas arrives.
        background: "transparent",
      }}
    >
      <span style={microLabel({ color: B.ink3 })}>Interactive 3D — loading the room</span>
    </div>
  );
}

/**
 * `minHeight` sizes the PLACEHOLDER and sets a floor for the stage; it is not a
 * fixed height. Once DemoStage mounts, the taller of the room and the control
 * panel decides how tall this gets (see STAGE_CSS). Handing this a hard height
 * is what clipped the panel's last row: any single value is right at one window
 * size and short at another.
 */
export function DemoRoom({ minHeight = "clamp(340px, 52vh, 560px)" }: { minHeight?: string }) {
  const [mounted, setMounted] = useState(false); // avoids an SSR/client hydration mismatch
  const [capable, setCapable] = useState(false); // WebGL present + motion not reduced
  const [visible, setVisible] = useState(false); // hero has scrolled near the viewport
  const rootRef = useRef<HTMLDivElement>(null);

  // Client-only capability check. Runs once; a browser's WebGL support and its
  // reduced-motion preference don't change mid-session.
  useEffect(() => {
    setMounted(true);
    setCapable(hasWebGL() && !prefersReducedMotion());
  }, []);

  // Fetch and mount the stage only once the hero is ~200px from the viewport,
  // so a visitor who never scrolls this far never pays for three.js at all.
  useEffect(() => {
    if (!mounted || !capable || visible) return;
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true); // no observer support — fail open rather than never show the demo
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setVisible(true);
        io.disconnect();
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mounted, capable, visible]);

  return (
    <div
      ref={rootRef}
      className={ROOT_CLASS}
      style={{
        position: "relative",
        width: "100%",
        minHeight,
        // No `overflow: hidden`. It existed to clip a full-bleed canvas, and
        // now it would crop the control panel the moment its content is taller
        // than the room beside it — which is the whole failure this layout is
        // built to make impossible.
        // No border, radius, shadow or raised ground: the room is meant to read
        // as part of the page, not as a panel sitting on it.
        background: "transparent",
      }}
    >
      {mounted && capable && visible ? (
        <DemoStage fallback={<DemoPlaceholder />} />
      ) : (
        <DemoPlaceholder />
      )}
    </div>
  );
}

const ROOT_CLASS = "done-demo-room";

// The camera is hands-off (see DemoStage.tsx) and the canvas is taken out of
// hit-testing there, so nothing in this subtree competes for a gesture any
// more. That replaced the `touch-action: pan-y` rule this wrapper used to
// carry, which only ever solved the touch half of the scroll conflict and left
// the wheel and the middle button still captured on desktop.


export default DemoRoom;
