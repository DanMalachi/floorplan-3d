// Run: npm run test:onboarding (or `npx tsx src/onboarding/onboarding.test.ts`)
//
// The guide engine without React: which guides a state calls for, the queue
// (one guide at a time, each shown once), what survives a reload, and the
// mouse/trackpad decision.

import assert from "node:assert/strict";
import { GUIDE_IDS, type GuideId } from "./guides";
import { createGuideStore, readPersisted, GUIDES_STORAGE_KEY, type GuideStorage } from "./guideStore";
import { deviceFromWheel, guessDevice } from "./device";
import { CARD_GAP, VIEW_MARGIN, placeCard } from "./place";
import { guidesFor, outgrown, wantsWelcome, type TriggerSnapshot } from "./triggers";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures += 1;
    console.error(`  FAIL ${name}\n       ${(e as Error).message}`);
  }
}

function memoryStorage(initial?: string): GuideStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(GUIDES_STORAGE_KEY, initial);
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const throwingStorage: GuideStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

const snap = (over: Partial<TriggerSnapshot> = {}): TriggerSnapshot => ({
  appMode: "trace",
  traceStep: 1,
  hasImage: false,
  scaleSet: false,
  calibrationPts: 0,
  walkthroughActive: false,
  furnitureCount: 0,
  projectId: "p1",
  ...over,
});

function storeWithAll(storage: GuideStorage | null = memoryStorage()) {
  const store = createGuideStore(storage, "mouse");
  store.getState().setAvailable([...GUIDE_IDS]);
  return store;
}

console.log("guidesFor: trace steps");
check("step 1 with no plan asks for nothing", () => {
  assert.deepEqual(guidesFor(null, snap()), []);
});
check("step 2 waits for the plan image", () => {
  assert.deepEqual(guidesFor(null, snap({ traceStep: 2 })), []);
  assert.deepEqual(guidesFor(null, snap({ traceStep: 2, hasImage: true })), ["scale"]);
});
check("two scale points, scale not applied: scale2 takes over from scale", () => {
  assert.deepEqual(guidesFor(null, snap({ traceStep: 2, hasImage: true, calibrationPts: 2 })), ["scale2"]);
});
check("a trace guide is outgrown once its step is behind the person", () => {
  assert.equal(outgrown("scale", snap({ traceStep: 2, hasImage: true, calibrationPts: 1 })), false);
  assert.equal(outgrown("scale", snap({ traceStep: 2, hasImage: true, calibrationPts: 2 })), true);
  assert.equal(outgrown("walls", snap({ traceStep: 3 })), false);
  assert.equal(outgrown("walls", snap({ traceStep: 4 })), true);
  assert.equal(outgrown("build", snap({ traceStep: 6, appMode: "build" })), true);
});
check("3D guides and the welcome are never outgrown", () => {
  assert.equal(outgrown("camera", snap({ appMode: "trace" })), false);
  assert.equal(outgrown("decnav", snap({ appMode: "build" })), false);
  assert.equal(outgrown("welcome", snap({ traceStep: 2, hasImage: true })), false);
});
check("scale already set: no scale guides even on step 2", () => {
  assert.deepEqual(guidesFor(null, snap({ traceStep: 2, hasImage: true, scaleSet: true, calibrationPts: 2 })), []);
});
check("steps 3, 4, 6 map to walls, openings, build; 5 has none", () => {
  assert.deepEqual(guidesFor(null, snap({ traceStep: 3 })), ["walls"]);
  assert.deepEqual(guidesFor(null, snap({ traceStep: 4 })), ["openings"]);
  assert.deepEqual(guidesFor(null, snap({ traceStep: 5 })), []);
  assert.deepEqual(guidesFor(null, snap({ traceStep: 6 })), ["build"]);
});
check("trace guides never fire outside Trace", () => {
  assert.ok(!guidesFor(null, snap({ appMode: "build", traceStep: 3 })).includes("walls"));
});

console.log("guidesFor: 3D");
check("every 3D mode asks for the camera guide", () => {
  for (const appMode of ["build", "furnish", "view"] as const) {
    assert.ok(guidesFor(null, snap({ appMode })).includes("camera"), appMode);
  }
});
check("Build adds its navigator, Decorate its own", () => {
  assert.deepEqual(guidesFor(null, snap({ appMode: "build" })), ["camera", "buildnav"]);
  assert.deepEqual(guidesFor(null, snap({ appMode: "furnish" })), ["camera", "decnav"]);
});
check("walk only while the walkthrough is on", () => {
  assert.ok(!guidesFor(null, snap({ appMode: "view" })).includes("walk"));
  assert.ok(guidesFor(null, snap({ appMode: "view", walkthroughActive: true })).includes("walk"));
});
check("placed: one more piece in Decorate, same project", () => {
  const prev = snap({ appMode: "furnish", furnitureCount: 4 });
  assert.ok(guidesFor(prev, { ...prev, furnitureCount: 5 }).includes("placed"));
});
check("placed: NOT on first look, a project switch, a bulk load or a delete", () => {
  const prev = snap({ appMode: "furnish", furnitureCount: 4 });
  assert.ok(!guidesFor(null, { ...prev, furnitureCount: 5 }).includes("placed"));
  assert.ok(!guidesFor(prev, { ...prev, furnitureCount: 5, projectId: "p2" }).includes("placed"));
  assert.ok(!guidesFor(prev, { ...prev, furnitureCount: 12 }).includes("placed"));
  assert.ok(!guidesFor(prev, { ...prev, furnitureCount: 3 }).includes("placed"));
});
check("placed: not outside Decorate", () => {
  const prev = snap({ appMode: "build", furnitureCount: 4 });
  assert.ok(!guidesFor(prev, { ...prev, furnitureCount: 5 }).includes("placed"));
});

console.log("wantsWelcome");
const fresh = { projectCount: 1, hasImage: false, tracedPoints: 0, liveRoomId: null };
check("a fresh visitor (the auto-created empty project) gets it", () => {
  assert.equal(wantsWelcome(fresh), true);
  assert.equal(wantsWelcome({ ...fresh, projectCount: 0 }), true);
});
check("anyone who has started does not", () => {
  assert.equal(wantsWelcome({ ...fresh, projectCount: 2 }), false);
  assert.equal(wantsWelcome({ ...fresh, hasImage: true }), false);
  assert.equal(wantsWelcome({ ...fresh, tracedPoints: 1 }), false);
});
check("never in a live room", () => {
  assert.equal(wantsWelcome({ ...fresh, liveRoomId: "room" }), false);
});

console.log("store: queue");
check("one guide at a time, the rest queue by priority", () => {
  const s = storeWithAll();
  s.getState().request(["decnav", "camera"]);
  assert.equal(s.getState().active, "camera");
  assert.deepEqual(s.getState().queue, ["decnav"]);
  s.getState().request("welcome");
  assert.equal(s.getState().active, "camera", "an open guide is never replaced");
  assert.deepEqual(s.getState().queue, ["welcome", "decnav"]);
});
check("dismiss marks seen and opens the next", () => {
  const s = storeWithAll();
  s.getState().request(["camera", "buildnav"]);
  s.getState().dismiss();
  assert.deepEqual(s.getState().seen, ["camera"]);
  assert.equal(s.getState().active, "buildnav");
  s.getState().dismiss();
  assert.equal(s.getState().active, null);
});
check("each guide shows once: a seen guide is never requested again", () => {
  const s = storeWithAll();
  s.getState().request("walls");
  s.getState().dismiss();
  s.getState().request("walls");
  assert.equal(s.getState().active, null);
});
check("repeat requests don't duplicate", () => {
  const s = storeWithAll();
  s.getState().request(["camera", "decnav"]);
  s.getState().request(["camera", "decnav", "decnav"]);
  assert.equal(s.getState().active, "camera");
  assert.deepEqual(s.getState().queue, ["decnav"]);
});
check("guides without a view are ignored, so they can't block the queue", () => {
  const s = createGuideStore(memoryStorage(), "mouse");
  s.getState().setAvailable(["walls"]);
  s.getState().request(["scale", "walls"]);
  assert.equal(s.getState().active, "walls");
  assert.deepEqual(s.getState().queue, []);
});
check("disabled: nothing is requested, and disabling clears what was open", () => {
  const s = storeWithAll();
  s.getState().request("camera");
  s.getState().setEnabled(false);
  assert.equal(s.getState().active, null);
  s.getState().request("decnav");
  assert.equal(s.getState().active, null);
  s.getState().setEnabled(true);
  s.getState().request("decnav");
  assert.equal(s.getState().active, "decnav");
  assert.deepEqual(s.getState().seen, [], "a guide cleared by disabling was never seen");
});
check("replay opens a seen guide and puts the open one back first", () => {
  const s = storeWithAll();
  s.getState().request("walls");
  s.getState().dismiss();
  s.getState().request(["camera", "decnav"]);
  assert.equal(s.getState().activeSource, "trigger");
  s.getState().replay("walls");
  assert.equal(s.getState().active, "walls");
  assert.equal(s.getState().activeSource, "replay", "a replayed step guide must not close itself");
  assert.deepEqual(s.getState().queue, ["camera", "decnav"]);
  s.getState().dismiss();
  assert.equal(s.getState().active, "camera");
  assert.equal(s.getState().activeSource, "trigger");
});
check("a queued guide replayed early isn't shown twice", () => {
  const s = storeWithAll();
  s.getState().request(["camera", "decnav"]);
  s.getState().replay("decnav");
  assert.deepEqual(s.getState().queue, ["camera"]);
  s.getState().dismiss();
  assert.equal(s.getState().active, "camera");
  s.getState().dismiss();
  assert.equal(s.getState().active, null);
});

console.log("store: persistence");
check("seen survives a reload", () => {
  const storage = memoryStorage();
  const a = storeWithAll(storage);
  a.getState().request("walls");
  a.getState().dismiss();
  const b = storeWithAll(storage);
  assert.deepEqual(b.getState().seen, ["walls"]);
  b.getState().request("walls");
  assert.equal(b.getState().active, null);
});
check("bad or foreign stored data reads as nothing seen", () => {
  assert.deepEqual(readPersisted(memoryStorage("{not json")).seen, []);
  assert.deepEqual(readPersisted(memoryStorage("null")).seen, []);
  assert.deepEqual(readPersisted(memoryStorage('{"seen":"walls"}')).seen, []);
  assert.deepEqual(readPersisted(memoryStorage('{"seen":["walls","nope",3,"walls"]}')).seen, ["walls"]);
});
check("storage that throws: guides still work and close for the session", () => {
  const s = storeWithAll(throwingStorage);
  s.getState().request("walls");
  s.getState().dismiss();
  s.getState().request("walls");
  assert.equal(s.getState().active, null);
});
check("no storage at all (SSR) is fine", () => {
  const s = storeWithAll(null);
  s.getState().request("walls");
  assert.equal(s.getState().active, "walls");
});

console.log("device");
check("a Mac guesses trackpad, everything else mouse", () => {
  assert.equal(guessDevice("MacIntel"), "trackpad");
  assert.equal(guessDevice("macOS"), "trackpad");
  assert.equal(guessDevice("Win32"), "mouse");
  assert.equal(guessDevice(""), "mouse");
});
check("wheel: a notch is a mouse, a pinch or small deltas a trackpad", () => {
  assert.equal(deviceFromWheel({ deltaX: 0, deltaY: 100, deltaMode: 0, ctrlKey: false, wheelDeltaY: -120 }), "mouse");
  assert.equal(deviceFromWheel({ deltaX: 0, deltaY: 3, deltaMode: 1, ctrlKey: false }), "mouse");
  assert.equal(deviceFromWheel({ deltaX: 1.5, deltaY: 4, deltaMode: 0, ctrlKey: false }), "trackpad");
  assert.equal(deviceFromWheel({ deltaX: 0, deltaY: 100, deltaMode: 0, ctrlKey: true, wheelDeltaY: -120 }), "trackpad");
});
check("the first scroll corrects the guess, later ones don't flip it", () => {
  const s = createGuideStore(memoryStorage(), "trackpad");
  s.getState().setDevice("mouse", "input");
  assert.equal(s.getState().device, "mouse");
  s.getState().setDevice("trackpad", "input");
  assert.equal(s.getState().device, "mouse");
});
check("the person's own choice wins and is remembered", () => {
  const storage = memoryStorage();
  const a = createGuideStore(storage, "mouse");
  a.getState().setDevice("trackpad", "user");
  a.getState().setDevice("mouse", "input");
  assert.equal(a.getState().device, "trackpad");
  const b = createGuideStore(storage, "mouse");
  assert.equal(b.getState().device, "trackpad");
  assert.equal(b.getState().deviceSource, "user");
});
check("a guessed or scrolled device is NOT remembered", () => {
  const storage = memoryStorage();
  const a = createGuideStore(storage, "mouse");
  a.getState().setDevice("trackpad", "input");
  a.getState().setAvailable(["walls"]);
  a.getState().request("walls");
  a.getState().dismiss(); // forces a write
  const b = createGuideStore(storage, "mouse");
  assert.equal(b.getState().device, "mouse");
});

console.log("card placement");
const VIEW = { width: 1440, height: 900 };
// A step control in the trace rail: inline-start edge, 264 px wide.
const railL = { left: 22, top: 200, width: 248, height: 40 };
const railR = { left: 1440 - 22 - 248, top: 200, width: 248, height: 40 };
check("LTR: the card opens after the rail, over the plan", () => {
  const p = placeCard(railL, { width: 500, height: 400 }, VIEW, false);
  assert.equal(p.side, "end");
  assert.equal(p.left, 22 + 248 + CARD_GAP);
});
check("RTL: the same card mirrors to the left of a right-hand rail", () => {
  const p = placeCard(railR, { width: 500, height: 400 }, VIEW, true);
  assert.equal(p.side, "end");
  assert.equal(p.left + 500, railR.left - CARD_GAP);
});
check("the tip points at the anchor's middle", () => {
  const p = placeCard(railL, { width: 500, height: 400 }, VIEW, false);
  assert.equal(p.top + p.tip, railL.top + railL.height / 2);
});
check("near the bottom the card moves up but the tip still finds the anchor", () => {
  const low = { ...railL, top: 820 };
  const p = placeCard(low, { width: 500, height: 400 }, VIEW, false);
  assert.equal(p.top + 400, VIEW.height - VIEW_MARGIN);
  assert.equal(p.top + p.tip, low.top + low.height / 2);
});
check("no room on either side: below, centred and kept on screen", () => {
  const wide = { left: 100, top: 100, width: 1240, height: 40 };
  const p = placeCard(wide, { width: 500, height: 300 }, VIEW, false);
  assert.equal(p.side, "below");
  assert.equal(p.left, 100 + 620 - 250);
  assert.equal(p.tip, 250);
});
check("a card taller than the window pins to the top margin", () => {
  const p = placeCard(railL, { width: 500, height: 1200 }, VIEW, false);
  assert.equal(p.top, VIEW_MARGIN);
});

console.log("ids");
check("every guide id is unique", () => {
  assert.equal(new Set<GuideId>(GUIDE_IDS).size, GUIDE_IDS.length);
});

if (failures) {
  console.error(`\n${failures} failing`);
  process.exit(1);
}
console.log("\nall passed");
