import type { Metadata } from "next";
import {
  legalH1,
  legalMeta,
  legalIntro,
  legalH2,
  legalH3,
  legalP,
  legalUl,
  legalLi,
  DraftBanner,
  Placeholder,
  Verify,
  Pending,
} from "../legalKit";

export const metadata: Metadata = {
  title: "Privacy Policy · Floorplan → 3D",
  description: "How Floorplan → 3D collects, stores, and shares data.",
};

export default function PrivacyPolicyPage() {
  return (
    <>
      {/* DRAFT — not legal advice; review by a lawyer before launch */}
      <h1 style={legalH1}>Privacy Policy</h1>
      <p style={legalMeta}>
        Last updated: <Placeholder>effective date, set at launch</Placeholder>
      </p>
      <DraftBanner />

      <p style={legalIntro}>
        This policy explains what Floorplan → 3D (the &ldquo;Service&rdquo;)
        collects, why, and who it is shared with. It was written by reading
        the Service&rsquo;s own source code, not by copying a template — every
        third party named below is one this codebase actually calls. Where a
        detail could not be confirmed in code, it is marked{" "}
        <Verify>like this</Verify> rather than asserted. This document
        describes practices; it does not claim compliance with any specific
        law or certification (e.g. GDPR, CCPA, SOC 2) — that determination is
        for <Placeholder>counsel</Placeholder> to make before launch.
      </p>

      <h2 style={legalH2}>Who we are</h2>
      <p style={legalP}>
        Floorplan → 3D is operated by{" "}
        <Placeholder>legal entity name</Placeholder>,{" "}
        <Placeholder>registered address</Placeholder>. If you have questions
        about this policy or your data, contact{" "}
        <Placeholder>privacy contact email</Placeholder>.
      </p>

      <h2 style={legalH2}>The short version</h2>
      <ul style={legalUl}>
        <li style={legalLi}>
          Signing in is optional. Without an account, your project lives only
          in your browser (IndexedDB) and is never sent to us.
        </li>
        <li style={legalLi}>
          Signing in is Google, via Supabase — we never see or store a
          password.
        </li>
        <li style={legalLi}>
          Your floor plan images are never sent to any AI service. The
          Service has no AI feature that transmits your plans anywhere.
        </li>
        <li style={legalLi}>
          If you create a live shared link, anyone who has that link can view
          (and, depending on the role you choose, edit) that project while the
          session is open.
        </li>
        <li style={legalLi}>
          We do not run analytics, advertising, or tracking scripts of any
          kind on this Service.
        </li>
      </ul>

      <h2 style={legalH2}>Information we process, and who it goes to</h2>

      <h3 style={legalH3}>Account &amp; project data — Supabase</h3>
      <p style={legalP}>
        If you sign in, authentication and cloud storage are handled by{" "}
        <b>Supabase</b> (Supabase, Inc.). Specifically:
      </p>
      <ul style={legalUl}>
        <li style={legalLi}>
          <b>Sign-in</b> is Google OAuth brokered through Supabase Auth — you
          never create or give us a password. We receive whatever your Google
          account shares for sign-in: your name, email address, and profile
          picture URL, as returned by Google.
        </li>
        <li style={legalLi}>
          <b>Project metadata</b> (a Postgres database) — project name,
          creation/update timestamps, and a revision counter used to keep
          your devices in sync.
        </li>
        <li style={legalLi}>
          <b>Project geometry</b> — the editable 3D scene itself (walls,
          rooms, furniture placement, etc., with images stripped out) is
          stored as structured data in that same database.
        </li>
        <li style={legalLi}>
          <b>Imported plan images and thumbnails</b> — if you import a floor
          plan image, that image (and a small thumbnail generated from your 3D
          view) is stored in two private Supabase Storage buckets. These
          buckets are not public, and access is restricted by row-level
          security so that only your own account can read or write your own
          files.
        </li>
      </ul>
      <p style={legalP}>
        Supabase session cookies are how you stay signed in between visits;
        see &ldquo;Cookies&rdquo; below.
      </p>

      <h3 style={legalH3}>Realtime collaboration — Liveblocks</h3>
      <p style={legalP}>
        When you turn a project &ldquo;live&rdquo; or open a share link, the
        live editing session is powered by <b>Liveblocks</b> (Liveblocks,
        Inc.). While you are in a live room:
      </p>
      <ul style={legalUl}>
        <li style={legalLi}>
          Your <b>presence</b> — a display name and an avatar/color — is
          broadcast to everyone else currently in that room, so collaborators
          can see who is editing what. If you are signed in, this is your
          Google display name and profile picture; if you are not signed in
          (a link recipient without an account), you are given a randomly
          generated placeholder name and color for that session (e.g.
          &ldquo;Swift Fox&rdquo;) instead.
        </li>
        <li style={legalLi}>
          The <b>live scene</b> itself — the shared 3D document being
          co-edited — is synchronized through Liveblocks for as long as the
          room is open.
        </li>
        <li style={legalLi}>
          Access to a room is gated by a signed, time-limited link (default
          30-day expiry) rather than by identity — anyone who is not signed in
          can still join a room if they have a valid link.
        </li>
      </ul>

      <h3 style={legalH3}>AI processing — none</h3>
      <p style={legalP}>
        <b>
          The Service does not send your floor plans, images, or any other
          content to an AI provider.
        </b>{" "}
        An earlier &ldquo;Understand rooms&rdquo; feature did transmit plan
        images to a third-party model to guess room types; it was retired on
        23 August 2026 and the code paths that sent that data were removed.
        Room types are now determined entirely by a rule engine that runs
        locally, on your own device.
      </p>

      <h3 style={legalH3}>Hosting — Vercel</h3>
      <p style={legalP}>
        The Service is hosted on <b>Vercel</b>, which serves every page and
        API route and necessarily processes standard connection data (such as
        IP address) to do so, as any web host does.{" "}
        <Verify>
          Vercel&rsquo;s own log retention window and whether any request
          logs are retained beyond what&rsquo;s operationally necessary
        </Verify>
        .
      </p>

      <h3 style={legalH3}>Static asset hosting — Vercel Blob</h3>
      <p style={legalP}>
        Furniture and material assets you can add to a design (3D models,
        textures) are served from <b>Vercel Blob</b>. This is a one-way,
        read-only content library assembled ahead of time — nothing you
        create or upload is sent to or stored in Vercel Blob.
      </p>

      <h3 style={legalH3}>Fonts</h3>
      <p style={legalP}>
        The Service uses two Google Fonts (Manrope, IBM Plex Mono). They are
        self-hosted at build time via Next.js&rsquo;s font system, not loaded
        from Google&rsquo;s servers at runtime — your browser does not make a
        request to Google when these fonts load.
      </p>

      <h2 style={legalH2}>What&rsquo;s stored where</h2>
      <p style={legalP}>
        <b>Locally, in your browser (IndexedDB):</b> every project you create
        is saved to your browser&rsquo;s local storage automatically, whether
        or not you are signed in. This includes the project&rsquo;s geometry,
        the imported plan image, and a gallery thumbnail. This data does not
        leave your device unless you sign in and it syncs, or you explicitly
        go live and share it.
      </p>
      <p style={legalP}>
        <b>In the cloud (only if you sign in):</b> the same project data is
        mirrored to Supabase so it follows you to another device. It remains
        private to your account — restricted by row-level security so that no
        other account can read or write it, even though it lives in a shared
        database.
      </p>

      <h2 style={legalH2}>What a share link exposes</h2>
      <p style={legalP}>
        Turning a project &ldquo;live&rdquo; and sharing its link gives
        whoever has that link access to a live collaborative session of that
        project — not to your Supabase account or your other projects. The
        role you choose for the link (view / decorate / build) controls what
        a recipient can do in that session. Anyone with a valid link,
        including someone without an account, can join the session and see
        the live 3D scene and who else is currently viewing it. Treat a
        share link like you would any editable document link: anyone who has
        it can use it until it expires or you revoke access.
      </p>

      <h2 style={legalH2}>Cookies &amp; local storage</h2>
      <p style={legalP}>
        The Service sets <b>strictly-necessary</b> cookies only — used by
        Supabase to keep you signed in between visits. We do not use
        analytics cookies, advertising cookies, or any third-party tracking
        script. Separately (not a cookie), your browser&rsquo;s IndexedDB and
        localStorage are used to save your project data locally and to
        remember small preferences (like light/dark theme and whether
        you&rsquo;ve dismissed the cookie notice) — this data stays on your
        device and is never transmitted anywhere on its own.
      </p>

      <h2 style={legalH2}>Data retention &amp; deletion</h2>
      <p style={legalP}>
        Deleting a project removes it from your local browser storage and
        marks it deleted in the cloud (if signed in), so it disappears from
        your other devices too. The precise end-to-end account- and
        data-deletion mechanism (including how to request deletion of your
        account and all associated cloud data) is{" "}
        <Pending>delete flow</Pending> — this section will be filled in once
        that ships.
      </p>

      <h2 style={legalH2}>Children&rsquo;s privacy</h2>
      <p style={legalP}>
        The Service is not directed at children, and we do not knowingly
        collect personal information from children under{" "}
        <Placeholder>minimum age, per applicable law</Placeholder>.
      </p>

      <h2 style={legalH2}>International data transfers</h2>
      <p style={legalP}>
        Our processors (Supabase, Liveblocks, Vercel) may process
        data in countries other than your own.{" "}
        <Placeholder>
          specific transfer safeguards / legal basis, per counsel
        </Placeholder>
        .
      </p>

      <h2 style={legalH2}>Your choices</h2>
      <p style={legalP}>
        You can use the Service without an account, in which case nothing
        described above under &ldquo;Supabase&rdquo; or
        &ldquo;Liveblocks&rdquo; applies unless you separately trigger a
        live share. You can sign
        out at any time, and can ask us to delete your account and data (see
        &ldquo;Data retention &amp; deletion&rdquo; above).
      </p>

      <h2 style={legalH2}>Changes to this policy</h2>
      <p style={legalP}>
        We may update this policy as the Service changes. Material changes
        will be reflected in the &ldquo;Last updated&rdquo; date above.
      </p>

      <h2 style={legalH2}>Contact</h2>
      <p style={legalP}>
        Questions about this policy: <Placeholder>privacy contact email</Placeholder>.
      </p>
    </>
  );
}
