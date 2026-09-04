import type { Metadata } from "next";
import type { ReactNode } from "react";
import { alternatesFor } from "@/i18n/alternates";

// The editor page itself is `"use client"` and so cannot export metadata. This
// layout exists purely to carry the hreflang map: /design is listed in the
// sitemap and allowed by robots.ts (it is a real destination people link to,
// app shell or not), so it needs to name its Hebrew twin like any other
// indexable route. Title and description still come from the root layout.
export const metadata: Metadata = {
  alternates: alternatesFor("/design"),
};

export default function DesignLayout({ children }: { children: ReactNode }) {
  return children;
}
