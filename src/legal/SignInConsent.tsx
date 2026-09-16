"use client";

import type React from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LEGAL_FACTS } from "./facts";

// The line under every "Continue with Google" button. It sits BEFORE the
// action, next to it, with both documents linked — notice a user cannot miss
// is what makes "by continuing you agree" hold up (a line in a footer does
// not). The age comes from facts.ts so the Terms, the Privacy Policy and this
// line can never state different minimums.
//
// Links open in a new tab from the editor, where following them in place
// would unload the 3D scene mid-sign-in.

export function SignInConsent({
  style,
  linkColor,
  newTab = false,
}: {
  style?: React.CSSProperties;
  linkColor: string;
  newTab?: boolean;
}) {
  const t = useTranslations("signInConsent");
  const tab = newTab ? { target: "_blank", rel: "noopener" } : {};
  const link = (href: string) =>
    function LegalLink(chunks: React.ReactNode) {
      return (
        <Link href={href} {...tab} style={{ color: linkColor, textDecoration: "underline", textUnderlineOffset: 2 }}>
          {chunks}
        </Link>
      );
    };
  return (
    <p style={{ margin: 0, ...style }}>
      {t.rich("note", {
        age: LEGAL_FACTS.minimumAge,
        terms: link("/legal/terms"),
        privacy: link("/legal/privacy"),
      })}
    </p>
  );
}
