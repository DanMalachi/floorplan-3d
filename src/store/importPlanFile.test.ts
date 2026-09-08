// Run: npm run test:import
//
// One rule, pinned: A FAILED IMPORT MUST NOT COST THE USER THEIR PLAN.
//
// `importPlanFile` used to wipe the trace, the built scene, the scale and the
// undo history in its very first `set()` — before the file had been read, let
// alone parsed. Dropping the wrong file onto the canvas (a .txt, a 320px
// thumbnail, a truncated .dxf, a .dwg on a host with no converter) therefore
// destroyed the in-progress plan and reported the failure to a store that no
// longer had anything to go back to. The clean slate now lands in the same
// `set()` that commits the parsed result, so every case below asserts the prior
// plan is exactly where it was, and the last one asserts the success path still
// commits exactly what it committed before.
//
// The store is a module singleton, so each case re-seeds it with `seed()`.
// Only the browser APIs the import path actually reaches are faked: FileReader
// + window.Image (planImport's `loadImageFile`) and `fetch` (the DWG route).
// Nothing about the store itself is mocked — the real action runs.

import assert from "node:assert/strict";
import type { ParametricSpec, Scene } from "@/schema/scene";
import { useSceneStore, type TraceImage } from "./useSceneStore";

let failures = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures += 1;
    console.error(`  FAIL ${name}\n       ${(e as Error).message}`);
  }
}

// ---- fake browser bits the import path reaches ------------------------------

const g = globalThis as unknown as Record<string, unknown>;

/** What the next faked `window.Image` decode reports. */
let nextImageSize = { width: 1600, height: 1200 };
const NEW_SRC = "data:image/png;base64,NEWPLAN";

class FakeFileReader {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL(_file: unknown) {
    this.result = NEW_SRC;
    queueMicrotask(() => this.onload?.());
  }
}

class FakeImage {
  naturalWidth = 0;
  naturalHeight = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_v: string) {
    this.naturalWidth = nextImageSize.width;
    this.naturalHeight = nextImageSize.height;
    queueMicrotask(() => this.onload?.());
  }
}

g.FileReader = FakeFileReader;
g.window = { Image: FakeImage };

// ---- the plan the user already has open -------------------------------------

const PRIOR_IMAGE: TraceImage = { src: "data:image/png;base64,PRIOR", width: 2000, height: 1400 };
const PRIOR_SCENE: Scene = {
  schemaVersion: 2,
  units: "meters",
  nodes: [{ id: "n0", x: 0, y: 0 }],
  walls: [],
  openings: [],
  rooms: [],
  furniture: [],
};
const PRIOR_POINTS = [
  { id: "p0", x: 10, y: 20 },
  { id: "p1", x: 90, y: 20 },
];
const PRIOR_SEGMENTS = [{ id: "s0", a: "p0", b: "p1" }];
const PRIOR_OPENINGS = [
  { id: "o0", type: "door" as const, segmentId: "s0", t0: 0.2, t1: 0.4, height: 2.05, sill: 0 },
];
const PRIOR_HISTORY = [
  { points: [], segments: [], openings: [], stairs: [], stairDraft: null, activeLastPointId: null },
];
const PRIOR_IMPORTED_SEGMENTS = [
  { x0: 0, y0: 0, x1: 10, y1: 0, color: null, width: 1, layer: "KIROT" },
];
// Trace-time stairs: their own draft array, NOT TraceSegments and NOT
// scene.stairs (which rides along inside `scene`). A flight traced on the old
// plan used to survive into the new one.
const PRIOR_STAIRS = [
  { id: "st0", flights: [{ x0: 100, y0: 100, x1: 100, y1: 300 }], width: 1, rise: 2.8 },
];
const PRIOR_STAIR_DRAFT = { flights: [], foot: { x: 400, y: 400 }, width: null };
// The Build-mode (3D) undo stack — a DIFFERENT stack from `history`. Each entry
// holds a whole previous scene, so an uncleared one lets a single Ctrl+Z after
// an import restore the old project on top of the new plan.
const OLD_SCENE_IN_UNDO: Scene = {
  schemaVersion: 2,
  units: "meters",
  nodes: [{ id: "ghost", x: 5, y: 5 }],
  walls: [],
  openings: [],
  rooms: [],
  furniture: [],
};
const PRIOR_SCENE_PAST = [{ label: "Place furniture", scene: OLD_SCENE_IN_UNDO }];
const PRIOR_SCENE_FUTURE = [{ label: "Delete wall", scene: OLD_SCENE_IN_UNDO }];
// Armed tool state pointed at the plan being replaced.
const specOfGen = (generator: ParametricSpec["generator"]): ParametricSpec => ({
  generator,
  dims: { w: 0.6, d: 0.6, h: 0.9 },
  modules: {},
  front: "slab",
  handle: "bar",
  finish: "oak",
});
const PRIOR_PLACING_COUNTER = { generator: "sink" as const, spec: specOfGen("sink") };
const PRIOR_PLACING_WALL = { generator: "mirror" as const, spec: specOfGen("mirror") };
const PRIOR_BRUSH = { kind: "paint" as const, hex: "#c0ffee" };

function seed() {
  useSceneStore.setState({
    points: PRIOR_POINTS,
    segments: PRIOR_SEGMENTS,
    openings: PRIOR_OPENINGS,
    stairs: PRIOR_STAIRS,
    stairDraft: PRIOR_STAIR_DRAFT,
    activeLastPointId: "p1",
    selectedPointId: "p0",
    selectedOpeningId: "o0",
    selectedStairId: "st0",
    scene: PRIOR_SCENE,
    history: PRIOR_HISTORY,
    scenePast: PRIOR_SCENE_PAST,
    sceneFuture: PRIOR_SCENE_FUTURE,
    calibrationPts: [{ x: 1, y: 2 }],
    metersPerPixel: 0.02,
    sel3d: { kind: "wall", id: "w0" },
    hover3d: { kind: "furniture", id: "f0" },
    placing: { assetId: "chair", rotation: 0 },
    placingRun: null,
    placingCounter: PRIOR_PLACING_COUNTER,
    placingWall: PRIOR_PLACING_WALL,
    brush: PRIOR_BRUSH,
    eyedropper: true,
    buildTool: "measure",
    openingType: "window",
    replaceTarget: "f0",
    collab: null,
    image: PRIOR_IMAGE,
    imageOpacity: 0.6,
    sourcePdfName: "existing-plan.pdf",
    importedSegments: PRIOR_IMPORTED_SEGMENTS,
    importedArcs: [],
    importedTexts: [],
    showImport: true,
    traceStep: 3,
    mode: "wall",
    importBusy: false,
    importMsg: null,
    importMsgKey: null,
    importStatus: "ok",
  });
}

/** Every field a failed import must have left alone. Identity, not deep
 *  equality, wherever the seed is an object: the arrays and the scene must be
 *  the SAME objects, which a clear-then-rebuild could not fake by accident. */
function assertPlanIntact() {
  const s = useSceneStore.getState();
  assert.equal(s.points, PRIOR_POINTS, "points were replaced");
  assert.equal(s.segments, PRIOR_SEGMENTS, "segments were replaced");
  assert.equal(s.openings, PRIOR_OPENINGS, "openings were replaced");
  assert.equal(s.scene, PRIOR_SCENE, "the built scene was replaced");
  assert.equal(s.history, PRIOR_HISTORY, "undo history was cleared");
  assert.equal(s.stairs, PRIOR_STAIRS, "traced stairs were dropped");
  assert.equal(s.stairDraft, PRIOR_STAIR_DRAFT, "the half-drawn staircase was dropped");
  assert.equal(s.activeLastPointId, "p1", "the drawing chain was broken");
  assert.equal(s.selectedPointId, "p0", "the point selection was dropped");
  assert.equal(s.selectedOpeningId, "o0", "the opening selection was dropped");
  assert.equal(s.selectedStairId, "st0", "the stair selection was dropped");
  assert.equal(s.scenePast, PRIOR_SCENE_PAST, "the Build-mode undo stack was cleared");
  assert.equal(s.sceneFuture, PRIOR_SCENE_FUTURE, "the Build-mode redo stack was cleared");
  assert.equal(s.metersPerPixel, 0.02, "scale calibration was lost");
  assert.deepEqual(s.calibrationPts, [{ x: 1, y: 2 }], "calibration points were cleared");
  assert.equal(s.image, PRIOR_IMAGE, "the background plan image was replaced");
  assert.equal(s.imageOpacity, 0.6, "image opacity moved");
  assert.equal(s.sourcePdfName, "existing-plan.pdf", "the source name took the failed file's name");
  assert.equal(s.importedSegments, PRIOR_IMPORTED_SEGMENTS, "the CAD overlay was dropped");
  assert.equal(s.showImport, true, "the CAD overlay was hidden");
  assert.equal(s.traceStep, 3, "the trace wizard was rewound");
  assert.equal(s.mode, "wall", "the tool switched out from under the user");
  assert.deepEqual(s.sel3d, { kind: "wall", id: "w0" }, "the 3D selection was dropped");
  assert.deepEqual(s.hover3d, { kind: "furniture", id: "f0" }, "the 3D hover was dropped");
  assert.deepEqual(s.placing, { assetId: "chair", rotation: 0 }, "armed placement was dropped");
  assert.equal(s.placingCounter, PRIOR_PLACING_COUNTER, "the armed counter item was disarmed");
  assert.equal(s.placingWall, PRIOR_PLACING_WALL, "the armed wall item was disarmed");
  assert.equal(s.brush, PRIOR_BRUSH, "the armed brush was disarmed");
  assert.equal(s.eyedropper, true, "the eyedropper was disarmed");
  assert.equal(s.buildTool, "measure", "the Build tool reset out from under the user");
  assert.equal(s.openingType, "window", "the armed opening type reset");
  assert.equal(s.replaceTarget, "f0", "the pending replace target was dropped");
  assert.equal(s.importBusy, false, "importBusy stuck on — the spinner never stops");
  assert.equal(s.importStatus, "error", "the failure was not reported as an error");
}

const fileOf = (name: string, body: string, type = "") => new File([body], name, { type });

// tsx transpiles this file to CJS, so the cases run inside main() rather than
// on top-level await.
async function main() {
  console.log("a failed import leaves the current plan alone");

  await check("unsupported file type (the classic wrong drag-and-drop)", async () => {
    seed();
    await useSceneStore.getState().importPlanFile(fileOf("notes.txt", "hello", "text/plain"));
    assertPlanIntact();
    assert.deepEqual(useSceneStore.getState().importMsgKey, { key: "unsupported" });
  });

  await check("image under MIN_IMAGE_PX (validation failure, nothing thrown)", async () => {
    seed();
    nextImageSize = { width: 320, height: 240 };
    await useSceneStore.getState().importPlanFile(fileOf("thumb.png", "x", "image/png"));
    assertPlanIntact();
    assert.deepEqual(useSceneStore.getState().importMsgKey, {
      key: "tooSmall",
      width: 320,
      height: 240,
      min: 600,
    });
  });

  await check("corrupt DXF (the parser throws)", async () => {
    seed();
    await useSceneStore.getState().importPlanFile(fileOf("truncated.dxf", "0\nSECTION\n2\nENTIT"));
    assertPlanIntact();
    assert.equal(useSceneStore.getState().importMsgKey?.key, "failed");
  });

  await check("DWG the server cannot convert (HTTP 501)", async () => {
    seed();
    const realFetch = g.fetch;
    g.fetch = async () =>
      new Response(JSON.stringify({ error: "no converter" }), {
        status: 501,
        headers: { "content-type": "application/json" },
      });
    try {
      await useSceneStore.getState().importPlanFile(fileOf("plan.dwg", "binary"));
    } finally {
      g.fetch = realFetch;
    }
    assertPlanIntact();
    const key = useSceneStore.getState().importMsgKey;
    assert.equal(key?.key, "failed");
    assert.match(
      key?.key === "failed" ? key.message : "",
      /local converter/,
      "the authored DWG guidance is what the user should see",
    );
  });

  console.log("a successful import still replaces the plan");

  await check("a good image clears the old plan and commits the new one", async () => {
    seed();
    nextImageSize = { width: 1600, height: 1200 };
    await useSceneStore.getState().importPlanFile(fileOf("new-plan.png", "x", "image/png"));
    const s = useSceneStore.getState();
    // clean slate
    assert.deepEqual(s.points, [], "old trace points survived a SUCCESSFUL import");
    assert.deepEqual(s.segments, []);
    assert.deepEqual(s.openings, []);
    assert.deepEqual(s.history, []);
    assert.deepEqual(s.stairs, [], "a stair traced on the old plan survived");
    assert.equal(s.stairDraft, null, "a half-drawn staircase survived");
    assert.equal(s.activeLastPointId, null, "the pen still chains off a deleted point");
    assert.equal(s.selectedPointId, null, "a dangling point selection survived");
    assert.equal(s.selectedOpeningId, null, "a dangling opening selection survived");
    assert.equal(s.selectedStairId, null, "a dangling stair selection survived");
    assert.deepEqual(s.scene.nodes, [], "the old built scene survived");
    assert.deepEqual(s.scenePast, [], "the old plan's Build-mode undo stack survived");
    assert.deepEqual(s.sceneFuture, [], "the old plan's Build-mode redo stack survived");
    assert.deepEqual(s.calibrationPts, []);
    assert.equal(s.metersPerPixel, null);
    assert.equal(s.sel3d, null);
    assert.equal(s.hover3d, null);
    assert.equal(s.placing, null);
    assert.equal(s.placingCounter, null, "a counter item stayed armed across the import");
    assert.equal(s.placingWall, null, "a wall item stayed armed across the import");
    assert.equal(s.brush, null, "a paint brush stayed armed across the import");
    assert.equal(s.eyedropper, false, "the eyedropper stayed armed across the import");
    assert.equal(s.buildTool, "select");
    assert.equal(s.openingType, "door");
    assert.equal(s.replaceTarget, null, "a replace target pointed at the old scene survived");
    // the new plan
    assert.equal(s.image?.src, NEW_SRC);
    assert.equal(s.image?.width, 1600);
    assert.equal(s.sourcePdfName, "new-plan.png");
    assert.equal(s.imageOpacity, 0.8);
    assert.deepEqual(s.importedSegments, []);
    assert.deepEqual(s.importedTexts, []);
    assert.equal(s.traceStep, 2);
    assert.equal(s.mode, "calibrate", "a scale-less plan must open in calibrate");
    assert.equal(s.importBusy, false);
    assert.equal(s.importStatus, "ok");
    assert.match(s.importMsg ?? "", /Image loaded/);
    assert.equal(s.importMsgKey, null);
  });

  // The reset above is only worth anything if it makes the old scene
  // UNREACHABLE. `scenePast` backs Ctrl+Z in Build mode, so an entry left over
  // from the previous project is one keystroke away from being restored on top
  // of the plan the user just imported — a silent cross-project data swap, not
  // merely stale state.
  await check("Ctrl+Z after an import cannot resurrect the previous project", async () => {
    seed();
    nextImageSize = { width: 1600, height: 1200 };
    await useSceneStore.getState().importPlanFile(fileOf("new-plan.png", "x", "image/png"));
    useSceneStore.getState().undoScene();
    const afterUndo = useSceneStore.getState();
    assert.notEqual(afterUndo.scene, OLD_SCENE_IN_UNDO, "undo restored the OLD project's scene");
    assert.deepEqual(afterUndo.scene.nodes, [], "undo pulled the old plan's geometry back");
    useSceneStore.getState().redoScene();
    const afterRedo = useSceneStore.getState();
    assert.notEqual(afterRedo.scene, OLD_SCENE_IN_UNDO, "redo restored the OLD project's scene");
    assert.deepEqual(afterRedo.scene.nodes, [], "redo pulled the old plan's geometry back");
  });

  console.log(failures === 0 ? "\nall import-rollback checks passed" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
