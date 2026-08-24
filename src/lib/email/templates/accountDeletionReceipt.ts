import type { EmailMessage } from "../types";
import { APP_NAME, formatDate, htmlDocument, textFooter } from "./shared";

// Sent once, after src/app/api/account/delete/route.ts has verified every
// stage of deletion succeeded (live rooms, storage, database rows, and the
// auth user itself) — never before, and never on a partial failure, because a
// receipt for a deletion that didn't fully happen would be a lie. See
// docs/DATA_RETENTION.md §4 for the order and the "what this does NOT reach"
// list this template's wording is drawn from.

export interface AccountDeletionReceiptParams {
  to: string;
  deletedAt: Date;
}

export function accountDeletionReceiptEmail({ to, deletedAt }: AccountDeletionReceiptParams): EmailMessage {
  const when = formatDate(deletedAt);
  const subject = `${APP_NAME}: your account and data have been deleted`;

  const text = `Your ${APP_NAME} account was deleted on ${when}.

This confirms the request you made was completed. We deleted:
  - Your account and sign-in
  - Every plan you owned: its geometry, imported images, and thumbnails
  - Any live collaboration rooms you had shared

This is permanent. There is no backup and no way to undo it from our side.

What this does NOT reach:
  - A copy someone made by opening a share link you sent — that copy became
    their own data, stored under their account, and is theirs to delete.
  - Any other browser or device that had your plans synced locally. Those
    local copies remain until that device signs in again and reconciles, or
    its site data is cleared by hand.
  - Anything a collaborator exported, downloaded, or screenshotted.

If you did not request this, someone with access to your Google account did —
we recommend reviewing that account's sign-in activity and connected apps.
${textFooter()}`;

  const html = htmlDocument(
    subject,
    `
      <h1 style="font-size:20px;margin:0 0 16px;">Your account has been deleted</h1>
      <p style="margin:0 0 16px;">Your ${APP_NAME} account was deleted on <strong>${when}</strong>. This confirms the request you made was completed.</p>
      <p style="margin:0 0 8px;font-weight:600;">We deleted:</p>
      <ul style="margin:0 0 16px;padding-left:20px;">
        <li>Your account and sign-in</li>
        <li>Every plan you owned: its geometry, imported images, and thumbnails</li>
        <li>Any live collaboration rooms you had shared</li>
      </ul>
      <p style="margin:0 0 16px;">This is permanent. There is no backup and no way to undo it from our side.</p>
      <p style="margin:0 0 8px;font-weight:600;">What this does NOT reach:</p>
      <ul style="margin:0 0 16px;padding-left:20px;">
        <li>A copy someone made by opening a share link you sent — that copy became their own data, stored under their account, and is theirs to delete.</li>
        <li>Any other browser or device that had your plans synced locally, until it signs in again and reconciles, or its site data is cleared by hand.</li>
        <li>Anything a collaborator exported, downloaded, or screenshotted.</li>
      </ul>
      <p style="margin:0;color:#555;">If you did not request this, someone with access to your Google account did — we recommend reviewing that account's sign-in activity and connected apps.</p>
    `,
  );

  return { to, subject, text, html };
}
