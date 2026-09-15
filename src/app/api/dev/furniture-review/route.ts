/**
 * Dev-only store for the furniture review scene's approve/reject decisions
 * (`/dev/furniture`). Writes `data/furniture-review.decisions.json` in the
 * working tree so the decisions can be read back and applied to the catalog.
 *
 * 404s in production: a deployed site has no writable working tree, and this
 * must never be a public write endpoint.
 */
import { NextResponse } from "next/server";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const FILE = path.join(process.cwd(), "data", "furniture-review.decisions.json");
const dev = process.env.NODE_ENV !== "production";

type Decision = { status: "approved" | "rejected"; note?: string; at: string; name: string };

export async function GET() {
  if (!dev) return new NextResponse(null, { status: 404 });
  try {
    return NextResponse.json(JSON.parse(await readFile(FILE, "utf8")));
  } catch {
    return NextResponse.json({});
  }
}

export async function PUT(req: Request) {
  if (!dev) return new NextResponse(null, { status: 404 });
  const body = (await req.json()) as Record<string, Decision>;
  if (!body || typeof body !== "object" || Array.isArray(body))
    return NextResponse.json({ error: "expected an object" }, { status: 400 });
  const sorted = Object.fromEntries(Object.entries(body).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(FILE, JSON.stringify(sorted, null, 2) + "\n", "utf8");
  return NextResponse.json({ ok: true, count: Object.keys(sorted).length });
}
