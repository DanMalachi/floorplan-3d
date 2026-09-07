import type React from "react";
import { B, type as ty } from "@/brand/tokens";

// The two type components the About page's prose is built from, lifted out of
// page.tsx so both `content.en.tsx` and `content.he.tsx` can use them without
// either importing the page (which would be a cycle) or restating the styles
// (which would let the two languages drift apart visually).
//
// Nothing here is direction-aware, and that is correct rather than an omission:
// every value below is a size, a weight or a colour. The one property that would
// need mirroring — text alignment — is not set at all, so each paragraph inherits
// the document's own `dir` and aligns itself.

/** A section heading inside the article. */
export function H({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: ty.h3,
        fontWeight: 700,
        letterSpacing: "-0.015em",
        color: B.ink,
        margin: "40px 0 12px",
      }}
    >
      {children}
    </h2>
  );
}

/** A paragraph. `lead` is the opening one: larger, and in the brighter ink. */
export function P({ children, lead }: { children: React.ReactNode; lead?: boolean }) {
  return (
    <p
      style={{
        fontSize: lead ? ty.lead : ty.body,
        lineHeight: 1.7,
        color: lead ? B.ink : B.ink2,
        margin: "0 0 16px",
      }}
    >
      {children}
    </p>
  );
}
