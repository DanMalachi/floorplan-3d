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
  openApp: <>Open <Brand /></>,

  /**
   * The lines that rotate beside/below the fixed `done.` wordmark in the hero.
   * Each one completes the sentence "done. …" — the primary lockup, the first
   * entry, is "done. before you start.": it inverts the speed reading of the
   * word "done", which otherwise files this product with the "design in
   * minutes" competitors it exists to escape. The rest of the set keeps either
   * that same inversion (done arrives before the guessing, not after it) or the
   * same grounding (done is real: your own walls, a sofa that fits, paint you
   * can buy).
   *
   * The primary lockup goes first: it is what a visitor sees on arrival, and it
   * is the line that does the brand's single most important job.
   */
  slogans: [
    { id: "beforeYouStart", tail: "before you start." },
    { id: "uploadThenIts", lead: "upload, then it's" },
    { id: "beforeYouGuess", tail: "before you guess." },
    { id: "yourOwnWalls", tail: "with your own walls." },
    { id: "drawItOnce", lead: "draw it once, and it's" },
    { id: "sofaThatFits", tail: "with a sofa that fits." },
    { id: "paintYouCanBuy", tail: "with paint you can buy." },
    { id: "roomThatsYours", tail: "with a room that's really yours." },
  ],

  hero: {
    subhead:
      "Upload your floorplan as a reference underneath. Draw your own walls over it, to scale, and what comes out the other side is your actual room — a sofa that fits, paint you can buy, a walkthrough that's yours.",
    /** Trust microcopy under the CTAs. True today — no account gate anywhere
     *  in src/app/[locale]/design; see the FAQ "Do I need an account?" below. */
    note: "No account needed to start.",
    /**
     * The secondary button no longer goes anywhere — it plays the hero's own
     * animation in place (see landing/heroSequence.ts). One button has to mean
     * something at every stage of a thirteen-second sequence, so it has three
     * labels rather than going dead once it has been pressed.
     */
    ctaGhostLabel: <>{"see how it's "}<Brand /></>,
    ctaGhostLabelRunning: "Skip to the room",
    ctaGhostLabelDone: "Watch it again",
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
    aboutLink: <>What <Brand /> is</>,
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
