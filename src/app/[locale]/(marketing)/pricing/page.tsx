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
    <article style={{ padding: `clamp(16px, 2.4vw, 32px) ${B.gutter}px clamp(32px, 4vw, 56px)` }}>
      <header
        className="done-pricing-header"
        style={{
          maxWidth: B.maxWidth,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "minmax(280px, .9fr) minmax(360px, 1.1fr)",
          alignItems: "end",
          gap: "14px 64px",
        }}
      >
        <div>
        <div style={microLabel({ color: B.accentText })}>{copy.eyebrow}</div>
        <h1
          style={{
            margin: "8px 0 0",
            color: B.ink,
            fontFamily: B.fontDisplay,
            fontSize: "clamp(26px, 3.6vw, 40px)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1.12,
          }}
        >
          {copy.title}
        </h1>
        </div>
        <p style={{ margin: 0, color: B.ink2, fontFamily: B.fontUi, fontSize: ty.body, lineHeight: 1.55 }}>
          {copy.intro}
        </p>
      </header>

      <section
        aria-label={copy.eyebrow}
        className="done-pricing-grid"
        style={{
          maxWidth: B.maxWidth,
          margin: "clamp(14px, 2vw, 24px) auto 0",
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 14,
        }}
      >
        {copy.plans.map((plan) => <PlanCard key={plan.id} plan={plan} notIncluded={copy.notIncluded} />)}
      </section>

      <p
        style={{
          maxWidth: 700,
          margin: "16px auto 0",
          color: B.ink4,
          fontFamily: B.fontUi,
          fontSize: ty.small,
          lineHeight: 1.55,
          textAlign: "center",
        }}
      >
        {copy.footnote}
      </p>
    </article>
  );
}

function PlanCard({ plan, notIncluded }: { plan: PricingPlan; notIncluded: string }) {
  return (
    <div
      style={{
        position: "relative",
        padding: "clamp(16px, 2vw, 24px)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: plan.featured ? B.raised : B.canvas,
        border: `1px solid ${plan.featured ? B.hairline2 : B.hairline}`,
        borderRadius: B.radiusL,
        boxShadow: plan.featured ? B.shadow : "none",
      }}
    >
      <div style={microLabel({ color: plan.featured ? B.accentText : B.ink4 })}>{plan.eyebrow}</div>
      <h2
        style={{
          margin: "10px 0 6px",
          color: B.ink,
          fontFamily: B.fontDisplay,
          fontSize: "clamp(20px, 2.4vw, 27px)",
          fontWeight: 800,
          letterSpacing: "-0.03em",
          lineHeight: 1.1,
        }}
      >
        {plan.name}<span style={{ color: B.accent }}>.</span>
      </h2>
      <p style={{ margin: 0, minHeight: 40, color: B.ink2, fontFamily: B.fontUi, fontSize: 14.5, lineHeight: 1.5 }}>{plan.tagline}</p>

      <div style={{ margin: "14px 0 10px" }}>
        <div style={{ color: B.ink, fontFamily: B.fontDisplay, fontSize: "clamp(20px, 2.8vw, 28px)", fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.035em" }}>
          {plan.price}
        </div>
        <div style={{ marginTop: 5, color: B.ink4, fontSize: ty.small }}>{plan.priceNote}</div>
      </div>

      {plan.action.kind === "open-app" ? (
        <Link href={plan.action.href} className={CTA_CLASS} style={ctaPrimary({ justifyContent: "center", width: "100%", padding: "10px 22px", fontSize: 14.5 })}>
          {plan.cta}
        </Link>
      ) : (
        <button
          type="button"
          disabled
          data-billing-product={plan.action.billingProductKey}
          style={ctaGhost({ justifyContent: "center", width: "100%", padding: "10px 22px", fontSize: 14.5, opacity: 0.62, cursor: "not-allowed" })}
        >
          {plan.cta}
        </button>
      )}

      <ul style={{ margin: "16px 0 0", padding: "14px 0 0", display: "grid", gap: 8, listStyle: "none", borderTop: `1px solid ${B.hairline}` }}>
        {plan.features.map((feature) => (
          <li
            key={feature.label}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              color: feature.included ? B.ink2 : B.ink4,
              fontFamily: B.fontUi,
              fontSize: 14.5,
              lineHeight: 1.4,
            }}
          >
            <span
              aria-hidden
              style={{
                flex: "0 0 auto",
                width: 15,
                color: feature.included ? B.ink2 : B.ink4,
                fontFamily: B.fontUi,
                fontWeight: 800,
                textAlign: "center",
              }}
            >
              {feature.included ? "✓" : "–"}
            </span>
            <span>
              {!feature.included && <span className="fp-sr-only">{notIncluded} </span>}
              {feature.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
