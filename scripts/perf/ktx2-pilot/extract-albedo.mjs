#!/usr/bin/env node
// KTX2 pilot — step 1: extract embedded baseColor (albedo) images from local
// IKEA GLB copies (public/furniture/ikea/*.glb) for LOCAL MEASUREMENT ONLY.
//
// Does not modify or re-upload any hosted asset. Writes raw source images
// (already-encoded PNG/JPEG bytes lifted verbatim from the GLB's BIN chunk)
// to scripts/perf/ktx2-pilot/source/.
//
// Usage: node scripts/perf/ktx2-pilot/extract-albedo.mjs <glb-path> [<glb-path> ...]

import { readFileSync, writeFileSync } from "node:fs";
import { basename, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "source");

function readGlb(buf) {
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546c67) throw new Error("not a glb (bad magic)");
  const version = buf.readUInt32LE(4);
  const totalLength = buf.readUInt32LE(8);
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < totalLength) {
    const chunkLength = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    const chunkData = buf.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === 0x4e4f534a) {
      json = JSON.parse(chunkData.toString("utf8"));
    } else if (chunkType === 0x004e4942) {
      bin = chunkData;
    }
    offset += 8 + chunkLength;
  }
  return { version, json, bin };
}

function pngDims(buf) {
  // 8-byte signature, then first chunk is IHDR: 4 len + 4 "IHDR" + 4 width + 4 height
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

function jpegDims(buf) {
  if (buf.readUInt16BE(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset < buf.length) {
    if (buf.readUInt8(offset) !== 0xff) {
      offset++;
      continue;
    }
    const marker = buf.readUInt8(offset + 1);
    // SOF0..SOF15 except DHT(C4), JPG(C8), DAC(CC)
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      return { width, height };
    }
    const segLen = buf.readUInt16BE(offset + 2);
    offset += 2 + segLen;
  }
  return null;
}

function imageDims(buf, mimeType) {
  if (mimeType === "image/png") return pngDims(buf);
  if (mimeType === "image/jpeg") return jpegDims(buf);
  // sniff
  return pngDims(buf) ?? jpegDims(buf);
}

function extractOne(glbPath, write = true) {
  const itemId = basename(glbPath, ".glb");
  const buf = readFileSync(glbPath);
  const { json, bin } = readGlb(buf);
  if (!json) throw new Error(`${glbPath}: no JSON chunk`);
  if (!json.images || json.images.length === 0) {
    console.log(`${itemId}: no embedded images`);
    return [];
  }

  // Map: image index -> set of roles it's used for (baseColor / normal / other)
  const roleByImageIndex = new Map();
  const texToImage = (json.textures ?? []).map((t) => t.source);
  for (const mat of json.materials ?? []) {
    const bc = mat.pbrMetallicRoughness?.baseColorTexture?.index;
    if (bc !== undefined) {
      const imgIdx = texToImage[bc];
      if (imgIdx !== undefined) {
        const roles = roleByImageIndex.get(imgIdx) ?? new Set();
        roles.add("baseColor");
        roleByImageIndex.set(imgIdx, roles);
      }
    }
    const nm = mat.normalTexture?.index;
    if (nm !== undefined) {
      const imgIdx = texToImage[nm];
      if (imgIdx !== undefined) {
        const roles = roleByImageIndex.get(imgIdx) ?? new Set();
        roles.add("normal");
        roleByImageIndex.set(imgIdx, roles);
      }
    }
  }

  const results = [];
  for (const [imgIdx, roles] of roleByImageIndex.entries()) {
    if (!roles.has("baseColor")) continue; // this pilot cares about albedo only
    const img = json.images[imgIdx];
    if (img.bufferView === undefined) {
      console.log(`${itemId}: image ${imgIdx} has no bufferView (external uri?) — skipped`);
      continue;
    }
    const bv = json.bufferViews[img.bufferView];
    const start = bv.byteOffset ?? 0;
    const end = start + bv.byteLength;
    const imgBytes = bin.subarray(start, end);
    const ext = img.mimeType === "image/png" ? "png" : "jpg";
    const dims = imageDims(imgBytes, img.mimeType);
    const outName = `${itemId}__img${imgIdx}.${ext}`;
    const outPath = join(OUT_DIR, outName);
    if (write) writeFileSync(outPath, imgBytes);
    results.push({
      itemId,
      imgIdx,
      mimeType: img.mimeType,
      bytes: imgBytes.length,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      roles: [...roles],
      outPath,
    });
  }
  return results;
}

const rawArgs = process.argv.slice(2);
const scanOnly = rawArgs.includes("--scan");
const args = rawArgs.filter((a) => a !== "--scan");
if (args.length === 0) {
  console.error("usage: node extract-albedo.mjs [--scan] <glb-path> [...]");
  process.exit(1);
}

const all = [];
for (const p of args) {
  try {
    all.push(...extractOne(p, !scanOnly));
  } catch (e) {
    console.error(`FAILED ${p}: ${e.message}`);
  }
}

console.log("\nitemId\timgIdx\tmime\twidth\theight\tbytes\troles\toutPath");
for (const r of all) {
  console.log(
    `${r.itemId}\t${r.imgIdx}\t${r.mimeType}\t${r.width}\t${r.height}\t${r.bytes}\t${r.roles.join("+")}\t${r.outPath}`
  );
}
