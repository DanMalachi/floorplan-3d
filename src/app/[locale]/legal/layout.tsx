import type { ReactNode } from "react";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { PD } from "@/ui/planDock/tokens";
import { ChevronLeftIcon } from "@/ui/planDock/icons";
import { Brand } from "@/brand/Brand";

// globals.css pins `body { overflow: hidden; height: 100% }` for the 3D app's
// benefit (a fixed-size WebGL canvas). Legal pages are long-form text, so this
// layout opens its own full-viewport scroll region instead of touching that
// global rule (which src/viewport3d/Viewport.tsx and friends depend on).
export default async function LegalLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  // `/legal` is a real path segment, so static generation renders it in its own
  // scope — the `setRequestLocale` in [locale]/layout.tsx does not reach here
  // the way it reaches the `(marketing)` route group, which has no segment of
  // its own. Without this, the locale-aware `Link`s below make every page under
  // /legal server-rendered on demand instead of prerendered.
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  return (
    <div
      // Opaque, deliberately: a policy is long-form reading, so this page
      // keeps a solid `PD.bg` ground rather than the `pdGlass()` recipe the
      // floating dock panels use. Note these pages never mount `PdThemeStyle`,
      // so every PD colour resolves to its dark fallback — which is what this
      // page has always been.
      style={{
        position: "fixed",
        inset: 0,
        overflowY: "auto",
        background: PD.bg,
        color: PD.textPrimary,
        fontFamily: PD.fontUi,
      }}
    >
      {/* These are long-form documents whose only controls are links, and every
          one of them had `text-decoration: none` with no hover — so nothing on
          the page answered the cursor at all. A stylesheet rather than React
          state because this is a server component with no interactivity of its
          own, and because `:hover` on a descendant selector is exactly what CSS
          is for. Inline <style> is already sanctioned by the CSP. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
.fp-legal a { transition: color 180ms ease, text-decoration-color 180ms ease; }
.fp-legal a:hover { color: ${PD.accent}; text-decoration: underline; text-underline-offset: 3px; }
.fp-legal a:focus-visible { outline: 2px solid ${PD.accent}; outline-offset: 3px; border-radius: 3px; }
`,
        }}
      />
      <div className="fp-legal" style={{ maxWidth: 720, margin: "0 auto", padding: "56px 24px 96px" }}>
        <nav
          aria-label="Legal"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 40,
            fontSize: 13,
            color: PD.textSecondary,
          }}
        >
          <Link
            href="/"
            style={{ display: "inline-flex", alignItems: "center", gap: 5, color: PD.textSecondary, textDecoration: "none" }}
          >
            <ChevronLeftIcon size={13} aria-hidden /> <Brand />
          </Link>
          <span aria-hidden style={{ color: PD.textTertiary }}>·</span>
          <Link href="/legal/privacy" style={{ color: PD.textPrimary, textDecoration: "none" }}>
            Privacy Policy
          </Link>
          <Link href="/legal/terms" style={{ color: PD.textPrimary, textDecoration: "none" }}>
            Terms of Service
          </Link>
          <Link href="/legal/credits" style={{ color: PD.textPrimary, textDecoration: "none" }}>
            Credits
          </Link>
        </nav>
        {/* These are long documents whose only landmark was the nav above.
            <main> gives a screen reader somewhere to jump to; it is
            display:block, so nothing moves. */}
        <main>{children}</main>
      </div>
    </div>
  );
}
