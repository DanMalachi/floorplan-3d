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

  // Replicas of named IKEA products. CC0 covers the uploader's mesh, not IKEA's
  // design or trademark, and IKEA content is a launch legal blocker.
  "ÅRSTID Floor lamp": "IKEA product replica",
  "ÅRSTID Table lamp": "IKEA product replica",
  "Ikea modern chair": "IKEA product replica",
  "Ikea Onnestad Red Armchair": "IKEA product replica",

  // Named products / designer pieces the BRAND_TERMS scan cannot see, judged
  // from their metadata 2026-09-15. Conservative by design: a proper-noun model
  // name or product-sheet copy is enough, because the rule is reject-on-doubt.
  "Cross FIxed Table": "named manufacturer product (description quotes the manufacturer)",
  "Tauari table": "designer piece (\"made by Brazilian designer Lucas Neves\")",
  "Bedside Table Arrondi": "named product line (\"The Arrondi Bedside Table\", product-sheet copy)",
  "Cambridge Desk": "proper-noun model name, likely a named retail product",
  "Elza Curio Cabinet - Light Wood": "proper-noun model name + finish variant, likely a named retail product",
  "Luxor Leather Couch": "proper-noun model name, likely a named retail product",
  "Sofa Salvador": "proper-noun model name, likely a named retail product",
  "Wockel table": "proper-noun model name, likely a named product",
  "Giravolta lamp": "named designer lamp (Giravolta)",
  "Wooden shelving unit furniture": "replica of an unnamed real product (\"based on a real-world furniture, with accurate measurements\")",
  "Modern coffee table": "replica of an unnamed real product (\"based on a real-world furniture, with accurate measurements\")",

  // Shipped (baseline) items REMOVED 2026-09-15 on Dan's brand rule. The
  // term scan (BRAND_TERMS) catches Carl Hansen ×2, Ditre Italia, Miomare,
  // Lampe Gras and TJ Maxx; these are the ones it cannot see.
  "Vincent shepard Teo": "named product — Vincent Sheppard (furniture brand) 'Teo' chair",
  "Trecento Sessanta": "named designer product name, not a description",
  "Marina Bench without Backrest": "manufacturer product-sheet copy for a named 'Marina' bench line",
  "Bench Alley Loft Classic": "named retail product ('Alley Loft Classic')",
  "Coffee Cart 01": "commercial café equipment (brewer, carafes), not home furniture",

  // Visual QA of the 2026-09-15 contact sheet (optimized glbs rendered with
  // three.js GLTFLoader). Each passed every metadata and measured-size gate.
  "Industrial Storage Cart": "broken export: single material, baseColor black, texture unbound — renders solid black",
  "Tool Cart": "broken export: single material, baseColor black, texture unbound — renders solid black",
  "Chinese Tea Table": "broken export: single material, baseColor black, texture unbound — renders solid black",
  "Blue Striped beach chair": "textures lost in conversion — renders plain white, not the striped fabric",
  "Procedural Table GN": "shader-node materials do not survive glTF export — renders untextured white",
  "Corner Lamp RGB": "transmission-only materials — renders as a near-invisible white stick",
  "Corner Lamp Warm White": "transmission-only materials — renders as a near-invisible white stick",
  "Stone Bench (Photoscanned)": "photoscan ships with its patch of ground",
  "SciFi Armchair": "spaceship seat, not home furniture",
  "Old Hospital Bed": "medical equipment, not home furniture",
  "Chest of drawers": "untextured 50-face box with no drawer detail",
  "Wood table-Freepoly.org": "mislabelled — the model is a wheeled trolley, not a table",
  "Metal Bench": "replica of a bench from the video game Cyberpunk 2077 (trademarked IP)",
};

export function isContentRejected(displayName: string): string | null {
  return CONTENT_REJECTS[displayName] ?? null;
}

/**
 * Branded-product / named-design scan (Dan's standing rule, 2026-09-15): CC0
 * covers the uploader's mesh, not a manufacturer's design or trademark, so any
 * asset whose name, description or tags point at a real furniture brand,
 * designer or named product is rejected — no ship-with-caveat.
 *
 * Built from a full scan of the 390-entry index, not from guesses: every term
 * here occurs in at least one asset's metadata ("Bedside table ... By
 * Minotti", "Fan made 3D model of the Soave Armchair designed by Sebastian
 * Herkner for Moooi", "Amazon brand", "Made by the Brazilian studio
 * Jabuticasa"), plus the obvious names of the big design houses. A match is
 * a rejection for every item, the frozen baseline (baseline.ts) included —
 * Dan's call 2026-09-15: brand-named pieces are removed, not just reported.
 *
 * Proper-noun model names with no brand in the text ("Cambridge Desk",
 * "Elza Curio Cabinet") cannot be caught by a term list; those are judged by
 * eye and listed in CONTENT_REJECTS instead.
 */
const BRAND_TERMS = [
  // Retailers / manufacturers seen in the index.
  "ikea", "minotti", "moooi", "brabbu", "fratini", "gantri", "stilnovo", "delta ?light",
  "amazon brand", "rivet kingston", "jabuticasa", "atelier voler", "pollus", "toco arquitetura",
  "ditre", "carl[- ]?hansen", "miomare", "tj ?maxx", "salerm",
  // Designers seen in the index.
  "noguchi", "herkner", "lissoni", "lampe[- ]?gras", "jiechen", "flatiron",
  // Design houses and designers not (yet) in the index — cheap insurance.
  "vitra", "herman ?miller", "eames", "knoll", "cassina", "b&b italia", "poltrona frau",
  "fritz ?hansen", "muuto", "kartell", "artemide", "louis ?poulsen", "ligne roset",
  "cattelan", "calligaris", "thonet", "wegner", "arne jacobsen", "saarinen", "breuer",
  "wassily", "panton", "tolix", "bertoia", "corbusier", "tom dixon", "west elm",
  "pottery barn", "crate ?(&|and) ?barrel", "wayfair", "roche bobois", "natuzzi",
  "boconcept", "restoration hardware", "flexform", "molteni", "rolf benz", "de sede",
  "anglepoise", "ant[_ ]chair", "egg chair", "barcelona chair", "cyberpunk",
  // Wording that marks a replica of a specific product.
  "replica", "fan made", "design rights", "designed by", "inspired by the",
];
const BRAND_RE = new RegExp(`(^|[^a-z])(${BRAND_TERMS.join("|")})`, "i");

export function brandHit(e: { name: string; displayName: string; description: string; tags: string[] }): string | null {
  const text = [e.name, e.displayName, e.description, e.tags.join(" ")].join(" • ");
  const m = text.match(BRAND_RE);
  return m ? m[2] : null;
}
