"use client";

import { Component, useState, type ReactNode } from "react";
import { Viewport } from "@/viewport3d/Viewport";
import { useSceneStore } from "@/store/useSceneStore";
import { seedRoomFixtures } from "@/fixtures/seedRoomFixtures";
import { B, microLabel } from "@/brand/tokens";
import { demoScene } from "./demoScene";

// -----------------------------------------------------------------------------
// Everything heavy about the hero demo, isolated behind one dynamic import.
//
// ── Why this file exists at all ─────────────────────────────────────────────
// Loading `Viewport` with next/dynamic is NOT enough on its own to keep three.js
// out of the marketing page's first load, and measuring proved it: the homepage's
// initial chunks contained THREE.WebGLRenderer even with the dynamic Viewport in
// place. The path in is `useSceneStore` → `@/parametric` (the furniture
// generators, which build THREE geometry) → `three`. So a single static
// `import { useSceneStore }` anywhere in the marketing graph drags the entire 3D
// layer in through the store's back door, however the canvas itself is loaded.
//
// Hence the split: DemoRoom.tsx imports NOTHING that reaches three, and this
// file — which imports the store, the fixtures seeder and the Viewport directly
// — is only ever reached through `dynamic(() => import("./DemoStage"))`. Keep it
// that way. Adding a store import to DemoRoom.tsx would silently undo the split
// with no visible error, so if you change either file, re-check that the
// homepage's initial chunks are still three-free.
//
// ── Why the app's own panels are hidden ─────────────────────────────────────
// `<Viewport chrome={false} />` suppresses `ScenePanel` and `WallModeToggle`.
// This is a demo, not the product embedded in a box: a visitor who has not
// bought into anything yet should meet two controls, not fifteen, and they
// should look like the page rather than like an application docked inside it.
// The `chrome` prop is a Dan-approved additive change to a protected file —
// see docs/PROTECTED_PATHS.md's "Approved exceptions".
//
// The two controls kept are the ones that sell the product without offering a
// mode anyone can get stuck in: the ceiling lifts off (which is what makes it
// read as a real home rather than a render) and the sun moves. Walkthrough is
// deliberately NOT here — it takes over the page with pointer lock and needs an
// obvious way back out, which is a product decision, not a hero decision.
// -----------------------------------------------------------------------------

/** Catches any render-time throw from the Viewport (a lost WebGL context, a
 *  driver quirk that only shows up on someone else's GPU) and falls back to the
 *  quiet placeholder rather than taking the marketing page down with it. */
class CanvasBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Midday. Only ever set once, at seed time.
 *
 *  There is deliberately no time-of-day control: in the "none" env preset
 *  `timeOfDay` feeds `s.skyColor`, which Environment3d only uses when
 *  `outdoor` is true. Indoors it changes nothing at all, so a Daylight/Evening
 *  button was a control that did not control anything. */
const DAY = 13;

/** The ceiling fixtures' colour temperature, in Kelvin.
 *
 *  `seedRoomFixtures` generates fixtures at `GENERATED_FIXTURE_COLOR_K` (4000K,
 *  neutral white) and `FIXTURE_LUX_MAX`, so "White" is the room as the app
 *  itself would light it and "Warm" is the same room at a domestic 2400K. At
 *  20,000 lux the difference is unmissable, which is the whole point: every
 *  control on this page has to visibly do something. */
const WHITE_K = 4000;
const WARM_K = 2400;

function ControlButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        fontFamily: B.fontUi,
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        lineHeight: 1,
        padding: "9px 14px",
        borderRadius: 999,
        border: "none",
        background: active ? B.accentTint : "transparent",
        color: active ? B.accentText : B.ink2,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: `background ${B.dur} ${B.ease}, color ${B.dur} ${B.ease}`,
      }}
    >
      {label}
    </button>
  );
}

/** One quiet control cluster, centred under the room. Styled from the brand
 *  tokens rather than the app's glass chrome, so it reads as part of the page. */
function DemoControls() {
  const showCeilings = useSceneStore((s) => s.showCeilings);
  const setShowCeilings = useSceneStore((s) => s.setShowCeilings);
  const fixtures = useSceneStore((s) => s.scene.fixtures);

  const warm = (fixtures?.[0]?.colorK ?? WHITE_K) <= 3200;

  /** Retint every ceiling fixture. Written straight onto the scene rather than
   *  through `commitScene`, so re-lighting the demo never lands in the undo
   *  history the editor shares this store with. */
  const setLightK = (colorK: number) => {
    const s = useSceneStore.getState();
    useSceneStore.setState({
      scene: { ...s.scene, fixtures: (s.scene.fixtures ?? []).map((f) => ({ ...f, colorK })) },
    });
  };

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: "clamp(14px, 3vw, 26px)",
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none", // the gaps let an orbit drag through
        padding: "0 12px",
        zIndex: 3, // above DemoRoom's bottom edge-fade, which is zIndex 2
      }}
    >
      <div
        style={{
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: 5,
          borderRadius: 999,
          background: B.raised,
          border: `1px solid ${B.hairline}`,
          boxShadow: B.shadow,
          maxWidth: "100%",
          overflowX: "auto",
        }}
      >
        <span style={microLabel({ padding: "0 8px 0 12px", flex: "none" })}>Try it</span>
        <ControlButton
          label={showCeilings ? "Ceiling on" : "Ceiling off"}
          active={showCeilings}
          onClick={() => setShowCeilings(!showCeilings)}
        />
        <ControlButton
          label={warm ? "Warm light" : "White light"}
          active={warm}
          onClick={() => setLightK(warm ? WHITE_K : WARM_K)}
        />
      </div>
    </div>
  );
}

/**
 * Put the demo scene into the shared store.
 *
 * `view` mode gives orbit, pan and zoom with no editing behaviour. Ceilings
 * start OFF so the room reads as an open doll's house on arrival, which makes
 * turning them on the reveal rather than something the visitor has to undo.
 *
 * Returns null so it can be used as a `useState` initializer — see below.
 */
function seedDemoScene() {
  useSceneStore.setState({
    scene: seedRoomFixtures(demoScene),
    appMode: "view",
    wallMode: "full",
    showCeilings: false,
    timeOfDay: DAY,
    envPreset: "none",
    weather: "clear",
    walkthroughActive: false,
  });
  return null;
}

export default function DemoStage({ fallback }: { fallback: ReactNode }) {
  // Seeded through a useState initializer rather than an effect, because the
  // store has to hold the demo scene BEFORE the Viewport below first renders —
  // an effect runs after children mount, which would show one frame of the
  // app's default sample scene. A ref assignment during render would do the
  // same job but is a genuine React rule violation (and an eslint error).
  //
  // A remount is a new component instance, so this runs again then; there is no
  // separate cleanup or re-seed path to keep in sync. Nothing is restored on
  // unmount, since the marketing page never shares a session with the editor.
  useState(seedDemoScene);

  return (
    <CanvasBoundary fallback={fallback}>
      <Viewport chrome={false} />
      <DemoControls />
    </CanvasBoundary>
  );
}
