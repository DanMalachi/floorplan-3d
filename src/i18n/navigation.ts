// Locale-aware replacements for `next/link` and `next/navigation`.
//
// ── Why every internal navigation has to come through here ──────────────────
// With `localePrefix: "as-needed"` the prefix is real for Hebrew and absent for
// English, so a bare `next/link` href of `/faq` is not locale-neutral — it is
// literally the English URL. Follow it from `/he/about` and you are silently
// thrown back into English mid-session, with nothing on screen to explain it.
// The same applies to `redirect()`: `redirect("/design")` from a Hebrew page
// strips the locale.
//
// These wrappers take the SAME hrefs the app already writes — `/faq`,
// `/legal/privacy`, `/design?home=1` — and add the active locale's prefix
// themselves. So the fix at almost every call site is the import line, not the
// href. Genuinely external links stay on a plain `<a>`.

import { createNavigation } from "next-intl/navigation";
import { routing, type Locale } from "./routing";

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);

/**
 * The href for "the page you are reading now, but in `locale`" — the one link
 * in the app that deliberately leaves the current locale.
 *
 * ── Why not `<Link href={pathname} locale={target}>` ────────────────────────
 * That is the shape next-intl's own docs give a switcher, and it is wrong for
 * this app. Setting `locale` on a `Link` also sets next-intl's `forcePrefix`,
 * so switching to English emits `/en/faq` instead of `/faq`. That URL is not
 * broken — `src/proxy.ts` 307s it to the canonical one — but it puts a link to
 * a redirect in the header of every page, which is the exact near-miss
 * `localePath` below refuses to make for the sitemap, and it costs a round trip
 * on every switch into English. next-intl forces the prefix so its middleware
 * can see the target locale and write the cookie; with `localeDetection` and
 * `localeCookie` both off (see routing.ts) there is no cookie to write and
 * `/faq` already means English unambiguously.
 *
 * `getPathname` WITHOUT `forcePrefix` applies the ordinary "as-needed" rule
 * instead: `/faq` for English, `/he/faq` for Hebrew.
 *
 * Pass the query string along in `pathWithQuery` — this app keeps real state
 * there (`?g=` share grants, `?perf=1`/`?dpr=1`, `?home=1`). Unlike
 * `localePath`, this handles a query on the site ROOT correctly: `/?perf=1`
 * becomes `/he?perf=1`, not the `/he/?perf=1` that 308s.
 *
 * The href it returns already names its locale, so render it with a PLAIN
 * `next/link` — the locale-aware `Link` above would prefix it a second time.
 */
export function switchLocaleHref(locale: Locale, pathWithQuery: string): string {
  return getPathname({ locale, href: pathWithQuery });
}

/**
 * Prefix a path by hand, for the handful of navigations that must NOT be
 * client-side and so cannot use `Link` or `useRouter`:
 *
 *  • `src/ui/ProjectsOverlay.tsx`'s "back to site" — a full document load is
 *    the point there, because autosave is debounced and a client-side unmount
 *    would lose the last edits.
 *  • the two live-room handoffs in `src/collab/` — the room is a full-reload
 *    route, and one of them carries a freshly minted grant token in the query.
 *
 * They are still internal navigations, so without a prefix a Hebrew session
 * drops into the English app the moment it leaves or goes live.
 */
export function localePath(locale: string, path: `/${string}`): string {
  const known = (routing.locales as readonly string[]).includes(locale);
  if (!known || locale === routing.defaultLocale) return path;
  // The site root is the one path that must not be concatenated naively: `/he`
  // + `/` is `/he/`, and with `trailingSlash: false` (Next's default) that is a
  // 308 to `/he`. A sitemap <loc> or an hreflang href pointing at a redirect is
  // exactly the sort of near-miss a crawler resolves by ignoring the pairing.
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/**
 * `localePath` for the browser-only case, reading the locale off `<html lang>`
 * instead of taking it as an argument.
 *
 * Use this ONLY inside event handlers and other client-only code — never in
 * render, where the server has no `document` and the value would differ across
 * hydration. Components in render should call `useLocale()` and `localePath`.
 *
 * The attribute is not a guess: `src/app/[locale]/layout.tsx` sets it from the
 * very same routing locale, so it is the rendered truth for the page doing the
 * navigating and cannot drift out of step with what the user is reading.
 */
export function hardNavHref(path: `/${string}`): string {
  if (typeof document === "undefined") return path;
  return localePath(document.documentElement.lang, path);
}
