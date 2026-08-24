// Single source of truth for the /pricing page (src/app/pricing/page.tsx) and,
// where noted, the comparison table on it. Edit THIS FILE to change tiers,
// prices, cadence, feature rows, or CTA copy — the page just renders whatever
// is here; nothing about pricing lives in the JSX. See docs/PRICING.md.
//
// PRICE FIELDS ARE INTENTIONALLY BLANK (`amount: null`). Dan has not decided
// a tier structure or any prices (commercial-readiness task [17]). The page
// renders a null amount as an obvious [[PLACEHOLDER]] marker — never replace
// null with an invented number "to make it look done." The one exception is
// the Free tier's $0, which isn't a pricing decision: it's a statement of
// fact about the product today (there is no payment provider anywhere in
// this app, so nothing currently costs money — see docs/PRICING.md).
//
// Shape decisions below (three tiers, a monthly/annual toggle, what counts as
// a comparison row) were picked as the most conventional default because the
// task required picking *something* buildable. Every one of them is a
// one-line edit here, not a JSX change — see the report for the full list of
// what Dan may want different.

export type BillingCadence = "monthly" | "annual";

export interface PlanPrice {
  /** Whole-unit price for this cadence, in `currency`. null = not decided
   *  yet; the page renders this as a [[PLACEHOLDER]], never as 0 or blank. */
  amount: number | null;
  /** Lowercase ISO 4217 currency code (e.g. "usd"). null = not decided yet. */
  currency: string | null;
}

export interface PricingPlan {
  id: string;
  name: string;
  tagline: string;
  price: Record<BillingCadence, PlanPrice>;
  /** Shown right after the formatted price, e.g. "per editor / month". */
  priceUnit: string;
  /** At most one plan should set this — renders a "Most popular" ribbon. */
  highlight?: boolean;
  /** Short bullets under the price. Wrap any undecided quantity yourself in
   *  the same "[[PLACEHOLDER: ...]]" text style the /legal pages use — the
   *  page renders these strings as-is, it does not add markers for you. */
  features: string[];
  /** href: null renders an inert, disabled-looking button (there is no
   *  checkout to send anyone to). Only the Free tier should ever get a real
   *  href, and only to somewhere in the app itself — never to a payment
   *  flow, which does not exist. */
  cta: { label: string; href: string | null };
}

/** e.g. 20 -> "save 20% billed annually". null = not decided yet. */
export const annualDiscountPercent: number | null = null;

// ---- Tiers ------------------------------------------------------------------
// Three tiers (Free / Pro / Studio) is the conventional default for this
// shape of product — not a decision Dan has made. Renaming, merging, adding,
// or removing a tier is editing this array; nothing elsewhere needs to
// change.
export const plans: PricingPlan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Trace and build a home in 3D. No account required.",
    price: {
      monthly: { amount: 0, currency: "usd" },
      annual: { amount: 0, currency: "usd" },
    },
    priceUnit: "forever",
    features: [
      "Trace a floor plan and edit it in 3D",
      "Projects saved to this browser automatically",
      "[[PLACEHOLDER: N]] saved plans",
      "Core furniture catalog",
    ],
    cta: { label: "Start for free", href: "/" },
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "[[PLACEHOLDER: who this tier is for]]",
    price: {
      monthly: { amount: null, currency: null },
      annual: { amount: null, currency: null },
    },
    priceUnit: "per month",
    highlight: true,
    features: [
      "Everything in Free",
      "Cloud sync across your devices",
      "Unlimited saved plans",
      "Full furniture catalog",
      "Live share links for collaboration",
    ],
    cta: { label: "Not yet available", href: null },
  },
  {
    id: "studio",
    name: "Studio",
    tagline: "[[PLACEHOLDER: who this tier is for]]",
    price: {
      monthly: { amount: null, currency: null },
      annual: { amount: null, currency: null },
    },
    priceUnit: "per month",
    features: [
      "Everything in Pro",
      "[[PLACEHOLDER: N]] editors per project",
      "Priority support",
      "[[PLACEHOLDER: additional Studio-only feature]]",
    ],
    cta: { label: "Not yet available", href: null },
  },
];

// ---- Feature comparison table -----------------------------------------------
// A row's `values` maps plan id -> true/false (renders check/dash) or a
// string (rendered as-is — wrap any undecided number in [[PLACEHOLDER: ...]]
// yourself, same style as the /legal pages). Rows below are grounded in real
// app capabilities (cloud sync, live share, furniture catalog, import
// formats, export) — none of the row LABELS are invented, only which tier
// gets what, which is exactly the part Dan hasn't decided.
export interface ComparisonRow {
  id: string;
  label: string;
  values: Record<string, boolean | string>;
}

export const comparisonRows: ComparisonRow[] = [
  {
    id: "saved-plans",
    label: "Saved plans",
    values: { free: "[[PLACEHOLDER: N]]", pro: "Unlimited", studio: "Unlimited" },
  },
  {
    id: "cloud-sync",
    label: "Cloud sync across devices",
    values: { free: false, pro: true, studio: true },
  },
  {
    id: "live-share",
    label: "Live share links & real-time collaboration",
    values: { free: "View only", pro: true, studio: true },
  },
  {
    id: "furniture-catalog",
    label: "Furniture catalog",
    values: { free: "Core catalog", pro: "Full catalog", studio: "Full catalog" },
  },
  {
    id: "import-formats",
    label: "Import (image, PDF, DXF/DWG)",
    values: { free: "Image, PDF", pro: "+ DXF/DWG", studio: "+ DXF/DWG" },
  },
  {
    id: "editors-per-project",
    label: "Editors per project",
    values: { free: "1", pro: "[[PLACEHOLDER: N]]", studio: "[[PLACEHOLDER: N]]" },
  },
  {
    id: "data-export",
    label: "Full data export",
    values: { free: true, pro: true, studio: true },
  },
  {
    id: "support",
    label: "Support",
    values: { free: "Community", pro: "Standard", studio: "Priority" },
  },
];

// ---- FAQ ---------------------------------------------------------------------
// Kept intentionally short. Answers hedge with [[PLACEHOLDER]] wherever they'd
// otherwise assert a policy Dan hasn't set.
export interface PricingFaqItem {
  q: string;
  a: string;
}

export const pricingFaq: PricingFaqItem[] = [
  {
    q: "Is there really a free tier?",
    a: "Yes — everything in the Free column above works today, with no account and no payment details required.",
  },
  {
    q: "Can I change plans later?",
    a: "[[PLACEHOLDER: upgrade/downgrade policy, once billing exists]]",
  },
  {
    q: "Do you offer refunds?",
    a: "See the refund & cancellation policy for the current draft — [[PLACEHOLDER: refund window and eligibility]].",
  },
];
