"use client";

import type React from "react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { B, type as ty, section, ctaPrimary, ctaGhost } from "@/brand/tokens";
import { Wordmark } from "@/brand/Wordmark";
import { APP_HREF } from "../nav";
import { HERO, SLOGANS } from "../content";

// How long a line holds before the crossfade to the next one starts, and how
// long the crossfade itself takes. Both slower than the app's own 180ms
// chrome on purpose — marketing motion that snaps reads as urgent, and
// "confidence sounds like a low voice" (src/brand/tokens.ts) applies to
// motion as much as it applies to copy.
const DWELL_MS = 3400;
const FADE_MS = 420;

/**
 * One of the two slogan slots that bracket the wordmark. Shared so the lead
 * and tail crossfade as a single object rather than two lines that happen to
 * animate together.
 *
 * The heights differ on purpose: a `lead` is short by construction (it runs
 * INTO the mark), while a `tail` is a full clause and wraps to two lines on a
 * narrow screen, so it reserves more room. Both are in `em`, so they track the
 * clamped display size instead of needing a breakpoint.
 */
const slotStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: "0 8px",
  fontFamily: B.fontDisplay,
  fontSize: ty.h1,
  fontWeight: 600,
  letterSpacing: "-0.01em",
  color: B.ink2,
  transition: `opacity ${FADE_MS}ms ${B.ease}`,
};

/**
 * The hero.
 *
 * A fixed `done.` wordmark with a rotating slogan underneath it — together
 * they read as one sentence ("done. before you start.", "done. with a sofa
 * that fits.", ...; the full set is content.ts's SLOGANS) — a subhead that
 * states the actual mechanic in plain terms, and the two calls to action.
 *
 * `demo` is the 3D room. It is owned and rendered by another component; this
 * file only reserves its slot, sized so the layout doesn't jump once it
 * mounts.
 *
 * The rotation is a plain opacity crossfade driven by two setTimeouts, not a
 * library. It freezes on the first line — the primary lockup — when the OS
 * requests reduced motion, and never during, only checked once per timer
 * cycle so a mid-session preference change is honoured within one dwell.
 */
export function Hero({ demo }: { demo?: React.ReactNode }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const reducedRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    const onChange = () => {
      reducedRef.current = mq.matches;
    };
    mq.addEventListener("change", onChange);

    if (mq.matches) {
      return () => mq.removeEventListener("change", onChange);
    }

    let cancelled = false;
    let dwellTimer: ReturnType<typeof setTimeout>;
    let fadeTimer: ReturnType<typeof setTimeout>;

    const schedule = () => {
      dwellTimer = setTimeout(() => {
        if (cancelled || reducedRef.current) return;
        setVisible(false); // start the fade-out; the line swaps once it's invisible
        fadeTimer = setTimeout(() => {
          if (cancelled) return;
          setIndex((i) => (i + 1) % SLOGANS.length);
          setVisible(true);
          schedule();
        }, FADE_MS);
      }, DWELL_MS);
    };
    schedule();

    return () => {
      cancelled = true;
      clearTimeout(dwellTimer);
      clearTimeout(fadeTimer);
      mq.removeEventListener("change", onChange);
    };
  }, []);

  return (
    <section
      style={{
        ...section(),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: "clamp(20px, 3vw, 32px)",
      }}
    >
      <h1 style={{ margin: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* Both slots hold a fixed min-height (in em, so they scale with the
            clamp()) whether or not the current line fills them. That is what
            keeps the wordmark pinned to one spot for the whole rotation, and
            stops a shorter or longer line shifting the subhead underneath. */}
        <span
          style={{
            ...slotStyle,
            minHeight: "1.35em",
            marginBottom: "0.06em",
            opacity: visible ? 1 : 0,
          }}
        >
          {SLOGANS[index].lead}
        </span>
        <Wordmark tone="brand" style={{ fontSize: ty.hero }} />
        <span
          style={{
            ...slotStyle,
            minHeight: "2.4em",
            marginTop: "0.15em",
            opacity: visible ? 1 : 0,
          }}
        >
          {SLOGANS[index].tail}
        </span>
      </h1>

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
        {HERO.subhead}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center" }}>
        <Link href={APP_HREF} style={ctaPrimary()}>
          {HERO.ctaPrimaryLabel}
        </Link>
        <Link href="#how" style={ctaGhost()}>
          {HERO.ctaGhostLabel}
        </Link>
      </div>

      <div style={{ fontFamily: B.fontUi, fontSize: ty.small, color: B.ink4 }}>{HERO.note}</div>

      {/* Full-bleed, and deliberately unframed. A border, a radius and a shadow
          would present the room as an application docked inside the page — the
          exact "small window of my app" reading this hero exists to avoid. Edge
          to edge, the render simply becomes the page.

          `100vw` + the negative margin breaks out of this section's centred
          column; the marketing layout sets `overflowX: hidden`, so the extra
          width a scrollbar can introduce is clipped rather than scrollable.

          Height is a viewport clamp rather than an aspect ratio on purpose: a
          16/10 box collapses to a letterbox strip on a phone, which is what
          made the demo feel like a preview thumbnail instead of a room. */}
      {demo && (
        <div
          style={{
            width: "100vw",
            maxWidth: "100vw",
            marginLeft: "calc(50% - 50vw)",
            marginTop: "clamp(28px, 5vw, 60px)",
            // Deliberately NOT full-height. At 68vh the room filled a phone
            // screen edge to edge, which made it read as a wall to get past
            // rather than an object on the page.
            height: "clamp(300px, 52vh, 560px)",
          }}
        >
          {demo}
        </div>
      )}
    </section>
  );
}
