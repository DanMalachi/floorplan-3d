import { execFile } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Runs every *.test.ts script in the repo as its own child process and asserts
// it exits 0.
//
// WHY A CHILD PROCESS AND NOT AN IMPORT
//
// These suites predate any framework. Each one keeps a module-level `failures`
// counter, console.logs its results, and finishes with
// `process.exit(failures === 0 ? 0 : 1)`. Imported into a vitest worker that
// exit() would kill the worker mid-run, and a file with no it()/test() call is
// an error to vitest ("No test suite found"), so importing them cannot work
// without rewriting all 29.
//
// Rewriting is not available: src/viewport3d/geometry/*.test.ts is listed in
// docs/PROTECTED_PATHS.md, which CLAUDE.md rule 1 freezes. Rather than convert
// some suites and special-case the frozen ones, every suite is treated the
// same way — as an executable whose exit code is the assertion. That is what
// the scripts were already designed to report, so nothing is lost, and the
// files stay byte-for-byte identical.
//
// WHY DISCOVERY IS DYNAMIC
//
// Before this ran, 17 of the 29 suites were wired into an npm script and the
// other 12 were reachable only by typing the path by hand — so they were, in
// practice, never run. Globbing the tree instead of listing files means a new
// *.test.ts is picked up the moment it lands, and cannot silently rot.

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

// legacy/ is quarantined read-only reference (CLAUDE.md rule 2) and must never
// be executed. test/ is this adapter itself. node_modules for obvious reasons.
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "legacy", "test", "coverage"]);

function findSuites(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(path.join(repoRoot, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) findSuites(rel, found);
    } else if (entry.name.endsWith(".test.ts")) {
      found.push(rel);
    }
  }
  return found;
}

const suites = [...findSuites("src"), ...findSuites("scripts")].sort();

describe("suites", () => {
  it("discovers every suite in the repo", () => {
    // A floor, not an exact count — this fails loudly if a whole tree stops
    // being scanned, without needing an edit every time a suite is added.
    expect(suites.length).toBeGreaterThanOrEqual(29);
  });

  for (const suite of suites) {
    it.concurrent(suite, async () => {
      const { code, output } = await run(suite);
      // The script's own ok/FAIL lines are the useful diagnostic, so surface
      // them on failure rather than just "exited 1".
      expect(code, `${suite} failed:\n\n${output}`).toBe(0);
    });
  }
});

function run(suite: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    // `node --import tsx` rather than `npx tsx`: no shell, no .cmd shim, and
    // no PATH lookup, so it behaves the same on Windows and on CI's Linux.
    const child = execFile(
      process.execPath,
      ["--import", "tsx", suite],
      { cwd: repoRoot, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        const output = `${stdout}${stderr}`.trim();
        // A non-zero exit arrives here as an error carrying `code`; that is a
        // failing suite, which is a result, not a crash. Anything without a
        // numeric code (spawn failure, timeout kill) is a real problem.
        if (error && typeof error.code !== "number") return reject(error);
        resolve({ code: error ? (error.code as number) : 0, output });
      },
    );
    child.on("error", reject);
  });
}
