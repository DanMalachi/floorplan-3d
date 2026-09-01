// The site menu, in one place. Add, remove or reorder here and both the
// desktop bar and the mobile sheet follow.

export type NavItem = {
  label: string;
  href: string;
  /** External or app links get no active-state treatment. */
  external?: boolean;
  /**
   * When false the item is not rendered at all. Used for pages that exist in
   * the repo but are not live yet — a menu item pointing at a 404 is worse
   * than a shorter menu.
   */
  enabled?: boolean;
};

/**
 * `/pricing` and `/legal/refunds` are built and working, but they live on the
 * unmerged `feat/pricing-ui` branch and are gated there by
 * NEXT_PUBLIC_PRICING_UI_ENABLED, because Dan has not settled tiers or prices
 * (see docs/PRICING.md on that branch).
 *
 * Reading that SAME env var here rather than inventing a second flag means the
 * menu item switches itself on the moment the two branches meet and the flag is
 * set — no follow-up edit to remember, and no window where the menu links to a
 * page that returns 404.
 */
const pricingLive = process.env.NEXT_PUBLIC_PRICING_UI_ENABLED === "true";

export const NAV: NavItem[] = [
  { label: "About", href: "/about" },
  { label: "Pricing", href: "/pricing", enabled: pricingLive },
  { label: "FAQ", href: "/faq" },
];

export const navItems = (): NavItem[] => NAV.filter((i) => i.enabled !== false);

/** Where "Open done." goes. The editor, which is served here flag or no flag. */
export const APP_HREF = "/design";

export const FOOTER_LEGAL: NavItem[] = [
  { label: "Privacy", href: "/legal/privacy" },
  { label: "Terms", href: "/legal/terms" },
  { label: "Refunds", href: "/legal/refunds", enabled: pricingLive },
];

export const footerLegal = (): NavItem[] => FOOTER_LEGAL.filter((i) => i.enabled !== false);
