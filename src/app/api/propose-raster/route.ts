import { z } from "zod";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/api/auth";
import { readJson, byteLimitFromEnv, MB } from "@/lib/api/body";
import { apiError } from "@/lib/api/http";
import { enforceRateLimit, rateLimitIdentity } from "@/lib/api/rateLimit";
import { localToolsGate, requireExe, runTool } from "@/lib/api/localTools";
import { dataUrlImageSchema } from "@/lib/api/schemas";

// Phase 3 M3: run the classical-CV wall proposer over the loaded plan image.
// Body: { image: <data URL> } — the store's background image. Pixel coords in the
// reply are in that image's natural px space, which is exactly the trace space.
//
// Part of the paused auto-extraction work, and it spawns Python on the host. Same
// treatment as /api/extract: off by default, account required, PYTHON_EXE required.
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BODY = byteLimitFromEnv("MAX_UPLOAD_BYTES", 25 * MB);

const bodySchema = z.object({ image: dataUrlImageSchema });

export async function POST(req: Request) {
  const gate = localToolsGate("raster wall proposal");
  if (gate) return gate;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const limited = await enforceRateLimit("propose-raster", rateLimitIdentity(req, auth.user.id), {
    limit: 30,
    windowSec: 60 * 60,
    kind: "cost",
  });
  if (limited) return limited;

  const parsed = await readJson(req, bodySchema, MAX_BODY);
  if (!parsed.ok) return parsed.response;

  const m = /^data:image\/(png|jpe?g|webp);base64,([\s\S]+)$/.exec(parsed.data.image);
  if (!m) return apiError(400, "expected { image: <png/jpeg/webp data URL> }");

  const python = await requireExe("PYTHON_EXE", "Python interpreter");
  if (!python.ok) return python.response;

  let tmp: string | null = null;
  try {
    const ext = m[1] === "jpeg" ? "jpg" : m[1];
    tmp = join(tmpdir(), `fp-raster-${randomUUID()}.${ext}`);
    await writeFile(tmp, Buffer.from(m[2], "base64"));

    const script = join(process.cwd(), "legacy", "scripts", "propose_raster.py");
    const { code, stdout, stderr, timedOut } = await runTool(python.path, [script, tmp], {
      timeoutMs: 55_000,
    });

    if (timedOut) return apiError(504, "raster proposer timed out");
    if (code !== 0 || !stdout.trim()) {
      console.error("[propose-raster] failed", { code, stderr: stderr.slice(0, 2000) });
      return apiError(500, "raster proposer failed");
    }
    // The Python side already emits valid JSON — pass it straight through.
    return new Response(stdout, { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("[propose-raster] error", e);
    return apiError(500, "raster proposer error");
  } finally {
    if (tmp) await unlink(tmp).catch(() => {});
  }
}
