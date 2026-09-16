import { Link } from "@/i18n/navigation";
import { legalP, legalUl, legalLi, Verify, Placeholder } from "@/app/[locale]/legal/legalKit";

// English translation of subscription.he.tsx — DRAFTED, NOT RENDERED. The
// launch-gate checklist lives in the Hebrew file. Change both.

export function SubscriptionEn() {
  return (
    <>
      <p style={legalP}>
        Some features are available on a paid plan. Prices, what each plan
        includes and the billing period are listed on the{" "}
        <Link href="/pricing" style={{ color: "inherit" }}>Pricing</Link> page.
        All prices include VAT. Payments are processed by{" "}
        <Placeholder>payment processor name</Placeholder>; we do not store your
        card details.
      </p>
      <ul style={legalUl}>
        <li style={legalLi}>
          <b>Renewal:</b> a subscription renews automatically at the end of
          each billing period until you cancel. Before an annual plan renews,
          or before a promotional price ends, we will notify you in advance.
        </li>
        <li style={legalLi}>
          <b>Cancel any time:</b> cancel on the{" "}
          <Link href="/account" style={{ color: "inherit" }}>Your data</Link> page,
          the same way you signed up, or by emailing us. Cancellation takes
          effect within 3 business days of your notice, with no cancellation
          fee, and you receive written confirmation. You are not charged for
          any period after cancellation, and any prepaid unused portion is
          refunded pro rata.
        </li>
        <li style={legalLi}>
          <b>Withdrawal from a distance sale:</b> under the Israeli Consumer
          Protection Law 1981 you may cancel within 14 days of the transaction
          or of receiving the disclosure document, whichever is later. Payment
          is refunded within 14 days, less a cancellation fee of 5% of the
          price or ₪100, whichever is lower, and less the proportional value of
          service already provided.
        </li>
        <li style={legalLi}>
          <b>Price changes</b> never apply to a billing period already paid,
          and are announced in advance.
        </li>
        <li style={legalLi}>Nothing here limits any right you have under law.</li>
      </ul>
      <p style={legalP}>
        <Verify>
          Consumer Protection Law §§13D, 14C, 14E and the Consumer Protection
          (Cancellation of Transaction) Regulations 2010 — lawyer review before
          payments go live
        </Verify>
      </p>
    </>
  );
}
