/**
 * M3c — download and unpack `curated-m3c.ts`'s four assets, writing each into
 * an `ingest/run.ts`-ready source directory: raw maps plus `asset.json`.
 *
 * Same source and zip format as `scripts/materials/fetch-materials.ts`
 * (ambientCG 1K-JPG zips); the zip reader here is a deliberate small copy
 * rather than an import, so this new-class pipeline can't regress the
 * shipping floor pipeline by sharing a mutable dependency with it.
 *
 * Run:
 *   npx tsx scripts/materials/ingest/fetch-m3c.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import path from "node:path";
import { USER_AGENT, WANTED_MAPS, politeDelay, zipUrl, type MapKind } from "../lib";
import { CURATED_M3C } from "./curated-m3c";
import type { AssetSource } from "./types";

const OUT_DIR = path.resolve("scripts/materials/ingest/.sources");
const LOCAL_HEADER = 0x04034b50;

interface ZipEntry {
  name: string;
  data: Buffer;
}

function readZip(buf: Buffer, want: (name: string) => boolean): ZipEntry[] {
  const out: ZipEntry[] = [];
  let off = 0;
  while (off + 30 <= buf.length && buf.readUInt32LE(off) === LOCAL_HEADER) {
    const flags = buf.readUInt16LE(off + 6);
    const method = buf.readUInt16LE(off + 8);
    const csize = buf.readUInt32LE(off + 18);
    const nlen = buf.readUInt16LE(off + 26);
    const elen = buf.readUInt16LE(off + 28);
    const name = buf.toString("utf8", off + 30, off + 30 + nlen);
    const start = off + 30 + nlen + elen;
    if (flags & 0x08 || csize === 0) break;
    if (want(name)) {
      const raw = buf.subarray(start, start + csize);
      try {
        out.push({ name, data: method === 8 ? inflateRawSync(raw) : Buffer.from(raw) });
      } catch {
        // corrupt entry — dropped, caller reports the missing map
      }
    }
    off = start + csize;
  }
  return out;
}

function mapKindOf(filename: string): MapKind | null {
  const base = path.basename(filename);
  if (!/\.(jpg|jpeg|png)$/i.test(base)) return null;
  for (const [kind, suffix] of Object.entries(WANTED_MAPS) as [MapKind, string][]) {
    if (base.includes(`_${suffix}.`)) return kind;
  }
  return null;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const failures: string[] = [];

  for (const c of CURATED_M3C) {
    const dir = path.join(OUT_DIR, c.id);
    const descriptorPath = path.join(dir, "asset.json");
    if (existsSync(descriptorPath)) {
      console.log(`  cached  ${c.id}`);
      continue;
    }

    const url = zipUrl(c.assetId);
    console.log(`  fetch   ${c.id} <- ${c.assetId}`);
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) {
      failures.push(`${c.id} — HTTP ${res.status}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const entries = readZip(buf, (name) => mapKindOf(name) !== null);
    const byKind = new Map(entries.map((e) => [mapKindOf(e.name)!, e]));

    if (!byKind.has("color") || !byKind.has("normal")) {
      failures.push(`${c.id} — missing color or normal map in zip`);
      continue;
    }

    mkdirSync(dir, { recursive: true });
    const mapFiles: AssetSource["maps"] = { albedo: "albedo.jpg", normal: "normal.jpg" };
    writeFileSync(path.join(dir, "albedo.jpg"), byKind.get("color")!.data);
    writeFileSync(path.join(dir, "normal.jpg"), byKind.get("normal")!.data);
    // Roughness map deliberately NOT extracted: material-spec.md §2.1 forbids a
    // scalar tuning a map, and these four are curated to a spec-band scalar
    // (curated-m3c.ts's own reasoning, matching curated.ts's floor convention)
    // rather than trusting the source map's mean to land in band.

    const asset: AssetSource = {
      id: c.id,
      name: c.name,
      family: c.family,
      class: c.class,
      surfaceClass: c.surfaceClass,
      coverM: c.coverM,
      roughnessScalar: c.roughness,
      metalnessScalar: c.metalness,
      license: c.license,
      source: `https://ambientcg.com/view?id=${c.assetId}`,
      maps: mapFiles,
    };
    writeFileSync(descriptorPath, JSON.stringify(asset, null, 2));
    await politeDelay();
  }

  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  ${f}`);
    process.exitCode = 1;
  }
}

main();
