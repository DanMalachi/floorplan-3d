// Share-link revocation: "has the owner withdrawn every link minted before now?"
//
// A share grant is a stateless HMAC token, which is what lets a link work without a
// database — and also what made it impossible to withdraw. Each grant now carries
// `iat`, and `live_rooms.grants_valid_after` (migration 0005) holds the moment
// before which every grant for that room is dead. This module is the one place
// that reads it, so /api/liveblocks-auth and /api/share cannot disagree.
//
// The read uses the service role because the caller here is usually a signed-out
// link visitor with no session to authorize a select, and the table's RLS lets an
// owner see only their own rows. What it returns is one timestamp, never an owner.

import { getAdminSupabase, serviceRoleConfigured } from "@/lib/supabase/admin";
import { logError } from "./log";

export type RevocationState = "ok" | "revoked" | "unavailable";

/**
 * Pure decision: is a grant minted at `iat` dead given the room's cut-off?
 * `validAfterMs` null / 0 means the room has never had its links revoked.
 * A grant with no `iat` (minted before the field existed) counts as minted at 0,
 * so the first revocation covers every legacy link too.
 */
export function isRevokedBy(validAfterMs: number | null, iat: number | undefined): boolean {
  if (!validAfterMs || validAfterMs <= 0) return false;
  return (iat ?? 0) < validAfterMs;
}

let warnedMissingColumn = false;

/**
 * Check one grant against its room's revocation cut-off.
 *
 *   ok          — not revoked, OR revocation is not in play for this deployment /
 *                 room (no service role, room has no ownership record, migration
 *                 0005 not applied yet). These are stated, not silent: the health
 *                 endpoint reports `shareRevocation`, and the missing-column case
 *                 logs an error once per instance.
 *   revoked     — the owner has withdrawn this link.
 *   unavailable — the lookup itself failed. Callers FAIL CLOSED: a link that cannot
 *                 be checked is not honoured, because "the database blinked" must
 *                 not be the way around a revocation.
 */
export async function checkGrantRevocation(room: string, iat: number | undefined): Promise<RevocationState> {
  if (!serviceRoleConfigured) return "ok";
  try {
    const { data, error } = await getAdminSupabase()
      .from("live_rooms")
      .select("grants_valid_after")
      .eq("room_id", room)
      .maybeSingle();
    if (error) {
      // 42703 = undefined_column: code deployed before migration 0005 was run.
      if (error.code === "42703" || /grants_valid_after/i.test(error.message)) {
        if (!warnedMissingColumn) {
          warnedMissingColumn = true;
          logError("revocation", new Error("live_rooms.grants_valid_after is missing — run migration 0005; share links are NOT revocable until then"));
        }
        return "ok";
      }
      logError("revocation", error);
      return "unavailable";
    }
    if (!data) return "ok"; // legacy room with no ownership record: nothing to revoke against
    const validAfter = Date.parse(String((data as { grants_valid_after: string }).grants_valid_after));
    return isRevokedBy(Number.isFinite(validAfter) ? validAfter : null, iat) ? "revoked" : "ok";
  } catch (e) {
    logError("revocation", e);
    return "unavailable";
  }
}
