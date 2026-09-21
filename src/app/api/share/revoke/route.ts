import { z } from "zod";
import { getServerUser } from "@/lib/supabase/server";
import { getAdminSupabase, serviceRoleConfigured } from "@/lib/supabase/admin";
import { accountsConfigured } from "@/lib/api/auth";
import { readJson, KB } from "@/lib/api/body";
import { rejectCrossSiteWrite } from "@/lib/api/csrf";
import { apiError, forbidden, unauthorized, unavailable } from "@/lib/api/http";
import { logRequest } from "@/lib/api/log";
import { enforceRateLimit, rateLimitIdentity } from "@/lib/api/rateLimit";
import { ownsRoom } from "@/lib/api/rooms";
import { roomSchema } from "@/lib/api/schemas";

// POST /api/share/revoke — withdraw every share link minted for a room so far.
//
// Share grants are stateless signed tokens, so a link that leaked (or went to the
// wrong person) used to stay valid for its full 30 days with no way to take it
// back. This moves the room's `grants_valid_after` cut-off to "now": every grant
// minted before it fails in /api/liveblocks-auth and cannot be used to mint new
// ones in /api/share. New links minted afterwards work normally.
//
// Owner only, and the owner is decided server-side by `ownsRoom` — never by
// anything the request says. The write uses the service role because clients have
// no write grant on live_rooms (0002), which is what stops a client moving the
// cut-off itself.
//
// Limits, stated honestly: a collaborator already connected keeps the Liveblocks
// access token they were issued until it expires or they reconnect; this stops new
// entries and re-entries, not a socket that is already open.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ room: roomSchema }).strict();

export async function POST(req: Request) {
  const blocked = rejectCrossSiteWrite(req);
  if (blocked) return blocked;

  // Ownership is a database fact; a deployment without accounts has no owners to
  // ask and no service role to write with.
  if (!accountsConfigured() || !serviceRoleConfigured) {
    return unavailable("link revocation is not available on this deployment");
  }

  const user = await getServerUser().catch(() => null);
  if (!user) return unauthorized("sign in to revoke share links");

  const limited = await enforceRateLimit("share-revoke", rateLimitIdentity(req, user.id), {
    limit: 20,
    windowSec: 60 * 60,
    kind: "abuse",
  });
  if (limited) return limited;

  const parsed = await readJson(req, bodySchema, 2 * KB);
  if (!parsed.ok) return parsed.response;
  const { room } = parsed.data;

  if (!(await ownsRoom(room, user.id))) {
    // Same answer whether the room exists or belongs to someone else: this route
    // must not be a way to probe which rooms exist.
    return forbidden("only the room's owner can revoke its links");
  }

  const cutoff = new Date().toISOString();
  const { data, error } = await getAdminSupabase()
    .from("live_rooms")
    .update({ grants_valid_after: cutoff })
    .eq("room_id", room)
    .eq("owner", user.id)
    .select("room_id");
  if (error) {
    logRequest({ route: "share/revoke", status: 500, ms: 0, userId: user.id, reason: "db" });
    return apiError(500, "could not revoke links");
  }
  if (!data?.length) {
    // ownsRoom said yes through its cookie fallback but there is no ownership row
    // to attach a cut-off to (a legacy, never-claimed room).
    return apiError(409, "this room has no ownership record, so its links cannot be revoked");
  }

  logRequest({ route: "share/revoke", status: 200, ms: 0, userId: user.id, reason: "revoked" });
  return Response.json({ ok: true, revokedBefore: cutoff });
}
