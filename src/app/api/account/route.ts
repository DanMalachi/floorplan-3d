import { getServerSupabase, getServerUser } from "@/lib/supabase/server";
import { serviceRoleConfigured } from "@/lib/supabase/admin";
import { BUCKETS, listObjects, totalBytes, type StoredObject } from "@/lib/supabase/accountData";

// -----------------------------------------------------------------------------
// GET /api/account — "what do you hold about me", for the account page.
//
// Read-only and session-scoped (RLS does the filtering), so it needs no elevated
// key. It also reports whether this deployment can actually delete an account,
// which is what stops the UI offering a button that would 503 — a delete control
// that fails is worse than one that isn't there.
// -----------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await getServerSupabase();
  const user = await getServerUser();
  if (!supabase || !user) return new Response("not signed in", { status: 401 });

  const { data, error } = await supabase.from("projects").select("id,live_room_id,deleted_at");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const rows = data ?? [];

  let objects: StoredObject[] = [];
  let storageError: string | null = null;
  try {
    for (const bucket of BUCKETS) objects.push(...(await listObjects(supabase, bucket, user.id)));
  } catch (e) {
    // Report the gap instead of a confident zero — "0 files" would read as
    // "nothing stored", which is the opposite of what an unreadable listing means.
    objects = [];
    storageError = e instanceof Error ? e.message : String(e);
  }

  return Response.json({
    account: {
      id: user.id,
      email: user.email ?? null,
      created_at: user.created_at ?? null,
      last_sign_in_at: user.last_sign_in_at ?? null,
    },
    holdings: {
      projects: rows.filter((r) => !r.deleted_at).length,
      pendingPurge: rows.filter((r) => r.deleted_at).length,
      liveRooms: new Set(rows.map((r) => r.live_room_id).filter(Boolean)).size,
      files: objects.length,
      bytes: totalBytes(objects),
      storageError,
    },
    deletionAvailable: serviceRoleConfigured,
  });
}
