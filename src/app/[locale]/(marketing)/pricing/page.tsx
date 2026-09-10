import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { alternatesFor } from "@/i18n/alternates";
import { Link } from "@/i18n/navigation";
import { B, type as ty, ctaGhost, ctaPrimary, microLabel } from "@/brand/tokens";
import { CTA_CLASS } from "@/landing/hoverCss";
import { pricingContent, type PricingPlan } from "@/pricing/content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const { meta } = pricingContent(locale);
  return { ...meta, alternates: alternatesFor("/pricing") };
}

export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const copy = pricingContent(locale);

  return (
    <article style={{ padding: `clamp(32px, 5vw, 64px) ${B.gutter}px clamp(72px, 9vw, 112px)` }}>
      <header
        className="done-pricing-header"
        style={{
          maxWidth: B.maxWidth,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "minmax(280px, .9fr) minmax(360px, 1.1fr)",
          alignItems: "end",
          gap: "20px 64px",
        }}
      >
        <div>
        <div style={microLabel({ color: B.accentText })}>{copy.eyebrow}</div>
        <h1
          style={{
            margin: "10px 0 0",
            color: B.ink,
            fontFamily: B.fontDisplay,
            fontSize: ty.h1,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1.12,
          }}
        >
          {copy.title}
        </h1>
        </div>
        <p style={{ margin: 0, color: B.ink2, fontFamily: B.fontUi, fontSize: ty.body, lineHeight: 1.65 }}>
          {copy.intro}
        </p>
      </header>

      <section
        aria-label={copy.eyebrow}
        className="done-pricing-grid"
        style={{
          maxWidth: B.maxWidth,
          margin: "clamp(24px, 4vw, 40px) auto 0",
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 18,
        }}
      >
        {copy.plans.map((plan) => <PlanCard key={plan.id} plan={plan} />)}
      </section>

      <p
        style={{
          maxWidth: 700,
          margin: "28px auto 0",
          color: B.ink4,
          fontFamily: B.fontUi,
          fontSize: ty.small,
          lineHeight: 1.65,
          textAlign: "center",
        }}
      >
        {copy.footnote}
      </p>
    </article>
  );
}

function PlanCard({ plan }: { plan: PricingPlan }) {
  return (
    <div
      style={{
        position: "relative",
        padding: "clamp(24px, 3vw, 34px)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: plan.featured ? B.raised : B.canvas,
        border: `1px solid ${plan.featured ? B.accent : B.hairline}`,
        borderRadius: B.radiusL,
        boxShadow: plan.featured ? B.shadow : "none",
      }}
    >
      <div style={microLabel({ color: plan.featured ? B.accentText : B.ink4 })}>{plan.eyebrow}</div>
      <h2
        style={{
          margin: "14px 0 8px",
          color: B.ink,
          fontFamily: B.fontDisplay,
          fontSize: ty.h2,
          fontWeight: 800,
          letterSpacing: "-0.03em",
          lineHeight: 1.1,
        }}
      >
        {plan.name}<span style={{ color: B.accent }}>.</span>
      </h2>
      <p style={{ margin: 0, minHeight: 52, color: B.ink2, fontFamily: B.fontUi, fontSize: ty.body, lineHeight: 1.6 }}>{plan.tagline}</p>

      <div style={{ margin: "22px 0 14px" }}>
        <div style={{ color: B.ink, fontFamily: B.fontDisplay, fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.035em" }}>
          {plan.price}
        </div>
        <div style={{ marginTop: 7, color: B.ink4, fontSize: ty.small }}>{plan.priceNote}</div>
      </div>

      {plan.action.kind === "open-app" ? (
        <Link href={plan.action.href} className={CTA_CLASS} style={ctaPrimary({ justifyContent: "center", width: "100%" })}>
          {plan.cta}
        </Link>
      ) : (
        <button
          type="button"
          disabled
          data-billing-product={plan.action.billingProductKey}
          style={ctaGhost({ justifyContent: "center", width: "100%", opacity: 0.62, cursor: "not-allowed" })}
        >
          {plan.cta}
        </button>
      )}

      <ul style={{ margin: "26px 0 0", padding: "24px 0 0", display: "grid", gap: 12, listStyle: "none", borderTop: `1px solid ${B.hairline}` }}>
        {plan.features.map((feature) => (
          <li
            key={feature.label}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 11,
              color: feature.included ? B.ink2 : B.ink4,
              fontFamily: B.fontUi,
              fontSize: ty.body,
              lineHeight: 1.5,
            }}
          >
            <span
              aria-hidden
              style={{
                flex: "0 0 auto",
                width: 15,
                color: feature.included ? B.accentText : B.ink4,
                fontFamily: B.fontUi,
                fontWeight: 800,
                textAlign: "center",
              }}
            >
              {feature.included ? "✓" : "×"}
            </span>
            <span style={{ textDecoration: feature.included ? "none" : "line-through", textDecorationThickness: 1 }}>
              {feature.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
