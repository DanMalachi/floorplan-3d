"use client";

import { Component, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Viewport } from "@/viewport3d/Viewport";
import { useSceneStore } from "@/store/useSceneStore";
import { seedRoomFixtures } from "@/fixtures/seedRoomFixtures";
import { frameColorPatch } from "@/render/frameFinish";
import {
  getOrbitPlaying,
  getOrbitPlayingServer,
  resetOrbitPlaying,
  setOrbitPlaying,
  subscribeOrbitPlaying,
} from "@/viewport3d/autoOrbitPlayback";
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
// ── The camera bargain ──────────────────────────────────────────────────────
// Drag orbits the room. The wheel, the middle button and every touch gesture do
// not — see AutoOrbitRig.tsx, which owns the input map and explains each one.
// The short version is that the wheel was the whole problem: a hero that zooms
// on scroll owns the page's scroll, and the visitor is stuck at the top of the
// site. A drag costs the page nothing, so it stays.
//
// On top of that the room turns by itself, and the toolbar under it can stop
// and start that. Dragging also stops it, because a camera that fights the
// pointer is worse than one that does nothing.
//
// ── Why the app's own panels are hidden ─────────────────────────────────────
// `<Viewport chrome={false} />` suppresses `ScenePanel`, `WallModeToggle` and
// the CAD grid, and `autoOrbit` additionally drops the ground's cast shadow
// (Environment3d's `groundShadow`) so the room floats rather than sitting on a
// large hard slab. All of them are Dan-approved additive changes to protected
// files — see docs/PROTECTED_PATHS.md's "Approved exceptions".
//
// Walkthrough is deliberately NOT here — it takes over the page with pointer
// lock and needs an obvious way back out, which is a product decision rather
// than a hero one.
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

/** Three floors from the real registry (data/materials-floors.manifest.json),
 *  chosen to read as obviously different at orbit distance: warm wood, cool
 *  stone, and a pattern. A control whose effect a visitor has to hunt for is
 *  worse than no control.
 *
 *  Each carries its OWN texture as the swatch, served from the same directory
 *  the renderer loads the material from — so the chip is a picture of the thing
 *  it applies, and cannot drift from it the way a hand-picked hex would. */
const FLOORS = [
  { id: "wood-oak-natural", label: "Oak" },
  { id: "concrete-light", label: "Concrete" },
  { id: "stone-terrazzo", label: "Terrazzo" },
] as const;

/** Window frame colours. These are the three a real buyer actually chooses
 *  between, and they carry their own swatch — a named colour with no chip is a
 *  guess until you click it. */
const FRAMES = [
  { hex: "#EDEDEA", label: "White" },
  { hex: "#8B8E92", label: "Grey" },
  { hex: "#1C1D1F", label: "Black" },
] as const;

const DEFAULT_FLOOR = FLOORS[0].id;
const DEFAULT_FRAME = FRAMES[0].hex;

// ── Icons ────────────────────────────────────────────────────────────────────
// Inline, 16px, `currentColor`, 1.5 stroke — so each one inherits the copper of
// an active button with no second colour to keep in sync. Drawn here rather
// than pulled from a set because a handful of glyphs do not justify an icon
// dependency on a page whose whole budget argument is in the header above.

const ICON = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true } as const;
const STROKE = {
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const IconSolid = () => (
  <svg {...ICON}>
    <path {...STROKE} d="M8 1.8 14 5v6l-6 3.2L2 11V5z" />
    <path {...STROKE} d="M2 5l6 3.2L14 5M8 8.2v6" />
  </svg>
);

const IconSeeThrough = () => (
  <svg {...ICON}>
    <path {...STROKE} d="M1.3 8S3.7 3.6 8 3.6 14.7 8 14.7 8 12.3 12.4 8 12.4 1.3 8 1.3 8z" />
    <circle {...STROKE} cx="8" cy="8" r="2.1" />
  </svg>
);

const IconCeilingOn = () => (
  <svg {...ICON}>
    <path {...STROKE} d="M2 3h12" />
    <path {...STROKE} d="M8 5.4v1.8M5.2 6.1l1 1.4M10.8 6.1l-1 1.4" />
    <circle {...STROKE} cx="8" cy="10.8" r="2.2" />
  </svg>
);

const IconCeilingOff = () => (
  <svg {...ICON}>
    <path {...STROKE} d="M2 3h12" />
    <path {...STROKE} d="M4.3 13.1 11.7 5.7" />
    <path {...STROKE} d="M9.9 8.4a2.2 2.2 0 0 1-2.9 2.9" />
    <path {...STROKE} d="M6.6 6.9a2.2 2.2 0 0 1 2.9.6" />
  </svg>
);

const IconWhiteLight = () => (
  <svg {...ICON}>
    <circle {...STROKE} cx="8" cy="8" r="4.2" />
  </svg>
);

const IconWarmLight = () => (
  <svg {...ICON}>
    <circle {...STROKE} cx="8" cy="8" r="2.8" />
    <path
      {...STROKE}
      d="M8 1.4v1.5M8 13.1v1.5M1.4 8h1.5M13.1 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1"
    />
  </svg>
);

const IconPlay = () => (
  <svg {...ICON}>
    <path {...STROKE} d="M5.5 3.4 12 8l-6.5 4.6z" />
  </svg>
);

const IconPause = () => (
  <svg {...ICON}>
    <path {...STROKE} d="M6 3.5v9M10 3.5v9" />
  </svg>
);

const IconDrag = () => (
  <svg {...ICON}>
    <path {...STROKE} d="M8 7.2V3.5a1 1 0 0 1 2 0v3.5" />
    <path {...STROKE} d="M10 7.2V4.8a1 1 0 0 1 2 0v2.9" />
    <path {...STROKE} d="M6 7.6V6.2a1 1 0 0 1 2 0" />
    <path {...STROKE} d="M6 7.6V9L4.8 7.9a1 1 0 0 0-1.4 1.4l2.3 3A3.4 3.4 0 0 0 8.4 13H10a2 2 0 0 0 2-2V7.7" />
  </svg>
);

/**
 * One option in a row.
 *
 * A bordered rectangle that shares the row's width equally with its siblings,
 * NOT a pill. The difference matters: pills size to their label, so a row reads
 * as a ragged group of separate things, while equal rectangles read as one
 * segmented control with a current position. Active is a copper OUTLINE with a
 * copper label rather than a copper fill — a filled chip at this size is the
 * loudest thing on the page, and there are eleven of them.
 */
function ControlButton({
  label,
  active,
  onClick,
  icon,
  swatch,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: ReactNode;
  /** A colour chip, or a texture URL. Mutually exclusive with `icon`. */
  swatch?: { color: string } | { image: string };
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={BTN_CLASS}
      data-active={active || undefined}
      style={{
        fontFamily: B.fontUi,
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 1,
        display: "flex",
        minWidth: 0,
        alignItems: "center",
        gap: 7,
        padding: "0 10px",
        height: 42,
        borderRadius: B.radiusS + 2,
        border: `1px solid ${active ? B.accent : B.hairline}`,
        background: active ? B.accentTint : "transparent",
        color: active ? B.accentText : B.ink,
        cursor: "pointer",
        transition: `border-color ${B.dur} ${B.ease}, color ${B.dur} ${B.ease}, background ${B.dur} ${B.ease}`,
      }}
    >
      {icon}
      {swatch && (
        <span
          aria-hidden
          style={{
            width: 17,
            height: 17,
            borderRadius: 5,
            flex: "none",
            ...("color" in swatch
              ? { background: swatch.color }
              : {
                  backgroundImage: `url(${swatch.image})`,
                  // The tile is a full material sample; `cover` keeps the grain
                  // readable at 17px instead of squeezing a whole plank in.
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }),
            // A white chip on a dark panel needs an edge or it dissolves.
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.30)",
          }}
        />
      )}
      {/* `title` is the last line of defence only: the row above is sized so a
          label never has to truncate, and this exists for a font-fallback or a
          text-zoom setting that makes one wider than measured. */}
      <span title={label} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
    </button>
  );
}

/** One labelled row: a micro-label over a set of equal-width options.
 *
 *  `auto-fit` + a `minmax` floor rather than a plain flex row. A flex row keeps
 *  three options side by side however narrow the panel gets, which is what
 *  clipped "Concrete" to "Concr…". This gives every option a width it is
 *  guaranteed to fit its label in, and when the panel cannot afford three of
 *  them it wraps to two, then one — so the label is never the thing that
 *  gives way. */
function ControlRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={microLabel()}>{label}</span>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fit, minmax(${OPTION_MIN_PX}px, 1fr))`,
          gap: 8,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** The narrowest an option may be before its row wraps. Sized on the longest
 *  label any row carries ("See through") at this font, plus the swatch, the gap
 *  and the padding — so the widest case still fits rather than truncating. */
const OPTION_MIN_PX = 104;

/**
 * The five controls, in a card beside the room.
 *
 * Every write here goes STRAIGHT onto the scene rather than through
 * `commitScene`. The store is shared with the editor and `commitScene` pushes an
 * undo entry; a visitor idly trying floors should not be building a history
 * stack on a marketing page.
 */
function DemoControls() {
  const showCeilings = useSceneStore((s) => s.showCeilings);
  const setShowCeilings = useSceneStore((s) => s.setShowCeilings);
  const wallMode = useSceneStore((s) => s.wallMode);
  const setWallMode = useSceneStore((s) => s.setWallMode);
  const fixtures = useSceneStore((s) => s.scene.fixtures);
  const rooms = useSceneStore((s) => s.scene.rooms);
  const openings = useSceneStore((s) => s.scene.openings);

  const warm = (fixtures?.[0]?.colorK ?? WHITE_K) <= 3200;
  const floor = rooms?.[0]?.floor ?? DEFAULT_FLOOR;
  const frame = openings?.find((o) => o.frameColor)?.frameColor ?? DEFAULT_FRAME;

  // The ceiling only renders in Full wall-mode — `FloorMesh.tsx:343` gates it
  // as `!show || wallMode !== "full"`, so Cutaway can always see in. Reading
  // the SAME condition here is what stops the Ceiling row from lighting "On"
  // over a room with no ceiling in it, which is what made the control look
  // broken. The two rows are coerced into agreement below, but the display
  // still has to tell the truth about what is actually on screen.
  const ceilingOn = showCeilings && wallMode === "full";

  /** Ceiling on implies solid walls, because there is no such thing as a
   *  visible ceiling without them. Rather than disable the row or show a
   *  tooltip explaining a coupling nobody asked about, the control just brings
   *  the walls with it — every button stays live and does the obvious thing. */
  const setCeiling = (on: boolean) => {
    setShowCeilings(on);
    if (on) setWallMode("full");
  };

  /** The same agreement from the other side: asking to see through the walls
   *  while a ceiling is on would otherwise leave `showCeilings` true and
   *  silently re-roof the room the moment Solid came back. */
  const setWalls = (mode: "full" | "cutaway") => {
    setWallMode(mode);
    if (mode === "cutaway") setShowCeilings(false);
  };

  /** Retint every ceiling fixture. */
  const setLightK = (colorK: number) => {
    const s = useSceneStore.getState();
    useSceneStore.setState({
      scene: { ...s.scene, fixtures: (s.scene.fixtures ?? []).map((f) => ({ ...f, colorK })) },
    });
  };

  /** Re-floor every room. The demo has one, but writing it as a map keeps this
   *  correct if the scene ever grows a second. */
  const setFloor = (id: string) => {
    const s = useSceneStore.getState();
    useSceneStore.setState({
      scene: { ...s.scene, rooms: s.scene.rooms.map((r) => ({ ...r, floor: id })) },
    });
  };

  /** Frame colour is a whole-house property, so this is one call for the
   *  project rather than a per-window edit. */
  const setFrame = (hex: string) => {
    const s = useSceneStore.getState();
    useSceneStore.setState({ scene: frameColorPatch(s.scene, hex) });
  };

  return (
    <div className={PANEL_CLASS}>
      <ControlRow label="Walls">
        <ControlButton
          label="Solid"
          icon={<IconSolid />}
          active={wallMode === "full"}
          onClick={() => setWalls("full")}
        />
        <ControlButton
          label="See through"
          icon={<IconSeeThrough />}
          active={wallMode === "cutaway"}
          onClick={() => setWalls("cutaway")}
        />
      </ControlRow>

      <ControlRow label="Ceiling">
        <ControlButton label="On" icon={<IconCeilingOn />} active={ceilingOn} onClick={() => setCeiling(true)} />
        <ControlButton
          label="Off"
          icon={<IconCeilingOff />}
          active={!ceilingOn}
          onClick={() => setCeiling(false)}
        />
      </ControlRow>

      <ControlRow label="Lighting">
        <ControlButton
          label="White"
          icon={<IconWhiteLight />}
          active={!warm}
          onClick={() => setLightK(WHITE_K)}
        />
        <ControlButton label="Warm" icon={<IconWarmLight />} active={warm} onClick={() => setLightK(WARM_K)} />
      </ControlRow>

      <ControlRow label="Floor">
        {FLOORS.map((f) => (
          <ControlButton
            key={f.id}
            label={f.label}
            swatch={{ image: `/materials/floors/${f.id}/thumb.webp` }}
            active={floor === f.id}
            onClick={() => setFloor(f.id)}
          />
        ))}
      </ControlRow>

      <ControlRow label="Windows">
        {FRAMES.map((f) => (
          <ControlButton
            key={f.hex}
            label={f.label}
            swatch={{ color: f.hex }}
            active={frame.toLowerCase() === f.hex.toLowerCase()}
            onClick={() => setFrame(f.hex)}
          />
        ))}
      </ControlRow>
    </div>
  );
}

/**
 * The bar under the room: what the visitor can do to it, and a stop/start for
 * the orbit.
 *
 * The hint is not decoration. Drag is the ONLY camera gesture left — the wheel
 * and every touch gesture are deliberately dead (AutoOrbitRig.tsx) — and an
 * affordance nobody can see is the same as one that isn't there.
 */
function DemoToolbar() {
  const playing = useSyncExternalStore(subscribeOrbitPlaying, getOrbitPlaying, getOrbitPlayingServer);
  return (
    <div className={TOOLBAR_CLASS}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontFamily: B.fontUi,
          fontSize: 13,
          color: B.ink3,
        }}
      >
        <IconDrag />
        Drag to orbit
      </span>
      <button
        onClick={() => setOrbitPlaying(!playing)}
        aria-label={playing ? "Pause the orbit" : "Resume the orbit"}
        className={BTN_CLASS}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 34,
          height: 34,
          borderRadius: B.radiusS,
          border: `1px solid ${B.hairline}`,
          background: "transparent",
          color: B.ink,
          cursor: "pointer",
          flex: "none",
          transition: `border-color ${B.dur} ${B.ease}, color ${B.dur} ${B.ease}`,
        }}
      >
        {playing ? <IconPause /> : <IconPlay />}
      </button>
    </div>
  );
}

/**
 * Put the demo scene into the shared store.
 *
 * Ceilings start OFF so the room reads as an open doll's house on arrival,
 * which makes turning them on the reveal rather than something the visitor has
 * to undo. Floor and frame colour are seeded to the first option of their row
 * so every row opens with exactly one option lit — an all-dark row would read
 * as broken.
 *
 * Returns null so it can be used as a `useState` initializer — see below.
 */
function seedDemoScene() {
  const seeded = seedRoomFixtures(demoScene);
  useSceneStore.setState({
    scene: frameColorPatch(
      { ...seeded, rooms: seeded.rooms.map((r) => ({ ...r, floor: DEFAULT_FLOOR })) },
      DEFAULT_FRAME,
    ),
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

  // The orbit's play state lives in a module singleton (it has to cross the
  // Canvas boundary), so unlike the scene it survives an unmount. Reset it, or
  // a visitor who paused, navigated away and came back would meet a hero that
  // never moves.
  useEffect(() => resetOrbitPlaying(), []);

  return (
    <div className={STAGE_CLASS}>
      <style dangerouslySetInnerHTML={{ __html: STAGE_CSS }} />
      <div className={CANVAS_CLASS}>
        <CanvasBoundary fallback={fallback}>
          <Viewport chrome={false} autoOrbit />
        </CanvasBoundary>
        <DemoToolbar />
      </div>
      <DemoControls />
    </div>
  );
}

const STAGE_CLASS = "done-demo-stage";
const CANVAS_CLASS = "done-demo-canvas";
const PANEL_CLASS = "done-demo-panel";
const TOOLBAR_CLASS = "done-demo-toolbar";
const BTN_CLASS = "done-demo-btn";

/* ── Why the canvas is MASKED rather than colour-matched ─────────────────────
   The room has to float on the page with no rectangle around it, and the canvas
   cannot simply BE the page's colour: `src/render/contract.ts` sets
   `alpha: false` on the GL context, and the composer tone-maps the background,
   so what lands on screen is never exactly the hex the source names. Chasing
   that with a matching page colour is what left a visible box.

   So the canvas's own edges are masked to transparent and the page shows
   through. That is exact by construction — there is no colour to match — and it
   survives any change to the tone mapping, the studio background or the brand
   ground. Two linear gradients composited with `intersect` give a soft-edged
   rectangle; a browser without `mask-composite` applies the vertical ramp
   alone, which is no worse than the DOM overlay this replaced.

   The horizontal inset is smaller than the vertical because the room is framed
   to fill the column: fading 6% from each side stays clear of the model, while
   a heavier ramp would start dimming the walls themselves.

   `touch-action: pan-y` is NOT redundant with the dead touch map. Enabling
   camera-controls writes `touch-action: none` onto the canvas element itself
   (camera-controls.module.js:1199), which blocks page scrolling no matter what
   the action map says, so this has to win it back. Vertical swipes scroll the
   page; nothing else on touch does anything, by design. */
const STAGE_CSS = `
/* NO fixed height anywhere in here. The row is as tall as the taller of its two
   children: the canvas contributes a min-height, the panel contributes whatever
   its five rows actually need, and the grid takes the max. That is what stops
   the panel being clipped at the bottom — it was previously poured into a
   viewport-derived height that was correct at one window size and too short at
   others, with no way to tell from the code which one you had. */
.${STAGE_CLASS} {
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(320px, 31%, 404px);
  gap: clamp(20px, 2.5vw, 36px);
  align-items: stretch;
  width: 100%;
}
.${CANVAS_CLASS} {
  position: relative;
  min-width: 0;
  min-height: clamp(400px, 62vh, 680px);
}
.${STAGE_CLASS} canvas {
  touch-action: pan-y !important;
  -webkit-mask-image:
    linear-gradient(to right, transparent 0%, #000 4%, #000 96%, transparent 100%),
    linear-gradient(to bottom, transparent 0%, #000 4%, #000 94%, transparent 100%);
  mask-image:
    linear-gradient(to right, transparent 0%, #000 4%, #000 96%, transparent 100%),
    linear-gradient(to bottom, transparent 0%, #000 4%, #000 94%, transparent 100%);
  -webkit-mask-composite: source-in;
  mask-composite: intersect;
}

.${PANEL_CLASS} {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 18px;
  padding: clamp(18px, 2vw, 26px);
  border-radius: ${B.radiusM}px;
  background: ${B.raised};
  border: 1px solid ${B.hairline};
}

.${BTN_CLASS}:hover { border-color: ${B.hairline2} !important; }
.${BTN_CLASS}[data-active]:hover { border-color: ${B.accent} !important; }
.${BTN_CLASS}:focus-visible { outline: 2px solid ${B.accent}; outline-offset: 2px; }

.${TOOLBAR_CLASS} {
  position: absolute;
  left: 50%;
  bottom: clamp(10px, 2vw, 22px);
  transform: translateX(-50%);
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px 7px 13px;
  border-radius: 999px;
  background: ${B.raised};
  border: 1px solid ${B.hairline};
  box-shadow: ${B.shadow};
  white-space: nowrap;
}

/* Stacked, model first. Below this width the panel beside the room would be too
   narrow for a three-option row to hold its labels, and the room too narrow to
   be legible at all. The side masks go with it: at this size the canvas spans
   the full viewport, so its side edges are off-screen and fading them would
   only eat the model. */
@media (max-width: 900px) {
  .${STAGE_CLASS} {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto;
    gap: 14px;
  }
  /* Shorter, because the room now has the full width to be legible in and the
     panel below it needs to be reachable without a long scroll past the hero. */
  .${CANVAS_CLASS} { min-height: clamp(260px, 42vh, 400px); }
  .${STAGE_CLASS} canvas {
    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 8%, #000 92%, transparent 100%);
    mask-image: linear-gradient(to bottom, transparent 0%, #000 8%, #000 92%, transparent 100%);
  }
  .${PANEL_CLASS} { gap: 14px; }
}
`;
