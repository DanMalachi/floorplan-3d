import type { RenderClass, SurfaceClass } from "./spec";

/**
 * The descriptor a source asset ships alongside its raw maps. This is the
 * ingest path's input contract — everything the validator and packer need to
 * know that isn't recoverable from the pixels themselves.
 */
export interface AssetSource {
  /** Stable id, kebab-case `family-descriptor` (§6). Persisted downstream the
   *  same way `FloorMaterial.id` is today. */
  id: string;
  name: string;
  family: string;
  /** Which of the five architecture classes this ships under (§6). */
  class: RenderClass;
  /** §2.2's surface-finish class — decides the roughness/metalness band. */
  surfaceClass: SurfaceClass;
  /** Metres one texture repeat spans. Drives §3.1's derived resolution. */
  coverM: number;
  /** §2.1 — required when `maps.roughness` is absent; must be omitted (or
   *  exactly 1.0) when a roughness map is present, since a scalar tuning a map
   *  is exactly the defect §2.1 forbids. */
  roughnessScalar?: number;
  /** §2.1 — same rule as `roughnessScalar`, for metalness. Binary in practice:
   *  0 or 1. */
  metalnessScalar?: number;
  /** §2.1's boundary-blend exemption from `METALNESS_MID_BAND` — set only when
   *  the map genuinely blends two materials (e.g. a handle set into a wood
   *  door) and the mid-band mass is a transition edge, not a shininess dial. */
  boundaryBlend?: boolean;
  license: string;
  source: string;
  maps: {
    /** Required. sRGB colour, §1.2. */
    albedo: string;
    /** Required. Tangent-space, OpenGL/+Y-up, §6. */
    normal: string;
    /** Optional — see `roughnessScalar`. */
    roughness?: string;
    /** Optional — see `metalnessScalar`. */
    metalness?: string;
    /** Optional. Sub-geometry occlusion only (§1.2). Absent on a flat surface
     *  defaults to a constant white (no occlusion) at pack time — "a wall's AO
     *  channel is a constant 1.0 and packs to nothing" is §1.2's own words. */
    ao?: string;
  };
}

/** One validator finding. `clause` is a `docs/material-spec.md` section number
 *  so a rejection is traceable back to the exact rule it failed, per M3
 *  milestone's "rejects non-conforming inputs with a specific reason." */
export interface Violation {
  clause: string;
  message: string;
}

/** material-spec.md §5.1 — ETC1S/BasisLZ and UASTC are not interchangeable,
 *  so "the flags used" is per map type, not one shared list. `codec` is the
 *  spec-level decision (§5.1's table); `flags` is the literal `ktx create`
 *  argument list that realises it — kept together so the two can never drift
 *  apart silently. */
export interface EncoderProfile {
  codec: "basis-lz" | "uastc";
  flags: string[];
}

/** Recorded per asset, alongside the manifest entry (M3b's answer to "if the
 *  encoder can't be installed, record the deferral, don't fabricate a pass").
 *  `null` is a real, persisted value — not an omitted field — so §7's
 *  conformance gate has something to fail closed against.
 *
 *  D2 (M3d) note: upstream KTX-Software dropped the standalone `toktx`
 *  binary this spec was written against, unifying every CLI tool
 *  (`toktx`/`ktx2ktx2`/`ktxsc`/...) into one `ktx` executable with
 *  subcommands (`ktx create`, `ktx encode`, ...) — found while building from
 *  source, not assumed. `tool` records the binary actually invoked. */
export type EncoderIdentity = {
  tool: string;
  version: string;
  /** Build provenance — for a from-source build, `<repo url> @ <commit>`,
   *  derived from the binary's own `--version` output (which embeds a
   *  `git describe`), not hardcoded to any one build session. For a
   *  container build (not yet exercised), this would be the image digest. */
  provenance: string;
  profiles: { albedo: EncoderProfile; orm: EncoderProfile; normal: EncoderProfile };
} | null;

export interface IngestedMaterial {
  id: string;
  name: string;
  family: string;
  class: RenderClass;
  surfaceClass: SurfaceClass;
  coverM: number;
  roughness: number;
  metalness: number;
  derivedResolution: { albedo: number; normal: number; orm: number };
  maps: { albedo: string; normal: string; orm: string };
  thumb: string;
  license: string;
  source: string;
  encoder: EncoderIdentity;
  /** Total bytes of albedo + normal + orm as actually written. Always
   *  recorded; only gated against the §5.3 budget when `encoder` is non-null
   *  (see `spec.ts`'s `BUDGET_ARCHITECTURE_TRANSFER_BYTES` doc comment). */
  transferBytes: number;
  ingestedAt: string;
}
