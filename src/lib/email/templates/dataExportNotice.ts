import type { EmailMessage } from "../types";
import { APP_NAME, formatDate, htmlDocument, textFooter } from "./shared";

// Sent when GET /api/account/export is invoked for a signed-in account. The
// export itself streams straight back to the browser that requested it (see
// src/app/api/account/export/route.ts) — there is no separate "ready" state to
// poll, so this is a security/audit notice ("this happened, on your account"),
// not a download link. It carries no attachment and no signed URL: the actual
// data already went to whoever was signed in at the time, over the session
// that requested it.

export interface DataExportNoticeParams {
  to: string;
  generatedAt: Date;
  projectCount: number;
}

export function dataExportNoticeEmail({ to, generatedAt, projectCount }: DataExportNoticeParams): EmailMessage {
  const when = formatDate(generatedAt);
  const subject = `${APP_NAME}: a data export was generated for your account`;
  const projectLine = `${projectCount} project${projectCount === 1 ? "" : "s"}`;

  const text = `An export of your ${APP_NAME} account data was generated on ${when}.

It included your profile information and ${projectLine} — each plan's
geometry, imported image, and thumbnail. The file was sent directly to the
browser session that requested it; we do not keep a copy of the export
afterward, and no link to it exists anywhere.

If this wasn't you, someone signed in as you and downloaded a copy of your
data. Review your Google account's sign-in activity and connected apps, and
consider deleting your ${APP_NAME} account from /account if you no longer
recognize the access.
${textFooter()}`;

  const html = htmlDocument(
    subject,
    `
      <h1 style="font-size:20px;margin:0 0 16px;">A data export was generated</h1>
      <p style="margin:0 0 16px;">An export of your ${APP_NAME} account data was generated on <strong>${when}</strong>.</p>
      <p style="margin:0 0 16px;">It included your profile information and <strong>${projectLine}</strong> — each plan's geometry, imported image, and thumbnail. The file was sent directly to the browser session that requested it; we do not keep a copy of the export afterward, and no link to it exists anywhere.</p>
      <p style="margin:0;color:#555;">If this wasn't you, someone signed in as you and downloaded a copy of your data. Review your Google account's sign-in activity and connected apps, and consider deleting your ${APP_NAME} account if you no longer recognize the access.</p>
    `,
  );

  return { to, subject, text, html };
}
