// The shape of the marketing page's written content, and the switch that picks
// a language. The copy itself lives in `content.en.tsx` and `content.he.tsx`.
//
// ── Why per-locale modules and not message keys ─────────────────────────────
// The rest of this app's UI strings go in `messages/*.json`, and for nav items,
// buttons and column headings that is right: they are short, structural, and
// the same shape in every language.
//
// This copy is not that. Three things make a string table the wrong container
// for it, and they are the same three reasons `docs/HEBREW-HANDOFF.md` already
// gives for keeping the legal pages out of the catalogue:
//
//   1. **The structure is part of the translation.** The hero headline is two
//      lines with the second set in a serif, and where Hebrew breaks the line
//      is a decision about Hebrew word order, not a constant to be filled in.
//      A flat key can hold the words; it cannot hold that choice.
//   2. **The rationale has to live beside the copy.** Every line below is
//      constrained — a voice with a banned-word list, an honesty rule that
//      forbids implying the app understands a plan by itself, and a per-answer
//      citation of the code that makes the answer true. JSON cannot hold a
//      comment, so moving these strings into it would strand the reasoning that
//      keeps the next edit honest.
//   3. **Completeness is enforced for free.** Both modules satisfy
//      `LandingContent`, so a string missing from Hebrew is a compile error
//      rather than a silent fall-through to English discovered on the page.
//      That is a stronger guarantee than the pseudo-locale sweep planned for
//      the editor's catalogue, and it costs nothing to have.
//
// The line to hold, so this does not become two answers to one question:
// **voice-bearing copy lives here; chrome labels live in `messages/*.json`.**
//
// ── Why the copy is `ReactNode` and not `string` ───────────────────────────
// The product name keeps its Latin `done.` in the Hebrew build (Dan's call), and
// inside an RTL line the bidi algorithm resolves that trailing full stop to the
// paragraph direction — so the copy renders `.done` unless the name is wrapped
// in an isolate. That wrapper is a component, so any sentence containing the
// name is a node rather than a string. Everything else stays plain text and
// reads exactly as it did.

import type { ReactNode } from "react";
import { defaultLocale, type Locale } from "@/i18n/routing";
import { EN } from "./content.en";
import { HE } from "./content.he";

/**
 * One question and its answer.
 *
 * `id` exists so the accordion has a React key that is not the copy. Keying on
 * the question text meant the key changed with the language — and with every
 * rewording — which is exactly the churn a key is supposed to absorb. The ids
 * are shared by both locales, so the two tables cannot silently drift out of
 * alignment either.
 */
export interface FaqItem {
  id: string;
  q: ReactNode;
  a: ReactNode;
}

export interface LandingContent {
  /**
   * The primary call to action, in ONE place because it is one button.
   *
   * It appears six times — header bar, header sheet, hero, over the finished
   * hero room, the closing band, the footer, and again on /about and /faq — and
   * it read "Open done." at every one of them. Six copies of a string is six
   * chances for five of them to be updated. If a surface ever needs its own
   * wording, it gets its own key then; today they are the same promise and
   * should stay spelled the same way.
   */
  openApp: ReactNode;
  hero: {
    /** The headline, two lines. `serif` is set in the copper italic. */
    headline: { sans: ReactNode; serif: ReactNode };
    subhead: ReactNode;
    note: ReactNode;
    /** Points down at the demo section, which plays when it scrolls in. */
    scrollCue: ReactNode;
  };
  /** The section under the hero where the draw-then-build demo plays. */
  demo: {
    eyebrow: ReactNode;
    title: ReactNode;
  };
  howItWorks: {
    eyebrow: ReactNode;
    title: ReactNode;
    steps: { n: string; title: ReactNode; body: ReactNode }[];
  };
  different: {
    eyebrow: ReactNode;
    title: ReactNode;
    intro: ReactNode;
    points: { id: string; title: ReactNode; body: ReactNode }[];
  };
  faqIntro: { eyebrow: ReactNode; title: ReactNode };
  faq: FaqItem[];
  /** The dedicated /faq page's own framing. The Q&A table itself is `faq`
   *  above — the page renders every entry, the homepage renders the first few,
   *  and neither owns the questions. */
  faqPage: { eyebrow: ReactNode; title: ReactNode; aboutLink: ReactNode };
  ctaBand: {
    title: ReactNode;
    subhead: ReactNode;
    ctaGhostLabel: ReactNode;
  };
  footer: { tagline: ReactNode };
}

const BY_LOCALE: Record<Locale, LandingContent> = { en: EN, he: HE };

/**
 * The copy for a locale.
 *
 * Deliberately a plain synchronous function of the locale, so the SAME call
 * works in a server section and in the client-side hero — no hook, no provider,
 * no request read. Server sections take the locale as a prop from their page
 * (which already has it in `params`, the form `src/i18n/README-static.md`
 * insists on because it stays static); client ones read `useLocale()`.
 *
 * An unknown locale falls back to English rather than throwing: this renders the
 * marketing page, and a half-configured locale should cost a visitor the
 * translation, not the site.
 */
export function landingContent(locale: string): LandingContent {
  return BY_LOCALE[locale as Locale] ?? BY_LOCALE[defaultLocale];
}
