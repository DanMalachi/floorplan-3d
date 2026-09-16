import type { Metadata } from "next";
import { routing } from "./routing";
import { localePath } from "./navigation";

/**
 * The `hreflang` map for one page.
 *
 * ── Why this is per-page and not one map in the layout ──────────────────────
 * hreflang answers "where is THIS page in the other language". A map declared
 * in `[locale]/layout.tsx` is inherited by every route beneath it, so a single
 * map there tells crawlers that the Hebrew twin of `/about` is `/he` — the
 * Hebrew HOME page. Google's response to an alternate that does not point back
 * is to drop the pairing, so the whole map stops working rather than failing on
 * the one route. Each page therefore declares its own, and the layout declares
 * none.
 *
 * The map is identical on both locales' copies of a page, which is correct and
 * required: every version has to list every version, itself included.
 *
 * URLs stay relative — `metadataBase` in `[locale]/layout.tsx` resolves them,
 * and it already knows the difference between the production domain and a
 * preview alias. Hardcoding absolute URLs here would fork that logic.
 *
 * `x-default` is English because that is what `localePrefix: "as-needed"` makes
 * the unprefixed URL, and it is what every share link already in the world
 * resolves to.
 */
export function alternatesFor(path: `/${string}`): Metadata["alternates"] {
  const languages: Record<string, string> = {};
  for (const locale of routing.locales) languages[locale] = localePath(locale, path);
  languages["x-default"] = localePath(routing.defaultLocale, path);
  return { languages };
}

/** Every path the sitemap and the hreflang maps both have to agree on.
 *
 *  Kept here, beside `alternatesFor`, rather than inline in `sitemap.ts`: the
 *  sitemap and the per-page maps are two statements of the same fact, and a
 *  crawler that finds them disagreeing trusts neither. One list, two readers. */
export const INDEXABLE_MARKETING = ["/about", "/pricing", "/faq"] as const;
export const INDEXABLE_ALWAYS = ["/", "/design", "/legal/privacy", "/legal/terms", "/legal/cookies", "/legal/accessibility", "/legal/credits"] as const;
