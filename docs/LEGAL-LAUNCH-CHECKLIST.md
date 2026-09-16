# Legal launch checklist — what Dan still has to do

_Created 2026-09-16. Branch `feat/legal-he`. Tick items off here as they close._

The legal pages are written in Hebrew (binding) and English (translation):
`/legal/privacy`, `/legal/terms`, `/legal/cookies`, `/legal/accessibility`.
Anything still missing shows **on the live page** as an orange
`[[PLACEHOLDER: …]]` or a `[[VERIFY: …]]` marker, so nothing unfinished can
look finished.

**Almost every fact lives in one file: `src/legal/facts.ts`.** Fill a value
there and every page, in both languages, updates. The only exceptions are the
two accessibility-contact items in section 1.

---

## 1. Fill in facts (you, no lawyer needed)

- [ ] **Who runs done.** Decide: you as an עוסק (sole trader), or a בע"מ
      company. Then fill in `facts.ts`:
  - `operatorNameHe` / `operatorNameEn` — full legal name
  - `operatorIdNumber` — ת.ז. / מס' עוסק / ח.פ.
  - `operatorAddressHe` / `operatorAddressEn` — address (a PO box may be OK, ask the lawyer)
  - _Why:_ the privacy law needs a named owner of the database, and the
    Consumer Protection Law requires name + ID + address for any online sale.
    **Must be done before charging anyone.**
- [ ] **Effective date** — `effectiveDateHe` / `effectiveDateEn`, set on launch day.
- [ ] **Accessibility contact** — a name (can be you) and, if the lawyer says
      it is required, a phone number. These two are placeholders directly in
      `src/legal/content/accessibility.he.tsx` and `accessibility.en.tsx`
      (section 4), not in `facts.ts`.

## 2. Lawyer review (one sitting should cover all of it)

Bring this list. Each item is a `[[VERIFY]]` marker on a page.

- [ ] **Transfer of data abroad** (privacy §6) — is "consent + provider
      contracts" a valid basis under the 2001 Transfer Regulations? Also check
      which region Supabase stores the data in (Supabase dashboard → Project
      settings).
- [ ] **Limitation of liability** (terms §9) — capped at what the user paid in
      the last 12 months, or ₪100 if that is higher. Carve-outs for intent,
      gross negligence, bodily injury, consumer rights. Is it safe under the
      Standard Contracts Law 1982?
- [ ] **Vercel log retention** (privacy §3) — how long Vercel keeps request
      logs (check the Vercel plan / dashboard, then state it).
- [ ] **Accessibility** — does the small-business exemption under reg. 35
      apply to you? Is a phone number required, or is email enough?
- [ ] **Subscription terms** (hidden for now, `src/legal/content/subscription.he.tsx`)
      — review before paid plans launch.
- [ ] After review: remove the orange "Draft — not legal advice" banner
      (`DraftBanner` in `src/app/[locale]/legal/legalKit.tsx`, used by every page).

## 3. Before paid plans go live (not needed for a free launch)

Terms currently say the service is free. The subscription section is written
but hidden behind `paidPlansLive: false` in `facts.ts`. **Do not flip it until
all of this exists in the product.** Israeli consumer law makes these product
features, not just wording:

- [ ] Choose a payment processor (then name it in the privacy policy as a data recipient).
- [ ] Prices on `/pricing` shown in ₪ **including VAT**.
- [ ] Checkout shows price, billing period, renewal and how to cancel **before**
      payment, with a checkbox agreeing to the Terms.
- [ ] Checkout confirms the buyer is 18+ (the 16+ account age is not enough to sign a contract).
- [ ] Email receipt after purchase (needs Resend switched on + privacy policy updated).
- [ ] **"Cancel subscription" button on `/account`**, as easy as signing up.
      "Email us to cancel" is not allowed.
- [ ] Cancellation takes effect within 3 business days, stops charges, refunds
      unused prepaid time, and sends a confirmation email.
- [ ] 14-day withdrawal: refund minus 5% or ₪100, whichever is lower.
- [ ] Reminder email before an annual plan renews or a promo price ends.

## 4. Decisions / follow-ups (engineering, when you say go)

- [ ] **Revoke a share link.** There is no button to cancel a single share link
      before its 30 days run out. The privacy policy now says so honestly. A
      "stop sharing" button would be a real privacy improvement.
- [ ] **Accessibility fixes** that would let the statement claim more — see
      `docs/ACCESSIBILITY.md` (glass-panel contrast P1, tertiary text P2,
      focus styles P4, shortcut toggle P5), plus a real screen-reader test pass.
- [ ] **If analytics, ads or Sentry session replay are ever added:** the cookie
      notice has to become a real accept/reject choice first, and the cookie
      and privacy policies must be updated (`src/legal/cookieInventory.ts`).
- [ ] **If Sentry or Resend are switched on in production:** the privacy policy
      already names them as "wired in but off"; update that sentence when they go live.

## 5. Shipping

- [ ] Merge `feat/legal-he` into `main` and push (a push to `main` deploys to production).
