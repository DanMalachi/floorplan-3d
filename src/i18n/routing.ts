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
});
