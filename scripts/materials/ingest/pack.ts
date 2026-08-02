/**
 * Resize-to-derived-density, ORM channel packing, and the output encode —
 * WebP fallback (§5.1's recorded deferral) or real KTX2 (M3d/D2 onward, once
 * `encoder.ts` finds `ktx` on PATH). The per-map WebP codec choices mirror
 * `scripts/materials/repack.ts` exactly (colour vs. data-channel tradeoffs
 * already measured there); this file doesn't re-derive them, it reuses them.
 * The KTX2 codec choices come from `encoder.ts`'s `EncoderProfile`s, which
 * carry material-spec.md §5.1's decision as literal `ktx create` flags.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import type { EncoderProfile } from "./types";

/** Colour map (albedo): lossy WebP is fine, nobody views it as raw data. */
export async function writeAlbedo(srcPath: string, dstPath: string, resolution: number): Promise<void> {
  mkdirSync(path.dirname(dstPath), { recursive: true });
  await sharp(srcPath).resize(resolution, resolution, { fit: "fill" }).webp({ quality: 84, effort: 5 }).toFile(dstPath);
}

/** Normal map: direction data. Chroma subsampling corrupts it (faceting in
 *  raking light), so smartSubsample at raised quality — repack.ts's measured
 *  tradeoff (14 KB premium over plain lossy, worth it; 700 KB for lossless is
 *  not, for a surface seen from standing height). */
export async function writeNormal(srcPath: string, dstPath: string, resolution: number): Promise<void> {
  mkdirSync(path.dirname(dstPath), { recursive: true });
  await sharp(srcPath)
    .resize(resolution, resolution, { fit: "fill" })
    .webp({ quality: 92, smartSubsample: true, effort: 5 })
    .toFile(dstPath);
}

/**
 * Pack AO(R) / Roughness(G) / Metalness(B) into one RGB image (material-spec
 * §6 — the glTF `metallicRoughnessTexture`/`occlusionTexture` layout). Each
 * input may be a file path (resized to `resolution` and greyscaled) or a flat
 * scalar 0..1 (material-spec §1.2: a flat architecture surface's AO channel
 * is a constant 1.0 and "packs to nothing" — the same applies to any channel
 * shipped as a scalar rather than a map).
 */
export type ChannelInput = { path: string } | { scalar: number };

async function channelBuffer(input: ChannelInput, resolution: number): Promise<Buffer> {
  if ("scalar" in input) {
    const v = Math.round(Math.max(0, Math.min(1, input.scalar)) * 255);
    return Buffer.alloc(resolution * resolution, v);
  }
  return sharp(input.path).resize(resolution, resolution, { fit: "fill" }).greyscale().raw().toBuffer();
}

async function ormBuffer(ao: ChannelInput, roughness: ChannelInput, metalness: ChannelInput, resolution: number): Promise<Buffer> {
  const [r, g, b] = await Promise.all([
    channelBuffer(ao, resolution),
    channelBuffer(roughness, resolution),
    channelBuffer(metalness, resolution),
  ]);
  const n = resolution * resolution;
  const rgb = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    rgb[i * 3] = r[i];
    rgb[i * 3 + 1] = g[i];
    rgb[i * 3 + 2] = b[i];
  }
  return rgb;
}

export async function writeOrm(
  ao: ChannelInput,
  roughness: ChannelInput,
  metalness: ChannelInput,
  dstPath: string,
  resolution: number,
): Promise<void> {
  mkdirSync(path.dirname(dstPath), { recursive: true });
  const rgb = await ormBuffer(ao, roughness, metalness, resolution);
  await sharp(rgb, { raw: { width: resolution, height: resolution, channels: 3 } })
    .webp({ quality: 84, effort: 5 })
    .toFile(dstPath);
}

export async function writeThumb(srcPath: string, dstPath: string, size = 128): Promise<void> {
  mkdirSync(path.dirname(dstPath), { recursive: true });
  await sharp(srcPath).resize(size, size, { fit: "fill" }).webp({ quality: 80, effort: 5 }).toFile(dstPath);
}

export function fileSize(p: string): number {
  return statSync(p).size;
}

/**
 * Resize to the derived resolution (identical resampling to the WebP path —
 * only the final compression differs) into a lossless PNG intermediate, then
 * hand it to `ktx create` with the map's `EncoderProfile`. The intermediate
 * is a scratch temp file, deleted immediately after — it never ships and
 * never appears in the manifest.
 */
async function encodeKtx2(pngBuffer: Buffer, dstPath: string, profile: EncoderProfile): Promise<void> {
  mkdirSync(path.dirname(dstPath), { recursive: true });
  const scratch = mkdtempSync(path.join(tmpdir(), "ktx2-encode-"));
  const tmpPng = path.join(scratch, "src.png");
  try {
    writeFileSync(tmpPng, pngBuffer);
    execFileSync("ktx", ["create", ...profile.flags, tmpPng, dstPath], { stdio: ["ignore", "pipe", "pipe"] });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export async function writeAlbedoKtx2(srcPath: string, dstPath: string, resolution: number, profile: EncoderProfile): Promise<void> {
  const png = await sharp(srcPath).resize(resolution, resolution, { fit: "fill" }).png().toBuffer();
  await encodeKtx2(png, dstPath, profile);
}

export async function writeNormalKtx2(srcPath: string, dstPath: string, resolution: number, profile: EncoderProfile): Promise<void> {
  const png = await sharp(srcPath).resize(resolution, resolution, { fit: "fill" }).png().toBuffer();
  await encodeKtx2(png, dstPath, profile);
}

export async function writeOrmKtx2(
  ao: ChannelInput,
  roughness: ChannelInput,
  metalness: ChannelInput,
  dstPath: string,
  resolution: number,
  profile: EncoderProfile,
): Promise<void> {
  const rgb = await ormBuffer(ao, roughness, metalness, resolution);
  const png = await sharp(rgb, { raw: { width: resolution, height: resolution, channels: 3 } }).png().toBuffer();
  await encodeKtx2(png, dstPath, profile);
}
