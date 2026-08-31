import { B, type as ty, section, microLabel } from "@/brand/tokens";
import { DIFFERENT } from "../content";

/**
 * The positioning section: why drawing your own walls first — the one
 * honest, manual step — is what makes everything downstream (a sofa that
 * fits, paint you can buy, a walkthrough that's actually your home) true
 * rather than a guess. Copy lives in content.ts; this file only lays it out.
 */
export function Different() {
  return (
    <section style={section()}>
      <div style={microLabel()}>{DIFFERENT.eyebrow}</div>
      <h2
        style={{
          margin: "10px 0 16px",
          maxWidth: B.maxWidthText,
          fontFamily: B.fontDisplay,
          fontWeight: 800,
          fontSize: ty.h2,
          letterSpacing: "-0.01em",
          color: B.ink,
        }}
      >
        {DIFFERENT.title}
      </h2>
      <p
        style={{
          margin: "0 0 48px",
          maxWidth: B.maxWidthText,
          fontFamily: B.fontUi,
          fontSize: ty.lead,
          lineHeight: 1.6,
          color: B.ink2,
        }}
      >
        {DIFFERENT.intro}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "32px 28px",
        }}
      >
        {DIFFERENT.points.map((p) => (
          <div key={p.title} style={{ borderTop: `1px solid ${B.hairline}`, paddingTop: 18 }}>
            <h3
              style={{
                margin: "0 0 8px",
                fontFamily: B.fontUi,
                fontWeight: 700,
                fontSize: ty.h3,
                color: B.ink,
              }}
            >
              {p.title}
            </h3>
            <p
              style={{
                margin: 0,
                fontFamily: B.fontUi,
                fontSize: ty.body,
                lineHeight: 1.6,
                color: B.ink2,
              }}
            >
              {p.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
