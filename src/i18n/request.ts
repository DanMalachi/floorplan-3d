// Per-request message loading (server side).
//
// One catalog serves both surfaces, namespaced by UI area, so the landing page
// and the editor can be translated on different schedules — which is exactly
// what Dan asked for: landing first, then the app.

import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { cookies } from "next/headers";
import { routing } from "./routing";
import { pseudoizeMessages } from "./pseudoLocale";
import { PSEUDO_LOCALE_COOKIE } from "./pseudoLocaleCookie";

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
  const messages =
    locale === routing.defaultLocale
      ? en
      : mergeDeep(en, (await import(`../../messages/${locale}.json`)).default as Messages);

  return { locale, messages: await maybePseudoize(messages) };
});

/**
 * Dev-only `en-XA`-style pseudo-localization — see `pseudoLocale.ts` for what
 * it does and why it is a message transform rather than a routed locale.
 *
 * Double-gated on purpose: `src/proxy.ts` only ever sets the cookie outside
 * production, and this checks `NODE_ENV` again independently, so a cookie
 * that somehow survives into a production request (a stale one from a
 * preview deploy, say) still can't turn a real visitor's page into pseudo-
 * loc noise.
 */
async function maybePseudoize(messages: Messages): Promise<Messages> {
  if (process.env.NODE_ENV === "production") return messages;
  const jar = await cookies();
  return jar.get(PSEUDO_LOCALE_COOKIE)?.value === "1" ? pseudoizeMessages(messages) : messages;
}
