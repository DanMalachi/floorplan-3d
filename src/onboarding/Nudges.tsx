"use client";

// Struggle hints: a small chip next to the cursor when someone is visibly
// stuck, once per session each. Unlike the guides they're not tied to a step
// but to a moment of trouble the sims kept hitting (docs/ONBOARDING-HANDOFF.md
// §3): dragging the 3D view with the left button, which never turns it and
// can grab a wall, and sitting after the two scale clicks without typing.
//
// Never shown while a guide card is up (the card is already talking), and
// never blocking: the chip ignores the pointer except for its close button.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Scene } from "@/schema/scene";
import { useSceneStore } from "@/store/useSceneStore";
import { PD, pdGlass } from "@/ui/planDock/tokens";
import { CARD_FILL, CARD_Z } from "./GuideCard";
import { useGuides } from "./guideStore";
import { watchLeftDrags } from "./gestures";
import { announce } from "@/ui/a11y/Announcer";

export type NudgeId = "dragTurn" | "wallMoved" | "scaleIdle";

/** Two useless left-drags is a pattern, one is a slip. */
export const DRAGS_BEFORE_NUDGE = 2;
/** After the two scale clicks, this long without a key or a click. */
export const SCALE_IDLE_MS = 8000;
const SHOW_MS = 7000;
const NUDGE_W = 320;

/** Once per session: module state, gone on reload. */
const shown = new Set<NudgeId>();

interface Nudge {
  id: NudgeId;
  x: number;
  y: number;
  /** x/y are the chip's own top-left, not a cursor to sit beside. */
  pinned?: boolean;
}

const isMac = () => typeof navigator !== "undefined" && /Mac/.test(navigator.platform || navigator.userAgent);

export function Nudges() {
  const t = useTranslations("editor");
  const device = useGuides((s) => s.device);
  const guideUp = useGuides((s) => s.active !== null || s.helpOpen);
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const guideUpRef = useRef(guideUp);
  useEffect(() => {
    guideUpRef.current = guideUp;
  }, [guideUp]);

  const show = (id: NudgeId, x: number, y: number, pinned = false) => {
    if (shown.has(id) || guideUpRef.current) return;
    shown.add(id);
    setNudge({ id, x, y, pinned });
  };

  // Left-drags on the 3D view.
  useEffect(() => {
    let atDown: { scene: Scene } | null = null;
    let useless = 0;
    return watchLeftDrags(
      () => {
        const s = useSceneStore.getState();
        atDown = s.walkthroughActive || s.appMode === "trace" ? null : { scene: s.scene };
      },
      (at) => {
        if (!atDown) return;
        const s = useSceneStore.getState();
        const changed = s.scene !== atDown.scene;
        atDown = null;
        if (changed && s.sel3d?.kind === "wall") {
          show("wallMoved", at.x, at.y);
        } else if (!changed && ++useless >= DRAGS_BEFORE_NUDGE) {
          show("dragTurn", at.x, at.y);
        }
      },
    );
  }, []);

  // Sitting still after the two scale clicks.
  useEffect(() => {
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      const s = useSceneStore.getState();
      if (s.appMode !== "trace" || s.traceStep !== 2 || s.metersPerPixel !== null || s.calibrationPts.length < 2) return;
      timer = window.setTimeout(() => {
        // Beside the trace rail, level with the distance box, on the side
        // the plan is: never over the box it's asking you to type in.
        const box = document.querySelector('[data-guide="trace-scale-distance"]')?.getBoundingClientRect();
        const rail = document.querySelector('[data-guide="trace-rail-panel"]')?.getBoundingClientRect();
        if (!box || !rail) return;
        const rtl = document.documentElement.dir === "rtl";
        show("scaleIdle", rtl ? rail.left - NUDGE_W - 12 : rail.right + 12, box.top - 8, true);
      }, SCALE_IDLE_MS);
    };
    const unsub = useSceneStore.subscribe((s, p) => {
      if (s.calibrationPts !== p.calibrationPts || s.metersPerPixel !== p.metersPerPixel || s.traceStep !== p.traceStep) arm();
    });
    window.addEventListener("keydown", arm, true);
    window.addEventListener("pointerdown", arm, true);
    return () => {
      window.clearTimeout(timer);
      unsub();
      window.removeEventListener("keydown", arm, true);
      window.removeEventListener("pointerdown", arm, true);
    };
  }, []);

  const turn = t(device === "mouse" ? "guides.nudges.dragTurnMouse" : "guides.nudges.dragTurnPad");
  const text = !nudge
    ? ""
    : nudge.id === "dragTurn"
      ? turn
      : nudge.id === "wallMoved"
        ? `${t("guides.nudges.wallMoved", { undo: isMac() ? "⌘Z" : "Ctrl+Z" })} ${turn}`
        : t("guides.nudges.scaleIdle", { apply: t("trace.scale.apply") });

  // Spoken through the page's live region, which keeps the words after the
  // chip fades, so a screen reader still gets to the end of them.
  useEffect(() => {
    if (nudge && !guideUpRef.current) announce(text);
    // Once per hint, not again when the device switch rewords it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nudge]);

  // The chip fades on its own, but not while focus is on its close button:
  // someone who has got that far is still reading.
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!nudge || held) return;
    const id = window.setTimeout(() => setNudge(null), SHOW_MS);
    return () => window.clearTimeout(id);
  }, [nudge, held]);

  // A guide opening takes over.
  if (!nudge || guideUp) return null;

  // Beside the cursor (or where it was pinned), kept on screen.
  const w = NUDGE_W;
  const left = Math.max(12, Math.min(nudge.pinned ? nudge.x : nudge.x + 16, window.innerWidth - w - 12));
  const top = Math.min(nudge.pinned ? nudge.y : nudge.y + 16, window.innerHeight - 90);

  return (
    <div
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      style={{
        ...pdGlass({ background: CARD_FILL, borderRadius: 14 }),
        position: "fixed",
        left,
        top,
        width: w,
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "10px 12px 10px 14px",
        fontSize: 14.5,
        fontWeight: 600,
        lineHeight: 1.45,
        zIndex: CARD_Z,
        pointerEvents: "none",
      }}
    >
      <span aria-hidden style={{ color: PD.accentText, fontWeight: 800 }}>
        ?
      </span>
      <span style={{ flex: 1 }}>{text}</span>
      <button
        type="button"
        aria-label={t("guides.nudges.close")}
        onClick={() => {
          setHeld(false);
          setNudge(null);
        }}
        style={{
          pointerEvents: "auto",
          border: "none",
          background: "none",
          color: PD.textTertiary,
          cursor: "pointer",
          // An 11px cross, 25px to hit; the negative margin keeps the chip's
          // layout as it was.
          padding: 7,
          margin: -5,
          lineHeight: 0,
        }}
      >
        <svg viewBox="0 0 12 12" width={11} height={11} aria-hidden>
          <path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

