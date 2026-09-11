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
  classifyWheelSource,
  PAN_MODIFIER_CODE,
  shouldReverseMacMouseZoom,
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

console.log("\nthe mouse's left button is not a camera binding at all");
// Regression guard. Left used to orbit on empty space, which read as left and
// right doing the same job — and made a button's meaning depend on whatever
// happened to be under the cursor. Both are Law 2 violations, and the second is
// the one that actually confuses people. Left acts on the world, full stop.
//
// PLAIN left, specifically. A held modifier is a different gesture, not a
// second meaning for the same one — space+drag is the Figma/Photoshop pan and
// nobody confuses it with a click. The rule bans the unmodified press.
const MODIFIED = /^(space|shift|alt|ctrl|cmd)\b/;
for (const b of VOCABULARY.filter((x) => x.device === "mouse")) {
  const plainLeft = /\bleft-drag\b/.test(b.gesture) && !MODIFIED.test(b.gesture);
  check(`mouse ${b.verb} via "${b.gesture}" does not use the plain left button`, !plainLeft);
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

const signal = (overrides: Partial<Parameters<typeof classifyWheel>[0]> = {}) => ({
  deltaX: 0,
  deltaY: 0,
  deltaMode: 0,
  ctrlKey: false,
  ...overrides,
});
const wheel = (overrides: Partial<Parameters<typeof classifyWheel>[0]> = {}) => classifyWheel(signal(overrides));

console.log("\nthe wheel classifier separates notched wheels from precision input");
check("a Chromium/WebKit 120-tick mouse wheel zooms",
  wheel({ deltaY: 4, wheelDeltaY: -120 }) === "zoom");
check("a larger conventional wheel event zooms",
  wheel({ deltaY: 100, wheelDeltaY: -120 }) === "zoom");
check("a Firefox line-mode wheel zooms",
  wheel({ deltaY: 3, deltaMode: 1 }) === "zoom");
check("a fallback large pixel wheel zooms",
  wheel({ deltaY: 100 }) === "zoom");
check("a fractional vertical two-finger swipe orbits",
  wheel({ deltaY: -4.5 }) === "orbit");
check("a small integer two-finger swipe orbits",
  wheel({ deltaY: -8 }) === "orbit");
check("a horizontal two-finger swipe orbits",
  wheel({ deltaX: -22, deltaY: 3 }) === "orbit");
check("a browser-signalled pinch always zooms",
  wheel({ deltaY: -8, ctrlKey: true }) === "zoom");
check("the vocabulary has no Shift-specific trackpad gesture",
  !VOCABULARY.some((binding) => binding.device === "trackpad" && /shift/i.test(binding.gesture)));

console.log("\nmacOS natural-scroll compensation is mouse-only");
const naturalMouse = signal({ deltaY: 4, wheelDeltaY: -120, webkitDirectionInvertedFromDevice: true });
check("WebKit natural mouse direction reverses", shouldReverseMacMouseZoom(naturalMouse, true));
check("WebKit non-natural mouse direction stays", !shouldReverseMacMouseZoom({ ...naturalMouse, webkitDirectionInvertedFromDevice: false }, true));
check("other Mac browsers fall back to the natural-scroll default",
  shouldReverseMacMouseZoom(signal({ deltaY: 4, wheelDeltaY: -120 }), true));
check("trackpad orbit never reverses",
  classifyWheelSource(signal({ deltaY: -4.5 })) === "trackpad" &&
  !shouldReverseMacMouseZoom(signal({ deltaY: -4.5, webkitDirectionInvertedFromDevice: true }), true));
check("trackpad pinch never reverses",
  !shouldReverseMacMouseZoom(signal({ deltaY: -4.5, ctrlKey: true, webkitDirectionInvertedFromDevice: true }), true));
check("Windows mouse wheels never receive Mac compensation",
  !shouldReverseMacMouseZoom(naturalMouse, false));

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
