import { spawn } from "node:child_process";
import { writeFile, unlink, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

// Resolve a working Python interpreter. The bare `python` on this machine is the
// broken Windows Store alias, so prefer the real install; override with PYTHON_EXE.
const PY_CANDIDATES = [
  process.env.PYTHON_EXE,
  "C:\\Users\\dandu\\AppData\\Local\\Programs\\Python\\Python311\\python.exe",
  "py",
  "python3",
].filter(Boolean) as string[];

async function resolvePython(): Promise<string> {
  for (const c of PY_CANDIDATES) {
    if (c === "py" || c === "python3") return c; // on PATH, can't easily stat
    try {
      await access(c);
      return c;
    } catch {
      /* try next */
    }
  }
  return "py";
}

function runExtractor(py: string, script: string, pdfPath: string, page: string) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(py, [script, pdfPath, page], { windowsHide: true });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => err.push(d));
    child.on("error", (e) => resolve({ code: -1, stdout: "", stderr: String(e) }));
    child.on("close", (code) =>
      resolve({
        code: code ?? -1,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
      }),
    );
  });
}

export async function POST(req: Request) {
  let tmp: string | null = null;
  try {
    const form = await req.formData();
    const file = form.get("file");
    const page = String(form.get("page") ?? "0");
    if (!(file instanceof File)) {
      return Response.json({ error: "no file uploaded" }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    tmp = join(tmpdir(), `fp-${randomUUID()}.pdf`);
    await writeFile(tmp, bytes);

    const py = await resolvePython();
    const script = join(process.cwd(), "scripts", "extract_pdf.py");
    const { code, stdout, stderr } = await runExtractor(py, script, tmp, page);

    if (code !== 0 || !stdout.trim()) {
      return Response.json(
        { error: "extractor failed", detail: stderr.slice(0, 2000) },
        { status: 500 },
      );
    }
    // The Python side already emits valid JSON — pass it straight through.
    return new Response(stdout, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  } finally {
    if (tmp) await unlink(tmp).catch(() => {});
  }
}
