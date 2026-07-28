/**
 * Material pipeline, step 3 — repack the maps for the browser.
 *
 * Converts each material's three JPEGs to WebP under public/materials/floors/
 * and emits the runtime manifest.
 *
 * ── Per-map encoding, not one setting for all three ─────────────────────────
 * The three maps are not the same kind of data and must not be encoded alike:
 *
 *  • Colour is the only one a human looks at directly, and it's the only one
 *    that is sRGB. Lossy WebP at a decent quality is fine.
 *  • Roughness is a single-channel control signal. Compressing it as RGB wastes
 *    two thirds of the bytes on duplicated data, so it's flattened to greyscale
 *    first.
 *  • Normal maps encode direction in RGB. Chroma subsampling — which is exactly
 *    what makes lossy codecs cheap — corrupts that, producing faceting in raking
 *    light. WebP has no way to disable subsampling outright (`chromaSubsampling`
 *    is a JPEG option), so normals use `smartSubsample`, WebP's high-quality
 *    chroma path, at raised quality. Measured on a wood normal map: plain lossy
 *    q92 = 56 KB, smartSubsample q92 = 70 KB, nearLossless = 475 KB, lossless =
 *    755 KB. The 14 KB premium is worth it; the 700 KB one is not, for a surface
 *    viewed from standing height.
 *
 * Verification re-opens every written file and checks its dimensions, because a
 * silently truncated texture is the kind of thing that only shows up as a black
 * floor much later.
 *
 * Run:
 *   npx tsx scripts/materials/repack.ts
 */

import { mkdirSync, existsSync, writeFileSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { ResolvedMaterial } from "./fetch-materials";

const RAW_DIR = path.resolve("scripts/materials/.raw");
const OUT_DIR = path.resolve("public/materials/floors");
const RESOLVED = path.resolve("data/materials-floors.resolved.json");
const MANIFEST = path.resolve("data/materials-floors.manifest.json");
const PUBLIC_BASE = "/materials/floors";

/** Texture edge length. 1K is ample for a floor seen at standing height. */
const SIZE = 1024;

/** Picker swatch edge length. The colour map itself would work as a swatch, but
 *  at ~200 KB each that is 3 MB just to render the picker before anyone has
 *  chosen anything — so each material also gets a tiny thumbnail. */
const THUMB_SIZE = 128;

type MapKind = "color" | "normal" | "roughness";

async function encode(kind: MapKind, src: string, dst: string): Promise<void> {
  const img = sharp(src).resize(SIZE, SIZE, { fit: "fill" });

  if (kind === "normal") {
    // Direction data: keep chroma as intact as WebP allows.
    await img.webp({ quality: 92, smartSubsample: true, effort: 5 }).toFile(dst);
  } else if (kind === "roughness") {
    // Single channel; storing it as RGB triples the bytes for no information.
    await img.greyscale().webp({ quality: 82, effort: 5 }).toFile(dst);
  } else {
    await img.webp({ quality: 84, effort: 5 }).toFile(dst);
  }
}

export interface ManifestEntry {
  id: string;
  name: string;
  family: string;
  /** Metres spanned by one texture repeat — drives texture.repeat in the app. */
  coverM: number;
  roughness: number;
  maps: { color: string; normal: string; roughness: string };
  /** Small swatch for the picker UI. */
  thumb: string;
  license: string;
  source: string;
}

async function main() {
  const materials: ResolvedMaterial[] = JSON.parse(readFileSync(RESOLVED, "utf8"));
  mkdirSync(OUT_DIR, { recursive: true });

  const manifest: ManifestEntry[] = [];
  const problems: string[] = [];
  let rawBytes = 0;
  let outBytes = 0;

  for (const m of materials) {
    const dir = path.join(OUT_DIR, m.id);
    mkdirSync(dir, { recursive: true });
    const maps: Record<string, string> = {};

    for (const kind of ["color", "normal", "roughness"] as MapKind[]) {
      const src = path.join(RAW_DIR, m.id, `${kind}.jpg`);
      const dst = path.join(dir, `${kind}.webp`);
      if (!existsSync(src)) {
        problems.push(`${m.id}/${kind} — source missing`);
        continue;
      }
      rawBytes += statSync(src).size;

      if (!existsSync(dst)) await encode(kind, src, dst);

      // Re-open what we wrote: a truncated texture reads as a black floor and
      // is otherwise invisible until someone notices in the viewport.
      const meta = await sharp(dst).metadata();
      if (meta.width !== SIZE || meta.height !== SIZE) {
        problems.push(`${m.id}/${kind} — wrote ${meta.width}×${meta.height}, expected ${SIZE}²`);
        continue;
      }
      outBytes += statSync(dst).size;
      maps[kind] = `${PUBLIC_BASE}/${m.id}/${kind}.webp`;
    }

    if (Object.keys(maps).length !== 3) continue;

    // Swatch, cropped from the colour map so it shows the real material.
    const thumbDst = path.join(dir, "thumb.webp");
    if (!existsSync(thumbDst)) {
      await sharp(path.join(RAW_DIR, m.id, "color.jpg"))
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover" })
        .webp({ quality: 80 })
        .toFile(thumbDst);
    }
    outBytes += statSync(thumbDst).size;

    manifest.push({
      id: m.id,
      name: m.name,
      family: m.family,
      coverM: m.coverM,
      roughness: m.roughness,
      maps: maps as ManifestEntry["maps"],
      thumb: `${PUBLIC_BASE}/${m.id}/thumb.webp`,
      license: m.license,
      source: m.source,
    });
  }

  manifest.sort((a, b) => a.family.localeCompare(b.family) || a.name.localeCompare(b.name));
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));

  const perMat = outBytes / manifest.length / 1024;
  console.log(`Repacked ${manifest.length}/${materials.length} materials → ${path.relative(process.cwd(), OUT_DIR)}`);
  console.log(
    `  ${(rawBytes / 1048576).toFixed(1)} MB JPEG → ${(outBytes / 1048576).toFixed(1)} MB WebP ` +
      `(${(100 - (outBytes / rawBytes) * 100).toFixed(0)}% smaller, ${perMat.toFixed(0)} KB/material)`,
  );
  console.log(`  manifest → ${path.relative(process.cwd(), MANIFEST)}`);
  for (const p of problems) console.log(`   • ${p}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
