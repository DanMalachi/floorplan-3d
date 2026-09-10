import { defaultLocale, type Locale } from "@/i18n/routing";
import { APP_HREF } from "@/landing/nav";

export type PricingPlanId = "free" | "paid";

/**
 * Presentation stays independent from billing. When checkout is added, the
 * stable `billingProductKey` is what a provider adapter should map to its own
 * price/product IDs; those IDs never need to leak into this page.
 */
export type PricingAction =
  | { kind: "open-app"; href: typeof APP_HREF }
  | { kind: "unavailable"; billingProductKey: string };

export type PricingPlan = {
  id: PricingPlanId;
  eyebrow: string;
  name: string;
  tagline: string;
  price: string;
  priceNote: string;
  features: readonly { label: string; included: boolean }[];
  cta: string;
  action: PricingAction;
  featured?: boolean;
};

export type PricingContent = {
  meta: { title: string; description: string };
  eyebrow: string;
  title: string;
  intro: string;
  plans: readonly PricingPlan[];
  footnote: string;
};

const EN: PricingContent = {
  meta: {
    title: "Pricing — done.",
    description: "Turn an accurate floor plan into an interactive model. Start one complete project free, or manage every client project with the professional plan.",
  },
  eyebrow: "Plans",
  title: "Make every plan feel real.",
  intro:
    "Turn real measurements into an interactive model you can furnish, refine, share, and walk through. Plan your own home with confidence—or give every client a clear view of what comes next.",
  plans: [
    {
      id: "free",
      eyebrow: "One project · full experience",
      name: "Personal",
      tagline: "See your home before you commit: test the layout, choose what fits, and walk through every decision.",
      price: "Free",
      priceNote: "No card required",
      features: [
        { label: "One interactive project", included: true },
        { label: "Accurate plan → furnish → walkthrough", included: true },
        { label: "Curated, true-to-scale furniture", included: true },
        { label: "Unlimited client projects", included: false },
        { label: "Shareable interactive models", included: false },
        { label: "Live client and team collaboration", included: false },
      ],
      cta: "Start designing free",
      action: { kind: "open-app", href: APP_HREF },
    },
    {
      id: "paid",
      eyebrow: "For ongoing client work",
      name: "Unlimited",
      tagline: "Move from concept to client-ready experience, across every project, without starting over or working alone.",
      price: "Soon",
      priceNote: "Full pricing shared before launch",
      features: [
        { label: "Unlimited interactive client projects", included: true },
        { label: "Accurate plan → furnish → walkthrough", included: true },
        { label: "Complete, true-to-scale furniture collection", included: true },
        { label: "Shareable interactive models", included: true },
        { label: "Live client and team collaboration", included: true },
        { label: "One workspace for ongoing professional work", included: true },
      ],
      cta: "Paid plan coming soon",
      action: { kind: "unavailable", billingProductKey: "paid" },
      featured: true,
    },
  ],
  footnote: "Final pricing and features will be announced before launch; no payment method is needed today.",
};

const HE: PricingContent = {
  meta: {
    title: "מחירים — done.",
    description: "הופכים תוכנית מדויקת למודל אינטראקטיבי. מתחילים בפרויקט מלא אחד בחינם, או מנהלים את כל פרויקטי הלקוחות בתוכנית המלאה.",
  },
  eyebrow: "תוכניות",
  title: "הופכים כל תוכנית לחלל שאפשר לחוות.",
  intro:
    "הופכים מידות אמיתיות למודל אינטראקטיבי שאפשר לרהט, לדייק, לשתף ולטייל בו. תכננו את הבית שלכם בביטחון — או תנו לכל לקוח תמונה ברורה של מה שעומד לקרות.",
  plans: [
    {
      id: "free",
      eyebrow: "פרויקט אחד · החוויה המלאה",
      name: "אישית",
      tagline: "ראו את הבית לפני שמתחייבים: בדקו את החלוקה, בחרו מה באמת נכנס וטיילו בכל החלטה.",
      price: "חינם",
      priceNote: "בלי כרטיס אשראי",
      features: [
        { label: "פרויקט אינטראקטיבי אחד", included: true },
        { label: "תוכנית מדויקת ← ריהוט ← סיור", included: true },
        { label: "מבחר רהיטים מוקפד בקנה מידה אמיתי", included: true },
        { label: "פרויקטים ללקוחות ללא הגבלה", included: false },
        { label: "מודלים אינטראקטיביים לשיתוף", included: false },
        { label: "עבודה משותפת עם לקוחות והצוות בזמן אמת", included: false },
      ],
      cta: "מתחילים לעצב בחינם",
      action: { kind: "open-app", href: APP_HREF },
    },
    {
      id: "paid",
      eyebrow: "לעבודה שוטפת עם לקוחות",
      name: "ללא הגבלה",
      tagline: "עברו מרעיון לחוויה שמוכנה להצגה ללקוח — בכל פרויקט, בלי להתחיל מחדש ובלי לעבוד לבד.",
      price: "בקרוב",
      priceNote: "המחיר המלא יפורסם לפני ההשקה",
      features: [
        { label: "פרויקטים אינטראקטיביים ללקוחות ללא הגבלה", included: true },
        { label: "תוכנית מדויקת ← ריהוט ← סיור", included: true },
        { label: "אוסף רהיטים מלא בקנה מידה אמיתי", included: true },
        { label: "מודלים אינטראקטיביים לשיתוף", included: true },
        { label: "עבודה משותפת עם לקוחות והצוות בזמן אמת", included: true },
        { label: "סביבת עבודה אחת לכל הפרויקטים השוטפים", included: true },
      ],
      cta: "התוכנית המלאה תגיע בקרוב",
      action: { kind: "unavailable", billingProductKey: "paid" },
      featured: true,
    },
  ],
  footnote: "המחיר והיכולות הסופיות יפורסמו לפני ההשקה; אין צורך באמצעי תשלום היום.",
};

const BY_LOCALE: Record<Locale, PricingContent> = { en: EN, he: HE };

export function pricingContent(locale: string): PricingContent {
  return BY_LOCALE[locale as Locale] ?? BY_LOCALE[defaultLocale];
}
