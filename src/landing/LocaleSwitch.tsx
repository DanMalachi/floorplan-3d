"use client";

import { useTranslations } from "next-intl";
// PLAIN next/link, and the one place in the app that uses it: `useLocaleSwitch`
// hands back an href that already names its target locale, so the locale-aware
// Link from @/i18n/navigation would prefix it a second time. `switchLocaleHref`
// carries the full argument.
import Link from "next/link";
import { localeName } from "@/i18n/routing";
import { useLocaleSwitch } from "@/i18n/useLocaleSwitch";
import { B, type as ty } from "@/brand/tokens";
import { MENU_ITEM_CLASS, TEXT_BTN_CLASS } from "./hoverCss";

// -----------------------------------------------------------------------------
// The marketing site's language switcher.
//
// ── Why it says "עברית" and not "Hebrew" ───────────────────────────────────
// Every entry is written in the language it leads to, in that language's own
// script (`localeName` in src/i18n/routing.ts). That is the whole trick of a
// language switcher: the person who needs it is, by definition, the one who
// cannot read the page they are looking at. "Hebrew" is a word for people who
// already read English.
//
// ── Why it is a link and not a button ──────────────────────────────────────
// The locale IS the URL here (`localePrefix: "as-needed"`), so switching
// language is a navigation and nothing else — no state to write, nothing to
// persist (see the `localeCookie` note in routing.ts). Making it an anchor is
// what gives it middle-click, "open in new tab", and the `hreflang` that
// next-intl's Link puts on a cross-locale href for free.
//
// The editor has its own (src/ui/planDock/LocaleSwitch.tsx) because it is glass
// over a canvas rather than type on an opaque ground; both call the same hook.
// -----------------------------------------------------------------------------

/** `bar` — the quiet utility slot in the desktop header, beside Sign in.
 *  `sheet` — a full-width row in the narrow-screen menu. */
export function LocaleSwitch({ variant = "bar", onNavigate }: {
  variant?: "bar" | "sheet";
  onNavigate?: () => void;
}) {
  const t = useTranslations("locale");
  const { others } = useLocaleSwitch();

  return (
    <>
      {others.map(({ locale, href }) => (
        <Link
          key={locale}
          href={href}
          // Never prefetched. The header is on screen for every visitor of every
          // page, and the default would quietly pull the other locale's copy of
          // the whole site for a control most people click once or never.
          prefetch={false}
          onClick={onNavigate}
          // The visible text names the target, which is not the sentence a
          // screen reader wants read out of nowhere; `aria-label` supplies the
          // verb. `lang` marks the text as being IN that language so it is
          // pronounced with the right voice rather than spelled out, and
          // `hrefLang` says the same about where the link goes.
          lang={locale}
          hrefLang={locale}
          aria-label={t("switchTo", { language: localeName[locale] })}
          className={variant === "bar" ? TEXT_BTN_CLASS : MENU_ITEM_CLASS}
          style={variant === "bar" ? barStyle : sheetStyle}
        >
          {localeName[locale]}
        </Link>
      ))}
    </>
  );
}

/** Matches the header's "Sign in" exactly — same size, weight and rest colour.
 *  They are the same kind of thing (a utility beside the CTA, not a nav
 *  destination) and should not compete with each other for attention. */
const barStyle: React.CSSProperties = {
  fontFamily: B.fontUi,
  fontSize: ty.small,
  fontWeight: 600,
  color: B.ink3,
  textDecoration: "none",
  padding: "8px 4px",
};

/** Matches the sheet's nav rows. */
const sheetStyle: React.CSSProperties = {
  fontFamily: B.fontUi,
  fontSize: 17,
  fontWeight: 600,
  color: B.ink,
  textDecoration: "none",
  padding: "14px 0",
  borderBottom: `1px solid ${B.hairline}`,
};
