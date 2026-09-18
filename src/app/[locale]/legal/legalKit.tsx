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
  paddingInlineStart: 20,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

export const legalLi: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.7,
  color: PD.textSecondary,
};

export type LegalLang = "he" | "en";

/** A visible-on-page echo of the source DRAFT comment — belt and suspenders,
 *  since Dan (or anyone previewing the deployed page) may never open the
 *  source file. Remove only once counsel has reviewed the text. */
export function DraftBanner({ lang }: { lang: LegalLang }) {
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
      {lang === "he" ? (
        <span>
          <b>טיוטה — לא ייעוץ משפטי.</b> מסמך זה נכתב על סמך קריאת הקוד של
          השירות, כדי לתאר את זרימת המידע בפועל. הוא טרם נבדק על ידי עורך דין,
          ואין להתייחס אליו כמסמך סופי עד שייבדק.
        </span>
      ) : (
        <span>
          <b>Draft — not legal advice.</b> This page was written from the
          codebase to describe real data flows as accurately as possible. It has
          not been reviewed by a lawyer and must not be treated as a finished
          document until it is.
        </span>
      )}
    </div>
  );
}

/** Under the title of every English copy: the Hebrew text binds. */
export function TranslationNotice() {
  return (
    <p style={{ ...legalMeta, marginTop: -14 }}>
      This is an English translation provided for convenience. The Hebrew
      version is the binding version; if the two differ, the Hebrew version
      prevails.
    </p>
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

/** [[VERIFY: ...]] — a claim counsel must confirm before relying on it. */
export function Verify({ children }: { children: ReactNode }) {
  return (
    <span style={{ color: PD.accentText, fontWeight: 700 }}>
      [[VERIFY: {children}]]
    </span>
  );
}

/** A fact from src/legal/facts.ts, or a visible placeholder while it is null. */
export function Fact({ value, missing }: { value: string | null; missing: string }) {
  return value ? <>{value}</> : <Placeholder>{missing}</Placeholder>;
}

export function Mail({ address }: { address: string }) {
  return (
    <a href={`mailto:${address}`} style={{ color: "inherit" }} dir="ltr">
      {address}
    </a>
  );
}
