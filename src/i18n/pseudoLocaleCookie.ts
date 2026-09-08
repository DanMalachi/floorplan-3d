// Shared between `src/proxy.ts` (sets it, dev-only) and `src/i18n/request.ts`
// (reads it, dev-only) — one name, so they can't drift.
export const PSEUDO_LOCALE_COOKIE = "pseudo-locale";
