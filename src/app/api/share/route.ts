import { signGrant } from "@/collab/grant.server";
import type { ShareRole } from "@/collab/share";

// Mint a signed grant for (room, role) — the tamper-proof capability inside a
// share link's ?g=. Signing needs the secret, so it lives server-side.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const { room, role } = (await req.json().catch(() => ({}))) as { room?: string; role?: string };
  if (typeof room !== "string" || !room) {
    return Response.json({ error: "bad room" }, { status: 400 });
  }
  const r: ShareRole = role === "view" || role === "decorate" || role === "build" ? role : "view";
  return Response.json({ grant: signGrant({ room, role: r }) });
}
