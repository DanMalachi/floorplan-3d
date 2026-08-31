// Headless: the `?dpr=` hatch must stay inside the render contract's own DPR
// bounds and must never turn an absent or malformed parameter into a real
// override. Run: npx tsx src/render/renderDebugFlags.test.ts
//
// Only the pure parse is covered here — `dprOverride()` adds nothing but the
// `window.location.search` read, which is what the split exists to isolate.

import { DPR } from "./contract";
import { parseDprParam } from "./renderDebugFlags";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};
const eq = (name: string, got: number | null, want: number | null) =>
  check(name, got === want, `got ${got}, want ${want}`);

// --- no override -----------------------------------------------------------
eq("absent search is no override", parseDprParam(""), null);
eq("null search is no override", parseDprParam(null), null);
eq("undefined search is no override", parseDprParam(undefined), null);
eq("unrelated params are no override", parseDprParam("?perf=1&loop=always"), null);

// A bare `?dpr=` is the trap: Number("") is 0, which is finite and would clamp
// to the lower bound — a forced DPR 1 that reads as deliberate and is not.
eq("bare ?dpr= is no override, not 0-clamped-to-1", parseDprParam("?dpr="), null);
eq("whitespace-only is no override", parseDprParam("?dpr=%20"), null);
eq("non-numeric is no override", parseDprParam("?dpr=low"), null);
eq("NaN is no override", parseDprParam("?dpr=NaN"), null);

// --- the readings this exists to take --------------------------------------
eq("?dpr=1 forces 1 (the 1.11 MP reading)", parseDprParam("?dpr=1"), 1);
eq("?dpr=2 forces 2 (the 4.44 MP reading)", parseDprParam("?dpr=2"), 2);
eq("Phase 5's Balanced tier value is reachable", parseDprParam("?dpr=1.5"), 1.5);
eq("Phase 5's Low tier value is reachable", parseDprParam("?dpr=1.25"), 1.25);
eq("it reads alongside the HUD gate", parseDprParam("?perf=1&dpr=1"), 1);

// --- the contract clamp ----------------------------------------------------
// render-contract §1.1 forbids dpr unbounded or above 2 without a recorded
// amendment. The hatch must not be a route around that, in either direction.
eq("above the upper bound clamps to it", parseDprParam("?dpr=4"), DPR[1]);
eq("Infinity is not finite, so no override", parseDprParam("?dpr=Infinity"), null);
eq("below the lower bound clamps to it", parseDprParam("?dpr=0.25"), DPR[0]);
eq("zero clamps to the lower bound", parseDprParam("?dpr=0"), DPR[0]);
eq("negative clamps to the lower bound", parseDprParam("?dpr=-1"), DPR[0]);
check(
  "no reachable value escapes the contract's recorded bounds",
  ["0", "-5", "0.9", "1", "1.5", "2", "2.0001", "99"]
    .map((v) => parseDprParam(`?dpr=${v}`))
    .every((n) => n !== null && n >= DPR[0] && n <= DPR[1]),
);

console.log(failures === 0 ? "\nall render debug flag checks passed\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
