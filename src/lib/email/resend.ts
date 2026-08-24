import type { EmailMessage, EmailProvider, EmailSendResult } from "./types";

// Resend adapter — talks to Resend's REST API with plain `fetch`, no SDK.
// Deliberately dependency-free: this worktree must not add an npm package
// while the lockfile is being rewritten elsewhere, and Resend's send API is
// one POST with a JSON body, so an SDK buys little here anyway.
//
// This is the swappable half. Anything implementing `EmailProvider` (see
// ./types.ts) can stand in for this — Resend is the default choice, not a
// commitment. Nothing outside this file and ./index.ts's provider wiring
// needs to change to swap it.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Bounds how long a hung request can hold a serverless invocation open. */
const SEND_TIMEOUT_MS = 10_000;

export function createResendProvider(apiKey: string, from: string): EmailProvider {
  return {
    name: "resend",

    async send(message: EmailMessage): Promise<EmailSendResult> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

      let res: Response;
      try {
        res = await fetch(RESEND_ENDPOINT, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
            ...(message.replyTo ? { reply_to: message.replyTo } : {}),
          }),
          signal: controller.signal,
        });
      } catch (e) {
        const aborted = e instanceof Error && e.name === "AbortError";
        return { ok: false, reason: aborted ? "network: timed out" : `network: ${errMessage(e)}` };
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        // Resend's error body can echo back parts of the request (e.g. the
        // rejected address); read it for the log-safe status only, never pass
        // the body itself upward.
        return { ok: false, reason: `resend ${res.status}` };
      }

      const data = (await res.json().catch(() => null)) as { id?: string } | null;
      return { ok: true, id: data?.id };
    },
  };
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
