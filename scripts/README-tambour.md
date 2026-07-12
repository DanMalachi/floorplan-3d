# Tambour fan-deck import

One-time extraction of the 1651-shade Tambour fan into a static JSON asset.
Run it once, commit `data/tambour-colors.json`, never touch Tambour's servers again.

## Run

```bash
npm i                      # installs playwright + culori (already in package.json)
npx playwright install chromium

# The fan-deck URL is NOT hardcoded — pass it explicitly:
node scripts/scrape.mjs --url="https://…" --headed   # watch the first run
node scripts/normalize.mjs
```

or, via the npm scripts:

```bash
TAMBOUR_URL="https://…" npm run scrape:tambour -- --headed
npm run normalize:tambour
```

`--headed` matters on run #1: you'll see whether the accordions actually opened
or whether a signup modal ate the clicks.

## What the scraper does

It does **not** rely on hardcoded selectors, because the theme (`moveo-theme`)
will change them out from under you.

- **Path A (preferred):** intercepts every JSON response the page makes, deep-walks
  each payload, and looks for any array of objects where some field carries a
  shade code — `\d{4}[A-Z]` (`1097T`), the off-white `OWnnP` (`OW524P`), or a bare
  `\d{3}`. Field roles (code / hex / rgb-fallback / EN name / family / **position**)
  are then inferred by scoring each key against the values it holds, so it works
  regardless of what Tambour called the fields.
- **Path B (fallback):** if the endpoint is nonce-locked or returns HTML, it reads
  computed `background-color` off every swatch-shaped element in the DOM.

Both paths run every time; A wins if it produces rows.

### What Tambour's feed actually looks like (as of the last run)

- One endpoint returns everything: `wp-admin/admin-ajax.php` → `$.data.hues` (1655 rows).
- Each row's `title` is `"Name CODE"` (e.g. `"Fine Day OW524P"`) — split, not two fields.
- **There is no family field** (`color_groups` is empty). Family is recovered by
  `normalize.mjs` from each shade's `position` (its coordinate along the physical
  fan): sort by position, slice at the published per-family counts. The slice
  boundaries land on real gaps in `position`, which corroborates the mapping.
- **There are no Hebrew names** in the feed — `nameHe` is `""` for every shade.
- ~25 rows ship a corrupt `hex_value` (`"#2.36E+100"`, dropped-digit `"#97C98"`);
  `normalize.mjs` falls back to the intact `rgb_value` for those.
- 3–4 off-fan base colours (`WHITE 101`, `BLACK 202`) have no position and are
  excluded — they aren't part of the published 1651.

## Checksum

The fan page prints its own per-family counts. If you don't land on these, the
scrape is incomplete — most likely a family accordion never opened:

| family | count |
|---|---|
| לבנים White | 68 |
| אדומים Red | 246 |
| כתומים Orange | 245 |
| צהובים Yellow | 259 |
| ירוקים Green | 245 |
| כחולים Blue | 245 |
| סגולים Purple | 245 |
| נייטרלים Neutral | 98 |
| **total** | **1651** |

`normalize.mjs` prints this table with ✅ / ⚠️ per row.

## If it fails

Don't debug it blind. Grab:

- `out/report.txt`
- the `JSON endpoints seen` list at the bottom of it
- ~50 lines of `out/network-captures.json` (or `out/dom-candidates.json` if path A found nothing)

That's enough to write the exact field mapping in one shot.

## Output

`data/tambour-colors.json` — 1651 shades, ~180 KB raw, ~40 KB gzipped. Seeded as
`[]` until the first successful scrape.

```ts
{ code: "1029A", nameEn: "Galaxy Blue", nameHe: "", family: "blue",
  hex: "#008c9d", oklch: [0.586, 0.101, 209.7] }
```

`nameHe` is always `""` (the feed carries only English names). Sorted by
family → hue → lightness.

## Using it in the app

Lazy-load it when the colour picker opens; keep it out of the main bundle:

```ts
import { loadTambourColors, groupByFamily } from "@/lib/tambourColors";

const colors = await loadTambourColors();        // code-split, memoized
const byFamily = groupByFamily(colors);
```
