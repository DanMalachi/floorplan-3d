"use client";

// Guide 12: the `?` button and the help panel it opens. Everything the guides
// teach can be found again here: the camera controls for the person's own
// device, every guide (this step's first), the welcome, and a way to reach us.
// The button pulses until the panel has been opened once; `?` on the keyboard
// opens it from anywhere.

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import type React from "react";
import { useTranslations } from "next-intl";
import { useSceneStore, type AppMode } from "@/store/useSceneStore";
import { LEGAL_FACTS } from "@/legal/facts";
import { PD, pdGlass } from "@/ui/planDock/tokens";
import { useHover } from "@/ui/planDock/useHover";
import { Tooltip } from "@/ui/planDock/Tooltip";
import { CARD_FILL, CARD_Z, ControlRow, DeviceSwitch, useIsRtl } from "./GuideCard";
import { GUIDE_CSS, DoubleClickIcon, MouseIcon, PadIcon, SpaceDragIcon } from "./demos";
import { guideStore, useGuides } from "./guideStore";
import { GUIDE_IDS, GUIDE_STAGE, type GuideId, type GuideStage } from "./guides";

/** Where each guide lives, so reopening one from help takes the person there
 *  and the card has its controls to point at. */
const STAGE_MODE: Record<GuideStage, AppMode | null> = {
  start: null,
  trace: "trace",
  build: "build",
  furnish: "furnish",
  view: "view",
};
const TRACE_STEP: Partial<Record<GuideId, number>> = { scale: 2, scale2: 2, walls: 3, openings: 4, build: 6 };

const stageOf = (mode: AppMode): GuideStage => (mode === "trace" ? "trace" : mode);

/** Reopen a guide from help: go to its mode (and trace step, when that step
 *  is open to the person), then show it. */
export function showGuide(id: GuideId) {
  const scene = useSceneStore.getState();
  const mode = STAGE_MODE[GUIDE_STAGE[id]];
  // The camera card belongs to any 3D mode; don't pull someone out of theirs.
  const stay = id === "camera" && scene.appMode !== "trace";
  if (mode && scene.appMode !== mode && !stay) scene.setAppMode(mode);
  const step = TRACE_STEP[id];
  if (step && scene.image && (step === 2 || scene.metersPerPixel !== null)) scene.setTraceStep(step);
  if (id === "walk" && !useSceneStore.getState().walkthroughActive) scene.setWalkthroughActive(true);
  const guides = guideStore().getState();
  guides.setHelpOpen(false);
  guides.replay(id);
}

const typingTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement && !!t.closest('input, textarea, select, [contenteditable="true"]');

/** The top-bar `?`. Lives in the page's top-right cluster. */
export function HelpButton() {
  const t = useTranslations("editor.guides.help");
  // This button is server-rendered with the page, and the guide store only
  // exists in the browser (it reads localStorage). The server snapshot is
  // "closed, already opened": no pulse in the HTML, so a returning visitor
  // never sees one flash in, and the store is never created on the server.
  const subscribe = (cb: () => void) => guideStore().subscribe(cb);
  const open = useSyncExternalStore(subscribe, () => guideStore().getState().helpOpen, () => false);
  const opened = useSyncExternalStore(subscribe, () => guideStore().getState().helpOpened, () => true);
  const [hovered, hoverBind] = useHover();

  // `?` anywhere outside a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey || typingTarget(e.target)) return;
      const g = guideStore().getState();
      // The welcome is a modal: nothing opens over or under it.
      if (g.active === "welcome") return;
      e.preventDefault();
      g.setHelpOpen(!g.helpOpen);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Tooltip label={t("button")} placement="bottom">
      <button
        {...hoverBind}
        data-guide="help-button"
        aria-expanded={open}
        aria-keyshortcuts="?"
        onClick={() => guideStore().getState().setHelpOpen(!open)}
        style={{
          position: "relative",
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "none",
          cursor: "pointer",
          ...pdGlass({ borderRadius: 999, padding: 0 }),
          color: open || hovered ? PD.textPrimary : PD.textSecondary,
          fontFamily: PD.fontUi,
          fontWeight: 800,
          fontSize: 15,
          transition: "color 140ms ease",
        }}
      >
        <span aria-hidden>?</span>
        <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{t("button")}</span>
        {!opened && (
          <>
            <style>{GUIDE_CSS}</style>
            <span
              aria-hidden
              className="dg-pulse"
              style={{
                position: "absolute",
                inset: -5,
                borderRadius: 999,
                border: `2px solid ${PD.accentText}`,
                pointerEvents: "none",
              }}
            />
          </>
        )}
      </button>
    </Tooltip>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  const rtl = useIsRtl();
  return (
    <h3
      style={{
        margin: 0,
        fontSize: 11.5,
        letterSpacing: rtl ? 0 : "0.08em",
        textTransform: "uppercase",
        color: PD.textTertiary,
        fontWeight: 700,
      }}
    >
      {children}
    </h3>
  );
}

function GuideLink({ id, current }: { id: GuideId; current?: boolean }) {
  const t = useTranslations("editor.guides.names");
  const rtl = useIsRtl();
  const [hovered, bind] = useHover();
  return (
    <button
      type="button"
      {...bind}
      onClick={() => showGuide(id)}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "9px 12px",
        borderRadius: 10,
        border: "none",
        cursor: "pointer",
        textAlign: "start",
        fontFamily: PD.fontUi,
        fontSize: 14,
        fontWeight: 600,
        textShadow: "none",
        background: current ? PD.accentTint : hovered ? PD.surfaceMutedHover : PD.surfaceMuted,
        color: current ? PD.accentText : PD.textPrimary,
      }}
    >
      <span>{t(id)}</span>
      {/* A chevron that points along the reading direction. */}
      <span aria-hidden style={{ color: PD.textTertiary, fontSize: 18, lineHeight: 1 }}>
        {rtl ? "‹" : "›"}
      </span>
    </button>
  );
}

/** The panel itself. Rendered by GuideHost. */
export function HelpPanel() {
  const t = useTranslations("editor.guides.help");
  const open = useGuides((s) => s.helpOpen);
  const device = useGuides((s) => s.device);
  const guidesOn = useGuides((s) => s.enabled);
  const available = useGuides((s) => s.available);
  const appMode = useSceneStore((s) => s.appMode);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus moves in on open and back to the `?` on close.
  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => {
      const q = document.querySelector<HTMLElement>('[data-guide="help-button"]');
      (q ?? back)?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  const close = () => guideStore().getState().setHelpOpen(false);
  const mouse = device === "mouse";
  const stage = stageOf(appMode);
  const listed = GUIDE_IDS.filter((id) => id !== "welcome" && available.includes(id));
  const here = listed.filter((id) => GUIDE_STAGE[id] === stage);
  const elsewhere = listed.filter((id) => GUIDE_STAGE[id] !== stage);

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close();
        }
      }}
      style={{
        ...pdGlass({ background: CARD_FILL, borderRadius: 22 }),
        position: "fixed",
        top: 62,
        bottom: 14,
        insetInlineEnd: 14,
        width: "min(410px, calc(100vw - 28px))",
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        overflowY: "auto",
        zIndex: CARD_Z + 1,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h2 id={titleId} style={{ margin: 0, fontSize: 22, fontWeight: 800, marginInlineEnd: "auto" }}>
          {t("title")}
        </h2>
        <DeviceSwitch />
        <button
          ref={closeRef}
          type="button"
          aria-label={t("close")}
          onClick={close}
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            border: "none",
            cursor: "pointer",
            background: PD.surfaceMuted,
            color: PD.textPrimary,
            display: "grid",
            placeItems: "center",
            flex: "none",
          }}
        >
          <svg viewBox="0 0 12 12" width={12} height={12} aria-hidden>
            <path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <SectionTitle>{t("moving")}</SectionTitle>
      <div style={{ display: "grid", gap: 6 }}>
        <ControlRow
          compact
          icon={mouse ? <MouseIcon part="right" size={44} /> : <PadIcon gesture="swipe" size={44} />}
          title={t("turn")}
          body={t(mouse ? "turnMouse" : "turnPad")}
        />
        <ControlRow
          compact
          icon={mouse ? <MouseIcon part="wheel" size={44} /> : <PadIcon gesture="pinch" size={44} />}
          title={t("zoom")}
          body={t(mouse ? "zoomMouse" : "zoomPad")}
        />
        <ControlRow
          compact
          icon={mouse ? <MouseIcon part="wheeldrag" size={44} /> : <SpaceDragIcon size={44} />}
          title={t("slide")}
          body={t(mouse ? "slideMouse" : "slidePad")}
        />
        <ControlRow compact icon={<DoubleClickIcon size={44} />} title={t("fly")} body={t("flyHow")} />
      </div>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: PD.textTertiary }}>{t("keys")}</p>

      {guidesOn && here.length > 0 && (
        <>
          <SectionTitle>{t("thisStep")}</SectionTitle>
          <div style={{ display: "grid", gap: 4 }}>
            {here.map((id, i) => (
              <GuideLink key={id} id={id} current={i === 0} />
            ))}
          </div>
        </>
      )}
      {guidesOn && elsewhere.length > 0 && (
        <>
          <SectionTitle>{t("otherSteps")}</SectionTitle>
          <div style={{ display: "grid", gap: 4 }}>
            {elsewhere.map((id) => (
              <GuideLink key={id} id={id} />
            ))}
          </div>
        </>
      )}

      <footer
        style={{
          marginTop: "auto",
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          alignItems: "center",
          fontSize: 13,
          color: PD.textTertiary,
          borderTop: `1px solid ${PD.hairline}`,
          paddingTop: 12,
        }}
      >
        {guidesOn && (
          <button type="button" onClick={() => showGuide("welcome")} style={footLink}>
            {t("welcomeAgain")}
          </button>
        )}
        <a href={`mailto:${LEGAL_FACTS.contactEmail}`} style={footLink}>
          {t("contact")}
        </a>
        <span style={{ marginInlineStart: "auto" }}>{t("pressQ")}</span>
      </footer>
    </aside>
  );
}

const footLink: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  fontFamily: PD.fontUi,
  fontSize: 13,
  fontWeight: 700,
  color: PD.accentText,
  textDecoration: "none",
  textShadow: "none",
};
