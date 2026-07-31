/**
 * BlenderKit furniture pipeline — shared constants and helpers.
 *
 * ── Licensing (read before changing any filter) ──────────────────────────────
 * BlenderKit ships assets under two tiers: CC0 and "Royalty Free" (RF). The RF
 * tier permits selling *renders* and games "if assets cannot be easily
 * extracted" — which is the exact opposite of what this app does: we serve the
 * .glb to the browser, where anyone can pull it out of the network tab. So this
 * pipeline is hard-restricted to `license: cc_zero`, and the restriction is
 * enforced twice (in the search query AND per-asset before download). Do not
 * relax it to grow the catalog.
 *
 * ── Etiquette ───────────────────────────────────────────────────────────────
 * The search API needs no auth and the download endpoint only needs a
 * `scene_uuid` — the same call BlenderKit's own Blender addon makes. That is not
 * an invitation to mirror the library: we take only the CC0 interior subset,
 * one request at a time, with a real identifying User-Agent, and cache to disk
 * so a re-run costs nothing.
 */

/** Identifies us honestly rather than impersonating the Blender addon. */
export const USER_AGENT = "floorplan-3d-catalog/1.0 (furniture catalog build; contact: dandun.m36@gmail.com)";

export const API = "https://www.blenderkit.com/api/v1";

/** The only license this pipeline will touch. See the header. */
export const ALLOWED_LICENSE = "cc_zero";

/** Stable per-machine id the download endpoint wants. Any UUID works; keeping it
 *  constant means our requests are attributable to one "scene" rather than
 *  looking like 355 separate clients. */
export const SCENE_UUID = "6f2b1c94-3a7d-4e58-9c21-0d5a8f3b7e10";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Politeness delay between API calls, with jitter. */
export const politeDelay = () => sleep(400 + Math.floor(Math.random() * 300));

/** BlenderKit returns model metadata as a flat [{parameterType, value}] list. */
export interface RawParameter {
  parameterType: string;
  value: string;
}

/** Flattens the parameter list into a plain object, coercing numerics. */
export function paramsToObject(params: RawParameter[] | undefined): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const p of params ?? []) {
    const n = Number(p.value);
    out[p.parameterType] = p.value !== "" && !Number.isNaN(n) ? n : p.value;
  }
  return out;
}

export function num(v: string | number | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
