"use client";

import { useState } from "react";
import Link from "next/link";
import { T, glass, chip } from "@/ui/tokens";
import { NoChargeBanner, pricingSectionLabel } from "@/pricing/pricingKit";
import { Placeholder } from "@/app/legal/legalKit";
import {
  plans,
  comparisonRows,
  pricingFaq,
  annualDiscountPercent,
  type BillingCadence,
  type PlanPrice,
} from "@/pricing/plans";

/** Renders a PlanPrice for the given cadence. null amount/currency -> an
 *  obvious [[PLACEHOLDER]], never a made-up number. $0 renders as "Free". */
function formatPrice(price: PlanPrice): React.ReactNode {
  if (price.amount === null || price.currency === null) {
    return <Placeholder>price</Placeholder>;
  }
  if (price.amount === 0) return "Free";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: price.currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(price.amount);
  } catch {
    return `${price.amount} ${price.currency.toUpperCase()}`;
  }
}

export function PricingContent() {
  const [cadence, setCadence] = useState<BillingCadence>("monthly");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflowY: "auto",
        background: T.bg,
        color: T.text,
        fontFamily: T.font,
      }}
    >
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "56px 24px 96px" }}>
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 40,
            fontSize: 13,
            color: T.textDim,
          }}
        >
          <Link href="/" style={{ color: T.textDim, textDecoration: "none" }}>
            ← Floorplan → 3D
          </Link>
          <span style={{ color: T.textFaint }}>·</span>
          <Link href="/legal/refunds" style={{ color: T.text, textDecoration: "none" }}>
            Refund &amp; cancellation policy
          </Link>
        </nav>

        <h1 style={{ fontSize: 27, fontWeight: 700, margin: "0 0 6px", color: T.text, letterSpacing: -0.3 }}>
          Pricing
        </h1>
        <p style={{ fontSize: 13.5, lineHeight: 1.7, color: T.textDim, margin: "0 0 20px" }}>
          A draft of what pricing could look like. Nothing below is final.
        </p>
        <NoChargeBanner />

        {/* Cadence toggle. Annual is a conventional default alongside monthly —
            the discount amount is undecided, so it only renders once
            annualDiscountPercent is set in src/pricing/plans.ts. */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 28 }}>
          <button style={chip(cadence === "monthly")} onClick={() => setCadence("monthly")}>
            Monthly
          </button>
          <button style={chip(cadence === "annual")} onClick={() => setCadence("annual")}>
            Annual
          </button>
          {cadence === "annual" && (
            <span style={{ fontSize: 12, color: T.ok }}>
              {annualDiscountPercent === null ? (
                <Placeholder>annual discount</Placeholder>
              ) : (
                `Save ${annualDiscountPercent}% billed annually`
              )}
            </span>
          )}
        </div>

        {/* ---- Plan cards --------------------------------------------------- */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
            marginBottom: 48,
          }}
        >
          {plans.map((plan) => (
            <div
              key={plan.id}
              style={glass({
                padding: 22,
                display: "flex",
                flexDirection: "column",
                gap: 14,
                position: "relative",
                border: plan.highlight ? `1px solid ${T.accent}` : `1px solid ${T.panelBorder}`,
              })}
            >
              {plan.highlight && (
                <span
                  style={{
                    position: "absolute",
                    top: -11,
                    left: 20,
                    background: T.accent,
                    color: "#fff",
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                    padding: "3px 9px",
                    borderRadius: 999,
                  }}
                >
                  Most popular
                </span>
              )}
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{plan.name}</div>
                <div style={{ fontSize: 12.5, color: T.textDim, marginTop: 4 }}>{plan.tagline}</div>
              </div>

              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 30, fontWeight: 700, color: T.text }}>
                  {formatPrice(plan.price[cadence])}
                </span>
                <span style={{ fontSize: 12, color: T.textFaint }}>{plan.priceUnit}</span>
              </div>

              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {plan.features.map((f) => (
                  <li
                    key={f}
                    style={{
                      fontSize: 12.5,
                      lineHeight: 1.5,
                      color: T.textDim,
                      display: "flex",
                      gap: 8,
                      alignItems: "flex-start",
                    }}
                  >
                    <span aria-hidden style={{ color: T.accent }}>
                      ✓
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div style={{ flex: 1 }} />

              {plan.cta.href ? (
                <Link
                  href={plan.cta.href}
                  style={{
                    ...chip(true, { textAlign: "center", textDecoration: "none", padding: "9px 14px", fontSize: 13 }),
                  }}
                >
                  {plan.cta.label}
                </Link>
              ) : (
                <button
                  disabled
                  title="No checkout exists yet — this button is a placeholder."
                  style={{
                    ...chip(false, { padding: "9px 14px", fontSize: 13, cursor: "default", opacity: 0.55 }),
                  }}
                >
                  {plan.cta.label}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* ---- Comparison table ---------------------------------------------- */}
        <div style={{ ...pricingSectionLabel, marginBottom: 12 }}>Compare plans</div>
        <div style={{ overflowX: "auto", marginBottom: 48 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 10px", color: T.textFaint, fontWeight: 600 }}>
                  Feature
                </th>
                {plans.map((p) => (
                  <th
                    key={p.id}
                    style={{ textAlign: "left", padding: "8px 10px", color: T.text, fontWeight: 700 }}
                  >
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row.id} style={{ borderTop: `1px solid ${T.panelBorder}` }}>
                  <td style={{ padding: "10px", color: T.textDim }}>{row.label}</td>
                  {plans.map((p) => {
                    const v = row.values[p.id];
                    return (
                      <td key={p.id} style={{ padding: "10px", color: T.text }}>
                        {typeof v === "boolean" ? (
                          <span aria-hidden style={{ color: v ? T.ok : T.textFaint }}>
                            {v ? "✓" : "—"}
                          </span>
                        ) : (
                          v
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ---- FAQ ------------------------------------------------------------ */}
        <div style={{ ...pricingSectionLabel, marginBottom: 12 }}>Questions</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, marginBottom: 12 }}>
          {pricingFaq.map((item) => (
            <div key={item.q}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>{item.q}</div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: T.textDim }}>{item.a}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
