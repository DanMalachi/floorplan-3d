import { Brand } from "@/brand/Brand";
import {
  legalH1, legalMeta, legalIntro, legalH2, legalP, legalUl, legalLi,
  DraftBanner, TranslationNotice, Verify, Fact, Mail, Placeholder,
} from "@/app/[locale]/legal/legalKit";
import { LEGAL_FACTS as F } from "../facts";

// Accessibility Statement — ENGLISH TRANSLATION. accessibility.he.tsx binds and
// carries the sourcing notes. Change both.

export function AccessibilityEn() {
  return (
    <>
      <h1 style={legalH1}>Accessibility Statement</h1>
      <TranslationNotice />
      <p style={legalMeta}>
        Last updated: <Fact value={F.effectiveDateEn} missing="date, set at launch" />
      </p>
      <DraftBanner lang="en" />

      <p style={legalIntro}>
        We want <Brand /> to work for as many people as possible, including
        people with disabilities. This statement says plainly what has been
        done, what is not yet accessible, and how to reach us if something
        gets in your way.
      </p>

      <h2 style={legalH2}>1. Accessibility level</h2>
      <p style={legalP}>
        We are working to meet Israeli Standard IS 5568, which is based on
        WCAG 2.0 level AA. <b>The Service does not yet fully meet it.</b> The
        marketing site and legal pages are closer to meeting it. The 3D editor
        is only partly accessible, as set out below.{" "}
        <Verify>whether the operator qualifies for a small-business exemption under reg. 35</Verify>
      </p>

      <h2 style={legalH2}>2. What has been done</h2>
      <ul style={legalUl}>
        <li style={legalLi}>
          Every button and control on the site and in the editor has an
          accessible name a screen reader can announce, including icon-only
          buttons &mdash; in Hebrew on the Hebrew site.
        </li>
        <li style={legalLi}>
          Everything around the 3D view &mdash; the project gallery, the
          illustrated navigators, panels, dialogs, sharing and the account
          page &mdash; can be operated from the keyboard, shows a visible focus
          indicator, and never traps the keyboard.
        </li>
        <li style={legalLi}>
          The 3D view can be reached with the keyboard, is named for screen
          readers, and announces its keyboard controls: moving and orbiting
          the camera, top view, framing, and rotating, deleting and deselecting
          a selected item.
        </li>
        <li style={legalLi}>
          Selected state is exposed to assistive technology, not shown by colour
          alone, and status messages are announced to screen readers.
        </li>
        <li style={legalLi}>
          Selecting something in the 3D view announces what was selected, for
          example &ldquo;Wall &middot; 3.20 m selected&rdquo;.
        </li>
        <li style={legalLi}>
          Single-key shortcuts (such as 1&ndash;4, E, T and ?) can be turned
          off in the Help panel, for people who use voice control.
        </li>
        <li style={legalLi}>
          Pages have clear headings and landmarks, and form fields are tied to
          their labels.
        </li>
        <li style={legalLi}>
          Text in the editor&rsquo;s panels meets a 4.5:1 contrast ratio in both
          the dark and light themes, including over the brightest parts of the
          3D image. This was measured on the rendered screen.
        </li>
        <li style={legalLi}>
          The site and the editor can be zoomed to 200% without controls
          overlapping or disappearing.
        </li>
        <li style={legalLi}>
          For anyone who has asked their operating system for less motion,
          interface animations are removed, camera moves in the 3D view jump
          instead of gliding (including going into and out of the
          walkthrough), doors in the walkthrough open without swinging, rain
          and the wind in the trees stand still, and the homepage demo shows
          the finished room without animating. The demo&rsquo;s rotation can
          also be paused.
        </li>
        <li style={legalLi}>
          The homepage demo starts on its own when you scroll to it. While it
          plays, a visible &ldquo;Skip to the room&rdquo; button stops it.
        </li>
        <li style={legalLi}>
          Tooltips can be dismissed with the Escape key.
        </li>
        <li style={legalLi}>
          The Service is available in Hebrew (right-to-left) and English, and
          measurements read in the right order in both.
        </li>
      </ul>

      <h2 style={legalH2}>3. What is not yet accessible</h2>
      <ul style={legalUl}>
        <li style={legalLi}>
          <b>Editing the 3D model.</b> Drawing walls, selecting, dragging and
          rotating items, and the walkthrough are done with a mouse or touch on
          a graphical view. They currently have no screen-reader or full
          keyboard alternative.
        </li>
        <li style={legalLi}>
          <b>Small screens.</b> The editor is not yet adapted for phones.
        </li>
        <li style={legalLi}>
          The Service has not yet been tested with screen readers (NVDA, JAWS,
          VoiceOver). It has been checked with an automated accessibility
          checker (axe, WCAG 2.0 and 2.1 A/AA) and with a keyboard walk-through
          of every public page in Hebrew and English.
        </li>
      </ul>
      <p style={legalP}>
        If any of this stops you using the Service, write to us and we will
        look for an alternative together.
      </p>

      <h2 style={legalH2}>4. Accessibility requests</h2>
      <p style={legalP}>
        Found an accessibility problem, or need information from the site in
        another format? Contact us and we will try to reply within 14 business
        days. It helps to say which page, what you were trying to do, and which
        assistive technology you use.
      </p>
      <ul style={legalUl}>
        <li style={legalLi}>
          {/* The company, not a person: Dan's call 2026-09-29 (the entity
              being registered is "done."). Whether reg. 35 needs a named
              person is on the lawyer list. */}
          Accessibility contact: <Brand />{" "}
          <Verify>whether the accessibility contact must be a named person rather than the company</Verify>
        </li>
        <li style={legalLi}>
          Email: <Mail address={F.contactEmail} />
        </li>
        <li style={legalLi}>
          Phone: <Placeholder>phone number</Placeholder>{" "}
          <Verify>whether a phone number is required in addition to email</Verify>
        </li>
      </ul>
    </>
  );
}
