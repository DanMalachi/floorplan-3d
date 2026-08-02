/**
 * material-spec.md §7 — the conformance test. Gate, not just a check: an
 * asset with no recorded encoder identity fails CLOSED here, before any
 * render capture is attempted, because §7 step 5 makes "no lighting file was
 * touched" a precondition, and an unencoded WebP asset was never run through
 * the pipeline §7 is actually verifying.
 *
 * The render-comparison half of §7 (mount candidate in the calibration empty
 * slot, capture all nine cells, diff everywhere-but-the-slot against
 * `docs/calibration/`) is NOT IMPLEMENTED. Nothing in this codebase has an
 * encoder identity yet (see `ingest/encoder.ts`), so there is nothing to
 * exercise that path against, and stubbing it out today would be exactly the
 * unverified claim CLAUDE.md rule 7 forbids. This script implements the part
 * that IS reachable now — the fail-closed gate — and throws rather than
 * pretending past it.
 *
 * Run:
 *   npx tsx scripts/materials/conformance.ts <assetId>
 */
import { pathToFileURL } from "node:url";
import { findEntry, MANIFEST_PATH } from "./ingest/manifest";

export function checkConformance(id: string, manifestPath: string = MANIFEST_PATH): { ok: boolean; reason: string } {
  const entry = findEntry(id, manifestPath);
  if (!entry) {
    return { ok: false, reason: `no ingest manifest entry for "${id}" — run ingest/run.ts --write first` };
  }
  if (entry.encoder === null) {
    return {
      ok: false,
      reason:
        `§7: REJECTED — "${id}" has no recorded encoder identity (KTX2 deferred, material-spec.md §5.1). ` +
        "An asset cannot pass conformance without one; the gate fails closed rather than treating an unencoded WebP fallback as shippable.",
    };
  }
  throw new Error(
    `§7: encoder identity present for "${id}" (${entry.encoder.tool} ${entry.encoder.version}) but the ` +
      "render-comparison half of the conformance test is NOT IMPLEMENTED — see this file's docstring.",
  );
}

function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: tsx scripts/materials/conformance.ts <assetId>");
    process.exit(2);
  }
  const result = checkConformance(id);
  console.log(result.ok ? `PASS: ${id}` : `FAIL: ${result.reason}`);
  process.exit(result.ok ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
