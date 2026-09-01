import type { Metadata } from "next";
import Link from "next/link";
import { B, type as ty, ctaPrimary, microLabel } from "@/brand/tokens";
import { APP_HREF } from "@/landing/nav";

export const metadata: Metadata = {
  title: "About — done.",
  description:
    "Why done. asks you to draw your real floorplan instead of skipping it, and what that buys you.",
};

// Long-form page. Copy lives inline rather than in src/landing/content.ts
// because content.ts is the homepage's string table — one narrative page
// reading top to bottom is easier to edit as prose than as an array.

export default function AboutPage() {
  return (
    <article
      style={{
        maxWidth: B.maxWidthText,
        margin: "0 auto",
        padding: `clamp(56px, 9vw, 104px) ${B.gutter}px clamp(72px, 10vw, 120px)`,
      }}
    >
      <div style={microLabel()}>About</div>
      <h1
        style={{
          fontSize: ty.h1,
          fontWeight: 800,
          letterSpacing: "-0.03em",
          lineHeight: 1.05,
          margin: "14px 0 28px",
          color: B.ink,
        }}
      >
        Imagination, to scale.
      </h1>

      <P lead>
        Most home design tools treat your actual floorplan as an obstacle. They
        headline the part where you skip it — sketch something roughly
        rectangular, let it guess the rest, and enjoy a room that resembles
        yours without being it.
      </P>

      <P>
        done. is built the other way round. You bring the plan you already have
        — a photo, a PDF, the drawing from an agent&rsquo;s brochure — and you
        draw your walls over it. That is the slowest part of the whole process,
        and it is deliberately not automated away, because it is the reason
        everything after it can be trusted.
      </P>

      <H>What accuracy actually buys you</H>
      <P>
        A room that is right to the centimetre stops being a picture and starts
        being a decision. The sofa either fits or it doesn&rsquo;t. The door
        either clears the rug or it catches it. The corner you were going to put
        a desk in turns out to be 12cm too narrow, and you find that out now
        rather than on a delivery day.
      </P>
      <P>
        That is the whole argument. Not that the render is beautiful — that it
        is beautiful <em>and</em> load-bearing. Everything you place comes from a
        real catalogue at real dimensions, so what you are looking at is a plan
        you could act on, not a mood board.
      </P>

      <H>Drawn by hand, on purpose</H>
      <P>
        You draw it, so you own it. Setting one length you have actually
        measured and tracing your own walls over the image underneath takes a
        few minutes, and it puts a human being — you — in charge of the ground
        truth. Nothing downstream has to be second-guessed, because nothing
        upstream was guessed.
      </P>
      <P>
        We are working on understanding uploaded floorplans automatically, and
        it is genuinely hard: drawing conventions differ by studio, by country
        and by decade, and a tool that is confidently wrong about a wall is
        worse than one that asks. Until that clears a bar we would stake your
        home on, drawing stays the honest answer, and we would rather say so
        than sell the demo.
      </P>

      <H>Quiet by design</H>
      <P>
        There is no wizard, no assistant, and nothing that announces itself. The
        interface is meant to disappear into the thing you are making. If using
        done. ever feels like operating software rather than looking at a room,
        that is a bug we want to hear about.
      </P>

      <div style={{ marginTop: 44, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href={APP_HREF} style={ctaPrimary()}>
          Open done.
        </Link>
        <Link
          href="/faq"
          style={{
            ...ctaPrimary({ background: "transparent", color: B.ink }),
            border: `1px solid ${B.hairline2}`,
          }}
        >
          Common questions
        </Link>
      </div>
    </article>
  );
}

function H({ children }: { children: React.ReactNode }) {
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

function P({ children, lead }: { children: React.ReactNode; lead?: boolean }) {
  return (
    <p
      style={{
        fontSize: lead ? ty.lead : ty.body,
        lineHeight: 1.7,
        color: lead ? B.ink : B.ink2,
        margin: "0 0 18px",
      }}
    >
      {children}
    </p>
  );
}
