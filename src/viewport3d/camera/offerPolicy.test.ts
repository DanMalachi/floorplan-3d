// Headless: camera P3a, offer policy. Run:
//   npx tsx src/viewport3d/camera/offerPolicy.test.ts
//
// Two properties matter more than the rest, and both are the kind that look
// fine in review and fail in the hand:
//
//  1. NO FLICKER. Legibility changes continuously while the user orbits, so a
//     naive single threshold makes the chip strobe as they cross it. The sweep
//     below asserts at most ONE transition in each direction — which is also
//     what proves the poor band is doing its real job (hysteresis) rather than
//     the job its name suggests (severity).
//  2. EVERY OFFER ACTUALLY FIXES THE PROBLEM. An offer that moves the camera
//     and leaves the surface still unworkable costs more trust than ten offers
//     never made, because the user now knows the suggestion is unreliable.

import {
  offerVisible,
  remedyFor,
  remedyResolves,
  ACCEPT_KEY,
  type ViewContext,
} from "./offerPolicy";
import { legibility, PLANE_POSE_POLAR_DEG, type TargetPlane } from "./targetPlane";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};
const rad = (deg: number) => (deg * Math.PI) / 180;
const PLANES: TargetPlane[] = ["floor", "wall", "counter", "ceiling"];

console.log("silence is the default");
check("nothing armed, nothing said",
  offerVisible(true, { plane: null, legibility: "impossible", dismissed: false }) === false);
check("a clear view is never interrupted",
  offerVisible(true, { plane: "wall", legibility: "clear", dismissed: false }) === false);
check("a dismissal is honoured even while the view stays impossible",
  offerVisible(true, { plane: "ceiling", legibility: "impossible", dismissed: true }) === false);

console.log("\nonly `impossible` may speak first; `poor` may only sustain");
check("impossible raises the offer from nothing",
  offerVisible(false, { plane: "floor", legibility: "impossible", dismissed: false }) === true);
check("poor can NOT raise the offer",
  offerVisible(false, { plane: "floor", legibility: "poor", dismissed: false }) === false);
check("poor DOES sustain an offer already up",
  offerVisible(true, { plane: "floor", legibility: "poor", dismissed: false }) === true);
check("clear withdraws it without the user having to dismiss anything",
  offerVisible(true, { plane: "floor", legibility: "clear", dismissed: false }) === false);

console.log("\norbiting through the whole range never makes the chip strobe");
// Sweep the camera the way a user actually would and count state changes. The
// floor plane spans all three bands across the legal polar range, so it is the
// one that would flicker if the bands were not doing hysteresis duty.
function sweep(degrees: number[]): { states: boolean[]; transitions: number } {
  let visible = false;
  const states: boolean[] = [];
  let transitions = 0;
  for (const d of degrees) {
    const next = offerVisible(visible, {
      plane: "floor",
      legibility: legibility("floor", rad(d)),
      dismissed: false,
    });
    if (next !== visible) transitions++;
    visible = next;
    states.push(visible);
  }
  return { states, transitions };
}
const toOverhead = Array.from({ length: 91 }, (_, i) => 90 - i); // horizon -> overhead
const toHorizon = Array.from({ length: 91 }, (_, i) => i); // overhead -> horizon
const dn = sweep(toOverhead);
const upS = sweep(toHorizon);

// Starting at the horizon the floor IS unworkable, so raising the offer and
// then withdrawing it are both correct — two transitions, no oscillation.
check("orbiting up from the horizon: raise once, withdraw once, never again",
  dn.transitions === 2 && dn.states[0] === true && dn.states[dn.states.length - 1] === false,
  `${dn.transitions} transitions`);
// Coming the other way it must cross the whole poor band in silence and only
// speak at `impossible` — the property that keeps a merely-fiddly view quiet.
check("orbiting down from overhead: silent until the view is actually impossible",
  upS.transitions === 1 && upS.states[0] === false,
  `${upS.transitions} transitions`);

// The two directions must switch at DIFFERENT angles. That gap is the dead
// zone; if it were zero the chip would sit on a knife edge.
const offAt = toOverhead[dn.states.indexOf(false)];
const onAt = toHorizon[upS.states.indexOf(true)];
check("the offer turns off higher than it turns on — a real dead zone",
  onAt > offAt, `on at ${onAt} deg, off at ${offAt} deg`);
check("the dead zone is wide enough to survive a shaky hand", onAt - offAt >= 10,
  `${onAt - offAt} deg`);

// The direct anti-strobe assertion: a user nudging the camera back and forth
// INSIDE the dead zone must see the chip hold whatever state it was in. This
// is the failure a single threshold produces and the reason the middle band
// exists at all.
for (const startVisible of [false, true]) {
  let visible = startVisible;
  let transitions = 0;
  for (let i = 0; i < 40; i++) {
    const deg = i % 2 === 0 ? 70 : 78; // both comfortably inside `poor`
    const next = offerVisible(visible, {
      plane: "floor",
      legibility: legibility("floor", rad(deg)),
      dismissed: false,
    });
    if (next !== visible) transitions++;
    visible = next;
  }
  check(`jittering inside the dead zone never toggles it (from ${startVisible ? "shown" : "hidden"})`,
    transitions === 0 && visible === startVisible, `${transitions} transitions`);
}

console.log("\nevery offer resolves the problem it is offered for");
for (const plane of PLANES) {
  // Worst realistic case per plane: the view where that plane is unworkable.
  const ctx: ViewContext = {
    polarRad: rad(plane === "wall" ? 3 : 84),
    ceilingsShown: true,
  };
  const r = remedyFor(plane, ctx);
  check(`the ${plane} offer leaves the ${plane} workable`, remedyResolves(plane, r, ctx),
    JSON.stringify(r));
}

console.log("\nthe ceiling offer answers whichever precondition is actually unmet");
const cappedGoodAngle: ViewContext = { polarRad: rad(PLANE_POSE_POLAR_DEG.ceiling), ceilingsShown: true };
const cappedBadAngle: ViewContext = { polarRad: rad(84), ceilingsShown: true };
const uncappedBadAngle: ViewContext = { polarRad: rad(84), ceilingsShown: false };

const a = remedyFor("ceiling", cappedGoodAngle);
check("capped but well-angled: uncap only, do not move a camera that is already right",
  a.hideCeilings === true && a.polarDeg === null, JSON.stringify(a));
const b = remedyFor("ceiling", cappedBadAngle);
check("capped and badly angled: do both, and say so",
  b.hideCeilings === true && b.polarDeg !== null && b.label.includes("and"), JSON.stringify(b));
const c = remedyFor("ceiling", uncappedBadAngle);
check("already uncapped: it is only a camera problem now",
  c.hideCeilings === false && c.polarDeg !== null, JSON.stringify(c));

console.log("\nthe remedy may only press buttons the user already has");
for (const plane of PLANES) {
  const r = remedyFor(plane, { polarRad: rad(84), ceilingsShown: true });
  // Azimuth is the disorienting one, so it is spent only where facing the
  // surface IS the task.
  check(`${plane}: camera spin only for walls`, r.faceTargetWall === (plane === "wall"));
  // The only scene-state change permitted is the Ceiling toggle in
  // WallModeToggle — a control sitting in plain sight that visibly flips, so
  // accepting an offer teaches where it lives instead of hiding an outcome.
  check(`${plane}: touches the ceiling toggle only when the ceiling is the target`,
    r.hideCeilings === (plane === "ceiling"));
}

console.log("\nthe copy says what happens, and never hedges");
const HEDGES = ["maybe", "perhaps", "try ", "sorry", "oops", "might", "consider", "could not", "please"];
for (const plane of PLANES) {
  for (const ctx of [cappedBadAngle, uncappedBadAngle]) {
    const r = remedyFor(plane, ctx);
    const text = `${r.label} ${r.reason}`.toLowerCase();
    check(`${plane}: "${r.label}" is verb-led and unhedged`,
      /^[A-Z]/.test(r.label) && !HEDGES.some((h) => text.includes(h)), text);
    check(`${plane}: the reason names the obstacle`, r.reason.length > 0 && r.reason === r.reason.toLowerCase());
  }
}

console.log("\nthe accept key cannot collide with what is already bound");
// Viewport.tsx spends R, Escape, Delete/Backspace and the undo pair; P2's
// camera channel takes T, F, Home, WASD and the arrows; P3b takes Space.
const TAKEN = ["KeyR", "Escape", "Delete", "Backspace", "KeyZ", "KeyY", "KeyT", "KeyF", "Home",
  "KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "Space",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
check(`${ACCEPT_KEY} is free`, !TAKEN.includes(ACCEPT_KEY));

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
