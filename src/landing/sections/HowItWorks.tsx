import { B, type as ty, section, microLabel, card } from "@/brand/tokens";
import { landingContent } from "../content";

/**
 * Three numbered steps. `id="how"` is the anchor the hero's ghost CTA points
 * at ("See how it works").
 *
 * Step numbers stay in the muted micro-label ink, not the accent colour —
 * `src/brand/tokens.ts` reserves copper for exactly two things (the
 * wordmark's period and CTA fills), and a third accent object anywhere on
 * the page is the thing that rule explicitly warns against.
 */
export function HowItWorks({ locale }: { locale: string }) {
  const { howItWorks } = landingContent(locale);
  return (
    <section id="how" style={section()}>
      <div style={microLabel()}>{howItWorks.eyebrow}</div>
      <h2
        style={{
          margin: "10px 0 40px",
          maxWidth: B.maxWidthText,
          fontFamily: B.fontDisplay,
          fontWeight: 800,
          fontSize: ty.h2,
          letterSpacing: "-0.01em",
          color: B.ink,
        }}
      >
        {howItWorks.title}
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 24,
        }}
      >
        {howItWorks.steps.map((s) => (
          <div key={s.n} style={card()}>
            <div style={microLabel({ marginBottom: 16 })}>{s.n}</div>
            <h3
              style={{
                margin: "0 0 8px",
                fontFamily: B.fontUi,
                fontWeight: 700,
                fontSize: ty.h3,
                color: B.ink,
              }}
            >
              {s.title}
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
              {s.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
