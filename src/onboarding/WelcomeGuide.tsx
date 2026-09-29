"use client";

// Guide 1: the welcome, once, for someone with nothing of their own yet (see
// `wantsWelcome`). The only guide that dims the screen and takes focus: it is
// the one moment nothing else is going on.
//
// "Upload my floor plan" runs the store's own `importPlanFile`, the same call
// the trace rail's file input makes, so there is one import path. The model
// home button from the artifact is deliberately absent until Dan's model home
// exists (handoff §0, decision 3).

import { useRef } from "react";
import type React from "react";
import { useTranslations } from "next-intl";
import { useSceneStore } from "@/store/useSceneStore";
import { Wordmark } from "@/brand/Wordmark";
import { PD, pdGlass } from "@/ui/planDock/tokens";
import { useModal } from "@/ui/a11y/useModal";
import { CARD_FILL, GuideButton, GuideText } from "./GuideCard";
import { GUIDE_CSS } from "./demos";
import type { GuideViewProps } from "./views";

/** Same list the trace rail's input accepts (TraceRail.tsx, step 1). */
const PLAN_ACCEPT = "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp,application/pdf,.pdf";

const WELCOME_Z = 90;

const STEP_ART: Record<"trace" | "build" | "furnish" | "view", React.ReactNode> = {
  trace: (
    <svg viewBox="0 0 120 58" aria-hidden style={{ width: "100%", height: 58 }}>
      <rect x={16} y={6} width={88} height={46} rx={3} fill="none" stroke={PD.textTertiary} strokeDasharray="3 3" />
      <path d="M28 16h44v26H28z M72 16h22v14" fill="none" stroke={PD.accentText} strokeWidth={2.6} />
    </svg>
  ),
  build: (
    <svg viewBox="0 0 120 58" aria-hidden style={{ width: "100%", height: 58 }}>
      <polygon points="30,22 60,10 92,20 62,32" fill="#f2efe9" />
      <polygon points="30,22 62,32 62,52 30,42" fill="#c9bfb1" />
      <polygon points="62,32 92,20 92,40 62,52" fill="#e3dace" />
    </svg>
  ),
  furnish: (
    <svg viewBox="0 0 120 58" aria-hidden style={{ width: "100%", height: 58 }}>
      <rect x={22} y={30} width={46} height={14} rx={4} fill="#8f7a64" />
      <rect x={22} y={22} width={46} height={10} rx={4} fill="#a38c74" />
      <circle cx={88} cy={20} r={8} fill="oklch(0.8 0.12 75)" />
      <rect x={87} y={28} width={2} height={18} fill="#aaa" />
    </svg>
  ),
  view: (
    <svg viewBox="0 0 120 58" aria-hidden style={{ width: "100%", height: 58 }}>
      <circle cx={60} cy={16} r={6} fill="none" stroke={PD.textSecondary} strokeWidth={2} />
      <path
        d="M60 22v14 M60 36l-8 13 M60 36l8 13 M50 28h20"
        stroke={PD.textSecondary}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  ),
};

export function WelcomeGuide({ onDone }: GuideViewProps) {
  const t = useTranslations("editor");
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  // A modal: Esc means "I'll look around first", Tab stays inside, and
  // reopened from help, closing it goes back to the `?`.
  useModal(rootRef, { initialFocus: primaryRef, onEscape: onDone, returnFocusTo: '[data-guide="help-button"]' });

  const steps = (["trace", "build", "furnish", "view"] as const).map((m) => ({
    id: m,
    name: t(`modes.${m}`),
    desc: t(`guides.welcome.${m}Desc`),
  }));

  return (
    <div
      ref={rootRef}
      style={{ position: "fixed", inset: 0, zIndex: WELCOME_Z, display: "grid", placeItems: "center", padding: 16 }}
    >
      <style>{GUIDE_CSS}</style>
      {/* The dim is "look around first" too: clicking past the card means it. */}
      <div aria-hidden onClick={onDone} style={{ position: "absolute", inset: 0, background: "oklch(0.1 0.01 285 / .55)" }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("guides.welcome.label")}
        style={{
          ...pdGlass({ background: CARD_FILL }),
          position: "relative",
          width: "min(660px, 100%)",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          padding: 30,
          display: "grid",
          gap: 20,
        }}
      >
        <Wordmark size={40} style={{ color: PD.textPrimary }} />
        <p style={{ margin: 0, fontSize: 17, lineHeight: 1.55, color: PD.textSecondary }}>{t("guides.welcome.body")}</p>
        <ol style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, margin: 0, padding: 0, listStyle: "none" }}>
          {steps.map((s) => (
            <li
              key={s.id}
              style={{
                borderRadius: PD.radiusM,
                background: PD.surfaceMuted,
                border: `1px solid ${PD.hairline}`,
                padding: 12,
                display: "grid",
                gap: 6,
                alignContent: "start",
              }}
            >
              {STEP_ART[s.id]}
              <b style={{ fontSize: 15, color: PD.textPrimary }}>{s.name}</b>
              <small style={{ fontSize: 13, lineHeight: 1.4, color: PD.textSecondary }}>{s.desc}</small>
            </li>
          ))}
        </ol>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            ref={fileRef}
            type="file"
            accept={PLAN_ACCEPT}
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              const store = useSceneStore.getState();
              store.setAppMode("trace");
              void store.importPlanFile(f);
              onDone();
            }}
          />
          <GuideButton ref={primaryRef} big onClick={() => fileRef.current?.click()}>
            {t("guides.welcome.upload")}
          </GuideButton>
          <GuideButton kind="ghost" onClick={onDone}>
            {t("guides.welcome.lookAround")}
          </GuideButton>
        </div>
        <GuideText note>{t("guides.welcome.note")}</GuideText>
      </div>
    </div>
  );
}
