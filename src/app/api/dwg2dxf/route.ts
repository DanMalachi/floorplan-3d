import { spawn } from "node:child_process";
import { writeFile, readFile, mkdtemp, mkdir, rm, readdir, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const runtime = "nodejs";
export const maxDuration = 120;

// DWG is Autodesk's proprietary binary format — there is no reliable pure-JS
// reader, so we convert DWG -> DXF locally with the free ODA File Converter and
// hand the DXF text back to the browser, which parses it exactly like an
// uploaded .dxf. Files never leave this machine.
//
// Install: https://www.opendesign.com/guestfiles/oda_file_converter
// Override the exe path with ODA_CONVERTER_EXE if it isn't auto-found.
const ODA_DOWNLOAD = "https://www.opendesign.com/guestfiles/oda_file_converter";

async function resolveConverter(): Promise<string | null> {
  const override = process.env.ODA_CONVERTER_EXE;
  if (override) {
    try {
      await access(override);
      return override;
    } catch {
      /* fall through to auto-detect */
    }
  }
  // ODA installs to C:\Program Files\ODA\ODAFileConverter <ver>\ODAFileConverter.exe
  for (const base of ["C:/Program Files/ODA", "C:/Program Files (x86)/ODA"]) {
    let subdirs: string[];
    try {
      subdirs = await readdir(base);
    } catch {
      continue; // base dir absent
    }
    for (const sub of subdirs) {
      const exe = join(base, sub, "ODAFileConverter.exe");
      try {
        await access(exe);
        return exe;
      } catch {
        /* not here */
      }
    }
  }
  return null;
}

function runConverter(
  exe: string,
  inDir: string,
  outDir: string,
): Promise<{ code: number; stderr: string }> {
  // ODAFileConverter <inFolder> <outFolder> <outVer> <outType> <recurse> <audit> [filter]
  const args = [inDir, outDir, "ACAD2018", "DXF", "0", "0", "*.DWG"];
  return new Promise((resolve) => {
    const child = spawn(exe, args, { windowsHide: true });
    const err: Buffer[] = [];
    child.stderr.on("data", (d) => err.push(d));
    child.on("error", (e) => resolve({ code: -1, stderr: String(e) }));
    child.on("close", (code) =>
      resolve({ code: code ?? -1, stderr: Buffer.concat(err).toString("utf8") }),
    );
  });
}

export async function POST(req: Request) {
  let work: string | null = null;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "no file uploaded" }, { status: 400 });
    }

    const exe = await resolveConverter();
    if (!exe) {
      return Response.json(
        {
          error: "ODA File Converter not found",
          detail: `Install the free ODA File Converter, then retry. Download: ${ODA_DOWNLOAD} (or set ODA_CONVERTER_EXE to its path).`,
        },
        { status: 501 },
      );
    }

    // Isolated in/out folders — the converter works on directories, not files.
    work = await mkdtemp(join(tmpdir(), "fp-dwg-"));
    const inDir = join(work, "in");
    const outDir = join(work, "out");
    await mkdir(inDir, { recursive: true });
    await mkdir(outDir, { recursive: true });
    await writeFile(join(inDir, "plan.dwg"), Buffer.from(await file.arrayBuffer()));

    const { code, stderr } = await runConverter(exe, inDir, outDir);

    // The converter's exit code is unreliable across versions — trust the output
    // file instead. Find the produced .dxf.
    const produced = (await readdir(outDir)).find((f) => /\.dxf$/i.test(f));
    if (!produced) {
      return Response.json(
        {
          error: "DWG conversion produced no DXF",
          detail: (stderr || `converter exit ${code}`).slice(0, 2000),
        },
        { status: 500 },
      );
    }

    const dxf = await readFile(join(outDir, produced), "utf8");
    return Response.json({ dxf });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  } finally {
    if (work) await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
