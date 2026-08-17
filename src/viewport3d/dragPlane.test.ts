// Headless: why a drag must not run on the floor plane, asserted as geometry
// rather than as a story. Run: npx tsx src/viewport3d/dragPlane.test.ts

import * as THREE from "three";
import { rayToPlanAt, grabHeight } from "./dragPlane";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const NO_OFFSET = { cx: 0, cz: 0 };

/** A pointer ray from an orbit camera 6m up and 6m back, through a screen
 *  point nudged by `du` horizontally — i.e. the user moving the mouse. */
function ray(du: number): THREE.Ray {
  const origin = new THREE.Vector3(0, 6, 6);
  const dir = new THREE.Vector3(du, -1, -1).normalize();
  return new THREE.Ray(origin, dir);
}

console.log("\nthe plane a gesture runs on");
{
  const p0 = rayToPlanAt(ray(0), 0, NO_OFFSET)!;
  const p12 = rayToPlanAt(ray(0), 1.2, NO_OFFSET)!;
  check("the same ray meets the floor and a 1.2m plane at different plan points",
    Math.hypot(p0.x - p12.x, p0.y - p12.y) > 1,
    `floor (${p0.x.toFixed(2)}, ${p0.y.toFixed(2)}) vs 1.2m (${p12.x.toFixed(2)}, ${p12.y.toFixed(2)})`);
}

{
  // The rate difference — the part a constant grab offset cannot correct.
  // Move the pointer, and see how far each plane's point travelled.
  const step = 0.05;
  const floorTravel = Math.hypot(
    rayToPlanAt(ray(step), 0, NO_OFFSET)!.x - rayToPlanAt(ray(0), 0, NO_OFFSET)!.x,
    rayToPlanAt(ray(step), 0, NO_OFFSET)!.y - rayToPlanAt(ray(0), 0, NO_OFFSET)!.y,
  );
  const grabTravel = Math.hypot(
    rayToPlanAt(ray(step), 1.2, NO_OFFSET)!.x - rayToPlanAt(ray(0), 1.2, NO_OFFSET)!.x,
    rayToPlanAt(ray(step), 1.2, NO_OFFSET)!.y - rayToPlanAt(ray(0), 1.2, NO_OFFSET)!.y,
  );
  check("the floor point moves FASTER than the point you grabbed",
    floorTravel > grabTravel * 1.15,
    `floor ${floorTravel.toFixed(3)}m vs grabbed ${grabTravel.toFixed(3)}m per pointer step`);
  console.log(
    `       a 1.2m-high grab drifts ${((floorTravel / grabTravel - 1) * 100).toFixed(0)}%` +
      ` per unit of pointer travel when driven off the floor`,
  );
}

{
  // The fix, stated as the property that matters: the point you grabbed stays
  // under the cursor. Grab a spot 0.4m to the right of an item's centre at
  // counter height; after any pointer move, the item's centre is still exactly
  // 0.4m from the pointer's point on that plane.
  const H = 0.84;
  const down = rayToPlanAt(ray(0), H, NO_OFFSET)!;
  const itemCentre = { x: down.x - 0.4, y: down.y };
  const grabDx = down.x - itemCentre.x;
  const grabDy = down.y - itemCentre.y;
  let worst = 0;
  for (const du of [0.02, 0.05, 0.1, 0.2, -0.15]) {
    const move = rayToPlanAt(ray(du), H, NO_OFFSET)!;
    const centre = { x: move.x - grabDx, y: move.y - grabDy };
    worst = Math.max(worst, Math.hypot(move.x - centre.x - 0.4, move.y - centre.y));
  }
  check("on the grab plane the grabbed point tracks the cursor exactly", worst < 1e-12,
    `worst ${worst.toExponential(2)}m`);
}

{
  const flat = new THREE.Ray(new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(1, 0, 0));
  check("a ray parallel to the plane returns null (caller falls back)",
    rayToPlanAt(flat, 0, NO_OFFSET) === null);
  check("offset is applied", (() => {
    const a = rayToPlanAt(ray(0), 0, NO_OFFSET)!;
    const b = rayToPlanAt(ray(0), 0, { cx: 10, cz: -3 })!;
    return Math.abs(b.x - a.x - 10) < 1e-9 && Math.abs(b.y - a.y + 3) < 1e-9;
  })());
  check("grabHeight reads the hit point", grabHeight(new THREE.Vector3(0, 1.45, 0), 0) === 1.45);
  check("grabHeight falls back when there is no hit point", grabHeight(undefined, 0.84) === 0.84);
}

console.log(failures === 0 ? "\nall dragPlane checks passed" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
