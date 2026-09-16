import { Brand } from "@/brand/Brand";
import { Link } from "@/i18n/navigation";
import {
  legalH1, legalMeta, legalIntro, legalH2, legalH3, legalP, legalUl, legalLi,
  DraftBanner, TranslationNotice, Verify, Fact, Mail,
} from "@/app/[locale]/legal/legalKit";
import { LEGAL_FACTS as F } from "../facts";

// Privacy Policy — ENGLISH TRANSLATION. privacy.he.tsx is the binding text and
// the source of every sourcing note; this file must say the same thing,
// section for section. Change both.

export function PrivacyEn() {
  return (
    <>
      <h1 style={legalH1}>Privacy Policy</h1>
      <TranslationNotice />
      <p style={legalMeta}>
        Last updated: <Fact value={F.effectiveDateEn} missing="effective date, set at launch" />
      </p>
      <DraftBanner lang="en" />

      <p style={legalIntro}>
        This policy explains what <Brand /> (the &ldquo;Service&rdquo;)
        collects, why, where it is stored and who receives it. It was written
        by reading the Service&rsquo;s own source code, not copied from a
        template: every third party named here is one the Service actually
        contacts.
      </p>

      <h2 style={legalH2}>1. Who we are</h2>
      <p style={legalP}>
        The Service is operated by <Fact value={F.operatorNameEn} missing="operator name" />,
        ID <Fact value={F.operatorIdNumber} missing="ID / business / company number" />,
        of <Fact value={F.operatorAddressEn} missing="address" /> (&ldquo;we&rdquo;).
        We own and are responsible for the database. For any question or
        request about your data: <Mail address={F.contactEmail} />.
      </p>

      <h2 style={legalH2}>2. The short version</h2>
      <ul style={legalUl}>
        <li style={legalLi}>
          You can use the Service without an account. Your project then lives
          only in your browser and is never sent to us.
        </li>
        <li style={legalLi}>
          Sign-in is with a Google account only. We never see or store a
          password.
        </li>
        <li style={legalLi}>
          Your floor plans and images are never sent to any AI service.
        </li>
        <li style={legalLi}>
          We run no analytics, advertising, pixels or tracking of any kind. We
          do not sell data or use it for marketing email.
        </li>
        <li style={legalLi}>
          Anyone you give a live share link can view (and, depending on the
          role you pick, edit) that shared project.
        </li>
        <li style={legalLi}>
          You can download all your data and delete your account yourself, at
          any time, from the{" "}
          <Link href="/account" style={{ color: "inherit" }}>Your data</Link> page.
        </li>
      </ul>

      <h2 style={legalH2}>3. What we collect, why, and who receives it</h2>
      <p style={legalP}>
        You are under no legal obligation to give us any information. Doing so
        depends on your choice and consent. If you choose not to sign in, you
        can still use the Service on your device, but syncing across devices,
        cloud backup and account-based sharing will not be available.
      </p>

      <h3 style={legalH3}>Account &amp; project data — Supabase</h3>
      <p style={legalP}>If you sign in, authentication and cloud storage are handled by Supabase, Inc.:</p>
      <ul style={legalUl}>
        <li style={legalLi}>
          <b>Sign-in:</b> via Google. We receive your name, email address and
          profile picture URL from Google. <b>Purpose:</b> to identify you and
          attach your projects to you.
        </li>
        <li style={legalLi}>
          <b>Project details:</b> project name, created/updated times and a
          revision counter. <b>Purpose:</b> to save your projects and sync them
          across your devices.
        </li>
        <li style={legalLi}>
          <b>Project content:</b> the 3D model you built (walls, rooms,
          furniture and so on), any plan image you imported, and a thumbnail.
          Files are kept in private storage, and access is restricted so only
          your account can read or write them.
        </li>
      </ul>

      <h3 style={legalH3}>Live collaboration — Liveblocks</h3>
      <p style={legalP}>
        When you make a project &ldquo;live&rdquo; or join through a share
        link, co-editing runs through Liveblocks, Inc.:
      </p>
      <ul style={legalUl}>
        <li style={legalLi}>
          <b>Presence:</b> a display name and picture or colour are shown to
          everyone in the same room. Signed in, that is your Google name and
          profile picture; otherwise you get a random name (e.g. &ldquo;Swift
          Fox&rdquo;).
        </li>
        <li style={legalLi}>
          <b>The shared scene</b> is synchronised through Liveblocks for as
          long as the room exists.
        </li>
        <li style={legalLi}>
          Access is granted by a signed link valid for {F.shareLinkDays} days,
          not by identity. Anyone holding a valid link can join, with or
          without an account.
        </li>
      </ul>

      <h3 style={legalH3}>Hosting, abuse protection and profile pictures</h3>
      <ul style={legalUl}>
        <li style={legalLi}>
          <b>Vercel, Inc.</b> hosts the site and server APIs, and so processes
          ordinary connection data such as IP address, as any web host does.
          It also serves the furniture and material library, which is
          read-only; nothing you create is stored there.{" "}
          <Verify>Vercel request-log retention period</Verify>
        </li>
        <li style={legalLi}>
          <b>Upstash, Inc.</b> provides rate limiting to protect the Service
          from abuse. Your IP address or account ID is used briefly as the key
          of a short-lived request counter. That counter is not stored in our
          database or written to logs.
        </li>
        <li style={legalLi}>
          <b>Google:</b> your profile picture loads directly from
          Google&rsquo;s servers, so your browser contacts Google when it is
          shown.
        </li>
      </ul>

      <h3 style={legalH3}>Services wired in but currently switched off</h3>
      <ul style={legalUl}>
        <li style={legalLi}>
          <b>Resend, Inc.</b>, for operational email only, such as an
          account-deletion receipt or a policy-change notice. No marketing
          email.
        </li>
        <li style={legalLi}>
          <b>Functional Software, Inc. (Sentry)</b>, for error reporting. It
          is configured not to send identifying details on its own initiative,
          and session replay is deliberately off so your plan is never
          recorded.
        </li>
      </ul>
      <p style={legalP}>If we switch either on, we will update this policy first.</p>

      <h3 style={legalH3}>AI — none</h3>
      <p style={legalP}>
        The Service does not send your plans, images or any other content to
        an AI provider. An early feature that did was removed on 23 August
        2026, together with the code that sent the data.
      </p>

      <h3 style={legalH3}>Fonts</h3>
      <p style={legalP}>
        Fonts (Manrope, IBM Plex Mono, Rubik) are served from our own servers.
        Your browser does not contact Google to load them.
      </p>

      <h2 style={legalH2}>4. What is stored where</h2>
      <p style={legalP}>
        <b>In your browser:</b> every project is saved automatically to your
        browser&rsquo;s local storage (IndexedDB), signed in or not. It does not
        leave your device unless you sign in and it syncs, or you choose to
        share it.
      </p>
      <p style={legalP}>
        <b>In the cloud (only if signed in):</b> the same data is backed up to
        Supabase so it is available on your other devices, and stays private
        to your account.
      </p>
      <p style={legalP}>
        Cookies and local storage are listed in the{" "}
        <Link href="/legal/cookies" style={{ color: "inherit" }}>Cookie Policy</Link>.
      </p>

      <h2 style={legalH2}>5. What a share link exposes</h2>
      <p style={legalP}>
        A share link grants access to the shared project only, not to your
        account or your other projects. The role you choose (view / decorate
        / build) sets what the recipient can do. A link works until it
        expires ({F.shareLinkDays} days) or the room is deleted, for example
        when you delete your account. There is currently no button to revoke
        a single link before it expires, so share a link as you would any
        editable document: only with people you trust.
      </p>

      <h2 style={legalH2}>6. Transfers outside Israel</h2>
      <p style={legalP}>
        The providers above are foreign companies, mostly in the United
        States, and data may be stored or processed outside Israel, including
        in countries whose privacy laws differ from Israel&rsquo;s. We work only
        with providers that commit by contract to protect the data and use it
        only to provide their service to us. By using the Service and signing
        in, you consent to this transfer.{" "}
        <Verify>
          legal basis under the Privacy Protection (Transfer of Data to
          Databases Abroad) Regulations 2001, and the Supabase storage region
        </Verify>
      </p>

      <h2 style={legalH2}>7. Retention &amp; deletion</h2>
      <ul style={legalUl}>
        <li style={legalLi}>
          A deleted project is removed from your browser and marked deleted in
          the cloud. The files and records themselves are permanently purged
          within {F.purgeDays} days.
        </li>
        <li style={legalLi}>
          Deleting your account from the{" "}
          <Link href="/account" style={{ color: "inherit" }}>Your data</Link> page
          immediately erases every project, file, share room and the account
          itself. It cannot be undone.
        </li>
        <li style={legalLi}>
          We keep no personal data beyond what the purposes here require,
          unless the law requires it.
        </li>
      </ul>

      <h2 style={legalH2}>8. Security</h2>
      <p style={legalP}>
        Traffic is encrypted (HTTPS). Cloud data is protected by row-level
        access rules so each account sees only its own data. Share links are
        cryptographically signed and time-limited. No system is completely
        secure. If a serious security incident occurs, we will act as the
        Privacy Protection (Data Security) Regulations 2017 require, including
        notifying the Privacy Protection Authority where required.
      </p>

      <h2 style={legalH2}>9. Your rights</h2>
      <ul style={legalUl}>
        <li style={legalLi}>
          <b>Access:</b> to receive the data held about you. Download it
          yourself (&ldquo;Export&rdquo; on the Your data page) or ask by email.
        </li>
        <li style={legalLi}>
          <b>Correction and deletion:</b> to ask us to correct data that is
          wrong, incomplete or out of date, or to delete it. Most of this you
          can do yourself in the Service.
        </li>
        <li style={legalLi}>
          <b>Withdrawing consent:</b> to stop using the Service and delete your
          account at any time.
        </li>
      </ul>
      <p style={legalP}>
        Requests: <Mail address={F.contactEmail} />. We reply within 30 days.
        If you are not satisfied, you may contact the Privacy Protection
        Authority at the Israeli Ministry of Justice, or a court.
      </p>

      <h2 style={legalH2}>10. Children</h2>
      <p style={legalP}>
        The Service is not directed at children. You may not open an account
        under the age of {F.minimumAge}, and we do not knowingly collect personal
        data from anyone younger.
      </p>

      <h2 style={legalH2}>11. Changes to this policy</h2>
      <p style={legalP}>
        When we change this policy we update the &ldquo;Last updated&rdquo;
        date above. Material changes are announced in advance, in the Service
        or by email to registered users.
      </p>

      <h2 style={legalH2}>12. Contact</h2>
      <p style={legalP}>
        Questions about this policy or your data: <Mail address={F.contactEmail} />.
      </p>
    </>
  );
}
