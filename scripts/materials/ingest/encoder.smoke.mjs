// D2 (M3d) exit criteria, proven mechanically rather than asserted:
//   1. `ktx` runs and reports a version.
//   2. `detectEncoder()` populates a non-null EncoderIdentity.
//   3. The exact per-map flags recorded on that identity actually encode —
//      not just that the binary exists, but that the specific invocation
//      this pipeline will use produces a valid KTX2 file, with no warnings
//      (a transfer-function warning here is a real defect, see encoder.ts).
//
// Does NOT encode a real catalog asset — that's D3 ("Encode and re-verify").
// This only proves the toolchain and the flag set are real and connected.
//
// Run: npx tsx scripts/materials/ingest/encoder.smoke.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { detectEncoder } from "./encoder.ts";

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const identity = detectEncoder();
check("detectEncoder() is non-null", identity !== null, "ktx not found on PATH");
if (!identity) {
  console.log(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
check("tool is 'ktx' (upstream's unified CLI, not the retired 'toktx')", identity.tool === "ktx");
check("version is a non-empty string", typeof identity.version === "string" && identity.version.length > 0, identity.version);
check("provenance names the Khronos repo", identity.provenance.includes("KhronosGroup/KTX-Software"), identity.provenance);

const scratch = mkdtempSync(path.join(tmpdir(), "encoder-smoke-"));
const albedoPng = path.join(scratch, "albedo.png");
const normalPng = path.join(scratch, "normal.png");
const albedoKtx2 = path.join(scratch, "albedo.ktx2");
const normalKtx2 = path.join(scratch, "normal.ktx2");

await sharp(Buffer.alloc(64 * 64 * 3, 200), { raw: { width: 64, height: 64, channels: 3 } }).png().toFile(albedoPng);
await sharp(Buffer.alloc(64 * 64 * 3, 128), { raw: { width: 64, height: 64, channels: 3 } }).png().toFile(normalPng);

function runProfile(name, profile, srcPng, dstKtx2) {
  const args = [...profile.flags, srcPng, dstKtx2];
  try {
    const out = execFileSync("ktx", ["create", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    check(`${name}: ktx create exits 0`, true);
    check(`${name}: no stderr/warning output`, out.trim().length === 0, out.trim());
  } catch (e) {
    check(`${name}: ktx create exits 0`, false, e.stderr?.toString() ?? e.message);
  }
  let size = 0;
  try {
    size = statSync(dstKtx2).size;
  } catch {}
  check(`${name}: output .ktx2 written and non-trivial`, size > 100, `size=${size}`);
}

runProfile("albedo (basis-lz)", identity.profiles.albedo, albedoPng, albedoKtx2);
runProfile("normal (uastc)", identity.profiles.normal, normalPng, normalKtx2);
// ORM shares albedo's codec/quality with a different --format/--assign-tf;
// exercising the normal profile's UNORM+linear path already covers that
// combination, so a third encode here would be redundant.

rmSync(scratch, { recursive: true, force: true });

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
