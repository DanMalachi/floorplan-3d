import type { ReactNode } from "react";
import Link from "next/link";
import { T } from "@/ui/tokens";

// globals.css pins `body { overflow: hidden; height: 100% }` for the 3D app's
// benefit (a fixed-size WebGL canvas). Legal pages are long-form text, so this
// layout opens its own full-viewport scroll region instead of touching that
// global rule (which src/viewport3d/Viewport.tsx and friends depend on).
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflowY: "auto",
        background: T.bg,
        color: T.text,
        fontFamily: T.font,
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "56px 24px 96px" }}>
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 40,
            fontSize: 13,
            color: T.textDim,
          }}
        >
          <Link href="/" style={{ color: T.textDim, textDecoration: "none" }}>
            ← Floorplan → 3D
          </Link>
          <span style={{ color: T.textFaint }}>·</span>
          <Link href="/legal/privacy" style={{ color: T.text, textDecoration: "none" }}>
            Privacy Policy
          </Link>
          <Link href="/legal/terms" style={{ color: T.text, textDecoration: "none" }}>
            Terms of Service
          </Link>
        </nav>
        {children}
      </div>
    </div>
  );
}
