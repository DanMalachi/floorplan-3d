import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { alternatesFor } from "@/i18n/alternates";
import {
  legalH1,
  legalIntro,
  legalH2,
  legalH3,
  legalP,
  legalUl,
  legalLi,
} from "../legalKit";
import { sketchfabCredits, polypizzaCredits, type CcByCredit } from "@/legal/creditsData";

export const metadata: Metadata = {
  title: "Credits & Licenses · done.",
  description: "Attribution for the third-party 3D models and media done. ships.",
  alternates: alternatesFor("/legal/credits"),
};

export default async function CreditsPage({ params }: { params: Promise<{ locale: string }> }) {
  // Every layout and page under [locale] pins the request locale. Without it,
  // next-intl falls back to reading the locale out of a request HEADER, and a
  // page that Next prerendered as static then throws "changed from static to
  // dynamic at runtime" the first time it is served. See src/i18n/README-static.md.
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const t = await getTranslations("legalCredits");

  return (
    <>
      <h1 style={legalH1}>{t("h1")}</h1>

      <p style={legalIntro}>{t("intro")}</p>

      <h2 style={legalH2}>{t("ccbyHeading")}</h2>

      <h3 style={legalH3}>{t("sketchfabHeading")}</h3>
      <p style={legalP}>{t("sketchfabIntro", { count: sketchfabCredits.length })}</p>
      <CreditList items={sketchfabCredits} sourceLabel={t("sourceLabel")} licenseLabel={t("licenseLabel")} />

      <h3 style={legalH3}>{t("polypizzaHeading")}</h3>
      <p style={legalP}>{t("polypizzaIntro", { count: polypizzaCredits.length })}</p>
      <CreditList items={polypizzaCredits} sourceLabel={t("sourceLabel")} licenseLabel={t("licenseLabel")} />

      <h2 style={legalH2}>{t("cc0Heading")}</h2>
      <p style={legalP}>{t("cc0Body")}</p>

      <h2 style={legalH2}>{t("photoHeading")}</h2>
      <p style={legalP}>{t("photoBody")}</p>
    </>
  );
}

function CreditList({
  items,
  sourceLabel,
  licenseLabel,
}: {
  items: CcByCredit[];
  sourceLabel: string;
  licenseLabel: string;
}) {
  return (
    <ul style={legalUl}>
      {items.map((item) => (
        <li key={item.sourceUrl} style={legalLi}>
          <b>&ldquo;{item.title}&rdquo;</b> — {item.author}
          {" · "}
          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
            {sourceLabel}
          </a>
          {" · "}
          {licenseLabel}:{" "}
          <a href={item.licenseUrl} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
            {item.licenseLabel}
          </a>
        </li>
      ))}
    </ul>
  );
}
