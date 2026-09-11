// Headless contract for Space-pan arbitration. Run:
//   npx tsx src/viewport3d/camera/panModifier.test.ts

import {
  finishPanPointer,
  resetPanModifier,
  setPanModifierActive,
  suppressSceneEvent,
} from "./panModifier";

let failures = 0;
const check = (name: string, condition: boolean) => {
  console.log(`  ${condition ? "ok  " : "FAIL"} ${name}`);
  if (!condition) failures++;
};
const event = (values: Record<string, unknown> = {}) => values as unknown as Event;

console.log("Space-pan owns one complete pointer gesture");
resetPanModifier();
setPanModifierActive(true);
check("plain left pointerdown is claimed", suppressSceneEvent("onPointerDown", event({ button: 0, pointerId: 7 })));
check("the matching move stays claimed", suppressSceneEvent("onPointerMove", event({ pointerId: 7 })));
check("an unrelated pointer remains available", !suppressSceneEvent("onPointerMove", event({ pointerId: 8 })));
check("the matching pointerup stays claimed", suppressSceneEvent("onPointerUp", event({ pointerId: 7 })));

console.log("the synthetic click family cannot leak into scene or native tools");
const generatedClick = event();
check("click after pan is suppressed", suppressSceneEvent("onClick", generatedClick));
check("every handler agrees about that same event", suppressSceneEvent("onClick", generatedClick));
check("a fast intentional click remains available", !suppressSceneEvent("onClick", event()));
check("dblclick after pan is suppressed too", suppressSceneEvent("onDoubleClick", event()));

console.log("releasing outside the canvas does not tax the next canvas click");
resetPanModifier();
setPanModifierActive(true);
suppressSceneEvent("onPointerDown", event({ button: 0, pointerId: 8 }));
finishPanPointer(8, false, false);
check("outside release arms no click suppression", !suppressSceneEvent("onClick", event()));

console.log("reset and non-pan presses remain transparent");
resetPanModifier();
check("ordinary left pointerdown is available", !suppressSceneEvent("onPointerDown", event({ button: 0, pointerId: 9 })));
setPanModifierActive(true);
check("right pointerdown is available", !suppressSceneEvent("onPointerDown", event({ button: 2, pointerId: 10 })));
resetPanModifier();

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
