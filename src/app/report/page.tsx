"use client";

// -----------------------------------------------------------------------------
// /report — file an abuse/takedown report. Reachable without an account and
// without opening the editor at all: this is the page the legal pages and any
// outside party (a rights holder, someone who received a share link they
// shouldn't have, a stranger who stumbled onto a live room) land on. Posts to
// the unauthenticated /api/abuse-report route — see that file for the
// rate-limiting and fail-closed posture — and to docs/TAKEDOWN.md for what
// happens to a report after it's filed.
//
// Deliberately plain: no client-side existence checks against projects/rooms
// (there's nothing here to check against — the browser never learns whether an
// id is real), and the same neutral thank-you shows regardless of what was
// submitted. See the route's own comment for why: confirming or denying that a
// target exists would make ids enumerable.
// -----------------------------------------------------------------------------

import { useCallback, useState } from "react";
import Link from "next/link";
import { T, glass } from "@/ui/tokens";

// The value sets below are hand-kept in sync with abuseTargetKindSchema /
// abuseReasonSchema in src/lib/api/schemas.ts (which in turn mirror the check
// constraints in supabase/migrations/0003_abuse_reports.sql) — change all
// three together. Not imported from schemas.ts: this is a client component,
// and a plain string-literal object here is one less thing that can break
// silently across a zod version bump versus depending on a schema's runtime
// `.options` shape.
const TARGET_LABELS = {
  project: "A specific plan or project",
  share_link: "A share link someone sent me",
  live_room: "A live collaboration room",
  asset: "An uploaded image",
  other: "Something else",
} as const;

const REASON_LABELS = {
  copyright: "Copyright or trademark infringement",
  privacy: "Someone's private information (address, personal details)",
  illegal_content: "Illegal content",
  harassment: "Harassment or abuse",
  malware: "Malware or a harmful file",
  spam: "Spam or a scam",
  other: "Something else",
} as const;

type TargetKind = keyof typeof TARGET_LABELS;
type Reason = keyof typeof REASON_LABELS;
const TARGET_KINDS = Object.keys(TARGET_LABELS) as TargetKind[];
const REASONS = Object.keys(REASON_LABELS) as Reason[];

export default function ReportPage() {
  const [targetKind, setTargetKind] = useState<TargetKind>("project");
  const [targetId, setTargetId] = useState("");
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
        if (res.status === 429) {
          throw new Error("You're submitting reports faster than we can accept them. Please wait a few minutes and try again.");
        }
        if (res.status === 503) {
          throw new Error("Reporting is temporarily unavailable on this deployment. Please try again shortly.");
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string; detail?: string } | null;
          throw new Error(body?.detail ?? body?.error ?? "Could not submit the report. Please try again.");
        }
        setDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [targetKind, targetId, reason, detail, reporterContact, website],
  );

  return (
    // globals.css pins `body { overflow: hidden; height: 100% }` for the 3D
    // app's canvas. This page owns its own scroll region instead, same as
    // src/app/legal/layout.tsx and src/app/account/page.tsx.
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflowY: "auto",
        background: T.bg,
        color: T.text,
        fontFamily: T.font,
      }}
    >
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "56px 24px 96px" }}>
        <nav style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32, fontSize: 13, color: T.textDim }}>
          <Link href="/" style={{ color: T.textDim, textDecoration: "none" }}>
            ← Floorplan → 3D
          </Link>
          <span style={{ color: T.textFaint }}>·</span>
          <Link href="/legal/privacy" style={{ color: T.text, textDecoration: "none" }}>
            Privacy Policy
          </Link>
        </nav>

        <h1 style={{ fontSize: 27, fontWeight: 700, margin: "0 0 6px", letterSpacing: -0.3 }}>Report content</h1>
        <p style={{ fontSize: 13.5, lineHeight: 1.7, color: T.textDim, margin: "0 0 32px" }}>
          Use this form to report a plan, a shared link, a live collaboration room, or an uploaded image on
          Floorplan → 3D that infringes your rights, exposes someone's private information, or otherwise violates
          our policies. You do not need an account to file a report, and we do not require your contact
          information.
        </p>

        {done ? (
          <div style={{ ...glass(), padding: 20 }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: T.text }}>
              Thank you. Your report has been received and will be reviewed. Because a report can involve another
              person&rsquo;s account, we generally do not share details about what action was taken — if you gave an
              email address and it would help to hear back, we may follow up there.
            </p>
          </div>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} style={{ ...glass(), padding: 20, display: "grid", gap: 18 }}>
            <Field label="What are you reporting?">
              <select value={targetKind} onChange={(e) => setTargetKind(e.target.value as TargetKind)} style={inputStyle}>
                {TARGET_KINDS.map((v) => (
                  <option key={v} value={v}>
                    {TARGET_LABELS[v]}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Link, room, or plan"
              hint="Paste the share link (e.g. .../v/floorplan-...), the plan's name, or however you identify it. If you're not sure, just describe where you saw it — this is free text."
            >
              <input
                required
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                maxLength={2000}
                placeholder="https://.../v/floorplan-… or a description"
                style={inputStyle}
              />
            </Field>

            <Field label="Why are you reporting it?">
              <select value={reason} onChange={(e) => setReason(e.target.value as Reason)} style={inputStyle}>
                {REASONS.map((v) => (
                  <option key={v} value={v}>
                    {REASON_LABELS[v]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Details" hint="What's wrong, and anything else that helps us find and review it.">
              <textarea
                required
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                maxLength={5000}
                rows={6}
                style={{ ...inputStyle, resize: "vertical", fontFamily: T.font }}
              />
            </Field>

            <Field label="Your email (optional)" hint="Only if you'd like to hear back. Leave blank to report anonymously.">
              <input
                type="text"
                value={reporterContact}
                onChange={(e) => setReporterContact(e.target.value)}
                maxLength={320}
                placeholder="you@example.com"
                style={inputStyle}
              />
            </Field>

            {/* Honeypot. Real visitors never see this — off-screen, not display:none
                (some bots skip display:none), aria-hidden, unreachable by keyboard.
                A filled value makes the route silently skip writing the report; it
                never changes what this page shows the caller. */}
            <div aria-hidden="true" style={{ position: "absolute", left: -9999, top: -9999, width: 1, height: 1, overflow: "hidden" }}>
              <label>
                Leave this field blank
                <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </label>
            </div>

            {error && (
              <div
                role="alert"
                style={{ padding: "10px 12px", fontSize: 12.5, lineHeight: 1.5, color: T.danger, background: "rgba(255,69,58,0.1)", borderRadius: T.radiusS }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              style={{
                justifySelf: "start",
                padding: "10px 18px",
                fontSize: 13,
                fontWeight: 600,
                fontFamily: T.font,
                color: "#fff",
                background: T.accent,
                border: "none",
                borderRadius: T.radiusS,
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy ? "Submitting…" : "Submit report"}
            </button>
          </form>
        )}

        <p style={{ fontSize: 12, lineHeight: 1.6, color: T.textFaint, marginTop: 24 }}>
          See our <Link href="/legal/privacy" style={{ color: T.textDim }}>Privacy Policy</Link> for how any personal
          information you include in a report is handled.
        </p>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11.5, lineHeight: 1.5, color: T.textFaint }}>{hint}</span>}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: T.inputBg,
  border: `1px solid ${T.panelBorder}`,
  borderRadius: T.radiusS,
  color: T.text,
  padding: "9px 11px",
  fontSize: 13,
  fontFamily: T.font,
  outline: "none",
};
