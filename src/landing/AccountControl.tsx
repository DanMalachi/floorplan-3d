"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { B, type as ty } from "@/brand/tokens";
import { avatarUrl, displayName, useSession } from "@/lib/auth/useSession";
import { MENU_ITEM_CLASS, OUTLINE_BTN_CLASS, TEXT_BTN_CLASS } from "./hoverCss";
import { SignInConsent } from "@/legal/SignInConsent";
import { POP_IN_CLASS, PopInStyle } from "@/ui/motion/popIn";

// -----------------------------------------------------------------------------
// Sign-in for the marketing header.
//
// Same session logic as the editor's src/ui/AccountMenu.tsx — same `useSession`
// hook, same `configured` guard, same Google provider — but styled from the
// brand tokens instead of the Plan Dock's glass ones, because this bar sits on
// an opaque warm ground rather than over a 3D canvas.
//
// The editor's control is not reused verbatim on purpose: sharing it would mean
// either dragging PD glass styling onto the marketing page or adding a variant
// prop to a component the app depends on, and the second is a change to
// shipping chrome for a page that has not launched.
//
// Signing in stays an OFFER, never a gate — a guest gets the whole editor and
// their plans autosave locally. An account only makes them follow you to
// another computer. Nothing on this site should imply otherwise.
// -----------------------------------------------------------------------------

export function AccountControl() {
  const t = useTranslations("account");
  const tc = useTranslations("signInConsent");
  const { user, loading, configured, signInWithGoogle, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);

  // Focus lands on "Continue" when the sign-in panel opens, so Enter goes on.
  useEffect(() => {
    if (open && !user) continueRef.current?.focus();
  }, [open, user]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // A checkout with no Supabase env vars has no accounts at all — show nothing
  // rather than a button that cannot work.
  if (!configured || loading) return null;

  if (!user) {
    // "Sign in" opens a panel instead of redirecting at once, so the Terms and
    // Privacy agreement sits next to the button that actually signs in.
    return (
      <div ref={ref} style={{ position: "relative" }}>
        <PopInStyle />
        <button
          onClick={() => setOpen((o) => !o)}
          disabled={busy}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={TEXT_BTN_CLASS}
          style={{
            fontFamily: B.fontUi,
            fontSize: ty.small,
            fontWeight: 600,
            color: open ? B.ink : B.ink3,
            background: "transparent",
            border: "none",
            padding: "8px 4px",
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? t("opening") : t("signIn")}
        </button>
        {open && (
          <div
            role="dialog"
            aria-label={tc("panelLabel")}
            className={POP_IN_CLASS}
            style={{
              ...panelStyle,
              width: 272,
              maxWidth: "calc(100vw - 32px)",
              padding: 8,
            }}
          >
            <button
              ref={continueRef}
              onClick={() => {
                setBusy(true);
                void signInWithGoogle().catch(() => {
                  setBusy(false);
                  setOpen(false);
                });
              }}
              disabled={busy}
              className={OUTLINE_BTN_CLASS}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                width: "100%",
                height: 38,
                fontFamily: B.fontUi,
                fontSize: 13.5,
                fontWeight: 600,
                color: B.ink,
                background: B.raised,
                border: `1px solid ${B.hairline2}`,
                borderRadius: B.radiusS,
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.6 : 1,
              }}
            >
              <GoogleMark />
              {busy ? t("opening") : tc("continue")}
            </button>
            <SignInConsent
              linkColor={B.ink}
              style={{ padding: "9px 4px 2px", fontFamily: B.fontUi, fontSize: 12, lineHeight: 1.55, color: B.ink3 }}
            />
          </div>
        )}
      </div>
    );
  }

  const name = displayName(user);
  const src = avatarUrl(user);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <PopInStyle />
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t("account")}
        aria-expanded={open}
        className={OUTLINE_BTN_CLASS}
        style={{
          width: 30,
          height: 30,
          borderRadius: "50%",
          overflow: "hidden",
          border: `1px solid ${B.hairline2}`,
          background: B.raised,
          color: B.ink,
          fontFamily: B.fontUi,
          fontSize: 12.5,
          fontWeight: 700,
          cursor: "pointer",
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- Google avatar
          // URLs are remote and unsized; next/image would need a remotePatterns
          // entry for a 30px decoration.
          <img src={src} alt="" width={30} height={30} style={{ display: "block" }} />
        ) : (
          name.slice(0, 1).toUpperCase()
        )}
      </button>

      {open && (
        <div className={POP_IN_CLASS} style={{ ...panelStyle, minWidth: 210, padding: 6 }}>
          <div style={{ padding: "8px 10px 10px", borderBottom: `1px solid ${B.hairline}` }}>
            <div style={{ fontFamily: B.fontUi, fontSize: 13.5, fontWeight: 700, color: B.ink }}>
              {name}
            </div>
            {user.email && (
              <div
                style={{
                  fontFamily: B.fontUi,
                  fontSize: 12,
                  color: B.label,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {user.email}
              </div>
            )}
          </div>
          <Link href="/account" className={MENU_ITEM_CLASS} style={itemStyle} onClick={() => setOpen(false)}>
            {t("yourData")}
          </Link>
          <button
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className={MENU_ITEM_CLASS}
            style={{ ...itemStyle, width: "100%", textAlign: "start", background: "transparent", border: "none", cursor: "pointer" }}
          >
            {t("signOut")}
          </button>
        </div>
      )}
    </div>
  );
}

const itemStyle: React.CSSProperties = {
  display: "block",
  padding: "9px 10px",
  fontFamily: B.fontUi,
  fontSize: 13.5,
  color: B.ink2,
  textDecoration: "none",
  borderRadius: B.radiusS,
};

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 8px)",
  // Trailing edge, not the physical right: on /he this control sits at the left
  // of the header, and a right-anchored menu would open off the side of the page.
  insetInlineEnd: 0,
  background: B.raised,
  border: `1px solid ${B.hairline}`,
  borderRadius: B.radiusM,
  boxShadow: B.shadow,
  zIndex: 60,
};

/** Google's mark, inline so the sign-in button needs no network request. */
function GoogleMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 48 48" aria-hidden>
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.5A22 22 0 0 0 2 24c0 3.6.9 6.9 2.5 9.9l7.3-5.7z" />
      <path fill="#EA4335" d="M24 10.4c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 3.9 29.9 2 24 2 15.4 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9.4 12.2-9.4z" />
    </svg>
  );
}
