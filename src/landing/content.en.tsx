// The English copy for the done.design marketing page. `content.he.tsx` is its
// Hebrew twin and `content.ts` holds the types and the switch between them.
//
// This file is the SOURCE of the site's voice: the Hebrew is translated from
// here, so a change to a claim belongs here first and in the twin second.
//
// ── Voice ─────────────────────────────────────────────────────────────────
// Grounded, warm, crafted, quiet. Confidence sounds like a low voice: no
// superlatives, no urgency, no exclamation marks. None of these words appear
// anywhere below, because every competitor already owns them: "in minutes",
// "easy", "fast", "simple", "professional", "precision", "photorealistic",
// "dream home", "effortless", "seamless", "stunning".
//
// ── The one claim nobody else can make ──────────────────────────────────────
// Every competitor treats the real floorplan as friction to skip — upload a
// photo, get an AI's guess at a 3D home. done. draws the opposite conclusion:
// the floorplan is the one thing that has to be true, because everything
// downstream (does the sofa fit, is the paint buyable, is the walkthrough
// actually your home) inherits its honesty from it. "Beautiful because
// accurate" is the whole pitch.
//
// ── The honesty constraint ──────────────────────────────────────────────────
// Automatic floorplan understanding is R&D, not shipped (docs/VISION.md: the
// current bottleneck, not the product). Nothing below may imply an upload
// becomes a 3D home by itself. Upload is the underlay; the user DRAWS their
// own walls over it — "draw", never "trace" (to trace is to copy someone
// else's line; this product's walls are always the user's own). Every FAQ
// answer here is checked against what the code actually does, not what would
// be nice to promise — see the individual comments below for the source.

import { Brand } from "@/brand/Brand";
import type { LandingContent } from "./content";

export const EN: LandingContent = {
  openApp: <span>Open <Brand /></span>,

  hero: {
    /**
     * Replaced the rotating slogans (2026-09-19): a rotation that never stops
     * fails WCAG 2.2.2 unless it can be paused, and the one claim the page
     * exists to make fits in one sentence anyway. The plan is the one thing
     * that has to be true; everything downstream inherits from it.
     */
    headline: { sans: "it starts with", serif: "the plan." },
    subhead:
      "Upload your floorplan as a reference underneath. Draw your own walls over it, to scale, and what comes out the other side is your actual room — a sofa that fits, paint you can buy, a walkthrough that's yours.",
    /** Trust microcopy under the CTAs. True today — no account gate anywhere
     *  in src/app/[locale]/design; see the FAQ "Do I need an account?" below. */
    note: "No account needed to start.",
    /** Plain text, not a button: the demo below plays on its own once it is
     *  scrolled into view (sections/DemoSection.tsx). */
    scrollCue: "Scroll to watch it build",
  },

  demo: {
    eyebrow: "Watch it build",
    // "drawn", never "traced" — see the honesty constraint at the top.
    title: "From a drawn line to a room you can walk through.",
  },

  howItWorks: {
    eyebrow: "How it works",
    title: "From your floorplan to a home you can walk into.",
    steps: [
      {
        n: "01",
        title: "Upload your plan",
        body: "Bring what you have — a photo of the blueprint, a PDF, a DXF or DWG file. It sits underneath your workspace as a reference, sized and ready to draw over.",
      },
      {
        n: "02",
        title: "Draw your walls",
        body: "Draw your actual walls, doors and windows over the underlay, at their real dimensions — a floor plan only you could have drawn, because it's the one you live in.",
      },
      {
        n: "03",
        title: "Furnish, then walk through it",
        body: "Place furniture from a real catalogue, sized to fit your real rooms, and pick paint you can actually buy. Then walk through it in first person — the walls are the ones you drew.",
      },
    ],
  },

  different: {
    eyebrow: "What's different",
    title: "Beautiful because it's accurate.",
    intro:
      "Every other tool treats your real floorplan as friction — something to route around so you can start decorating sooner. We treat it as the foundation: the one thing everything else in the design has to answer to, because a plan you didn't draw is a guess wearing nice lighting.",
    points: [
      {
        id: "furnitureFits",
        title: "Furniture that fits, because it's real",
        body: "Every piece in the catalogue carries its real dimensions, drawn from the real product. Your room is drawn to scale too — so a sofa that looks right here is a sofa that's right for the space you're standing in.",
      },
      {
        id: "paintYouCanBuy",
        title: "Paint you can actually buy",
        body: "The colours in the catalogue are real, named paint — not a render's approximation of one. What you pick on screen is something you can go and buy.",
      },
      {
        id: "yourOwnWalkthrough",
        title: "A walkthrough of your own home",
        body: "Once your walls exist, you can walk through them in first person — your rooms, your proportions, your light. Not a demo of a home. A rehearsal of yours.",
      },
      {
        id: "nothingToAccept",
        title: "Nothing to review, nothing to accept",
        body: "You draw a wall, and it's a wall — no detection screen in between, nothing to accept or correct before you can see your home. What you draw is already decided.",
      },
    ],
  },

  /** Heading for the FAQ section — kept separate from the Q&A data itself so a
   *  page can render the first few items under this same title on the homepage,
   *  or drop it on a dedicated /faq page that has its own. */
  faqIntro: {
    eyebrow: "Questions",
    title: "Answered plainly.",
  },

  faq: [
    {
      // Source: upload is an underlay to draw over (src/lib/import/*), never a
      // generator — see the honesty constraint above.
      id: "needFloorplan",
      q: "Do I need a floorplan to start?",
      a: (
        <>
          {"You need something to draw over — a photo of a blueprint, a PDF, a CAD export, even a hand-measured sketch. "}
          <Brand />
          {" doesn't generate a floor plan from nothing; you draw your walls on top of whatever reference you bring, at their real dimensions. That's the one manual step, and it's the one that makes everything after it worth trusting."}
        </>
      ),
    },
    {
      // Source: src/lib/import/importPdfClient.ts (image + PDF, client-side,
      // no vector extraction) and src/app/api/dwg2dxf (DWG -> DXF conversion).
      id: "fileTypes",
      q: "What file types can I upload?",
      a: "A photo or scan of your plan (JPG, PNG), a PDF, or a CAD file — DXF directly, or native DWG, which we convert for you automatically. Whatever you bring becomes the reference image underneath your workspace; you still draw the walls yourself.",
    },
    {
      id: "draftingExperience",
      q: "Do I need drafting experience to draw my walls?",
      a: "No special skill is assumed — you're clicking out lines at real-world lengths, the same as marking a room with a tape measure and a pencil. What matters is that the walls are yours, sized to the room you actually have, not that the drawing itself is expert-grade.",
    },
    {
      // Source: docs/DATA_RETENTION.md §1 ("the product works signed-out");
      // src/landing/AccountControl.tsx ("signing in stays an OFFER, never a
      // gate").
      id: "needAccount",
      q: "Do I need an account?",
      a: (
        <>
          {"No. "}
          <Brand />
          {" works fully signed out — your plan saves to this browser as you go. Signing in with Google just means it also follows you to your other devices; it's an offer, not a requirement."}
        </>
      ),
    },
    {
      // Source: docs/DATA_RETENTION.md §1-2 (guest data never reaches a
      // server; signed-in rows are RLS-scoped to the owner in private storage).
      id: "dataPrivate",
      q: "Is my data private?",
      a: "If you're signed out, your plan never leaves this browser — there's nothing on a server for anyone, including us, to see. If you sign in to sync across devices, your plan and its image are stored privately under your account, and nothing is shared or made public without you choosing to share it.",
    },
    {
      // Source: src/app/[locale]/account/page.tsx (irreversible deletion, no
      // soft-delete tier; guest-browser plans are explicitly out of scope).
      id: "deleteAccount",
      q: "What happens to my plan if I delete my account?",
      a: "Deleting your account deletes your plans and the images you uploaded, for good — there's no backup copy sitting somewhere. A plan that only ever lived in a guest browser isn't touched, because we never had it to begin with.",
    },
    {
      // Source: src/app/api/share/route.ts (signed grants, view or edit role)
      // and live collaboration rooms.
      id: "canIShare",
      q: "Can I share what I've made?",
      a: "Yes — a share link gives someone a view of your project, or lets them design alongside you in real time, whichever you choose. You decide who can only look and who can edit.",
    },
    {
      // Source: src/viewport3d/camera/inputVocabulary.ts (real one-finger
      // orbit / two-finger pan / pinch-zoom touch gestures are implemented).
      id: "worksOnPhone",
      q: "Does it work on my phone?",
      a: "Walking through a finished room does — pinch to zoom, drag to orbit, the same as any map app. Drawing your walls wants a steadier hand than a phone screen gives you, so that part is better on a laptop or tablet, for now.",
    },
    {
      // Source: src/furniture/catalog.ts — real models with real names and
      // dimensions, real-model-only policy. No in-app checkout exists.
      //
      // The catalogue's brand is deliberately NOT named here. Licensing for it
      // is unresolved and load-bearing for this exact claim (docs/LANDING.md,
      // "Not done"), and a trademark on a commercial page is the one part of
      // this answer that cannot be walked back. Name it once that is settled.
      id: "buyTheFurniture",
      q: "Can I buy the furniture I place?",
      a: (
        <>
          {"The catalogue is real furniture — actual products, at their real dimensions and under their real names. What you place is something you can go find and buy today. There's no checkout inside "}
          <Brand />
          {" yet, so think of it as a very accurate shopping list."}
        </>
      ),
    },
    {
      // Source: no billing/pricing code exists in this repo; src/landing/nav.ts
      // keeps the Pricing nav item behind a flag that isn't set yet.
      id: "isItFree",
      q: (
        <>
          {"Is "}
          <Brand />
          {" free?"}
        </>
      ),
      a: "Yes, for now. Drawing a plan, furnishing it, and walking through it don't cost anything today. If that changes, we'll say so here before it does.",
    },
  ],

  faqPage: {
    eyebrow: "Questions",
    title: "Everything worth asking first.",
    aboutLink: <span>What <Brand /> is</span>,
  },

  /** The closing call to action, on its own band. */
  ctaBand: {
    title: "Draw the walls you actually have.",
    subhead:
      "Bring a floorplan, or a photo of one, and draw over it by hand — at the size of the room you're actually in. No account needed to start, and nothing to pay today.",
    ctaGhostLabel: "Read the FAQ",
  },

  footer: {
    tagline:
      "Draw the home you actually have, furnish it from a real catalogue, and walk it before you spend anything.",
  },
};
