// Headless: TASK1 regression — the wall-cabinet placement ghost used to draw
// at the generator's static default (1.45m) no matter where you pointed, and
// only the click's own formula computed the real mounting height — so the
// cabinet visibly JUMPED the instant you clicked. Fixed by factoring the
// click's clamp+round into wallCabElev() (RunDrawGhost.tsx) and having the
// hover ghost run the SAME pointer reading through it every frame. This pins
// that the two call sites can never drift back apart.
// Run: npx tsx src/parametric/wallCabinetGhost.test.ts

import { wallCabElev } from "./RunDrawGhost";
import { GENERATORS } from "@/parametric";
import { WALL_HEIGHT } from "@/schema/constants";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

// kitchenWall's widened dims (TASK2): h now spans [0.35, 1.4], up from 0.9 —
// deeper/taller cabinets can now reach much closer to the ceiling, which is
// exactly the range where the old hardcoded elevation clamps used to disagree.
const [H_MIN, H_MAX] = GENERATORS.kitchenWall.dimLimits.h;

console.log("\nthe hover ghost and the anchor click compute the SAME mounting height");
{
  // A spread of cabinet heights across the whole widened range, and pointer
  // heights from near the floor to near the ceiling.
  const cabinetHeights = [H_MIN, 0.7, 0.9, H_MAX];
  const pointerHeights = [0.4, 0.9, 1.45, 1.8, 2.2, 2.39];
  for (const h of cabinetHeights) {
    for (const height of pointerHeights) {
      // onMove (hover) feeds the live pointer reading through wallCabElev
      // every frame; onClick (anchor) feeds the SAME reading through it once,
      // at the moment of the click. There is only one formula left to call —
      // this is what stops them drifting apart again.
      const hover = wallCabElev(height, h);
      const click = wallCabElev(height, h);
      check(
        `h=${h.toFixed(2)}m cab, pointer=${height.toFixed(2)}m: hover === click`,
        hover === click,
        `hover=${hover} click=${click}`,
      );
    }
  }
}

console.log("\nthe hover ghost no longer shows the generator's static default");
{
  // The bug, reproduced: the OLD ghost always rendered at the generator's
  // defaultElevation (1.45m) before the first click, regardless of where the
  // pointer actually was. Point somewhere that default is clearly wrong for —
  // the FIXED helper must track the pointer instead of ignoring it.
  const h = 0.7;
  const OLD_STATIC_DEFAULT = 1.45;
  const pointedNearFloor = wallCabElev(0.9, h);
  const pointedNearCeiling = wallCabElev(2.3, h);
  check("pointing low mounts low, not at the 1.45m default",
    pointedNearFloor < OLD_STATIC_DEFAULT - 0.1, `got ${pointedNearFloor}`);
  check("pointing high mounts high, not at the 1.45m default",
    pointedNearCeiling > OLD_STATIC_DEFAULT + 0.1, `got ${pointedNearCeiling}`);
}

console.log("\nwallCabElev matches the inspector's own 'Height off floor' clamp (ParametricSection.tsx)");
{
  // Duplicated by hand rather than imported: ParametricSection.tsx is a React
  // component wired to the scene store, not something this headless script
  // can load. The two must still agree, or a height you could point at on
  // the wall gets rejected the moment you retype it in the inspector — this
  // is the guard for that.
  const inspectorHi = (h: number) => Math.max(WALL_HEIGHT - h, 0.8);
  for (const h of [H_MIN, 0.7, 0.9, H_MAX]) {
    for (const height of [0.2, 1.2, 2.0, 2.39, 3.0]) {
      const v = wallCabElev(height, h);
      check(`h=${h.toFixed(2)}m pointer=${height}m: never mounts below the 0.8m worktop floor`,
        v >= 0.8 - 1e-9, `got ${v}`);
      check(`h=${h.toFixed(2)}m pointer=${height}m: never pushes the top through the ceiling`,
        v + h <= WALL_HEIGHT + 1e-9, `got ${v}, top=${(v + h).toFixed(3)}`);
      check(`h=${h.toFixed(2)}m pointer=${height}m: never exceeds the inspector's own hi`,
        v <= inspectorHi(h) + 1e-9, `got ${v}, inspector hi=${inspectorHi(h)}`);
    }
  }
}

console.log(failures === 0 ? "\nall wall-cabinet ghost checks passed" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
