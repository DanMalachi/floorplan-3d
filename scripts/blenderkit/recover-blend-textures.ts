/**
 * BlenderKit furniture pipeline, step 3b — recover textures the glTF export
 * dropped, straight out of the .blend.
 *
 * THE DEFECT. Blender's glTF exporter deduplicates images by NAME. Four sofas
 * by one author named every baked map for a material the same thing
 * ("Sofa 01_Sheen"), so on export they all collapsed onto whichever one was
 * written first — the sheen mask — and the albedo, normal and roughness never
 * left Blender. The exported material then binds that one binary mask into
 * every slot, which is why these rendered as speckled noise
 * (`repair-materials.ts` is the stopgap that makes them at least clean).
 *
 * It is only the EXPORT that is broken. BlenderKit's own index reports
 * `textureCount: 4` for all four, and the .blend really does carry four packed
 * JPEGs. So this recovers them.
 *
 * NO BLENDER REQUIRED. Packed images sit inside a .blend as intact JPEG/PNG
 * byte streams, so they can be carved out directly. Modern .blend files are
 * MULTI-FRAME zstd — decompressing the first frame gets you ~1 KB of header and
 * nothing else, which reads like a corrupt file; every frame has to be
 * decompressed and concatenated first. That is the whole trick.
 *
 * WHICH MAP IS WHICH is decided by measurement, not by filename — the filenames
 * are exactly what is unreliable here (that is the bug). A tangent-space normal
 * map is unmistakable (3 channels, blue pinned near 255, red/green near 128); a
 * UV mask is unmistakable (one channel, effectively two-valued); of what is
 * left, the 3-channel one is albedo and the 1-channel one is roughness.
 *
 * A SECOND, SEPARATE DEFECT, on `d19dd7b1` only. Its `gltf` file carries 288
 * vertices whose texcoords are around ±6.7e9. Draco sizes its quantization grid
 * to the data's full range, so those outliers flatten the precision of the
 * other 99% of the mesh and ANY texture sampled through them turns to noise —
 * BlenderKit's own Draco pass already did this, so the damage is in the file we
 * download. The uncompressed `gltf_godot` export of the same asset is intact,
 * so that asset is rebuilt from that instead, and the outliers are clamped so
 * our own Draco pass in `optimize.ts` cannot repeat the trick. Audited across
 * all 75 optimized models: this is the only one affected.
 *
 * Writes into the raw dir, rebuilding each material from the PRISTINE download
 * every time — which means it also undoes whatever `repair-materials.ts` had
 * already stripped. That is the right way round (recovery should not inherit a
 * stopgap's edits), but it does make the order matter: recover FIRST, repair
 * SECOND. On these four that leaves exactly one thing for repair to clean up,
 * the two Leather Sofas' `clearcoatNormalTexture`, which is a binary mask and
 * has no counterpart in the .blend to recover. Then delete the recovered ids
 * from `opt/` (optimize skips anything already built), re-run `optimize.ts`,
 * and confirm with `verify-optimized.ts`.
 *
 * Run:
 *   npx tsx scripts/blenderkit/recover-blend-textures.ts
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as zlib from "node:zlib";
import path from "node:path";
import sharp from "sharp";
import { API, USER_AGENT, SCENE_UUID, politeDelay } from "./lib";

const RAW_DIR = path.resolve("public/furniture/blenderkit");
const CACHE = path.resolve("scripts/blenderkit/.scratch/blend");

/**
 * The assets to recover, and where each one's GEOMETRY comes from.
 *
 * `gltf` is the pipeline's normal source. `gltf_godot` is the escape hatch for
 * a mesh whose `gltf` texcoords are destroyed — see the header. Both are plain
 * glTF; the godot one is simply not Draco-compressed, which is also what lets
 * the UV clamp below reach its texcoords at all.
 */
const TARGETS: { id: string; name: string; geometry: "gltf" | "gltf_godot"; why?: string }[] = [
  {
    id: "d19dd7b1-6573-41c7-b12c-b3eccdb7047d",
    name: "Cotton Mini Sofa",
    geometry: "gltf_godot",
    why: "gltf texcoords span ±6.7e9 and are already Draco-flattened on arrival",
  },
  { id: "ecba830a-8df6-4375-b59c-a10a18f947f0", name: "Cotton Mini Sofa", geometry: "gltf" },
  { id: "6c59319d-a7b6-470b-a0f9-981083a415ae", name: "Leather Sofa", geometry: "gltf" },
  { id: "4faac4b8-cc88-4ff2-b7fd-a7edf46d3518", name: "Leather Sofa", geometry: "gltf" },
];

/** Texture resolution to pull. 1K matches `optimize.ts`'s own 1024 cap, so the
 *  4K variant would only be downscaled again — this saves ~50 MB of download. */
const BLEND_FILETYPE = "resolution_1K";

/** Texcoords beyond this are treated as junk. Legitimate tiling stays well
 *  inside it (the pouf, the widest real case in the set, reaches -6.98 — but
 *  that mesh is not touched here). Clamping matters because of Draco, not
 *  because of sampling: REPEAT wrapping handles large UVs fine on its own. */
const UV_SANE_LIMIT = 8;

// ---------------------------------------------------------------------------
// BlenderKit
// ---------------------------------------------------------------------------

interface AssetFiles {
  license: string;
  files: { fileType: string; id: number }[];
}

async function assetFiles(id: string): Promise<AssetFiles | null> {
  const res = await fetch(`${API}/search/?query=asset_base_id:${id}+asset_type:model`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { results?: { license: string; files?: AssetFiles["files"] }[] };
  const r = body.results?.[0];
  if (!r) return null;
  return { license: r.license, files: r.files ?? [] };
}

async function download(fileId: number, dest: string): Promise<Buffer | null> {
  if (existsSync(dest)) return readFileSync(dest);
  const res = await fetch(`${API}/downloads/${fileId}/?scene_uuid=${SCENE_UUID}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) return null;
  const { filePath } = (await res.json()) as { filePath?: string };
  if (!filePath) return null;
  const bin = await fetch(filePath, { headers: { "User-Agent": USER_AGENT } });
  if (!bin.ok) return null;
  const buf = Buffer.from(await bin.arrayBuffer());
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  return buf;
}

// ---------------------------------------------------------------------------
// .blend → packed images
// ---------------------------------------------------------------------------

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/** Node 22 ships zstd in `zlib`; the repo's `@types/node@20` predates it, so
 *  the binding is reached through a cast rather than by dragging the whole
 *  types package forward for one function. */
const zstdDecompressSync = (zlib as unknown as { zstdDecompressSync?: (b: Buffer) => Buffer })
  .zstdDecompressSync;

/** Decompress a .blend, handling Blender's multi-frame zstd container. */
function decompressBlend(buf: Buffer): Buffer {
  if (buf.subarray(0, 7).toString("ascii") === "BLENDER") return buf;
  if (!buf.subarray(0, 4).equals(ZSTD_MAGIC)) return buf;
  if (!zstdDecompressSync) throw new Error("This needs Node 22+ for zlib.zstdDecompressSync");
  const parts: Buffer[] = [];
  let off = 0;
  while (off < buf.length) {
    const i = buf.indexOf(ZSTD_MAGIC, off);
    if (i < 0) break;
    const next = buf.indexOf(ZSTD_MAGIC, i + 4);
    const end = next < 0 ? buf.length : next;
    try {
      parts.push(zstdDecompressSync(buf.subarray(i, end)));
    } catch {
      // A frame boundary guessed wrong — the magic appeared inside compressed
      // data. Skipping it costs one frame, not the file.
    }
    off = end;
  }
  return Buffer.concat(parts);
}

/** Carve every packed JPEG/PNG out of a decompressed .blend. */
function packedImages(d: Buffer): Buffer[] {
  const out: Buffer[] = [];
  for (let i = 0; i < d.length - 8; i++) {
    if (d[i] === 0xff && d[i + 1] === 0xd8 && d[i + 2] === 0xff) {
      for (let j = i + 2; j < d.length - 1; j++) {
        if (d[j] === 0xff && d[j + 1] === 0xd9) {
          out.push(d.subarray(i, j + 2));
          i = j + 1;
          break;
        }
      }
    } else if (d[i] === 0x89 && d[i + 1] === 0x50 && d[i + 2] === 0x4e && d[i + 3] === 0x47) {
      // IEND + its 4-byte CRC closes a PNG.
      const end = d.indexOf(Buffer.from("IEND"), i);
      if (end > 0) {
        out.push(d.subarray(i, end + 8));
        i = end + 7;
      }
    }
  }
  return out;
}

type Role = "albedo" | "normal" | "roughness" | "mask";

/**
 * Re-encode a carved image to PNG before it goes into a GLB.
 *
 * Carving by "SOI to the first EOI" gives libjpeg something it will happily
 * decode but does not give a byte-exact JPEG — an embedded EXIF thumbnail
 * carries its own EOI, so the stream can end early, and gltf-transform's
 * stricter parser rejects the result outright ("Invalid JPG, marker table
 * corrupted") in its dedup pass. Re-encoding launders that away for the cost of
 * a decode, and PNG specifically because `optimize.ts` re-encodes everything to
 * WebP downstream anyway — going through PNG here keeps the normal map from
 * being JPEG-compressed twice on the way.
 */
const toPng = (buf: Buffer) => sharp(buf).png({ compressionLevel: 9 }).toBuffer();

/** Classify one packed image by what its pixels actually are. See the header. */
async function roleOf(buf: Buffer): Promise<Role | null> {
  let meta;
  try {
    meta = await sharp(buf).metadata();
  } catch {
    return null;
  }
  if (!meta.width || meta.width < 64) return null; // icons, previews, brush stamps
  const { data, info } = await sharp(buf)
    .resize(128, 128, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const ch = info.channels;
  const mean = [0, 0, 0];
  let chroma = 0;
  for (let i = 0; i < data.length; i += ch) {
    for (let c = 0; c < ch; c++) mean[c] += data[i + c];
    if (ch >= 3) chroma += Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
  }
  for (let c = 0; c < ch; c++) mean[c] /= n;
  chroma /= n;

  // Two-valued in every channel, with at least one channel genuinely split.
  let allBinary = true;
  let anySplit = false;
  for (let c = 0; c < ch; c++) {
    let low = 0;
    let high = 0;
    for (let i = c; i < data.length; i += ch) {
      if (data[i] < 16) low++;
      else if (data[i] > 240) high++;
    }
    if ((low + high) / n < 0.95) allBinary = false;
    if (Math.min(low, high) / n >= 0.05) anySplit = true;
  }
  if (allBinary && anySplit) return "mask";

  // Tangent-space normal: blue pinned high, red and green centred.
  if (ch >= 3 && mean[2] > 200 && Math.abs(mean[0] - 128) < 40 && Math.abs(mean[1] - 128) < 40) return "normal";

  // Colourless ⇒ a scalar map, which in this set means roughness. Measured off
  // the pixels rather than read off `channels`: sharp expands a greyscale JPEG
  // to 3 identical channels on raw output, so a channel count says nothing
  // about whether an image carries colour, and trusting it filed every
  // roughness map as a second albedo.
  if (chroma < 4) return "roughness";

  return "albedo";
}

// ---------------------------------------------------------------------------
// GLB surgery
// ---------------------------------------------------------------------------

function readGlb(buf: Buffer) {
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString("utf8", 20, 20 + jsonLen));
  const binOff = 20 + jsonLen;
  const binLen = buf.readUInt32LE(binOff);
  return { json, bin: Buffer.from(buf.subarray(binOff + 8, binOff + 8 + binLen)) };
}

function writeGlb(file: string, json: any, bin: Buffer) {
  let js = Buffer.from(JSON.stringify(json), "utf8");
  const jPad = (4 - (js.length % 4)) % 4;
  if (jPad) js = Buffer.concat([js, Buffer.alloc(jPad, 0x20)]);
  const bPad = (4 - (bin.length % 4)) % 4;
  const binPadded = bPad ? Buffer.concat([bin, Buffer.alloc(bPad, 0)]) : bin;
  const head = Buffer.alloc(20);
  head.write("glTF", 0, "ascii");
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(20 + js.length + 8 + binPadded.length, 8);
  head.writeUInt32LE(js.length, 12);
  head.write("JSON", 16, "ascii");
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(binPadded.length, 0);
  bh.write("BIN\0", 4, "ascii");
  writeFileSync(file, Buffer.concat([head, js, bh, binPadded]));
}

/**
 * Clamp junk texcoords in an UNCOMPRESSED glTF, in place.
 *
 * Returns how many components it touched. Draco-compressed input is skipped —
 * the texcoords are not readable without a decoder, and the assets that need
 * this are exactly the ones sourced uncompressed.
 */
function clampUVs(json: any, bin: Buffer): number {
  let touched = 0;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.extensions?.KHR_draco_mesh_compression) continue;
      for (const [name, idx] of Object.entries(prim.attributes as Record<string, number>)) {
        if (!name.startsWith("TEXCOORD")) continue;
        const acc = json.accessors[idx];
        if (acc.componentType !== 5126) continue; // float only
        const bv = json.bufferViews[acc.bufferView];
        const start = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
        const stride = bv.byteStride ?? 8;
        for (let i = 0; i < acc.count; i++) {
          for (let c = 0; c < 2; c++) {
            const at = start + i * stride + c * 4;
            const v = bin.readFloatLE(at);
            if (!Number.isFinite(v) || Math.abs(v) > UV_SANE_LIMIT) {
              bin.writeFloatLE(0, at);
              touched++;
            }
          }
        }
      }
    }
  }
  return touched;
}

// ---------------------------------------------------------------------------

async function recover(target: (typeof TARGETS)[number]) {
  const { id, name, geometry } = target;
  console.log(`\n${name}  ${id}`);
  if (target.why) console.log(`   geometry from ${geometry} — ${target.why}`);

  const meta = await assetFiles(id);
  if (!meta) return console.log("   ! asset lookup failed");
  if (meta.license !== "cc_zero") return console.log(`   ! license is ${meta.license}, refusing`);

  const blendFile = meta.files.find((f) => f.fileType === BLEND_FILETYPE);
  const geoFile = meta.files.find((f) => f.fileType === geometry);
  if (!blendFile || !geoFile) return console.log("   ! missing blend or geometry file");

  await politeDelay();
  const blendBuf = await download(blendFile.id, path.join(CACHE, `${id}.${BLEND_FILETYPE}.blend`));
  if (!blendBuf) return console.log("   ! blend download failed");
  await politeDelay();
  const geoBuf = await download(geoFile.id, path.join(CACHE, `${id}.${geometry}.glb`));
  if (!geoBuf) return console.log("   ! geometry download failed");

  const images = packedImages(decompressBlend(blendBuf));
  const found = new Map<Role, Buffer>();
  for (const img of images) {
    const role = await roleOf(img);
    // First of each role wins: these materials have one map per slot, and a
    // later same-role image would be another material's (none here) or a
    // preview thumbnail (already excluded by the size floor).
    if (role && !found.has(role)) found.set(role, img);
  }
  console.log(
    `   .blend: ${images.length} packed image(s) → ${[...found.keys()].sort().join(", ") || "nothing usable"}`,
  );
  if (!found.has("albedo")) return console.log("   ! no albedo recovered, leaving the asset alone");

  const { json, bin } = readGlb(geoBuf);
  const cleaned = clampUVs(json, bin);
  if (cleaned) console.log(`   clamped ${cleaned} junk texcoord component(s) to 0`);

  // Append each image to the BIN chunk as its own bufferView. `total` is the
  // single source of truth for the write cursor and is advanced by the padding
  // BEFORE the offset is recorded — reading it through a closure that only
  // caught up afterwards is what silently shifted every texture after the
  // first onto the wrong bytes, which surfaces much later as gltf-transform
  // reading a PNG header of 1146224640x67108864.
  const chunks: Buffer[] = [bin];
  let total = bin.length;
  const push = (data: Buffer): number => {
    const pad = (4 - (total % 4)) % 4;
    if (pad) {
      chunks.push(Buffer.alloc(pad, 0));
      total += pad;
    }
    json.bufferViews.push({ buffer: 0, byteOffset: total, byteLength: data.length });
    chunks.push(data);
    total += data.length;
    return json.bufferViews.length - 1;
  };
  const addTexture = (data: Buffer, mime: string) => {
    json.images.push({ mimeType: mime, bufferView: push(data), name: "recovered" });
    json.textures.push({ sampler: 0, source: json.images.length - 1 });
    return json.textures.length - 1;
  };

  json.samplers ??= [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
  const mat = json.materials[0];
  const pbr = (mat.pbrMetallicRoughness ??= {});

  pbr.baseColorTexture = { index: addTexture(await toPng(found.get("albedo")!), "image/png") };
  delete pbr.baseColorFactor;

  if (found.has("normal")) mat.normalTexture = { index: addTexture(await toPng(found.get("normal")!), "image/png") };
  else delete mat.normalTexture;

  if (found.has("roughness")) {
    // glTF packs roughness in GREEN and metalness in BLUE. The .blend ships a
    // single-channel map, so it is repacked rather than bound as-is — bound
    // raw, its value would land in red and the material would read as fully
    // rough and fully metallic.
    const rough = await sharp(found.get("roughness")!).removeAlpha().toColourspace("b-w").toBuffer();
    const { data, info } = await sharp(rough).raw().toBuffer({ resolveWithObject: true });
    const rgb = Buffer.alloc(info.width * info.height * 3);
    for (let i = 0; i < info.width * info.height; i++) {
      rgb[i * 3] = 255;
      rgb[i * 3 + 1] = data[i * info.channels];
      rgb[i * 3 + 2] = 0;
    }
    const packed = await sharp(rgb, { raw: { width: info.width, height: info.height, channels: 3 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    pbr.metallicRoughnessTexture = { index: addTexture(packed, "image/png") };
    pbr.roughnessFactor = 1;
    pbr.metallicFactor = 0;
  } else {
    delete pbr.metallicRoughnessTexture;
    pbr.roughnessFactor = 0.9;
    pbr.metallicFactor = 0;
  }

  // The sheen mask keeps the slot it was authored for — it is the one binding
  // the broken export got right.
  const sheen = mat.extensions?.KHR_materials_sheen;
  if (sheen && found.has("mask")) sheen.sheenColorTexture = { index: addTexture(await toPng(found.get("mask")!), "image/png") };

  json.buffers[0].byteLength = total + ((4 - (total % 4)) % 4);
  const dest = path.join(RAW_DIR, `${id}.glb`);
  writeGlb(dest, json, Buffer.concat(chunks));
  console.log(`   wrote ${path.relative(process.cwd(), dest)} (${(total / 1048576).toFixed(1)} MB)`);
}

async function main() {
  mkdirSync(CACHE, { recursive: true });
  for (const t of TARGETS) await recover(t);
  console.log(
    `\nNext, in this order:\n` +
      `  npx tsx scripts/blenderkit/repair-materials.ts   # strips what is still mask-bound\n` +
      `  rm the recovered ids from public/furniture/blenderkit/opt/  # optimize skips what exists\n` +
      `  npx tsx scripts/blenderkit/optimize.ts\n` +
      `  npx tsx scripts/blenderkit/verify-optimized.ts`,
  );
}

main();
