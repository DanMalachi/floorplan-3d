// Run: npx tsx src/store/projectDoc.test.ts
//
// The migration ladder is the risky part of moving projects to the cloud: v1
// documents carry the plan image inline, v2 keeps it in a side store, and a
// mistake here silently empties someone's saved work. So the contract is pinned
// here, on pure functions, with no IndexedDB in the way.
//
// The load-bearing case is "v1 survives": the previous code compared
// `schemaVersion === SCHEMA_VERSION` and reset the project to defaults on any
// mismatch, which would have wiped every existing project on this very bump.

import {
  SCHEMA_VERSION,
  attachImage,
  dropPdfVectors,
  hashString,
  migrateDoc,
  stripImage,
  type ProjectDocument,
  type ProjectState,
} from "./projectDoc";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const PIXELS = "data:image/png;base64," + "A".repeat(4096);

function stateOf(image: { src: string; width: number; height: number } | null): ProjectState {
  return {
    scene: { schemaVersion: 2, nodes: [{ id: "n0", x: 1, y: 2 }], walls: [], openings: [], rooms: [], furniture: [] },
    appMode: "build",
    image,
    imageOpacity: 0.6,
    sourcePdfName: "plan.pdf",
    points: [{ id: "p0", x: 10, y: 20 }],
    segments: [],
    openings: [],
    stairs: [],
    metersPerPixel: 0.02,
    liveRoomId: null,
  } as unknown as ProjectState;
}

const v1Doc = (state: ProjectState): unknown => ({
  schemaVersion: 1,
  savedAt: 1234,
  state,
  worldModel: null,
});

// ---- hashing ----------------------------------------------------------------

check("hash is stable", hashString(PIXELS) === hashString(PIXELS));
check("hash separates different content", hashString(PIXELS) !== hashString(PIXELS + "B"));
check("hash of empty string is defined", typeof hashString("") === "string");

// ---- stripImage / attachImage -----------------------------------------------

{
  const state = stateOf({ src: PIXELS, width: 800, height: 600 });
  const split = stripImage(state);
  check("strip extracts the pixels", split.src === PIXELS);
  check("strip produces a hash", split.hash === hashString(PIXELS));
  check("stripped doc holds no pixels", split.state.image?.src === "");
  check("strip keeps the dimensions", split.state.image?.width === 800 && split.state.image?.height === 600);
  check("strip does not mutate the input", state.image?.src === PIXELS);
  check("strip keeps the rest of the state", JSON.stringify(split.state.points) === JSON.stringify(state.points));

  const back = attachImage(split.state, split.src);
  check("attach restores the original state", JSON.stringify(back) === JSON.stringify(state));
}

{
  // The live-room mirror reads a document (pixels already stripped), merges a
  // scene patch and writes it back. That must NOT be read as "the image was
  // cleared", or the mirror would delete the plan image on the first patch.
  const stored = stateOf({ src: "", width: 800, height: 600 });
  const split = stripImage(stored);
  check("already-stripped state yields no write", split.src === null && split.hash === null);
  check("already-stripped state is passed through", split.state === stored);
}

{
  const split = stripImage(stateOf(null));
  check("no image → nothing to store", split.src === null && split.hash === null);
  check("attach with no src is a no-op", attachImage(split.state, null) === split.state);
}

// ---- migration --------------------------------------------------------------

{
  const original = stateOf({ src: PIXELS, width: 1200, height: 900 });
  const m = migrateDoc(v1Doc(original));
  check("v1 document is NOT discarded", m !== null);
  check("v1 → current version", m?.doc.schemaVersion === SCHEMA_VERSION);
  check("v1 hands the pixels to the side store", m?.pendingImage === PIXELS);
  check("v1 document is rewritten", m?.changed === true);
  check("v1 keeps savedAt", m?.doc.savedAt === 1234);
  check("v1 records the image hash", m?.doc.imageHash === hashString(PIXELS));
  check("migrated document carries no pixels", m?.doc.state.image?.src === "");

  // The whole point: nothing is lost across the move.
  const restored = attachImage(m!.doc.state, m!.pendingImage);
  check("v1 round-trips without loss", JSON.stringify(restored) === JSON.stringify(original));
}

{
  const m = migrateDoc(v1Doc(stateOf(null)));
  check("v1 without an image migrates", m?.doc.schemaVersion === SCHEMA_VERSION);
  check("v1 without an image stores nothing", m?.pendingImage === null && m?.doc.imageHash === null);
}

{
  const doc: ProjectDocument = {
    schemaVersion: SCHEMA_VERSION,
    savedAt: 99,
    state: stateOf({ src: "", width: 10, height: 10 }),
    worldModel: null,
    imageHash: "abc",
  };
  const m = migrateDoc(doc);
  check("current version passes through", m?.doc.schemaVersion === SCHEMA_VERSION && m?.changed === false);
  check("current version keeps its hash", m?.doc.imageHash === "abc");
  check("current version needs no side write", m?.pendingImage === null);
}

{
  const noHash = { schemaVersion: SCHEMA_VERSION, savedAt: 1, state: stateOf(null), worldModel: null };
  check("missing imageHash defaults to null", migrateDoc(noHash)?.doc.imageHash === null);
}

// ---- retiring the PDF vector overlay ----------------------------------------
//
// PDF import stopped extracting drawing geometry: on AutoCAD exports it landed
// offset from the rendered page and fought the pen. Projects saved before that
// still carry theirs, and would put the overlay back on the canvas at load.
// DXF/DWG vectors are registered correctly and must survive untouched.

const SEG = { x0: 0, y0: 0, x1: 10, y1: 0, color: null, width: 1, layer: "0" };
const ARC = { x0: 0, y0: 0, x1: 5, y1: 5, chord: 2, color: null, width: 1, layer: "0" };

const withVectors = (sourceName: string | null): ProjectState =>
  ({
    ...stateOf(null),
    sourcePdfName: sourceName,
    importedSegments: [SEG],
    importedArcs: [ARC],
    importedTexts: [{ x: 1, y: 2, text: "BEDROOM" }],
    showImport: true,
  }) as unknown as ProjectState;

{
  const r = dropPdfVectors(withVectors("plan.pdf"));
  check("PDF vectors are dropped", r.changed && r.state.importedSegments.length === 0);
  check("PDF arcs are dropped too", r.state.importedArcs.length === 0);
  check("the overlay toggle is turned off", r.state.showImport === false);
  check("room-label texts survive", r.state.importedTexts.length === 1);
}

{
  const dxf = withVectors("plan.dxf");
  const r = dropPdfVectors(dxf);
  check("DXF vectors are kept", !r.changed && r.state === dxf);
  check("DWG vectors are kept", dropPdfVectors(withVectors("plan.DWG")).changed === false);
}

{
  // Nothing to attribute the geometry to — leave it rather than guess.
  check("unattributed vectors are left alone", dropPdfVectors(withVectors(null)).changed === false);
  // Idempotent: a PDF project with no vectors left is already clean.
  check("a clean PDF project is untouched", dropPdfVectors(stateOf(null)).changed === false);
  check("uppercase .PDF is matched", dropPdfVectors(withVectors("PLAN.PDF")).changed === true);
}

{
  // The repair rides the existing ladder rather than a schema bump: bumping
  // would make an older build (or another synced device) read the document as
  // "newer than us" and reset the project to defaults.
  const doc = {
    schemaVersion: SCHEMA_VERSION,
    savedAt: 7,
    state: withVectors("plan.pdf"),
    worldModel: null,
    imageHash: null,
  };
  const m = migrateDoc(doc);
  check("stale PDF vectors are repaired at load", m?.doc.state.importedSegments.length === 0);
  check("the repair marks the document dirty", m?.changed === true);
  check("the repair does not bump the version", m?.doc.schemaVersion === SCHEMA_VERSION);
  check("the repair does not mutate the input", doc.state.importedSegments.length === 1);

  const v1 = migrateDoc({ schemaVersion: 1, savedAt: 7, state: withVectors("plan.pdf"), worldModel: null });
  check("v1 documents are repaired on the way up", v1?.doc.state.importedSegments.length === 0);
}

// ---- unreadable input -------------------------------------------------------

check("null is rejected", migrateDoc(null) === null);
check("a non-object is rejected", migrateDoc("nope") === null);
check("a document without state is rejected", migrateDoc({ schemaVersion: 1, savedAt: 0 }) === null);
check(
  "a future version is rejected rather than guessed at",
  migrateDoc({ schemaVersion: 99, savedAt: 0, state: stateOf(null) }) === null,
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
