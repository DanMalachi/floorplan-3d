import type React from "react";
import type { ReactNode } from "react";
import { PD } from "@/ui/planDock/tokens";
import { WarnIcon } from "@/ui/planDock/icons";

// Shared typography + placeholder markers for the /legal pages.
//
// These are plain document styles for long-form text, not panel/button chrome,
// but they read the SAME palette as the rest of the app now: they used to come
// from src/ui/tokens.ts (`T`), a second token set whose accent and greys did not
// match the dock's, so /legal was quietly a different-coloured product.
// Nothing here is glass — a policy is a page to read, so it sits on the opaque
// `PD.bg` ground its layout paints.

export const legalH1: React.CSSProperties = {
  fontSize: 27,
  fontWeight: 700,
  margin: "0 0 6px",
  color: PD.textPrimary,
  letterSpacing: -0.3,
};

export const legalMeta: React.CSSProperties = {
  fontSize: 12.5,
  color: PD.textTertiary,
  marginBottom: 20,
};

export const legalIntro: React.CSSProperties = {
  fontSize: 13.5,
  lineHeight: 1.7,
  color: PD.textSecondary,
  margin: "0 0 32px",
  paddingBottom: 24,
  borderBottom: `1px solid ${PD.hairline}`,
};

export const legalH2: React.CSSProperties = {
  fontSize: 16.5,
  fontWeight: 700,
  margin: "34px 0 10px",
  color: PD.textPrimary,
};

export const legalH3: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  margin: "20px 0 6px",
  color: PD.textSecondary,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

export const legalP: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.75,
  color: PD.textSecondary,
  margin: "0 0 14px",
};

export const legalUl: React.CSSProperties = {
  margin: "0 0 14px",
  paddingLeft: 20,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

export const legalLi: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.7,
  color: PD.textSecondary,
};

/** A visible-on-page echo of the source DRAFT comment — belt and suspenders,
 *  since Dan (or anyone previewing the deployed page) may never open the
 *  source file. */
export function DraftBanner() {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "12px 14px",
        marginBottom: 28,
        borderRadius: PD.radiusM,
        border: `1px solid ${PD.warnText}`,
        background: PD.warnBg,
        color: PD.warnText,
        fontSize: 12.5,
        lineHeight: 1.6,
      }}
    >
      <span aria-hidden style={{ flex: "0 0 auto", lineHeight: 0, paddingTop: 2 }}>
        <WarnIcon size={15} />
      </span>
      <span>
        <b>Draft — not legal advice.</b> This page was generated from the
        codebase to describe real data flows as accurately as possible. It has
        not been reviewed by a lawyer and must not be treated as a finished
        policy until it is.
      </span>
    </div>
  );
}

/** [[PLACEHOLDER: ...]] — a real gap Dan must fill in before this ships.
 *  Never invented (no company name, address, jurisdiction, or contact). */
export function Placeholder({ children }: { children: ReactNode }) {
  return (
    <span style={{ color: PD.warnText, fontWeight: 700 }}>
      [[PLACEHOLDER: {children}]]
    </span>
  );
}

/** [[VERIFY: ...]] — a claim that wasn't traceable to code read while
 *  drafting this page; confirm before relying on it. */
export function Verify({ children }: { children: ReactNode }) {
  return (
    <span style={{ color: PD.accent, fontWeight: 700 }}>
      [[VERIFY: {children}]]
    </span>
  );
}

/** [[PENDING: ...]] — functionality another workstream owns and hasn't
 *  shipped yet. */
export function Pending({ children }: { children: ReactNode }) {
  return (
    <span style={{ color: PD.ok, fontWeight: 700 }}>
      [[PENDING: {children}]]
    </span>
  );
}
