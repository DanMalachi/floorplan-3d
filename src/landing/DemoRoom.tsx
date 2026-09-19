"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { B, microLabel } from "@/brand/tokens";
import {
  getHeroStage,
  getHeroStageServer,
  resetHeroStage,
  setHeroStage,
  subscribeHeroStage,
} from "./heroSequence";

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

/** What a screen reader is told as the sequence moves. `idle` is deliberately
 *  absent and resolves to the empty string, so the live region says nothing
 *  before the sequence starts. */
const ANNOUNCEMENT_KEY: Record<string, string> = {
  tracing: "announceTracing",
  building: "announceBuilding",
  done: "announceDone",
};

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

/** The quiet, same-size stand-in shown before the stage mounts, while it is
 *  loading, and permanently on any browser without WebGL. What replaces it is
 *  the plan, not the room — the room is what the plan turns into. */
function DemoPlaceholder() {
  const t = useTranslations("demo");
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
      <span style={microLabel({ color: B.ink3 })}>{t("loadingPlan")}</span>
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
export function DemoRoom({ minHeight = "clamp(400px, 62vh, 680px)" }: { minHeight?: string }) {
  const [mounted, setMounted] = useState(false); // avoids an SSR/client hydration mismatch
  const [capable, setCapable] = useState(false); // WebGL present
  const [reduced, setReduced] = useState(false); // the OS asked for less motion
  const [visible, setVisible] = useState(false); // hero has scrolled near the viewport
  const rootRef = useRef<HTMLDivElement>(null);

  // Client-only capability check. Runs once; a browser's WebGL support and its
  // reduced-motion preference don't change mid-session.
  //
  // Reduced motion no longer blocks the room. It used to, which meant those
  // visitors sat in front of "Interactive 3D — loading the room" that never
  // resolved — a worse outcome than the room itself, which holds perfectly
  // still for them: AutoOrbitRig's per-frame step already bails under reduced
  // motion, and DemoStage skips the trace animation entirely. What the
  // preference turns off is movement, not the product.
  useEffect(() => {
    setMounted(true);
    setCapable(hasWebGL());
    setReduced(prefersReducedMotion());
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

  const stage = useSyncExternalStore(subscribeHeroStage, getHeroStage, getHeroStageServer);
  const tHero = useTranslations("hero");

  // A client-side navigation back to the homepage must not inherit a finished
  // sequence — the section would open on a built room with no story behind it.
  useEffect(() => resetHeroStage(), []);

  // Autoplay, ONCE, when the demo is well into the screen. There is no button to
  // start it any more (the hero's "see how it's done." went with the 2026-09-19
  // redesign), so arriving is the trigger. Once only: a visitor who scrolls
  // past and back has seen it, and replaying is theirs to ask for (DemoStage's
  // toolbar). Reduced motion goes straight to the finished room.
  //
  // WCAG 2.2.2 is why DemoStage shows "Skip to the room" for as long as it runs.
  useEffect(() => {
    if (!mounted || !capable) return;
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        if (getHeroStage() === "idle") setHeroStage(reduced ? "done" : "tracing");
      },
      // Not a visibility ratio: stacked on a phone the demo can be taller than
      // the screen, and a ratio would never be reached. Fire once its top edge
      // is a third of the way up the viewport instead.
      { rootMargin: "0px 0px -33% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mounted, capable, reduced]);

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
        // `stage` and `onStage` are handed ACROSS the dynamic import rather
        // than read from ./heroSequence on the far side. DemoStage lands in its
        // own chunk, and a module imported by both chunks is instantiated once
        // per chunk — so the "singleton" was two variables, and the animation
        // sat still while the button changed its own label. See DemoStage's
        // props doc.
        <DemoStage
          fallback={<DemoPlaceholder />}
          reduced={reduced}
          stage={stage}
          onStage={setHeroStage}
        />
      ) : (
        <DemoPlaceholder />
      )}

      {/* A thirteen-second animation with no text has to say what it is doing
          to anyone not watching it. Polite, so it never interrupts. */}
      <div
        aria-live="polite"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          clipPath: "inset(50%)",
          whiteSpace: "nowrap",
        }}
      >
        {ANNOUNCEMENT_KEY[stage] ? tHero(ANNOUNCEMENT_KEY[stage]) : ""}
      </div>
    </div>
  );
}

const ROOT_CLASS = "done-demo-room";

// The camera rules live in DemoStage.tsx / AutoOrbitRig.tsx: drag orbits, and
// the wheel plus every touch gesture are dead, so nothing in this subtree can
// take a scroll away from the page. The `touch-action: pan-y` override that
// makes the touch half of that true is in STAGE_CSS, because enabling
// camera-controls writes `touch-action: none` onto the canvas itself.

export default DemoRoom;
