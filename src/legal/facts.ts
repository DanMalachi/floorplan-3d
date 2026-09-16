// Single source for the facts the legal pages state in BOTH languages.
//
// Hebrew is the binding version (Israeli consumers are the target market, and a
// consumer contract is read against its drafter in the language the consumer
// was offered). English is a courtesy translation and says so. Keeping the
// facts here means the two texts cannot quietly disagree on a date, an email,
// an age or a court.
//
// `null` = not decided yet. Every page renders a visible [[PLACEHOLDER]] for a
// null, so an unfilled fact can never ship looking finished.

export const LEGAL_FACTS = {
  /** Operator (the "database controller" under the Privacy Protection Law).
   *  Undecided as of 2026-09-16 — Dan has not formed an entity or chosen to
   *  operate as an עוסק. Consumer Protection Law §14C requires name, ID or
   *  company number and address for a distance sale, so all three must be
   *  filled before paid plans go live. */
  operatorNameHe: null as string | null,
  operatorNameEn: null as string | null,
  operatorIdNumber: null as string | null, // ת.ז. / מס' עוסק / ח.פ.
  operatorAddressHe: null as string | null,
  operatorAddressEn: null as string | null,

  contactEmail: "done.design.app@gmail.com",

  /** Set on launch day, in both languages. */
  effectiveDateHe: null as string | null,
  effectiveDateEn: null as string | null,

  /** Account-creation age. Deliberately separate from capacity to contract
   *  (18) — see the comment in the privacy page content. */
  minimumAge: 16,

  /** Share-link lifetime, src/collab/grant.server.ts DEFAULT_TTL_MS. */
  shareLinkDays: 30,

  /** Soft-delete purge window, src/app/api/account/retention RETENTION_PURGE_DAYS. */
  purgeDays: 30,

  /** Chosen 2026-09-16. */
  courtsHe: "בתי המשפט המוסמכים במחוז תל אביב-יפו",
  courtsEn: "the competent courts of the Tel Aviv-Jaffa district",

  /** FALSE until real checkout ships. While false the subscription section of
   *  the Terms is not rendered — the Terms must never promise billing,
   *  cancellation or refund mechanics that do not exist. Flipping this to true
   *  is a launch gate: see the checklist in src/legal/content/subscription.he.tsx. */
  paidPlansLive: false,
} as const;
