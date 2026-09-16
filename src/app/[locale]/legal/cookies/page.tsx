import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { alternatesFor } from "@/i18n/alternates";
import { CookiesPolicy } from "@/legal/content/cookies";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const he = (await params).locale === "he";
  return {
    title: he ? "מדיניות עוגיות · done." : "Cookie Policy · done.",
    description: he
      ? "העוגיות והאחסון המקומי ש-done. משתמש בהם, ולמה."
      : "The cookies and local storage done. uses, and why.",
    alternates: alternatesFor("/legal/cookies"),
  };
}

export default async function CookiePolicyPage({ params }: { params: Promise<{ locale: string }> }) {
  // Pin the locale so the page stays prerendered. See src/i18n/README-static.md.
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <CookiesPolicy lang={locale === "he" ? "he" : "en"} />;
}
