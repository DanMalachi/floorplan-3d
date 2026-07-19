// Shared default model id for one-off VLM calls (candidate classification,
// room-semantics reasoning). Split out from the legacy vlmClassify module in
// Phase 0 so shared/app code doesn't depend on legacy/ for a constant.
export const DEFAULT_VLM_MODEL = "claude-opus-4-8";
