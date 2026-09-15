// The site menu, in one place. Add, remove or reorder here and both the
// desktop bar and the mobile sheet follow.

export type NavItem = {
  labelKey: string;
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

export const NAV: NavItem[] = [
  { labelKey: "about", href: "/about" },
  { labelKey: "pricing", href: "/pricing" },
  { labelKey: "faq", href: "/faq" },
];

export const navItems = (): NavItem[] => NAV.filter((i) => i.enabled !== false);

/**
 * Where "Open done." goes: the PROJECT LIBRARY, every time, signed in or not.
 *
 * `?home=1` is the editor's own "show me the gallery" hatch (src/app/design/page.tsx
 * consumes it, opens the Projects overlay and strips it from the URL so it is
 * not sticky). Landing in the library rather than straight into whatever
 * project happened to be open last is what makes the CTA mean the same thing
 * on every visit — a returning user picks up deliberately instead of being
 * dropped into a plan they may not have wanted, and a first-time visitor sees
 * that projects are a thing at all.
 *
 * It also skips auto-rejoining a live room, which a marketing CTA should never
 * do on its own.
 */
export const APP_HREF = "/design?home=1";

export const FOOTER_LEGAL: NavItem[] = [
  { labelKey: "privacy", href: "/legal/privacy" },
  { labelKey: "terms", href: "/legal/terms" },
  { labelKey: "credits", href: "/legal/credits" },
];

export const footerLegal = (): NavItem[] => FOOTER_LEGAL.filter((i) => i.enabled !== false);
