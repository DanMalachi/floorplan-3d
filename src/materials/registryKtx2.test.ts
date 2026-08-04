// M3d/D4 proof: reachability is genuinely derived from `class`, and a
// non-floor asset genuinely cannot reach the floor-rendering path — not by
// convention, checked. This is the substantive half of "registering the 4
// non-floor assets touches no lighting code": if a non-floor id structurally
// cannot resolve as a floor, it cannot reach FloorMesh/textures.ts at all,
// which is a stronger guarantee than a git-diff check alone.
//
// Run: npx tsx src/materials/registryKtx2.test.ts
import { KTX2_MATERIALS, consumingUIFor, getKtx2FloorMaterial, materialsByClass, unreachableMaterials } from "./registryKtx2";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const EXPECTED_FLOOR_IDS = [
  "carpet-beige", "carpet-navy", "concrete-grey", "concrete-light", "stone-terrazzo",
  "tile-black-gloss", "tile-checker-marble", "tile-hex-white", "wood-basketweave",
  "wood-chevron", "wood-walnut-dark", "wood-oak-natural", "wood-plank-pale", "wood-grey-weathered",
].sort();

const EXPECTED_NON_FLOOR_IDS = [
  "wall-paint-white-clean", "ceiling-plaster-white", "door-walnut-lacquered", "window-aluminium-anodised",
].sort();

console.log(`Registry has ${KTX2_MATERIALS.length} materials total.`);
check("18 materials registered", KTX2_MATERIALS.length === 18, String(KTX2_MATERIALS.length));

console.log("\nFloor-class materials are picker-reachable:");
const floors = materialsByClass("floors").map((m) => m.id).sort();
check("materialsByClass('floors') is exactly the 14 shipped floors", JSON.stringify(floors) === JSON.stringify(EXPECTED_FLOOR_IDS), floors.join(","));
for (const id of EXPECTED_FLOOR_IDS) {
  check(`getKtx2FloorMaterial('${id}') resolves`, getKtx2FloorMaterial(id) !== undefined);
  check(`consumingUIFor('${id}') is 'floor-picker'`, consumingUIFor({ class: "floors" }) === "floor-picker");
}

console.log("\nNon-floor-class materials are registered but structurally unreachable as floors:");
const unreachable = unreachableMaterials().map((m) => m.id).sort();
check("unreachableMaterials() is exactly the 4 M3c non-floor assets", JSON.stringify(unreachable) === JSON.stringify(EXPECTED_NON_FLOOR_IDS), unreachable.join(","));
for (const id of EXPECTED_NON_FLOOR_IDS) {
  check(`getKtx2FloorMaterial('${id}') returns undefined (cannot resolve as a floor)`, getKtx2FloorMaterial(id) === undefined);
  const m = KTX2_MATERIALS.find((x) => x.id === id);
  check(`consumingUIFor('${id}') is 'none'`, !!m && consumingUIFor(m) === "none");
}

console.log("\nThe bypass this guards against — a non-floor id sitting in Room.floor (schema/scene.ts: an unrestricted string) must not render as a floor:");
for (const id of EXPECTED_NON_FLOOR_IDS) {
  check(`'${id}' cannot be resolved via the floor-rendering entrypoint`, getKtx2FloorMaterial(id) === undefined);
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
