import type { Metadata } from "next";
import Link from "next/link";
import {
  legalH1,
  legalMeta,
  legalIntro,
  legalH2,
  legalP,
  legalUl,
  legalLi,
  DraftBanner,
  Placeholder,
} from "../legalKit";

export const metadata: Metadata = {
  title: "Terms of Service · done.",
  description: "The terms governing use of Floorplan → 3D.",
};

export default function TermsOfServicePage() {
  return (
    <>
      {/* DRAFT — not legal advice; review by a lawyer before launch */}
      <h1 style={legalH1}>Terms of Service</h1>
      <p style={legalMeta}>
        Last updated: <Placeholder>effective date, set at launch</Placeholder>
      </p>
      <DraftBanner />

      <p style={legalIntro}>
        These Terms govern your use of Floorplan → 3D (the
        &ldquo;Service&rdquo;), operated by{" "}
        <Placeholder>legal entity name</Placeholder>. By using the Service you
        agree to these Terms. This is a draft prepared alongside the
        Service&rsquo;s{" "}
        <Link href="/legal/privacy" style={{ color: "inherit" }}>
          Privacy Policy
        </Link>{" "}
        and has not been reviewed by a lawyer.
      </p>

      <h2 style={legalH2}>1. The Service</h2>
      <p style={legalP}>
        Floorplan → 3D lets you trace, build, and edit a 3D model of a home,
        furnish it, and optionally collaborate on it live with others. The
        Service is under active development; features may change, and some
        are explicitly labeled as beta or experimental.
      </p>

      <h2 style={legalH2}>2. Accounts</h2>
      <p style={legalP}>
        An account is optional. If you choose to sign in, authentication is
        handled entirely through Google OAuth via Supabase — the Service
        never asks for or stores a password. You are responsible for
        maintaining the security of the Google account you sign in with. You
        must be at least{" "}
        <Placeholder>minimum age, per applicable law</Placeholder> years old
        to create an account.
      </p>

      <h2 style={legalH2}>3. Your content</h2>
      <p style={legalP}>
        You retain ownership of the floor plans, project data, and any images
        you import into the Service (&ldquo;Your Content&rdquo;). By using
        the Service, you grant us the limited rights necessary to store,
        process, transmit, and display Your Content in order to operate the
        Service for you — including sending it to the third-party processors
        described in the{" "}
        <Link href="/legal/privacy" style={{ color: "inherit" }}>
          Privacy Policy
        </Link>{" "}
        (for example, broadcasting a live project through Liveblocks when you
        share it).
        This license ends when Your Content is deleted, except where a copy
        persists briefly in backups or as otherwise described in the Privacy
        Policy.
      </p>
      <p style={legalP}>
        You are responsible for having the right to upload any floor plan or
        image you import into the Service, and for not uploading content that
        infringes someone else&rsquo;s rights or violates applicable law.
      </p>

      <h2 style={legalH2}>4. Sharing &amp; collaboration</h2>
      <p style={legalP}>
        The Service lets you generate share links that grant view, decorate,
        or edit access to a live project session to anyone who holds the
        link, whether or not they have an account. You are responsible for
        who you share a link with and for revoking access (or letting a link
        expire) when it&rsquo;s no longer appropriate to share.
      </p>

      <h2 style={legalH2}>5. Acceptable use</h2>
      <ul style={legalUl}>
        <li style={legalLi}>Don&rsquo;t use the Service to store or transmit unlawful content.</li>
        <li style={legalLi}>
          Don&rsquo;t attempt to disrupt, overload, or gain unauthorized
          access to the Service or another user&rsquo;s account or projects.
        </li>
        <li style={legalLi}>
          Don&rsquo;t use a share link to access a project you were not
          intended to have access to.
        </li>
        <li style={legalLi}>
          Don&rsquo;t use the Service&rsquo;s AI features to process content
          you do not have the right to share with a third-party AI provider.
        </li>
      </ul>

      <h2 style={legalH2}>6. Third-party services</h2>
      <p style={legalP}>
        The Service relies on third-party infrastructure — including
        Supabase, Liveblocks, and Vercel — described in the{" "}
        <Link href="/legal/privacy" style={{ color: "inherit" }}>
          Privacy Policy
        </Link>
        . Their availability and performance affect the Service, and their
        own terms may separately apply to data they process on our behalf.
      </p>

      <h2 style={legalH2}>7. Beta features, &ldquo;as is&rdquo;</h2>
      <p style={legalP}>
        The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as
        available&rdquo; basis, without warranties of any kind, express or
        implied. Automatically detected room types and geometry are
        suggestions, not authoritative determinations, and may be wrong. The
        Service is not a substitute for professional architectural,
        structural, or safety advice, and nothing produced by it should be
        used for construction, permitting, or safety-critical decisions
        without independent professional review.
      </p>

      <h2 style={legalH2}>8. Limitation of liability</h2>
      <p style={legalP}>
        <Placeholder>
          limitation-of-liability clause, drafted by counsel for the correct
          jurisdiction
        </Placeholder>
      </p>

      <h2 style={legalH2}>9. Termination</h2>
      <p style={legalP}>
        You may stop using the Service at any time, and may delete your
        account as described in the{" "}
        <Link href="/legal/privacy" style={{ color: "inherit" }}>
          Privacy Policy
        </Link>
        . We may suspend or terminate access to the Service for conduct that
        violates these Terms.
      </p>

      <h2 style={legalH2}>10. Changes to these Terms</h2>
      <p style={legalP}>
        We may update these Terms as the Service changes. Material changes
        will be reflected in the &ldquo;Last updated&rdquo; date above.
      </p>

      <h2 style={legalH2}>11. Governing law</h2>
      <p style={legalP}>
        These Terms are governed by the laws of{" "}
        <Placeholder>governing jurisdiction</Placeholder>, without regard to
        its conflict-of-laws principles.
      </p>

      <h2 style={legalH2}>12. Contact</h2>
      <p style={legalP}>
        Questions about these Terms: <Placeholder>support contact email</Placeholder>.
      </p>
    </>
  );
}
