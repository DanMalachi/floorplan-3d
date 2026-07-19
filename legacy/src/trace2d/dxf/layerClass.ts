// -----------------------------------------------------------------------------
// CAD layer taxonomy. Clean vector plans carry their semantics in layer NAMES —
// a stroke on "A-FURN" is furniture, "Muro1" is a wall, "PUB_DIM" is a dimension.
// Exploiting that is the single biggest lever DXF/DWG gives us over raster: we can
// throw away non-structural clutter BEFORE geometric wall detection instead of
// fighting it downstream.
//
// The matcher is deliberately multilingual and multi-standard because these files
// come from anywhere: English, Hebrew, Spanish/Portuguese/Italian, French, German,
// plus the AIA (A-WALL, A-GLAZ, S-COLS…) and ISO 13567 layer conventions.
//
// Design rules that keep it SAFE:
//  • Tokenize the name (split on separators, camelCase, letter/digit borders) and
//    match whole tokens or token-prefixes — never raw substrings — so "window"
//    doesn't get matched inside "winter" and "dr" doesn't hit everything.
//  • WALL wins ties. We would rather keep a mislabeled furniture layer than ever
//    silently drop a real wall.
//  • Unrecognized → "unknown", which is always KEPT for wall detection. Absence of
//    a match never removes geometry.
// -----------------------------------------------------------------------------

export type LayerRole =
  | "wall"
  | "opening" // doors + windows (handled by the openings detector, not walls)
  | "stair"
  | "structure" // columns, beams, steel
  | "fixture" // sanitary, plumbing fixtures, kitchen/appliances
  | "furniture"
  | "dimension"
  | "annotation" // text, tags, leaders, titles, symbols
  | "electrical"
  | "mep" // hvac / mechanical / piping
  | "hatch" // fills, poché, patterns
  | "grid" // axes, reference grid, section marks
  | "landscape" // trees, planting, site
  | "unknown";

// token -> role. Tokens are matched exactly OR as a prefix (see matchToken).
// Ordered loosely by specificity; the scoring below enforces priority anyway.
const KEYWORDS: Record<string, LayerRole> = {};
const add = (role: LayerRole, ...words: string[]) => words.forEach((w) => (KEYWORDS[w] = role));

// WALL — many languages + AIA/ISO. Short tokens (wal, mur, kir) are matched as
// whole tokens only to avoid false hits.
add("wall", "wall", "walls", "wal", "wll", "awall", "iwall", "cwall", "partition", "partitions", "part",
  "mur", "murs", "muro", "muros", "muri", "muraria", "pared", "paredes", "parede", "paredi", "parete", "pareti",
  "wand", "waende", "wände", "mauer", "mauern", "kir", "kirot", "kiro", "קיר", "קירות",
  "cloison", "cloisons", "tramezzi", "tabique", "tabiques");

// OPENING — doors & windows & glazing.
add("opening", "door", "doors", "dr", "drs", "porte", "portes", "porta", "porte", "puerta", "puertas",
  "tur", "tür", "tuer", "turen", "delet", "delatot", "דלת", "petach", "pethach", "פתח",
  "window", "windows", "win", "wnd", "wdw", "glaz", "glazing", "glass", "vitr", "vitrage",
  "ventana", "ventanas", "fenetre", "fenetres", "fenster", "finestra", "finestre", "chalon", "חלון",
  "gate", "opening", "openings", "jamb");

// STAIR / RAMP.
add("stair", "stair", "stairs", "stairway", "escalier", "escalera", "escaleras", "scala", "scale",
  "treppe", "madrega", "madregot", "מדרגות", "ramp", "ramps", "rampa", "step", "steps");

// STRUCTURE — columns, beams, steel. (Matches legacy "steel" noise entry.)
add("structure", "col", "cols", "column", "columns", "colonne", "columna", "columnas", "pilar", "pilares",
  "pillar", "beam", "beams", "poutre", "viga", "vigas", "steel", "struct", "structural", "amud", "amudim",
  "עמוד", "rebar", "concrete", "conc", "foundation", "found");

// FIXTURE — sanitary, plumbing fixtures, kitchen/appliances.
add("fixture", "sanit", "sanitary", "sanita", "sanitario", "sanitarios", "plumb", "plumbing",
  "wc", "toilet", "toilets", "bath", "bathroom", "shower", "sink", "basin", "lavabo", "inodoro",
  "tub", "bidet", "urinal", "kitchen", "cocina", "cucina", "appliance", "appliances", "equip", "equipment",
  "fixture", "fixtures", "faucet", "drain", "sanit1");

// FURNITURE — casework, mobiliary.
add("furniture", "furn", "furniture", "furnitures", "rihut", "ריהוט", "mobili", "mobfilier", "mobilier",
  "muebles", "mobiliario", "mobel", "möbel", "moebel", "casework", "millwork", "cabinet", "cabinets",
  "closet", "bed", "sofa", "chair", "table", "desk", "wardrobe", "arredo", "arredi");

// DIMENSION.
add("dimension", "dim", "dims", "dimension", "dimensions", "dimen", "quote", "quotes", "cota", "cotas",
  "cotation", "bemassung", "bemas", "mesure", "measure", "measures", "misure", "quota", "quote",
  "pubdim", "dimline", "dimensionamento");

// ANNOTATION — text, tags, leaders, titles, symbols, tables.
add("annotation", "text", "txt", "texto", "testo", "texte", "anno", "annot", "annotation", "annotations",
  "label", "labels", "tag", "tags", "note", "notes", "title", "titre", "titulo", "titolo", "leader",
  "leaders", "callout", "symbol", "symbols", "legend", "schedule", "table", "keynote", "north", "logo",
  "defpoints", "revcloud", "revision", "stamp", "border", "titleblock", "sheet", "frame");

// ELECTRICAL.
add("electrical", "elec", "elect", "electr", "electrical", "electrico", "electrique", "elektro",
  "power", "light", "lights", "lighting", "luminaire", "switch", "outlet", "socket", "wiring", "circuit",
  "iluminacion", "eclairage", "chashmal", "חשמל");

// MEP — mechanical / hvac / piping.
add("mep", "mech", "mechanical", "hvac", "duct", "ducts", "pipe", "pipes", "piping", "vent", "ventilation",
  "cvc", "climatisation", "clim", "heating", "cooling", "gas", "supply", "return", "drainage", "sewer");

// HATCH / FILL / POCHÉ.
add("hatch", "hatch", "hatching", "hatched", "fill", "fills", "solid", "poche", "pattern", "patterns",
  "shade", "shading", "tratteggio", "trama", "achurado", "hachure");

// GRID / AXIS / REFERENCE.
add("grid", "grid", "grids", "axis", "axes", "axe", "axes", "eje", "ejes", "achse", "achsen", "asse", "assi",
  "reference", "ref", "datum", "section", "sections", "elevation", "elev", "detail", "centerline", "cl",
  "centre", "center", "guideline", "construction", "constr", "aux", "auxiliary", "viewport", "vport");

// LANDSCAPE / SITE / GREENERY. (Covers legacy "nof …" and "2TREE_PT".)
add("landscape", "tree", "trees", "plant", "plants", "planting", "veg", "vegetation", "garden", "green",
  "grass", "lawn", "shrub", "hedge", "landscape", "site", "terrain", "nof", "pituach", "pitoach", "נוף",
  "gina", "flora", "arbol", "arbre", "arbre", "jardin", "giardino");

// Priority for tie-breaking: higher wins. WALL must be highest so a wall layer is
// never overridden by an incidental non-wall token in its name.
const PRIORITY: Record<LayerRole, number> = {
  wall: 100,
  opening: 90,
  stair: 80,
  structure: 70,
  fixture: 60,
  furniture: 55,
  hatch: 50,
  dimension: 45,
  annotation: 40,
  mep: 35,
  electrical: 30,
  grid: 25,
  landscape: 20,
  unknown: 0,
};

// Split a layer name into comparable tokens: lowercase, break on non-alphanumeric,
// on camelCase humps, and on letter<->digit borders ("Muro1" -> muro, 1).
function tokenize(name: string): string[] {
  const spaced = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([A-Za-z])/g, "$1 $2");
  return spaced
    .toLowerCase()
    .split(/[^a-z0-9֐-׿]+/) // keep Hebrew block
    .filter(Boolean);
}

function roleOfToken(tok: string): LayerRole | null {
  if (KEYWORDS[tok]) return KEYWORDS[tok];
  // Prefix match for descriptive tokens (length ≥ 4 to avoid noise), e.g.
  // "furniture", "dimensioni", "windows2".
  if (tok.length >= 4) {
    for (const key in KEYWORDS) {
      if (key.length >= 4 && (tok.startsWith(key) || key.startsWith(tok))) return KEYWORDS[key];
    }
  }
  return null;
}

const cache = new Map<string, LayerRole>();

/** Classify a CAD layer name into a semantic role. Unknown/empty → "unknown". */
export function classifyLayer(name: string | null | undefined): LayerRole {
  if (!name) return "unknown";
  const hit = cache.get(name);
  if (hit) return hit;
  let best: LayerRole = "unknown";
  for (const tok of tokenize(name)) {
    const role = roleOfToken(tok);
    if (role && PRIORITY[role] > PRIORITY[best]) best = role;
  }
  cache.set(name, best);
  return best;
}

// Roles that are NOT walls and should be removed before geometric wall detection.
// "stair" and "unknown" are intentionally kept (stairs are handled by the hatch
// filter; unknown must never be dropped). "structure" is dropped to preserve the
// legacy behavior where the "steel" layer was noise.
const WALL_NOISE: ReadonlySet<LayerRole> = new Set<LayerRole>([
  "opening",
  "structure",
  "fixture",
  "furniture",
  "dimension",
  "annotation",
  "electrical",
  "mep",
  "hatch",
  "grid",
  "landscape",
]);

/** True when a layer is clutter that should be excluded from wall detection. */
export function isWallNoiseLayer(name: string | null | undefined): boolean {
  return WALL_NOISE.has(classifyLayer(name));
}

/** True when a layer is confidently a wall layer (used for positive restriction). */
export function isWallLayer(name: string | null | undefined): boolean {
  return classifyLayer(name) === "wall";
}

// Clutter for OPENING detection. Unlike wall detection, this KEEPS the `opening`
// role (door/window/glazing layers are the *primary* evidence for openings) and
// keeps `wall`/`stair`/`unknown`; it drops only the non-structural clutter.
const OPENING_CLUTTER: ReadonlySet<LayerRole> = new Set<LayerRole>([
  "structure",
  "fixture",
  "furniture",
  "dimension",
  "annotation",
  "electrical",
  "mep",
  "hatch",
  "grid",
  "landscape",
]);

/** True when a layer is clutter for opening detection (keeps wall/opening/stair). */
export function isClutterLayer(name: string | null | undefined): boolean {
  return OPENING_CLUTTER.has(classifyLayer(name));
}
