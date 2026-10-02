import { z } from "zod";
import { verifyGrant, shareSigningConfigured } from "@/collab/grant.server";
import { serviceRoleConfigured } from "@/lib/supabase/admin";
import { readJson, KB } from "@/lib/api/body";
import { rejectCrossSiteWrite } from "@/lib/api/csrf";
import { apiError, unavailable } from "@/lib/api/http";
import { enforceRateLimit, rateLimitIdentity } from "@/lib/api/rateLimit";
import { checkGrantRevocation } from "@/lib/api/revocation";
import { resolveShortLink, shortCodeSchema } from "@/lib/api/shortLinks";

// POST /api/share/resolve — what `done.design/s#<code>` opens. The landing page
// (src/app/[locale]/s/page.tsx) reads the code from the fragment and sends it
// HERE in a POST body, so the code is never in a URL the server sees, logs, or
// passes on as a Referer — the same F-20 rule the long `#g=` links follow.
//
// The answer is the room and a re-signed grant; the page then navigates to the
// ordinary `/v/<id>#g=<grant>`, and everything after that — role gating, the
// Liveblocks authorizer, remembering the grant for re-entry — is the long-link
// path, unchanged.
//
// Missing, expired and withdrawn codes all answer 404 with one message: telling
// them apart would tell a guesser which codes once existed.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ code: shortCodeSchema }).strict();
const NO_STORE = { "cache-control": "no-store" };

export async function POST(req: Request) {
  const blocked = rejectCrossSiteWrite(req);
  if (blocked) return blocked;

  if (!shareSigningConfigured() || !serviceRoleConfigured) {
    return unavailable("short links are not available on this deployment");
  }

  // Per IP: a visitor opens a handful of links, not hundreds. At 71 bits of
  // code this is not what stops guessing, it stops someone trying.
  const limited = await enforceRateLimit("share-resolve", rateLimitIdentity(req), {
    limit: 30,
    windowSec: 60,
    kind: "abuse",
  });
  if (limited) return limited;

  const parsed = await readJson(req, bodySchema, 1 * KB);
  if (!parsed.ok) return parsed.response;

  const r = await resolveShortLink(parsed.data.code);
  if (!r.ok) {
    if (r.reason === "unavailable") return unavailable("could not open this link", "try again in a moment");
    return apiError(404, "this link does not work anymore");
  }

  const g = verifyGrant(r.grant);
  if (!g) return apiError(404, "this link does not work anymore");
  const state = await checkGrantRevocation(g.room, g.iat);
  if (state === "unavailable") return unavailable("could not open this link", "try again in a moment");
  if (state === "revoked") return apiError(404, "this link does not work anymore");

  return Response.json({ room: r.room, grant: r.grant }, { headers: NO_STORE });
}
