import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pricingUiEnabled } from "@/lib/featureFlags";
import { PricingContent } from "./PricingContent";

// /pricing — commercial-readiness [17]. Gated behind pricingUiEnabled
// (src/lib/featureFlags.ts): off by default, 404s rather than rendering with
// blank prices. See docs/PRICING.md for the flag and how to fill this in.
//
// Not linked from any nav/footer/dock, and not in sitemap.ts — reachable only
// by typing the URL, and only when the flag is on.

// Metadata is generated conditionally, not a static export, so that with the
// flag off this route's title/description never appear at all — not even in
// the inert flight-data payload Next embeds alongside a 404 response. Only
// the visible page content actually mattered for the "404, not
// render-with-blanks" requirement, but there's no reason to leak the title
// for zero benefit.
export async function generateMetadata(): Promise<Metadata> {
  if (!pricingUiEnabled) return {};
  return {
    title: "Pricing · Floorplan → 3D",
    description: "Draft pricing tiers for Floorplan → 3D. Not final — every price shown is a placeholder.",
    robots: { index: false, follow: false },
  };
}

export default function PricingPage() {
  if (!pricingUiEnabled) notFound();
  return <PricingContent />;
}
