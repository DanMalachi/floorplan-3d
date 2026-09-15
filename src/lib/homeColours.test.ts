// Headless catalogue quality gates. Run: npx tsx src/lib/homeColours.test.ts

import assert from "node:assert/strict";
import fan from "../../data/fan.done.v1.json";
import { COLOUR_FAMILIES, colourNeighbours, filterColours, type ColourSwatch } from "./homeColours";

const colours = fan as ColourSwatch[];
const counts = new Map<string, number>();
for (const colour of colours) counts.set(colour.family, (counts.get(colour.family) ?? 0) + 1);

assert.equal(colours.length, 1152, "catalogue must contain 1,152 shades");
assert.equal(new Set(colours.map((colour) => colour.id)).size, colours.length, "stable IDs must be unique");
assert.equal(new Set(colours.map((colour) => colour.hex)).size, colours.length, "display approximations must remain unambiguous when recovering an existing selection");
assert.ok(colours.every((colour) => colour.source === "done" && colour.availability === "digital_only"), "v1 must be first-party and digital-only");
assert.ok(colours.every((colour) => colour.displayName.en && colour.displayName.he), "every shade must have English and Hebrew names");
assert.ok(colours.every((colour) => /^#[0-9a-f]{6}$/.test(colour.hex)), "every shade must have a normalized sRGB hex");
assert.ok(colours.every((colour) => colour.rgb.length === 3 && colour.rgb.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255)), "every RGB tuple must be in gamut");
assert.ok(colours.every((colour) => colour.lab.length === 3 && colour.lab.every(Number.isFinite)), "every shade must have finite Lab coordinates");
assert.ok(colours.every((colour) => colour.recommendedUses.length > 0), "every shade must have a residential use");
assert.ok(colours.every((colour) => colour.sourceCode === undefined), "first-party shades must not masquerade as supplier codes");
assert.equal(colours.filter((colour) => colour.specialist).length, 96, "specialist set must contain 96 shades");

assert.equal(counts.get("whites"), 228);
assert.equal(counts.get("neutrals"), 264);
assert.equal(counts.get("blacks"), 72);
assert.equal(counts.get("beiges"), 144);
assert.equal(counts.get("greens"), 120);
assert.equal(counts.get("blues"), 108);
assert.equal(counts.get("warm_earth"), 96);
assert.equal(counts.get("yellows"), 48);
assert.equal(counts.get("reds"), 36);
assert.equal(counts.get("purples"), 36);
assert.ok((counts.get("whites")! + counts.get("neutrals")! + counts.get("blacks")!) / colours.length >= 0.46, "neutral section must be at least 46% of the catalogue");

const baseCounts = new Map<string, number>();
for (const colour of colours.filter((item) => !item.specialist)) baseCounts.set(colour.family, (baseCounts.get(colour.family) ?? 0) + 1);
assert.deepEqual(Object.fromEntries(baseCounts), {
  whites: 216, neutrals: 240, blacks: 72, beiges: 120, greens: 108,
  blues: 96, warm_earth: 84, yellows: 48, reds: 36, purples: 36,
});

const byLane = new Map<string, ColourSwatch[]>();
for (const colour of colours) (byLane.get(colour.subgroup) ?? (byLane.set(colour.subgroup, []), byLane.get(colour.subgroup)!)).push(colour);
for (const lane of byLane.values()) {
  lane.sort((a, b) => a.sortOrder - b.sortOrder);
  for (let index = 1; index < lane.length; index++) {
    const a = lane[index - 1];
    const b = lane[index];
    const distance = Math.hypot(a.lab[0] - b.lab[0], a.lab[1] - b.lab[1], a.lab[2] - b.lab[2]);
    assert.ok(distance >= 2, `${a.id} and ${b.id} must be perceptually separated`);
    assert.ok(a.lightness > b.lightness, `${a.id} must be lighter than ${b.id}`);
  }
}

const sample = colours.find((colour) => colour.id === "done-neutrals-warm-grey-06")!;
const neighbours = colourNeighbours(sample, colours);
assert.ok(neighbours.lighter && neighbours.lighter.lightness > sample.lightness);
assert.ok(neighbours.darker && neighbours.darker.lightness < sample.lightness);
assert.ok(neighbours.cooler && !neighbours.cooler.undertone.includes("warm"));
assert.equal(neighbours.similar.length, 5);

const cabinetGreens = filterColours(colours, { family: "greens", warmth: "all", lightness: "dark", saturation: "all", use: "cabinetry", query: "" }, "en");
assert.ok(cabinetGreens.length > 0 && cabinetGreens.every((colour) => colour.family === "greens" && colour.lightness < 40 && colour.recommendedUses.includes("cabinetry")));
assert.deepEqual(COLOUR_FAMILIES, ["whites", "neutrals", "blacks", "beiges", "greens", "blues", "warm_earth", "yellows", "reds", "purples"]);

console.log(`done. Home Colours v1: ${colours.length} shades across ${byLane.size} authored residential lanes — all catalogue gates passed.`);
