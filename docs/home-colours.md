# done. Home Colours

`data/fan.done.v1.json` is the supplier-neutral, first-party colour catalogue used by the Decorate paint picker. It contains 1,152 digital-only residential shades and is loaded only when the Paint tab opens.

## Regenerating v1

Run `npx tsx scripts/colours/generate-done-fan.ts`, then run `npx tsx src/lib/homeColours.test.ts` and a production build. The generator is deterministic: its authored inputs are residential CIELAB lanes, and it reduces chroma until each candidate fits sRGB. Do not hand-edit the generated JSON.

IDs are permanent within the catalogue version. A display name, translation, or display approximation may be revised without renaming an existing ID. A taxonomy change that would invalidate an ID requires a new catalogue version rather than rewriting v1.

## Visual curation

Automated gates cover counts, localized names, IDs, sRGB gamut, adjacent-lane separation, residential-use tags, and supplier neutrality. Before a release is labelled paint-ready, review all swatches on the app's realistic wall material under north-facing daylight, cool daylight, warm evening light, and in a small room. Reject clipping, banding, fluorescent appearance, and shades without a credible residential use.

The UI disclaimer is mandatory. Screen colour is illustrative and is never a purchase match.

## Supplier catalogues

Do not add supplier names, codes, copied names, or scraped RGB values to the `done` source. A licensed catalogue must use a separate versioned data file, `source`, loader, and source-selector entry, plus a documented licensed refresh flow. It must not replace or merge into the first-party fan.
