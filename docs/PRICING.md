# Pricing & refunds pages

Commercial-readiness tasks [17] (pricing/tiers) and [18] (refunds). Both
pages exist so the shape is ready to fill in later — **Dan has not decided a
tier structure, any prices, or a refund policy.** Nothing described here is
live; nothing on Floorplan → 3D charges money.

## There is no payment provider

This is the single most important fact about this feature: **no Stripe, no
checkout, no billing SDK, no webhook, and no account `plan`/`tier` column
exist anywhere in this codebase.** The pages below are static previews of
what pricing and refunds *could* look like once a payment provider is
chosen and integrated — a separate decision with real legal, PCI, and tax
implications that hasn't been made. Don't let the existence of these pages
be read as "billing is coming soon" — it means exactly what it says: the UI
shell exists, empty.

## Where the config lives

Everything about the pricing page is data, in one file:

- **`src/pricing/plans.ts`** — the tier list, prices (monthly/annual),
  currency, per-plan feature bullets, the feature-comparison table rows, CTA
  label/href per plan, and the FAQ. The page (`src/app/pricing/page.tsx` +
  `PricingContent.tsx`) renders whatever this file says — deciding pricing
  later means editing this file, not touching JSX.
- **`src/pricing/pricingKit.tsx`** — the shared "nothing here charges money"
  banner and a section-label style, used by both new pages. Deliberately
  separate from `src/app/legal/legalKit.tsx`, which is imported by
  `/legal/privacy` and `/legal/terms` — both already live in production —
  so this work never risks their styling.
- **`src/app/legal/refunds/page.tsx`** — the refund/cancellation policy.
  Structured as real sections (overview, free usage, subscriptions,
  cancelling, refund eligibility, proration, failed payments, contact) with
  `[[PLACEHOLDER: ...]]` prose in each, the same style
  `src/app/legal/terms/page.tsx` and `.../privacy/page.tsx` already use, via
  the same `Placeholder`/`DraftBanner` components from `legalKit.tsx`. This
  is content to fill in with a lawyer or Dan, not a config file — there's no
  sensible data shape for legal prose the way there is for a tier table.

## How to fill it in

1. Open `src/pricing/plans.ts`.
2. Replace `amount: null` with a real number, and `currency: null` with a
   real ISO 4217 code (e.g. `"usd"`), for the Pro and Studio tiers'
   `monthly` and `annual` prices. Leave `null` for anything still
   undecided — the page renders that as a visible placeholder rather than
   silently showing something wrong.
3. Replace every `"[[PLACEHOLDER: ...]]"` string (tier taglines, comparison
   table cell limits, FAQ answers) with real copy.
4. Set `annualDiscountPercent` once an annual discount is decided (or
   delete the annual cadence entirely if there won't be one — see "what's
   still a shape decision" below).
5. For `src/app/legal/refunds/page.tsx`, replace each `<Placeholder>...`
   with real policy prose. This one specifically should go through a lawyer
   before it's ever shown to a real customer, same as `/legal/terms` and
   `/legal/privacy`.
6. When both are genuinely ready to be public, see "The flag" below.

## The flag

Both pages are gated behind **one** feature flag,
`NEXT_PUBLIC_PRICING_UI_ENABLED` (`src/lib/featureFlags.ts`,
`pricingUiEnabled`). Default is OFF (unset, or anything other than the exact
string `"true"`). When off, both `/pricing` and `/legal/refunds` call
`notFound()` and return a real 404 — not a page with visible blanks. This is
a deliberately different bar than `/legal/privacy` and `/legal/terms`, which
*are* live in production with unfilled `[[PLACEHOLDER]]`s: a legal draft
reads as a draft, but a pricing page with blank numbers reads as broken or
bait-and-switch, so here the bar is "the route doesn't exist" rather than
"clearly marked draft."

One flag covers both pages because they ship as one unit of work and a
refund policy with no pricing page next to it is a strange thing to expose
on its own. Split them into two flags later if that assumption stops
holding.

Neither route is linked from any nav, footer, dock, or the sitemap
(`src/app/sitemap.ts`), and neither is added to `src/app/robots.ts`. They
are reachable only by someone who types the exact URL, and only on a
deployment where the flag is set.

**Do not set `NEXT_PUBLIC_PRICING_UI_ENABLED=true` in the production
environment** until Dan has actually filled in the placeholders above. It's
meant for local development and preview deployments only, to review the
shape before it's real.

## What's still Dan's decision

The task allowed picking conventional defaults for anything the page's
*shape* forced a choice on, as long as it's a one-line edit later. Every one
of these is that kind of pick, not a business decision already made:

- **Three tiers** (Free / Pro / Studio). Could be two, four, a single paid
  tier, usage-based, or something else entirely — `plans` in
  `src/pricing/plans.ts` is just an array; add, remove, or rename entries.
- **A monthly/annual toggle with an annual discount.** Very common shape,
  but nothing says this product needs one — if there's no annual option,
  delete the `BillingCadence` union down to `"monthly"` and remove the
  toggle in `PricingContent.tsx`.
- **A Free tier priced at literal $0**, mapped to what the app already does
  today for free (trace, build, save locally). This is the one number in
  the file that isn't a placeholder, because it isn't really a pricing
  decision — see "There is no payment provider" above. Whether a Free tier
  should exist at all in the final structure is still open.
- **The comparison-table rows** (saved plans, cloud sync, live share,
  furniture catalog, import formats, editors per project, export, support)
  are grounded in real app capabilities so the page doesn't read as generic
  SaaS filler, but *which tier gets which capability* is entirely
  undecided — most of those cells are `[[PLACEHOLDER: N]]` or a guess.
- **CTA behavior.** Free tier's button links to `/` (the app itself) since
  that's real and safe. Pro/Studio buttons are disabled with the label "Not
  yet available" — there is nothing to link them to (no checkout, no
  waitlist form, no contact-sales flow). Whether Dan wants an email capture,
  a "contact us," or something else instead is open.
- **The refund policy's section structure** (overview → free usage →
  subscriptions → cancelling → eligibility → proration → failed payments →
  contact) is the conventional shape for this kind of document, so a lawyer
  or Dan has real sections to fill rather than inventing structure from a
  blank page. The actual terms in each section are 100% undecided.
- **A short FAQ** (3 items) was added to the pricing page as a conventional
  pricing-page element. Delete `pricingFaq` and its render block in
  `PricingContent.tsx` if it's not wanted.

## What this explicitly does NOT include

Per the task's scope, none of the following exist anywhere in this branch,
and building any of them is a separate decision:

- No Stripe or any other payment/billing SDK, dependency, or API key.
- No checkout, subscription-creation, or webhook code of any kind.
- No account `plan`/`tier` column, migration, or entitlement/gating logic —
  every user can use every feature today regardless of what the pricing
  page shows, because there is no enforcement mechanism and none was built.
- No real prices. Every dollar figure that could be mistaken for a real
  decision is either `null` (renders as a placeholder) or the factual `$0`
  for what's already free.
