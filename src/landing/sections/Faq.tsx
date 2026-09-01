import { B, type as ty, section, microLabel } from "@/brand/tokens";
import { FAQ, FAQ_INTRO } from "../content";

/**
 * Accessible accordion built on native `<details>`/`<summary>` — keyboard
 * operation, the disclosure semantics, and the browser's own marker all come
 * free, so nothing here reaches for custom ARIA.
 *
 * `limit` renders only the first N questions (used for the homepage teaser);
 * omit it to render the full set (a dedicated FAQ page).
 */
export function Faq({ limit }: { limit?: number }) {
  const items = typeof limit === "number" ? FAQ.slice(0, limit) : FAQ;

  return (
    <section style={section()}>
      <div style={microLabel()}>{FAQ_INTRO.eyebrow}</div>
      <h2
        style={{
          margin: "10px 0 32px",
          maxWidth: B.maxWidthText,
          fontFamily: B.fontDisplay,
          fontWeight: 800,
          fontSize: ty.h2,
          letterSpacing: "-0.01em",
          color: B.ink,
        }}
      >
        {FAQ_INTRO.title}
      </h2>

      <div style={{ borderTop: `1px solid ${B.hairline}` }}>
        {items.map((item) => (
          <details key={item.q} style={{ borderBottom: `1px solid ${B.hairline}`, padding: "18px 0" }}>
            <summary
              style={{
                cursor: "pointer",
                fontFamily: B.fontUi,
                fontWeight: 700,
                fontSize: ty.body,
                color: B.ink,
              }}
            >
              {item.q}
            </summary>
            <p
              style={{
                margin: "12px 0 0",
                maxWidth: B.maxWidthText,
                fontFamily: B.fontUi,
                fontSize: ty.body,
                lineHeight: 1.65,
                color: B.ink2,
              }}
            >
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
