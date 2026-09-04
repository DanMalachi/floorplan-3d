// NOT CURRENTLY RENDERED, and as of 2026-09-04 NOT RE-USABLE AS DATA EITHER.
//
// It used to be kept on the grounds that every assetId here was verified
// against the catalog AND collision-checked at its target's pose, so
// re-enabling a swap strip would be a UI change rather than a data exercise.
// That is no longer true. The hero was re-furnished from `/design?hero=1` and
// now holds no BlenderKit models at all, so:
//
//   - the `itemId`s below (f2, f3, f4, f6) still EXIST but mean entirely
//     different things — a mirror, a toilet, a towel rail and a bathroom rug.
//     Wiring this up as-is would offer to swap a toilet for a sofa.
//   - the poses every collision check was made against are gone.
//
// Nothing imports this file, so it is inert; it is left in place only so the
// alternate-asset research is not thrown away silently. Re-doing the swap strip
// means re-picking targets and re-checking collisions against the CURRENT
// demoScene.ts, not editing the ids below.

// -----------------------------------------------------------------------------
// The hero's swap strip: a handful of alternate BlenderKit assets a visitor
// can drop onto a demo item without opening a real picker. Data only — no
// JSX, no store access. DemoRoom.tsx renders this and calls
// `useSceneStore.getState().replaceFurnitureAsset(itemId, assetId)`.
//
// Every `assetId` below is verified against
// data/furniture-blenderkit.catalog.json and confirmed to have a .glb under
// public/furniture/blenderkit/opt/ (same check as demoScene.ts — see the
// build report). Each option is footprint-checked by hand against its
// neighbours in demoScene.ts so a swap never intersects a wall or another
// piece (the largest swing is the Leather Sofa at 3.499m wide, still clear
// of the bed and the storage cabinet at demoScene's sofa position).
//
// Two categories from the brief (rug, second bed style) don't exist in the
// 75-item BlenderKit catalog at all — there is no rug asset, and "Beds" has
// exactly one item — so the four groups below are the ones the real catalog
// actually supports: sofa, armchair, coffee table, storage.
// -----------------------------------------------------------------------------

export interface SwapOption {
  assetId: string;
  label: string;
}

export interface SwapGroup {
  /** The demoScene FurnitureItem.id this group swaps. */
  itemId: string;
  /** Short label for the swap strip's group heading. */
  label: string;
  options: SwapOption[];
}

export const demoSwaps: SwapGroup[] = [
  {
    itemId: "f2", // Cotton Mini Sofa
    label: "Sofa",
    options: [
      { assetId: "blenderkit:d19dd7b1-6573-41c7-b12c-b3eccdb7047d", label: "Cotton" },
      { assetId: "blenderkit:6c59319d-a7b6-470b-a0f9-981083a415ae", label: "Leather" },
      { assetId: "blenderkit:d4e83285-807e-4bcf-8d84-3dd83cb44da5", label: "Chinese" },
    ],
  },
  {
    itemId: "f4", // Ikea Onnestad Red Armchair
    label: "Armchair",
    options: [
      { assetId: "blenderkit:6122afb7-3fb5-441e-9fa3-f57de7ebed93", label: "Red Onnestad" },
      { assetId: "blenderkit:e8a6bdac-2b8e-424c-ba9c-af3e0584e9a6", label: "Chinese" },
      { assetId: "blenderkit:bf356937-e6e7-4a2e-91c7-c1251d1a406b", label: "Vintage" },
    ],
  },
  {
    itemId: "f3", // Coffee Table
    label: "Coffee table",
    options: [
      { assetId: "blenderkit:4db96473-72ed-4947-80d8-af6dc1c4dee8", label: "Classic" },
      { assetId: "blenderkit:b6bdc26a-36bb-4be3-8f64-312836aae79b", label: "Modern" },
      { assetId: "blenderkit:1a2474e6-2fce-480a-be98-0b12c6b696ab", label: "Industrial" },
    ],
  },
  {
    itemId: "f6", // Painted Wooden Cabinet
    label: "Storage",
    options: [
      { assetId: "blenderkit:30a3d1c5-6554-42fd-a8d0-a1efdff162b3", label: "Painted wood" },
      { assetId: "blenderkit:89df3e31-303c-4401-a54f-ec834e46e180", label: "Modern wood" },
      { assetId: "blenderkit:2b43761f-123c-4017-b706-ebef91754456", label: "Chinese" },
    ],
  },
];
