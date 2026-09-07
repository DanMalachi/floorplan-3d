// Per-request message loading (server side).
//
// One catalog serves both surfaces, namespaced by UI area, so the landing page
// and the editor can be translated on different schedules — which is exactly
// what Dan asked for: landing first, then the app.

import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

type Messages = { [k: string]: string | Messages };

/**
 * Deep merge, English underneath.
 *
 * This has to be deep, and the reason is the whole delivery plan. A shallow
 * `{ ...en, ...he }` replaces a namespace WHOLESALE the moment Hebrew declares
 * it — so a `he.json` that has translated three of the inspector's forty keys
 * would take the other thirty-seven away entirely rather than falling back to
 * English. Half-translated is the normal state here for as long as the editor
 * catalogue is being filled in, so per-key fallback is the difference between
 * "the app is readable in Hebrew while we work" and "the app is broken until
 * the last string lands".
 *
 * Untranslated keys therefore render real English text, not `nav.about` and
 * not a placeholder.
 */
function mergeDeep(base: Messages, over: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] =
      typeof v === "object" && v !== null && typeof b === "object" && b !== null
        ? mergeDeep(b as Messages, v as Messages)
        : v;
  }
  return out;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  const en = (await import("../../messages/en.json")).default as Messages;
  if (locale === routing.defaultLocale) return { locale, messages: en };

  const translated = (await import(`../../messages/${locale}.json`)).default as Messages;
  return { locale, messages: mergeDeep(en, translated) };
});
