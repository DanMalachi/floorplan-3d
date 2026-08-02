// M3b exit-criteria proof, run against synthetic fixtures (fixtures.ts) so
// nothing here depends on network access or a real asset's licence.
//
//   1. Pipeline runs end to end on a sample asset -> validated, unencoded output.
//   2. Validator rejects a deliberately non-conforming asset, citing the clause.
//   3. Conformance test fails on the null encoder record.
//   4. Encoder identity field exists, populated with null, not omitted.
//
// Run: npx tsx scripts/materials/ingest/ingest.test.ts
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { generateFixtures } from "./fixtures";
import { ingest } from "./run";
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

async function main() {
  const scratch = mkdtempSync(path.join(tmpdir(), "material-ingest-test-"));
  const sourceRoot = path.join(scratch, "sources");
  const publicRoot = path.join(scratch, "public");
  const manifestPath = path.join(scratch, "materials-ingest.manifest.json");

  console.log("Generating synthetic fixtures...");
  const { conformingDir, nonConformingDir } = await generateFixtures(sourceRoot);

  console.log("\n1. Conforming asset ingests end to end:");
  const okResult = await ingest(conformingDir, { write: true, publicRoot, manifestPath });
  check("ingest reports ok", okResult.ok, JSON.stringify(okResult.violations));
  check("entry produced", !!okResult.entry);
  if (okResult.entry) {
    check("albedo output written", existsSync(path.join(publicRoot, "materials", "walls", "plaster-white-matte", "albedo.webp")));
    check("normal output written", existsSync(path.join(publicRoot, "materials", "walls", "plaster-white-matte", "normal.webp")));
    check("orm output written", existsSync(path.join(publicRoot, "materials", "walls", "plaster-white-matte", "orm.webp")));
  }

  console.log("\n2. Non-conforming asset (baked shadow) is rejected, citing §1.1:");
  const badResult = await ingest(nonConformingDir, { write: true, publicRoot, manifestPath });
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

  rmSync(scratch, { recursive: true, force: true });

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
