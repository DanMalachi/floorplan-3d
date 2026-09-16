import { Brand } from "@/brand/Brand";
import { Link } from "@/i18n/navigation";
import {
  legalH1, legalMeta, legalIntro, legalH2, legalP, legalUl, legalLi,
  DraftBanner, TranslationNotice, Verify, Fact, Mail,
} from "@/app/[locale]/legal/legalKit";
import { LEGAL_FACTS as F } from "../facts";
import { SubscriptionEn } from "./subscription.en";

// Terms of Service — ENGLISH TRANSLATION. terms.he.tsx binds and carries the
// sourcing notes. Change both.

export function TermsEn() {
  return (
    <>
      <h1 style={legalH1}>Terms of Service</h1>
      <TranslationNotice />
      <p style={legalMeta}>
        Last updated: <Fact value={F.effectiveDateEn} missing="effective date, set at launch" />
      </p>
      <DraftBanner lang="en" />

      <p style={legalIntro}>
        These Terms govern use of <Brand /> (the &ldquo;Service&rdquo;),
        operated by <Fact value={F.operatorNameEn} missing="operator name" />,
        ID <Fact value={F.operatorIdNumber} missing="ID / business / company number" />{" "}
        (&ldquo;we&rdquo;). Using the Service means you accept these Terms and
        the <Link href="/legal/privacy" style={{ color: "inherit" }}>Privacy Policy</Link>.
        If you do not agree, do not use the Service.
      </p>

      <h2 style={legalH2}>1. The Service</h2>
      <p style={legalP}>
        <Brand /> lets you trace and build a 3D model of a home, edit it,
        furnish and style it, and share it for live collaboration. The Service
        is under active development: features may change, be added or be
        removed, and some are labelled experimental.
      </p>

      <h2 style={legalH2}>2. Accounts and age</h2>
      <ul style={legalUl}>
        <li style={legalLi}>
          You can use the Service without an account. Sign-in is with a Google
          account only, and you are responsible for securing that account.
        </li>
        <li style={legalLi}>You must be {F.minimumAge} or older to open an account.</li>
        <li style={legalLi}>
          You can delete your account at any time from the{" "}
          <Link href="/account" style={{ color: "inherit" }}>Your data</Link> page.
        </li>
      </ul>

      <h2 style={legalH2}>3. Your content</h2>
      <p style={legalP}>
        The plans, projects and images you upload or create (&ldquo;Your
        Content&rdquo;) belong to you. You give us a limited permission to
        store, process, transmit and display Your Content only to run the
        Service for you, including passing it to the providers listed in the
        Privacy Policy, for example broadcasting a live project through
        Liveblocks when you share it. This permission ends when the content is
        deleted, subject to the timeframe in the Privacy Policy.
      </p>
      <p style={legalP}>
        You are responsible for having the right to upload any plan or image,
        and for your content not infringing anyone&rsquo;s rights or the law.
      </p>

      <h2 style={legalH2}>4. Sharing</h2>
      <p style={legalP}>
        A share link gives anyone holding it access to the shared project, at
        the role you chose, with or without an account. Links are valid for{" "}
        {F.shareLinkDays} days. You are responsible for who receives your link.
      </p>

      <h2 style={legalH2}>5. Acceptable use</h2>
      <ul style={legalUl}>
        <li style={legalLi}>Do not use the Service to store or transmit unlawful content.</li>
        <li style={legalLi}>
          Do not disrupt or overload the Service, or try to gain unauthorised
          access to it, to another person&rsquo;s account or to their projects.
        </li>
        <li style={legalLi}>Do not use a share link to reach a project not meant for you.</li>
        <li style={legalLi}>
          Do not copy, extract or redistribute the Service&rsquo;s furniture
          library, materials or code outside normal use of the Service.
        </li>
      </ul>
      <p style={legalP}>
        If you breach this section we may suspend or block your access, with
        advance notice where practical.
      </p>

      <h2 style={legalH2}>6. Intellectual property, third-party content and trademarks</h2>
      <p style={legalP}>
        The Service, its design, code and the name <Brand /> belong to us.
        Some 3D models, materials and images in the Service were made by
        others and are used under licences that permit commercial use; credits
        are on the <Link href="/legal/credits" style={{ color: "inherit" }}>Credits &amp; Licenses</Link> page.
      </p>
      <p style={legalP}>
        Items in the Service are generic models for illustration, not products
        of any particular manufacturer or retailer. Any company, brand or
        product names that appear belong to their owners; they are used
        descriptively only and imply no affiliation, sponsorship or
        endorsement. Dimensions, colours and materials in the visualisation
        are approximate and may differ from real products or paint.
      </p>

      <h2 style={legalH2}>7. Payment</h2>
      {F.paidPlansLive ? (
        <SubscriptionEn />
      ) : (
        <p style={legalP}>
          The Service is currently free. If we offer paid plans in the future,
          their terms, including price, renewal, cancellation and refunds, will
          be published here before you are asked to pay, and will not bind you
          without your explicit consent.
        </p>
      )}

      <h2 style={legalH2}>8. Provided &ldquo;as is&rdquo;</h2>
      <p style={legalP}>
        The Service is provided &ldquo;as is&rdquo; and &ldquo;as
        available&rdquo;. We do not promise it will run without interruption
        or errors. The model you build, including dimensions, areas and
        quantities, is a visualisation and design-planning aid only. It does
        not replace advice from an architect, engineer or other professional,
        and must not be relied on for construction, permits, ordering
        made-to-measure products or safety decisions without independent
        professional review. Keep a copy of important work.
      </p>

      <h2 style={legalH2}>9. Limitation of liability</h2>
      <p style={legalP}>
        To the fullest extent the law allows, we are not liable for indirect,
        consequential or special damage, loss of profit or loss of data arising
        from use of, or inability to use, the Service. In any case our total
        liability to you will not exceed the amount you paid us in the twelve
        months before the event, or ₪100, whichever is higher.
      </p>
      <p style={legalP}>
        Nothing in this section limits liability for damage caused
        intentionally or by gross negligence, for bodily injury, or any
        liability or right that cannot lawfully be limited or waived, including
        your rights under the Israeli Consumer Protection Law 1981.{" "}
        <Verify>clause wording and cap against the Standard Contracts Law 1982</Verify>
      </p>

      <h2 style={legalH2}>10. Suspension and termination</h2>
      <p style={legalP}>
        You may stop using the Service and delete your account at any time. We
        may suspend or end access for breach of these Terms. If we decide to
        shut the Service down entirely, we will give at least 30 days&rsquo;
        notice so you can export your data.
      </p>

      <h2 style={legalH2}>11. Changes to these Terms</h2>
      <p style={legalP}>
        When we change these Terms we update the &ldquo;Last updated&rdquo;
        date. Material changes are announced in advance, in the Service or by
        email to registered users. Continuing to use the Service after a change
        takes effect means you accept it. No change applies retroactively.
      </p>

      <h2 style={legalH2}>12. Governing law and jurisdiction</h2>
      <p style={legalP}>
        These Terms are governed solely by the laws of the State of Israel.
        Exclusive jurisdiction lies with {F.courtsEn}, without limiting any
        right a consumer has under law to sue in another court. If the Hebrew
        text and a translation conflict, the Hebrew text prevails.
      </p>

      <h2 style={legalH2}>13. Contact</h2>
      <p style={legalP}>
        Questions about these Terms: <Mail address={F.contactEmail} />.
      </p>
    </>
  );
}
