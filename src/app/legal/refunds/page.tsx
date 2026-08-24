import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { pricingUiEnabled } from "@/lib/featureFlags";
import { NoChargeBanner } from "@/pricing/pricingKit";
import {
  legalH1,
  legalMeta,
  legalIntro,
  legalH2,
  legalP,
  legalUl,
  legalLi,
  DraftBanner,
  Placeholder,
} from "../legalKit";

// /legal/refunds — commercial-readiness [18]. Gated behind pricingUiEnabled
// (src/lib/featureFlags.ts), same flag as /pricing (see that page's comment
// for why one flag covers both): off by default, 404s rather than rendering
// with placeholder prose. See docs/PRICING.md.
//
// Structured as real sections with placeholder text — the STRUCTURE of a
// refund policy is a conventional-default shape choice this task allowed
// picking; the actual terms in each section are Dan's (or counsel's) to
// write. Not linked from src/app/legal/layout.tsx's nav (which only lists
// Privacy/Terms) or from any other nav/footer/dock — reachable only by
// direct URL, and only when the flag is on.

// Conditional metadata, not a static export — see src/app/pricing/page.tsx's
// comment on generateMetadata for why: with the flag off, this keeps the
// title/description out of the 404 response entirely, not just off-screen.
export async function generateMetadata(): Promise<Metadata> {
  if (!pricingUiEnabled) return {};
  return {
    title: "Refund & Cancellation Policy · Floorplan → 3D",
    description: "Draft refund and cancellation policy for Floorplan → 3D. Not final.",
    robots: { index: false, follow: false },
  };
}

export default function RefundPolicyPage() {
  if (!pricingUiEnabled) notFound();

  return (
    <>
      {/* DRAFT — not legal advice; review by a lawyer before launch */}
      <h1 style={legalH1}>Refund &amp; Cancellation Policy</h1>
      <p style={legalMeta}>
        Last updated: <Placeholder>effective date, set at launch</Placeholder>
      </p>
      <NoChargeBanner />
      <DraftBanner />

      <p style={legalIntro}>
        This policy will explain how billing, cancellation, and refunds work
        once Floorplan → 3D has a paid tier. It does not apply to anything
        today: see the{" "}
        <Link href="/pricing" style={{ color: "inherit" }}>
          pricing page
        </Link>{" "}
        for the current (also draft) tier structure. Every section below is
        the conventional shape of a policy like this — the specific terms are
        marked <Placeholder>like this</Placeholder> because they are not
        decided yet.
      </p>

      <h2 style={legalH2}>1. Overview</h2>
      <p style={legalP}>
        Floorplan → 3D currently has no payment provider integrated — no
        Stripe, no checkout, no billing of any kind. Nobody is charged
        anything to use the Service today, including the Free tier described
        on the pricing page. This document is a placeholder for the policy
        that will apply once a paid tier actually launches.
      </p>

      <h2 style={legalH2}>2. Free usage</h2>
      <p style={legalP}>
        Using Floorplan → 3D without a paid subscription costs nothing and
        involves no billing relationship, so there is nothing to refund.
        Deleting your account and data is handled separately — see the{" "}
        <Link href="/legal/privacy" style={{ color: "inherit" }}>
          Privacy Policy
        </Link>
        &rsquo;s data retention &amp; deletion section.
      </p>

      <h2 style={legalH2}>3. Paid subscriptions</h2>
      <p style={legalP}>
        <Placeholder>
          billing cadence and renewal terms, once a payment provider is
          integrated
        </Placeholder>
        .
      </p>

      <h2 style={legalH2}>4. Cancelling a subscription</h2>
      <ul style={legalUl}>
        <li style={legalLi}>
          <Placeholder>how to cancel (self-serve in-app control vs. contact support)</Placeholder>
        </li>
        <li style={legalLi}>
          <Placeholder>
            what happens to access after cancelling — immediate loss vs.
            access continues until the end of the paid period
          </Placeholder>
        </li>
        <li style={legalLi}>
          <Placeholder>what happens to cloud-synced data after cancellation, and for how long</Placeholder>
        </li>
      </ul>

      <h2 style={legalH2}>5. Refund eligibility</h2>
      <p style={legalP}>
        <Placeholder>
          refund window (e.g. a fixed number of days from purchase), what
          qualifies, and how a refund is requested
        </Placeholder>
        .
      </p>

      <h2 style={legalH2}>6. Upgrades, downgrades &amp; proration</h2>
      <p style={legalP}>
        <Placeholder>
          whether switching tiers mid-cycle is prorated, credited, or takes
          effect at the next renewal
        </Placeholder>
        .
      </p>

      <h2 style={legalH2}>7. Failed or disputed payments</h2>
      <p style={legalP}>
        <Placeholder>
          what happens on a failed renewal charge, and how a chargeback or
          payment dispute is handled
        </Placeholder>
        .
      </p>

      <h2 style={legalH2}>8. Changes to this policy</h2>
      <p style={legalP}>
        We may update this policy as billing is introduced and changes.
        Material changes will be reflected in the &ldquo;Last updated&rdquo;
        date above.
      </p>

      <h2 style={legalH2}>9. Contact</h2>
      <p style={legalP}>
        Questions about billing or this policy: <Placeholder>support contact email</Placeholder>.
      </p>
    </>
  );
}
