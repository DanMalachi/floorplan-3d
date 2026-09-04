import type { Metadata } from "next";
import Link from "next/link";
import { B, type as ty, ctaPrimary, microLabel } from "@/brand/tokens";
import { Faq } from "@/landing/sections/Faq";
import { APP_HREF } from "@/landing/nav";
import { CTA_CLASS, CTA_GHOST_CLASS } from "@/landing/hoverCss";

export const metadata: Metadata = {
  title: "Questions — done.",
  description:
    "What you need to start, what happens to your data, and what done. does and does not do yet.",
};

// The homepage renders a short set (<Faq limit={...} />); this page renders all
// of them, from the same table in src/landing/content.ts, so the two can never
// drift apart.

export default function FaqPage() {
  return (
    <div
      style={{
        maxWidth: B.maxWidthText,
        margin: "0 auto",
        padding: `clamp(56px, 9vw, 104px) ${B.gutter}px clamp(72px, 10vw, 120px)`,
      }}
    >
      <div style={microLabel()}>Questions</div>
      <h1
        style={{
          fontSize: ty.h1,
          fontWeight: 800,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          margin: "14px 0 32px",
          color: B.ink,
        }}
      >
        Everything worth asking first.
      </h1>

      <Faq />

      <div style={{ marginTop: 48, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href={APP_HREF} className={CTA_CLASS} style={ctaPrimary()}>
          Open done.
        </Link>
        <Link
          href="/about"
          className={CTA_GHOST_CLASS}
          style={{
            ...ctaPrimary({ background: "transparent", color: B.ink }),
            border: `1px solid ${B.hairline2}`,
          }}
        >
          What done. is
        </Link>
      </div>
    </div>
  );
}
