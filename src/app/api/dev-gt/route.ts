import { readFileSync } from "node:fs";
import { join } from "node:path";

// Dev-only: serve a hand-authored ground-truth floorplan from floorplan-gt/ so
// the client can render it in the 3D view (see src/dev/gtToScene.ts). Guarded to
// the gt directory and to non-production, since it reads from the repo tree.
export const runtime = "nodejs";

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  const name = new URL(req.url).searchParams.get("name") ?? "";
  // allow only a bare filename (no path separators / traversal)
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name.includes("..")) {
    return Response.json({ error: "bad name" }, { status: 400 });
  }
  const file = name.endsWith(".json") ? name : `${name}.json`;
  try {
    const text = readFileSync(join(process.cwd(), "legacy", "data", "floorplan-gt", file), "utf8");
    return new Response(text, { headers: { "content-type": "application/json" } });
  } catch {
    return Response.json({ error: `not found: ${file}` }, { status: 404 });
  }
}
