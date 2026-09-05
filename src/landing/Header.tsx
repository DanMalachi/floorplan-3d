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
import { CTA_CLASS, MENU_ITEM_CLASS, NAV_LINK_CLASS, OUTLINE_BTN_CLASS } from "./hoverCss";

// -----------------------------------------------------------------------------
// The marketing header.
//
// Deliberately not shared with the editor's own chrome: the app's top bar is
// assembled inline in src/app/design/page.tsx out of absolutely-positioned
// pieces over a full-bleed canvas, which is the right shape for a tool and the
// wrong shape for a document. This one is a normal sticky bar in normal flow.
// -----------------------------------------------------------------------------

const BREAK = 860; // px — below this the links collapse into the sheet

export function Header() {
  const [open, setOpen] = useState(false);
  const [narrow, setNarrow] = useState(false);

  // Media queries can't reach inline styles, and this repo styles with inline
  // objects rather than CSS. One resize listener is the honest cost of that.
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${BREAK}px)`);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // A menu left open across a resize to desktop would strand its overlay.
  useEffect(() => {
    if (!narrow) setOpen(false);
  }, [narrow]);

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

        {!narrow && (
          <nav style={{ display: "flex", alignItems: "center", gap: 26 }}>
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
        )}

        {!narrow && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: 10 }}>
            <LocaleSwitch />
            <AccountControl />
            <Link href={APP_HREF} className={CTA_CLASS} style={ctaPrimary({ padding: "10px 18px", fontSize: 14 })}>
              {openApp}
            </Link>
          </div>
        )}

        {narrow && (
          <>
            <AccountControl />
            <MenuButton
              open={open}
              onClick={() => setOpen((o) => !o)}
              openLabel={tNav("openMenu")}
              closeLabel={tNav("closeMenu")}
            />
          </>
        )}
      </div>

      {narrow && open && (
        <div
          id="site-menu"
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
      className={OUTLINE_BTN_CLASS}
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
