import { writeFile, readFile, mkdtemp, mkdir, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { requireUser } from "@/lib/api/auth";
import { readFormData, checkFile, byteLimitFromEnv, MB } from "@/lib/api/body";
import { apiError } from "@/lib/api/http";
import { enforceRateLimit, rateLimitIdentity } from "@/lib/api/rateLimit";
import { localToolsGate, requireExe, runTool } from "@/lib/api/localTools";

// DWG is Autodesk's proprietary binary format — there is no reliable pure-JS
// reader, so we convert DWG -> DXF locally with the free ODA File Converter and
// hand the DXF text back to the browser, which parses it exactly like an uploaded
// .dxf. Files never leave this machine.
//
// Install: https://www.opendesign.com/guestfiles/oda_file_converter
//
// NOTE this one IS wired into the product (src/store/useSceneStore.ts, DWG import)
// — unlike the other two spawners. It has never been able to work on Vercel (no
// converter there), so gating it changes nothing in production, but a local
// machine that wants DWG import must now set LOCAL_TOOLS_ENABLED=true and
// ODA_CONVERTER_EXE. The old code scanned C:\Program Files\ODA\* to guess; that
// guess is gone, because a route that starts a process must be told which one.
export const runtime = "nodejs";
export const maxDuration = 120;

const ODA_DOWNLOAD = "https://www.opendesign.com/guestfiles/oda_file_converter";
const MAX_UPLOAD = byteLimitFromEnv("MAX_UPLOAD_BYTES", 25 * MB);

export async function POST(req: Request) {
  const gate = localToolsGate("DWG conversion");
  if (gate) return gate;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const limited = await enforceRateLimit("dwg2dxf", rateLimitIdentity(req, auth.user.id), {
    limit: 30,
    windowSec: 60 * 60,
    kind: "cost",
  });
  if (limited) return limited;

  const form = await readFormData(req, MAX_UPLOAD + 64 * 1024); // + multipart framing
  if (!form.ok) return form.response;

  const file = checkFile(form.data.get("file"), {
    maxBytes: MAX_UPLOAD,
    extensions: ["dwg"],
    mimeTypes: [
      "image/vnd.dwg",
      "application/acad",
      "application/x-acad",
      "application/dwg",
      "application/x-dwg",
      "application/octet-stream",
    ],
  });
  if (!file.ok) return file.response;

  const exe = await requireExe("ODA_CONVERTER_EXE", "ODA File Converter");
  if (!exe.ok) {
    return apiError(
      503,
      "ODA File Converter is not configured",
      `Install the free converter and set ODA_CONVERTER_EXE to its path. Download: ${ODA_DOWNLOAD}`,
    );
  }

  let work: string | null = null;
  try {
    // Isolated in/out folders — the converter works on directories, not files.
    // The uploaded name is discarded: it is attacker-controlled and would
    // otherwise reach the filesystem.
    work = await mkdtemp(join(tmpdir(), "fp-dwg-"));
    const inDir = join(work, "in");
    const outDir = join(work, "out");
    await mkdir(inDir, { recursive: true });
    await mkdir(outDir, { recursive: true });
    await writeFile(join(inDir, "plan.dwg"), Buffer.from(await file.data.arrayBuffer()));

    // ODAFileConverter <inFolder> <outFolder> <outVer> <outType> <recurse> <audit> [filter]
    const { code, stderr, timedOut } = await runTool(
      exe.path,
      [inDir, outDir, "ACAD2018", "DXF", "0", "0", "*.DWG"],
      { timeoutMs: 110_000 },
    );
    if (timedOut) return apiError(504, "DWG conversion timed out");

    // The converter's exit code is unreliable across versions — trust the output
    // file instead. Find the produced .dxf.
    const produced = (await readdir(outDir)).find((f) => /\.dxf$/i.test(f));
    if (!produced) {
      console.error("[dwg2dxf] no output", { code, stderr: stderr.slice(0, 2000) });
      return apiError(500, "DWG conversion produced no DXF");
    }

    const dxf = await readFile(join(outDir, produced), "utf8");
    return Response.json({ dxf });
  } catch (e) {
    console.error("[dwg2dxf] error", e);
    return apiError(500, "DWG conversion error");
  } finally {
    if (work) await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
