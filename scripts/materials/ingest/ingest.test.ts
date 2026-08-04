// M3b/M3d exit-criteria proof, run against synthetic fixtures (fixtures.ts) so
// nothing here depends on network access or a real asset's licence.
//
//   1. Pipeline runs end to end on a sample asset -> validated, WebP-fallback output.
//   2. Validator rejects a deliberately non-conforming asset, citing the clause.
//   2b. A legitimately dark/patterned (not baked) asset is accepted.
//   3. Conformance test fails on the null encoder record.
//   4. Encoder identity field exists, populated with null, not omitted.
//   5. (if a real `ktx` is on PATH) pipeline runs end to end -> KTX2 output,
//      GPU-resident budget check engages, non-null encoder identity recorded.
//   6. (same condition) conformance.ts still refuses to fabricate a pass for
//      a KTX2 asset — the render-comparison half is D3 work in progress, not
//      done, and it must say so rather than lie.
//
// Tests 1-4 force the encoder-absent path regardless of what's really on this
// machine's PATH (`withNoEncoder`) — M3d found a real `ktx` on this dev
// machine, and the WebP-fallback behavior must stay deterministically
// testable independent of that. Tests 5-6 are the mirror case and are
// environment-conditional because there is no way to fabricate a working
// encoder inside a unit test without one actually being installed.
//
// Run: npx tsx scripts/materials/ingest/ingest.test.ts
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateFixtures } from "./fixtures";
import { ingest } from "./run";
import { detectEncoder, resetEncoderCache } from "./encoder";
import { checkConformance } from "../conformance";
import { findEntry } from "./manifest";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

/** Force `detectEncoder()` to see no encoder, regardless of this machine's
 *  real PATH — see file header. */
async function withNoEncoder<T>(fn: () => Promise<T>): Promise<T> {
  const realPath = process.env.PATH;
  process.env.PATH = "";
  resetEncoderCache();
  try {
    return await fn();
  } finally {
    process.env.PATH = realPath;
    resetEncoderCache();
  }
}

async function main() {
  const scratch = mkdtempSync(path.join(tmpdir(), "material-ingest-test-"));
  const sourceRoot = path.join(scratch, "sources");
  const publicRoot = path.join(scratch, "public");
  const manifestPath = path.join(scratch, "materials-ingest.manifest.json");

  console.log("Generating synthetic fixtures...");
  const { conformingDir, nonConformingDir, darkPatternedDir } = await generateFixtures(sourceRoot);

  console.log("\n1. Conforming asset ingests end to end (WebP fallback, encoder forced absent):");
  const okResult = await withNoEncoder(() => ingest(conformingDir, { write: true, publicRoot, manifestPath }));
  check("ingest reports ok", okResult.ok, JSON.stringify(okResult.violations));
  check("entry produced", !!okResult.entry);
  if (okResult.entry) {
    check("albedo output written as .webp", existsSync(path.join(publicRoot, "materials", "walls", "plaster-white-matte", "albedo.webp")));
    check("normal output written as .webp", existsSync(path.join(publicRoot, "materials", "walls", "plaster-white-matte", "normal.webp")));
    check("orm output written as .webp", existsSync(path.join(publicRoot, "materials", "walls", "plaster-white-matte", "orm.webp")));
  }

  console.log("\n2. Non-conforming asset (baked shadow) is rejected, citing §1.1:");
  const badResult = await withNoEncoder(() => ingest(nonConformingDir, { write: true, publicRoot, manifestPath }));
  check("ingest reports rejected", !badResult.ok);
  check(
    "violation cites §1.1",
    badResult.violations.some((v) => v.clause === "§1.1"),
    JSON.stringify(badResult.violations),
  );
  check(
    "rejected asset wrote nothing",
    !existsSync(path.join(publicRoot, "materials", "walls", "baked-shadow-plaster")),
  );

  console.log("\n2b. Legitimately dark/patterned asset (checker tile, not baked) is ACCEPTED — material-spec.md §1.1b:");
  const darkOkResult = await withNoEncoder(() => ingest(darkPatternedDir, { write: true, publicRoot, manifestPath }));
  check("ingest reports ok", darkOkResult.ok, JSON.stringify(darkOkResult.violations));
  check("entry produced", !!darkOkResult.entry);

  console.log("\n3 & 4. Encoder identity is recorded as null (not omitted), and conformance fails closed on it:");
  const entry = findEntry("plaster-white-matte", manifestPath);
  check("manifest entry exists", !!entry);
  check("encoder key is present", !!entry && "encoder" in entry);
  check("encoder value is exactly null", !!entry && entry.encoder === null, JSON.stringify(entry?.encoder));

  const conformance = checkConformance("plaster-white-matte", manifestPath);
  check("conformance reports not ok", !conformance.ok);
  check(
    "conformance reason names the null encoder",
    conformance.reason.includes("no recorded encoder identity"),
    conformance.reason,
  );

  resetEncoderCache();
  const hasRealEncoder = detectEncoder() !== null;
  if (!hasRealEncoder) {
    console.log("\n5 & 6. SKIPPED — no real `ktx` on this machine's PATH (M3d/D2's build, if present, lives outside this repo).");
  } else {
    console.log("\n5. Conforming asset ingests end to end (real KTX2, encoder present):");
    const ktx2Result = await ingest(conformingDir, { write: true, publicRoot, manifestPath });
    check("ingest reports ok", ktx2Result.ok, JSON.stringify(ktx2Result.violations));
    check("entry produced", !!ktx2Result.entry);
    check("encoder identity is non-null", !!ktx2Result.entry && ktx2Result.entry.encoder !== null);
    if (ktx2Result.entry) {
      check("albedo output written as .ktx2", existsSync(path.join(publicRoot, "materials", "walls", "plaster-white-matte", "albedo.ktx2")));
      check("normal output written as .ktx2", existsSync(path.join(publicRoot, "materials", "walls", "plaster-white-matte", "normal.ktx2")));
      check("orm output written as .ktx2", existsSync(path.join(publicRoot, "materials", "walls", "plaster-white-matte", "orm.ktx2")));
    }

    console.log("\n6. conformance.ts's render-comparison step is wired for real, and fails honestly for an asset outside the default manifest:");
    // render-check.mjs only knows the DEFAULT manifest (data/materials-ingest.manifest.json)
    // and a live dev server — neither applies to this scratch fixture, so it
    // fails at its own manifest lookup before ever touching a browser or the
    // network. That keeps this assertion fast and offline, and it's still a
    // meaningful proof: the render-comparison step is really being invoked,
    // not stubbed out, and a real invocation failure is reported honestly
    // rather than silently treated as a pass.
    const conformanceKtx2 = checkConformance("plaster-white-matte", manifestPath);
    check("conformance reports not ok (asset not in the default manifest)", !conformanceKtx2.ok);
    check(
      "reason names the render-comparison step, not a fabricated pass",
      conformanceKtx2.reason.includes("render-comparison FAILED"),
      conformanceKtx2.reason,
    );
  }

  rmSync(scratch, { recursive: true, force: true });

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
