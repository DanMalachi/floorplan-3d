"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useSession, displayName } from "@/lib/auth/useSession";
import { wipeLocalData } from "@/store/projectPersistence";
import { PD, pdGlass } from "@/ui/planDock/tokens";
import { useHover } from "@/ui/planDock/useHover";
import { CheckIcon, ChevronLeftIcon, CloseIcon } from "@/ui/planDock/icons";
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
  const locale = useLocale();
  const t = useTranslations("accountPage");
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
          report?.stages?.find((s) => !s.ok)?.detail ?? t("deleteFailed"),
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
  }, [typed, signOut, t]);

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
    // <main>, not <div>: this page has no other landmark, so without it there
    // is nothing for a screen reader to jump to. Identical rendering — <main>
    // is display:block like a div, and every box property here is explicit.
    <main
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
          <h1 style={{ fontSize: 22, fontWeight: 700, color: PD.textPrimary, margin: 0 }}>{t("title")}</h1>
          <BackToPlans />
        </div>

        {!configured && <Card>{t("notConfigured")}</Card>}
        {configured && loading && <Card>{t("loading")}</Card>}
        {configured && !loading && !user && <Card>{t("signedOut")}</Card>}

        {user && (
          <>
            <Card>
              <Label>{t("accountHeading")}</Label>
              <Row k={t("signedInAs")} v={`${displayName(user)}${user.email ? ` · ${user.email}` : ""}`} />
              <Row k={t("signInMethod")} v="Google" />
              {info?.account.created_at && <Row k={t("accountCreated")} v={new Date(info.account.created_at).toLocaleString(locale)} />}
            </Card>

            <Card>
              <Label>{t("holdsHeading")}</Label>
              {info ? (
                <>
                  <Row k={t("plansSynced")} v={String(info.holdings.projects)} />
                  {info.holdings.pendingPurge > 0 && (
                    <Row k={t("pendingPurge")} v={String(info.holdings.pendingPurge)} />
                  )}
                  <Row k={t("liveRooms")} v={String(info.holdings.liveRooms)} />
                  <Row
                    k={t("uploads")}
                    v={
                      info.holdings.storageError
                        ? t("storageError", { detail: info.holdings.storageError })
                        : t("filesSummary", { count: info.holdings.files, size: formatBytes(info.holdings.bytes) })
                    }
                  />
                </>
              ) : (
                <Row k={t("loading")} v="" />
              )}
              <Note>{t("localPlansNote")}</Note>
            </Card>

            <Card>
              <Label>{t("exportHeading")}</Label>
              <Note>{t("exportNote")}</Note>
              <ActionButton onClick={() => void onExport()} disabled={busy !== null} dim={busy === "export"}>
                {busy === "export" ? t("exportBusy") : t("exportButton")}
              </ActionButton>
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
              <Label>{t("deleteHeading")}</Label>
              {done ? (
                // The page then reloads on a 1.5s timer, so this sentence is
                // the only confirmation there will ever be that an
                // irreversible action succeeded. It has to be announced.
                <Note role="status">{t("deleted")}</Note>
              ) : info && !info.deletionAvailable ? (
                <Note>{t.rich("deletionUnavailable", { code: (c) => <code>{c}</code> })}</Note>
              ) : (
                <>
                  <Note>{t("deleteIntro")}</Note>
                  <ul style={{ margin: 0, paddingInlineStart: 18, color: PD.textSecondary, fontSize: 12.5, lineHeight: 1.7 }}>
                    <li>{t("removesPlans")}</li>
                    <li>{t("removesImages")}</li>
                    <li>{t.rich("removesRooms", { strong: (c) => <strong>{c}</strong> })}</li>
                    <li>{t("removesSignIn")}</li>
                    <li>{t.rich("removesLocal", { strong: (c) => <strong>{c}</strong> })}</li>
                  </ul>
                  <Note>{t("cannotRemove")}</Note>
                  <Note id="fp-delete-confirm-hint">
                    {t.rich("typeToConfirm", {
                      value: expected,
                      // bdi: an email address is LTR; in the Hebrew sentence it
                      // would otherwise have its punctuation reordered.
                      strong: (c) => (
                        <strong style={{ color: PD.textPrimary }}>
                          <bdi dir="ltr">{c}</bdi>
                        </strong>
                      ),
                    })}
                  </Note>
                  <input
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder={expected}
                    // The single most consequential field in the product had no
                    // label at all — only a placeholder, which vanishes on the
                    // first keystroke. The instruction above it is now wired in
                    // as the field's description as well.
                    aria-label={t("confirmFieldLabel")}
                    // An email address: typed LTR even on /he.
                    dir="ltr"
                    aria-describedby="fp-delete-confirm-hint"
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
                    }}
                  />
                  <ActionButton
                    onClick={() => void onDelete()}
                    disabled={!armed || busy !== null}
                    dim={!armed || busy !== null}
                    extra={{ color: armed ? PD.warnText : PD.textTertiary }}
                  >
                    {busy === "delete" ? t("deleteBusy") : t("deleteButton")}
                  </ActionButton>
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
                    <ul style={{ margin: "6px 0 0", paddingInlineStart: 16 }}>
                      {stages.map((s) => (
                        // This list only ever appears when an irreversible
                        // deletion partly failed, so "which steps went wrong"
                        // has to be unambiguous. The icon is decorative
                        // (aria-hidden) and the word is added off-screen,
                        // changing nothing visually.
                        <li key={s.stage} style={{ display: "flex", alignItems: "flex-start", gap: 5 }}>
                          <span aria-hidden style={{ flex: "0 0 auto", lineHeight: 0, paddingTop: 2 }}>
                            {s.ok ? <CheckIcon size={11} /> : <CloseIcon size={11} />}
                          </span>
                          <span>
                            <span className="fp-sr-only">{s.ok ? t("stageOk") : t("stageFailed")}</span> {s.stage}: {s.detail}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div style={{ marginTop: 6 }}>
                    {t("retryNote")}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

// ---- small presentational helpers ------------------------------------------

const Card = ({ children }: { children: React.ReactNode }) => (
  <div style={{ ...pdGlass({ borderRadius: PD.radiusM }), padding: 18, display: "grid", gap: 8 }}>{children}</div>
);

// A real <h2>, not a styled div: these are the page's section headings, and
// heading navigation is how a screen-reader user skims a page like this one.
// Every default heading style (size, weight, margin) is overridden here, so it
// renders exactly as the div did.
const Label = ({ id, children }: { id?: string; children: React.ReactNode }) => (
  <h2
    id={id}
    style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: PD.textTertiary, margin: 0 }}
  >
    {children}
  </h2>
);

const Note = ({ id, role, children }: { id?: string; role?: "status"; children: React.ReactNode }) => (
  <div id={id} role={role} style={{ fontSize: 12.5, lineHeight: 1.6, color: PD.textSecondary }}>
    {children}
  </div>
);

const Row = ({ k, v }: { k: string; v: string }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5 }}>
    <span style={{ color: PD.textTertiary }}>{k}</span>
    <span style={{ color: PD.textPrimary, textAlign: "end" }}>{v}</span>
  </div>
);

const btn = (disabled: boolean, hovered = false): React.CSSProperties => ({
  justifySelf: "start",
  padding: "9px 14px",
  fontSize: 12.5,
  fontWeight: 600,
  fontFamily: PD.fontUi,
  color: PD.textPrimary,
  background: hovered && !disabled ? PD.surfaceMutedHover : PD.surfaceMuted,
  border: "none",
  borderRadius: PD.radiusS,
  cursor: disabled ? "default" : "pointer",
  opacity: disabled ? 0.5 : 1,
  transition: "background 140ms ease",
});

/** Export / delete. Its own component so it can hold a hover flag; `dim` is
 *  the old `btn(disabled)` argument, kept separate from the real `disabled`
 *  attribute because the two were already used independently here. */
function ActionButton({
  onClick,
  disabled,
  dim,
  extra,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  dim: boolean;
  extra?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [hovered, hoverBind] = useHover();
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      {...hoverBind}
      style={{ ...btn(dim, hovered && !disabled), ...extra }}
    >
      {children}
    </button>
  );
}

/** Back to the editor. */
function BackToPlans() {
  const t = useTranslations("accountPage");
  const [hovered, hoverBind] = useHover();
  return (
    <Link
      href="/design"
      {...hoverBind}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 12.5,
        color: hovered ? PD.textPrimary : PD.textTertiary,
        textDecoration: "none",
        transition: "color 140ms ease",
      }}
    >
      <ChevronLeftIcon size={13} aria-hidden /> {t("backToPlans")}
    </Link>
  );
}

function formatBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}
