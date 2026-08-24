// Provider-agnostic outbound email — the interface the rest of the app talks
// to, kept deliberately separate from any one provider's SDK/shape.
//
// `EmailProvider` is what a concrete provider (Resend today, see ./resend.ts)
// implements. `sendEmail()` in ./index.ts is the one function callers use, and
// it never throws. Swapping Resend for another provider later means writing
// one more file that implements `EmailProvider` and pointing ./index.ts at it
// — nothing that calls `sendEmail()` has to change.

export interface EmailMessage {
  to: string;
  subject: string;
  /**
   * Must stand alone as a complete message: many mail clients block or strip
   * HTML by default, and this is what they show instead.
   */
  text: string;
  html: string;
  /** Optional; falls back to the provider/account default when unset. */
  replyTo?: string;
}

export interface EmailSendResult {
  ok: boolean;
  /** Provider message id, when the provider returned one. Safe to log. */
  id?: string;
  /**
   * Present when `ok` is false — a short, log-safe reason such as
   * "not-configured", "resend 422", or "network: <message>". Never the
   * recipient address or message body.
   */
  reason?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}
