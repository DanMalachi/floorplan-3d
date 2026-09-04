"use client";

import type React from "react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { B, type as ty, section, ctaPrimary, ctaGhost } from "@/brand/tokens";
import { Wordmark } from "@/brand/Wordmark";
import { APP_HREF } from "../nav";
import { CTA_CLASS } from "../hoverCss";
import { HERO, SLOGANS } from "../content";
import {
  advanceHeroStage,
  getHeroStage,
  getHeroStageServer,
  resetHeroStage,
  subscribeHeroStage,
} from "../heroSequence";

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

const TRACE_BTN_CLASS = "done-hero-trace-btn";

/* Inline styles cannot reach `:hover` or `:focus-visible`, and this repo styles
   with inline objects — so the one rule the button needs that they can't
   express lives here, the same bargain DemoStage's STAGE_CSS makes. */
const TRACE_BTN_CSS = `
.${TRACE_BTN_CLASS}:hover { border-color: ${B.hairline2}; background: ${B.canvas}; }
.${TRACE_BTN_CLASS}:focus-visible { outline: 2px solid ${B.accent}; outline-offset: 3px; }
`;

/** What a screen reader is told as the sequence moves. */
const STAGE_ANNOUNCEMENT: Record<string, string> = {
  idle: "",
  tracing: "Drawing the floorplan: walls, then windows and doors.",
  building: "Generating the three-dimensional model.",
  done: "The room is built. Open done. to draw your own.",
};

/** Signals that this button PLAYS something rather than navigating. */
function IconPlay() {
  return (
    <svg width="13" height="14" viewBox="0 0 13 14" fill="none" aria-hidden="true">
      <path d="M2 1.6 11 7 2 12.4z" fill="currentColor" />
    </svg>
  );
}

/** Skip to the end — the escape hatch a long animation owes its viewer. */
function IconSkip() {
  return (
    <svg width="13" height="14" viewBox="0 0 13 14" fill="none" aria-hidden="true">
      <path d="M1.5 1.8 9 7l-7.5 5.2z" fill="currentColor" />
      <path d="M11.2 1.8v10.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

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

  // Which stage of the opening sequence is on screen. Held in a module
  // singleton because the animation it drives lives inside the `demo` slot,
  // which reaches this component as an opaque ReactNode — there is no prop
  // path between the two, and giving it one would mean importing the 3D half.
  const stage = useSyncExternalStore(subscribeHeroStage, getHeroStage, getHeroStageServer);
  const running = stage === "tracing" || stage === "building";
  const label = running
    ? HERO.ctaGhostLabelRunning
    : stage === "done"
      ? HERO.ctaGhostLabelDone
      : HERO.ctaGhostLabel;

  // A client-side navigation back to the homepage must not inherit a finished
  // sequence — the hero would open on a built room with no story behind it.
  useEffect(() => resetHeroStage(), []);

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
        position: "relative", // anchors the visually-hidden live region below
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

      <style dangerouslySetInnerHTML={{ __html: TRACE_BTN_CSS }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center", alignItems: "center" }}>
        <Link href={APP_HREF} className={CTA_CLASS} style={ctaPrimary({ padding: "15px 26px", fontSize: 16.5 })}>
          {HERO.ctaPrimaryLabel}
        </Link>
        {/* Not a link. It plays the hero's own animation in place — see
            ../heroSequence.ts for why the two ends talk through a module
            singleton rather than a prop. Deliberately the same size as the
            primary and NOT copper: the brand allows exactly two copper objects
            on the page (brand/tokens.ts), and a third would break the identity
            rule. What makes it inviting instead is the fill, the play glyph and
            the size — it looks like something that runs, not somewhere to go. */}
        <button
          type="button"
          className={TRACE_BTN_CLASS}
          onClick={advanceHeroStage}
          style={ctaGhost({
            padding: "15px 26px",
            fontSize: 16.5,
            background: B.raised,
            gap: 11,
          })}
        >
          {running ? <IconSkip /> : <IconPlay />}
          {label}
        </button>
      </div>

      {/* A thirteen-second animation with no text has to say what it is doing
          to anyone not watching it. Polite, so it never interrupts. */}
      <div
        aria-live="polite"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          clipPath: "inset(50%)",
          whiteSpace: "nowrap",
        }}
      >
        {STAGE_ANNOUNCEMENT[stage]}
      </div>

      <div style={{ fontFamily: B.fontUi, fontSize: ty.small, color: B.ink4 }}>{HERO.note}</div>

      {/* Deliberately unframed. A border, a radius and a shadow would present
          the room as an application docked inside the page — the exact "small
          window of my app" reading this hero exists to avoid. The canvas's own
          edges are masked to transparent instead (DemoStage.tsx), so it
          dissolves into the page wherever it stops and needs no frame and no
          full-bleed breakout to avoid looking like a box. */}
      {demo && (
        <div
          style={{
            // The FRAME column (`B.maxWidthWide`), not a 100vw breakout and not
            // an arbitrary width of its own. The header, the footer and this
            // demo are the three things that span it, and they have to agree:
            // at 1400 against a 1120 header, the nav's CTA sat visibly inset
            // from the control panel directly beneath it.
            //
            // Wider than the reading column because two columns need the room,
            // narrower than full-bleed because a card pushed against the
            // viewport edge has nothing holding it.
            //
            // This used to add `left: 50%` + `translateX(-50%)` to centre an
            // element wider than its parent. That is the right trick under a
            // BLOCK parent, where the element's static position is the parent's
            // left content edge — but this section is a flex column with
            // `align-items: center`, which has already centred it. The two
            // centrings compounded, and the demo sat
            // (elementWidth - parentWidth) / 2 too far left: 102px at a 1325px
            // viewport, far enough that the stage's left edge landed at x = -86
            // and the room was clipped by the layout's `overflowX: hidden`.
            //
            // So: no offset. The flex parent centres it, and the width still
            // subtracts both gutters so it never actually overflows. If this
            // section ever stops being a centred flex container, the old trick
            // becomes correct again — check the parent before re-adding it.
            position: "relative",
            width: `min(${B.maxWidthWide}px, calc(100vw - ${B.gutter * 2}px))`,
            marginTop: "clamp(28px, 5vw, 60px)",
            // Deliberately NO height. The demo sizes itself to the taller of
            // the room and the control card (DemoStage's STAGE_CSS); imposing
            // one here is what clipped the card's last row, because any single
            // value is right at one window size and short at another.
          }}
        >
          {demo}
        </div>
      )}
    </section>
  );
}
