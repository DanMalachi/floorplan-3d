"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { B, type as ty } from "@/brand/tokens";
import { avatarUrl, displayName, useSession } from "@/lib/auth/useSession";

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
  const { user, loading, configured, signInWithGoogle, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
    return (
      <button
        onClick={() => {
          setBusy(true);
          void signInWithGoogle();
        }}
        disabled={busy}
        style={{
          fontFamily: B.fontUi,
          fontSize: ty.small,
          fontWeight: 600,
          color: B.ink3,
          background: "transparent",
          border: "none",
          padding: "8px 4px",
          cursor: busy ? "default" : "pointer",
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "Opening…" : "Sign in"}
      </button>
    );
  }

  const name = displayName(user);
  const src = avatarUrl(user);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account"
        aria-expanded={open}
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
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            minWidth: 210,
            background: B.raised,
            border: `1px solid ${B.hairline}`,
            borderRadius: B.radiusM,
            boxShadow: B.shadow,
            padding: 6,
            zIndex: 60,
          }}
        >
          <div style={{ padding: "8px 10px 10px", borderBottom: `1px solid ${B.hairline}` }}>
            <div style={{ fontFamily: B.fontUi, fontSize: 13.5, fontWeight: 700, color: B.ink }}>
              {name}
            </div>
            {user.email && (
              <div
                style={{
                  fontFamily: B.fontUi,
                  fontSize: 12,
                  color: B.ink4,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {user.email}
              </div>
            )}
          </div>
          <Link href="/account" style={itemStyle} onClick={() => setOpen(false)}>
            Your data
          </Link>
          <button
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            style={{ ...itemStyle, width: "100%", textAlign: "left", background: "transparent", border: "none", cursor: "pointer" }}
          >
            Sign out
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
