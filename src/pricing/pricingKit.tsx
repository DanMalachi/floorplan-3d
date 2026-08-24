import type React from "react";
import { T } from "@/ui/tokens";

// Shared bits for the /pricing and /legal/refunds pages (commercial-readiness
// [17]/[18]). Deliberately NOT added to src/app/legal/legalKit.tsx — that file
// is imported by /legal/privacy and /legal/terms, which are already live in
// production, and this work has no reason to touch a file those pages depend
// on. `Placeholder`/`Verify`/`DraftBanner` from legalKit are reused as-is
// (imported directly) wherever their existing wording already fits.

/** Both new pages behind NEXT_PUBLIC_PRICING_UI_ENABLED are previews, not a
 *  live storefront. This is the one fact that must survive even a careless
 *  future flip of the flag: nothing on this site currently charges money. */
export function NoChargeBanner() {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "12px 14px",
        marginBottom: 28,
        borderRadius: T.radiusM,
        border: `1px solid ${T.warn}`,
        background: "rgba(255,214,10,0.08)",
        color: T.warn,
        fontSize: 12.5,
        lineHeight: 1.6,
      }}
    >
      <span aria-hidden style={{ fontSize: 15 }}>
        ⚠
      </span>
      <span>
        <b>Preview — nothing here charges money.</b> Floorplan → 3D has no
        payment provider connected: no Stripe, no checkout, no billing of any
        kind. Every price and limit below is a placeholder for a decision Dan
        has not made yet, not a live offer.
      </span>
    </div>
  );
}

export const pricingSectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  color: T.textFaint,
};
