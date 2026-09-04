"use client";

import { useEffect, useRef, useState } from "react";
import { PD, pdGlass } from "./planDock/tokens";
import { useHover } from "./planDock/useHover";
import { avatarUrl, displayName, useSession } from "@/lib/auth/useSession";

// -----------------------------------------------------------------------------
// The account control, top-right next to the theme toggle.
//
// Signing in is an OFFER, never a gate: a guest gets the whole editor and their
// projects still autosave locally. The only thing an account adds is that those
// projects follow them to another computer — which is what the button says.
//
// Renders nothing at all when the deployment has no Supabase configured, so a
// local checkout without env vars looks exactly like it did before.
// -----------------------------------------------------------------------------

const SIZE = 30;

export function AccountMenu() {
  const { user, loading, configured, signInWithGoogle, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  // Both hooks are called unconditionally, before the early returns below — one
  // for the signed-out sign-in pill, one for the signed-in avatar trigger. They
  // are separate flags because only ever one of the two is rendered.
  const [signInHover, signInHoverBind] = useHover();
  const [triggerHover, triggerHoverBind] = useHover();
  const ref = useRef<HTMLDivElement>(null);

  // A failed sign-in comes back as ?authError=… from the callback route. Show it
  // once, then take it out of the URL so a refresh isn't haunted by it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const message = params.get("authError");
    if (!message) return;
    setAuthError(message);
    params.delete("authError");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, []);

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

  if (!configured || loading) return null;

  if (!user) {
    return (
      <div style={{ position: "relative" }}>
        <button
          onClick={() => {
            setAuthError(null);
            setBusy(true);
            void signInWithGoogle().catch(() => setBusy(false));
          }}
          disabled={busy}
          {...signInHoverBind}
          title="Sign in so your projects follow you to any computer"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            height: SIZE + 6,
            padding: "0 14px",
            fontSize: 12.5,
            fontWeight: 600,
            fontFamily: PD.fontUi,
            color: PD.textPrimary,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
            ...pdGlass({ borderRadius: 999 }),
            // The glass recipe owns `background`, so hover lifts it after the
            // spread rather than through the helper.
            background: signInHover && !busy ? PD.surfaceMutedHover : PD.glassBg,
            transition: "background 140ms ease",
          }}
        >
          <GoogleMark />
          {busy ? "Opening…" : "Sign in"}
        </button>
        {authError && (
          <div
            role="alert"
            style={{
              position: "absolute",
              top: SIZE + 14,
              right: 0,
              maxWidth: 300,
              padding: "8px 11px",
              fontSize: 11.5,
              lineHeight: 1.45,
              fontFamily: PD.fontUi,
              color: PD.warnText,
              background: PD.warnBg,
              borderRadius: PD.radiusS,
              zIndex: 40,
            }}
          >
            Sign-in failed: {authError}
          </div>
        )}
      </div>
    );
  }

  const name = displayName(user);
  const avatar = avatarUrl(user);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        {...triggerHoverBind}
        title={name}
        style={{
          width: SIZE + 6,
          height: SIZE + 6,
          display: "grid",
          placeItems: "center",
          padding: 0,
          cursor: "pointer",
          overflow: "hidden",
          ...pdGlass({ borderRadius: 999 }),
          // An avatar fills the button, so the only surface hover can touch is
          // the ring around it.
          border: `1px solid ${triggerHover || open ? "oklch(1 0 0 / 0.28)" : "oklch(1 0 0 / 0.09)"}`,
          transition: "border-color 140ms ease",
        }}
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element -- a remote avatar of unknown host; next/image would need a domain allowlist per provider
          <img src={avatar} alt="" width={SIZE} height={SIZE} style={{ borderRadius: 999, display: "block" }} />
        ) : (
          <span style={{ fontSize: 13, fontWeight: 700, fontFamily: PD.fontUi, color: PD.textPrimary }}>
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: SIZE + 14,
            right: 0,
            minWidth: 208,
            padding: 6,
            zIndex: 40,
            ...pdGlass({ borderRadius: PD.radiusM }),
          }}
        >
          <div style={{ padding: "8px 10px 10px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: PD.textPrimary, fontFamily: PD.fontUi }}>{name}</div>
            {user.email && (
              <div
                style={{
                  fontSize: 11.5,
                  color: PD.textTertiary,
                  fontFamily: PD.fontUi,
                  marginTop: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {user.email}
              </div>
            )}
            <div style={{ fontSize: 11, color: PD.textTertiary, fontFamily: PD.fontUi, marginTop: 8 }}>
              Your plans are saved to this account.
            </div>
          </div>
          {/* The data page (export + account deletion). Reachable from here
              because a right-to-erasure control nobody can find is not one. */}
          <MenuRow href="/account" onSelect={() => setOpen(false)}>
            Your data
          </MenuRow>
          <MenuRow
            onSelect={() => {
              setOpen(false);
              void signOut();
            }}
          >
            Sign out
          </MenuRow>
        </div>
      )}
    </div>
  );
}

/** One row of the dropdown. The two rows were an `<a>` and a `<button>` with
 *  the same 14 style properties duplicated and no hover on either; this is that
 *  style once, with the flag. `href` picks the element — the data page is a
 *  real navigation and must stay a link. */
function MenuRow({
  href,
  onSelect,
  children,
}: {
  href?: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  const [hovered, hoverBind] = useHover();
  const style: React.CSSProperties = {
    display: "block",
    width: href ? undefined : "100%",
    textAlign: "left",
    padding: "8px 10px",
    marginBottom: 4,
    fontSize: 12.5,
    fontFamily: PD.fontUi,
    color: hovered ? PD.textPrimary : PD.textSecondary,
    background: hovered ? PD.surfaceMutedHover : PD.surfaceMuted,
    border: "none",
    borderRadius: PD.radiusS,
    textDecoration: "none",
    cursor: "pointer",
    transition: "background 140ms ease, color 140ms ease",
  };
  return href ? (
    <a href={href} onClick={onSelect} {...hoverBind} style={style}>
      {children}
    </a>
  ) : (
    <button onClick={onSelect} {...hoverBind} style={style}>
      {children}
    </button>
  );
}

/** Google's mark, inline so the sign-in button needs no network request. */
function GoogleMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.4 46 24 46z"
      />
      <path fill="#FBBC05" d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.5A22 22 0 0 0 2 24c0 3.6.9 6.9 2.5 9.9l7.3-5.7z" />
      <path
        fill="#EA4335"
        d="M24 10.4c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 3.9 29.9 2 24 2 15.4 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9.4 12.2-9.4z"
      />
    </svg>
  );
}
