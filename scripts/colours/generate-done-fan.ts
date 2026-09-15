/**
 * Deterministic generator for done. Home Colours v1.
 *
 * The authored input is a set of residential CIELAB lanes, not a sweep of the
 * RGB cube. Every output colour is brought into sRGB by reducing chroma while
 * preserving lightness and hue. Re-running this file must produce byte-stable
 * JSON; changing a lane is a catalogue-version decision.
 *
 * Run: npx tsx scripts/colours/generate-done-fan.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Use = "wall" | "ceiling" | "trim" | "cabinetry" | "door" | "accent";
type Group = "whites" | "neutrals" | "blacks" | "beiges" | "greens" | "blues" | "warm_earth" | "yellows" | "reds" | "purples";

type Lane = {
  slug: string;
  en: string;
  he: string;
  group: Group;
  count: number;
  light: [number, number];
  a: number;
  b: number;
  undertone: string[];
  specialist?: boolean;
};

const lane = (group: Group, slug: string, en: string, he: string, count: number, light: [number, number], a: number, b: number, undertone: string[], specialist = false): Lane =>
  ({ group, slug, en, he, count, light, a, b, undertone, specialist });

const lanes: Lane[] = [
  // 18 × 12 = 216 whites and off-whites.
  lane("whites", "clean-neutral-white", "Clean Neutral White", "לבן ניטרלי נקי", 12, [98, 76], 0, 1, ["neutral"]),
  lane("whites", "soft-neutral-white", "Soft Neutral White", "לבן ניטרלי רך", 12, [97, 75], 1, 2, ["neutral", "soft"]),
  lane("whites", "warm-ivory", "Warm Ivory", "שנהב חם", 12, [97, 73], 2, 9, ["warm", "yellow"]),
  lane("whites", "cream-white", "Cream White", "לבן שמנת", 12, [97, 72], 3, 12, ["warm", "yellow"]),
  lane("whites", "pink-beige-white", "Pink Beige White", "לבן בז׳ ורדרד", 12, [96, 72], 7, 5, ["warm", "pink"]),
  lane("whites", "peach-beige-white", "Peach Beige White", "לבן בז׳ אפרסקי", 12, [96, 72], 7, 10, ["warm", "peach"]),
  lane("whites", "sand-white", "Sand White", "לבן חולי", 12, [96, 70], 4, 12, ["warm", "sand"]),
  lane("whites", "yellow-beige-white", "Yellow Beige White", "לבן בז׳ צהבהב", 12, [96, 71], 2, 15, ["warm", "yellow"]),
  lane("whites", "olive-grey-white", "Olive Grey White", "לבן אפור זיתי", 12, [96, 70], -3, 9, ["warm", "green"]),
  lane("whites", "green-grey-white", "Green Grey White", "לבן אפור ירקרק", 12, [96, 70], -6, 4, ["cool", "green"]),
  lane("whites", "blue-grey-white", "Blue Grey White", "לבן אפור כחלחל", 12, [96, 70], -3, -7, ["cool", "blue"]),
  lane("whites", "lavender-grey-white", "Lavender Grey White", "לבן אפור לבנדר", 12, [96, 70], 5, -6, ["cool", "violet"]),
  lane("whites", "stone-white", "Stone White", "לבן אבן", 12, [96, 69], 3, 7, ["neutral", "stone"]),
  lane("whites", "mushroom-white", "Mushroom White", "לבן פטרייתי", 12, [95, 68], 6, 5, ["warm", "mushroom"]),
  lane("whites", "linen-white", "Linen White", "לבן פשתן", 12, [96, 70], 4, 10, ["warm", "linen"]),
  lane("whites", "chalk-white", "Chalk White", "לבן גירי", 12, [97, 72], 1, 5, ["neutral", "chalk"]),
  lane("whites", "smoke-white", "Smoke White", "לבן מעושן", 12, [95, 67], 1, -3, ["cool", "smoke"]),
  lane("whites", "deep-off-white", "Deep Off-White", "אוף־וויט עמוק", 12, [92, 64], 4, 7, ["warm", "deep"]),

  // 20 × 12 = 240 greys, greiges and taupes.
  lane("neutrals", "neutral-grey", "Neutral Grey", "אפור ניטרלי", 12, [91, 34], 0, 0, ["neutral"]),
  lane("neutrals", "soft-grey", "Soft Grey", "אפור רך", 12, [92, 38], 1, 2, ["neutral", "soft"]),
  lane("neutrals", "warm-grey", "Warm Grey", "אפור חם", 12, [91, 35], 4, 7, ["warm"]),
  lane("neutrals", "cool-grey", "Cool Grey", "אפור קר", 12, [91, 35], -2, -5, ["cool"]),
  lane("neutrals", "blue-grey", "Blue Grey", "אפור כחול", 12, [90, 33], -4, -10, ["cool", "blue"]),
  lane("neutrals", "green-grey", "Green Grey", "אפור ירוק", 12, [90, 33], -8, 5, ["cool", "green"]),
  lane("neutrals", "lavender-grey", "Lavender Grey", "אפור לבנדר", 12, [90, 33], 7, -7, ["cool", "violet"]),
  lane("neutrals", "mushroom", "Mushroom", "פטרייה", 12, [90, 32], 9, 8, ["warm", "mushroom"]),
  lane("neutrals", "putty", "Putty", "מרק אבן", 12, [90, 32], 6, 11, ["warm", "putty"]),
  lane("neutrals", "stone-grey", "Stone Grey", "אפור אבן", 12, [89, 31], 4, 8, ["neutral", "stone"]),
  lane("neutrals", "balanced-greige", "Balanced Greige", "גרייז׳ מאוזן", 12, [91, 34], 4, 8, ["neutral", "greige"]),
  lane("neutrals", "warm-greige", "Warm Greige", "גרייז׳ חם", 12, [90, 33], 7, 12, ["warm", "greige"]),
  lane("neutrals", "cool-greige", "Cool Greige", "גרייז׳ קר", 12, [90, 33], 1, 5, ["cool", "greige"]),
  lane("neutrals", "soft-taupe", "Soft Taupe", "טאופ רך", 12, [89, 31], 10, 9, ["warm", "taupe"]),
  lane("neutrals", "rose-taupe", "Rose Taupe", "טאופ ורדרד", 12, [88, 30], 13, 5, ["warm", "pink"]),
  lane("neutrals", "olive-taupe", "Olive Taupe", "טאופ זיתי", 12, [88, 30], 2, 13, ["warm", "green"]),
  lane("neutrals", "sand-grey", "Sand Grey", "אפור חול", 12, [90, 33], 4, 13, ["warm", "sand"]),
  lane("neutrals", "mineral-grey", "Mineral Grey", "אפור מינרלי", 12, [87, 29], -2, 2, ["cool", "mineral"]),
  lane("neutrals", "smoke-grey", "Smoke Grey", "אפור מעושן", 12, [86, 27], 2, -3, ["cool", "smoke"]),
  lane("neutrals", "charcoal-transition", "Charcoal Transition", "מעבר פחם", 12, [78, 21], 1, 1, ["neutral", "charcoal"]),

  // 12 × 6 = 72 architectural near-blacks. Pure black is deliberately absent.
  lane("blacks", "neutral-near-black", "Neutral Near-Black", "כמעט שחור ניטרלי", 6, [33, 14], 0, 0, ["neutral"]),
  lane("blacks", "warm-near-black", "Warm Near-Black", "כמעט שחור חם", 6, [35, 16], 4, 6, ["warm"]),
  lane("blacks", "brown-black", "Brown Black", "שחור חום", 6, [34, 15], 8, 8, ["warm", "brown"]),
  lane("blacks", "olive-black", "Olive Black", "שחור זיתי", 6, [34, 15], -1, 8, ["warm", "green"]),
  lane("blacks", "green-black", "Green Black", "שחור ירוק", 6, [34, 15], -7, 3, ["cool", "green"]),
  lane("blacks", "blue-black", "Blue Black", "שחור כחול", 6, [34, 15], -3, -9, ["cool", "blue"]),
  lane("blacks", "navy-black", "Navy Black", "שחור נייבי", 6, [32, 14], 0, -13, ["cool", "blue"]),
  lane("blacks", "plum-black", "Plum Black", "שחור שזיף", 6, [33, 15], 10, -6, ["cool", "plum"]),
  lane("blacks", "warm-charcoal", "Warm Charcoal", "פחם חם", 6, [40, 20], 4, 5, ["warm", "charcoal"]),
  lane("blacks", "cool-charcoal", "Cool Charcoal", "פחם קר", 6, [40, 20], -2, -6, ["cool", "charcoal"]),
  lane("blacks", "brown-charcoal", "Brown Charcoal", "פחם חום", 6, [39, 19], 7, 7, ["warm", "brown"]),
  lane("blacks", "mineral-charcoal", "Mineral Charcoal", "פחם מינרלי", 6, [39, 19], -4, 1, ["neutral", "mineral"]),

  // Chromatic lanes: 528 base colours, all residentially muted.
  ...[
    ["oat", "Oat", "שיבולת שועל", 4, 17], ["linen", "Linen", "פשתן", 5, 14], ["sand", "Sand", "חול", 7, 20],
    ["camel", "Camel", "קאמל", 12, 25], ["beige-mushroom", "Beige Mushroom", "בז׳ פטרייתי", 10, 12],
    ["warm-stone", "Warm Stone", "אבן חמה", 6, 14], ["almond", "Almond", "שקד", 9, 20],
    ["wheat", "Wheat", "חיטה", 8, 25], ["tobacco", "Tobacco Brown", "חום טבק", 18, 28], ["walnut-brown", "Walnut Brown", "חום אגוז", 16, 20],
  ].map(([slug, en, he, a, b]) => lane("beiges", slug as string, en as string, he as string, 12, [92, 35], a as number, b as number, ["warm", "earth"])),
  ...[
    ["pale-sage", "Pale Sage", "מרווה בהירה", -15, 18], ["grey-sage", "Grey Sage", "מרווה אפורה", -13, 12],
    ["eucalyptus", "Eucalyptus", "אקליפטוס", -21, 12], ["soft-olive", "Soft Olive", "זית רך", -11, 25],
    ["deep-olive", "Deep Olive", "זית עמוק", -8, 30], ["moss", "Moss", "טחב", -20, 24],
    ["forest", "Forest", "יער", -28, 13], ["blue-green", "Blue Green", "ירוק כחול", -28, -1],
    ["botanical-green", "Botanical Green", "ירוק בוטני", -34, 18],
  ].map(([slug, en, he, a, b]) => lane("greens", slug as string, en as string, he as string, 12, [91, 29], a as number, b as number, ["cool", "green"])),
  ...[
    ["mist-blue", "Mist Blue", "כחול ערפילי", -10, -14], ["soft-blue-grey", "Soft Blue Grey", "אפור כחול רך", -7, -13],
    ["denim", "Denim", "דנים", -7, -25], ["slate-blue", "Slate Blue", "כחול צפחה", -3, -22],
    ["muted-teal", "Muted Teal", "טורקיז מעושן", -23, -7], ["coastal-blue", "Coastal Blue", "כחול חופי", -14, -25],
    ["navy", "Navy", "נייבי", 1, -32], ["ink-blue", "Ink Blue", "כחול דיו", 4, -27],
  ].map(([slug, en, he, a, b]) => lane("blues", slug as string, en as string, he as string, 12, [91, 28], a as number, b as number, ["cool", "blue"])),
  ...[
    ["blush", "Blush", "סומק", 19, 9], ["dusty-rose", "Dusty Rose", "ורוד מעושן", 24, 9],
    ["clay", "Clay", "חמר", 22, 20], ["terracotta", "Terracotta", "טרקוטה", 31, 30],
    ["rust", "Rust", "חלודה", 31, 36], ["brick", "Brick", "לבנה", 31, 23], ["cinnamon", "Cinnamon", "קינמון", 18, 24],
  ].map(([slug, en, he, a, b]) => lane("warm_earth", slug as string, en as string, he as string, 12, [91, 32], a as number, b as number, ["warm", "earth"])),
  ...[
    ["butter", "Butter", "חמאה", 1, 28, 10], ["straw", "Straw", "קש", 3, 38, 10],
    ["muted-mustard", "Muted Mustard", "חרדל מעושן", 8, 46, 10], ["ochre", "Ochre", "אוכרה", 13, 48, 9],
    ["honey", "Honey", "דבש", 12, 39, 9],
  ].map(([slug, en, he, a, b, count]) => lane("yellows", slug as string, en as string, he as string, count as number, [91, 39], a as number, b as number, ["warm", "yellow"])),
  ...[
    ["dusty-red", "Dusty Red", "אדום מעושן", 31, 18], ["brick-red", "Brick Red", "אדום לבנה", 35, 27],
    ["oxblood", "Oxblood", "אדום דם שור", 37, 15], ["burgundy", "Burgundy", "בורדו", 34, 7],
  ].map(([slug, en, he, a, b]) => lane("reds", slug as string, en as string, he as string, 9, [83, 27], a as number, b as number, ["warm", "red"])),
  ...[
    ["dusty-mauve", "Dusty Mauve", "סגלגל מעושן", 22, -7], ["muted-lilac", "Muted Lilac", "לילך מעושן", 17, -14],
    ["plum", "Plum", "שזיף", 27, -16], ["aubergine", "Aubergine", "חציל", 31, -11],
  ].map(([slug, en, he, a, b]) => lane("purples", slug as string, en as string, he as string, 9, [84, 27], a as number, b as number, ["cool", "violet"])),

  // 96 specialist interior colours, spread across existing major families.
  lane("whites", "soft-plaster", "Soft Plaster", "טיח רך", 12, [94, 67], 5, 9, ["warm", "plaster"], true),
  lane("neutrals", "mineral-plaster", "Mineral Plaster", "טיח מינרלי", 12, [89, 55], 3, 6, ["neutral", "plaster"], true),
  lane("beiges", "wood-adjacent-oak", "Oak Companion", "משלים אלון", 12, [84, 34], 13, 25, ["warm", "wood"], true),
  lane("beiges", "wood-adjacent-walnut", "Walnut Companion", "משלים אגוז", 12, [76, 25], 17, 18, ["warm", "wood"], true),
  lane("blues", "architectural-blue-grey", "Architectural Blue Grey", "אפור כחול אדריכלי", 12, [82, 31], -7, -15, ["cool", "blue", "heritage"], true),
  lane("neutrals", "storm-blue-grey", "Storm Blue Grey", "אפור כחול סוער", 12, [70, 24], -4, -13, ["cool", "blue"], true),
  lane("greens", "heritage-sage", "Heritage Sage", "מרווה מורשת", 12, [78, 28], -17, 17, ["cool", "green", "heritage"], true),
  lane("warm_earth", "heritage-clay", "Heritage Clay", "חמר מורשת", 12, [76, 29], 23, 23, ["warm", "earth", "heritage"], true),
];

const groupOrder: Group[] = ["whites", "neutrals", "blacks", "beiges", "greens", "blues", "warm_earth", "yellows", "reds", "purples"];

function labToRgbRaw([l, a, b]: [number, number, number]): [number, number, number] {
  let y = (l + 16) / 116;
  let x = a / 500 + y;
  let z = y - b / 200;
  const pivot = (v: number) => v ** 3 > 0.008856 ? v ** 3 : (v - 16 / 116) / 7.787;
  x = 0.95047 * pivot(x);
  y = pivot(y);
  z = 1.08883 * pivot(z);
  let r = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  let g = x * -0.969266 + y * 1.8760108 + z * 0.041556;
  let bl = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;
  const gamma = (v: number) => v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return [gamma(r) * 255, gamma(g) * 255, gamma(bl) * 255];
}

function inGamut(rgb: [number, number, number]): boolean {
  return rgb.every((v) => v >= 0 && v <= 255);
}

function fitLab(l: number, a: number, b: number): { lab: [number, number, number]; rgb: [number, number, number] } {
  let scale = 1;
  let raw = labToRgbRaw([l, a, b]);
  while (!inGamut(raw) && scale > 0.02) {
    scale -= 0.01;
    raw = labToRgbRaw([l, a * scale, b * scale]);
  }
  const rgb = raw.map((v) => Math.round(Math.max(0, Math.min(255, v)))) as [number, number, number];
  return { lab: [round(l), round(a * scale), round(b * scale)], rgb };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function hex(rgb: [number, number, number]): string {
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function usesFor(group: Group, lightness: number): Use[] {
  if (group === "whites") return lightness >= 88 ? ["wall", "ceiling", "trim", "cabinetry", "door"] : ["wall", "trim", "cabinetry", "door"];
  if (group === "blacks") return ["cabinetry", "door", "accent"];
  if (lightness >= 80) return ["wall", "cabinetry", "door"];
  if (lightness >= 48) return ["wall", "cabinetry", "door", "accent"];
  return ["cabinetry", "door", "accent"];
}

const swatches: unknown[] = [];
let sortOrder = 0;
for (const group of groupOrder) {
  for (const definition of lanes.filter((item) => item.group === group)) {
    for (let step = 0; step < definition.count; step++) {
      const ratio = definition.count === 1 ? 0 : step / (definition.count - 1);
      const lightness = definition.light[0] + (definition.light[1] - definition.light[0]) * ratio;
      // Slightly deepen chroma along the lane so pale steps remain believable.
      const chromaScale = 0.62 + ratio * 0.38;
      const fitted = fitLab(lightness, definition.a * chromaScale, definition.b * chromaScale);
      const number = String(step + 1).padStart(2, "0");
      swatches.push({
        id: `done-${definition.group}-${definition.slug}-${number}`,
        source: "done",
        displayName: { en: `${definition.en} ${number}`, he: `${definition.he} ${number}` },
        family: definition.group,
        subgroup: definition.slug,
        hex: hex(fitted.rgb),
        rgb: fitted.rgb,
        lab: fitted.lab,
        lightness: fitted.lab[0],
        chroma: round(Math.hypot(fitted.lab[1], fitted.lab[2])),
        undertone: definition.undertone,
        recommendedUses: usesFor(definition.group, fitted.lab[0]),
        availability: "digital_only",
        specialist: Boolean(definition.specialist),
        sortOrder: sortOrder++,
      });
    }
  }
}

if (swatches.length !== 1152) throw new Error(`Expected 1152 swatches, generated ${swatches.length}`);

const output = resolve(process.cwd(), "data/fan.done.v1.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(swatches, null, 2)}\n`, "utf8");
console.log(`Wrote ${swatches.length} swatches to ${output}`);
