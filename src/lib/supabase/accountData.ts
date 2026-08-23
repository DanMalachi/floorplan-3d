import type { SupabaseClient } from "@supabase/supabase-js";

// -----------------------------------------------------------------------------
// Where a user's bytes actually live, and how to enumerate them.
//
// Shared by the account-deletion route and the scheduled retention sweep so both
// agree on one definition of "everything belonging to <uid>". Two copies of that
// definition would drift, and the drift is exactly the bug that leaves a plan
// image behind after an account is deleted.
//
// Layout (mirrors supabase/migrations/0001_projects.sql):
//   public.projects      one row per plan   — owner uuid
//   public.project_docs  one row per plan   — owner uuid, cascades from projects
//   storage plans/       <uid>/<projectId>.<ext>   the imported plan image
//   storage thumbs/      <uid>/<projectId>.jpg     the gallery thumbnail
//
// The first path segment IS the owner, which is what makes a prefix listing an
// exhaustive answer rather than a guess: we never reconstruct paths from table
// columns, because a row whose push failed after the upload still left an object
// behind, and that object is the user's data too.
// -----------------------------------------------------------------------------

export const BUCKETS = ["plans", "thumbs"] as const;
export type Bucket = (typeof BUCKETS)[number];

/** Supabase caps a single list page; walk until a short page comes back. */
const PAGE = 1000;
/** `storage.remove()` takes an array; keep each request a sane size. */
const REMOVE_CHUNK = 100;

export interface StoredObject {
  bucket: Bucket;
  /** Full path within the bucket, e.g. `a1b2/c3d4.png`. */
  path: string;
  /** Bytes, when the API reported it (it usually does). */
  size: number | null;
  /** Object creation time, used by the retention sweep's grace period. */
  createdAt: number | null;
}

interface ListEntry {
  name: string;
  id: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  metadata?: { size?: number | null } | null;
}

/**
 * Every object under `prefix` in one bucket. Folders come back from the Storage
 * API with a null `id`, so that is the file/folder discriminator; we recurse one
 * extra level defensively even though today's layout is flat.
 */
export async function listObjects(
  supabase: SupabaseClient,
  bucket: Bucket,
  prefix: string,
  depth = 2,
): Promise<StoredObject[]> {
  const out: StoredObject[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: PAGE, offset });
    // A listing error is NOT "there is nothing here" — treating it as empty is
    // how a deletion reports success over data it never managed to look at.
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    const entries = (data ?? []) as ListEntry[];

    for (const entry of entries) {
      const path = prefix ? `${prefix.replace(/\/$/, "")}/${entry.name}` : entry.name;
      if (entry.id === null) {
        if (depth > 0) out.push(...(await listObjects(supabase, bucket, path, depth - 1)));
        continue;
      }
      out.push({
        bucket,
        path,
        size: entry.metadata?.size ?? null,
        createdAt: entry.created_at ? Date.parse(entry.created_at) : null,
      });
    }

    if (entries.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

/** Every object this user owns, across both buckets. */
export async function listUserObjects(supabase: SupabaseClient, userId: string): Promise<StoredObject[]> {
  const out: StoredObject[] = [];
  for (const bucket of BUCKETS) out.push(...(await listObjects(supabase, bucket, userId)));
  return out;
}

/**
 * The top-level folder names in a bucket — one per user id that has ever
 * uploaded. The retention sweep's entry point, since there is no other server-
 * side index of who has objects.
 */
export async function listUserFolders(supabase: SupabaseClient, bucket: Bucket): Promise<string[]> {
  const names: string[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list("", { limit: PAGE, offset });
    if (error) throw new Error(`list ${bucket}/: ${error.message}`);
    const entries = (data ?? []) as ListEntry[];
    for (const entry of entries) if (entry.id === null) names.push(entry.name);
    if (entries.length < PAGE) break;
    offset += PAGE;
  }
  return names;
}

export interface RemoveReport {
  /** Paths the API confirmed it removed. */
  removed: string[];
  /** One message per failed chunk. Empty means every chunk succeeded. */
  errors: string[];
}

/** Delete objects from one bucket, chunked. Never throws — the caller decides
 *  what a partial failure means, and for deletion it means "do not report ok". */
export async function removeObjects(
  supabase: SupabaseClient,
  bucket: Bucket,
  paths: string[],
): Promise<RemoveReport> {
  const report: RemoveReport = { removed: [], errors: [] };
  for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
    const chunk = paths.slice(i, i + REMOVE_CHUNK);
    const { data, error } = await supabase.storage.from(bucket).remove(chunk);
    if (error) {
      report.errors.push(`${bucket}: ${error.message} (${chunk.length} object(s))`);
      continue;
    }
    // Supabase returns the rows it actually deleted. A path that was already
    // gone simply isn't in the response, which is fine — but a path that is
    // still there after a "successful" call is not, so callers re-list.
    report.removed.push(...(data ?? []).map((row: { name: string }) => row.name));
  }
  return report;
}

/** `<uid>/<projectId>.<ext>` → `<projectId>`, or null if the name isn't one of ours. */
export function projectIdFromPath(path: string): string | null {
  const file = path.slice(path.lastIndexOf("/") + 1);
  const stem = file.replace(/\.[a-z0-9]+$/i, "");
  return /^[0-9a-f-]{8,}$/i.test(stem) ? stem : null;
}

export const totalBytes = (objects: StoredObject[]): number =>
  objects.reduce((sum, o) => sum + (o.size ?? 0), 0);
