"use client";

// -----------------------------------------------------------------------------
// /report — file an abuse/takedown report. Reachable without an account and
// without opening the editor at all: this is the page the legal pages, the
// footer, and a live shared room's chrome (src/collab/CollabRoom.tsx's
// "Report" chip) all point at. Posts to the unauthenticated
// /api/abuse-report route — see that file for the rate-limiting and
// fail-closed posture — and docs/TAKEDOWN.md for what happens to a report
// after it's filed.
//
// A "use client" page under [locale]/ needs no setRequestLocale: it reads the
// active locale from NextIntlClientProvider context via useLocale(), which is
// not a request read. See src/i18n/README-static.md's exemption list (which
// already names /account, styled the same way).
//
// Deliberately plain: no client-side existence checks against
// projects/rooms (there's nothing here to check against — the browser never
// learns whether an id is real), and the same neutral thank-you shows
// regardless of what was submitted. See the route's own comment for why:
// confirming or denying that a target exists would make ids enumerable.
//
// A room id or share link can arrive pre-filled via ?target=..., e.g. from the
// CollabRoom "Report" chip — never trusted, just an initial value the visitor
// can edit or clear like anything else they typed.
// -----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PD } from "@/ui/planDock/tokens";
import { ChevronLeftIcon } from "@/ui/planDock/icons";
import { Brand } from "@/brand/Brand";

// Hand-kept in sync with abuseTargetKindSchema / abuseReasonSchema in
// src/lib/api/schemas.ts (which in turn mirror the check constraints in
// supabase/migrations/0006_abuse_reports.sql) — change all three together.
// Not imported from schemas.ts: this is a client component, and a plain
// string-literal list here is one less thing that can break silently across a
// zod version bump versus depending on a schema's runtime `.options` shape.
const TARGET_KINDS = ["project", "share_link", "live_room", "asset", "other"] as const;
const REASONS = ["copyright", "privacy", "illegal_content", "harassment", "malware", "spam", "other"] as const;
type TargetKind = (typeof TARGET_KINDS)[number];
type Reason = (typeof REASONS)[number];

export default function ReportPage() {
  const t = useTranslations("report");
  const locale = useLocale();

  const [targetKind, setTargetKind] = useState<TargetKind>("project");
  const [targetId, setTargetId] = useState("");

  // ?target=... (from CollabRoom's "Report" chip) pre-fills the room/link
  // field — read client-side rather than via useSearchParams so this page
  // stays a plain client component with no Suspense boundary to add. Never
  // trusted: the visitor can edit or clear it like anything else they typed.
  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get("target");
    if (target) {
      setTargetKind("live_room");
      setTargetId(target);
    }
  }, []);
  const [reason, setReason] = useState<Reason>("copyright");
  const [detail, setDetail] = useState("");
  const [reporterContact, setReporterContact] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — see the route

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/abuse-report", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            targetKind,
            targetId,
            reason,
            detail,
            reporterContact: reporterContact || undefined,
            website: website || undefined,
          }),
        });
        if (res.status === 429) throw new Error(t("errorRateLimited"));
        if (res.status === 503) throw new Error(t("errorUnavailable"));
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string; detail?: string } | null;
          throw new Error(body?.detail ?? body?.error ?? t("errorGeneric"));
        }
        setDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [targetKind, targetId, reason, detail, reporterContact, website, t],
  );

  const inputStyle: React.CSSProperties = useMemo(
    () => ({
      width: "100%",
      boxSizing: "border-box",
      background: PD.inputBg,
      border: `1px solid ${PD.hairline}`,
      borderRadius: PD.radiusS,
      color: PD.textPrimary,
      padding: "9px 11px",
      fontSize: 13,
      fontFamily: PD.fontUi,
      outline: "none",
    }),
    [],
  );

  return (
    // globals.css pins `body { overflow: hidden; height: 100% }` for the 3D
    // app's canvas. This page owns its own scroll region instead, same as
    // src/app/[locale]/legal/layout.tsx and src/app/[locale]/account/page.tsx.
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflowY: "auto",
        background: PD.bg,
        color: PD.textPrimary,
        fontFamily: PD.fontUi,
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
.fp-report input:focus-visible, .fp-report select:focus-visible, .fp-report textarea:focus-visible, .fp-report button:focus-visible, .fp-report a:focus-visible {
  outline: 2px solid ${PD.accent};
  outline-offset: 2px;
}
.fp-report a { transition: color 180ms ease; }
.fp-report a:hover { color: ${PD.accent}; }
`,
        }}
      />
      <div className="fp-report" style={{ maxWidth: 640, margin: "0 auto", padding: "56px 24px 96px" }}>
        <nav style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32, fontSize: 13, color: PD.textSecondary }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: PD.textSecondary, textDecoration: "none" }}>
            <ChevronLeftIcon size={13} aria-hidden /> <Brand />
          </Link>
          <span aria-hidden style={{ color: PD.textTertiary }}>·</span>
          <Link href="/legal/privacy" style={{ color: PD.textPrimary, textDecoration: "none" }}>
            {t("backPrivacy")}
          </Link>
        </nav>

        <h1 style={{ fontSize: 27, fontWeight: 700, margin: "0 0 6px", letterSpacing: -0.3, color: PD.textPrimary }}>
          {t("title")}
        </h1>
        <p style={{ fontSize: 13.5, lineHeight: 1.7, color: PD.textSecondary, margin: "0 0 32px" }}>{t("intro")}</p>

        {done ? (
          <div style={{ border: `1px solid ${PD.hairline}`, borderRadius: PD.radiusM, padding: 20 }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: PD.textPrimary }}>{t("doneBody")}</p>
          </div>
        ) : (
          <form
            onSubmit={(e) => void onSubmit(e)}
            style={{ border: `1px solid ${PD.hairline}`, borderRadius: PD.radiusM, padding: 20, display: "grid", gap: 18 }}
          >
            <Field label={t("targetKindLabel")}>
              <select
                value={targetKind}
                onChange={(e) => setTargetKind(e.target.value as TargetKind)}
                style={inputStyle}
              >
                {TARGET_KINDS.map((v) => (
                  <option key={v} value={v}>
                    {t(`targetKind.${v}`)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t("targetIdLabel")} hint={t("targetIdHint")}>
              <input
                required
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                maxLength={2000}
                placeholder={t("targetIdPlaceholder")}
                style={inputStyle}
              />
            </Field>

            <Field label={t("reasonLabel")}>
              <select value={reason} onChange={(e) => setReason(e.target.value as Reason)} style={inputStyle}>
                {REASONS.map((v) => (
                  <option key={v} value={v}>
                    {t(`reason.${v}`)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t("detailLabel")} hint={t("detailHint")}>
              <textarea
                required
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                maxLength={5000}
                rows={6}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </Field>

            <Field label={t("contactLabel")} hint={t("contactHint")}>
              <input
                type="text"
                value={reporterContact}
                onChange={(e) => setReporterContact(e.target.value)}
                maxLength={320}
                placeholder={t("contactPlaceholder")}
                style={inputStyle}
              />
            </Field>

            {/* Honeypot. Real visitors never see this — off-screen, not display:none
                (some bots skip display:none), aria-hidden, unreachable by keyboard.
                A filled value makes the route silently skip writing the report; it
                never changes what this page shows the caller. */}
            <div aria-hidden="true" style={{ position: "absolute", left: -9999, top: -9999, width: 1, height: 1, overflow: "hidden" }}>
              <label>
                {t("honeypotLabel")}
                <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </label>
            </div>

            {error && (
              <div
                role="alert"
                style={{
                  padding: "10px 12px",
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  color: PD.dangerText,
                  background: PD.dangerTint,
                  borderRadius: PD.radiusS,
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              style={{
                justifySelf: locale === "he" ? "end" : "start",
                padding: "10px 18px",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: PD.fontUi,
                color: "#fff",
                background: PD.accent,
                border: "none",
                borderRadius: PD.radiusS,
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy ? t("submitting") : t("submit")}
            </button>
            <span role="status" className="fp-sr-only">{busy ? t("submitting") : ""}</span>
          </form>
        )}

        <p style={{ fontSize: 12, lineHeight: 1.6, color: PD.textTertiary, marginTop: 24 }}>
          {t("privacyNoteBefore")}{" "}
          <Link href="/legal/privacy" style={{ color: PD.textSecondary }}>
            {t("backPrivacy")}
          </Link>{" "}
          {t("privacyNoteAfter")}
        </p>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: PD.textPrimary }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11.5, lineHeight: 1.5, color: PD.textTertiary }}>{hint}</span>}
    </label>
  );
}
