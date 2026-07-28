/**
 * Floor/wall material pipeline — shared constants and helpers.
 *
 * Source is ambientCG (https://ambientcg.com), everything CC0 public domain —
 * no attribution required, redistribution allowed, so unlike the BlenderKit
 * furniture pipeline there is no licence subset to police here.
 *
 * ── Why ambientCG over Poly Haven ───────────────────────────────────────────
 * Both are CC0 and both are good. ambientCG wins for floors on two counts:
 * predictable download URLs (`/get?file=<id>_1K-JPG.zip`, no per-asset API call
 * to resolve a link), and far deeper coverage of the categories that matter
 * here — 74 wood floors, 164 tiles, 59 planks, 21 terrazzo. Poly Haven remains
 * the better source for one-off hero materials and is worth revisiting for
 * walls.
 *
 * ── The maps we take, and the ones we don't ─────────────────────────────────
 * Each 1K-JPG zip carries Color, NormalGL, NormalDX, Roughness, AmbientOcclusion
 * and Displacement, plus .blend/.usdc/.mtlx side files. We extract three:
 *   • Color        — albedo
 *   • NormalGL     — three.js uses OpenGL normal convention, NOT DirectX
 *   • Roughness    — the difference between polished tile and matte concrete
 * AO and Displacement are skipped deliberately: at room viewing distance they
 * contribute almost nothing, and taking them would roughly double the payload.
 */

/** Identifies us honestly. ambientCG is run by one person — be a good guest. */
export const USER_AGENT =
  "floorplan-3d-materials/1.0 (material catalog build; contact: dandun.m36@gmail.com)";

export const API = "https://ambientcg.com/api/v2";

/** Direct, predictable download URL for a material at 1K JPEG. */
export const zipUrl = (assetId: string) =>
  `https://ambientcg.com/get?file=${assetId}_1K-JPG.zip`;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const politeDelay = () => sleep(500 + Math.floor(Math.random() * 300));

/** ambientCG categories that can plausibly appear underfoot. */
export const FLOOR_CATEGORIES = [
  "WoodFloor",
  "Tiles",
  "Planks",
  "Carpet",
  "Terrazzo",
  "Marble",
  "Travertine",
  "Concrete",
] as const;

/** The three map suffixes we keep, in the zip's naming scheme. */
export const WANTED_MAPS = {
  color: "Color",
  normal: "NormalGL",
  roughness: "Roughness",
} as const;

export type MapKind = keyof typeof WANTED_MAPS;
