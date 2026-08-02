/**
 * M3b — source asset -> conformant runtime asset.
 *
 * Reads a source directory's `asset.json` descriptor plus its raw maps, runs
 * every `docs/material-spec.md` validator, and — only if all of them pass —
 * writes the packed, derived-resolution output plus a manifest entry. A
 * non-conforming input is rejected with the specific clause it failed; nothing
 * partial is ever written.
 *
 * Run:
 *   npx tsx scripts/materials/ingest/run.ts <sourceDir>           # dry run
 *   npx tsx scripts/materials/ingest/run.ts <sourceDir> --write   # write output + manifest
 *
 * `<sourceDir>` must contain `asset.json` (see `types.ts`'s `AssetSource`) and
 * the map files it references, as relative paths.
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SURFACE_CLASS_BANDS, deriveResolution, tierDown, tierUp } from "./spec";
import { detectEncoder } from "./encoder";
import {
  fileSize,
  writeAlbedo,
  writeAlbedoKtx2,
  writeNormal,
  writeNormalKtx2,
  writeOrm,
  writeOrmKtx2,
  writeThumb,
  type ChannelInput,
} from "./pack";
import { upsertEntry } from "./manifest";
import {
  validateAlbedo,
  validateDescriptor,
  validateGpuResidentBudget,
  validateNormal,
  validateRoughnessMetalness,
  validateSourceResolution,
  validateTransferBudget,
} from "./validate";
import { albedoStats, normalMapStats, scalarMapStats } from "./stats";
import type { AssetSource, IngestedMaterial, Violation } from "./types";

export interface IngestOptions {
  write: boolean;
  publicRoot: string;
  manifestPath?: string;
}

export interface IngestResult {
  ok: boolean;
  violations: Violation[];
  entry?: IngestedMaterial;
}

export async function ingest(sourceDir: string, opts: IngestOptions): Promise<IngestResult> {
  const descriptorPath = path.join(sourceDir, "asset.json");
  if (!existsSync(descriptorPath)) {
    return { ok: false, violations: [{ clause: "§6", message: `no asset.json in ${sourceDir}` }] };
  }
  const asset: AssetSource = JSON.parse(readFileSync(descriptorPath, "utf8"));
  const mapPath = (rel: string) => path.join(sourceDir, rel);

  const violations: Violation[] = [...validateDescriptor(asset)];

  const albedoPath = mapPath(asset.maps.albedo);
  const normalPath = mapPath(asset.maps.normal);
  if (!existsSync(albedoPath)) violations.push({ clause: "§6", message: `albedo map not found: ${asset.maps.albedo}` });
  if (!existsSync(normalPath)) violations.push({ clause: "§6", message: `normal map not found: ${asset.maps.normal}` });
  if (violations.length > 0) return { ok: false, violations };

  const [albedo, normal] = await Promise.all([albedoStats(albedoPath), normalMapStats(normalPath)]);
  const isConductor = SURFACE_CLASS_BANDS[asset.surfaceClass]?.metalness === 1;
  violations.push(...validateAlbedo(albedo, isConductor));
  violations.push(...validateNormal(normal));
  violations.push(...validateSourceResolution(asset.coverM, albedo.width, albedo.height));

  const roughnessMean =
    asset.maps.roughness !== undefined
      ? (await scalarMapStats(mapPath(asset.maps.roughness))).mean
      : (asset.roughnessScalar ?? 0);
  const metalnessMean =
    asset.maps.metalness !== undefined
      ? (await scalarMapStats(mapPath(asset.maps.metalness))).mean
      : (asset.metalnessScalar ?? 0);
  violations.push(...validateRoughnessMetalness(asset.surfaceClass, roughnessMean, metalnessMean, asset.boundaryBlend));

  if (violations.length > 0) return { ok: false, violations };

  // ── Everything validated. Derive resolution and pack. ────────────────────
  const albedoRes = deriveResolution(asset.coverM);
  const normalRes = tierUp(albedoRes);
  const ormRes = tierDown(albedoRes);

  // §5.3 — KTX2's budget is checkable pre-pack (a formula over resolution +
  // codec), unlike WebP's (which depends on real compression output and is
  // checked post-pack below). Detecting the encoder here, before the
  // dry-run return, is what lets a dry run predict this violation too.
  const encoder = detectEncoder();
  if (encoder) {
    violations.push(...validateGpuResidentBudget(albedoRes, normalRes, ormRes, encoder.profiles));
    if (violations.length > 0) return { ok: false, violations };
  }

  if (!opts.write) {
    return {
      ok: true,
      violations: [],
      entry: undefined, // dry run: validated, nothing written
    };
  }

  // material-spec.md §5.1: KTX2 when a real encoder is present, WebP fallback
  // (recorded as data via `encoder: null`, not a silent substitution)
  // otherwise. Picker thumbnails are always WebP — §5.1 names them as UI
  // images, never sampled by a shader.
  const ext = encoder ? "ktx2" : "webp";
  const outDir = path.join(opts.publicRoot, "materials", asset.class, asset.id);
  const albedoOut = path.join(outDir, `albedo.${ext}`);
  const normalOut = path.join(outDir, `normal.${ext}`);
  const ormOut = path.join(outDir, `orm.${ext}`);
  const thumbOut = path.join(outDir, "thumb.webp");

  const aoInput: ChannelInput = asset.maps.ao ? { path: mapPath(asset.maps.ao) } : { scalar: 1 };
  const roughnessInput: ChannelInput = asset.maps.roughness
    ? { path: mapPath(asset.maps.roughness) }
    : { scalar: asset.roughnessScalar ?? 0 };
  const metalnessInput: ChannelInput = asset.maps.metalness
    ? { path: mapPath(asset.maps.metalness) }
    : { scalar: asset.metalnessScalar ?? 0 };

  if (encoder) {
    await writeAlbedoKtx2(albedoPath, albedoOut, albedoRes, encoder.profiles.albedo);
    await writeNormalKtx2(normalPath, normalOut, normalRes, encoder.profiles.normal);
    await writeOrmKtx2(aoInput, roughnessInput, metalnessInput, ormOut, ormRes, encoder.profiles.orm);
  } else {
    await writeAlbedo(albedoPath, albedoOut, albedoRes);
    await writeNormal(normalPath, normalOut, normalRes);
    await writeOrm(aoInput, roughnessInput, metalnessInput, ormOut, ormRes);
  }
  await writeThumb(albedoPath, thumbOut);

  const transferBytes = fileSize(albedoOut) + fileSize(normalOut) + fileSize(ormOut);

  // §5.3 — the WebP-fallback ceiling, checked post-pack (see
  // `validateTransferBudget`'s doc comment for why this one can't be
  // pre-pack like the KTX2 check above). Rejecting after writing is the one
  // exception to "nothing partial is ever written" in this file's own
  // docstring, so the exception cleans up after itself rather than leaving
  // orphaned output.
  if (!encoder) {
    const budgetViolations = validateTransferBudget(transferBytes);
    if (budgetViolations.length > 0) {
      rmSync(outDir, { recursive: true, force: true });
      return { ok: false, violations: budgetViolations };
    }
  }

  const publicPath = (p: string) => "/" + path.relative(opts.publicRoot, p).split(path.sep).join("/");

  const entry: IngestedMaterial = {
    id: asset.id,
    name: asset.name,
    family: asset.family,
    class: asset.class,
    surfaceClass: asset.surfaceClass,
    coverM: asset.coverM,
    roughness: roughnessMean,
    metalness: metalnessMean,
    derivedResolution: { albedo: albedoRes, normal: normalRes, orm: ormRes },
    maps: { albedo: publicPath(albedoOut), normal: publicPath(normalOut), orm: publicPath(ormOut) },
    thumb: publicPath(thumbOut),
    license: asset.license,
    source: asset.source,
    encoder,
    transferBytes,
    ingestedAt: new Date().toISOString(),
  };
  upsertEntry(entry, opts.manifestPath);

  return { ok: true, violations: [], entry };
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const sourceDir = args.find((a) => !a.startsWith("--"));
  if (!sourceDir) {
    console.error("Usage: tsx scripts/materials/ingest/run.ts <sourceDir> [--write]");
    process.exit(2);
  }
  const result = await ingest(sourceDir, { write, publicRoot: path.resolve("public") });
  if (!result.ok) {
    console.log(`REJECTED: ${sourceDir}`);
    for (const v of result.violations) console.log(`  ${v.clause}  ${v.message}`);
    process.exit(1);
  }
  if (!write) {
    console.log(`OK (dry run): ${sourceDir} — pass --write to produce output`);
  } else {
    console.log(`OK: ${sourceDir} -> ${result.entry?.id} (encoder: ${result.entry?.encoder ? result.entry.encoder.tool : "null — WebP fallback"})`);
  }
}

// Windows gives import.meta.url as file:///C:/... and process.argv[1] as
// C:\...; a naive `file://${argv[1]}` never matches there. pathToFileURL
// normalizes both sides the same way.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
