import type { EmailMessage } from "../types";
import { APP_NAME, escapeHtml, formatDate, htmlDocument, siteUrl, textFooter } from "./shared";

// Not wired into any route today — there is no policy-versioning mechanism in
// this codebase yet (src/app/legal/privacy and src/app/legal/terms are static
// pages with no "last changed" trigger). This template exists so that when a
// material change is made to either document, sending the notice is a
// function call away rather than a new thing to design under time pressure.
// See docs/EMAIL.md for how to use it by hand until it has a real trigger.

export type PolicyDocument = "privacy" | "terms";

export interface PolicyChangeNoticeParams {
  to: string;
  document: PolicyDocument;
  /** One or two plain-language sentences on what changed. Not the diff. */
  summary: string;
  effectiveDate: Date;
}

const DOC_META: Record<PolicyDocument, { title: string; path: string }> = {
  privacy: { title: "Privacy Policy", path: "/legal/privacy" },
  terms: { title: "Terms of Service", path: "/legal/terms" },
};

export function policyChangeNoticeEmail({
  to,
  document,
  summary,
  effectiveDate,
}: PolicyChangeNoticeParams): EmailMessage {
  const meta = DOC_META[document];
  const when = formatDate(effectiveDate);
  const subject = `${APP_NAME}: updates to our ${meta.title}`;
  const base = siteUrl();
  const url = base ? `${base}${meta.path}` : meta.path;

  const text = `We've updated our ${meta.title}, effective ${when}.

What changed: ${summary}

Read the full ${meta.title}: ${url}

Continuing to use ${APP_NAME} after ${when} means you accept the updated
document. If you have questions, reply to this email.
${textFooter()}`;

  const html = htmlDocument(
    subject,
    `
      <h1 style="font-size:20px;margin:0 0 16px;">We've updated our ${meta.title}</h1>
      <p style="margin:0 0 16px;">Effective <strong>${when}</strong>.</p>
      <p style="margin:0 0 16px;"><strong>What changed:</strong> ${escapeHtml(summary)}</p>
      <p style="margin:0 0 16px;"><a href="${escapeHtml(url)}" style="color:#2563eb;">Read the full ${meta.title}</a></p>
      <p style="margin:0;color:#555;">Continuing to use ${APP_NAME} after ${when} means you accept the updated document. If you have questions, reply to this email.</p>
    `,
  );

  return { to, subject, text, html };
}
