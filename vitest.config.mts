import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Vitest is the runner; it is NOT (yet) the format the tests are written in.
//
// Every suite in this repo is a standalone tsx script: it counts its own
// failures, prints ok/FAIL lines, and ends with process.exit(0|1). Several of
// them live under src/viewport3d/geometry/, which docs/PROTECTED_PATHS.md
// freezes — so converting them to describe/it is not on the table.
//
// So the include list below deliberately points ONLY at test/, where a single
// adapter suite runs each of those scripts as a child process and asserts on
// its exit code. The scripts themselves are never imported, never edited, and
// never see vitest at all. See docs/TESTING.md.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["test/**/*.test.ts"],
    // A child process per suite, ~29 of them: generous per-test budget.
    testTimeout: 180_000,
    hookTimeout: 60_000,
    // Coverage is measured by c8, not by vitest — see .c8rc.json and
    // docs/TESTING.md. vitest's own v8 provider instruments only the worker
    // process, and every suite here runs in a CHILD process, so it reported a
    // flat 0% across 16,070 statements. c8 sets NODE_V8_COVERAGE for the whole
    // process tree, so it sees the children and reports real numbers.
  },
});
