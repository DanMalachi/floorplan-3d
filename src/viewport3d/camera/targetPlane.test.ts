// Headless: camera P3a, target-plane legibility. Run:
//   npx tsx src/viewport3d/camera/targetPlane.test.ts
//
// The claims worth pinning here are not "does cos() work". They are the two
// that the feature stands or falls on:
//
//  1. SELF-CONSISTENCY — every pose the app offers as a fix must itself be
//     legible for the plane it fixes. A camera move that lands on a view still
//     rated "poor" is worse than no move at all: it seizes control AND fails.
//  2. THE DEFAULT MUST STAY SILENT — the app's opening framing (~60 deg polar)
//     has to read as clear for both floors and walls. An affordance that fires
//     on the shipping default view is not an affordance, it is a permanent
//     nag, and users learn to ignore it before it ever helps them.

import {
  incidence,
  legibility,
  resolveTargetPlane,
  isHorizontal,
  needsAzimuth,
  needsCeilingsHidden,
  IMPOSSIBLE_BELOW,
  POOR_BELOW,
  PLANE_POSE_POLAR_DEG,
  PLANE_NOUN,
  type TargetPlane,
} from "./targetPlane";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};
const rad = (deg: number) => (deg * Math.PI) / 180;
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

const PLANES: TargetPlane[] = ["floor", "wall", "counter", "ceiling"];

// The camera envelope P0 shipped. Mirrored here rather than imported because
// CameraRig.tsx pulls in React/three/drei and this suite has to run headless.
// If these change in src/viewport3d/CameraRig.tsx, the claims below are what
// need re-checking — that is the point of restating them.
const P0_MAX_POLAR_DEG = 85;
const P0_TOP_MODE_MAX_POLAR_DEG = 28;
/** Viewport.tsx frames the opening shot along (0.7, 0.7, 1) normalized. */
const DEFAULT_FRAMING_POLAR_DEG =
  (Math.acos(0.7 / Math.hypot(0.7, 0.7, 1)) * 180) / Math.PI;

console.log("the geometry is one number, and the two families are complements");
for (const deg of [0, 15, 28, 45, 55, 60, 78, 85, 90]) {
  const h = incidence("floor", rad(deg));
  const v = incidence("wall", rad(deg));
  check(
    `at ${deg} deg polar, horizontal^2 + vertical^2 = 1`,
    near(h * h + v * v, 1, 1e-9),
    `${h.toFixed(3)} / ${v.toFixed(3)}`,
  );
}
check("floor, counter and ceiling are horizontal; wall is not",
  isHorizontal("floor") && isHorizontal("counter") && isHorizontal("ceiling") && !isHorizontal("wall"));
check("the bands are ordered", IMPOSSIBLE_BELOW < POOR_BELOW);

console.log("\nthe extremes rate the way the product claims they do");
check("dead top-down makes a wall impossible", legibility("wall", rad(0)) === "impossible");
check("dead top-down keeps the floor clear", legibility("floor", rad(0)) === "clear");
check("at the horizon the floor is impossible", legibility("floor", rad(90)) === "impossible");
check("at the horizon a wall is clear", legibility("wall", rad(90)) === "clear");
check("a worktop behaves like a floor",
  legibility("counter", rad(0)) === "clear" && legibility("counter", rad(90)) === "impossible");

console.log("\nsidedness, not angle, is what makes a ceiling hard");
// This block exists because the first version of the model got it wrong: to an
// orbit camera a ceiling and a floor are the same horizontal plane, so pure
// incidence rated a capped ceiling "clear" from the default view. What differs
// is which way the working face points.
for (const deg of [0, 15, 45, 60, 85]) {
  check(`a capped ceiling is unreachable at ${deg} deg, whatever the angle`,
    legibility("ceiling", rad(deg)) === "impossible");
}
check("uncapped, a ceiling scores exactly like a floor",
  [0, 15, 45, 60, 85].every(
    (d) => legibility("ceiling", rad(d), { ceilingsHidden: true }) === legibility("floor", rad(d)),
  ));
check("so the ceiling is the one plane no camera move alone can rescue",
  PLANES.filter((p) => legibility(p, rad(PLANE_POSE_POLAR_DEG[p])) !== "clear").join(",") === "ceiling");

console.log("\nthe shipping default view must never nag");
check(`default framing is ~${DEFAULT_FRAMING_POLAR_DEG.toFixed(0)} deg polar`,
  near(DEFAULT_FRAMING_POLAR_DEG, 60, 1.5), DEFAULT_FRAMING_POLAR_DEG.toFixed(2));
for (const plane of PLANES) {
  const verdict = legibility(plane, rad(DEFAULT_FRAMING_POLAR_DEG), { ceilingsHidden: true });
  check(`default view rates ${plane} as clear`, verdict === "clear", verdict);
}

console.log("\nevery offered pose is legible for the plane it fixes");
for (const plane of PLANES) {
  // Ceilings get their own precondition met here — the offer for that plane is
  // "hide the ceilings AND move", so scoring the move alone would be a lie.
  const verdict = legibility(plane, rad(PLANE_POSE_POLAR_DEG[plane]), { ceilingsHidden: true });
  check(
    `the ${plane} pose (${PLANE_POSE_POLAR_DEG[plane]} deg) rates clear for ${plane}`,
    verdict === "clear",
    `${verdict}, incidence ${incidence(plane, rad(PLANE_POSE_POLAR_DEG[plane])).toFixed(3)}`,
  );
  check(
    `the ${plane} pose stays inside P0's polar clamp`,
    PLANE_POSE_POLAR_DEG[plane] <= P0_MAX_POLAR_DEG,
  );
}

console.log("\nP0's camera envelope and these thresholds agree");
check("at P0's lowest orbit the floor is unusable, which is the clamp's whole point",
  legibility("floor", rad(P0_MAX_POLAR_DEG)) === "impossible");
check("at P0's lowest orbit a wall is perfect",
  legibility("wall", rad(P0_MAX_POLAR_DEG)) === "clear");
check("Top wall mode still leaves the floor clear",
  legibility("floor", rad(P0_TOP_MODE_MAX_POLAR_DEG)) === "clear");
check("Top wall mode never rates a wall impossible at its own clamp",
  legibility("wall", rad(P0_TOP_MODE_MAX_POLAR_DEG)) !== "impossible");
check("but pushed to true top-down inside Top mode, a wall does become impossible",
  legibility("wall", rad(5)) === "impossible");

console.log("\nonly a wall move needs to spin the camera");
for (const plane of PLANES) {
  check(`${plane} azimuth change: ${plane === "wall"}`, needsAzimuth(plane) === (plane === "wall"));
}
check("only a ceiling move has to uncap the room",
  PLANES.every((p) => needsCeilingsHidden(p) === (p === "ceiling")));
check("every plane has a noun for the offer chip",
  PLANES.every((p) => typeof PLANE_NOUN[p] === "string" && PLANE_NOUN[p].length > 0));

console.log("\nthe resolver reads the schema fields that already exist");
check("a wall-mounted parametric targets the wall",
  resolveTargetPlane({ source: "parametric", wallMounted: true, counterItem: false }) === "wall");
check("a plain parametric targets the floor",
  resolveTargetPlane({ source: "parametric", wallMounted: false, counterItem: false }) === "floor");
check("a counter item targets the worktop",
  resolveTargetPlane({ source: "parametric", wallMounted: false, counterItem: true }) === "counter");
check("counter beats wall — an extractor hangs, but it belongs to the run",
  resolveTargetPlane({ source: "parametric", wallMounted: true, counterItem: true }) === "counter");
check("a floor-standing catalog item targets the floor",
  resolveTargetPlane({ source: "catalog" }) === "floor");
check("a catalog item at chest height or above is hung",
  resolveTargetPlane({ source: "catalog", defaultElevation: 1.4 }) === "wall");
check("a catalog item on a low plinth is still a floor item",
  resolveTargetPlane({ source: "catalog", defaultElevation: 0.3 }) === "floor");
check("a ceiling fixture targets the ceiling",
  resolveTargetPlane({ source: "fixture", category: "Ceiling" }) === "ceiling");
check("a sconce targets the wall",
  resolveTargetPlane({ source: "fixture", category: "Wall" }) === "wall");
check("the paint brush targets the wall — painting from above fails the same way",
  resolveTargetPlane({ source: "brush", kind: "paint" }) === "wall");
check("the floor brush targets the floor",
  resolveTargetPlane({ source: "brush", kind: "floor" }) === "floor");
check("doors and windows are cut into walls",
  resolveTargetPlane({ source: "opening" }) === "wall");

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
