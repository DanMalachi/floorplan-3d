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

/**
 * Commercial-readiness [17]/[18] — the pricing page (`/pricing`,
 * `src/app/pricing/`) and the refunds/cancellation policy page
 * (`/legal/refunds`). Dan has not decided a tier structure, any prices, or a
 * refund policy yet — both pages exist only so the shape is ready to fill in
 * later (config: `src/pricing/plans.ts`; see `docs/PRICING.md`).
 *
 * Default OFF, and both routes call `notFound()` when off rather than
 * rendering with visible [[PLACEHOLDER]] blanks. That distinction matters:
 * the /legal pages (privacy, terms) shipped to production with 14 unfilled
 * placeholders already, on the theory that a draft-labeled placeholder is
 * fine to expose — this flag exists because a *pricing* page with blank
 * numbers reads as broken or bait-and-switch in a way a legal draft doesn't,
 * so here the bar is "doesn't exist" rather than "clearly a draft."
 *
 * One flag gates both pages rather than two, since they ship as one unit of
 * work and a refund policy with no visible pricing page next to it reads
 * strangely on its own. Split them later if that stops being true.
 *
 * Turn on for local/preview only: NEXT_PUBLIC_PRICING_UI_ENABLED=true.
 * Never set this in the production environment until Dan has actually filled
 * in `src/pricing/plans.ts` and the refunds page's placeholders.
 */
export const pricingUiEnabled =
  process.env.NEXT_PUBLIC_PRICING_UI_ENABLED === "true";
