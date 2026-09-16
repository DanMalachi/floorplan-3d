import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { alternatesFor } from "@/i18n/alternates";
import { TermsHe } from "@/legal/content/terms.he";
import { TermsEn } from "@/legal/content/terms.en";

// The text lives in src/legal/content — terms.he.tsx binds, terms.en.tsx is its
// translation. This page only picks one.

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const he = (await params).locale === "he";
  return {
    title: he ? "תנאי שימוש · done." : "Terms of Service · done.",
    description: he ? "התנאים לשימוש ב-done." : "The terms governing use of done.",
    alternates: alternatesFor("/legal/terms"),
  };
}

export default async function TermsOfServicePage({ params }: { params: Promise<{ locale: string }> }) {
  // Pinning the locale keeps the page prerendered (its <Link>s read it).
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return locale === "he" ? <TermsHe /> : <TermsEn />;
}
