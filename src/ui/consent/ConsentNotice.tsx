"use client";

import { useEffect, useState } from "react";
import { PD, pdGlass } from "@/ui/planDock/tokens";
import { useHover } from "@/ui/planDock/useHover";
import { CloseIcon } from "@/ui/planDock/icons";
import { useSceneStore } from "@/store/useSceneStore";

// -----------------------------------------------------------------------------
// Cookie / tracking notice.
//
// What this app actually sets, verified in code before writing a word of copy:
//   - Supabase auth session cookies (src/lib/supabase/server.ts, src/proxy.ts)
//     — strictly necessary, sign-in only.
//   - No analytics, ads, or session-replay vendor anywhere in src/: grepped
//     for gtag/ga(/mixpanel/segment/posthog/amplitude/sentry/hotjar/
//     clarity.ms/fbq(/pixel — zero hits, and package.json has no such
//     dependency either.
// There is nothing optional to ask consent FOR — only something to disclose.
// So this is a short one-button notice, not a consent-management platform:
// no accept/reject choice to model, because there's no tracking to opt into.
//
// Placement: this app's chrome rings the whole viewport (top row is always
// full — ProjectBar/ModeSwitcher/AccountMenu in src/app/page.tsx; the right
// edge fills with an inspector panel whenever something's selected —
// src/ui/planDock/inspector/panelKit.tsx `right:14, top:64`). The one
// dependable gap is bottom-left, EXCEPT in Decorate mode, where BottomDock
// owns the full bottom edge including that corner (src/viewport3d/
// Viewport.tsx: `appMode === "furnish" && <BottomDock />`; src/ui/planDock/
// BottomDock.tsx left panel is `left:16, bottom:16, width:208, height:224`).
// So: hide in "furnish" mode, otherwise sit at bottom-left above the small
// pointer-events:none StatusOverlay pill that already lives at `left:14,
// bottom:14` (Viewport.tsx). This was picked by reading every `position:
// absolute` overlay in Viewport.tsx / page.tsx / BottomDock.tsx, not by
// looking at the running app — give it a visual pass and nudge the `left`/
// `bottom` values below if it ever overlaps something.
// -----------------------------------------------------------------------------

const STORAGE_KEY = "fp3d:legalNotice:v1";

export function ConsentNotice() {
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(true); // hidden until we know the real state
  const appMode = useSceneStore((s) => s.appMode);

  useEffect(() => {
    setMounted(true);
    try {
      setDismissed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // No localStorage (private browsing lockdown, etc.) — show it; it just
      // won't remember the dismissal across reloads.
      setDismissed(false);
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* best-effort persistence only */
    }
  };

  useEffect(() => {
    if (dismissed) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismissed]);

  if (!mounted || dismissed || appMode === "furnish") return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 14,
        bottom: 60,
        zIndex: 35,
        maxWidth: 300,
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "10px 8px 10px 14px",
        fontSize: 12,
        lineHeight: 1.55,
        fontFamily: PD.fontUi,
        color: PD.textSecondary,
        ...pdGlass({ borderRadius: PD.radiusM }),
      }}
    >
      <div style={{ flex: 1 }}>
        This app only sets strictly-necessary cookies, to keep you signed in
        — no analytics or ad tracking.{" "}
        <a href="/legal/privacy" style={{ color: PD.accentText }}>
          Privacy Policy
        </a>
        .
      </div>
      <DismissButton onClick={dismiss} />
    </div>
  );
}

/** Dismiss. Its own component so it can hold a hover flag — this is a 20px
 *  target and needed one more than most. */
function DismissButton({ onClick }: { onClick: () => void }) {
  const [hovered, hoverBind] = useHover();
  return (
    <button
      onClick={onClick}
      aria-label="Dismiss cookie notice"
      title="Dismiss"
      {...hoverBind}
      style={{
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        background: hovered ? PD.surfaceMutedHover : "transparent",
        color: hovered ? PD.textPrimary : PD.textTertiary,
        cursor: "pointer",
        borderRadius: PD.radiusS,
        padding: 3,
        transition: "background 140ms ease, color 140ms ease",
      }}
    >
      <CloseIcon size={14} />
    </button>
  );
}
