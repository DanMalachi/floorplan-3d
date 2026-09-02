// Headless regression: walking through a patio door must not convert it into a
// single hinged leaf.
//
// The patio slider is a DERIVED default — `effectiveSlide` gives any door at or
// past PATIO_MIN_WIDTH two glazed sliding panels, and NOTHING is written to the
// scene to say so (src/render/doorStyle.ts). The walkthrough's auto-open used to
// branch on the raw `opening.slide` field, so it read every such door as hinged
// and wrote `swingDeg` into it — and `swingDeg` is one of the three fields
// `hasAuthoredDoorStyle` counts as "the user chose this by hand". One approach
// was therefore enough to demote a patio door permanently, and because the write
// goes through the store's gesture path it was autosaved and synced like any
// other edit.
//
// This mirrors the frame loop in WalkthroughMode.tsx: record the borrowed doors,
// damp toward the open target, damp back to 0, and hand them back unstyled on
// settle. Every door function below is the real implementation.
// Run: npx tsx src/viewport3d/walkthrough/derivedPatioDoor.test.ts

import type { Node, Opening, Scene, Wall } from "@/schema/scene";
import { PATIO_MIN_WIDTH } from "@/schema/constants";
import { nodeMap } from "@/lib/rooms/roomArea";
import { effectiveSlide, hasDerivedSlide, withoutAuthoredDoorStyle } from "@/render/doorStyle";
import {
  isDoorClosed,
  dampOpeningValue,
  targetOpenValue,
  applyOpeningValue,
  buildClosedDoorColliders,
} from "./doors";

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) fails++;
};

const OFFSET = { cx: 0, cz: 0 };
const nodes: Node[] = [
  { id: "a", x: 0, y: 0 },
  { id: "b", x: 5, y: 0 },
];
const wall: Wall = { id: "w0", a: "a", b: "b", thickness: 0.15, height: 2.4 };
const NODES = nodeMap(nodes);

function makeScene(openings: Opening[]): Scene {
  return {
    schemaVersion: 2,
    nodes,
    walls: [wall],
    openings,
    rooms: [],
    furniture: [],
  } as unknown as Scene;
}

/** A wide door nobody has styled: no `slide`, no `swingDeg`, no `double`. */
const patio: Opening = {
  id: "d0",
  type: "door",
  wallId: "w0",
  offset: 2.5,
  width: 1.8, // past PATIO_MIN_WIDTH (1.5)
  height: 2.15,
  sill: 0,
  hinge: "start",
};

/** One approach-and-leave: damp to the open target, then back to closed,
 *  exactly as WalkthroughMode's per-frame block does — including the restore
 *  of any door whose slide this rig had to materialise. */
function walkThrough(start: Opening): { o: Opening; frames: number; midway: Opening } {
  const derived = new Set<string>();
  let o = start;
  let frames = 0;
  let midway = start;
  const step = (target: number, capture: boolean) => {
    for (let i = 0; i < 1200; i++) {
      frames++;
      const { value, settled } = dampOpeningValue(o, target, 1 / 60);
      if (capture && i === 10) midway = o;
      if (settled && target === 0 && derived.has(o.id)) {
        derived.delete(o.id);
        o = withoutAuthoredDoorStyle(o);
        return;
      }
      o = { ...o, ...applyOpeningValue(o, value) };
      if (settled) return;
    }
    throw new Error("door never settled");
  };
  // Recorded before the first write, which is the only moment a derived slide
  // is still distinguishable from an authored one.
  if (hasDerivedSlide(o)) derived.add(o.id);
  step(targetOpenValue(o), true);
  step(0, false);
  return { o, frames, midway };
}

console.log("\n-- the derived patio slider --");
{
  const s = effectiveSlide(patio);
  ok(s?.glazed === true && s.panels === 2, `a ${patio.width}m unstyled door derives a 2-panel glazed slider`);
  ok(patio.slide === undefined && patio.swingDeg === undefined, "and stores neither field to say so");
  ok(hasDerivedSlide(patio), "hasDerivedSlide flags it as borrowed");
  ok(isDoorClosed(patio), "it starts closed");
  ok(targetOpenValue(patio) === 1, "its open target is a slide fraction (1), not a swing angle");
}

console.log("\n-- after a walkthrough --");
{
  const { o, midway } = walkThrough(patio);
  ok(midway.slide != null && (midway.slide.open ?? 0) > 0, "mid-approach it animates slide.open");
  ok(midway.swingDeg === undefined, "and never writes a swing angle");

  ok(o.slide === undefined, "back at rest, `slide` is gone again");
  ok(o.swingDeg === undefined, "back at rest, `swingDeg` is gone again");
  ok(!("slide" in o) && !("swingDeg" in o), "the keys are removed, not set to undefined");
  const s = effectiveSlide(o);
  ok(s?.glazed === true && s.panels === 2, "and the width still derives a 2-panel glazed slider");
  ok(isDoorClosed(o), "the door is closed");
}

console.log("\n-- closed-door colliders --");
{
  // The same root cause, one layer down: a derived patio door used to be given
  // a single swing-leaf collider, so the player collided with the wrong shape.
  const patioPanels = buildClosedDoorColliders(makeScene([patio]), NODES, OFFSET);
  const swing = buildClosedDoorColliders(makeScene([{ ...patio, width: 0.9, swingDeg: 0 }]), NODES, OFFSET);
  ok(patioPanels.length >= 2, `a closed patio door blocks with ${patioPanels.length} panels`);
  ok(swing.length === 1, "a closed swing door still blocks with one leaf");
}

console.log("\n-- an authored swing door is untouched --");
{
  // Writing swingDeg by hand is the inspector's way of overriding the width
  // default; the walkthrough must keep honouring it.
  const authored: Opening = { ...patio, id: "d1", swingDeg: 0 };
  ok(!hasDerivedSlide(authored), "a hand-authored swing door is not borrowed");
  ok(effectiveSlide(authored) === undefined, "and derives no slide");
  ok(targetOpenValue(authored) > 1, "its open target is a swing angle");
  const { o } = walkThrough(authored);
  ok(o.swingDeg === 0, "it swings open and shut, and keeps its authored swingDeg");
  ok(o.slide === undefined, "and never gains a slide spec");

  const explicit: Opening = { ...patio, id: "d2", slide: { style: "bypass", panels: 3, glazed: true, open: 0, side: "end" } };
  ok(!hasDerivedSlide(explicit), "a hand-authored slider is not borrowed either");
  const after = walkThrough(explicit).o;
  ok(after.slide?.panels === 3, "and keeps its authored 3 panels through a walkthrough");
}

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
