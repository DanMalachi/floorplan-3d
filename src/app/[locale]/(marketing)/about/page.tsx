import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { alternatesFor } from "@/i18n/alternates";
import { Link } from "@/i18n/navigation";
import { B, type as ty, ctaPrimary, microLabel } from "@/brand/tokens";
import { APP_HREF } from "@/landing/nav";
import { CTA_CLASS, CTA_GHOST_CLASS } from "@/landing/hoverCss";
import { landingContent } from "@/landing/content";
import { aboutContent } from "./content";

// A static `metadata` export here would win over the translated `meta.title`
// from `[locale]/layout.tsx`, so `/he/about` would still serve the English
// title — see src/i18n/README-static.md's sibling note in
// docs/HEBREW-HANDOFF.md (Step 3). `alternatesFor` still has to be threaded
// through by hand: it is per-page, not something `generateMetadata` inherits.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    title: t("about.title"),
    description: t("about.description"),
    alternates: alternatesFor("/about"),
  };
}

// Long-form page. The copy lives in the per-locale modules beside this file
// (content.en.tsx / content.he.tsx, picked by content.ts) rather than inline or
// in the message catalogue — see that file's header for why a page of running
// prose is translated as a document and not as a key table.

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  // Every layout and page under [locale] pins the request locale. Without it,
  // next-intl falls back to reading the locale out of a request HEADER, and a
  // page that Next prerendered as static then throws "changed from static to
  // dynamic at runtime" the first time it is served — which took out every
  // unprefixed English route while only the Hebrew ones kept working, because
  // those carry the locale in the URL. See src/i18n/README-static.md.
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const { eyebrow, title, body, faqLink } = aboutContent(locale);
  const { openApp } = landingContent(locale);

  return (
    <article
      style={{
        maxWidth: B.maxWidthText,
        margin: "0 auto",
        padding: `clamp(56px, 9vw, 104px) ${B.gutter}px clamp(72px, 10vw, 120px)`,
      }}
    >
      <div style={microLabel()}>{eyebrow}</div>
      <h1
        style={{
          fontSize: ty.h1,
          fontWeight: 800,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          margin: "14px 0 28px",
          color: B.ink,
        }}
      >
        {title}
      </h1>

      {body}

      <div style={{ marginTop: 44, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href={APP_HREF} className={CTA_CLASS} style={ctaPrimary()}>
          {openApp}
        </Link>
        <Link
          href="/faq"
          className={CTA_GHOST_CLASS}
          style={{
            ...ctaPrimary({ background: "transparent", color: B.ink }),
            border: `1px solid ${B.hairline2}`,
          }}
        >
          {faqLink}
        </Link>
      </div>
    </article>
  );
}
