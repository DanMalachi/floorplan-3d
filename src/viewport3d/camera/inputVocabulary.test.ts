// Headless: camera P3b, input vocabulary. Run:
//   npx tsx src/viewport3d/camera/inputVocabulary.test.ts
//
// This suite exists to mechanize Law 1. The bug that started the whole camera
// rework was a viewport state with zero camera inputs, and the fix for it (move
// orbit to the right button, pan to the middle) immediately created the same
// bug one device over, on trackpads, which have no middle button. Both are the
// same mistake: reasoning about the camera on one device and assuming the rest
// follow.
//
// So the invariant is asserted, not remembered — every device must be able to
// orbit AND pan AND zoom, and no verb may depend on a binding an armed tool
// can take away.

import {
  VOCABULARY,
  classifyWheel,
  PAN_MODIFIER_CODE,
  type CameraVerb,
  type InputDevice,
} from "./inputVocabulary";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const DEVICES: InputDevice[] = ["mouse", "trackpad", "touch"];
const VERBS: CameraVerb[] = ["orbit", "pan", "zoom"];

console.log("Law 1, mechanized: no device may be missing a verb");
for (const device of DEVICES) {
  for (const verb of VERBS) {
    const bindings = VOCABULARY.filter((b) => b.device === device && b.verb === verb);
    check(`${device} can ${verb}`, bindings.length > 0,
      "no binding — this device has a crippled camera");
  }
}

console.log("\nand no verb may rest solely on a binding a tool can steal");
for (const device of DEVICES) {
  for (const verb of VERBS) {
    const bindings = VOCABULARY.filter((b) => b.device === device && b.verb === verb);
    if (bindings.length === 0) continue; // already reported above
    const survivors = bindings.filter((b) => !b.suppressible);
    check(
      `${device} can still ${verb} while a tool is armed`,
      survivors.length > 0,
      bindings.map((b) => b.gesture).join(" / ") + " are all suppressible",
    );
  }
}

console.log("\nthe suppressible bindings are only ever the plain left press");
// Law 2: left acts on the world, and it is the ONLY input a tool may claim.
// A suppressible right-drag or pinch would mean a mode had quietly rebound a
// navigation gesture, which is the thing Law 2 exists to forbid.
for (const b of VOCABULARY.filter((x) => x.suppressible)) {
  const g = b.gesture.toLowerCase();
  check(`${b.device} "${b.gesture}" is a plain left/one-finger press`,
    (g.includes("left-drag") || g.includes("one-finger")) && g.includes("empty space"));
}

console.log("\nthe wheel classifier never changes what a plain mouse does");
check("a mouse wheel tick zooms", classifyWheel({ deltaX: 0, deltaY: -120, ctrlKey: false }) === "zoom");
check("a mouse wheel tick the other way still zooms",
  classifyWheel({ deltaX: 0, deltaY: 120, ctrlKey: false }) === "zoom");
check("a trackpad's small vertical scroll zooms, like every map app",
  classifyWheel({ deltaX: 0, deltaY: -4.5, ctrlKey: false }) === "zoom");
check("a pinch zooms — ctrlKey is the browser's own pinch signal",
  classifyWheel({ deltaX: 0, deltaY: -8, ctrlKey: true }) === "zoom");
check("a pinch zooms even when the delta is horizontal-ish",
  classifyWheel({ deltaX: 9, deltaY: -2, ctrlKey: true }) === "zoom");
check("a sideways two-finger swipe pans",
  classifyWheel({ deltaX: -22, deltaY: 0, ctrlKey: false }) === "panX");
check("a diagonal swipe resolves to its dominant axis",
  classifyWheel({ deltaX: 30, deltaY: 4, ctrlKey: false }) === "panX" &&
  classifyWheel({ deltaX: 4, deltaY: 30, ctrlKey: false }) === "zoom");
check("an exactly-diagonal swipe falls to zoom, never flickering between the two",
  classifyWheel({ deltaX: 10, deltaY: 10, ctrlKey: false }) === "zoom");
check("an empty wheel event is inert rather than a pan",
  classifyWheel({ deltaX: 0, deltaY: 0, ctrlKey: false }) === "zoom");

console.log("\nthe pan modifier is a physical key, not a character");
// Same reason Viewport.tsx matches on e.code: a non-Latin keyboard layout types
// a different character on the same physical key, and e.key matching would
// dead-key the shortcut for those users.
check("PAN_MODIFIER_CODE is a KeyboardEvent.code value", PAN_MODIFIER_CODE === "Space");

console.log("\nknown gap, asserted so it cannot be forgotten");
// Touch orbit on empty space is marked suppressible and is NOT rescued by a
// non-suppressible alternative in edit modes alone — three-finger drag covers
// it, but three fingers is a poor primary gesture. Making one-finger-on-empty
// work properly needs a hit test at touchstart, because touch has no hover to
// read: the pointerdown raycast that was correctly dropped for the mouse is
// genuinely required here. Recorded as a real remaining task, not a pass.
const touchOrbit = VOCABULARY.filter((b) => b.device === "touch" && b.verb === "orbit");
check("touch orbit currently leans on a three-finger fallback",
  touchOrbit.some((b) => b.gesture.includes("three-finger")),
  "if this changed, the one-finger hit test probably landed — update this note");

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
