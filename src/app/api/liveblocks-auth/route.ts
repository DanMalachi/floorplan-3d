import { Liveblocks } from "@liveblocks/node";
import { randomUUID } from "node:crypto";
import { verifyGrant } from "@/collab/grant.server";
import { getServerUser } from "@/lib/supabase/server";
import { avatarUrl, displayName } from "@/lib/auth/profile";
import type { ShareRole } from "@/collab/share";

// Liveblocks access-token endpoint. The client sends the room it wants to join
// plus the share grant from the link. We verify the grant server-side and grant
// Liveblocks access at the role's level — "view" is READ-only (writes to the Yjs
// doc are rejected by Liveblocks), everything else is full write access.
export const runtime = "nodejs";

const liveblocks = new Liveblocks({ secret: process.env.LIVEBLOCKS_SECRET_KEY ?? "" });

export async function POST(req: Request) {
  const { room, grant } = (await req.json().catch(() => ({}))) as { room?: string; grant?: string };
  if (typeof room !== "string" || !room) return new Response("bad room", { status: 400 });

  let role: ShareRole = "build"; // no grant = full (host / bare dev link)
  if (grant) {
    const g = verifyGrant(grant);
    if (!g || g.room !== room) return new Response("forbidden", { status: 403 });
    role = g.role;
  }

  // A signed-in collaborator is a stable principal with their own name; a link
  // visitor without an account is still welcome, as a throwaway anonymous one.
  // The grant, not the identity, is what decides access — an account does not by
  // itself grant entry to someone else's room.
  const user = await getServerUser();
  const session = user
    ? liveblocks.prepareSession(user.id, {
        userInfo: { name: displayName(user), avatar: avatarUrl(user) ?? undefined },
      })
    : liveblocks.prepareSession(`anon-${randomUUID()}`);
  session.allow(room, role === "view" ? session.READ_ACCESS : session.FULL_ACCESS);
  const { body, status } = await session.authorize();
  return new Response(body, { status });
}
