"use client";

import { Component, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { Viewport } from "@/viewport3d/Viewport";
import { useSceneStore } from "@/store/useSceneStore";
import { seedRoomFixtures } from "@/fixtures/seedRoomFixtures";
import { frameColorPatch } from "@/render/frameFinish";
import { WALL_HEIGHT } from "@/schema/constants";
import type { Scene } from "@/schema/scene";
import {
  getOrbitPlaying,
  getOrbitPlayingServer,
  resetOrbitPlaying,
  setOrbitPlaying,
  subscribeOrbitPlaying,
} from "@/viewport3d/autoOrbitPlayback";
import { B, microLabel, ctaPrimary } from "@/brand/tokens";
import { demoScene } from "./demoScene";
import { TraceOverlay, PLAN_TEXT_CSS } from "./TraceOverlay";
import type { HeroStage } from "./heroSequence";
import { APP_HREF } from "./nav";
import { HERO } from "./content";

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
function DemoControls({ dimmed }: { dimmed: boolean }) {
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
    /* Present but inert until the room exists, never unmounted: the grid row is
       as tall as the taller of the room and this panel, so a panel that arrived
       late would grow the row and shove the page down at the exact moment the
       visitor is watching the reveal. */
    <div className={`${PANEL_CLASS}${dimmed ? " is-dimmed" : ""}`} inert={dimmed || undefined}>
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
function seedDemoScene(flat: boolean) {
  const seeded = seedRoomFixtures(demoScene);
  const dressed = frameColorPatch(
    { ...seeded, rooms: seeded.rooms.map((r) => ({ ...r, floor: DEFAULT_FLOOR })) },
    DEFAULT_FRAME,
  );
  BASE_SCENE = dressed;
  useSceneStore.setState({
    scene: flat ? buildFrame(dressed, 0) : dressed,
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

/** The finished scene, kept so each build frame can be derived from it rather
 *  than from the partially-built one already in the store. */
let BASE_SCENE: Scene | null = null;

/* ── How the room stands up ─────────────────────────────────────────────────
   The walls really extrude. `Wall.height` is a per-wall schema field
   (src/schema/scene.ts) that falls back to WALL_HEIGHT, so growing a wall is an
   ordinary scene patch — the same shape of write the five controls beside the
   room already make (see `setFloor` above). Nothing in the protected viewport3d/
   tree is touched, and what the visitor watches rise is the real renderer
   building the real model, not a picture of one.

   Three ordering rules, each of them a bug avoided:

   - Walls start at 0.02 m, not 0. A zero-height wall is degenerate geometry.
   - Openings arrive only once the walls are full height. Window W2's head sits
     at 2.20 m, so a wall shorter than that cannot carry it, and cutting a hole
     taller than the wall it is in is undefined.
   - Ceiling fixtures arrive with the openings, for the same reason: they hang
     at ceiling height, and while the walls are 2 cm tall that is the floor. */
// The drawing is gone on the press, so the build starts essentially at once —
// there is no dissolve left to hide its first frames behind, and any wait here
// is a held empty floor.
const BUILD = {
  wallsFrom: 0.06,
  wallEach: 0.5, // one wall's own rise
  wallsDone: 0.95, // every wall at full height by here
  furnitureFrom: 1.0,
  furnitureBatches: 3, // batches, NOT one write per item — see below
  furnitureEach: 0.15,
  total: 1.55,
};

/** Writes per second while the walls grow.
 *
 *  Every write replaces the scene, which re-runs `computeWallEffectiveHeights`
 *  and re-meshes; at 60 fps that is the whole frame budget spent re-solving
 *  geometry between states the eye cannot separate, and it is what made the
 *  reveal stutter. Quantising the CLOCK (rather than only the heights) puts a
 *  hard ceiling on how many scene rebuilds the growth can ever cost, and 25
 *  steps a second still reads as continuous motion. */
const BUILD_HZ = 25;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

/**
 * The scene as it looks `t` seconds into the build.
 *
 * A pure function of the finished scene and the clock, so the frame the store
 * holds is never derived from the frame before it — a build that drops a frame
 * cannot end up short of a wall.
 *
 * Heights are quantised to 2 cm. Every write re-runs `computeWallEffectiveHeights`
 * and re-meshes the walls, so writing a fresh float sixty times a second would
 * spend the whole budget re-solving geometry the eye cannot tell apart; at 2 cm
 * a 2.4 m wall still gets 120 distinct steps on the way up.
 */
function buildFrame(base: Scene, t: number): Scene {
  const n = base.walls.length;
  const span = BUILD.wallsDone - BUILD.wallsFrom - BUILD.wallEach;
  const stagger = n > 1 ? span / (n - 1) : 0;
  const walls = base.walls.map((w, i) => {
    const p = easeOut((t - BUILD.wallsFrom - i * stagger) / BUILD.wallEach);
    const h = Math.max(0.02, Math.round(p * WALL_HEIGHT * 25) / 25);
    return { ...w, height: h };
  });
  const built = t >= BUILD.wallsDone;
  // Furniture arrives in three batches rather than thirteen. One write per item
  // was thirteen full scene rebuilds inside 1.4s, which both stuttered and read
  // as objects being dealt onto the floor one at a time.
  const batch = t < BUILD.furnitureFrom
    ? 0
    : Math.min(BUILD.furnitureBatches, Math.floor((t - BUILD.furnitureFrom) / BUILD.furnitureEach) + 1);
  const shown = Math.ceil((base.furniture.length * batch) / BUILD.furnitureBatches);
  return {
    ...base,
    walls,
    openings: built ? base.openings : [],
    fixtures: built ? base.fixtures : [],
    furniture: base.furniture.slice(0, shown),
  };
}

/** Cheap signature of a build frame — lets the loop skip a write when nothing
 *  the renderer cares about has actually changed since the last one. */
function frameKey(s: Scene): string {
  return `${s.walls.map((w) => w.height).join(",")}|${s.openings.length}|${s.furniture.length}`;
}

/**
 * `stage` and `onStage` are PROPS, not reads of the module singleton in
 * ./heroSequence, and that is not a style preference — it is the bug this file
 * exists on the far side of.
 *
 * This module is only ever reached through `dynamic(() => import("./DemoStage"))`,
 * so it lands in its own chunk. A module imported by BOTH that chunk and the
 * page's main chunk gets instantiated once per chunk, so `heroSequence`'s
 * module-level `stage` was two variables: Hero's button wrote one, this file
 * read the other, and the animation never started while the button happily
 * changed its own label. There is no error when this happens — it just quietly
 * does nothing.
 *
 * `viewport3d/autoOrbitPlayback.ts` gets away with being a singleton because
 * both of its ends (the toolbar below and AutoOrbitRig) live inside THIS chunk.
 * Nothing that has to cross the dynamic import may rely on that.
 *
 * So DemoRoom.tsx — which sits on the light side and already subscribes — owns
 * the subscription, and hands the value and the setter across the boundary the
 * one way a boundary can be crossed safely.
 */
export default function DemoStage({
  fallback,
  reduced = false,
  stage,
  onStage,
}: {
  fallback: ReactNode;
  reduced?: boolean;
  stage: HeroStage;
  onStage: (next: HeroStage) => void;
}) {
  // Seeded through a useState initializer rather than an effect, because the
  // store has to hold the demo scene BEFORE the Viewport below first renders —
  // an effect runs after children mount, which would show one frame of the
  // app's default sample scene. A ref assignment during render would do the
  // same job but is a genuine React rule violation (and an eslint error).
  //
  // A remount is a new component instance, so this runs again then; there is no
  // separate cleanup or re-seed path to keep in sync. Nothing is restored on
  // unmount, since the marketing page never shares a session with the editor.
  useState(() => seedDemoScene(!reduced));

  const built = stage === "done";
  const lit = stage === "building" || built;

  // The orbit's play state lives in a module singleton (it has to cross the
  // Canvas boundary), so unlike the scene it survives an unmount. Reset it, or
  // a visitor who paused, navigated away and came back would meet a hero that
  // never moves.
  //
  // It then STOPS until the room exists. The trace hands the plan over at a
  // fixed camera pose, and a camera that has been drifting for however long the
  // visitor spent reading the page would not be at that pose when it arrived.
  useEffect(() => {
    resetOrbitPlaying();
    setOrbitPlaying(false);
  }, []);

  // Reduced motion: the room, immediately, with nothing moving. The scene was
  // already seeded whole, so this only has to skip the sequence.
  useEffect(() => {
    if (reduced && (stage === "tracing" || stage === "building")) onStage("done");
  }, [reduced, stage]);

  // Going back to the plan — a replay. The orbit stops again so the tilt has a
  // fixed pose to land on, and the scene is flattened so the walls have
  // somewhere to grow from.
  //
  // KNOWN LIMIT on replay only: the camera resumes from wherever the orbit left
  // it, not from the pose the first play started at, so the plan's tilt lands
  // less precisely the second time. AutoOrbitRig frames once on mount and
  // exposes no way to re-frame; giving it one is an additive change to a
  // protected file, which needs Dan (CLAUDE.md rule 1) — so it is flagged
  // rather than done.
  useEffect(() => {
    if (stage !== "tracing" || reduced) return;
    setOrbitPlaying(false);
    if (BASE_SCENE) useSceneStore.setState({ scene: buildFrame(BASE_SCENE, 0) });
  }, [stage, reduced]);

  // The build: walls rise, then openings are cut, then the furniture arrives.
  useEffect(() => {
    if (stage !== "building" || reduced) return;
    const base = BASE_SCENE;
    if (!base) return;
    let raf = 0;
    let start = 0;
    let lastKey = "";
    const tick = (now: number) => {
      if (!start) start = now;
      const raw = Math.min((now - start) / 1000, BUILD.total);
      // Snap the clock to BUILD_HZ so the number of scene rebuilds is bounded
      // by time rather than by display refresh rate — a 120Hz monitor must not
      // pay twice for the same animation.
      const t = Math.round(raw * BUILD_HZ) / BUILD_HZ;
      const next = buildFrame(base, t);
      const key = frameKey(next);
      if (key !== lastKey) {
        lastKey = key;
        useSceneStore.setState({ scene: next });
      }
      if (t >= BUILD.total) {
        onStage("done");
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage, reduced]);

  // Arriving at the finished room — whether the build got there on its own or
  // the visitor pressed Skip half way through. Restoring the whole scene is
  // what makes Skip land on the same room the animation would have built.
  useEffect(() => {
    if (stage !== "done") return;
    if (BASE_SCENE) useSceneStore.setState({ scene: BASE_SCENE });
    setOrbitPlaying(true);
  }, [stage]);

  return (
    /* The whole demo sits in a window, so the hero reads as a small, real copy
       of the app rather than as two panels laid on a marketing page. The title
       bar is chrome, not decoration: it is what tells a visitor that the thing
       below it is an application they could be using. */
    <div className={WINDOW_CLASS}>
      <style dangerouslySetInnerHTML={{ __html: STAGE_CSS }} />
      <div className={TITLEBAR_CLASS}>
        <span className={LIGHTS_CLASS} aria-hidden="true">
          <i style={{ background: "#FF5F57" }} />
          <i style={{ background: "#FEBC2E" }} />
          <i style={{ background: "#28C840" }} />
        </span>
        <span className={TITLE_CLASS}>Studio apartment</span>
      </div>
      <div className={BODY_CLASS}>
        <div className={STAGE_CLASS}>
          <div className={CANVAS_CLASS}>
        {/* The canvas is dark until Generate is pressed, so the resting hero is
            the flat plan and nothing else. It then fades up UNDER the tilting
            plan, which is what makes the drawing and the model read as one
            object rather than two states of a slideshow. */}
        <div className={`${CANVAS_FADE_CLASS}${lit ? " is-lit" : ""}`}>
          <CanvasBoundary fallback={fallback}>
            <Viewport chrome={false} autoOrbit />
          </CanvasBoundary>
        </div>

        {/* Mounted ONLY while there is a drawing to show. The moment Generate
            is pressed the sequence moves to "building" and this unmounts, so
            the trace is gone on the press rather than lingering over the room
            it has been replaced by. */}
        {!reduced && (stage === "idle" || stage === "tracing") && (
          <TraceOverlay running={stage === "tracing"} onGenerate={() => onStage("building")} />
        )}

        {/* Both only mean anything once there is a room: "Drag to orbit" over a
            drawing is a lie, and a call to action before the payoff is a nag. */}
        {built && <DemoToolbar />}
        {built && (
          <Link href={APP_HREF} className={REVEAL_CLASS} style={ctaPrimary()}>
            {HERO.revealCta}
            <span aria-hidden="true">&rarr;</span>
          </Link>
        )}
          </div>
          <DemoControls dimmed={!built} />
        </div>
      </div>
    </div>
  );
}

const STAGE_CLASS = "done-demo-stage";
const CANVAS_CLASS = "done-demo-canvas";
const PANEL_CLASS = "done-demo-panel";
const TOOLBAR_CLASS = "done-demo-toolbar";
const BTN_CLASS = "done-demo-btn";
const CANVAS_FADE_CLASS = "done-demo-canvas-fade";
const REVEAL_CLASS = "done-demo-reveal";
const WINDOW_CLASS = "done-demo-window";
const TITLEBAR_CLASS = "done-demo-titlebar";
const LIGHTS_CLASS = "done-demo-lights";
const TITLE_CLASS = "done-demo-title";
const BODY_CLASS = "done-demo-body";

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
${PLAN_TEXT_CSS}

/* ── The window ────────────────────────────────────────────────────────────
   The hero's demo is presented as an application window. The title bar is the
   only fixed height in this file and it is allowed to be: it is chrome with
   fixed contents, not the content row whose height has to come from what is
   actually in it. */
.${WINDOW_CLASS} {
  border-radius: 12px;
  border: 1px solid ${B.hairline};
  background: ${B.canvas};
  box-shadow: ${B.shadow};
  overflow: hidden;
}
.${TITLEBAR_CLASS} {
  position: relative;
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 14px;
  background: ${B.raised};
  border-bottom: 1px solid ${B.hairline};
}
.${LIGHTS_CLASS} { display: flex; gap: 8px; position: relative; z-index: 1; }
.${LIGHTS_CLASS} i { width: 11px; height: 11px; border-radius: 50%; display: block; }
/* Centred on the WINDOW, not in the leftover space beside the lights — an
   off-centre title is the tell that a window chrome was faked. */
.${TITLE_CLASS} {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ${B.fontMono};
  font-size: 11.5px;
  letter-spacing: 0.1em;
  color: ${B.ink4};
  pointer-events: none;
}
.${BODY_CLASS} { padding: clamp(12px, 1.6vw, 20px); }

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
/* The canvas is now a VIEWPORT INSIDE A WINDOW, so it is a panel on purpose and
   the edge mask is gone. That mask existed for one reason — the canvas cannot
   be transparent (alpha:false in src/render/contract.ts) and can never exactly
   match the page, so two attempts at colour-matching both left a visible box,
   and fading the edges to nothing was the only exact answer. Inside a window
   frame the premise is inverted: a crisp rectangle of darker ground is what an
   application's 3D view looks like, and a canvas whose edges dissolve into the
   panel around it would read as a smudge. Radius plus overflow:hidden on the
   cell replaces it.

   touch-action:pan-y is NOT redundant with the dead touch map and stays.
   Enabling camera-controls writes touch-action:none onto the canvas element
   itself, which blocks page scrolling no matter what the action map says. */
.${CANVAS_CLASS} {
  position: relative;
  min-width: 0;
  min-height: clamp(400px, 62vh, 680px);
  border-radius: 8px;
  overflow: hidden;
  background: ${B.ground};
}
.${STAGE_CLASS} canvas { touch-action: pan-y !important; }

.${PANEL_CLASS} {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 18px;
  padding: clamp(18px, 2vw, 26px);
  border-radius: ${B.radiusM}px;
  background: ${B.raised};
  border: 1px solid ${B.hairline};
  transition: opacity ${B.durSlow} ${B.ease};
}
/* Holds its space, so the grid row never changes height — see DemoControls. */
.${PANEL_CLASS}.is-dimmed { opacity: 0.28; }

/* The canvas, dark until Generate is pressed. Opacity only: the element keeps
   its box, so the room is laid out and the camera has settled at its resting
   pose long before it is ever seen — which is what the tilt has to land on. */
/* No delay and short. The drawing is unmounted on the press, so there is
   nothing left to cross-fade WITH — anything slower than this is just a dark
   gap where the plan used to be. It stays a fade rather than a hard cut only
   so the room reads as coming up rather than as a jump cut; the ground behind
   it is the same colour, so what the eye sees is the model resolving out of
   the dark. */
.${CANVAS_FADE_CLASS} {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 220ms ${B.ease};
}
.${CANVAS_FADE_CLASS}.is-lit { opacity: 1; }

/* The closing call to action, over the finished room and clear of the toolbar
   below it. Fades up rather than appearing, so it reads as the end of the
   animation rather than as a new piece of page furniture. */
.${REVEAL_CLASS} {
  position: absolute;
  left: 50%;
  bottom: clamp(66px, 9vw, 86px);
  transform: translateX(-50%);
  z-index: 3;
  animation: done-demo-reveal-in ${B.durSlow} ${B.ease} both;
}
@keyframes done-demo-reveal-in {
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .${REVEAL_CLASS} { animation: none; }
  .${CANVAS_FADE_CLASS} { transition: none; }
  .${PANEL_CLASS} { transition: none; }
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
