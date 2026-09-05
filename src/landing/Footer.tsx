import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { B, type as ty, microLabel } from "@/brand/tokens";
import { WordmarkLockup } from "@/brand/Wordmark";
import { landingContent } from "./content";
import { APP_HREF, footerLegal, navItems } from "./nav";
import { NAV_LINK_CLASS } from "./hoverCss";

/**
 * The footer is the one place the page says the whole brand unit out loud —
 * `done.design`, not `done.` — because everything down here is machine-facing:
 * links, policies, an address bar. The mark keeps the period; the plumbing
 * keeps the domain.
 */
// A SERVER component, deliberately. It briefly became a client one to reach
// `useTranslations`, which ships the whole footer — markup, styles and all — to
// the browser for strings that never change after render. `getTranslations` is
// the server half of the same API and needs no boundary; the marketing layout
// above has already pinned the request locale, so this stays statically
// rendered (see src/i18n/README-static.md).
export async function Footer({ locale }: { locale: string }) {
  const t = await getTranslations("nav");
  const tFooter = await getTranslations("footer");
  const { footer, openApp } = landingContent(locale);
  return (
    <footer style={{ borderTop: `1px solid ${B.hairline}`, background: B.ground }}>
      <div
        style={{
          maxWidth: B.maxWidthWide,
          margin: "0 auto",
          padding: `48px ${B.gutter}px 40px`,
          display: "flex",
          flexWrap: "wrap",
          gap: 40,
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: "1 1 240px", minWidth: 220 }}>
          <WordmarkLockup size={21} />
          <p
            style={{
              margin: "14px 0 0",
              fontFamily: B.fontUi,
              fontSize: ty.small,
              lineHeight: 1.6,
              color: B.ink4,
              maxWidth: 300,
            }}
          >
            {footer.tagline}
          </p>
        </div>

        <FooterCol heading={tFooter("product")}>
          <FooterLink href={APP_HREF}>{openApp}</FooterLink>
          {navItems().map((i) => (
            <FooterLink key={i.href} href={i.href}>
              {t(i.labelKey)}
            </FooterLink>
          ))}
        </FooterCol>

        <FooterCol heading={tFooter("legal")}>
          {footerLegal().map((i) => (
            <FooterLink key={i.href} href={i.href}>
              {t(i.labelKey)}
            </FooterLink>
          ))}
          <FooterLink href="/account">{tFooter("yourData")}</FooterLink>
        </FooterCol>
      </div>

      <div
        style={{
          maxWidth: B.maxWidthWide,
          margin: "0 auto",
          padding: `0 ${B.gutter}px 40px`,
        }}
      >
        <div
          style={{
            borderTop: `1px solid ${B.hairline}`,
            paddingTop: 20,
            fontFamily: B.fontUi,
            fontSize: 12.5,
            color: B.ink4,
          }}
        >
          © {new Date().getFullYear()} done.design
        </div>
      </div>
    </footer>
  );
}

/** A footer column. The prop is `heading`, not `title`: it renders the visible
 *  column heading, and calling it `title` made it read like a native tooltip
 *  attribute — it never was one, and this file has none. */
function FooterCol({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: "0 1 160px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={microLabel({ marginBottom: 2 })}>{heading}</div>
      {children}
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={NAV_LINK_CLASS}
      style={{
        fontFamily: B.fontUi,
        fontSize: ty.small,
        color: B.ink2,
        textDecoration: "none",
      }}
    >
      {children}
    </Link>
  );
}
