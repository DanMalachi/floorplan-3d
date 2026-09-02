// Headless: proves the door-swing useMemo narrowing added to
// WalkthroughMode.tsx (blockingColliders/doorAnchors keyed off `doorSig`
// instead of off `scene` directly) never lets a closed door go unblocked —
// the CRITICAL correctness trap called out in the perf handoff — while also
// confirming the narrowing actually cuts the number of expensive
// buildClosedDoorColliders recomputes during a swing, which is the whole
// point of the change.
//
// `doorGeometryKey`/`doorSig` themselves live private to WalkthroughMode.tsx
// (a component file with react-three/fiber hooks, not importable headlessly
// the way this repo's other `*.test.ts` scripts import plain modules), so
// this mirrors that exact field list rather than importing it. Every OTHER
// function used below (`isDoorClosed`, `dampOpeningValue`, `targetOpenValue`,
// `buildClosedDoorColliders`, `nodeMap`) is the real, imported implementation
// — only the key-building is a deliberate parallel copy, kept next to a
// pointer back to the source so the two can be eyeballed together if either
// changes. Run: npx tsx src/viewport3d/walkthrough/doorSig.test.ts

import type { Node, Opening, Scene, Wall } from "@/schema/scene";
import { nodeMap } from "@/lib/rooms/roomArea";
import { effectiveSlide } from "@/render/doorStyle";
import { isDoorClosed, dampOpeningValue, targetOpenValue, buildClosedDoorColliders } from "./doors";

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) fails++;
};

// Mirrors WalkthroughMode.tsx's `doorGeometryKey` — see that file for the
// full rationale. Keep in sync if the real one's field list changes.
function doorGeometryKey(o: Opening): string {
  const s = effectiveSlide(o);
  return [
    o.id,
    o.wallId,
    o.offset,
    o.width,
    o.height,
    o.sill,
    o.hinge ?? "",
    o.double ? 1 : 0,
    (o.leafSplit ?? []).join(","),
    s ? `${s.style}:${s.panels}:${s.glazed ? 1 : 0}:${s.side ?? ""}` : "",
    isDoorClosed(o) ? 1 : 0,
  ].join(":");
}
function doorSigOf(openings: Opening[]): string {
  return openings
    .filter((o) => o.type === "door")
    .map(doorGeometryKey)
    .join("|");
}

const OFFSET = { cx: 0, cz: 0 };

const nodes: Node[] = [
  { id: "a", x: 0, y: 0 },
  { id: "b", x: 4, y: 0 },
];
const wall: Wall = { id: "w0", a: "a", b: "b", thickness: 0.15, height: 2.4 };
const door: Opening = {
  id: "d0",
  type: "door",
  wallId: "w0",
  offset: 2,
  width: 0.9,
  height: 2.05,
  sill: 0,
  swingDeg: 0,
  hinge: "start",
};

function makeScene(openings: Opening[]): Scene {
  return {
    schemaVersion: 2,
    units: "meters",
    nodes,
    walls: [wall],
    openings,
    rooms: [],
    furniture: [],
  };
}

const nodeM = nodeMap(nodes);

/** Ground truth: recomputed fresh every frame, exactly like the ORIGINAL
 *  (pre-fix) unnarrowed `useMemo([scene, offset, nodes])` did. */
function groundTruthColliders(openings: Opening[]) {
  return buildClosedDoorColliders(makeScene(openings), nodeM, OFFSET);
}

// --- Simulate a full open/close swing, exactly the way WalkthroughMode's
// useFrame drives it: damp toward a target each frame with the real
// `dampOpeningValue`, at a plausible frame delta. ------------------------
const DT = 1 / 60;
let opening = { ...door };
let memoSig: string | null = null;
let memoColliders: ReturnType<typeof groundTruthColliders> = [];
let recomputes = 0;
let frames = 0;
let sawClosedTrueBlocked = false;
let sawOpenOrSwingingUnblocked = false;

function tick(target: number) {
  const { value, settled } = dampOpeningValue(opening, target, DT);
  opening = { ...opening, swingDeg: value };
  frames++;

  const sig = doorSigOf([opening]);
  if (sig !== memoSig) {
    memoSig = sig;
    memoColliders = groundTruthColliders([opening]); // the "expensive" recompute
    recomputes++;
  }
  const truth = groundTruthColliders([opening]);

  // The load-bearing assertion: whatever the memo returns must always agree
  // with a full from-scratch recompute — a closed door is never missing its
  // collider, and an open/swinging door is never carrying a stale one.
  const agree = memoColliders.length === truth.length;
  if (!agree) {
    ok(false, `frame ${frames} swingDeg=${value.toFixed(2)} closed=${isDoorClosed(opening)}: memoized colliders (${memoColliders.length}) != ground truth (${truth.length})`);
  }
  if (isDoorClosed(opening)) {
    if (truth.length !== 1) ok(false, `frame ${frames}: door reports closed but ground truth has ${truth.length} colliders (expected 1)`);
    sawClosedTrueBlocked = sawClosedTrueBlocked || (memoColliders.length === 1 && agree);
  } else {
    if (truth.length !== 0) ok(false, `frame ${frames}: door reports open/swinging but ground truth has a collider`);
    sawOpenOrSwingingUnblocked = sawOpenOrSwingingUnblocked || (memoColliders.length === 0 && agree);
  }
  return settled;
}

// Phase 0: sits closed for a few frames (player walking around elsewhere).
for (let i = 0; i < 10; i++) tick(0);
ok(isDoorClosed(opening), "setup: door starts closed");

// Phase 1: swing OPEN (approach trigger fires target = doorOpenSwingDeg).
const openTarget = targetOpenValue(opening);
let settledOpen = false;
let openFrames = 0;
while (!settledOpen && openFrames < 600) {
  settledOpen = tick(openTarget);
  openFrames++;
}
ok(settledOpen, `door settles open within a bounded number of frames (took ${openFrames})`);
ok(!isDoorClosed(opening), "door reports open once settled");

// Phase 2: linger open for a while (player walking through/around).
for (let i = 0; i < 20; i++) tick(openTarget);

// Phase 3: swing CLOSED (retreat trigger fires target = 0).
let settledClosed = false;
let closeFrames = 0;
while (!settledClosed && closeFrames < 600) {
  settledClosed = tick(0);
  closeFrames++;
}
ok(settledClosed, `door settles closed within a bounded number of frames (took ${closeFrames})`);
ok(isDoorClosed(opening), "door reports closed once settled — THE closed-door-blocks case");

// The actual walk-through-a-closed-door check: at the very last frame, with
// the door back at rest and closed, the memoized collider list must contain
// exactly one blocking collider, matching a fresh recompute.
const finalTruth = groundTruthColliders([opening]);
ok(finalTruth.length === 1, "final frame: fresh recompute has exactly one closed-door collider");
ok(memoColliders.length === 1, "final frame: MEMOIZED collider list also has exactly one — the door still blocks");
ok(memoSig === doorSigOf([opening]), "final frame: memo is not stale — doorSig matches current state");

ok(sawClosedTrueBlocked, "at some point while closed, the memoized list correctly blocked");
ok(sawOpenOrSwingingUnblocked, "at some point while open/swinging, the memoized list correctly did not block");

// The perf half of the claim: the expensive recompute should have fired only
// a handful of times (crossing the closed/open threshold on the way out and
// on the way back), not once per frame of the ~90-120 frame round trip.
const totalFrames = frames;
console.log(`INFO  ${totalFrames} total frames simulated, ${recomputes} memo recomputes (${((recomputes / totalFrames) * 100).toFixed(1)}%)`);
ok(recomputes <= 6, `recompute count (${recomputes}) stays small relative to ${totalFrames} frames — the narrowing is doing its job`);
ok(recomputes >= 2, `recompute count (${recomputes}) is at least 2 — it DOES still react to the open and close transitions`);

console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
