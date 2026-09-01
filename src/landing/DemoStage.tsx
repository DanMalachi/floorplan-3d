"use client";

import { Component, useState, type ReactNode } from "react";
import { Viewport } from "@/viewport3d/Viewport";
import { useSceneStore } from "@/store/useSceneStore";
import { seedRoomFixtures } from "@/fixtures/seedRoomFixtures";
import { frameColorPatch } from "@/render/frameFinish";
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
// ── Why the visitor cannot touch the camera ─────────────────────────────────
// `<Viewport autoOrbit />` takes the camera away and orbits it slowly instead.
// The reason is scroll, not style: CameraControls binds the wheel on the canvas,
// so a hero that owns the camera also owns the page's scroll — you scroll, the
// model dollies, and the page stays where it was. The middle mouse button has
// the same collision (TRUCK in the app, autoscroll in the browser).
//
// So the hero stops competing for the pointer altogether. The camera moves on
// its own, the canvas is `pointer-events: none` (see STAGE_CSS), and every
// gesture a visitor makes over the hero belongs to the page. What the visitor
// drives instead is the STATE of the room — five controls floating over it, each
// which visibly changes the thing they are looking at. That reads as a product
// demo rather than a toy, and it cannot trap anyone.
//
// ── Why the app's own panels are hidden ─────────────────────────────────────
// `<Viewport chrome={false} />` suppresses `ScenePanel`, `WallModeToggle` and
// the CAD grid. This is a demo, not the product embedded in a box: a visitor who
// has not bought into anything yet should meet a short row of controls that look
// like the page, not fifteen that look like an application docked inside it.
// Both props are Dan-approved additive changes to a protected file — see
// docs/PROTECTED_PATHS.md's "Approved exceptions".
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
 *  worse than no control. */
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

/** A pill button. `active` is the whole visual language of this panel: one
 *  option per row is always on, so the panel reads as the room's current state
 *  rather than as a set of things you could do to it. */
function ControlButton({
  label,
  active,
  onClick,
  swatch,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  /** Optional colour chip, for rows where the value IS a colour. */
  swatch?: string;
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
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: swatch ? "8px 12px 8px 9px" : "9px 13px",
        borderRadius: 999,
        border: "none",
        background: active ? B.accentTint : "transparent",
        color: active ? B.accentText : B.ink2,
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: `background ${B.dur} ${B.ease}, color ${B.dur} ${B.ease}`,
      }}
    >
      {swatch && (
        <span
          aria-hidden
          style={{
            width: 13,
            height: 13,
            borderRadius: "50%",
            background: swatch,
            // The white chip needs an edge or it dissolves into the pill.
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.28)",
            flex: "none",
          }}
        />
      )}
      {label}
    </button>
  );
}

/** One labelled row of the panel. */
function ControlRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={microLabel({ padding: "0 0 0 4px" })}>{label}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>{children}</div>
    </div>
  );
}

/**
 * The five controls, in a column beside the room.
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
      <span style={microLabel({ padding: "0 0 0 4px", color: B.ink3 })}>Try it</span>

      <ControlRow label="Walls">
        <ControlButton label="Solid" active={wallMode === "full"} onClick={() => setWalls("full")} />
        <ControlButton
          label="See through"
          active={wallMode === "cutaway"}
          onClick={() => setWalls("cutaway")}
        />
      </ControlRow>

      <ControlRow label="Ceiling">
        <ControlButton label="On" active={ceilingOn} onClick={() => setCeiling(true)} />
        <ControlButton label="Off" active={!ceilingOn} onClick={() => setCeiling(false)} />
      </ControlRow>

      <ControlRow label="Light">
        <ControlButton label="White" active={!warm} onClick={() => setLightK(WHITE_K)} />
        <ControlButton label="Warm" active={warm} onClick={() => setLightK(WARM_K)} />
      </ControlRow>

      <ControlRow label="Floor">
        {FLOORS.map((f) => (
          <ControlButton key={f.id} label={f.label} active={floor === f.id} onClick={() => setFloor(f.id)} />
        ))}
      </ControlRow>

      <ControlRow label="Windows">
        {FRAMES.map((f) => (
          <ControlButton
            key={f.hex}
            label={f.label}
            swatch={f.hex}
            active={frame.toLowerCase() === f.hex.toLowerCase()}
            onClick={() => setFrame(f.hex)}
          />
        ))}
      </ControlRow>
    </div>
  );
}

/**
 * Put the demo scene into the shared store.
 *
 * Ceilings start OFF so the room reads as an open doll's house on arrival,
 * which makes turning them on the reveal rather than something the visitor has
 * to undo. Floor and frame colour are seeded to the first option of their row
 * so every row opens with exactly one pill lit — an all-dark row would read as
 * broken.
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

  return (
    <div className={STAGE_CLASS}>
      <style dangerouslySetInnerHTML={{ __html: STAGE_CSS }} />
      <div className={CANVAS_CLASS}>
        <CanvasBoundary fallback={fallback}>
          <Viewport chrome={false} autoOrbit />
        </CanvasBoundary>
        {/* Edge fades. The horizon itself is gone — `chrome={false}` passes
            NOTE: these cover the TOP and BOTTOM only. The left and right edges
            need no treatment because the canvas is full-bleed — it runs off
            both sides of the viewport, so there is no vertical seam to hide.
            That is the whole reason this is not a two-column grid: a canvas
            that stops short of the edge reads as a box sitting on the page,
            which is exactly what this hero must not look like.
            `groundFade` to Environment3d, which extends the shadow-catcher past
            the fog's far plane so the ground dissolves rather than ending at a
            rim. What is left is the seam between the canvas's own background
            and the page, and that cannot be matched from CSS: the composer
            tone-maps the background, so what lands on screen is not the hex the
            source names. These gradients cover the join instead of chasing it,
            and keep working if any of those colours change. */}
        <div style={fade("top")} />
        <div style={fade("bottom")} />
      </div>
      <DemoControls />
    </div>
  );
}

const STAGE_CLASS = "done-demo-stage";
const CANVAS_CLASS = "done-demo-canvas";
const PANEL_CLASS = "done-demo-panel";

/** An EASED ramp, not a linear one.
 *
 *  A two-stop `linear-gradient` is linear in alpha, and the eye does not read
 *  alpha linearly — the last few percent of a fade over a near-black ground
 *  stay visible as a distinct edge, which is the hard line between the two
 *  darks. These intermediate stops approximate an ease-out curve, so the last
 *  of the fade is spread over most of its length and there is no point at
 *  which the change becomes a boundary.
 *
 *  The stops are on `B.ground` at decreasing alpha rather than on `transparent`
 *  on purpose: `transparent` is `rgba(0,0,0,0)` in most engines, so a ramp to
 *  it drags every midpoint toward black and leaves a dirty band across a
 *  coloured ground. */
const rampStops = (rgb: string) =>
  [
    `${rgb} 0%`,
    `${rgb} 14%`,
    `rgba(${rgb.slice(4, -1)}, 0.86) 30%`,
    `rgba(${rgb.slice(4, -1)}, 0.62) 45%`,
    `rgba(${rgb.slice(4, -1)}, 0.38) 60%`,
    `rgba(${rgb.slice(4, -1)}, 0.18) 76%`,
    `rgba(${rgb.slice(4, -1)}, 0.06) 88%`,
    `rgba(${rgb.slice(4, -1)}, 0) 100%`,
  ].join(", ");

/** `B.ground` as an `rgb()` triple, so the stops above can vary only the alpha
 *  and stay correct if the token changes. */
const GROUND_RGB = (() => {
  const hex = B.ground.replace("#", "");
  const n = parseInt(hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
})();

const fade = (edge: "top" | "bottom"): React.CSSProperties => ({
  position: "absolute",
  left: 0,
  right: 0,
  [edge]: 0,
  // Deep enough that the ramp has room to disappear into. The bottom carries
  // more because that is the edge a visitor scrolls the page past.
  height: edge === "top" ? 90 : 150,
  pointerEvents: "none",
  background: `linear-gradient(to ${edge === "top" ? "bottom" : "top"}, ${rampStops(GROUND_RGB)})`,
});

/* The canvas fills the whole stage and the controls float ON it. There is no
   column, no panel and no scroll container anywhere in here, and that is the
   point: a canvas that stops short of the viewport edge reads as a box sitting
   on the page, and a bordered control panel reads as an application docked
   inside it. Both are the "small window of my app" impression this hero exists
   to avoid.

   `pointer-events: none` on the canvas is the guarantee behind the scroll
   promise at the top of this file — with the camera hands-off there is nothing
   left for it to receive, so taking it out of hit-testing means no device can
   have its gesture eaten by the hero. The controls opt back IN, since they are
   the only thing here a visitor is meant to hit. */
const STAGE_CSS = `
.${STAGE_CLASS} { position: relative; width: 100%; height: 100%; }
.${CANVAS_CLASS} { position: absolute; inset: 0; }
.${STAGE_CLASS} canvas { pointer-events: none !important; }
.${PANEL_CLASS} {
  position: absolute;
  right: clamp(20px, 6vw, 88px);
  top: 50%;
  transform: translateY(-50%);
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 15px;
  pointer-events: auto;
  /* The room is dark but not uniformly so, and it turns. A soft shadow on the
     text costs nothing and keeps every label legible whichever wall happens to
     be behind it, without putting a plate under the controls. */
  text-shadow: 0 1px 10px rgba(0, 0, 0, 0.75);
}

/* Stacked under the room, where there is no empty ground to float over. The
   controls get a real surface here ONLY because they now sit against the page
   rather than the render — floating text on the page background would read as
   body copy that happens to be clickable. */
@media (max-width: 900px) {
  .${PANEL_CLASS} {
    position: static;
    transform: none;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    gap: 12px 16px;
    margin: 0 clamp(16px, 5vw, 24px);
    padding: 14px;
    border-radius: 16px;
    background: ${B.raised};
    border: 1px solid ${B.hairline};
    text-shadow: none;
  }
  .${STAGE_CLASS} {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 12px;
    padding-bottom: 14px;
  }
  .${CANVAS_CLASS} { position: relative; inset: auto; flex: 1; min-height: 0; }
}
`;
