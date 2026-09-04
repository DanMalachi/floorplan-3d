# Every server layout and page under `[locale]` must call `setRequestLocale`

This is not a tidiness rule. Skipping it produces a failure that **the build
reports as passing** and that hits only half the site.

## The failure

next-intl resolves the active locale through `requestLocale`. When a segment has
not pinned it, `requestLocale` falls back to reading the locale out of a request
**header** that the middleware sets. Reading a header is a dynamic API, so a
route Next prerendered as static throws the moment it is actually served:

```
Error: Page changed from static to dynamic at runtime /about, reason: headers
    at get requestLocale
```

The request returns **500**.

Three things make this expensive to diagnose:

1. **`next build` says the route is static (`●`) and exits 0.** The conflict
   only exists at request time, so nothing fails until the page is served.
2. **Only the unprefixed English routes break.** `localePrefix: "as-needed"`
   means `/he/about` carries its locale in the URL and resolves without ever
   consulting the header, so Hebrew returns 200 while English returns 500 — the
   opposite of what "the Hebrew work broke something" leads you to check.
3. **Nothing in the page has to mention i18n.** A server component that renders
   the locale-aware `<Link>` from `src/i18n/navigation.ts` reads the locale, and
   so does anything calling `getLocale()`. Adding one link to a page is enough
   to trip it.

## The rule

Every **server** layout and page under `src/app/[locale]/` takes `params` and
pins the locale as its first statement:

```tsx
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale as Locale);
  // …
}
```

`setRequestLocale` in the root `[locale]/layout.tsx` does **not** cover its
descendants — static generation renders segments in their own scopes, so each
one declares it again.

Prefer `params` over `getLocale()` in these files for the same reason: `params`
is part of the route and stays static; `getLocale()` is a request read.

Two categories are exempt:

- **Client components** (`"use client"`) — `/design`, `/account`,
  `/calibration`, and the components under `src/ui/` and `src/landing/`. They
  read the locale from `NextIntlClientProvider` context via `useLocale()`, which
  is not a request read at all.
- **Routes that are dynamic anyway** — `v/[id]` has no `generateStaticParams`
  and is server-rendered on demand by design, so there is no static/dynamic
  conflict to create.

## How to check

`npm run build` is not sufficient — it passes. Serve the build and request the
**unprefixed** routes:

```bash
npm run build && npm start
for u in / /about /faq /design /legal /legal/privacy /legal/terms; do
  printf '%-20s %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3000$u")"
done
```

Every one must be 200 or a 307 to a real page. A 500 here is this bug.
