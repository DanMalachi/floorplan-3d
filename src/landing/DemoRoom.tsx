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
      <span style={microLabel({ color: B.ink3 })}>Interactive 3D — scroll to explore</span>
    </div>
  );
}

export function DemoRoom({ height = "600px" }: { height?: string }) {
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
        height,
        overflow: "hidden",
        // No border, radius, shadow or raised ground: the room is meant to read
        // as part of the page, not as a panel sitting on it.
        background: "transparent",
        // Vertical swipes belong to the PAGE, not the camera. Without this the
        // canvas swallows every touch drag and a phone visitor is trapped at
        // the hero with no way to scroll past it. See the style block below,
        // which is the half that actually does the work.
        touchAction: "pan-y",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: TOUCH_CSS }} />

      {mounted && capable && visible ? (
        <DemoStage fallback={<DemoPlaceholder />} />
      ) : (
        <DemoPlaceholder />
      )}

      {/* Edge fades.
          The horizon itself is gone — `<Viewport chrome={false}>` passes
          `groundFade` to Environment3d, which extends the shadow-catcher past
          the fog's far plane so the ground dissolves rather than ending at a
          rim. What is left is the seam between the canvas's own background and
          the page, and that cannot be matched from CSS: the composer tone-maps
          the background, so what lands on screen is not the hex the source
          names. These two gradients cover the join instead of chasing it, and
          keep working if any of those colours change. */}
      <div style={fade("top")} />
      <div style={fade("bottom")} />
    </div>
  );
}

const ROOT_CLASS = "done-demo-room";

// R3F sets `touch-action: none` on the canvas element itself, which is why the
// wrapper's own touch-action isn't enough. Inline styles can't reach a child, so
// this is the one place the marketing site needs a real stylesheet rule.
// `pan-y` hands vertical drags to the browser (the page scrolls) while
// horizontal drags still reach the camera — so on a phone the model orbits
// left/right and the page scrolls up/down, which is the trade a hero should
// make. Desktop is unaffected: mouse drag and wheel are not touch actions.
const TOUCH_CSS = `.${ROOT_CLASS} canvas { touch-action: pan-y !important; }`;

const fade = (edge: "top" | "bottom"): React.CSSProperties => ({
  position: "absolute",
  left: 0,
  right: 0,
  [edge]: 0,
  // Only as deep as the join needs now that there is no horizon to bury —
  // a heavier top fade would start dimming the model itself.
  height: edge === "top" ? "18%" : "14%",
  background: `linear-gradient(to ${edge === "top" ? "bottom" : "top"}, ${B.ground} 0%, ${B.ground} 18%, transparent 100%)`,
  pointerEvents: "none",
  zIndex: 2,
});

export default DemoRoom;
