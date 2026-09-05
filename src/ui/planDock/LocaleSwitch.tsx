"use client";

import { useTranslations } from "next-intl";
// PLAIN next/link — the href from `useLocaleSwitch` already names its target
// locale, so the locale-aware Link would prefix it twice. See `switchLocaleHref`.
import Link from "next/link";
import { localeName, type Locale } from "@/i18n/routing";
import { useLocaleSwitch } from "@/i18n/useLocaleSwitch";
import { PD, pdGlass } from "./tokens";
import { useHover } from "./useHover";
import { Tooltip } from "./Tooltip";

// -----------------------------------------------------------------------------
// The editor's language switcher — the glass twin of src/landing/LocaleSwitch.tsx.
//
// Same shape as `ThemeToggle` beside it (32px tall, glass pill, tooltip naming
// what you would switch TO) and same logic as the marketing one; only the
// surface differs, because this sits over the 3D canvas rather than on an
// opaque ground. Both read `useLocaleSwitch`, so the href arithmetic — and the
// query string it has to carry — is written once.
//
// ── Why a wider pill instead of a two-letter glyph ─────────────────────────
// A round 32px button in this row wants an icon, and the icon for "language" is
// a globe, which says only that a language control exists — not which language.
// A code ("HE" / "עב") needs the same guess. The endonym is three characters
// wider and needs no guess at all. That is the right trade in a row that has
// exactly two other controls in it.
//
// ── Why a client-side navigation is safe here, unlike "back to site" ───────
// `ProjectsOverlay`'s link out is deliberately a full document load, because
// only a real unload flushes the debounced autosave. This one does not need
// that: crossing to /he/design is a client navigation inside the same bundle,
// so `useSceneStore` and the pending save timer are the same module instances
// they were a moment ago. Nothing is torn down but the React tree, and the
// scene comes back from the store, not from disk.
// -----------------------------------------------------------------------------

export function LocaleSwitch() {
  const t = useTranslations("locale");
  const { others } = useLocaleSwitch();

  return (
    <>
      {others.map(({ locale, href }) => (
        <LocaleLink
          key={locale}
          href={href}
          locale={locale}
          label={t("switchTo", { language: localeName[locale] })}
        />
      ))}
    </>
  );
}

function LocaleLink({ href, locale, label }: { href: string; locale: Locale; label: string }) {
  const [hovered, hoverBind] = useHover();
  return (
    // `bottom`, like every tooltip on a control this near the top of the window:
    // the editor's <main> is `overflow: hidden`, so one placed above is cut off
    // by the edge of the viewport rather than drawn over it.
    <Tooltip label={label} placement="bottom">
      <Link
        {...hoverBind}
        href={href}
        // Never prefetched: this bar is on screen for the whole session, and the
        // default would pull the other locale's editor bundle for a control that
        // is clicked once at most.
        prefetch={false}
        // The text is IN the language it names, so say so — otherwise a screen
        // reader reads "עברית" with an English voice, or spells it.
        lang={locale}
        hrefLang={locale}
        style={{
          height: 32,
          display: "flex",
          alignItems: "center",
          border: "none",
          textDecoration: "none",
          fontSize: 12.5,
          fontWeight: 700,
          ...pdGlass({ borderRadius: 999, padding: "0 11px" }),
          // AFTER the spread, for the reason ThemeToggle documents: pdGlass()
          // sets `color` itself, so anything above it is silently overridden.
          color: hovered ? PD.textPrimary : PD.textSecondary,
          transition: "color 140ms ease",
        }}
      >
        {localeName[locale]}
      </Link>
    </Tooltip>
  );
}
