import { Link } from "@/i18n/navigation";
import { B, ctaPrimary, microLabel } from "@/brand/tokens";
import { APP_HREF } from "../nav";
import { CTA_CLASS } from "../hoverCss";
import { landingContent } from "../content";
import { HERO_FONT_VARS } from "../heroFonts";
import { HERO_PLAN_SVG } from "../heroPlanSvg";
import { DEMO_SECTION_ID } from "./DemoSection";

// Approved design: docs/design/hero-2026-09-19 (README + mockup). Read it
// before changing the type, the mask or the plan.

const HERO_CLASS = "done-hero";
const PLAN_CLASS = "done-hero-plan";
const INNER_CLASS = "done-hero-inner";
const COPY_CLASS = "done-hero-copy";
const HL_CLASS = "done-hero-hl";
const SERIF_CLASS = "done-hero-serif";
const CUE_CLASS = "done-hero-cue";

/** The mask that keeps the plan out from under the words: fully clear across
 *  the reading side's first 44%, solid by 84%. Measured against the hero, so
 *  the text column never has linework behind it at any width. */
const fade = (to: "right" | "left") =>
  `linear-gradient(to ${to}, transparent 0%, transparent 44%, rgba(0,0,0,.22) 56%, rgba(0,0,0,.7) 70%, #000 84%)`;

/* Inline styles cannot reach media queries or `:lang`, and this repo styles
   with inline objects — so the rules that need them live here, the same
   bargain DemoStage's STAGE_CSS makes. */
const HERO_CSS = `
.${HERO_CLASS} {
  --hero-sans: var(--font-archivo), ${B.fontUi};
  --hero-serif: var(--font-newsreader), Georgia, serif;
  --hero-heavy: 800;
  --hero-track: -0.03em;
  --hero-serif-weight: 500;
  --hero-serif-scale: 1.08;
}
html[lang="he"] .${HERO_CLASS} {
  --hero-sans: var(--font-heebo), ${B.fontUi};
  --hero-serif: var(--font-bona-nova), serif;
  --hero-heavy: 900;
  --hero-track: -0.02em;
  --hero-serif-weight: 700;
  --hero-serif-scale: 1;
}
.${PLAN_CLASS} {
  position: absolute;
  /* Taller than the hero, as in the mockup, so the drawing is large enough to
     reach past the mask; the section clips what overhangs. */
  top: -120px;
  bottom: -60px;
  inset-inline-start: 0;
  inset-inline-end: -6%;
  color: ${B.ink};
  pointer-events: none;
  -webkit-mask-image: ${fade("right")};
          mask-image: ${fade("right")};
}
[dir="rtl"] .${PLAN_CLASS} {
  -webkit-mask-image: ${fade("left")};
          mask-image: ${fade("left")};
}
.${PLAN_CLASS} svg { display: block; width: 100%; height: 100%; font-family: ${B.fontMono}; }
.${INNER_CLASS} {
  position: relative;
  max-width: ${B.maxWidthWide}px;
  margin: 0 auto;
  min-height: clamp(470px, 60vw, 640px);
  padding: 20px ${B.gutter}px 56px;
  box-sizing: border-box;
  display: grid;
  align-items: center;
}
.${COPY_CLASS} { max-width: min(640px, 58%); }
.${HL_CLASS} {
  font-family: var(--hero-sans);
  font-weight: var(--hero-heavy);
  font-size: clamp(44px, 7.2vw, 104px);
  line-height: 0.98;
  letter-spacing: var(--hero-track);
}
.${HL_CLASS} > span { display: block; white-space: nowrap; }
/* Hebrew has no capitals and loses its word shapes when tracked, so the cue is
   set in the hero sans without the micro-label tracking (as in the mockup).
   !important because the micro-label base arrives as an inline style. */
html[lang="he"] .${CUE_CLASS} { font-family: var(--hero-sans) !important; font-size: 12.5px !important; letter-spacing: 0.02em !important; }
.${SERIF_CLASS} {
  font-family: var(--hero-serif);
  font-style: italic;
  font-weight: var(--hero-serif-weight);
  font-size: calc(1em * var(--hero-serif-scale));
  letter-spacing: -0.005em;
  line-height: 1.02;
  color: ${B.accent};
}

/* Phone: the words take the full width and the plan drops underneath them —
   into padding reserved for it, so no linework runs behind the copy however
   long the Hebrew or English wraps. */
@media (max-width: 720px) {
  .${INNER_CLASS} { align-items: start; min-height: 0; padding-top: 12px; padding-bottom: 250px; }
  .${COPY_CLASS} { max-width: 100%; }
  .${HL_CLASS} { font-size: min(46px, 11.4vw); }
  .${PLAN_CLASS} {
    top: auto;
    bottom: -30px;
    height: 300px;
    inset-inline-start: -30%;
    inset-inline-end: -30%;
    -webkit-mask-image: linear-gradient(to top, #000 0%, #000 25%, transparent 80%);
            mask-image: linear-gradient(to top, #000 0%, #000 25%, transparent 80%);
  }
}
`;

/**
 * The hero: "it starts with / the plan." over a drawn floorplan.
 *
 * Static on purpose. The rotating slogans it replaced never stopped, which
 * fails WCAG 2.2.2, and the "see how it's done." button went with them: the
 * draw-then-build demo now has its own section below (DemoSection.tsx), which
 * plays when it is scrolled to and can always be skipped.
 *
 * A server component: nothing here moves, so none of it ships as JavaScript.
 * The plan is inlined markup (src/landing/heroPlanSvg.ts, generated), so its
 * lines take the theme's ink through `currentColor` and its labels render in the
 * page's own mono face.
 */
export function Hero({ locale }: { locale: string }) {
  const { hero, openApp } = landingContent(locale);
  const planSvg = locale === "he" ? HERO_PLAN_SVG.he : HERO_PLAN_SVG.en;

  return (
    <section
      className={`${HERO_CLASS} ${HERO_FONT_VARS}`}
      style={{ position: "relative", width: "100%", overflow: "hidden" }}
    >
      <style dangerouslySetInnerHTML={{ __html: HERO_CSS }} />
      <div className={PLAN_CLASS} aria-hidden="true" dangerouslySetInnerHTML={{ __html: planSvg }} />

      <div className={INNER_CLASS}>
        <div
          className={COPY_CLASS}
          style={{ display: "grid", gap: "clamp(18px, 2.4vw, 28px)", justifyItems: "start" }}
        >
          <h1
            className={HL_CLASS}
            style={{ margin: 0, color: B.ink }}
          >
            <span>{hero.headline.sans}</span>{" "}
            <span className={SERIF_CLASS}>{hero.headline.serif}</span>
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: "46ch",
              fontFamily: "var(--hero-sans)",
              fontSize: "clamp(16px, 1.55vw, 18.5px)",
              lineHeight: 1.6,
              color: B.ink2,
            }}
          >
            {hero.subhead}
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
            <Link
              href={APP_HREF}
              className={CTA_CLASS}
              style={ctaPrimary({ padding: "15px 26px", fontSize: 16.5, fontFamily: "var(--hero-sans)" })}
            >
              {openApp}
            </Link>
            <span style={{ fontFamily: "var(--hero-sans)", fontSize: 14, color: B.label }}>{hero.note}</span>
          </div>

          <a
            href={`#${DEMO_SECTION_ID}`}
            className={CUE_CLASS}
            style={microLabel({
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              minHeight: 24,
            })}
          >
            <span aria-hidden="true">↓</span>
            {hero.scrollCue}
          </a>
        </div>
      </div>
    </section>
  );
}
