import { Brand } from "@/brand/Brand";
import { H, P } from "./prose";
import type { AboutContent } from "./content";

// The English About page, as prose rather than as message keys.
//
// This is the pattern `docs/HEBREW-HANDOFF.md` prescribes for long-form text
// and the reason is worth restating where someone will hit it: a per-paragraph
// key table makes it impossible to restructure an argument. Merging two
// paragraphs, or moving a sentence into the one above it, becomes a key
// migration instead of an edit. Hebrew will not want the same paragraph breaks
// English does, and it must be free to choose its own.
//
// So the two locales share a shape (eyebrow, title, body, links) and nothing
// below that. `content.he.tsx` is a translation of this argument, not of these
// sentences one at a time.

export const ABOUT_EN: AboutContent = {
  eyebrow: "About",
  title: "Imagination, to scale.",
  faqLink: "Common questions",
  body: (
    <>
      <P lead>
        Most home design tools treat your actual floorplan as an obstacle. They
        headline the part where you skip it — sketch something roughly
        rectangular, let it guess the rest, and enjoy a room that resembles
        yours without being it.
      </P>

      <P>
        <Brand /> is built the other way round. You bring the plan you already
        have — a photo, a PDF, the drawing from an agent&rsquo;s brochure — and
        you draw your walls over it. That is the slowest part of the whole
        process, and it is deliberately not automated away, because it is the
        reason everything after it can be trusted.
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
        interface is meant to disappear into the thing you are making. If using{" "}
        <Brand /> ever feels like operating software rather than looking at a
        room, that is a bug we want to hear about.
      </P>
    </>
  ),
};
