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
 * The done.design marketing site (`/`, `/about`, `/faq` — everything under the
 * `(marketing)` route group) and the editor's move off the site root to
 * `/design`.
 *
 * Default OFF, and while off `/` simply redirects to `/design`, so production
 * behaves exactly as it does today: visiting done.design puts you straight in
 * the editor. That default is load-bearing rather than cautious — a push to
 * `main` IS a production deploy on this project (Vercel Git integration), so
 * an unflagged marketing page would go live the moment the branch merged,
 * regardless of whether the copy, pricing or brand had been signed off.
 *
 * One flag covers the whole marketing surface rather than one per page: the
 * pages cross-link to each other and to the header, and a live About page
 * linking to a 404 homepage reads worse than no marketing site at all. It also
 * gates the route MOVE, which is the part that cannot be half-shipped.
 *
 * Note the editor lives at `/design` unconditionally, flag or no flag — that
 * way the new URL is real and warm before it becomes the only one, and
 * flipping this flag never changes where the app itself is served from.
 *
 * Turn on for local/preview: NEXT_PUBLIC_LANDING_ENABLED=true.
 */
export const landingEnabled =
  process.env.NEXT_PUBLIC_LANDING_ENABLED === "true";
