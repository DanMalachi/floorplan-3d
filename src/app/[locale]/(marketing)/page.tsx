import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { alternatesFor } from "@/i18n/alternates";
import { B } from "@/brand/tokens";
import { Hero } from "@/landing/sections/Hero";
import { DemoSection } from "@/landing/sections/DemoSection";
import { HowItWorks } from "@/landing/sections/HowItWorks";
import { Different } from "@/landing/sections/Different";
import { Faq } from "@/landing/sections/Faq";
import { CtaBand } from "@/landing/sections/CtaBand";
import { DemoRoom } from "@/landing/DemoRoom";

// A static `metadata` export here would win over the translated `meta.title`
// from `[locale]/layout.tsx`, so `/he` would still serve the English title —
// see src/i18n/README-static.md's sibling note in docs/HEBREW-HANDOFF.md
// (Step 3). `alternatesFor` still has to be threaded through by hand: it is
// per-page, not something `generateMetadata` inherits.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    title: t("home.title"),
    description: t("home.description"),
    alternates: alternatesFor("/"),
  };
}

/**
 * The homepage.
 *
 * The flag gate lives in the layout (src/app/(marketing)/layout.tsx), which
 * redirects every marketing route to /design while the site is unlaunched — so
 * there is nothing to check here.
 *
 * The 3D room is passed INTO its section rather than imported by it: the
 * section only reserves the slot, which keeps the heaviest thing on the page
 * swappable from one line here.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  // Every layout and page under [locale] pins the request locale. Without it,
  // next-intl falls back to reading the locale out of a request HEADER, and a
  // page that Next prerendered as static then throws "changed from static to
  // dynamic at runtime" the first time it is served — which took out every
  // unprefixed English route while only the Hebrew ones kept working, because
  // those carry the locale in the URL. See src/i18n/README-static.md.
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  return (
    <>
      <Hero locale={locale} />

      {/* A ground change is the only separator between sections — no rules, no
          dividers. Quiet is an attribute the brand actually commits to. */}
      <div style={{ background: B.canvas }}>
        <DemoSection locale={locale} demo={<DemoRoom />} />
        <HowItWorks locale={locale} />
      </div>

      <Different locale={locale} />

      <div style={{ background: B.canvas }}>
        {/* The short set. The full list lives at /faq, from the same table. */}
        <Faq locale={locale} limit={5} />
      </div>

      <CtaBand locale={locale} />
    </>
  );
}
