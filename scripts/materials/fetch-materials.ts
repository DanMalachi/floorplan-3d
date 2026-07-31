/**
 * Material pipeline, step 2 — download and unpack the curated floor materials.
 *
 * ambientCG ships each material as a single zip containing Color, NormalGL,
 * NormalDX, Roughness, AmbientOcclusion, Displacement and a handful of DCC side
 * files. We pull three maps out of it and discard the rest (see lib.ts for why).
 *
 * ── No zip dependency ───────────────────────────────────────────────────────
 * Node has no built-in unzip and these archives are plain deflate, so the reader
 * below walks local file headers and inflates entries with zlib. That avoids
 * adding a dependency for one build script, and avoids shelling out to
 * PowerShell's Expand-Archive, which would tie the pipeline to Windows.
 *
 * Resumable: a material already unpacked on disk is skipped, so a failed run is
 * just re-run.
 *
 * Run:
 *   npx tsx scripts/materials/fetch-materials.ts
 */

import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import path from "node:path";
import { USER_AGENT, WANTED_MAPS, politeDelay, type MapKind } from "./lib";
import { CURATED, STRUCTURED_FAMILIES } from "./curated";
import type { MaterialIndexEntry } from "./fetch-index";

const INDEX = path.resolve("data/materials-floors.json");
const RAW_DIR = path.resolve("scripts/materials/.raw");
const OUT = path.resolve("data/materials-floors.resolved.json");

const LOCAL_HEADER = 0x04034b50;

interface ZipEntry {
  name: string;
  data: Buffer;
}

/**
 * Minimal zip reader: walks local file headers and inflates each entry.
 * Handles stored (method 0) and deflate (method 8), which is everything
 * ambientCG produces. Entries using a streaming data descriptor (sizes deferred
 * to after the payload) are skipped rather than mis-parsed — none of the maps we
 * want have ever used one, and silently returning wrong bytes would be worse.
 */
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

    // Bit 3 = sizes live in a trailing data descriptor; we can't seek past it.
    if (flags & 0x08 || csize === 0) break;

    if (want(name)) {
      const raw = buf.subarray(start, start + csize);
      try {
        out.push({ name, data: method === 8 ? inflateRawSync(raw) : Buffer.from(raw) });
      } catch {
        // Corrupt entry — leave it out; the caller reports the missing map.
      }
    }
    off = start + csize;
  }
  return out;
}

/** Which of the three maps a zip entry is, or null if we don't want it. */
function mapKindOf(filename: string): MapKind | null {
  const base = path.basename(filename);
  if (!/\.(jpg|jpeg|png)$/i.test(base)) return null;
  for (const [kind, suffix] of Object.entries(WANTED_MAPS) as [MapKind, string][]) {
    // Anchor on "_<Suffix>." so NormalGL never matches NormalDX.
    if (base.includes(`_${suffix}.`)) return kind;
  }
  return null;
}

export interface ResolvedMaterial {
  id: string;
  name: string;
  family: string;
  assetId: string;
  /** Metres spanned by one texture repeat. */
  coverM: number;
  /** Where the size came from — published metadata or a curated fallback. */
  sizeSource: "ambientcg" | "curated-fallback";
  roughness: number;
  maps: Record<string, string>;
  license: string;
  source: string;
}

async function main() {
  mkdirSync(RAW_DIR, { recursive: true });
  const index: MaterialIndexEntry[] = JSON.parse(readFileSync(INDEX, "utf8"));
  const byId = new Map(index.map((m) => [m.assetId, m]));

  const resolved: ResolvedMaterial[] = [];
  const failures: string[] = [];
  let downloaded = 0;
  let cached = 0;

  for (const c of CURATED) {
    const meta = byId.get(c.assetId);
    if (!meta) {
      failures.push(`${c.id} — ${c.assetId} not in index`);
      continue;
    }

    // Resolve the physical tiling size. Structured families must have real
    // published dimensions; a fallback there would be a guess at a size people
    // can actually perceive.
    let coverM: number;
    let sizeSource: ResolvedMaterial["sizeSource"];
    if (meta.physicalSizeM) {
      coverM = Math.max(meta.physicalSizeM.x, meta.physicalSizeM.y);
      sizeSource = "ambientcg";
    } else if (c.fallbackSizeM !== undefined && !STRUCTURED_FAMILIES.has(c.family)) {
      coverM = c.fallbackSizeM;
      sizeSource = "curated-fallback";
    } else {
      failures.push(
        `${c.id} — no published size and ${c.family} is structured (would need a real dimension)`,
      );
      continue;
    }

    const outDir = path.join(RAW_DIR, c.id);
    const expected = Object.keys(WANTED_MAPS) as MapKind[];
    const onDisk = expected.every((k) => existsSync(path.join(outDir, `${k}.jpg`)));

    if (!onDisk) {
      await politeDelay();
      mkdirSync(outDir, { recursive: true });
      const res = await fetch(meta.zipUrl, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) {
        failures.push(`${c.id} — HTTP ${res.status}`);
        continue;
      }
      const zip = Buffer.from(await res.arrayBuffer());
      if (zip.toString("latin1", 0, 2) !== "PK") {
        failures.push(`${c.id} — not a zip (${zip.length}b)`);
        continue;
      }

      const entries = readZip(zip, (n) => mapKindOf(n) !== null);
      const got = new Set<MapKind>();
      for (const e of entries) {
        const kind = mapKindOf(e.name)!;
        if (got.has(kind)) continue;
        writeFileSync(path.join(outDir, `${kind}.jpg`), e.data);
        got.add(kind);
      }

      const missing = expected.filter((k) => !got.has(k));
      if (missing.length) {
        failures.push(`${c.id} — missing maps: ${missing.join(", ")}`);
        continue;
      }
      downloaded++;
      process.stdout.write(`\r[dl] ${downloaded} downloaded · ${cached} cached · ${failures.length} failed`);
    } else {
      cached++;
    }

    resolved.push({
      id: c.id,
      name: c.name,
      family: c.family,
      assetId: c.assetId,
      coverM,
      sizeSource,
      roughness: c.roughness,
      maps: Object.fromEntries(expected.map((k) => [k, `${c.id}/${k}.jpg`])),
      license: "CC0 1.0 Universal (public domain dedication)",
      source: meta.webUrl,
    });
  }

  writeFileSync(OUT, JSON.stringify(resolved, null, 2));

  console.log(`\n\nResolved ${resolved.length}/${CURATED.length} materials → ${path.relative(process.cwd(), OUT)}`);
  const fromApi = resolved.filter((r) => r.sizeSource === "ambientcg").length;
  console.log(`  published size : ${fromApi}`);
  console.log(`  curated fallback: ${resolved.length - fromApi} (scale-free families only)`);
  console.log(
    `  cover range    : ${Math.min(...resolved.map((r) => r.coverM)).toFixed(2)}m – ${Math.max(...resolved.map((r) => r.coverM)).toFixed(2)}m`,
  );
  for (const f of failures) console.log(`   • ${f}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
