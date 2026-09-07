"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { B, type as ty, ctaPrimary } from "@/brand/tokens";
import { Wordmark } from "@/brand/Wordmark";
import { landingContent } from "./content";
import { APP_HREF, navItems } from "./nav";
import { AccountControl } from "./AccountControl";
import { LocaleSwitch } from "./LocaleSwitch";
import {
  CTA_CLASS,
  MENU_ITEM_CLASS,
  NARROW_ONLY_CLASS,
  NAV_BREAK,
  NAV_LINK_CLASS,
  OUTLINE_BTN_CLASS,
  WIDE_ONLY_CLASS,
} from "./hoverCss";

// -----------------------------------------------------------------------------
// The marketing header.
//
// Deliberately not shared with the editor's own chrome: the app's top bar is
// assembled inline in src/app/design/page.tsx out of absolutely-positioned
// pieces over a full-bleed canvas, which is the right shape for a tool and the
// wrong shape for a document. This one is a normal sticky bar in normal flow.
//
// ── Which bar shows is a MEDIA QUERY, not React state ───────────────────────
// This used to be `const [narrow, setNarrow] = useState(false)` synced from
// `matchMedia` in an effect. That cannot run on the server, so the server always
// rendered the DESKTOP bar and every phone painted it before hydrating: About,
// FAQ and the locale link in the open, and "Open done." running off the right
// edge — 420px of content in a 393px window, cropped without a scrollbar by the
// marketing shell's `overflowX: hidden`. The hamburger arrived only once React
// hydrated, which on a phone is after the hero's 3D chunk.
//
// Both bars are in the HTML now and `WIDE_ONLY_CLASS`/`NARROW_ONLY_CLASS` hide
// one. Correct in the first paint, correct with JS off, and `display: none`
// keeps the hidden one out of the accessibility tree so the links are not
// announced twice. See the note on those classes in hoverCss.ts.
//
// `AccountControl` renders ONCE, outside both, because it is the one control
// that belongs in both bars — two copies would mean two `useSession`
// subscriptions and two dropdowns behind one visible control.
// -----------------------------------------------------------------------------

export function Header() {
  const [open, setOpen] = useState(false);

  // The only thing left that needs to know the width, and it decides nothing
  // about what renders — only that a sheet left open across a resize to desktop
  // does not stay open behind the bar it belongs to.
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${NAV_BREAK}px)`);
    const sync = () => {
      if (!mq.matches) setOpen(false);
    };
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const tNav = useTranslations("nav");
  const { openApp } = landingContent(useLocale());
  const items = navItems();

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: B.ground,
        borderBottom: `1px solid ${B.hairline}`,
        // The hero canvas sits directly under this bar; without an opaque
        // ground the WebGL content would read straight through it on scroll.
      }}
    >
      <div
        style={{
          maxWidth: B.maxWidthWide,
          margin: "0 auto",
          padding: `14px ${B.gutter}px`,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <Link href="/" style={{ textDecoration: "none", lineHeight: 0 }} aria-label={tNav("home")}>
          <Wordmark size={25} />
        </Link>

        <div style={{ flex: 1 }} />

        <nav className={WIDE_ONLY_CLASS} style={{ display: "flex", alignItems: "center", gap: 26 }}>
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={NAV_LINK_CLASS}
              style={{
                fontFamily: B.fontUi,
                fontSize: ty.small,
                fontWeight: 600,
                color: B.ink3,
                textDecoration: "none",
                transition: `color ${B.dur} ${B.ease}`,
              }}
            >
              {tNav(i.labelKey)}
            </Link>
          ))}
        </nav>

        {/* One group, so the utilities keep a single rhythm in both bars: wide
            reads language → account → CTA, narrow drops the two wide-only
            members and reads account → menu. */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginInlineStart: 10 }}>
          <div className={WIDE_ONLY_CLASS} style={{ display: "flex", alignItems: "center" }}>
            <LocaleSwitch />
          </div>

          <AccountControl />

          <Link
            href={APP_HREF}
            className={`${CTA_CLASS} ${WIDE_ONLY_CLASS}`}
            style={ctaPrimary({ padding: "10px 18px", fontSize: 14 })}
          >
            {openApp}
          </Link>

          <MenuButton
            open={open}
            onClick={() => setOpen((o) => !o)}
            openLabel={tNav("openMenu")}
            closeLabel={tNav("closeMenu")}
          />
        </div>
      </div>

      {open && (
        <div
          id="site-menu"
          className={NARROW_ONLY_CLASS}
          style={{
            borderTop: `1px solid ${B.hairline}`,
            background: B.ground,
            padding: `8px ${B.gutter}px 20px`,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              onClick={() => setOpen(false)}
              className={MENU_ITEM_CLASS}
              style={{
                fontFamily: B.fontUi,
                fontSize: 17,
                fontWeight: 600,
                color: B.ink,
                textDecoration: "none",
                padding: "14px 0",
                borderBottom: `1px solid ${B.hairline}`,
              }}
            >
              {tNav(i.labelKey)}
            </Link>
          ))}
          {/* Last row rather than first: language is a utility, and the sheet's
              own order should still read About → FAQ → the thing you came for. */}
          <LocaleSwitch variant="sheet" onNavigate={() => setOpen(false)} />
          <Link
            href={APP_HREF}
            onClick={() => setOpen(false)}
            className={CTA_CLASS}
            style={ctaPrimary({ marginTop: 18, justifyContent: "center" })}
          >
            {openApp}
          </Link>
        </div>
      )}
    </header>
  );
}

/** The three-bar button. Morphs to an X when open — the bars are the same
 *  three elements moved, so the transition reads as one object changing state
 *  rather than two icons swapping. */
function MenuButton({
  open,
  onClick,
  openLabel,
  closeLabel,
}: {
  open: boolean;
  onClick: () => void;
  openLabel: string;
  closeLabel: string;
}) {
  const bar: React.CSSProperties = {
    display: "block",
    width: 18,
    height: 1.5,
    background: B.ink,
    borderRadius: 2,
    transition: `transform ${B.dur} ${B.ease}, opacity ${B.dur} ${B.ease}`,
  };
  return (
    <button
      onClick={onClick}
      aria-label={open ? closeLabel : openLabel}
      aria-expanded={open}
      aria-controls="site-menu"
      className={`${OUTLINE_BTN_CLASS} ${NARROW_ONLY_CLASS}`}
      style={{
        width: 40,
        height: 40,
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        background: "transparent",
        border: `1px solid ${B.hairline}`,
        borderRadius: B.radiusS,
        cursor: "pointer",
        padding: 0,
      }}
    >
      <span style={{ ...bar, transform: open ? "translateY(6.5px) rotate(45deg)" : "none" }} />
      <span style={{ ...bar, opacity: open ? 0 : 1 }} />
      <span style={{ ...bar, transform: open ? "translateY(-6.5px) rotate(-45deg)" : "none" }} />
    </button>
  );
}
