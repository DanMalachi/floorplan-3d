/**
 * material-spec.md §7 — the conformance test. Gate, not just a check: an
 * asset with no recorded encoder identity fails CLOSED here, before any
 * render capture is attempted, because §7 step 5 makes "no lighting file was
 * touched" a precondition, and an unencoded WebP asset was never run through
 * the pipeline §7 is actually verifying.
 *
 * The render-comparison half of §7 (mount candidate in the calibration empty
 * slot, capture the physically-motivated cell, diff everywhere-but-the-slot
 * against `docs/calibration/`) is now wired for real (M3d/D3) — it shells
 * out to `render-check.mjs`, which does the actual browser capture and
 * diffing, rather than reimplementing that here. This gate's own job stays
 * narrow: the encoder-identity fail-closed check, plus interpreting
 * render-check.mjs's result.
 *
 * `render-check.mjs` always reads the DEFAULT manifest
 * (`data/materials-ingest.manifest.json`) and hits a live dev server at
 * localhost:3000 — it has no notion of a custom `manifestPath`. So this
 * function's render-comparison step is only meaningful against the real
 * catalog. Against a scratch/test manifest, `render-check.mjs` fails at its
 * own `findEntry` lookup (asset not in the default manifest) before ever
 * touching a browser or the network — which is exactly the right, honest
 * failure for that case, not a special-cased skip.
 *
 * Run:
 *   npx tsx scripts/materials/conformance.ts <assetId>
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { findEntry, MANIFEST_PATH } from "./ingest/manifest";

const RENDER_CHECK_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "render-check.mjs");

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

  try {
    const out = execFileSync("npx", ["tsx", RENDER_CHECK_PATH, id], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });
    const diffMatch = out.match(/outside-crop diff = ([\d.]+)% of pixels/);
    return {
      ok: true,
      reason: `§7 PASS — render-comparison diff ${diffMatch ? diffMatch[1] + "%" : "(unparsed)"} against docs/calibration/suburb-full.png, outside the candidate panel`,
    };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const output = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim();
    const lastLine = output.split("\n").filter(Boolean).pop() ?? err.message ?? "unknown error";
    return { ok: false, reason: `§7: render-comparison FAILED for "${id}" — ${lastLine}` };
  }
}

function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: tsx scripts/materials/conformance.ts <assetId>");
    process.exit(2);
  }
  const result = checkConformance(id);
  console.log(result.ok ? `PASS: ${result.reason}` : `FAIL: ${result.reason}`);
  process.exit(result.ok ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
