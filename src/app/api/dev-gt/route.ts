import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { z } from "zod";
import { apiError, badRequest, isProduction } from "@/lib/api/http";

// Dev-only: serve a hand-authored ground-truth floorplan from floorplan-gt/ so
// the client can render it in the 3D view (see src/dev/gtToScene.ts). Guarded to
// the gt directory and to non-production, since it reads from the repo tree.
export const runtime = "nodejs";

// Belt and braces on the filename. The pattern already excludes separators and
// dots-only names; resolving the final path and checking it is still inside the gt
// directory is what actually guarantees no traversal, whatever the pattern misses.
const nameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "bad name")
  .refine((s) => !s.includes(".."), "bad name");

export async function GET(req: Request) {
  if (isProduction()) return apiError(404, "not found");

  const parsed = nameSchema.safeParse(new URL(req.url).searchParams.get("name") ?? "");
  if (!parsed.success) return badRequest("bad name");

  const file = parsed.data.endsWith(".json") ? parsed.data : `${parsed.data}.json`;
  const root = resolve(process.cwd(), "legacy", "data", "floorplan-gt");
  const target = resolve(join(root, file));
  if (target !== root && !target.startsWith(root + sep)) return badRequest("bad name");

  try {
    const text = await readFile(target, "utf8");
    return new Response(text, { headers: { "content-type": "application/json" } });
  } catch {
    return apiError(404, `not found: ${file}`);
  }
}
