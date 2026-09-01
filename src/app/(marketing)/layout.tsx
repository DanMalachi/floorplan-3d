import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { B, BRAND_THEME_CSS } from "@/brand/tokens";
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
export default function MarketingLayout({ children }: { children: ReactNode }) {
  if (!landingEnabled) redirect("/design");

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
      }}
    >
      {/* The brand palette. Inline <style> is already sanctioned by the CSP
          (style-src 'unsafe-inline'), which the app needs anyway because it
          styles with inline objects throughout. */}
      <style dangerouslySetInnerHTML={{ __html: BRAND_THEME_CSS }} />
      <Header />
      <main>{children}</main>
      <Footer />
    </div>
  );
}
