import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/api/auth";
import { readFormData, checkFile, byteLimitFromEnv, MB } from "@/lib/api/body";
import { apiError, badRequest } from "@/lib/api/http";
import { enforceRateLimit, rateLimitIdentity } from "@/lib/api/rateLimit";
import { localToolsGate, requireExe, runTool } from "@/lib/api/localTools";

// PDF vector extraction — spawns Python (PyMuPDF) on the host. The browser path
// (src/lib/import/importPdfClient.ts) replaced this for normal imports; the route
// belongs to the paused auto-extraction work and is kept for when that resumes.
//
// It was reachable by anyone, and it wrote an attacker-supplied file to disk and
// started a process for them. It is now off unless LOCAL_TOOLS_ENABLED=true, needs
// an account, and needs PYTHON_EXE to name the interpreter — the hardcoded
// C:\Users\dandu\... path is gone.
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_UPLOAD = byteLimitFromEnv("MAX_UPLOAD_BYTES", 25 * MB);

export async function POST(req: Request) {
  const gate = localToolsGate("PDF extraction");
  if (gate) return gate;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const limited = await enforceRateLimit("extract", rateLimitIdentity(req, auth.user.id), {
    limit: 30,
    windowSec: 60 * 60,
    kind: "cost",
  });
  if (limited) return limited;

  const form = await readFormData(req, MAX_UPLOAD + 64 * 1024); // + multipart framing
  if (!form.ok) return form.response;

  const file = checkFile(form.data.get("file"), {
    maxBytes: MAX_UPLOAD,
    extensions: ["pdf"],
    mimeTypes: ["application/pdf", "application/x-pdf", "application/octet-stream"],
  });
  if (!file.ok) return file.response;

  // Page index reaches a command line, so it is a bounded integer or nothing.
  const rawPage = String(form.data.get("page") ?? "0");
  if (!/^\d{1,4}$/.test(rawPage)) return badRequest("page must be a page index");
  const page = String(Number(rawPage));

  const python = await requireExe("PYTHON_EXE", "Python interpreter");
  if (!python.ok) return python.response;

  let tmp: string | null = null;
  try {
    tmp = join(tmpdir(), `fp-${randomUUID()}.pdf`);
    await writeFile(tmp, Buffer.from(await file.data.arrayBuffer()));

    const script = join(process.cwd(), "legacy", "scripts", "extract_pdf.py");
    const { code, stdout, stderr, timedOut } = await runTool(python.path, [script, tmp, page], {
      timeoutMs: 55_000,
    });

    if (timedOut) return apiError(504, "extractor timed out");
    if (code !== 0 || !stdout.trim()) {
      console.error("[extract] failed", { code, stderr: stderr.slice(0, 2000) });
      return apiError(500, "extractor failed");
    }
    // The Python side already emits valid JSON — pass it straight through.
    return new Response(stdout, { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("[extract] error", e);
    return apiError(500, "extractor error");
  } finally {
    if (tmp) await unlink(tmp).catch(() => {});
  }
}
