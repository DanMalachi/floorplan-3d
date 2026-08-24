import { z } from "zod";
import { signGrant, verifyGrant, shareSigningConfigured } from "@/collab/grant.server";
import { readJson, KB } from "@/lib/api/body";
import { optionalUser } from "@/lib/api/auth";
import { unavailable } from "@/lib/api/http";
import { enforceRateLimit, rateLimitIdentity } from "@/lib/api/rateLimit";
import { authorizeMint, type GrantHeld } from "@/lib/api/rooms";
import { grantSchema, roomSchema, shareRoleSchema } from "@/lib/api/schemas";

// Mint a signed grant for (room, role) — the tamper-proof capability inside a
// share link's ?g=. Signing needs the secret, so it lives server-side.
//
// This route used to be unauthenticated and unconditional: POST any room string
// and any role, receive a valid grant. Since a view-link recipient knows the room
// id, that was a one-request path from "can view" to "can edit everything" on
// someone else's design. Authorization now lives in authorizeMint(): you must own
// the room, or already hold a grant for it and be asking for the same role or
// lower. See src/lib/api/rooms.ts for the model.
export const runtime = "nodejs";

const bodySchema = z.object({
  room: roomSchema,
  role: shareRoleSchema,
  /** The grant the caller is currently using for this room, if any. */
  holding: grantSchema.nullish(),
  /** Set when going live for the first time: claims ownership of a new room. */
  create: z.boolean().optional().default(false),
});

export async function POST(req: Request) {
  if (!shareSigningConfigured()) {
    return unavailable(
      "sharing is not configured",
      "set SHARE_SIGNING_SECRET (or LIVEBLOCKS_SECRET_KEY) so share links can be signed",
    );
  }

  const user = await optionalUser();
  const limited = await enforceRateLimit("share", rateLimitIdentity(req, user?.id), {
    limit: 60,
    windowSec: 60,
    kind: "abuse",
  });
  if (limited) return limited;

  const parsed = await readJson(req, bodySchema, 8 * KB);
  if (!parsed.ok) return parsed.response;
  const { room, role, holding, create } = parsed.data;

  // Verify the caller's own grant before it is allowed to justify anything.
  let held: GrantHeld | null = null;
  if (holding) {
    const g = verifyGrant(holding);
    if (g && g.room === room) held = { room: g.room, role: g.role, exp: g.exp };
  }

  const decision = await authorizeMint({
    room,
    requested: role,
    held,
    create,
    userId: user?.id ?? null,
  });
  if (!decision.ok) return decision.response;

  const grant = signGrant(
    decision.ttlMs !== undefined
      ? { room, role: decision.role, ttlMs: decision.ttlMs }
      : { room, role: decision.role },
  );
  return Response.json({ grant, role: decision.role });
}
