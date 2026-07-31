/**
 * BlenderKit furniture pipeline — content rejections.
 *
 * Metadata gates (select.ts) can only judge licence, size and weight. They
 * cannot tell that "Folder HUD Interface" is a UI mockup or that "19th-Century
 * Paper Clutter Waste" is 57 MB of scanned paper. Those calls need eyes, so
 * this list is deliberately hand-curated, explicit, and small enough to review.
 *
 * Keyed by BlenderKit displayName. Each entry carries its reason so the next
 * person can disagree with a specific judgement instead of the whole list.
 *
 * ── Judgements deliberately NOT made here ───────────────────────────────────
 * Two categories of "suspicious" asset were checked against their thumbnails
 * and KEPT, because the app's loader makes them harmless:
 *
 *  • Undersized models ("Ditre Italia Arlott High Sofa" measures 1.23 m for
 *    what is clearly a 2 m daybed; "Wooden Stool 02" is modelled at ~⅔ scale).
 *    src/furniture/catalog.ts normalizes geometry at load time so the plan
 *    bounding box matches the catalog `footprint` — absolute modelled scale is
 *    irrelevant, only aspect ratio matters, and both are close enough.
 *
 *  • Tall bounding boxes ("Dining table" reports h=1.49 m). Its thumbnail shows
 *    the model ships with a vase and plant on the tabletop. Since scaling is
 *    driven by the plan footprint (w, d) and not by height, the table lands at
 *    the right size and the plant rides along correctly.
 */

/** displayName → why it is excluded. */
export const CONTENT_REJECTS: Record<string, string> = {
  // Not physical objects.
  "Folder HUD Interface": "UI mockup, not a physical object",

  // Broken file. The glTF has a texture pointing at a null sampler, which
  // crashes gltf-transform (even `inspect`). It was initially shipped raw on the
  // assumption that three.js would substitute sampler defaults — it does not:
  // GLTFLoader throws "Cannot read properties of undefined (reading 'uri')",
  // the app falls back to treating assetId as a filename, 404s, and renders a
  // white placeholder box. Verified in the running app, not assumed.
  "Jiechen Table": "malformed glTF (null texture sampler) — fails to load in three.js",

  // Props rather than placeable interior-design items.
  Plunger: "utility prop, not furniture",
  "Hair Dryer Salerm 4200": "handheld appliance prop",
  "China Water scoop": "handheld prop",
  "Vintage Flashlight": "handheld prop (miscategorised as ceiling-light)",

  // Desk clutter. Two of these are also the heaviest files in the whole set —
  // 119 MB combined for scanned paper.
  "19th-Century Paper Clutter Waste": "desk clutter prop (57 MB)",
  "Early 1900s Office Mail Opened": "desk clutter prop (62 MB)",
  "Large Stack of Old Office Documents": "desk clutter prop",
  "Office Telegram Clutter": "desk clutter prop",
};

export function isContentRejected(displayName: string): string | null {
  return CONTENT_REJECTS[displayName] ?? null;
}
