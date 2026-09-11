// One place deciding whether outbound email is on — the email equivalent of
// sentry.shared.ts's DSN check.
//
// Email is OPT-IN: with no RESEND_API_KEY or EMAIL_FROM set, `sendEmail()`
// (./index.ts) is a dormant no-op — logged, never thrown, no network call, no
// provider account needed to run this app or develop against it.

/** Server-only secret. Never NEXT_PUBLIC_ — see docs/EMAIL.md. */
export const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";

/** The verified sender address, e.g. "Floorplan → 3D <noreply@yourdomain.com>". */
export const EMAIL_FROM = process.env.EMAIL_FROM ?? "";

/** Optional; omitted from the send entirely when unset (provider default applies). */
export const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || undefined;

export const emailConfigured = Boolean(RESEND_API_KEY && EMAIL_FROM);
