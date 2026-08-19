// Run: npx tsx src/render/frameFinish.test.ts
//
// A frame's look is a WHOLE-HOUSE property, in BOTH halves: a house does not
// have windows in two different colours, and it does not have half its windows
// matte and half polished either. The rule is only worth anything if a change
// really does reach every window and every patio door in the project — the one
// failure mode that looks like nothing happened, because the window you were
// looking at did change.
//
// So the fan-out is pinned here rather than left to the UI: these are the pure
// cores the store's `setFrameColor` / `setFrameFinish` commit, and these cases
// are the ones a per-opening bug would slip through.

import type { Opening, Scene } from "@/schema/scene";
import { frameColorPatch, frameMaterialPatch, frameFinishOf } from "./frameFinish";
import { takesWindowFinish } from "./doorStyle";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const op = (o: Partial<Opening> & { id: string }): Opening => ({
  type: "window", wallId: "w", offset: 2, width: 1.2, height: 1.2, sill: 0.9, ...o,
});

// One of everything that can hang in a wall.
const scene: Scene = {
  schemaVersion: 2,
  units: "meters",
  nodes: [],
  walls: [],
  rooms: [],
  furniture: [],
  openings: [
    op({ id: "win1" }),
    op({ id: "win2" }),
    op({ id: "win3", frameColor: "#ff0000" }), // already a different colour
    op({ id: "winGlossy", frameMaterial: "aluminum-glossy" }),
    op({ id: "winLegacy", frameMaterial: "painted" }), // legacy value from a saved project
    op({ id: "patioWide", type: "door", width: 2.4, height: 2.1, sill: 0 }), // derived patio
    op({ id: "patioSet", type: "door", width: 1.0, height: 2.1, sill: 0, slide: { style: "bypass", panels: 2, glazed: true } }),
    op({ id: "swing", type: "door", width: 0.9, height: 2.0, sill: 0 }),
    op({ id: "closet", type: "door", width: 2.4, height: 2.0, sill: 0, slide: { style: "bypass", panels: 2, glazed: false } }),
    op({ id: "double", type: "door", width: 2.4, height: 2.0, sill: 0, double: true }),
    op({ id: "hole", type: "passage", width: 1.0, height: 2.1, sill: 0 }),
  ],
};

const byId = (s: Scene) => new Map(s.openings.map((o) => [o.id, o]));

console.log("\none pick reaches every window and patio door");
{
  const out = byId(frameColorPatch(scene, "#123456"));
  const shouldTint = ["win1", "win2", "win3", "winGlossy", "winLegacy", "patioWide", "patioSet"];
  for (const id of shouldTint) {
    check(`${id} takes the colour`, out.get(id)!.frameColor === "#123456", `got ${out.get(id)!.frameColor}`);
  }
  // The regression this file exists for: a second window must not keep its own.
  check("no window is left on a different colour",
    new Set(scene.openings.filter(takesWindowFinish).map((o) => out.get(o.id)!.frameColor)).size === 1);
}

console.log("\nand nothing that isn't glazed joinery");
{
  const out = byId(frameColorPatch(scene, "#123456"));
  for (const id of ["swing", "closet", "double", "hole"]) {
    check(`${id} is untouched`, out.get(id)!.frameColor === undefined, `got ${out.get(id)!.frameColor}`);
  }
}

console.log("\nclearing to natural");
{
  const tinted = frameColorPatch(scene, "#123456");
  const out = byId(frameColorPatch(tinted, null));
  check("every frame goes back to natural",
    tinted.openings.filter(takesWindowFinish).every((o) => out.get(o.id)!.frameColor === undefined));
  // `null` from the palette must land as ABSENT, not a literal null: the
  // renderer branches on `tint ?? default`, and a null would read as a colour.
  check("natural is absent, not null", !("frameColor" in out.get("win1")!) || out.get("win1")!.frameColor === undefined);
}

console.log("\ncolour is independent of finish");
{
  const out = byId(frameColorPatch(scene, "#123456"));
  check("a glossy frame keeps its finish", frameFinishOf(out.get("winGlossy")!) === "glossy");
  check("a matte frame keeps its finish", frameFinishOf(out.get("win1")!) === "matte");
  check("the legacy \"painted\" value resolves to matte", frameFinishOf(out.get("winLegacy")!) === "matte");
  check("...and is left in the data, not rewritten", out.get("winLegacy")!.frameMaterial === "painted");
}

console.log("\none finish pick reaches every window and patio door");
{
  const glossy = byId(frameMaterialPatch(scene, "glossy"));
  const shouldChange = ["win1", "win2", "win3", "winGlossy", "winLegacy", "patioWide", "patioSet"];
  for (const id of shouldChange) {
    check(`${id} goes glossy`, frameFinishOf(glossy.get(id)!) === "glossy");
  }
  // The regression this half exists for: `winGlossy` started glossy and the
  // others matte, so a per-opening bug leaves the house mixed.
  check("no frame is left on the other finish",
    scene.openings.filter(takesWindowFinish).every((o) => frameFinishOf(glossy.get(o.id)!) === "glossy"));

  const matte = byId(frameMaterialPatch(scene, "matte"));
  check("and back the other way", scene.openings.filter(takesWindowFinish)
    .every((o) => frameFinishOf(matte.get(o.id)!) === "matte"));
  // Picking a finish is also what retires the legacy value from a project.
  check("choosing a finish normalises the legacy \"painted\" away",
    matte.get("winLegacy")!.frameMaterial === "aluminum-matte");
}

console.log("\nand a finish pick touches nothing else");
{
  const out = byId(frameMaterialPatch(scene, "glossy"));
  for (const id of ["swing", "closet", "double", "hole"]) {
    check(`${id} keeps no frame material`, out.get(id)!.frameMaterial === undefined);
  }
  check("an existing colour survives a finish change", out.get("win3")!.frameColor === "#ff0000");
  check("widths survive too", frameMaterialPatch(scene, "glossy").openings
    .every((o, i) => o.width === scene.openings[i].width));
  check("the source scene is not mutated", scene.openings[0].frameMaterial === undefined);
}

console.log("\ncolour and finish compose");
{
  const both = byId(frameColorPatch(frameMaterialPatch(scene, "glossy"), "#00ff00"));
  check("every frame ends up glossy AND green", scene.openings.filter(takesWindowFinish)
    .every((o) => frameFinishOf(both.get(o.id)!) === "glossy" && both.get(o.id)!.frameColor === "#00ff00"));
}

console.log("\nunrelated scene content survives the patch");
{
  const out = frameColorPatch(scene, "#123456");
  check("opening count unchanged", out.openings.length === scene.openings.length);
  check("widths unchanged", out.openings.every((o, i) => o.width === scene.openings[i].width));
  check("the source scene is not mutated", scene.openings[0].frameColor === undefined);
}

console.log(failures === 0 ? "\nall frame-finish checks passed\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
