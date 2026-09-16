import { Link } from "@/i18n/navigation";
import { legalP, legalUl, legalLi, Verify, Placeholder } from "@/app/[locale]/legal/legalKit";

// Subscription terms — DRAFTED, NOT RENDERED. Shown inside Terms §7 only when
// LEGAL_FACTS.paidPlansLive is true.
//
// ── LAUNCH GATE: do not flip paidPlansLive until every line below is true ────
// The Consumer Protection Law 5741-1981 makes these PRODUCT requirements, not
// wording. Text that promises them without the UX is worse than no text.
//
//  [ ] Operator name + ID/company number + address filled in facts.ts
//      (§14C: required disclosure for a distance sale).
//  [ ] Prices on /pricing are shown INCLUDING VAT, in ₪.
//  [ ] Checkout shows, before payment: price, billing period, renewal, how to
//      cancel, and a link to these Terms — and the customer ticks agreement.
//  [ ] Checkout confirms legal capacity (18+, or guardian consent) — account
//      age 16 is NOT enough to contract. See privacy content, §10 comment.
//  [ ] A written confirmation (email) of the transaction with these details is
//      sent after purchase — needs Resend switched on + privacy policy updated.
//  [ ] /account has a "Cancel subscription" button that works in the SAME
//      channel as signup (the website), with no retention maze, and emails a
//      cancellation confirmation. "Email us to cancel" does NOT satisfy §13D.
//  [ ] Cancellation takes effect within 3 business days, stops future charges,
//      and refunds the unused part of a prepaid period.
//  [ ] Withdrawal within 14 days refunds the payment minus the lesser of 5% or
//      ₪100, within 14 days of the notice.
//  [ ] Renewal reminder email before an annual plan renews / a promo price ends.
//  [ ] Payment processor named in the privacy policy as a data recipient.
//  [ ] A lawyer has read this section.

export function SubscriptionHe() {
  return (
    <>
      <p style={legalP}>
        חלק מהתכונות זמינות בתוכנית בתשלום. המחירים, מה כלול בכל תוכנית
        ותקופת החיוב מפורטים בעמוד{" "}
        <Link href="/pricing" style={{ color: "inherit" }}>המחירים</Link>. כל
        המחירים כוללים מע&quot;מ. התשלום מעובד על ידי{" "}
        <Placeholder>שם ספק הסליקה</Placeholder>, ואנחנו לא שומרים את פרטי כרטיס
        האשראי שלכם.
      </p>
      <ul style={legalUl}>
        <li style={legalLi}>
          <b>חידוש:</b> המנוי מתחדש אוטומטית בסוף כל תקופת חיוב, עד שתבטלו
          אותו. לפני חידוש של מנוי שנתי, או לפני שמחיר מבצע מסתיים, נשלח לכם
          הודעה מראש.
        </li>
        <li style={legalLi}>
          <b>ביטול בכל עת:</b> אפשר לבטל את המנוי בעמוד{" "}
          <Link href="/account" style={{ color: "inherit" }}>המידע שלך</Link>, באותה
          דרך שבה נרשמתם, או בהודעה לכתובת הדוא&quot;ל שלנו. הביטול ייכנס
          לתוקף תוך 3 ימי עסקים מקבלת ההודעה, בלי דמי ביטול, ותקבלו אישור
          בכתב. לא תחויבו על תקופה שאחרי מועד הביטול, ואם שילמתם מראש, יוחזר
          לכם החלק היחסי.
        </li>
        <li style={legalLi}>
          <b>ביטול עסקת מכר מרחוק:</b> לפי חוק הגנת הצרכן, התשמ&quot;א-1981,
          אפשר לבטל את העסקה תוך 14 יום מיום ביצועה או מיום קבלת מסמך
          הגילוי, לפי המאוחר. במקרה כזה יוחזר התשלום תוך 14 יום, בניכוי דמי
          ביטול בשיעור 5% מהמחיר או 100 ש&quot;ח, לפי הנמוך, ובניכוי החלק
          היחסי של השירות שכבר ניתן.
        </li>
        <li style={legalLi}>
          <b>שינוי מחיר:</b> שינוי במחיר המנוי לא יחול על תקופת חיוב ששולמה,
          ונודיע עליו מראש.
        </li>
        <li style={legalLi}>
          אין באמור כדי לגרוע מזכות שעומדת לכם לפי הדין.
        </li>
      </ul>
      <p style={legalP}>
        <Verify>
          סעיפים 13ד, 14ג ו-14ה לחוק הגנת הצרכן ותקנות הגנת הצרכן (ביטול
          עסקה), התשע&quot;א-2010 — לבדיקת עורך דין לפני הפעלת תשלומים
        </Verify>
      </p>
    </>
  );
}
