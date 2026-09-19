import type React from "react";
import { B, type as ty, section, microLabel } from "@/brand/tokens";
import { landingContent } from "../content";

/** The hero's scroll cue links here. */
export const DEMO_SECTION_ID = "watch";

/**
 * The draw-then-build demo, in its own section under the hero (2026-09-19).
 *
 * It used to live inside the hero behind a "see how it's done." button. Now it
 * plays by itself once it scrolls into view, exactly once (DemoRoom.tsx), shows
 * "Skip to the room" for as long as it moves (DemoStage.tsx, WCAG 2.2.2), and
 * offers "Watch it again" when it is finished.
 *
 * `demo` is the 3D room, passed in by the page rather than imported here, so
 * this stays a server component and the heavy half stays behind DemoRoom's
 * dynamic import.
 */
export function DemoSection({ locale, demo }: { locale: string; demo: React.ReactNode }) {
  const c = landingContent(locale).demo;
  return (
    <section
      id={DEMO_SECTION_ID}
      aria-labelledby={`${DEMO_SECTION_ID}-title`}
      style={section({
        maxWidth: B.maxWidthWide,
        paddingTop: "clamp(40px, 6vw, 72px)",
        paddingBottom: "clamp(40px, 6vw, 72px)",
        scrollMarginTop: 72,
      })}
    >
      <div style={microLabel()}>{c.eyebrow}</div>
      <h2
        id={`${DEMO_SECTION_ID}-title`}
        style={{
          margin: "10px 0 clamp(20px, 3vw, 32px)",
          maxWidth: B.maxWidthText,
          fontFamily: B.fontDisplay,
          fontWeight: 800,
          fontSize: ty.h2,
          letterSpacing: "-0.01em",
          color: B.ink,
        }}
      >
        {c.title}
      </h2>
      {demo}
    </section>
  );
}
