// What to do with a local project that the account no longer lists.
//
// THE RULE THIS EXISTS FOR: "absent from the server" used to mean "deleted from
// another device", so reconcile ran `forgetProject` — which erases this browser's
// document, plan image and thumbnail. But absent is also what a project looks like
// after the server LOST it: an accidental table wipe, a bad migration, a restore to
// an earlier point, an outage that returns an empty list. In that case the local
// copy is the ONLY copy left, and every open tab would delete it on its next focus:
// one server incident became permanent, propagating data loss on every user's
// device. There is no server backup to fall back on at launch, so the clients must
// never be the ones that destroy the last copy.
//
// Deletion is now an explicit act the server records: the delete flow sets
// `deleted_at` (a tombstone). Only a tombstone means "forget this locally". A row
// that is simply gone is treated as damage, and the local copy is re-uploaded so
// the account heals itself from the devices that still hold the data.
//
// The cost, stated: the retention job hard-deletes tombstones after 30 days, so a
// device that was offline for longer than that and still holds a project deleted on
// another device will re-upload it. That is a resurrected project the user can
// delete again — recoverable — where the old behaviour was unrecoverable.

export type MissingRemoteAction =
  /** Never pushed: the first sign-in claiming this browser's local work. */
  | "claim"
  /** The server recorded a deletion: drop the local copy. */
  | "forget"
  /** The server row vanished with no tombstone: keep local, upload it again. */
  | "reupload";

export function decideMissingRemote(
  meta: { id: string; remoteRev?: number },
  tombstones: ReadonlySet<string>,
): MissingRemoteAction {
  if (meta.remoteRev === undefined) return "claim";
  if (tombstones.has(meta.id)) return "forget";
  return "reupload";
}
