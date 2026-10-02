import { z } from "zod";
import { verifyGrant, shareSigningConfigured } from "@/collab/grant.server";
import { serviceRoleConfigured } from "@/lib/supabase/admin";
import { readJson, KB } from "@/lib/api/body";
import { rejectCrossSiteWrite } from "@/lib/api/csrf";
import { badRequest, forbidden, unavailable } from "@/lib/api/http";
import { enforceRateLimit, rateLimitIdentity } from "@/lib/api/rateLimit";
import { grantSchema } from "@/lib/api/schemas";
import { checkGrantRevocation } from "@/lib/api/revocation";
import { storeShortLink } from "@/lib/api/shortLinks";

// POST /api/share/short — turn a grant the caller already holds into a short
// code for `done.design/s#<code>`. See supabase/migrations/0009_share_links.sql.
//
// No new authority is created here: the code opens exactly what the grant
// opens, for no longer than the grant lives, and only a grant this server
// signed (and has not revoked) is accepted. Whoever has a grant could already
// forward it — the short code is the same capability with fewer characters.
//
// Every failure is a soft one for the client: /api/share already handed it a
// working long link, and the Share box falls back to that.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ grant: grantSchema }).strict();

export async function POST(req: Request) {
  const blocked = rejectCrossSiteWrite(req);
  if (blocked) return blocked;

  if (!shareSigningConfigured() || !serviceRoleConfigured) {
    return unavailable("short links are not available on this deployment");
  }

  const limited = await enforceRateLimit("share-short", rateLimitIdentity(req), {
    limit: 30,
    windowSec: 60,
    kind: "abuse",
  });
  if (limited) return limited;

  const parsed = await readJson(req, bodySchema, 4 * KB);
  if (!parsed.ok) return parsed.response;

  const g = verifyGrant(parsed.data.grant);
  if (!g) return forbidden("not a valid share link");
  // Grants minted before `iat` existed cannot be stored faithfully (resolve
  // would have to invent one). They are all past their 30 days by now anyway.
  if (g.iat === undefined || g.exp === undefined) return badRequest("this link is too old to shorten");

  const state = await checkGrantRevocation(g.room, g.iat);
  if (state === "unavailable") return unavailable("could not verify your access", "try again in a moment");
  if (state === "revoked") return forbidden("this link has been withdrawn");

  const code = await storeShortLink({ room: g.room, role: g.role, iat: g.iat, exp: g.exp });
  if (!code) return unavailable("could not create a short link");
  return Response.json({ code }, { headers: { "cache-control": "no-store" } });
}
