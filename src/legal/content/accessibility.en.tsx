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
          buttons.
        </li>
        <li style={legalLi}>
          The project gallery, the illustrated navigators, panels and popovers
          can be operated from the keyboard.
        </li>
        <li style={legalLi}>
          Selected state is exposed to assistive technology, not shown by colour
          alone, and status messages are announced to screen readers.
        </li>
        <li style={legalLi}>
          Pages have clear headings and landmarks, and form fields are tied to
          their labels.
        </li>
        <li style={legalLi}>
          Interface animations are reduced or removed for anyone who has asked
          their operating system for less motion.
        </li>
        <li style={legalLi}>The Service is available in Hebrew (right-to-left) and English.</li>
      </ul>

      <h2 style={legalH2}>3. What is not yet accessible</h2>
      <ul style={legalUl}>
        <li style={legalLi}>
          <b>The 3D model itself.</b> Drawing walls, selecting, dragging and
          rotating items, and the walkthrough are done with a mouse or touch on
          a graphical view. They currently have no screen-reader or full
          keyboard alternative.
        </li>
        <li style={legalLi}>
          <b>Contrast.</b> The editor&rsquo;s semi-transparent panels sit over
          the 3D image, so their text contrast varies and can fall below the
          required level. Light secondary text is also below 4.5:1.
        </li>
        <li style={legalLi}>
          <b>Single-key shortcuts</b> cannot be turned off or remapped.
        </li>
        <li style={legalLi}>
          <b>Small screens.</b> The editor is not yet adapted for phones.
        </li>
        <li style={legalLi}>
          Selecting an item opens a settings panel that is not announced to
          screen readers, and some popovers do not behave as full menus.
        </li>
        <li style={legalLi}>
          Motion inside the 3D view (camera moves, walkthrough, weather) does
          not follow the reduced-motion setting.
        </li>
        <li style={legalLi}>
          The Service has not yet been tested with screen readers (NVDA, JAWS,
          VoiceOver), with full keyboard testing in a browser, or with an
          automated checker. The review so far was a code review.
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
          Accessibility contact: <Placeholder>name</Placeholder>
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
