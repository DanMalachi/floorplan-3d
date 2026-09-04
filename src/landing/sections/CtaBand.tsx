import Link from "next/link";
import { B, type as ty, section, ctaPrimary, ctaGhost } from "@/brand/tokens";
import { APP_HREF } from "../nav";
import { CTA_CLASS, CTA_GHOST_CLASS } from "../hoverCss";
import { CTA_BAND } from "../content";

/**
 * The closing call to action, on its own band — background one step up from
 * the page ground (`B.canvas`, same convention `section()` is named for) so
 * it reads as a stop rather than another paragraph.
 */
export function CtaBand() {
  return (
    <section style={{ background: B.canvas, borderTop: `1px solid ${B.hairline}` }}>
      <div
        style={{
          ...section(),
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 18,
        }}
      >
        <h2
          style={{
            margin: 0,
            maxWidth: B.maxWidthText,
            fontFamily: B.fontDisplay,
            fontWeight: 800,
            fontSize: ty.h1,
            letterSpacing: "-0.015em",
            color: B.ink,
          }}
        >
          {CTA_BAND.title}
        </h2>
        <p
          style={{
            margin: 0,
            maxWidth: B.maxWidthText,
            fontFamily: B.fontUi,
            fontSize: ty.lead,
            lineHeight: 1.6,
            color: B.ink2,
          }}
        >
          {CTA_BAND.subhead}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center", marginTop: 8 }}>
          <Link href={APP_HREF} className={CTA_CLASS} style={ctaPrimary()}>
            {CTA_BAND.ctaPrimaryLabel}
          </Link>
          <Link href="/faq" className={CTA_GHOST_CLASS} style={ctaGhost()}>
            {CTA_BAND.ctaGhostLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}
