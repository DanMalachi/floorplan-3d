"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Canvas, events as createPointerEvents, useThree } from "@react-three/fiber";
import { CameraControls, Grid, Html, Line } from "@react-three/drei";
import { EffectComposer, ToneMapping, SMAA } from "@react-three/postprocessing";
import * as THREE from "three";
import { prefersReducedMotion } from "./reducedMotion";
import { CONTEXT, DPR, FRAME_BUFFER_TYPE, SHADOW, TONE_MAPPING } from "@/render/contract";
import { AmbientOcclusion } from "@/render/AmbientOcclusion";
import { useDprOverride } from "@/render/renderDebugFlags";
import { ShadowRefreshRig } from "@/render/ShadowRefreshRig";
import { ThumbCaptureRig } from "@/render/ThumbCaptureRig";
import { PerfRig } from "@/render/perf/PerfRig";
import { PerfHud } from "@/render/perf/PerfHud";
import { RenderContractCheck } from "@/render/RenderContractCheck";
import { RoomLights } from "@/render/RoomLights";
import { useLocale, useTranslations } from "next-intl";
import { useSceneStore, type WallViewMode, type EnvPreset, type Weather } from "@/store/useSceneStore";
import { PD, pdGlass, pdChip } from "@/ui/planDock/tokens";
import { useHover } from "@/ui/planDock/useHover";
import { Tooltip } from "@/ui/planDock/Tooltip";
import { CloudIcon, MoonIcon, RainIcon, SunIcon, WalkIcon } from "@/ui/planDock/icons";
import { Walls, dimLabelStyle } from "./WallMesh";
import { Floors, Ceilings } from "./FloorMesh";
import { Environment3d } from "./environment/Environment3d";
import { FurnitureLayer } from "./FurnitureLayer";
import { RunDrawGhost } from "@/parametric/RunDrawGhost";
import { CounterItemGhost } from "@/parametric/CounterItemGhost";
import { RunHandles } from "@/parametric/RunHandles";
import { FixtureLayer } from "./FixtureLayer";
import { SnapGridOverlays } from "./SnapGridViz";
import { MeasureTool } from "./MeasureTool";
import { WallTool } from "./buildTools/WallTool";
import { OpeningTool } from "./buildTools/OpeningTool";
import { BottomDock } from "@/ui/planDock/BottomDock";
import { BuildToolbar } from "@/ui/planDock/BuildToolbar";
import { BuildNavigator } from "@/ui/planDock/BuildNavigator";
import { Inspector } from "@/ui/planDock/inspector/Inspector";
import { PdToastHost } from "@/ui/planDock/toast";
import { CameraOfferChip } from "@/ui/planDock/cameraOffer";
import { StairLayer } from "./StairMesh";
import { CameraFocusRig } from "./CameraFocusRig";
import { CameraRig } from "./CameraRig";
import { AutoOrbitRig } from "./AutoOrbitRig";
import { CameraKeyboardRig } from "./CameraKeyboardRig";
import { CameraDoubleClickRig } from "./CameraDoubleClickRig";
import { CameraOfferRig } from "./CameraOfferRig";
import { suppressSceneEvent } from "./camera/panModifier";
import { registerViewportCanvas } from "./viewportCapture";
import { WalkthroughRig, WalkthroughHint, WalkthroughFovControl } from "./walkthrough/WalkthroughMode";
import { WALKTHROUGH_CONFIG } from "./walkthrough/config";

/** Keep Space-pan out of R3F edit handlers while leaving the same native
 *  event available to camera-controls on the canvas. This one boundary guard
 *  covers current and future scene tools without scattering modifier checks
 *  through every wall, fixture, furniture and parametric drag handler. */
function createViewportPointerEvents(store: Parameters<typeof createPointerEvents>[0]) {
  const manager = createPointerEvents(store);
  if (!manager.handlers) return manager;
  const handlers = manager.handlers;
  const guard = (name: keyof typeof handlers): EventListener => (event) => {
    if (!suppressSceneEvent(name, event)) handlers[name](event);
  };
  const guardedHandlers: typeof handlers = {
    onClick: guard("onClick"),
    onContextMenu: guard("onContextMenu"),
    onDoubleClick: guard("onDoubleClick"),
    onWheel: guard("onWheel"),
    onPointerDown: guard("onPointerDown"),
    onPointerUp: guard("onPointerUp"),
    onPointerLeave: guard("onPointerLeave"),
    onPointerMove: guard("onPointerMove"),
    onPointerCancel: guard("onPointerCancel"),
    onLostPointerCapture: guard("onLostPointerCapture"),
  };
  return { ...manager, handlers: guardedHandlers };
}

// Model center (plan x,y) and span for framing. Keyed on frameToken — only a
// whole-scene replace reframes; edits never shift the model under the cursor.
function useSceneBounds() {
  const frameToken = useSceneStore((s) => s.frameToken);
  return useMemo(() => {
    const scene = useSceneStore.getState().scene;
    if (scene.nodes.length === 0) {
      return { cx: 0, cz: 0, span: 6, halfX: 3, halfZ: 3 };
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of scene.nodes) {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
    }
    return {
      cx: (minX + maxX) / 2,
      cz: (minY + maxY) / 2, // plan y -> world z
      span: Math.max(maxX - minX, maxY - minY, 1),
      halfX: (maxX - minX) / 2, // footprint half-extents (world x / z)
      halfZ: (maxY - minY) / 2,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameToken]);
}

function FitCamera({ span }: { span: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as CameraControls | null;
  useEffect(() => {
    const dist = Math.max(span * 1.6, 5) + 3;
    const dir = new THREE.Vector3(0.7, 0.7, 1).normalize().multiplyScalar(dist);
    camera.near = 0.05;
    camera.far = dist * 20;
    camera.updateProjectionMatrix();
    if (controls && "setLookAt" in controls) {
      controls.setLookAt(dir.x, dir.y, dir.z, 0, 0, 0, !prefersReducedMotion());
    } else {
      camera.position.copy(dir);
    }
  }, [span, camera, controls]);
  return null;
}

/** Snap guides + live dimension labels during a drag (plan coords — rendered
 *  inside the recentered group). */
function DragVizLayer({ cx, cz, span }: { cx: number; cz: number; span: number }) {
  const viz = useSceneStore((s) => s.dragViz);
  if (!viz) return null;
  const ext = span * 1.2;
  return (
    <>
      {viz.guides.map((g, i) =>
        g.axis === "x" ? (
          <Line
            key={i}
            points={[[g.value, 0.02, cz - ext], [g.value, 0.02, cz + ext]]}
            color={PD.accent}
            transparent
            opacity={0.65}
            lineWidth={1.5}
          />
        ) : (
          <Line
            key={i}
            points={[[cx - ext, 0.02, g.value], [cx + ext, 0.02, g.value]]}
            color={PD.accent}
            transparent
            opacity={0.65}
            lineWidth={1.5}
          />
        ),
      )}
      {viz.labels.map((l, i) => (
        <Html key={`l${i}`} position={l.world} center style={{ pointerEvents: "none" }}>
          <div style={dimLabelStyle}>{l.text}</div>
        </Html>
      ))}
    </>
  );
}

// `labelKey` rather than `label`: these are MODULE SCOPE, and a module cannot
// call `useTranslations()` — the hook only exists inside a component. The id is
// what the store compares on and does not move; only the word does, out to the
// catalogue and back at the render site. Same shape as `NavItem.labelKey`
// (src/landing/nav.ts) and `ALL_MODES` (design/page.tsx).
const WALL_MODES: { id: WallViewMode; labelKey: string }[] = [
  { id: "full", labelKey: "full" },
  { id: "cutaway", labelKey: "cutaway" },
  { id: "top", labelKey: "top" },
];

const ENV_PRESETS: { id: EnvPreset; labelKey: string }[] = [
  { id: "none", labelKey: "none" },
  { id: "suburb", labelKey: "suburb" },
  { id: "city", labelKey: "city" },
];

// `label` is the word and nothing else. The weather emoji used to be baked into
// the label string itself (`"<rain emoji> Rain"`), which made the label
// untranslatable and un-restylable at once — the icon is a separate field now,
// so the render site draws it and the label stays a word.
const WEATHERS: { id: Weather; labelKey: string; Icon: (p: { size?: number }) => React.ReactElement }[] = [
  { id: "clear", labelKey: "clear", Icon: SunIcon },
  { id: "cloudy", labelKey: "cloudy", Icon: CloudIcon },
  { id: "rain", labelKey: "rain", Icon: RainIcon },
];

/** A chip button in Viewport's own panels, with hover. `useHover` is a hook, so
 *  each chip in a row needs its own component to hold the flag.
 *  Presentation only — every one of these is a store setter it already had.
 *
 *  Note the manual spread. `pdChip` accepts an `extra` argument and DROPS it
 *  (see tokens.ts), unlike the `chip()` this replaced, which spread it — so
 *  passing `extra` straight through would silently lose every override here. */
function PanelChip({
  active,
  extra,
  onClick,
  tip,
  children,
}: {
  active: boolean;
  extra?: React.CSSProperties;
  onClick: () => void;
  /** Hover explanation, rendered in the app's glass Tooltip. Never a native
   *  `title` — that is the white Chrome window Dan asked us to get rid of. */
  tip?: string;
  children: React.ReactNode;
}) {
  const [hov, bind] = useHover();
  const btn = (
    <button {...bind} onClick={onClick} style={{ ...pdChip(active, undefined, hov), ...extra }}>
      {children}
    </button>
  );
  // `bottom`, not the default `top`: every panel that uses this chip lives in
  // the upper-left of the viewport — WallModeToggle sits just under ProjectBar
  // — so a tooltip placed above collides with the bar instead of clearing it.
  return tip ? (
    <Tooltip label={tip} placement="bottom">
      {btn}
    </Tooltip>
  ) : (
    btn
  );
}

/** 13.5 → "1:30 PM" (English) or "13:30" (Hebrew, 24-hour) for the time
 *  slider readout. Hebrew readers expect a 24-hour clock; AM/PM is an
 *  English-locale convention, not a translation of it. */
function fmtHour(t: number, locale: string): string {
  const h24 = Math.floor(t) % 24;
  const m = Math.round((t - Math.floor(t)) * 60) % 60;
  const d = new Date(2000, 0, 1, h24, m);
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: locale !== "he",
  }).format(d);
}

/** Scene panel (View mode): environment preset + a fun time-of-day slider. */
function ScenePanel() {
  const t = useTranslations("editor");
  const locale = useLocale();
  const preset = useSceneStore((s) => s.envPreset);
  const setEnvPreset = useSceneStore((s) => s.setEnvPreset);
  const time = useSceneStore((s) => s.timeOfDay);
  const setTimeOfDay = useSceneStore((s) => s.setTimeOfDay);
  const weather = useSceneStore((s) => s.weather);
  const setWeather = useSceneStore((s) => s.setWeather);
  const walkthroughActive = useSceneStore((s) => s.walkthroughActive);
  const setWalkthroughActive = useSceneStore((s) => s.setWalkthroughActive);
  const DayNightIcon = time >= 6 && time < 19 ? SunIcon : MoonIcon;
  return (
    <div style={{ position: "absolute", insetInlineStart: 14, top: 112, width: 216, display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", ...pdGlass() }}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>{t("scene")}</div>
      <PanelChip
        active={walkthroughActive}
        onClick={() => setWalkthroughActive(!walkthroughActive)}
        extra={{
          borderRadius: 8,
          border: "none",
          fontSize: 12,
          padding: "7px 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        {walkthroughActive ? (
          t("exitWalkthrough")
        ) : (
          <>
            <WalkIcon size={14} /> {t("walkThrough")}
          </>
        )}
      </PanelChip>
      <div style={{ display: "flex", gap: 4 }}>
        {ENV_PRESETS.map((p) => (
          <PanelChip
            key={p.id}
            active={preset === p.id}
            onClick={() => setEnvPreset(p.id)}
            // No background/color override: the active state is `pdChip`'s
            // accent TINT, the same as every chip in the dock. These used to
            // force a solid #0a84ff fill with white text, which is precisely
            // why Dan read this panel as belonging to a different app.
            extra={{ flex: 1, fontSize: 11.5, borderRadius: 999 }}
          >
            {t(`envPresets.${p.labelKey}`)}
          </PanelChip>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: preset === "none" ? 0.4 : 1 }}>
        {/* The explanation hangs off the ICON, not the row. Tooltip wraps its
            child in an inline-flex span, which on this row would collapse a
            flex item that is meant to stretch — and the icon is where the eye
            goes when the slider looks disabled anyway. */}
        {preset === "none" ? (
          <Tooltip label={t("timeOfDayNoEffect")}>
            <span style={{ lineHeight: 0, color: PD.textSecondary }}>
              <DayNightIcon size={16} />
            </span>
          </Tooltip>
        ) : (
          <span style={{ lineHeight: 0, color: PD.textSecondary }}>
            <DayNightIcon size={16} />
          </span>
        )}
        <input
          type="range"
          min={0}
          max={24}
          step={0.25}
          value={time}
          onChange={(e) => setTimeOfDay(Number(e.target.value))}
          disabled={preset === "none"}
          aria-label={t("timeOfDay")}
          aria-valuetext={fmtHour(time, locale)}
          style={{ flex: 1, accentColor: PD.accent }}
        />
      </div>
      <div style={{ fontSize: 11, color: PD.textTertiary, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
        {fmtHour(time, locale)}
      </div>
      {preset !== "none" && (
        <div style={{ display: "flex", gap: 4 }}>
          {WEATHERS.map((w) => (
            <PanelChip
              key={w.id}
              active={weather === w.id}
              onClick={() => setWeather(w.id)}
              // Same as the preset row: the tint carries "active". `display:
              // flex` stays because the icon needs to sit on the text baseline.
              extra={{
                flex: 1, fontSize: 11, borderRadius: 999,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                padding: "5px 6px",
              }}
            >
              <w.Icon size={12} /> {t(`weather.${w.labelKey}`)}
            </PanelChip>
          ))}
        </div>
      )}
    </div>
  );
}

/** Sims wall-view control: Full / Cutaway / Top, plus a Ceilings toggle. */
function WallModeToggle() {
  const t = useTranslations("editor");
  const wallMode = useSceneStore((s) => s.wallMode);
  const setWallMode = useSceneStore((s) => s.setWallMode);
  const showCeilings = useSceneStore((s) => s.showCeilings);
  const setShowCeilings = useSceneStore((s) => s.setShowCeilings);
  return (
    <div
      style={{
        position: "absolute",
        insetInlineStart: 14,
        top: 64,
        display: "flex",
        gap: 3,
        padding: 4,
        ...pdGlass({ borderRadius: 999 }),
      }}
    >
      {WALL_MODES.map((m) => (
        <PanelChip
          key={m.id}
          active={wallMode === m.id}
          extra={{ borderRadius: 999, border: "none", fontSize: 11.5 }}
          onClick={() => setWallMode(m.id)}
        >
          {t(`wallModes.${m.labelKey}`)}
        </PanelChip>
      ))}
      <span style={{ width: 1, alignSelf: "stretch", margin: "3px 2px", background: PD.hairline }} />
      <PanelChip
        active={showCeilings}
        tip={t("showCeilings")}
        extra={{
          borderRadius: 999,
          border: "none",
          fontSize: 11.5,
          opacity: wallMode === "full" ? 1 : 0.5,
        }}
        onClick={() => setShowCeilings(!showCeilings)}
      >
        {t("ceiling")}
      </PanelChip>
    </div>
  );
}

/** "⌘" on Mac/iPhone/iPad, "Ctrl+" everywhere else, for the undo/redo hint.
 *  Starts as "Ctrl+" (a guess, not a locale) so server and first client
 *  render match — no hydration mismatch — then corrects itself in an effect
 *  once `navigator` is available. */
function useModKey(): string {
  const [mod, setMod] = useState("Ctrl+");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) {
      setMod("⌘");
    }
  }, []);
  return mod;
}

/** Selection + undo status pill. */
function StatusOverlay() {
  const t = useTranslations("editor");
  const mod = useModKey();
  const sel3d = useSceneStore((s) => s.sel3d);
  const past = useSceneStore((s) => s.scenePast.length);
  const future = useSceneStore((s) => s.sceneFuture.length);
  if (!sel3d && past === 0 && future === 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        insetInlineStart: 14,
        // Above the Plan Dock's corner panel, not under it. This pill renders
        // ONLY in build and furnish (see the call site) — and those are exactly
        // the two modes where a 208x224 panel is pinned to this same corner:
        // BuildNavigator.tsx:74 in build, BottomDock.tsx:403's NavigatorPanel in
        // furnish, both at `insetInlineStart: 16, bottom: 16`. At the old
        // `bottom: 14` the overlap measured 208x31 — 72% of the pill — in both
        // locales and both modes, and since both boxes are `z-index: auto` with
        // the same stacking parent, DOM order decided it and the panel won. So
        // the pill was never once fully visible in either mode it exists in.
        //
        // 16 + 224 + 10 clearance. The one case this does not cover: in furnish
        // the item dock beside the navigator is resizable, and the pill is
        // ~272px wide against a 226px leading column, so dragging that dock
        // above ~234px tall reaches the pill's trailing end again. Left as is
        // rather than coupling this file to the dock's height — that is exactly
        // the cross-layer reach this tree is protected from.
        bottom: 250,
        padding: "7px 12px",
        fontSize: 12,
        pointerEvents: "none",
        display: "flex",
        gap: 12,
        ...pdGlass({ borderRadius: 999 }),
      }}
    >
      {sel3d ? (
        <span style={{ color: PD.accentText }}>
          {t("selectedHint", { kind: t(`kinds.${sel3d.kind}`) })}
        </span>
      ) : (
        <span style={{ color: PD.textSecondary }}>{t("nothingSelected")}</span>
      )}
      <span style={{ color: PD.textTertiary }}>
        {t("undoRedo", { mod, past, future })}
      </span>
    </div>
  );
}

// Paint-brush cursor shown while a Decorate brush is active. Inline SVG data
// URI (no asset fetch); hotspot at the bristle tip.
const BRUSH_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><g transform="rotate(45 14 14)"><rect x="11" y="3" width="6" height="11" rx="1.5" fill="#3a3a3a" stroke="#ffffff" stroke-width="1.3"/><rect x="10.5" y="13" width="7" height="4" fill="#ffffff" stroke="#3a3a3a" stroke-width="0.9"/><path d="M11 17 h6 l-1.2 6 h-3.6 z" fill="#0a84ff" stroke="#ffffff" stroke-width="0.9"/></g></svg>',
)}") 14 25, crosshair`;

/**
 * `chrome` — set false to mount the scene with Viewport's OWN control panels
 * suppressed (`ScenePanel`, `WallModeToggle`), leaving the caller to supply its
 * own. Added 2026-08-31 for the marketing site's hero demo (src/landing/), which
 * needs the real renderer but a curated, brand-styled subset of controls rather
 * than the app's full panel set — the two panels above are the only chrome here
 * that renders unconditionally, so they are the only two gated.
 *
 * PROTECTED FILE (docs/PROTECTED_PATHS.md, CLAUDE.md rule 1): this edit was
 * approved by Dan before being made. It is deliberately additive — the default
 * is `true`, so every existing call site (src/app/design/page.tsx,
 * src/collab/CollabRoom.tsx) keeps exactly today's behaviour and nothing about
 * the app changes. If you need to hide more chrome, prefer widening this flag's
 * meaning over adding a second one, and ask first.
 *
 * `autoOrbit` — set true to take the camera away from the user entirely and
 * orbit the model slowly instead (see AutoOrbitRig.tsx). Added 2026-09-01, also
 * approved by Dan, and deliberately NOT folded into `chrome`: they are separate
 * axes, and a chrome-less embed that still wants a camera the visitor can drive
 * has to remain expressible.
 *
 * The reason it exists is scroll, not style. CameraControls binds the wheel on
 * the canvas, so a hero that owns the camera also owns the page's scroll —
 * the visitor scrolls, the model dollies, the page stays put. Turning the
 * camera off is what hands scrolling back to the document.
 *
 * It suppresses THREE things, all required (AutoOrbitRig.tsx explains why each
 * one is load-bearing): `CameraControls`' input, `<CameraRig>` (which writes
 * the mouse/touch map in an effect), and `<CameraKeyboardRig>` (which binds
 * keydown on WINDOW, so on a marketing page it would eat WASD for the whole
 * document). Default `false` — every existing call site is unchanged.
 */
export function Viewport({
  collabOverlay,
  chrome = true,
  autoOrbit = false,
}: {
  collabOverlay?: React.ReactNode;
  chrome?: boolean;
  autoOrbit?: boolean;
} = {}) {
  const scene = useSceneStore((s) => s.scene);
  const { cx, cz, span, halfX, halfZ } = useSceneBounds();
  const wrapRef = useRef<HTMLDivElement>(null);
  const tv = useTranslations("editor");
  const keysId = useId();
  const hovering = useSceneStore((s) => s.hover3d !== null);
  // A walkthrough door swing folds its per-frame writes into a gesture too
  // (WalkthroughMode.tsx), but it isn't a drag: it shouldn't tear down N8AO
  // or lock out camera controls the way dragging furniture/walls does.
  const dragging = useSceneStore((s) => s.gestureBase !== null && !s.doorGestureActive);
  // Camera arbitration moved to <CameraRig> below. The tool-armed states that
  // used to switch the whole camera off now cost only the LEFT button, so
  // orbit/pan/zoom stay live at all times — see CameraRig.tsx for why the old
  // `enabled={!toolBusy}` gate had to go and what replaced it.
  const appMode = useSceneStore((s) => s.appMode);
  const wallMode = useSceneStore((s) => s.wallMode);
  const envPreset = useSceneStore((s) => s.envPreset);
  const weather = useSceneStore((s) => s.weather);
  const brush = useSceneStore((s) => s.brush);
  const walkthroughActive = useSceneStore((s) => s.walkthroughActive);
  const [walkthroughLocked, setWalkthroughLocked] = useState(false);
  const [walkthroughFov, setWalkthroughFov] = useState(WALKTHROUGH_CONFIG.fovDeg);
  // P2 T5: WalkthroughRig now flies the camera back OUT on exit, mirroring
  // its fly-IN on entry — so it has to stay mounted (and CameraControls has
  // to stay disabled) for the whole outro, not just until `walkthroughActive`
  // flips. That flag itself still flips the instant the user asks to leave
  // (Esc inside the rig, or the Scene panel's "Exit walkthrough" button below
  // — both routes already just call setWalkthroughActive(false)), so every
  // OTHER reader of it (the button's own label/pressed state) keeps behaving
  // exactly as before. Only the MOUNT lags behind, and only WalkthroughRig's
  // own onExitComplete — fired once its exit flight lands — brings it down.
  const [walkthroughMounted, setWalkthroughMounted] = useState(walkthroughActive);
  useEffect(() => {
    if (walkthroughActive) setWalkthroughMounted(true);
  }, [walkthroughActive]);
  // Trackpad pinch fires `wheel` with `ctrlKey: true` (the cross-platform
  // pinch signal — see camera/inputVocabulary.ts's own use of it) or, on
  // Safari, the non-standard `gesturestart/change/end` events instead.
  // CameraControls' own wheel handler already calls `preventDefault` on every
  // event it processes while `enabled` — see node_modules/camera-controls'
  // `onMouseWheel` — so guarding here too during orbit/View would be
  // redundant at best; on Safari, preventing `gesturestart` unconditionally
  // turned out to also suppress the `wheel` events camera-controls needed for
  // its own dolly, breaking trackpad zoom there (caught 2026-09-26, same
  // session as this fix). Walkthrough is the one place with a real gap: it
  // sets `enabled={false}` below without unmounting CameraControls, and a
  // disabled CameraControls returns before its own preventDefault — so a
  // trackpad pinch during Walkthrough falls through to the browser's native
  // page zoom (reads as "view mode is stuck zoomed in"). Walkthrough has no
  // wheel-zoom of its own (FOV slider only, by design), so this guard is safe
  // to scope exactly to `walkthroughMounted` — the same flag that gates
  // CameraControls' `enabled` prop — and never fires while camera-controls is
  // the one actually driving the wheel.
  useEffect(() => {
    if (!walkthroughMounted) return;
    const el = wrapRef.current;
    if (!el) return;
    const stop = (e: Event) => e.preventDefault();
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", stop);
    el.addEventListener("gesturechange", stop);
    el.addEventListener("gestureend", stop);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", stop);
      el.removeEventListener("gesturechange", stop);
      el.removeEventListener("gestureend", stop);
    };
  }, [walkthroughMounted]);
  // The CAD grid is an editing aid; hide it in the immersive View presets, and
  // whenever the caller has asked for no chrome at all — the grid is an
  // affordance for someone editing, not part of the model, so a presentation
  // embed showing it reads as a screenshot of a tool rather than a home.
  const showGrid = chrome && (envPreset === "none" || appMode !== "view");

  // `?dpr=` diagnostic hatch — null unless the URL asks, in which case the
  // contract's [1, 2] clamp is replaced by that single clamped value for this
  // page load only. See renderDebugFlags.ts for the measurement it exists for.
  const dprOverride = useDprOverride();

  // Render on demand unless something is genuinely animating.
  //
  // The default R3F loop renders at 60fps forever, so a laptop left sitting on a
  // finished design draws ~216,000 identical frames an hour. Under "demand" R3F
  // renders only when something asks it to — and it asks on its own for every
  // React-driven change (props, mounts, unmounts), which covers drags, undo/redo,
  // mode switches and the whole scene graph. What it cannot see is code that
  // mutates three objects imperatively, so each of those paths now calls
  // `invalidate()` explicitly (hover glow, damped fades, the WASD channel, async
  // texture arrivals).
  //
  // The three exceptions below are continuous by nature and stay on "always":
  //   - walkthrough is a first-person simulation with pointer-lock mouse-look;
  //     keyed on `walkthroughMounted` (not `walkthroughActive`) so the exit
  //     flight still lands and `onExitComplete` fires.
  //   - Suburb drives a wind shader every frame, unconditionally.
  //   - Rain drives a streak shader every frame, and only mounts in rain.
  // These two shaders also clamp their own `dt` with `Math.min(dt, 0.05)`, so
  // under sparse frames they would time-dilate rather than merely stutter —
  // which is why they need real frames and not an `invalidate()` on their tick.
  //
  // City is deliberately absent: it has no `useFrame` at all (its night glow is
  // a layout effect on timeOfDay), and the time-of-day slider is event-driven.
  const needsContinuousFrames =
    walkthroughMounted || envPreset === "suburb" || (envPreset !== "none" && weather === "rain");
  const offset = useMemo(() => ({ cx, cz }), [cx, cz]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    const s = useSceneStore.getState();
    const mod = e.ctrlKey || e.metaKey;
    // Letter shortcuts match on e.code (physical key), not e.key: a Hebrew/
    // Russian/... layout types a different character on the same key, and
    // e.key-based matching silently dead-keys R/Z/Y for those users.
    // Redo is Ctrl+Y only — Ctrl+Shift+Z is deliberately NOT a second alias
    // for it. Two shortcuts for one command is two things to learn and one
    // more chance to hit the wrong one, same reasoning as the left/right
    // mouse-button split.
    if (mod && e.code === "KeyZ" && !e.shiftKey) {
      s.undoScene();
    } else if (mod && e.code === "KeyY") {
      s.redoScene();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      s.deleteSelected3d();
    } else if (e.code === "KeyR" && !mod) {
      const step = (Math.PI / 12) * (e.shiftKey ? -1 : 1); // 15° per tap
      if (s.placing) s.rotatePlacing(step);
      else if (s.sel3d?.kind === "furniture") s.rotateSelectedFurniture(step);
      else if (s.sel3d?.kind === "fixture") s.rotateSelectedFixture(step);
      else return;
    } else if (e.key === "Escape") {
      if (s.brush) s.setBrush(null);
      else if (s.placing) s.setPlacing(null);
      else if (s.placingCounter) s.setPlacingCounter(null);
      else if (s.gestureBase) s.cancelGesture();
      else s.setSel3d(null);
    } else {
      return; // not ours — let it bubble (2D editor listens on window)
    }
    // Handled here: keep the 2D trace editor's window listener out of it.
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      ref={wrapRef}
      // Accessibility (approved 2026-09-18, docs/PROTECTED_PATHS.md): the
      // editor canvas is a focusable widget that owns its own keys, so it is an
      // "application" with a name and a spoken key list. The chrome-less embed
      // (landing hero) has no editing to do from the keyboard: it is an image
      // and stays out of the Tab order.
      {...(chrome
        ? {
            tabIndex: 0,
            role: "application",
            "aria-label": tv("viewportLabel"),
            "aria-describedby": keysId,
          }
        : { role: "img", "aria-label": tv("viewportPreviewLabel") })}
      onKeyDown={onKeyDown}
      onPointerDown={() => wrapRef.current?.focus()}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        // No `outline: none`: the global :focus-visible ring shows on keyboard
        // focus only, drawn INSIDE the edge because this box fills the screen.
        outlineOffset: -3,
        cursor: brush ? BRUSH_CURSOR : dragging ? "grabbing" : hovering ? "pointer" : "auto",
      }}
    >
      {chrome && (
        <span id={keysId} className="fp-sr-only">
          {tv("viewportKeys")}
        </span>
      )}
      <Canvas
        events={createViewportPointerEvents}
        // Every renderer value below is recorded in src/render/contract.ts and
        // checked at startup by <RenderContractCheck>. Values are passed
        // explicitly even where they match the library default — see
        // docs/render-contract.md §1.1 for why a default is not the same as a
        // decision.
        shadows={{ type: SHADOW.type }}
        camera={{ position: [9, 8, 11], fov: 50 }}
        dpr={dprOverride ?? DPR}
        frameloop={needsContinuousFrames ? "always" : "demand"}
        // `flat` disables the renderer's own tonemapping so the ToneMapping
        // effect in the composer owns the display transform (avoids double
        // tonemapping). The composer forces NoToneMapping too; this is the
        // belt to its braces.
        flat
        // Context attributes are contract values (§1.1). Note this object
        // SPREADS over R3F's own defaults, which is exactly how `antialias:
        // true` was in force here unnoticed, allocating and resolving a 4x MSAA
        // backbuffer every frame to anti-alias a single fullscreen triangle.
        // `preserveDrawingBuffer` is gone: thumbnails are captured inside the
        // render loop by <ThumbCaptureRig>, so the drawing buffer no longer has
        // to survive compositing on every frame of the app's life.
        gl={{ antialias: CONTEXT.antialias, alpha: CONTEXT.alpha }}
        onCreated={({ gl }) => registerViewportCanvas(gl.domElement)}
        onPointerMissed={() => useSceneStore.getState().setSel3d(null)}
      >
        {/* Sky, sun, fog, IBL and ground — driven by the Scene preset + time. */}
        <Environment3d span={span} halfX={halfX} halfZ={halfZ} groundFade={!chrome} groundShadow={!autoOrbit} />

        {/* Recenter the model over the origin (reframes only on scene load). */}
        <group position={[-cx, 0, -cz]}>
          <Floors scene={scene} />
          <Ceilings scene={scene} />
          <RoomLights scene={scene} />
          <Walls scene={scene} offset={offset} />
          <FurnitureLayer scene={scene} offset={offset} />
          <RunDrawGhost offset={offset} />
          <CounterItemGhost offset={offset} />
          <RunHandles offset={offset} />
          <FixtureLayer scene={scene} offset={offset} />
          <MeasureTool offset={offset} />
          <WallTool offset={offset} />
          <OpeningTool offset={offset} />
          <StairLayer scene={scene} />
          <CameraFocusRig offset={offset} />
          <DragVizLayer cx={cx} cz={cz} span={span} />
          {/* Snap grids (floor/ceiling) shown while placing or dragging. */}
          <SnapGridOverlays />
          {/* Collaborators' selection markers (plan coords, inside the group). */}
          {collabOverlay}
        </group>

        {showGrid && (
          <Grid
            args={[200, 200]}
            cellSize={1}
            cellThickness={0.5}
            cellColor="#26262d"
            sectionSize={5}
            sectionThickness={1}
            sectionColor="#33333c"
            infiniteGrid
            fadeDistance={Math.max(span * 4, 40)}
            position={[0, -0.01, 0]}
          />
        )}
        <CameraControls
          makeDefault
          // Walkthrough is the ONE legitimate use of `enabled` — it replaces
          // the camera wholesale rather than restricting it. Every tool state
          // is handled by <CameraRig>, one button at a time. Keyed on
          // walkthroughMounted, not walkthroughActive: re-enabling this the
          // instant the user asks to exit (rather than once the rig's own
          // exit flight lands) would let a stray drag during the outro move
          // CameraControls' target, so the handoff snapped to wherever THAT
          // went instead of where the flight just visually landed.
          enabled={!walkthroughMounted}
          smoothTime={0.18}
          draggingSmoothTime={0.06}
        />
        <FitCamera span={span} />
        {/* After FitCamera: the rig's far plane is derived from the dolly
            limit and must win over FitCamera's opening-shot value. */}
        {!autoOrbit && <CameraRig span={span} halfX={halfX} halfZ={halfZ} />}
        {/* P2 T2/T3: double-click-to-frame and the WASD/QE/T/F/Home keyboard
            channel. Separate files, not folded into CameraRig, so its own
            diff stays the button-map/envelope it already was. */}
        {!autoOrbit && <CameraKeyboardRig halfX={halfX} halfZ={halfZ} />}
        {/* Mounted after FitCamera so its opening shot is the one that lands. */}
        {autoOrbit && <AutoOrbitRig span={span} />}
        <CameraDoubleClickRig />
        <CameraOfferRig />
        {walkthroughMounted && (
          <WalkthroughRig
            scene={scene}
            offset={offset}
            fovDeg={walkthroughFov}
            exitRequested={!walkthroughActive}
            onExitComplete={() => setWalkthroughMounted(false)}
            onLockChange={setWalkthroughLocked}
          />
        )}

        {/* Photographic pass: ambient occlusion grounds furniture and darkens
            corners, ACES tonemapping, SMAA. AO is the cost centre — dropped
            while dragging and in Top view. */}
        {/* Chain order is fixed by contract §2.3: HDR scene-space effects, then
            ToneMapping, then LDR display-space effects. Bloom/SSR/DoF go ABOVE
            the ToneMapping line; vignette/LUT/grain go below. An HDR effect
            placed after tone mapping operates on clamped values and silently
            stops meaning anything. */}
        <EffectComposer
          multisampling={0}
          enableNormalPass={false}
          frameBufferType={FRAME_BUFFER_TYPE}
        >
          {/* Stays mounted in every mode; only `enabled` changes. Unmounting it
              also tore down the composer's depth texture and depth render
              target, churning ~250MB of allocation at each drag boundary. */}
          <AmbientOcclusion
            enabled={!dragging && wallMode !== "top"}
            aoRadius={0.7}
            intensity={2.4}
            distanceFalloff={1}
            halfRes
          />
          <ToneMapping mode={TONE_MAPPING.operator} />
          <SMAA />
        </EffectComposer>
        {/* Shadow maps refresh on change, not every frame. */}
        <ShadowRefreshRig />
        {/* Phase 0 instrument. Renders nothing and subscribes to nothing
            unless the page was opened with `?perf=1`. */}
        <PerfRig />
        {/* Serves thumbnail requests from inside the loop, at priority 2 —
            after the composer, before the browser composites. */}
        <ThumbCaptureRig />
        <RenderContractCheck />
      </Canvas>
      {(appMode === "build" || appMode === "furnish") && <StatusOverlay />}
      {(appMode === "build" || appMode === "furnish") && <Inspector />}
      {appMode === "build" && <BuildToolbar />}
      {appMode === "build" && <BuildNavigator />}
      {appMode === "furnish" && <BottomDock />}
      {chrome && appMode === "view" && <ScenePanel />}
      <WalkthroughHint active={walkthroughActive} locked={walkthroughLocked} />
      <WalkthroughFovControl active={walkthroughActive} fovDeg={walkthroughFov} onChange={setWalkthroughFov} />
      {chrome && <WallModeToggle />}
      <CameraOfferChip />
      <PdToastHost />
      <PerfHud />
    </div>
  );
}
