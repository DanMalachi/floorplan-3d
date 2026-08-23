"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession, displayName } from "@/lib/auth/useSession";
import { wipeLocalData } from "@/store/projectPersistence";
import { PD, pdGlass } from "@/ui/planDock/tokens";
import { PdThemeStyle } from "@/ui/planDock/theme";

// -----------------------------------------------------------------------------
// /account — the data page: what this account holds, a full export, and deletion.
//
// The deletion control is deliberately unpleasant to operate. Erasure here is
// irreversible (no soft-delete tier, no backup restore), so the confirmation has
// to cost more than a reflex: the user types their own email address, which is a
// string no stray click or double-submit can produce. The consequences are listed
// BEFORE the input, including the two we cannot undo for them — guest plans in
// this browser, and copies already sitting in a collaborator's browser.
// -----------------------------------------------------------------------------

interface Holdings {
  projects: number;
  pendingPurge: number;
  liveRooms: number;
  files: number;
  bytes: number;
  storageError: string | null;
}

interface AccountInfo {
  account: { id: string; email: string | null; created_at: string | null; last_sign_in_at: string | null };
  holdings: Holdings;
  deletionAvailable: boolean;
}

interface StageReport {
  stage: string;
  ok: boolean;
  detail: string;
}

export default function AccountPage() {
  const { user, loading, configured, signOut } = useSession();
  const [info, setInfo] = useState<AccountInfo | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<null | "export" | "delete">(null);
  const [stages, setStages] = useState<StageReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!user) return;
    let live = true;
    void fetch("/api/account")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setInfo(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [user]);

  const onExport = useCallback(async () => {
    setBusy("export");
    setError(null);
    try {
      // Fetched rather than linked so a failure surfaces as a message instead of
      // a browser error page, and so the button can show progress on a large
      // account (the archive inlines every plan image).
      const res = await fetch("/api/account/export");
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `floorplan3d-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, []);

  const onDelete = useCallback(async () => {
    setBusy("delete");
    setError(null);
    setStages(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: typed }),
      });
      const report = (await res.json().catch(() => null)) as
        | { ok: boolean; stages?: StageReport[]; remaining?: string[] }
        | null;
      setStages(report?.stages ?? null);

      // The local wipe and the sign-out happen ONLY on a verified-complete
      // server deletion. Clearing this browser after a partial failure would
      // destroy the user's last copy of plans that are still sitting on the
      // server, and sign them out of the account they need in order to retry.
      if (!res.ok || !report?.ok) {
        throw new Error(
          report?.stages?.find((s) => !s.ok)?.detail ?? "Deletion failed. Nothing was removed from this browser.",
        );
      }
      await wipeLocalData();
      await signOut();
      setDone(true);
      // Reload from a clean slate: the scene store still holds the open plan in
      // memory, and only a fresh document is a truthful view of an empty store.
      setTimeout(() => window.location.replace("/"), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [typed, signOut]);

  const expected = (user?.email ?? "DELETE").trim();
  const armed = typed.trim().toLowerCase() === expected.toLowerCase();

  return (
    // globals.css pins `body { overflow: hidden; height: 100% }` so the 3D
    // canvas never scrolls the document. A plain `minHeight: 100vh` block
    // therefore renders but cannot be scrolled — anything past the fold is
    // unreachable, which reads as "the page didn't load". Own the viewport and
    // scroll inside it, exactly as src/app/legal/layout.tsx does.
    // No background of its own: globals.css already paints the app surface, and
    // this page is chrome, not a scene, so it inherits it.
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        padding: "48px 20px",
        fontFamily: PD.fontUi,
      }}
    >
      <PdThemeStyle />
      <div style={{ maxWidth: 660, margin: "0 auto", display: "grid", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: PD.textPrimary, margin: 0 }}>Your data</h1>
          <Link href="/" style={{ fontSize: 12.5, color: PD.textTertiary, textDecoration: "none" }}>
            ← Back to plans
          </Link>
        </div>

        {!configured && <Card>Accounts are not configured on this deployment. Nothing is stored on a server.</Card>}
        {configured && loading && <Card>Loading…</Card>}
        {configured && !loading && !user && <Card>Sign in from the editor to see and manage the data on your account.</Card>}

        {user && (
          <>
            <Card>
              <Label>Account</Label>
              <Row k="Signed in as" v={`${displayName(user)}${user.email ? ` · ${user.email}` : ""}`} />
              <Row k="Sign-in method" v="Google" />
              {info?.account.created_at && <Row k="Account created" v={new Date(info.account.created_at).toLocaleString()} />}
            </Card>

            <Card>
              <Label>What this account holds</Label>
              {info ? (
                <>
                  <Row k="Plans synced to the cloud" v={String(info.holdings.projects)} />
                  {info.holdings.pendingPurge > 0 && (
                    <Row k="Deleted plans awaiting purge" v={String(info.holdings.pendingPurge)} />
                  )}
                  <Row k="Shared live rooms" v={String(info.holdings.liveRooms)} />
                  <Row
                    k="Uploaded images + thumbnails"
                    v={
                      info.holdings.storageError
                        ? `couldn't read storage (${info.holdings.storageError})`
                        : `${info.holdings.files} file(s) · ${formatBytes(info.holdings.bytes)}`
                    }
                  />
                </>
              ) : (
                <Row k="Loading…" v="" />
              )}
              <Note>
                Plans you never signed in with stay in this browser only and are not counted here — deleting your
                account removes those too.
              </Note>
            </Card>

            <Card>
              <Label>Download a copy</Label>
              <Note>
                One JSON file with your profile, every plan&apos;s geometry, and the plan images and thumbnails
                themselves, inlined. Large accounts take a moment — the images are included in full, not linked.
              </Note>
              <button onClick={() => void onExport()} disabled={busy !== null} style={btn(busy === "export")}>
                {busy === "export" ? "Preparing…" : "Export my data"}
              </button>
            </Card>

            <div
              style={{
                ...pdGlass({ borderRadius: PD.radiusM }),
                padding: 18,
                display: "grid",
                gap: 10,
                border: `1px solid ${PD.warnText}`,
              }}
            >
              <Label>Delete account and data</Label>
              {done ? (
                <Note>Your account and its data have been deleted. Signing you out…</Note>
              ) : info && !info.deletionAvailable ? (
                <Note>
                  Deletion is not available on this deployment: the server has no <code>SUPABASE_SERVICE_ROLE_KEY</code>,
                  so the sign-in itself could not be removed. Rather than half-delete your account, the button is
                  withheld.
                </Note>
              ) : (
                <>
                  <Note>This cannot be undone. There is no backup to restore from. It removes:</Note>
                  <ul style={{ margin: 0, paddingLeft: 18, color: PD.textSecondary, fontSize: 12.5, lineHeight: 1.7 }}>
                    <li>every plan on your account, and its geometry</li>
                    <li>every plan image and thumbnail you have uploaded</li>
                    <li>
                      every shared live room you own — <strong>share links you have sent will stop working</strong> for
                      the people you sent them to
                    </li>
                    <li>your Google sign-in for this app</li>
                    <li>
                      <strong>every plan stored in this browser</strong>, including ones you made before signing in and
                      never synced
                    </li>
                  </ul>
                  <Note>
                    What it cannot remove: if you shared a plan, that person&apos;s own copy lives in their browser and,
                    if they are signed in, on their own account. It is their data now and we have no way to reach it.
                  </Note>
                  <Note>
                    Type <strong style={{ color: PD.textPrimary }}>{expected}</strong> to confirm.
                  </Note>
                  <input
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder={expected}
                    autoComplete="off"
                    spellCheck={false}
                    style={{
                      padding: "9px 11px",
                      fontSize: 13,
                      fontFamily: PD.fontMono,
                      color: PD.textPrimary,
                      background: PD.inputBg,
                      border: `1px solid ${PD.hairline}`,
                      borderRadius: PD.radiusS,
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={() => void onDelete()}
                    disabled={!armed || busy !== null}
                    style={{ ...btn(!armed || busy !== null), color: armed ? PD.warnText : PD.textTertiary }}
                  >
                    {busy === "delete" ? "Deleting…" : "Permanently delete my account and data"}
                  </button>
                </>
              )}

              {error && (
                <div
                  role="alert"
                  style={{
                    padding: "9px 11px",
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: PD.warnText,
                    background: PD.warnBg,
                    borderRadius: PD.radiusS,
                  }}
                >
                  {error}
                  {stages && (
                    <ul style={{ margin: "6px 0 0", paddingLeft: 16 }}>
                      {stages.map((s) => (
                        <li key={s.stage}>
                          {s.ok ? "✓" : "✗"} {s.stage}: {s.detail}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div style={{ marginTop: 6 }}>
                    Nothing was removed from this browser. Retrying is safe — every step that already succeeded is
                    skipped.
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---- small presentational helpers ------------------------------------------

const Card = ({ children }: { children: React.ReactNode }) => (
  <div style={{ ...pdGlass({ borderRadius: PD.radiusM }), padding: 18, display: "grid", gap: 8 }}>{children}</div>
);

const Label = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: PD.textTertiary }}>
    {children}
  </div>
);

const Note = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 12.5, lineHeight: 1.6, color: PD.textSecondary }}>{children}</div>
);

const Row = ({ k, v }: { k: string; v: string }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5 }}>
    <span style={{ color: PD.textTertiary }}>{k}</span>
    <span style={{ color: PD.textPrimary, textAlign: "right" }}>{v}</span>
  </div>
);

const btn = (disabled: boolean): React.CSSProperties => ({
  justifySelf: "start",
  padding: "9px 14px",
  fontSize: 12.5,
  fontWeight: 600,
  fontFamily: PD.fontUi,
  color: PD.textPrimary,
  background: PD.surfaceMuted,
  border: "none",
  borderRadius: PD.radiusS,
  cursor: disabled ? "default" : "pointer",
  opacity: disabled ? 0.5 : 1,
});

function formatBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}
