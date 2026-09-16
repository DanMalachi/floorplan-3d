import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { alternatesFor } from "@/i18n/alternates";
import { PrivacyHe } from "@/legal/content/privacy.he";
import { PrivacyEn } from "@/legal/content/privacy.en";

// The text lives in src/legal/content — privacy.he.tsx is the binding version,
// privacy.en.tsx its translation. This page only picks one.

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const he = (await params).locale === "he";
  return {
    title: he ? "מדיניות פרטיות · done." : "Privacy Policy · done.",
    description: he
      ? "איזה מידע done. אוסף, היכן הוא נשמר ולמי הוא מועבר."
      : "How done. collects, stores, and shares data.",
    alternates: alternatesFor("/legal/privacy"),
  };
}

export default async function PrivacyPolicyPage({ params }: { params: Promise<{ locale: string }> }) {
  // Every layout and page under [locale] pins the request locale, or a
  // prerendered page flips to dynamic at runtime. See src/i18n/README-static.md.
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return locale === "he" ? <PrivacyHe /> : <PrivacyEn />;
}
