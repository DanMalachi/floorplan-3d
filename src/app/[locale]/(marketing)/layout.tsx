import type { ReactNode } from "react";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { B, BRAND_THEME_CSS } from "@/brand/tokens";
import { LANDING_HOVER_CSS } from "@/landing/hoverCss";
import { Header } from "@/landing/Header";
import { Footer } from "@/landing/Footer";
import { landingEnabled } from "@/lib/featureFlags";

/**
 * Shell for every marketing route.
 *
 * ── The scroll region ───────────────────────────────────────────────────────
 * src/app/globals.css pins `body { overflow: hidden; height: 100% }` so the 3D
 * app gets a fixed-size WebGL canvas, and src/viewport3d/* depends on that. A
 * marketing site is long-form and must scroll, so — exactly as
 * src/app/legal/layout.tsx already does — this opens its own full-viewport
 * scroll region rather than relaxing the global rule. `position: sticky` still
 * works inside it, which is what the header needs.
 *
 * ── The gate ────────────────────────────────────────────────────────────────
 * While NEXT_PUBLIC_LANDING_ENABLED is off, every marketing route — `/`
 * included — redirects to the editor, so production keeps behaving exactly as
 * it does today: done.design puts you straight into the app.
 *
 * One gate in the layout rather than one per page, so a route added later
 * cannot forget it. Redirect rather than `notFound()` (which is what the
 * unlaunched /pricing page does) because the difference matters: a pricing page
 * with blank numbers reads as broken, whereas an unlaunched About page is just
 * a page that isn't there yet — and the site ROOT has to resolve to something
 * regardless, so a single uniform rule beats two.
 */
export default async function MarketingLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  // Every layout and page under [locale] pins the request locale. Without it,
  // next-intl falls back to reading the locale out of a request HEADER, and a
  // page Next prerendered as static then throws "changed from static to dynamic
  // at runtime" the first time it is served — which takes out every unprefixed
  // English route while the Hebrew ones keep working, because those carry the
  // locale in the URL. See src/i18n/README-static.md.
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  // next-intl's `redirect` takes the target locale explicitly rather than
  // inferring it, so this destination cannot silently drop the prefix the way
  // the bare `next/navigation` one did: a visitor on `/he` with the flag off
  // has to land on `/he/design`, not in the English editor.
  if (!landingEnabled) redirect({ href: "/design", locale: locale as Locale });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflowY: "auto",
        overflowX: "hidden",
        background: B.ground,
        color: B.ink,
        fontFamily: B.fontUi,
        // Long-form pages get a comfortable default line-height; sections that
        // want tighter display type override it locally.
        lineHeight: 1.6,
        // The global focus ring (globals.css) in the brand copper, not the
        // editor's blue.
        ["--fp-focus" as string]: B.accent,
        // At narrow widths the fixed cookie notice (ConsentNotice.tsx,
        // mounted once at the root layout) sits over the bottom of the page
        // and can cover the last CTA until it's dismissed. ConsentNotice
        // keeps `--consent-h` on `documentElement` in sync with its own
        // rendered height (0 whenever it isn't on screen), so reserving that
        // much space at the bottom here just pushes the real content — the
        // last section's CTA included — up above it instead of behind it.
        paddingBottom: "var(--consent-h, 0px)",
      }}
    >
      {/* The brand palette. Inline <style> is already sanctioned by the CSP
          (style-src 'unsafe-inline'), which the app needs anyway because it
          styles with inline objects throughout. */}
      <style dangerouslySetInnerHTML={{ __html: BRAND_THEME_CSS }} />
      {/* Hover/focus for every control on the site. Inline styles cannot reach
          `:hover`, and this is the idiom the marketing pages already use for
          that (Hero's HERO_CSS, DemoStage's STAGE_CSS) — hoisted here so
          one stylesheet serves every route instead of each page inventing its
          own. See src/landing/hoverCss.ts. */}
      <style dangerouslySetInnerHTML={{ __html: LANDING_HOVER_CSS }} />
      <Header />
      <main>{children}</main>
      <Footer locale={locale} />
    </div>
  );
}
