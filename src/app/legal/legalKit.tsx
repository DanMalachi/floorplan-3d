import type React from "react";
import type { ReactNode } from "react";
import { T } from "@/ui/tokens";
import { WarnIcon } from "@/ui/planDock/icons";

// Shared typography + placeholder markers for the /legal pages. Kept separate
// from src/ui/tokens.ts (which drives app chrome) because these are plain
// document styles for long-form text, not panel/button chrome.

export const legalH1: React.CSSProperties = {
  fontSize: 27,
  fontWeight: 700,
  margin: "0 0 6px",
  color: T.text,
  letterSpacing: -0.3,
};

export const legalMeta: React.CSSProperties = {
  fontSize: 12.5,
  color: T.textFaint,
  marginBottom: 20,
};

export const legalIntro: React.CSSProperties = {
  fontSize: 13.5,
  lineHeight: 1.7,
  color: T.textDim,
  margin: "0 0 32px",
  paddingBottom: 24,
  borderBottom: `1px solid ${T.panelBorder}`,
};

export const legalH2: React.CSSProperties = {
  fontSize: 16.5,
  fontWeight: 700,
  margin: "34px 0 10px",
  color: T.text,
};

export const legalH3: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  margin: "20px 0 6px",
  color: T.textDim,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

export const legalP: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.75,
  color: T.textDim,
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
  color: T.textDim,
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
        borderRadius: T.radiusM,
        border: `1px solid ${T.warn}`,
        background: "rgba(255,214,10,0.08)",
        color: T.warn,
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
    <span style={{ color: T.warn, fontWeight: 700 }}>
      [[PLACEHOLDER: {children}]]
    </span>
  );
}

/** [[VERIFY: ...]] — a claim that wasn't traceable to code read while
 *  drafting this page; confirm before relying on it. */
export function Verify({ children }: { children: ReactNode }) {
  return (
    <span style={{ color: T.accent, fontWeight: 700 }}>
      [[VERIFY: {children}]]
    </span>
  );
}

/** [[PENDING: ...]] — functionality another workstream owns and hasn't
 *  shipped yet. */
export function Pending({ children }: { children: ReactNode }) {
  return (
    <span style={{ color: T.ok, fontWeight: 700 }}>
      [[PENDING: {children}]]
    </span>
  );
}
