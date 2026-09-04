import type { ReactNode } from "react";
import Link from "next/link";
import { PD } from "@/ui/planDock/tokens";
import { ChevronLeftIcon } from "@/ui/planDock/icons";

// globals.css pins `body { overflow: hidden; height: 100% }` for the 3D app's
// benefit (a fixed-size WebGL canvas). Legal pages are long-form text, so this
// layout opens its own full-viewport scroll region instead of touching that
// global rule (which src/viewport3d/Viewport.tsx and friends depend on).
export default function LegalLayout({ children }: { children: ReactNode }) {
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
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 40,
            fontSize: 13,
            color: PD.textSecondary,
          }}
        >
          {/* The "Floorplan → 3D" wording is the OLD product name; the app is
              "done." now. Left alone deliberately: the in-app branding sweep is
              one job (never piecemeal), and this is a wording change, not the
              icon change being made here. */}
          <Link
            href="/"
            style={{ display: "inline-flex", alignItems: "center", gap: 5, color: PD.textSecondary, textDecoration: "none" }}
          >
            <ChevronLeftIcon size={13} /> Floorplan → 3D
          </Link>
          <span style={{ color: PD.textTertiary }}>·</span>
          <Link href="/legal/privacy" style={{ color: PD.textPrimary, textDecoration: "none" }}>
            Privacy Policy
          </Link>
          <Link href="/legal/terms" style={{ color: PD.textPrimary, textDecoration: "none" }}>
            Terms of Service
          </Link>
        </nav>
        {children}
      </div>
    </div>
  );
}
