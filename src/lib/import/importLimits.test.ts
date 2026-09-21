// Run: npm run test:security
import assert from "node:assert/strict";
import { exceedsImportBytes, exceedsImageEdge, MAX_IMPORT_BYTES, MAX_IMAGE_EDGE_PX } from "./importLimits";

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

console.log("import limits");
check("a normal scanned plan passes", () => {
  assert.equal(exceedsImportBytes({ size: 25 * 1024 * 1024 }), false);
  assert.equal(exceedsImageEdge({ width: 6000, height: 4200 }), false);
});
check("the byte cap is exact at the boundary", () => {
  assert.equal(exceedsImportBytes({ size: MAX_IMPORT_BYTES }), false);
  assert.equal(exceedsImportBytes({ size: MAX_IMPORT_BYTES + 1 }), true);
});
check("a giant raster is refused on either edge", () => {
  assert.equal(exceedsImageEdge({ width: MAX_IMAGE_EDGE_PX + 1, height: 100 }), true);
  assert.equal(exceedsImageEdge({ width: 100, height: 40_000 }), true);
});

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log("\nall passed");
