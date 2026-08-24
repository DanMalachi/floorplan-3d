import { getServerSupabase, getServerUser } from "@/lib/supabase/server";
import { sendEmailAfterResponse } from "@/lib/email";
import { dataExportNoticeEmail } from "@/lib/email/templates";

// -----------------------------------------------------------------------------
// GET /api/account/export — access + portability (GDPR Art. 15 / Art. 20).
//
// Returns ONE self-contained JSON file: the account's profile fields, every
// project row, every project document (the full geometry), and the actual plan
// image and thumbnail bytes inlined as base64. Self-contained is the point —
// handing back signed URLs that expire in an hour is a link to your data, not a
// copy of it, and the regulation asks for the copy.
//
// Deliberately uses the CALLER'S OWN session client, not the service role. RLS
// then scopes every query to `owner = auth.uid()` in Postgres, so this route
// physically cannot read another account even if a filter were mistyped. The
// service-role key stays confined to deletion and the retention sweep.
//
// Streamed, not buffered: plan images are multi-MB and an account can hold many.
// The response is built project by project, so peak memory is roughly one image
// rather than the whole archive.
// -----------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = { image: "plans", thumb: "thumbs" } as const;

interface ProjectRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  rev: number;
  schema_version: number;
  plan_image_path: string | null;
  plan_image_hash: string | null;
  thumb_path: string | null;
  live_room_id: string | null;
  live_role: string | null;
  deleted_at: string | null;
}

export async function GET() {
  const supabase = await getServerSupabase();
  const user = await getServerUser();
  if (!supabase || !user) return new Response("not signed in", { status: 401 });

  const { data, error } = await supabase
    .from("projects")
    .select(
      "id,name,created_at,updated_at,rev,schema_version,plan_image_path,plan_image_hash,thumb_path,live_room_id,live_role,deleted_at",
    )
    .order("created_at", { ascending: true });
  if (error) return new Response(`export failed: ${error.message}`, { status: 500 });
  const rows = (data ?? []) as ProjectRow[];

  // Security/audit notice, not a "your download is ready" link: the export
  // streams straight back to this same request below, so by the time this
  // fires the recipient already has (or is already receiving) their data.
  // Scheduled for after the response via sendEmailAfterResponse(), which never
  // throws and adds no latency to the export itself — a mail failure here must
  // not turn a successful export into a failed request.
  if (user.email) {
    sendEmailAfterResponse(
      dataExportNoticeEmail({ to: user.email, generatedAt: new Date(), projectCount: rows.length }),
      { template: "data-export-notice", userId: user.id },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (s: string) => controller.enqueue(encoder.encode(s));
      try {
        write(
          `{\n"export_version": 1,\n"generated_at": ${JSON.stringify(new Date().toISOString())},\n"account": ${JSON.stringify(
            {
              id: user.id,
              email: user.email ?? null,
              // Everything Google gave us at sign-in. Included verbatim because
              // it is personal data we hold, and an access request covers it.
              identity: user.user_metadata ?? {},
              provider: user.app_metadata?.provider ?? null,
              created_at: user.created_at ?? null,
              last_sign_in_at: user.last_sign_in_at ?? null,
            },
            null,
            2,
          )},\n"projects": [\n`,
        );

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (i > 0) write(",\n");

          // Geometry lives in its own table; pulled per project so one huge
          // document never has to sit in memory alongside the others.
          const doc = await supabase
            .from("project_docs")
            .select("rev,state,updated_at")
            .eq("project_id", row.id)
            .maybeSingle();

          write("{\n");
          write(`"project": ${JSON.stringify(row, null, 2)},\n`);
          write(`"document": ${JSON.stringify(doc.data?.state ?? null)},\n`);
          write(`"document_rev": ${JSON.stringify(doc.data?.rev ?? null)},\n`);
          write(`"plan_image": ${JSON.stringify(await fetchObject(supabase, BUCKET.image, row.plan_image_path))},\n`);
          write(`"thumbnail": ${JSON.stringify(await fetchObject(supabase, BUCKET.thumb, row.thumb_path))}\n`);
          write("}");
        }

        write(
          `\n],\n"notes": ${JSON.stringify(
            [
              "Plans stored only in a browser's local storage were never uploaded and are not in this file; export them from that browser.",
              "Live collaboration rooms are hosted by Liveblocks. This file contains the copy synced back to your account, not the room's own edit history.",
              "Images are base64 in `plan_image.base64` / `thumbnail.base64`, decodable with the stated content_type.",
            ],
            null,
            2,
          )}\n}\n`,
        );
        controller.close();
      } catch (e) {
        // The response has already begun, so the status is long since sent. Make
        // the truncation visible in the file itself rather than handing back a
        // silently short archive that looks complete.
        write(`\n], "error": ${JSON.stringify(e instanceof Error ? e.message : String(e))}, "complete": false }\n`);
        controller.close();
      }
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="floorplan3d-export-${stamp}.json"`,
      "cache-control": "no-store",
    },
  });
}

/** Download one storage object and inline it. Null when there is nothing to fetch. */
async function fetchObject(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabase>>>,
  bucket: string,
  path: string | null,
): Promise<{ path: string; content_type: string; bytes: number; base64: string } | { path: string; error: string } | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).download(path);
  // A missing file is reported inline rather than thrown: one unreadable image
  // should not cost the user the rest of their export.
  if (error || !data) return { path, error: error?.message ?? "not found" };
  const buffer = Buffer.from(await data.arrayBuffer());
  return {
    path,
    content_type: data.type || "application/octet-stream",
    bytes: buffer.byteLength,
    base64: buffer.toString("base64"),
  };
}
