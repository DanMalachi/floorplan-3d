import Link from "next/link";
import { B, type as ty, microLabel } from "@/brand/tokens";
import { WordmarkLockup } from "@/brand/Wordmark";
import { APP_HREF, footerLegal, navItems } from "./nav";

/**
 * The footer is the one place the page says the whole brand unit out loud —
 * `done.design`, not `done.` — because everything down here is machine-facing:
 * links, policies, an address bar. The mark keeps the period; the plumbing
 * keeps the domain.
 */
export function Footer() {
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
            Draw the home you actually have, furnish it from a real catalogue,
            and walk it before you spend anything.
          </p>
        </div>

        <FooterCol title="Product">
          <FooterLink href={APP_HREF}>Open done.</FooterLink>
          {navItems().map((i) => (
            <FooterLink key={i.href} href={i.href}>
              {i.label}
            </FooterLink>
          ))}
        </FooterCol>

        <FooterCol title="Legal">
          {footerLegal().map((i) => (
            <FooterLink key={i.href} href={i.href}>
              {i.label}
            </FooterLink>
          ))}
          <FooterLink href="/account">Your data</FooterLink>
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

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: "0 1 160px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={microLabel({ marginBottom: 2 })}>{title}</div>
      {children}
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
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
