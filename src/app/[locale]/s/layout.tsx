import type { Metadata } from "next";

// Same unfurl and no-index rule as /v/[id] (see that page): a short link is a
// share link. The page itself is a client component, which cannot export
// metadata, so it lives here.
export const metadata: Metadata = {
  title: "A live shared home design · done.",
  description: "Open to explore this home in 3D — and design your own.",
  robots: { index: false, follow: false },
};

export default function ShortLinkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
