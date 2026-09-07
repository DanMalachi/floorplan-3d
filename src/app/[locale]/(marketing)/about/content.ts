// The About page's copy, per locale. Same bargain as src/landing/content.ts —
// read the long note at the top of that file for why voice-bearing copy lives
// in typed modules rather than in `messages/*.json` — with one addition that
// applies only to long-form pages:
//
// A page of running prose must be free to have DIFFERENT paragraph breaks in
// each language. Keying it per paragraph would freeze English's structure into
// the contract, so merging two sentences in Hebrew would mean migrating keys.
// Here `body` is one node per locale, and each language shapes its own argument.

import type { ReactNode } from "react";
import { defaultLocale, type Locale } from "@/i18n/routing";
import { ABOUT_EN } from "./content.en";
import { ABOUT_HE } from "./content.he";

export interface AboutContent {
  eyebrow: ReactNode;
  title: ReactNode;
  /** The whole article, headings and paragraphs together. */
  body: ReactNode;
  /** Label on the secondary link out to /faq. */
  faqLink: ReactNode;
}

const BY_LOCALE: Record<Locale, AboutContent> = { en: ABOUT_EN, he: ABOUT_HE };

export function aboutContent(locale: string): AboutContent {
  return BY_LOCALE[locale as Locale] ?? BY_LOCALE[defaultLocale];
}
