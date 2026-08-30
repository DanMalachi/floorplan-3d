/**
 * BlenderKit furniture pipeline, step 5b — KTX2/UASTC texture re-encode.
 *
 * `docs/PERFORMANCE-HANDOFF.md` Phase 3 respec: a 40-item furnished scene
 * costs 1328 MB (mix) / 1692 MB (IKEA) of GPU texture, and KTX2's flat ~4x
 * GPU-resident reduction is one of the two multipliers needed to clear the
 * <250 MB bar (the resolution cap is the other, and out of scope here).
 *
 * Runs AFTER optimize.ts, not instead of it: source is
 * `public/furniture/blenderkit/opt/*.glb` (WebP, Draco, already
 * dedup/join/weld/simplify/pruned to 1024px — see optimize.ts). Geometry
 * decisions (which items get `noJoin`, the 1024px cap, content rejections)
 * are optimize.ts's job and are NOT re-derived here — this script trusts
 * opt/'s already-AABB-checked geometry and only swaps how textures are
 * stored. Output is a sibling directory, `opt-ktx2/`, so the WebP catalog
 * stays on disk untouched (nothing currently points at opt-ktx2/ until
 * build-catalog.ts is re-pointed at it).
 *
 * BLENDERKIT ONLY, per Dan's ruling: these 75 models are CC0, so re-encoding
 * and re-hosting is unambiguously fine. IKEA's models are NOT CC0 and
 * re-encoding a hosted asset is an unresolved redistribution question this
 * script does not decide — it is never called with an IKEA source directory,
 * and nothing about its logic is BlenderKit-specific (it operates on any
 * already-optimized GLB), so running it on IKEA later is a path change, not
 * new code, once that's ruled on.
 *
 * ── Why this hand-rolls the `ktx create` call instead of using
 *    gltf-transform's own `uastc`/`etc1s`/`optimize --texture-compress ktx2`
 *    commands ──────────────────────────────────────────────────────────────
 * Tried first, and it reproduces a real failure against this machine's `ktx`
 * binary (KTX-Software v5.0.0-rc1, built from source for material-spec.md
 * §5.1 — `scripts/materials/ingest/encoder.ts`'s docstring covers why).
 * gltf-transform 4.4.2's bundled `toktx.ts` transform always invokes
 * `ktx create ... --assign-oetf srgb|linear --assign-primaries ...`. That
 * flag does not exist on this `ktx` build — only `--assign-tf`, which is
 * what encoder.ts already found and verified. Run against a real BlenderKit
 * asset, gltf-transform's `uastc` command printed
 * `ktx create fatal: Option 'assign-oetf' does not exist` for 3 of 6
 * textures on one test model and SWALLOWED it — `logger.error(...)`, then
 * kept going, reporting the transform as a success while those 3 texture
 * slots were silently left un-transcoded. That is exactly the
 * silently-wrong-numbers failure shape `docs/PERFORMANCE-HANDOFF.md`
 * already got burned by once (65/75 blenderkit GLBs failing to load while
 * the harness reported cheerful numbers). So this script does not use
 * gltf-transform's texture-compress commands. It uses `@gltf-transform/core`
 * (`Document`/`NodeIO`) to read/write the GLB and
 * `@gltf-transform/functions`'s `getTextureColorSpace`/`getTextureChannelMask`
 * to classify each texture — that classification logic is not what's broken —
 * then calls `ktx create` itself with the verified `--assign-tf` flag,
 * confirmed empirically (`ktx info` on the output shows
 * `Transfer: KHR_DF_TRANSFER_SRGB` for baseColor and
 * `Transfer: KHR_DF_TRANSFER_LINEAR` for normal/metallicRoughness — not
 * assumed from the flag name alone).
 *
 * gltf-transform's `png`/`draco` CLI commands (via `npx`, same pattern as
 * optimize.ts) are still used either side of the packing step: neither one
 * calls `ktx create` at all, so neither is exposed to the bug above.
 *
 * ── Why UASTC for every slot, not the ETC1S/UASTC split
 *    material-spec.md §5.1 uses for floor materials ─────────────────────────
 * The KTX2 pilot (scripts/perf/ktx2-pilot/) measured BC7/ASTC-4x4 GPU-
 * resident size as a FLAT ~4.0x reduction regardless of source codec — both
 * are fixed-rate ~1-byte/texel formats on the GPU, so transcoding a
 * lower-quality ETC1S source up to BC7 costs the SAME VRAM as transcoding
 * UASTC, with no detail recovered by choosing the cheaper source codec.
 * ETC1S measurably damaged the pilot's fabric-weave sample (96/255 max
 * per-pixel error) where UASTC stayed within 11/255 on every sample,
 * including wood grain and a smooth gradient. Since this workstream's whole
 * point is GPU-resident memory — not wire size, and KTX2 is already bigger
 * on disk than WebP either way, see §5.1's own note — there is no size
 * reason to accept ETC1S's quality loss on ANY slot here, unlike the floor
 * pipeline, which was also optimizing transfer bytes over the network.
 * UASTC everywhere: albedo, normal, metallicRoughness, occlusion, emissive.
 *
 * ── Colour space: not hand-tagged, verified not guessed ─────────────────────
 * Albedo/emissive are sRGB; normal/metallicRoughness/occlusion are linear
 * control data — encoding them sRGB would apply a gamma curve to numbers
 * that are not colour, corrupting lighting exactly the way render-
 * contract.md §1.2 forbids by name. `getTextureColorSpace` (not this file)
 * decides which is which, by walking the glTF material graph to see which
 * slot(s) reference each texture — the same texture used only as
 * baseColorTexture anywhere is sRGB; anything else (normalTexture,
 * metallicRoughnessTexture, occlusionTexture with no baseColor use) is
 * linear. `--assign-tf` is passed explicitly either way, never left to
 * `ktx create`'s own guess (material-spec.md §5.1 and encoder.ts found that
 * guess defaults to sRGB for any 8-bit PNG regardless of `--format`).
 *
 * Run:
 *   npx tsx scripts/blenderkit/optimize-ktx2.ts
 * Then:
 *   npx tsx scripts/blenderkit/verify-optimized.ts --dir opt-ktx2
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import { Document, NodeIO, TextureChannel } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRTextureBasisu } from "@gltf-transform/extensions";
import { getTextureChannelMask, getTextureColorSpace, listTextureSlots } from "@gltf-transform/functions";
import { loadIndex, select } from "./select";
import { isContentRejected } from "./content-filter";
import { geomSize } from "../ikea/glb-geom";

const OPT_DIR = path.resolve("public/furniture/blenderkit/opt");
const OUT_DIR = path.resolve("public/furniture/blenderkit/opt-ktx2");

/** Percent AABB drift tolerated between opt/ and opt-ktx2/ — same bar
 *  verify-optimized.ts already applies between raw/ and opt/. This step
 *  touches textures only, but the Draco round-trip (decode here, re-encode
 *  at the end) re-quantizes geometry a second time, so it's checked again
 *  rather than assumed harmless. */
const MAX_DRIFT_PCT = 2.0;

/** UASTC RDO lambda. material-spec.md §5.1's own normal-map profile uses
 *  0.5, inside the documented "good range for normal maps" of [.25,.75];
 *  everything else uses gltf-transform's own UASTC_DEFAULTS lambda (1.0),
 *  the general-purpose default inside the tool's documented [.25,10] range.
 *  Neither is re-tuned against a render comparison here — same caveat
 *  encoder.ts already carries for its own profiles. */
const RDO_LAMBDA_NORMAL = "0.5";
const RDO_LAMBDA_DEFAULT = "1.0";

function runNpxGltfTransform(args: string[]): void {
  execFileSync("npx", ["--yes", "@gltf-transform/cli@latest", ...args], {
    stdio: "pipe",
    shell: true,
    timeout: 180_000,
  });
}

/** Run `ktx create` for one already-extracted PNG/JPEG image. Throws (does
 *  not swallow) on a non-zero exit — the whole point of not using
 *  gltf-transform's own texture-compress commands is to not repeat their
 *  swallow-and-keep-going bug. */
function ktxCreate(srcPath: string, dstPath: string, opts: { srgb: boolean; alpha: boolean; normal: boolean }): void {
  const format = opts.srgb
    ? opts.alpha ? "R8G8B8A8_SRGB" : "R8G8B8_SRGB"
    : opts.alpha ? "R8G8B8A8_UNORM" : "R8G8B8_UNORM";
  const args = [
    "create",
    "--format", format,
    "--assign-tf", opts.srgb ? "srgb" : "linear",
    "--encode", "uastc",
    "--uastc-quality", "2",
    "--uastc-rdo",
    "--uastc-rdo-l", opts.normal ? RDO_LAMBDA_NORMAL : RDO_LAMBDA_DEFAULT,
    "--zstd", "19",
    "--generate-mipmap",
    srcPath,
    dstPath,
  ];
  execFileSync("ktx", args, { stdio: "pipe" });
}

/**
 * Re-encode every texture in one already-decoded (PNG/JPEG, no Draco) GLB to
 * KTX2/UASTC, in place in a fresh Document, and return the packed bytes.
 *
 * A texture with neither PNG nor JPEG source (already KTX2, or some other
 * format this pipeline didn't produce) is left untouched, and its label is
 * added to the returned `skipped` list — the caller treats ANY skip as a
 * hard failure for that asset (see `processOne`) rather than shipping a GLB
 * where some texture slots quietly never got re-encoded.
 */
async function packKtx2(srcGlbPath: string): Promise<{ bytes: Uint8Array; skipped: string[] }> {
  // ALL_EXTENSIONS, not just KHRTextureBasisu: the decoded intermediate can
  // carry any extension the original BlenderKit export used (KHR_materials_*,
  // KHR_texture_transform, ...) and NodeIO refuses to read an unregistered
  // required extension rather than silently dropping it — found by running
  // this against a real asset, not assumed up front.
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc: Document = await io.read(srcGlbPath);
  doc.createExtension(KHRTextureBasisu).setRequired(true);

  const textures = doc.getRoot().listTextures();
  const skipped: string[] = [];
  const work = mkdtempSync(join(tmpdir(), "bk-ktx2-"));

  try {
    for (let i = 0; i < textures.length; i++) {
      const tex = textures[i];
      const mime = tex.getMimeType();
      const label = tex.getName() || tex.getURI() || `texture#${i}`;

      if (mime !== "image/png" && mime !== "image/jpeg") {
        skipped.push(`${label} (${mime})`);
        continue;
      }

      const image = tex.getImage();
      if (!image) {
        skipped.push(`${label} (no image data)`);
        continue;
      }

      const colorSpace = getTextureColorSpace(tex);
      const srgb = colorSpace === "srgb" || colorSpace === "srgb-linear";
      const channels = getTextureChannelMask(tex);
      const alpha = (channels & TextureChannel.A) !== 0;
      const normal = listTextureSlots(tex).some((s) => /normal/i.test(s));

      const ext = mime === "image/png" ? "png" : "jpg";
      const srcPath = join(work, `t${i}.${ext}`);
      const dstPath = join(work, `t${i}.ktx2`);
      writeFileSync(srcPath, Buffer.from(image));

      ktxCreate(srcPath, dstPath, { srgb, alpha, normal });

      const ktx2Bytes = readFileSync(dstPath);
      tex.setImage(new Uint8Array(ktx2Bytes)).setMimeType("image/ktx2");
      if (tex.getURI()) tex.setURI(tex.getURI().replace(/\.(png|jpe?g)$/i, ".ktx2"));
    }

    const bytes = await io.writeBinary(doc);
    return { bytes, skipped };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function processOne(id: string): Promise<{ ok: true; rawBytes: number; outBytes: number } | { ok: false; reason: string }> {
  const src = join(OPT_DIR, `${id}.glb`);
  const dst = join(OUT_DIR, `${id}.glb`);
  if (!existsSync(src)) return { ok: false, reason: "no opt/ source" };

  const work = mkdtempSync(join(tmpdir(), "bk-ktx2-glb-"));
  try {
    // Step 1: decode Draco (implicit on any gltf-transform read) and convert
    // WebP → PNG in one pass — `ktx create` reads PNG/JPEG only, verified by
    // running it directly against a WebP source (`Skipping, unsupported
    // texture type "image/webp"` from every texture).
    const decoded = join(work, "decoded.glb");
    runNpxGltfTransform(["png", src, decoded, "--formats", "webp"]);

    // Step 2: re-encode every texture to KTX2/UASTC with a verified
    // --assign-tf, pack via KHR_texture_basisu.
    const { bytes: packed, skipped } = await packKtx2(decoded);
    if (skipped.length > 0) return { ok: false, reason: `unconverted texture(s): ${skipped.join(", ")}` };
    const packedPath = join(work, "packed.glb");
    writeFileSync(packedPath, packed);

    // Step 3: Draco-recompress geometry — decoded in step 1, never
    // re-applied since. material-spec.md §5.2: Draco always.
    mkdirSync(OUT_DIR, { recursive: true });
    runNpxGltfTransform(["draco", packedPath, dst]);

    if (!existsSync(dst)) return { ok: false, reason: "no output written" };

    // AABB drift check against opt/ — see MAX_DRIFT_PCT.
    const a = geomSize(src);
    const b = geomSize(dst);
    if (a && b) {
      const drift = a.map((v, i) => (v > 0 ? (Math.abs(v - b[i]) / v) * 100 : 0));
      const worst = Math.max(...drift);
      if (worst > MAX_DRIFT_PCT) {
        return { ok: false, reason: `AABB drift ${worst.toFixed(1)}% (${a.map((n) => n.toFixed(2)).join("x")} → ${b.map((n) => n.toFixed(2)).join("x")})` };
      }
    }

    return { ok: true, rawBytes: statSync(src).size, outBytes: statSync(dst).size };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const { kept } = select(loadIndex());
  const selected = kept.filter((e) => !isContentRejected(e.displayName || e.name));
  let targets = selected;

  // --limit N: process only the first N — smoke-testing this script against
  // one or two real assets before committing to a 75-item, ktx-subprocess-
  // per-texture batch is worth a flag, not just a one-off hack.
  const limitArg = process.argv.indexOf("--limit");
  if (limitArg >= 0) {
    const n = Number(process.argv[limitArg + 1]);
    if (Number.isFinite(n) && n > 0) targets = targets.slice(0, n);
  }

  console.log(
    `KTX2-encoding ${targets.length} models from opt/ (${kept.length - selected.length} content-rejected` +
      (targets.length !== selected.length ? `, ${selected.length - targets.length} held back by --limit` : "") +
      `)\n`,
  );

  let done = 0;
  let skippedCache = 0;
  let failed = 0;
  let rawBytes = 0;
  let outBytes = 0;
  const failures: string[] = [];

  for (const e of targets) {
    const id = e.assetBaseId;
    const dst = join(OUT_DIR, `${id}.glb`);
    if (existsSync(dst)) {
      skippedCache++;
      const src = join(OPT_DIR, `${id}.glb`);
      if (existsSync(src)) {
        rawBytes += statSync(src).size;
        outBytes += statSync(dst).size;
      }
      continue;
    }

    const result = await processOne(id);
    if (result.ok) {
      done++;
      rawBytes += result.rawBytes;
      outBytes += result.outBytes;
      process.stdout.write(
        `\r[ktx2] ${done} done · ${skippedCache} cached · ${failed} failed · ` +
          `${(rawBytes / 1048576).toFixed(1)}MB → ${(outBytes / 1048576).toFixed(1)}MB`,
      );
    } else {
      failed++;
      failures.push(`${e.displayName || e.name} (${id}) — ${result.reason}`);
    }
  }

  console.log(
    `\n\nDone. encoded=${done} cached=${skippedCache} failed=${failed}\n` +
      `${(rawBytes / 1048576).toFixed(1)} MB (opt/ WebP) → ${(outBytes / 1048576).toFixed(1)} MB (opt-ktx2/ UASTC) on disk ` +
      `— KTX2 is expected to be LARGER on disk than WebP (material-spec.md §5.1: "WebP is smaller on the wire"); ` +
      `the win this script exists for is GPU-resident bytes after transcode, not this number.`,
  );
  if (failures.length) {
    console.log(`\nFailed (${failures.length}) — investigate before trusting opt-ktx2/ for these ids:`);
    for (const f of failures) console.log(`   • ${f}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
