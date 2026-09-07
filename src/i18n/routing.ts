// The locale contract. Everything else in the i18n setup reads from here.
//
// ── Why `localePrefix: "as-needed"` and not the usual always-prefix ─────────
// done.design is live, and its share links (`/v/<id>?g=…`) are already out in
// the world in people's messages. A scheme that moved English to `/en/…` would
// break every one of them the moment it deployed. With "as-needed", English
// keeps every URL it has today byte-for-byte and Hebrew lives under `/he/…`.
// That is not a stylistic preference — it is the only option that is safe to
// ship to an application that already has users.
//
// ── Why one mechanism for both the marketing site and the editor ────────────
// It is tempting to give the marketing site real URLs (it needs them for SEO
// and hreflang) and the editor a cookie-only switch (a locale in the URL is
// noise behind auth). Two mechanisms means two answers to "what locale am I
// in", and they drift. One `[locale]` segment serves both; the editor simply
// ignores the half it does not need.

import { defineRouting } from "next-intl/routing";

export const locales = ["en", "he"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale = "en" satisfies Locale;

/** Hebrew is the only RTL locale here, but ask this rather than comparing to
 *  the string — the next RTL locale should not have to hunt down comparisons. */
export const dirOf = (locale: string): "rtl" | "ltr" => (locale === "he" ? "rtl" : "ltr");

/**
 * What each language calls ITSELF — the endonym.
 *
 * This lives here rather than in `messages/*.json` because it is a property of
 * the locale, not a translation of anything: "עברית" is the right label in the
 * English build too. Putting it in the catalogue invites the one mistake a
 * language switcher must not make — a translator localising it, so the Hebrew
 * build offers "אנגלית" to a reader who by definition cannot read that word.
 * Endonyms are how someone finds their own language in a list they cannot
 * otherwise read.
 */
export const localeName: Record<Locale, string> = {
  en: "English",
  he: "עברית",
};

/**
 * The same endonym, abbreviated for a control that sits in a bar rather than a
 * list. Still the endonym and still in its own script — "עב" is what a Hebrew
 * reader recognises, and abbreviating it to "HE" would reintroduce exactly the
 * problem `localeName` exists to avoid.
 *
 * Display only. Every `aria-label` keeps the FULL name from `localeName`,
 * because two letters are a glance-target for someone who can see the bar and
 * a riddle for someone hearing it read out — "Switch to עב" tells a screen
 * reader user nothing that "Switch to עברית" does not tell them better.
 */
export const localeShort: Record<Locale, string> = {
  en: "EN",
  he: "עב",
};

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "as-needed",
  // Detection is OFF on purpose. An Israeli visitor sending `Accept-Language:
  // he` would otherwise be redirected away from a URL someone deliberately
  // shared with them in English, and the redirect is invisible — you cannot
  // tell you were moved. The switcher is explicit and its choice persists;
  // that is the behaviour people can reason about.
  localeDetection: false,
  // No NEXT_LOCALE cookie either, and this follows from the line above rather
  // than being a second opinion. next-intl writes that cookie whenever a
  // `<Link>` crosses locales, but `resolveLocale` only ever READS it when
  // `localeDetection` is on — so with detection off it is a cookie nothing can
  // consult. It would also make a liar of the privacy policy, which says in as
  // many words that the only cookies set are Supabase's strictly-necessary
  // session ones (src/app/[locale]/legal/privacy/page.tsx, "Cookies & local
  // storage"). A cookie that does nothing is not worth amending a legal page for.
  //
  // The consequence, stated plainly so nobody has to discover it: the locale
  // choice lives in the URL and nowhere else. It survives every internal
  // navigation — that is what src/i18n/navigation.ts is for — and it does not
  // survive someone typing `done.design` fresh a week later; they get English.
  // Making Hebrew sticky means deciding what happens to a shared English link
  // opened by someone who once chose Hebrew, which is a product call, not a
  // default to drift into.
  localeCookie: false,
});
