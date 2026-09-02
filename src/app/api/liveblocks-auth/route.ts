import { Liveblocks } from "@liveblocks/node";
import { stableAnonId } from "@/lib/api/auth";
import { z } from "zod";
import { verifyGrant, shareSigningConfigured } from "@/collab/grant.server";
import { getServerUser } from "@/lib/supabase/server";
import { avatarUrl, displayName } from "@/lib/auth/profile";
import { readJson, KB } from "@/lib/api/body";
import { forbidden, unavailable } from "@/lib/api/http";
import { enforceRateLimit, rateLimitIdentity } from "@/lib/api/rateLimit";
import { resolveJoinRole, type GrantHeld } from "@/lib/api/rooms";
import { grantSchema, roomSchema } from "@/lib/api/schemas";

// Liveblocks access-token endpoint. The client sends the room it wants to join
// plus the share grant from the link. We verify the grant server-side and grant
// Liveblocks access at the role's level — "view" is READ-only (writes to the Yjs
// doc are rejected by Liveblocks), everything else is full write access.
//
// A missing grant used to mean "host / bare dev link" and was given FULL_ACCESS.
// That made the room id itself the credential, and every view-link recipient has
// it. No grant now means no access, unless the caller is provably the room's owner
// (server-side record or signed owner cookie — see src/lib/api/rooms.ts).
export const runtime = "nodejs";

// Built on first use, NOT at module scope. `new Liveblocks()` validates the key
// format in its constructor, so with the variable unset it threw on `secret: ""`
// while Next was collecting page data — failing the whole production build in
// CI and in any clone without the secret, even though the handler below already
// answers "live collaboration is not configured" for exactly that case. A build
// must not require a runtime secret. The other two Liveblocks routes
// (api/account/delete, api/account/retention) already construct inside their
// handlers; this brings the third into line.
let client: Liveblocks | null = null;
const liveblocks = () => (client ??= new Liveblocks({ secret: process.env.LIVEBLOCKS_SECRET_KEY! }));

const bodySchema = z.object({
  room: roomSchema,
  grant: grantSchema.nullish(),
});

export async function POST(req: Request) {
  if (!process.env.LIVEBLOCKS_SECRET_KEY) {
    return unavailable(
      "live collaboration is not configured",
      "set LIVEBLOCKS_SECRET_KEY to enable live rooms",
    );
  }
  if (!shareSigningConfigured()) {
    return unavailable(
      "sharing is not configured",
      "set SHARE_SIGNING_SECRET (or LIVEBLOCKS_SECRET_KEY) so share links can be verified",
    );
  }

  // A signed-in collaborator is a stable principal with their own name; a link
  // visitor without an account is still welcome, as a throwaway anonymous one.
  // The grant, not the identity, is what decides access — an account does not by
  // itself grant entry to someone else's room.
  const user = await getServerUser().catch(() => null);

  const limited = await enforceRateLimit("liveblocks-auth", rateLimitIdentity(req, user?.id), {
    limit: 120,
    windowSec: 60,
    kind: "abuse",
  });
  if (limited) return limited;

  const parsed = await readJson(req, bodySchema, 8 * KB);
  if (!parsed.ok) return parsed.response;
  const { room, grant } = parsed.data;

  let held: GrantHeld | null = null;
  if (grant) {
    const g = verifyGrant(grant);
    // A grant that doesn't verify, or is for a different room, is an attempt —
    // not a typo. Refuse rather than quietly falling back to a lesser role.
    if (!g || g.room !== room) return forbidden("invalid share link for this room");
    held = { room: g.room, role: g.role, exp: g.exp };
  }

  const role = await resolveJoinRole({ room, held, userId: user?.id ?? null });
  if (!role) {
    return forbidden(
      "you do not have access to this room",
      "open it with a share link, or sign in as its owner",
    );
  }

  const session = user
    ? liveblocks().prepareSession(user.id, {
        userInfo: { name: displayName(user), avatar: avatarUrl(user) ?? undefined },
      })
    // A stable id per browser, not a fresh one per request: Liveblocks counts
    // distinct user ids as monthly active users, so minting one each call billed
    // a single guest once per page load.
    : liveblocks().prepareSession(await stableAnonId());
  session.allow(room, role === "view" ? session.READ_ACCESS : session.FULL_ACCESS);
  const { body, status } = await session.authorize();
  return new Response(body, { status });
}
