// Small pieces shared by every template, so the receipts and notices read as
// one product instead of three copies of a name and a URL drifting apart.

export const APP_NAME = "Floorplan → 3D";

/**
 * Mirrors the fallback chain in src/app/robots.ts and src/app/sitemap.ts, kept
 * as its own copy rather than a shared import: those files are simple enough
 * that duplicating three lines is cheaper than adding a cross-cutting import
 * another branch might also be touching. Returns null (not a guess) when
 * neither var is set, so templates can omit a link rather than print a
 * placeholder into a real email.
 */
export function siteUrl(): string | null {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return null;
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

/** Plain-text footer, appended by every template so the text body stands alone. */
export function textFooter(): string {
  const url = siteUrl();
  return `\n--\n${APP_NAME}${url ? `\n${url}` : ""}\n`;
}

/** Wraps a template's inner HTML in a minimal, self-contained layout. No remote assets, no tracking pixels. */
export function htmlDocument(title: string, bodyHtml: string): string {
  const url = siteUrl();
  const footerLink = url
    ? `<a href="${escapeHtml(url)}" style="color:#888;text-decoration:none;">${escapeHtml(url.replace(/^https?:\/\//, ""))}</a>`
    : escapeHtml(APP_NAME);
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:24px;background:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;line-height:1.55;">
      ${bodyHtml}
      <hr style="border:none;border-top:1px solid #e5e5e5;margin:32px 0 16px;" />
      <p style="color:#888;font-size:12px;margin:0;">${escapeHtml(APP_NAME)} · ${footerLink}</p>
    </div>
  </body>
</html>`;
}
