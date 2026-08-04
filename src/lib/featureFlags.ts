// Central feature-flag surface for the extraction-pipeline rebuild (see
// docs/extraction-plan.md). Introduced in Phase 0 — no flag mechanism
// existed before this.
//
// The legacy trace2d pipeline (legacy/src/trace2d/**) is the production
// extraction path until the Phase 6 gate passes (CLAUDE.md rule 2/3).
// Flipping this to false is how a later phase cuts the app over to the new
// pipeline's adapter; today it must stay true.
export const legacyExtractionEnabled =
  process.env.NEXT_PUBLIC_LEGACY_EXTRACTION_ENABLED !== "false";

/**
 * M3d/D4 — real KTX2 floor materials (`src/materials/registryKtx2.ts`,
 * `loaderKtx2.ts`) vs. the legacy WebP catalog (`registry.ts`, `loader.ts`).
 * Default OFF: the render path this gates (`src/viewport3d/textures.ts`,
 * `FloorMesh.tsx`) is protected, and calibration baselines are frozen
 * against its current behaviour — this flag exists so that boundary is
 * reversible without a revert, not out of general caution.
 *
 * EXPIRY CONDITION, written now per Dan's ruling (M3d/D4) — removing this
 * flag is part of D4's exit, not later cleanup:
 *   Remove once all 18 registry assets pass full conformance AND
 *   `docs/calibration/`'s frozen `perspective` cells re-capture at zero-diff
 *   with this flag ON. If that re-capture ever shows a real difference, that
 *   is a finding to fix, not a reason to ship the flag anyway.
 * When removed: the KTX2 path becomes unconditional, and the dead legacy
 * per-room WebP files it replaces (`color.webp`/`normal.webp`/
 * `roughness.webp` — NOT `thumb.webp`, which §5.1 keeps as WebP permanently)
 * are deleted in that same change, not left orphaned.
 */
export const ktx2FloorsEnabled =
  process.env.NEXT_PUBLIC_KTX2_FLOORS_ENABLED === "true";
