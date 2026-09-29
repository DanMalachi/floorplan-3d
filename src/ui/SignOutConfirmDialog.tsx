"use client";

// F-18 — the confirmation shown by useSignOutGuard when sign-out would leave
// something unsynced. See src/lib/auth/signOutGuard.ts for what "unsynced"
// means and why there is no "delete this device's copy" option here.

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { PD, pdGlass } from "./planDock/tokens";
import type { SignOutGuardState } from "@/lib/auth/signOutGuard";
import { useModal } from "./a11y/useModal";

export function SignOutConfirmDialog({
  state,
  onCancel,
  onSyncAndSignOut,
  onKeepLocal,
}: {
  state: SignOutGuardState;
  onCancel: () => void;
  onSyncAndSignOut: () => void;
  onKeepLocal: () => void;
}) {
  const t = useTranslations("editor.chrome.accountMenu.signOutConfirm");
  const primaryRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const busy = state.phase === "syncing";

  // Keyed on "open", not on the phase: a failed sync re-renders the same
  // dialog, and must not bounce focus out and back in.
  useModal(rootRef, {
    open: state.phase !== "idle",
    initialFocus: primaryRef,
    onEscape: busy ? undefined : onCancel,
  });

  if (state.phase === "idle") return null;

  return (
    <div
      ref={rootRef}
      // Click-outside-to-cancel, same as AccountMenu's own popovers — but this
      // sits above everything (a modal, not a popover), so it needs its own
      // backdrop rather than a window mousedown listener.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        background: "oklch(0 0 0 / 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="fp-signout-title"
        aria-describedby="fp-signout-body"
        style={{
          ...pdGlass({ borderRadius: PD.radiusM }),
          width: "100%",
          maxWidth: 360,
          padding: 20,
          display: "grid",
          gap: 12,
          fontFamily: PD.fontUi,
        }}
      >
        <h2 id="fp-signout-title" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: PD.textPrimary }}>
          {t("title")}
        </h2>
        <p id="fp-signout-body" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: PD.textSecondary }}>
          {state.phase === "syncFailed" ? t("syncFailed") : t("body")}
        </p>
        <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
          <button ref={primaryRef} type="button" onClick={onSyncAndSignOut} disabled={busy} style={btnStyle("primary", busy)}>
            {busy ? t("syncing") : t("syncAndSignOut")}
          </button>
          <button type="button" onClick={onKeepLocal} disabled={busy} style={btnStyle("muted", busy)}>
            {t("keepLocal")}
          </button>
          <button type="button" onClick={onCancel} disabled={busy} style={btnStyle("plain", busy)}>
            {t("cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

function btnStyle(kind: "primary" | "muted" | "plain", disabled: boolean): React.CSSProperties {
  return {
    padding: "9px 14px",
    fontSize: 12.5,
    fontWeight: 600,
    fontFamily: PD.fontUi,
    // White label text on the accent fill is the same pairing Go-live uses
    // (see the "accent" token's own comment in planDock/tokens.ts).
    color: kind === "primary" && !disabled ? "#fff" : PD.textPrimary,
    background: disabled ? PD.surfaceMuted : kind === "primary" ? PD.accent : kind === "muted" ? PD.surfaceMuted : "transparent",
    border: "none",
    borderRadius: PD.radiusS,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
    transition: "background 140ms ease",
  };
}
