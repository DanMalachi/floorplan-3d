import { clearance, packRows, type Measured } from "./reviewLayout";

let failed = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) {
    failed++;
    console.error("FAIL", msg);
  }
};

// Pseudo-random sizes, including very wide/deep items and group changes.
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const groups = ["Beds", "Seating", "Tables", "Storage", "Decor"];
const items: Measured[] = Array.from({ length: 300 }, (_, i) => ({
  id: `a${i}`,
  group: groups[Math.floor(i / 60)],
  w: 0.1 + rnd() * 3.5,
  d: 0.1 + rnd() * 2.5,
}));

const GAP = 0.4;
const placed = packRows(items, GAP);
check(placed.length === items.length, "every item placed");

let minClear = Infinity;
for (let i = 0; i < placed.length; i++)
  for (let j = i + 1; j < placed.length; j++) minClear = Math.min(minClear, clearance(placed[i], placed[j]));
check(minClear >= GAP - 1e-9, `min clearance ${minClear} >= ${GAP}`);

// Row neighbours are exactly GAP apart.
for (let i = 1; i < placed.length; i++) {
  const a = placed[i - 1], b = placed[i];
  if (a.row !== b.row) continue;
  const g = b.x - b.w / 2 - (a.x + a.w / 2);
  check(Math.abs(g - GAP) < 1e-9, `row neighbours ${a.id}/${b.id} gap ${g}`);
}

// Groups never share a row.
for (let i = 1; i < placed.length; i++)
  if (placed[i].group !== placed[i - 1].group) check(placed[i].row !== placed[i - 1].row, "group starts new row");

console.log(failed ? `${failed} failure(s)` : `ok — ${placed.length} items, min clearance ${minClear.toFixed(3)} m`);
process.exit(failed ? 1 : 0);
