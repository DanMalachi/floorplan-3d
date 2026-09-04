import type { Metadata } from "next";
import { B } from "@/brand/tokens";
import { Hero } from "@/landing/sections/Hero";
import { HowItWorks } from "@/landing/sections/HowItWorks";
import { Different } from "@/landing/sections/Different";
import { Faq } from "@/landing/sections/Faq";
import { CtaBand } from "@/landing/sections/CtaBand";
import { DemoRoom } from "@/landing/DemoRoom";

export const metadata: Metadata = {
  title: "done. — design the room you actually have",
  description:
    "Bring the floorplan you already have, draw your walls over it to scale, and walk the result. A sofa that fits, paint you can buy, a room that's actually yours.",
};

/**
 * The homepage.
 *
 * The flag gate lives in the layout (src/app/(marketing)/layout.tsx), which
 * redirects every marketing route to /design while the site is unlaunched — so
 * there is nothing to check here.
 *
 * The 3D room is passed INTO the hero rather than imported by it: the hero is
 * a presentational component that only reserves the slot, which keeps the
 * heaviest thing on the page swappable from one line here.
 */
export default function HomePage() {
  return (
    <>
      <Hero demo={<DemoRoom />} />

      {/* A ground change is the only separator between sections — no rules, no
          dividers. Quiet is an attribute the brand actually commits to. */}
      <div style={{ background: B.canvas }}>
        <HowItWorks />
      </div>

      <Different />

      <div style={{ background: B.canvas }}>
        {/* The short set. The full list lives at /faq, from the same table. */}
        <Faq limit={5} />
      </div>

      <CtaBand />
    </>
  );
}
