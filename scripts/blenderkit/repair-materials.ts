/**
 * BlenderKit furniture pipeline, step 5b — unbind textures that cannot be what
 * the material claims they are.
 *
 * THE DEFECT. Four sofas in the kept set ("Cotton Mini Sofa" ×2, "Leather
 * Sofa" ×2) ship exactly two 4096² images, and both are BINARY MASKS — every
 * pixel pure black or pure white. The second is the first packed into the green
 * channel with R and B forced to 255. Their glTF then binds that one mask into
 * every texture slot the material has:
 *
 *   baseColorTexture        → mask   (albedo flips 0 ↔ 1 across UV islands)
 *   normalTexture           → mask   (tangent normals of ±1,±1,±1 — garbage)
 *   metallicRoughnessTexture→ mask   (roughness flips 0 ↔ 1)
 *   sheenColorTexture       → mask   (the ONE slot this image was authored for)
 *
 * A hard binary normal map minified over a sofa is the speckle: the shading
 * normal is wrong per-texel and mip-aliases into noise. That is the "cotton
 * mini sofa is pixelated" report, and it reaches production twice — the
 * furniture catalog and the landing page hero (src/landing/demoScene.ts).
 *
 * Blender's glTF exporter deduplicates images by NAME. All of Sofa 01's baked
 * maps were named "Sofa 01_Sheen", so every one of them collapsed onto the
 * sheen mask and the real albedo/normal/roughness never left Blender. There is
 * nothing to recover from the file; the only honest repair is to stop
 * pretending a mask is a texture.
 *
 * WHAT THIS DOES. Per material, per slot:
 *  • albedo / normal / metallic-roughness / clearcoat-normal bound to a binary
 *    mask → UNBIND, and fall back to the material's factors.
 *  • a normal map that resolves to the SAME image as the albedo → unbind, even
 *    if that image is a real texture. One image cannot be both an sRGB colour
 *    and a tangent-space normal; the normal is the destructive half. (This is
 *    the only defect the "Modern Fabric Pouf" has — its albedo is real.)
 *  • MASK SLOTS ARE LEFT ALONE. sheenColorTexture, clearcoatTexture and
 *    occlusionTexture take a 0/1 mask legitimately — white = fabric, black =
 *    frame is exactly how you author "cushions have sheen, wood does not", and
 *    it is the only material distinction these files still carry.
 *
 * COLOUR. Once the albedo mask is unbound the material has only its
 * baseColorFactor, and these files declare none — the glTF default is pure
 * white. Nothing in the GLB, the catalog, or the thumbnails-on-disk records the
 * cream-and-light-wood the BlenderKit preview shows, so this script does not
 * invent it: it writes a plausible neutral (NEUTRAL_ALBEDO) and reports every
 * asset it did that to. Getting the authored colour back means re-sourcing the
 * asset with real maps, which is a catalog decision, not a repair.
 *
 * The maps are NOT gone upstream — only from this export. BlenderKit's own
 * index reports `textureCount: 4` for all four sofas, and the `.blend` really
 * does carry four packed JPEGs: a cream-linen-and-oak albedo, a tangent-space
 * normal, a roughness map, and the sheen mask. Only the mask survived into the
 * glTF. See `resource-sofas.ts` for the recovery path; this script is the
 * stopgap that keeps them renderable until that runs.
 *
 * A NOTE ON A WRONG TURN, so nobody repeats it. Re-colouring the mask in place
 * (cream where white, oak where black) looks like it should work and its
 * layout does match the real albedo 99.9%. It still renders as speckle on
 * `d19dd7b1` — but that is a UV bug, not a mask bug: BlenderKit's `gltf`
 * export of that asset carries 288 vertices with texcoords around ±6.7e9, and
 * Draco sizes its quantization grid to the data's full range, so those
 * outliers flatten the precision of the other 99% and every texture sampled
 * through them turns to noise. The uncompressed `gltf_godot` export of the
 * same asset textures perfectly. Measured 2026-09-02 across all 75 optimized
 * models: `d19dd7b1` is the only one destroyed this way.
 *
 * Textures left orphaned by an unbind keep their bytes here — this pass only
 * rewrites the JSON chunk, so it is safe to run on an already-Draco'd file
 * without a decoder. `optimize.ts`'s prune drops them on the next full rebuild
 * from raw.
 *
 * Idempotent: a repaired file has no mask-bound slots left, so a second run
 * reports zero changes.
 *
 * NOT SAFE ON `opt-ktx2/`, and it is deliberately not in the default dirs.
 * sharp cannot decode KTX2, so `isBinaryMask` silently returns false there and
 * only the albedo/normal ALIAS rule survives — a run against that set unbinds
 * the normal maps and leaves the mask albedo and roughness in place, which
 * looks repaired and is not. Rebuild that set from a repaired `opt/` instead
 * (scripts/blenderkit/optimize-ktx2.ts), which carries the fix forward
 * correctly and prunes the orphaned images while it is at it.
 *
 * Run (defaults to the raw set and the served `opt/` set):
 *   npx tsx scripts/blenderkit/repair-materials.ts
 *   npx tsx scripts/blenderkit/repair-materials.ts --check     # report only
 *   npx tsx scripts/blenderkit/repair-materials.ts <dir> [...] # explicit dirs
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const DEFAULT_DIRS = [
  path.resolve("public/furniture/blenderkit"),
  path.resolve("public/furniture/blenderkit/opt"),
];

/**
 * Replacement albedo when a mask is unbound and the file declares no factor.
 *
 * Not a guess at the asset's colour — a physically plausible stand-in. The
 * glTF default of pure white is a 100%-reflective surface, which no real
 * material is and which clips under sun even through Khronos Neutral
 * (docs/render-contract.md §"Tone mapping"). 0.85 is the top of the range real
 * white upholstery occupies.
 */
const NEUTRAL_ALBEDO = [0.85, 0.85, 0.85, 1] as const;

/** Roughness for a fabric/upholstery surface whose roughness map was a mask. */
const FALLBACK_ROUGHNESS = 0.9;

// ---------------------------------------------------------------------------
// GLB container: read and write the JSON chunk, leave BIN byte-identical.
// ---------------------------------------------------------------------------

interface Glb {
  json: Record<string, any>;
  /** Every chunk after the JSON one, verbatim (header + padded payload). */
  rest: Buffer;
}

function readGlb(file: string): Glb | null {
  const buf = readFileSync(file);
  if (buf.length < 20 || buf.toString("ascii", 0, 4) !== "glTF") return null;
  const jsonLen = buf.readUInt32LE(12);
  if (buf.toString("ascii", 16, 20) !== "JSON") return null;
  const json = JSON.parse(buf.toString("utf8", 20, 20 + jsonLen));
  return { json, rest: buf.subarray(20 + jsonLen) };
}

function writeGlb(file: string, glb: Glb) {
  let json = Buffer.from(JSON.stringify(glb.json), "utf8");
  // The JSON chunk is padded with SPACES to a 4-byte boundary (glTF 2.0 §4.4.3);
  // the BIN chunk that follows must stay 4-byte aligned or every accessor
  // byteOffset in the file shifts.
  const pad = (4 - (json.length % 4)) % 4;
  if (pad) json = Buffer.concat([json, Buffer.alloc(pad, 0x20)]);

  const header = Buffer.alloc(20);
  header.write("glTF", 0, "ascii");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + json.length + glb.rest.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.write("JSON", 16, "ascii");
  writeFileSync(file, Buffer.concat([header, json, glb.rest]));
}

// ---------------------------------------------------------------------------
// Is this image a binary mask rather than a texture?
// ---------------------------------------------------------------------------

/**
 * True when the image is a two-valued UV mask rather than a texture.
 *
 * The test is BIMODALITY, not extremeness. "Almost every pixel is at 0 or 255"
 * alone also matches a plain white ceramic albedo and a plain black metal one —
 * unimodal textures that are perfectly valid in the slot they sit in, and which
 * an earlier draft of this script happily unbound. A mask is specifically an
 * image carrying BOTH populations, splitting the UV space in two, with nothing
 * in between.
 *
 * Judged per channel, not per pixel, because the packed roughness mask is
 * magenta/white: R and B are constant 255 while G carries the split, so a
 * whole-pixel "is it black or white" test misses it. So: every channel must be
 * two-valued (a constant channel qualifies — it carries nothing either way) and
 * at least one must actually be split.
 *
 * A real albedo, normal or roughness map has a continuous distribution and
 * fails on the first channel. Sampled at 128² — box-filtering a real texture
 * down only makes it MORE mid-toned, so the downsample can cost a detection but
 * cannot invent one.
 */
async function isBinaryMask(data: Buffer): Promise<boolean> {
  const { data: px, info } = await sharp(data)
    .resize(128, 128, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  let anySplit = false;
  for (let c = 0; c < info.channels; c++) {
    let low = 0;
    let high = 0;
    for (let i = c; i < px.length; i += info.channels) {
      if (px[i] < 16) low++;
      else if (px[i] > 240) high++;
    }
    if ((low + high) / n < 0.95) return false; // continuous tone — a real texture
    if (Math.min(low, high) / n >= 0.05) anySplit = true;
  }
  return anySplit;
}

// ---------------------------------------------------------------------------
// Repair
// ---------------------------------------------------------------------------

/** Image index behind a texture index, across the webp/basisu indirections. */
function imageOf(json: any, textureIndex: number | undefined): number | null {
  if (textureIndex == null) return null;
  const t = json.textures?.[textureIndex];
  if (!t) return null;
  return (
    t.source ??
    t.extensions?.EXT_texture_webp?.source ??
    t.extensions?.KHR_texture_basisu?.source ??
    null
  );
}

/** Raw bytes of an image, or null if it lives in an external file. */
function imageBytes(json: any, bin: Buffer, imageIndex: number): Buffer | null {
  const img = json.images?.[imageIndex];
  if (!img || img.bufferView == null) return null;
  const bv = json.bufferViews?.[img.bufferView];
  if (!bv) return null;
  // `rest` starts at the BIN chunk header: 4-byte length + 4-byte type.
  const start = 8 + (bv.byteOffset ?? 0);
  return bin.subarray(start, start + bv.byteLength);
}

interface Change {
  material: string;
  slot: string;
  why: string;
}

async function repairFile(file: string): Promise<Change[]> {
  const glb = readGlb(file);
  if (!glb) return [];
  const { json } = glb;
  if (!json.materials?.length) return [];

  // Classify each image once — decoding a 4K JPEG per slot would be four times
  // the work for the same answer.
  const maskCache = new Map<number, boolean>();
  const isMask = async (imageIndex: number | null): Promise<boolean> => {
    if (imageIndex == null) return false;
    const hit = maskCache.get(imageIndex);
    if (hit !== undefined) return hit;
    const bytes = imageBytes(json, glb.rest, imageIndex);
    let verdict = false;
    try {
      verdict = bytes ? await isBinaryMask(bytes) : false;
    } catch {
      verdict = false; // undecodable — leave the binding alone rather than guess
    }
    maskCache.set(imageIndex, verdict);
    return verdict;
  };

  const changes: Change[] = [];

  for (const m of json.materials as any[]) {
    const name = m.name ?? "(unnamed)";
    const pbr = (m.pbrMetallicRoughness ??= {});
    const clearcoat = m.extensions?.KHR_materials_clearcoat;

    const baseImg = imageOf(json, pbr.baseColorTexture?.index);

    // --- albedo -----------------------------------------------------------
    if (baseImg != null && (await isMask(baseImg))) {
      delete pbr.baseColorTexture;
      if (!pbr.baseColorFactor) pbr.baseColorFactor = [...NEUTRAL_ALBEDO];
      changes.push({
        material: name,
        slot: "baseColorTexture",
        why: `binary mask → factor ${JSON.stringify(pbr.baseColorFactor)}`,
      });
    }

    // --- normal -----------------------------------------------------------
    const normImg = imageOf(json, m.normalTexture?.index);
    if (normImg != null) {
      const aliasesAlbedo = baseImg != null && normImg === baseImg;
      if (aliasesAlbedo || (await isMask(normImg))) {
        delete m.normalTexture;
        changes.push({
          material: name,
          slot: "normalTexture",
          why: aliasesAlbedo ? "same image as baseColorTexture" : "binary mask",
        });
      }
    }

    // --- metallic-roughness ----------------------------------------------
    const mrImg = imageOf(json, pbr.metallicRoughnessTexture?.index);
    if (mrImg != null && (await isMask(mrImg))) {
      delete pbr.metallicRoughnessTexture;
      if (pbr.roughnessFactor === undefined) pbr.roughnessFactor = FALLBACK_ROUGHNESS;
      changes.push({
        material: name,
        slot: "metallicRoughnessTexture",
        why: `binary mask → roughness ${pbr.roughnessFactor}`,
      });
    }

    // --- clearcoat normal -------------------------------------------------
    // The clearcoat STRENGTH mask stays: "varnish on the frame, none on the
    // cushions" is a legitimate 0/1 mask. Its normal map is not.
    if (clearcoat) {
      const ccNormImg = imageOf(json, clearcoat.clearcoatNormalTexture?.index);
      if (ccNormImg != null && (await isMask(ccNormImg))) {
        delete clearcoat.clearcoatNormalTexture;
        changes.push({ material: name, slot: "clearcoatNormalTexture", why: "binary mask" });
      }
    }

    if (Object.keys(pbr).length === 0) delete m.pbrMetallicRoughness;
  }

  if (changes.length && !process.argv.includes("--check")) writeGlb(file, glb);
  return changes;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const dirs = args.length ? args.map((d) => path.resolve(d)) : DEFAULT_DIRS;
  const check = process.argv.includes("--check");

  let repaired = 0;
  let scanned = 0;
  const neutralised = new Set<string>();

  for (const dir of dirs) {
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".glb"));
    } catch {
      console.log(`skip ${dir} (not a directory)`);
      continue;
    }
    console.log(`\n${path.relative(process.cwd(), dir) || dir} — ${files.length} GLB`);
    for (const f of files) {
      scanned++;
      const changes = await repairFile(path.join(dir, f));
      if (!changes.length) continue;
      repaired++;
      console.log(`  ${check ? "would repair" : "repaired"} ${f}`);
      for (const c of changes) {
        console.log(`     ${c.material} · ${c.slot} — ${c.why}`);
        if (c.slot === "baseColorTexture") neutralised.add(f);
      }
    }
  }

  console.log(
    `\n${check ? "Check" : "Done"}. scanned=${scanned} ${check ? "affected" : "repaired"}=${repaired}`,
  );
  if (neutralised.size) {
    console.log(
      `\n${neutralised.size} file(s) lost their only albedo and now render at the neutral\n` +
        `${JSON.stringify(NEUTRAL_ALBEDO)} — the GLB carries no colour of its own. Restoring the\n` +
        `authored look means re-sourcing those assets, not repairing them.`,
    );
  }
}

main();
