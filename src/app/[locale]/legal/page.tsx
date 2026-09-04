import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

// /legal is a section, not a page — but people type it, and link to it, and a
// bare 404 there reads as "the legal pages are broken". Send it to the policy,
// in the locale the visitor is already reading.
//
// The locale comes from `params`, never `getLocale()`: reading it off the route
// keeps this a prerendered redirect, while asking for the request locale would
// make it read headers. See src/i18n/README-static.md.
export default async function LegalIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  redirect({ href: "/legal/privacy", locale: locale as Locale });
}
