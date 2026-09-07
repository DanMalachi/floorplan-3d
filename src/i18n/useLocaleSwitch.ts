"use client";

// -----------------------------------------------------------------------------
// The one piece of logic behind every language switcher: "this same page, in
// that language".
//
// There are two switchers, because there are two chromes — the marketing
// header's (src/landing/LocaleSwitch.tsx, brand tokens on an opaque ground) and
// the editor's (src/ui/planDock/LocaleSwitch.tsx, glass over the 3D canvas).
// They share nothing visually and everything logically, which is the same split
// `AccountControl` / `AccountMenu` already makes. The href arithmetic lives here
// so the two cannot drift on the parts that are easy to get subtly wrong.
// -----------------------------------------------------------------------------

import { useSyncExternalStore } from "react";
import { useLocale } from "next-intl";
import { switchLocaleHref, usePathname } from "./navigation";
import { routing, type Locale } from "./routing";

/** Never fires. `location.search` cannot change without either a full load or a
 *  client navigation, and both re-render this component anyway —
 *  `useSyncExternalStore` re-reads the snapshot on every render and re-renders
 *  again if it moved, so a real subscription would buy nothing. Module-level so
 *  the reference is stable across renders. */
const subscribe = () => () => {};
const clientSearch = () => window.location.search;
/** Server snapshot: there is no location on the server, so the first render on
 *  both sides agrees on "no query" and hydration cannot mismatch. */
const serverSearch = () => "";

export type LocaleOption = {
  locale: Locale;
  /** This same page in that locale, prefix already applied. Render it with a
   *  PLAIN `next/link` — see `switchLocaleHref` for why the locale-aware `Link`
   *  is the wrong component for this one job. */
  href: string;
};

/**
 * The active locale, and every other one paired with the href that lands on the
 * page you are reading now.
 *
 * A list rather than "the other one" because two locales is today's count, not
 * a law — a third would otherwise turn every call site into a menu rewrite.
 * With two, the list has one entry and both switchers render a toggle.
 *
 * ── Why the query string is carried by hand ────────────────────────────────
 * `usePathname()` is deliberately path-only, so a naive switch drops the query
 * — and this app puts real state there: `?g=` is a share grant, `?perf=1` and
 * `?dpr=1` are the render-measurement flags, `?home=1` opens the gallery.
 * Silently changing what the page does because someone changed its language is
 * the kind of bug nobody thinks to look for.
 *
 * `useSearchParams()` is the obvious hook and the wrong one HERE: reading it
 * from a component on a statically-prerendered page opts that page out of
 * static rendering unless it is wrapped in Suspense — and this sits in the site
 * header, so the bill would be every marketing route, for a query string most
 * of them never have. Reading `location.search` once is what the rest of the
 * repo does for exactly this reason (see the long note on `usePerfEnabled`).
 */
export function useLocaleSwitch(): { locale: Locale; others: LocaleOption[] } {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const search = useSyncExternalStore(subscribe, clientSearch, serverSearch);
  const here = `${pathname}${search}`;

  return {
    locale,
    others: routing.locales
      .filter((l) => l !== locale)
      .map((l) => ({ locale: l, href: switchLocaleHref(l, here) })),
  };
}
