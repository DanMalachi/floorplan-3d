"use client";

import { useEffect, useState } from "react";
import { PD, pdGlass } from "@/ui/planDock/tokens";
import { useHover } from "@/ui/planDock/useHover";
import { Tooltip } from "@/ui/planDock/Tooltip";
import { CloseIcon } from "@/ui/planDock/icons";
import { useSceneStore } from "@/store/useSceneStore";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

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
// Placement: this app's chrome rings the whole viewport (the top row is always
// full — ProjectBar/ModeSwitcher/AccountMenu in src/app/[locale]/design/page.tsx;
// the TRAILING edge fills with an inspector panel whenever something is
// selected — src/ui/planDock/inspector/panelKit.tsx `insetInlineEnd:14,
// top:64`). The one dependable gap is the bottom LEADING corner, EXCEPT in
// Decorate mode, where BottomDock owns the whole bottom edge including that
// corner (src/viewport3d/Viewport.tsx: `appMode === "furnish" && <BottomDock />`;
// BottomDock's own panel is `insetInlineStart:16, bottom:16, width:208,
// height:224`). So: hide in "furnish" mode, otherwise sit at the bottom leading
// corner. This was picked by reading every `position: absolute` overlay in
// Viewport.tsx / design/page.tsx / BottomDock.tsx, not by looking at the running
// app — give it a visual pass and nudge the values below if it ever overlaps
// something.
//
// ── Why the analysis above survived RTL (Step 4) ────────────────────────────
// Every panel named in it is pinned by a LOGICAL property, this notice
// included, so they all cross to the other side of the window together and
// their relationships hold unchanged. That is the whole reason the mirror was
// done as inset-inline rather than by adding a locale conditional: a
// conditional would have needed this paragraph re-derived for Hebrew.
//
// ONE relationship did not survive, and it is not this notice's fault. The
// `StatusOverlay` pill this used to sit above lives inside the PROTECTED
// Viewport.tsx at a physical `left:14, bottom:14`, so in Hebrew it stays on the
// left while this moves to the right. They no longer stack — they simply
// separate, which is harmless. See the Step 4 section of
// docs/HEBREW-HANDOFF.md for the three protected overlays that could not be
// mirrored and the decision still open on them.
// -----------------------------------------------------------------------------

const STORAGE_KEY = "fp3d:legalNotice:v1";

export function ConsentNotice() {
  const t = useTranslations("consent");
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
        insetInlineStart: 14,
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
      {/* The privacy link comes through as a rich-text tag rather than as a
          sentence split around it: Hebrew does not put the link in the same
          place English does, and a hard-coded "…tracking. <Link/>." forces the
          English order onto every language. */}
      <div style={{ flex: 1 }}>
        {t.rich("body", {
          link: (chunks) => (
            <Link href="/legal/privacy" style={{ color: PD.accentText }}>
              {chunks}
            </Link>
          ),
        })}
      </div>
      <DismissButton onClick={dismiss} label={t("dismiss")} />
    </div>
  );
}

/** Dismiss. Its own component so it can hold a hover flag — this is a 20px
 *  target and needed one more than most. */
function DismissButton({ onClick, label }: { onClick: () => void; label: string }) {
  const [hovered, hoverBind] = useHover();
  return (
    // The notice sits at the bottom-left, so the default `top` placement has
    // room. The button keeps its own `aria-label` ("Dismiss cookie notice",
    // more specific than the tooltip), so `Tooltip` leaves the name alone.
    <Tooltip label="Dismiss">
      <button
        onClick={onClick}
        aria-label={label}
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
    </Tooltip>
  );
}
