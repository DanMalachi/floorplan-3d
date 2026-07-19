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
