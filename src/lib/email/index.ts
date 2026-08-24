import { after } from "next/server";
import { logError, logRequest } from "@/lib/api/log";
import { EMAIL_FROM, EMAIL_REPLY_TO, RESEND_API_KEY, emailConfigured } from "./config";
import { createResendProvider } from "./resend";
import type { EmailMessage, EmailSendResult } from "./types";

export type { EmailMessage, EmailSendResult, EmailProvider } from "./types";
export { emailConfigured } from "./config";

export interface SendEmailOptions {
  /** Short, stable name for logs — e.g. "account-deletion-receipt". Never the recipient or body. */
  template: string;
  /** Supabase uid, when known, for the same log correlation the rest of the API uses. */
  userId?: string | null;
}

/**
 * Send one email. Never throws.
 *
 * Every failure mode — unconfigured deployment, network error, provider
 * rejection — is caught here, logged through the existing structured logger
 * (src/lib/api/log.ts), and returned as `{ ok: false, reason }` instead of
 * propagating. Nothing this module does may become the reason a request that
 * triggered it fails.
 *
 * Logs never include the recipient address, subject, body, or the API key —
 * only the template name, status, timing, and a short log-safe reason.
 */
export async function sendEmail(message: EmailMessage, options: SendEmailOptions): Promise<EmailSendResult> {
  const route = `email:${options.template}`;
  const userId = options.userId ?? null;
  const started = Date.now();

  if (!emailConfigured) {
    // Dormant, not broken: no RESEND_API_KEY / EMAIL_FROM is a valid, common
    // deployment state (see docs/EMAIL.md), the same posture Sentry takes with
    // no DSN set.
    logRequest({ route, status: 200, ms: 0, userId, reason: "skipped:not-configured" });
    return { ok: false, reason: "not-configured" };
  }

  try {
    const provider = createResendProvider(RESEND_API_KEY, EMAIL_FROM);
    const result = await provider.send({ ...message, replyTo: message.replyTo ?? EMAIL_REPLY_TO });
    logRequest({
      route,
      status: result.ok ? 200 : 502,
      ms: Date.now() - started,
      userId,
      reason: result.ok ? undefined : result.reason,
    });
    return result;
  } catch (e) {
    // Belt and braces: the Resend adapter already catches its own fetch
    // errors and returns a result rather than throwing. This exists so that
    // a bug in a future provider adapter still can't throw into a caller
    // that is relying on sendEmail() to fail open.
    logError(route, e, { userId });
    return { ok: false, reason: "exception" };
  }
}

/**
 * Schedule an email to send after the HTTP response has already gone out, so
 * it can never add latency (or a new failure mode) to the request that
 * triggered it. Built on Next's `after()`: unlike a bare un-awaited promise,
 * Vercel keeps the function alive until the scheduled work settles, so the
 * email actually gets a chance to send instead of racing the runtime freezing
 * the invocation once the response is flushed.
 *
 * This is the fail-open wiring point for anything that must win over its own
 * receipt — account deletion above all: deletion is permanent and already
 * completed by the time this is called, and nothing here may block, delay, or
 * unwind it.
 */
export function sendEmailAfterResponse(message: EmailMessage, options: SendEmailOptions): void {
  try {
    after(async () => {
      await sendEmail(message, options); // never throws — see above
    });
  } catch (e) {
    // after() itself failed to schedule (e.g. called outside a request's
    // execution context). Log and move on; the caller's response is already
    // decided and must not be touched by this.
    logError(`email:${options.template}`, e, { userId: options.userId ?? null, stage: "schedule" });
  }
}
