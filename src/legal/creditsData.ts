// Static, build-time data for the public /legal/credits page.
//
// WHY THIS EXISTS: the app ships CC-BY-licensed 3D furniture models
// (Sketchfab, some Poly Pizza). CC-BY legally requires visible attribution —
// this module is the single place that turns the raw ATTRIBUTION.json ledgers
// into the structured list the credits page renders. Nothing here is fetched
// at runtime; every import below is a JSON module, so the list is baked into
// the page at build time like any other static content.
//
// Cross-checked against what actually SHIPS: each attribution entry is kept
// only if its id also appears in the corresponding furniture catalog
// (data/furniture-*.catalog.json) — the file the app's furniture picker
// actually loads. An attribution ledger can outlive a model that was later
// dropped from the catalog; listing it anyway would credit something a
// visitor can never place, and worse, would UNDER-credit nothing while
// looking like it covers everything.
//
// The four BlenderKit IKEA-replica items (cd259516, 008228fc, d85ae05e,
// 6122afb7) are being removed from the catalog by a concurrent workstream
// (see fix/remove-ikea). They are CC0 regardless (no attribution required),
// but are excluded here too so this page never names an asset that isn't
// actually shipping.

import sketchfabAttribution from "../../public/furniture/sketchfab/ATTRIBUTION.json";
import polypizzaAttribution from "../../public/furniture/polypizza/ATTRIBUTION.json";
import sketchfabCatalog from "../../data/furniture-sketchfab.catalog.json";
import polypizzaCatalog from "../../data/furniture-polypizza.catalog.json";

export interface CcByCredit {
  title: string;
  /** Author name, as given by the source — may include an @handle. */
  author: string;
  sourceUrl: string;
  licenseUrl: string;
  licenseLabel: string;
}

const EXCLUDED_BLENDERKIT_IDS = new Set([
  "cd259516-4f81-48a5-9097-77789637cbf4",
  "008228fc-e83c-4b13-8b2d-d27e36be1b3e",
  "d85ae05e-ac69-425d-8b2a-693851a9ba6d",
  "6122afb7-3fb5-441e-9fa3-f57de7ebed93",
]);

// "<Title>" by <Author>, <source url>. Licence at <license url>
const ATTRIBUTION_RE = /^"(.+?)" by (.+?), (https?:\/\/\S+?)\.\s*Licence at (https?:\/\/\S+?)\/?$/;

function parseAttribution(raw: string, licenseLabel: string): CcByCredit | null {
  const m = raw.match(ATTRIBUTION_RE);
  if (!m) return null;
  const [, title, author, sourceUrl, licenseUrl] = m;
  return { title, author, sourceUrl, licenseUrl, licenseLabel };
}

type SketchfabAsset = { uid: string; attribution: string };
type PolypizzaAsset = { id: string; licence: string; attribution: string | null };

const sketchfabShippedUids = new Set(
  (sketchfabCatalog as Array<{ assetId: string }>).map((a) => a.assetId.replace(/^sketchfab:/, "")),
);

/** All 16 shipped Sketchfab models are CC-BY-4.0 — every item ships with attribution required. */
export const sketchfabCredits: CcByCredit[] = (sketchfabAttribution.assets as SketchfabAsset[])
  .filter((a) => sketchfabShippedUids.has(a.uid))
  .map((a) => parseAttribution(a.attribution, "CC Attribution 4.0"))
  .filter((c): c is CcByCredit => c !== null);

const polypizzaShippedIds = new Set(
  (polypizzaCatalog as Array<{ assetId: string }>).map((a) => a.assetId.replace(/^polypizza:/, "")),
);

/** Poly Pizza is mixed-license; only the CC-BY items need a credit here. */
export const polypizzaCredits: CcByCredit[] = (polypizzaAttribution.assets as PolypizzaAsset[])
  .filter((a) => polypizzaShippedIds.has(a.id) && a.attribution && a.licence.startsWith("CC-BY"))
  .map((a) => parseAttribution(a.attribution as string, a.licence.replace("CC-BY", "CC Attribution")))
  .filter((c): c is CcByCredit => c !== null);

export const blenderkitExcludedCount = EXCLUDED_BLENDERKIT_IDS.size;
