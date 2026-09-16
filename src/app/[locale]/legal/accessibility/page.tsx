import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { alternatesFor } from "@/i18n/alternates";
import { AccessibilityHe } from "@/legal/content/accessibility.he";
import { AccessibilityEn } from "@/legal/content/accessibility.en";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const he = (await params).locale === "he";
  return {
    title: he ? "הצהרת נגישות · done." : "Accessibility Statement · done.",
    description: he
      ? "רמת הנגישות של done., מה עדיין לא נגיש ואיך לפנות אלינו."
      : "How accessible done. is, what is not yet, and how to reach us.",
    alternates: alternatesFor("/legal/accessibility"),
  };
}

export default async function AccessibilityPage({ params }: { params: Promise<{ locale: string }> }) {
  // Pin the locale so the page stays prerendered. See src/i18n/README-static.md.
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return locale === "he" ? <AccessibilityHe /> : <AccessibilityEn />;
}
