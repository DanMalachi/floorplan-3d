/**
 * Resize-to-derived-density, ORM channel packing, and the WebP fallback
 * encode. The per-map WebP codec choices mirror `scripts/materials/repack.ts`
 * exactly (colour vs. data-channel tradeoffs already measured there); this
 * file doesn't re-derive them, it reuses them.
 */
import { mkdirSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

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

export async function writeOrm(
  ao: ChannelInput,
  roughness: ChannelInput,
  metalness: ChannelInput,
  dstPath: string,
  resolution: number,
): Promise<void> {
  mkdirSync(path.dirname(dstPath), { recursive: true });
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
