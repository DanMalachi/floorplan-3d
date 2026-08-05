import { create } from "zustand";
import type { Scene, FloorStyle, FixtureMount, OpeningType } from "@/schema/scene";
import { sampleScene } from "@/schema/sampleScene";
import {
  DEFAULT_DOOR,
  DEFAULT_WINDOW,
  DEFAULT_THICKNESS,
  DEFAULT_STAIR,
  WALL_HEIGHT,
} from "@/schema/constants";
import { clampStairWidth, perpDistanceToFlight } from "@/lib/stairs/stairGeometry";
import { seedRoomFixtures } from "@/fixtures/seedRoomFixtures";
import { CATALOG_BY_ID } from "@/furniture/catalog";
import type { ImportText } from "@/lib/import/importPdfClient";
import type {
  TracePoint,
  TraceSegment,
  SegmentKind,
  TraceOpening,
  TraceStair,
  TraceStairDraft,
  ImportSegment,
  ImportArc,
} from "@legacy/trace2d/types";

export type {
  TracePoint,
  TraceSegment,
  SegmentKind,
  TraceOpening,
  TraceStair,
  TraceStairDraft,
  ImportSegment,
  ImportArc,
};

// ---------------------------------------------------------------------------
// Tracing (editor) types. These are EPHEMERAL — they never live inside Scene.
// Trace coordinates are in "image-local pixels" (the background image's natural
// pixel space, or raw stage pixels when no image is loaded). Conversion to
// meters happens in M4 using metersPerPixel from scale calibration.
//
// TracePoint/TraceSegment/SegmentKind/TraceOpening/ImportSegment/ImportArc
// moved to @legacy/trace2d/types in Phase 0 (they're also consumed by the
// legacy trace2d pipeline; that file is the single owner now, this store
// only imports them). TraceImage stays here — nothing outside this store
// consumes it.
// ---------------------------------------------------------------------------

export type TraceMode = "wall" | "door" | "window" | "stair" | "calibrate";

export interface TraceImage {
  src: string; // data URL
  width: number; // natural px
  height: number; // natural px
}

interface TraceSnapshot {
  points: TracePoint[];
  segments: TraceSegment[];
  openings: TraceOpening[];
  stairs: TraceStair[];
  // The in-progress staircase rides in history too, so undo mid-gesture steps
  // back through the clicks instead of silently discarding the whole draft.
  stairDraft: TraceStairDraft | null;
  activeLastPointId: string | null;
}

let _id = 0;
const newId = (prefix: string) => `${prefix}${_id++}`;

/**
 * Push the id counter past ids that were LOADED rather than minted.
 *
 * `_id` restarts at 0 on every page load, so reopening a saved project (or
 * joining a shared doc) and then drawing anything mints ids that already exist
 * — `st0` twice, `pt0` twice. Duplicates are quietly destructive: `find(byId)`
 * returns the wrong item, so the inspector edits and Delete removes something
 * the user did not select, and the collab item maps clobber each other.
 *
 * Call this with every id a load brings in, before the state lands in the store.
 */
export function reserveIds(ids: Iterable<string>): void {
  for (const id of ids) {
    const n = Number(/(\d+)$/.exec(id)?.[1]);
    if (Number.isFinite(n) && n >= _id) _id = n + 1;
  }
}

/** Every id a Scene carries, for `reserveIds`. */
export function* sceneIds(scene: Scene): Generator<string> {
  for (const n of scene.nodes ?? []) yield n.id;
  for (const w of scene.walls ?? []) yield w.id;
  for (const o of scene.openings ?? []) yield o.id;
  for (const r of scene.rooms ?? []) yield r.id;
  for (const f of scene.furniture ?? []) yield f.id;
  for (const s of scene.stairs ?? []) yield s.id;
  for (const fx of scene.fixtures ?? []) yield fx.id;
}

// When a wall is split at parameter ts, move an opening onto the sub-wall that
// contains its center and renormalize its span into that sub-wall's [0,1].
function remapOpening(
  o: TraceOpening,
  ts: number,
  firstId: string,
  secondId: string,
): TraceOpening[] {
  if (ts <= 1e-6) return [{ ...o, segmentId: secondId }];
  if (ts >= 1 - 1e-6) return [{ ...o, segmentId: firstId }];
  const center = (o.t0 + o.t1) / 2;
  if (center <= ts) {
    return [
      {
        ...o,
        segmentId: firstId,
        t0: Math.min(o.t0, ts) / ts,
        t1: Math.min(o.t1, ts) / ts,
      },
    ];
  }
  return [
    {
      ...o,
      segmentId: secondId,
      t0: (Math.max(o.t0, ts) - ts) / (1 - ts),
      t1: (Math.max(o.t1, ts) - ts) / (1 - ts),
    },
  ];
}

// --- Phase 4: 3D editing ---------------------------------------------------

/** What a 3D pointer event resolved to (raycast pick contract). */
export interface PickRef {
  kind: "wall" | "opening" | "room" | "furniture" | "stair" | "fixture";
  id: string;
  // For wall picks: which face the pointer landed on / is targeted for paint.
  // "a" = wall-local +Z face, "b" = -Z face. Absent for non-wall picks.
  side?: "a" | "b";
}

/** The app's top-level modes (Phase 4 M5): what the main stage shows and
 *  which family of objects responds to the pointer. */
export type AppMode = "trace" | "build" | "furnish" | "view";
export type BuildTool = "select" | "wall" | "opening" | "measure";

/** BottomDock's tab row (Plan Dock: furnish-mode dock). Lives here, not in
 *  BottomDock.tsx, so the Build-tab navigator (Plan Dock P4) can deep-link
 *  into a tab without importing a UI component into the store's consumers. */
export type DockTab = "furniture" | "lighting" | "paint" | "floors";

/** How walls render in 3D: solid, camera-facing faded, or Sims top-down stubs. */
export type WallViewMode = "full" | "cutaway" | "top";

/** Active materials applicator in Decorate mode. Paint carries a hex (null =
 *  reset to plaster); floor carries a floor style. Click surfaces to apply. */
export type Brush =
  | { kind: "paint"; hex: string | null }
  | { kind: "floor"; style: FloorStyle };

/** Presentation environment around the model. Persisted per project. */
export type EnvPreset = "none" | "suburb" | "city";

/** Sky/atmosphere state, layered on top of the time-of-day rig. */
export type Weather = "clear" | "cloudy" | "rain";

/** One undo step: the scene as it was before the command ran. */
interface HistoryEntry {
  label: string;
  scene: Scene;
}

/** A snap guide line in plan space: axis "x" means the vertical line x=value. */
export interface SnapGuide {
  axis: "x" | "y";
  value: number;
}

/** A floating dimension label in world space. */
export interface DimLabel {
  world: [number, number, number];
  text: string;
}

export interface DragViz {
  guides: SnapGuide[];
  labels: DimLabel[];
}

const HISTORY_CAP = 200;

/** Does this pick target still exist in the scene? (undo/redo can remove it) */
export function pickExists(scene: Scene, pick: PickRef | null): boolean {
  if (!pick) return false;
  switch (pick.kind) {
    case "wall": return scene.walls.some((w) => w.id === pick.id);
    case "opening": return scene.openings.some((o) => o.id === pick.id);
    case "room": return scene.rooms.some((r) => r.id === pick.id);
    case "furniture": return scene.furniture.some((f) => f.id === pick.id);
    case "stair": return (scene.stairs ?? []).some((s) => s.id === pick.id);
    case "fixture": return (scene.fixtures ?? []).some((f) => f.id === pick.id);
  }
}

/** Live-collaboration sink. When a room is active, scene commands are pushed
 *  into the shared Yjs doc instead of the local history stack; undo/redo run on
 *  the Yjs UndoManager (per-user). Installed by CollabRoom; null when solo. */
export interface SceneCollab {
  commit: (prev: Scene, next: Scene) => void;
  undo: () => void;
  redo: () => void;
}

export interface StoreState {
  // --- 3D model (single source of truth) ---
  scene: Scene;
  setScene: (s: Scene) => void;

  // --- live collaboration (null = solo/offline) ---
  collab: SceneCollab | null;
  setCollab: (c: SceneCollab | null) => void;

  // --- 3D editing: selection + command stack (Phase 4 M1) ---
  hover3d: PickRef | null;
  sel3d: PickRef | null;
  scenePast: HistoryEntry[];
  sceneFuture: HistoryEntry[];
  setHover3d: (p: PickRef | null) => void;
  setSel3d: (p: PickRef | null) => void;
  /** Replace the scene as one undoable command. All 3D edits go through here. */
  commitScene: (label: string, next: Scene) => void;
  undoScene: () => void;
  redoScene: () => void;
  deleteSelected3d: () => void;

  // --- 3D editing: drag gestures (Phase 4 M2) ---
  /** Scene at gesture start; non-null while a drag is in flight. */
  gestureBase: Scene | null;
  /** Snap guides + dimension labels the viewport draws during a drag. */
  dragViz: DragViz | null;
  /** Bumped only on whole-scene replaces — the viewport recenters on this,
   *  never mid-edit, so the model can't slide under the cursor. */
  frameToken: number;
  beginGesture: () => void;
  /** Live-update the scene mid-drag WITHOUT touching history. */
  updateGesture: (next: Scene, viz?: DragViz | null) => void;
  /** Fold the whole gesture into one undo step (no-op if nothing changed). */
  endGesture: (label: string) => void;
  cancelGesture: () => void;
  /** True while a walkthrough door swing is folding its per-frame writes into
   *  a gesture (WalkthroughMode.tsx). Lets the viewport tell that apart from
   *  a real drag gesture — a door swing shouldn't tear down postprocessing
   *  or lock the camera the way dragging furniture/walls does. */
  doorGestureActive: boolean;
  setDoorGestureActive: (active: boolean) => void;

  // --- camera focus (Plan Dock P8) ---
  /** Plan-space point (meters) the camera should glide to next — set by
   *  NavigatorPanel's room-icon click when it resolves to a matching
   *  scene.rooms entry, consumed once by CameraFocusRig.tsx. Not cleared
   *  back to null after consuming it: re-clicking the SAME room tag should
   *  still glide there again even though the target object is unchanged
   *  (CameraFocusRig tracks what it already consumed by reference/value,
   *  not by nulling this out). */
  focusTarget: { x: number; y: number } | null;
  setFocusTarget: (t: { x: number; y: number } | null) => void;

  // --- furniture (Phase 4 M4) ---
  /** Catalog item being placed: ghost follows the cursor until click/Esc. */
  placing: { assetId: string; rotation: number } | null;
  setPlacing: (assetId: string | null) => void;
  rotatePlacing: (deltaRad: number) => void;
  placeFurniture: (x: number, y: number, rotation: number) => void;
  rotateSelectedFurniture: (deltaRad: number) => void;
  /** Clone a placed item at a small offset and select the copy — one undo
   *  step (Plan Dock P5 inspector's Duplicate action). */
  duplicateFurniture: (id: string) => void;
  /** Swap a placed item's catalog asset IN PLACE: x/y/rotation/elevation are
   *  preserved, only `assetId` changes. Powers both the P5 inspector's
   *  Replace action (any catalog item) and P6's variant swatches (same
   *  physical item, different color/finish — footprint is identical by
   *  construction there, so nothing else needs to move). */
  replaceFurnitureAsset: (id: string, assetId: string) => void;
  /** Set by the inspector's Replace button: the furniture id awaiting a new
   *  asset pick. BottomDock's item cards check this before falling back to
   *  their normal "arm placement" click behavior. Cleared on consumption or
   *  on the next appMode change (abandoning the pick leaves nothing armed). */
  replaceTarget: string | null;
  setReplaceTarget: (id: string | null) => void;

  // --- fixtures (lighting) --- placing state is SHARED with furniture above
  // (assetId is enough to tell the catalogs apart) — only the commit/rotate
  // actions are fixture-specific.
  placeFixture: (mount: FixtureMount, rotation: number) => void;
  rotateSelectedFixture: (deltaRad: number) => void;

  // --- materials brush (Decorate mode) ---
  /** Active paint/floor applicator: click surfaces to apply, Esc to stop. */
  brush: Brush | null;
  setBrush: (b: Brush | null) => void;

  // --- eyedropper (Plan Dock P7) ---
  /** Armed = the next click on furniture/a fixture/a painted wall face/a
   *  floor samples it instead of selecting it — see src/decorate/eyedropper.ts
   *  for what "samples" means per target kind. Mutually exclusive with
   *  placing/brush (arming any of the three clears the other two). */
  eyedropper: boolean;
  setEyedropper: (v: boolean) => void;

  // --- app shell (Phase 4 M5) ---
  appMode: AppMode;
  wallMode: WallViewMode;
  showCeilings: boolean;
  envPreset: EnvPreset;
  timeOfDay: number; // hour 0..24, drives the sun
  weather: Weather;
  setAppMode: (m: AppMode) => void;
  setWallMode: (m: WallViewMode) => void;
  setShowCeilings: (v: boolean) => void;
  setEnvPreset: (p: EnvPreset) => void;
  setTimeOfDay: (t: number) => void;
  setWeather: (w: Weather) => void;

  // --- Build-mode toolbar tool ---
  /** Only "select" changes existing pointer behavior (it IS the existing
   *  behavior). "measure" arms MeasureTool.tsx. "wall"/"opening" are UI-only
   *  placeholders for now — real draw-a-new-wall / drop-a-new-opening tools
   *  are new 3D-interaction features, not a toolbar reskin; see BuildToolbar's
   *  comment for why they're deferred rather than half-built. */
  buildTool: BuildTool;
  setBuildTool: (t: BuildTool) => void;
  /** Which kind the Opening tool (Plan Dock P3) drops on click. Reset to
   *  "door" on mode change like `buildTool`, so switching away and back
   *  never leaves a stale armed type from a previous session. */
  openingType: OpeningType;
  setOpeningType: (t: OpeningType) => void;
  /** Deep-link from the Build-tab house-cutaway navigator (Plan Dock P4) into
   *  a specific Decorate dock tab: the Floors/Paint hotspots have no build-
   *  mode tool of their own, so "arming" them means switching appMode AND
   *  opening the right BottomDock tab. `token` bumps on every request (even
   *  a repeat of the same tab) so BottomDock's effect has something to key
   *  off besides tab equality. */
  dockRequest: { tab: DockTab; token: number } | null;
  requestDock: (tab: DockTab) => void;

  // --- first-person walkthrough mode ---
  /** Only meaningful while appMode === "view"; layered on top rather than a
   *  new AppMode so the existing view-mode UI (env/time/weather) still
   *  applies. Toggling this off must fully restore the orbit camera. */
  walkthroughActive: boolean;
  setWalkthroughActive: (v: boolean) => void;

  // --- guided trace flow (Phase 5 T1) ---
  /** 1 Plan · 2 Scale · 3 Walls · 4 Openings · 5 Build */
  traceStep: number;
  importBusy: boolean;
  importMsg: string | null;
  // Project persistence status (autosaved to IndexedDB; see projectPersistence.ts).
  projectRestored: boolean; // this session's state was rehydrated from disk
  projectSavedAt: number | null; // epoch ms of last successful autosave
  currentProjectId: string | null; // id of the open project in the multi-project store
  projectName: string; // display name of the open project
  liveRoomId: string | null; // set once a project opts into "Go live" — its permanent shared room
  setTraceStep: (n: number) => void;
  /** One import path for images AND PDFs — routed by file type. */
  importPlanFile: (file: File) => Promise<void>;

  // --- background image ---
  image: TraceImage | null;
  imageOpacity: number;
  setImage: (img: TraceImage | null) => void;
  setImageOpacity: (o: number) => void;

  // --- source plan identity (ties ground-truth exports to their PDF) ---
  sourcePdfName: string | null;
  setSourcePdfName: (name: string | null) => void;

  // --- imported PDF raw overlay (Phase 2 / M1) ---
  importedSegments: ImportSegment[];
  importedArcs: ImportArc[];
  importedTexts: ImportText[]; // PDF text words (knowledge-layer OCR cue)
  showImport: boolean;
  setImportedSegments: (segs: ImportSegment[]) => void;
  setImportedArcs: (arcs: ImportArc[]) => void;
  setShowImport: (v: boolean) => void;

  // --- wall snapping (manual trace aid) ---
  wallSnap: boolean; // snap traced points to imported-PDF wall centerlines/corners
  setWallSnap: (v: boolean) => void;

  // --- VLM classification (Phase 2.5 / M3) ---
  vlmModel: string; // Claude model id — shared with Building Knowledge Layer's room understanding

  // --- Building Knowledge Layer (room semantics) ---
  understandBusy: boolean;
  understandRooms: () => Promise<string>; // VLM escalation for undecided rooms

  // --- trace draft ---
  points: TracePoint[];
  segments: TraceSegment[];
  openings: TraceOpening[];
  // Stairs are their OWN draft array, never TraceSegments: analyzeLoops would
  // read a stair as a room boundary and invent rooms that aren't there.
  stairs: TraceStair[];
  stairDraft: TraceStairDraft | null; // the staircase mid-gesture
  activeLastPointId: string | null; // chain endpoint new clicks connect to
  selectedPointId: string | null;
  selectedOpeningId: string | null;
  selectedStairId: string | null;

  // --- scale calibration ---
  metersPerPixel: number | null;
  calibrationPts: { x: number; y: number }[];

  // --- interaction ---
  mode: TraceMode;
  ortho: boolean; // constrain new wall segments to 90° (Shift inverts per-click)
  drawKind: SegmentKind; // in wall mode, what kind of boundary the pen lays down
  drawThickness: number; // meters — stamped onto new wall segments at creation
  drawHeight: number; // meters — stamped onto new wall segments at creation
  // Pending stair values, same contract as drawThickness/drawHeight. The width
  // is STICKY: whatever a committed staircase ended up with becomes the default
  // for the next one, because a plan's stairs are almost always one width.
  drawStairWidth: number; // meters
  drawStairRise: number; // meters, total climb

  // --- undo history (trace only) ---
  history: TraceSnapshot[];

  // --- actions ---
  setMode: (m: TraceMode) => void;
  setOrtho: (v: boolean) => void;
  setDrawKind: (v: SegmentKind) => void;
  setDrawThickness: (v: number) => void;
  setDrawHeight: (v: number) => void;
  addPoint: (x: number, y: number) => void;
  connectToNode: (nodeId: string) => void; // start from / connect to an existing point
  attachToSegment: (segmentId: string, x: number, y: number) => void; // magnet onto a wall (splits it)
  beginDrag: () => void;
  movePoint: (id: string, x: number, y: number) => void;
  selectPoint: (id: string | null) => void;
  selectOpening: (id: string | null) => void;
  addOpeningSpan: (
    type: "door" | "window",
    segmentId: string,
    t0: number,
    t1: number,
  ) => void;
  deleteSelected: () => void;
  finishChain: () => void;
  undo: () => void;
  clearTrace: () => void;

  // --- stairs (trace) ---
  setDrawStairWidth: (v: number) => void;
  setDrawStairRise: (v: number) => void;
  /** One click of the stair gesture, in image pixels. Drives the whole state
   *  machine: foot -> head -> width -> (foot -> head)* -> finishStair. */
  stairClick: (x: number, y: number) => void;
  finishStair: () => void; // commit the draft (Esc / Finish)
  cancelStairDraft: () => void;
  selectStair: (id: string | null) => void;
  /** Edit a placed stair. `steps: null` clears the override back to derived. */
  updateStair: (
    id: string,
    patch: { width?: number; rise?: number; steps?: number | null },
  ) => void;

  addCalibrationPoint: (x: number, y: number) => void;
  applyCalibration: (realMeters: number) => void;
  cancelCalibration: () => void;
}

export const useSceneStore = create<StoreState>((set, get) => {
  const snapshot = (): TraceSnapshot => {
    const { points, segments, openings, stairs, stairDraft, activeLastPointId } = get();
    return {
      points: points.map((p) => ({ ...p })),
      segments: segments.map((s) => ({ ...s })),
      openings: openings.map((o) => ({ ...o })),
      stairs: stairs.map((s) => ({ ...s, flights: s.flights.map((f) => ({ ...f })) })),
      stairDraft: stairDraft
        ? {
            ...stairDraft,
            flights: stairDraft.flights.map((f) => ({ ...f })),
            foot: stairDraft.foot ? { ...stairDraft.foot } : null,
          }
        : null,
      activeLastPointId,
    };
  };
  const pushHistory = () =>
    set((st) => ({ history: [...st.history, snapshot()].slice(-100) }));


  return {
    scene: seedRoomFixtures(sampleScene),
    // Loading/generating a whole scene is itself an undoable command; it is
    // also the only thing that reframes the 3D camera (frameToken). Every
    // whole-scene replacement funnels through here, so this is the one place
    // `seedRoomFixtures` needs to run — it's a no-op past the first time.
    setScene: (scene) => {
      get().commitScene("Replace scene", seedRoomFixtures(scene));
      set((s) => ({ frameToken: s.frameToken + 1 }));
    },

    hover3d: null,
    sel3d: null,
    scenePast: [],
    sceneFuture: [],
    setHover3d: (hover3d) => set({ hover3d }),
    setSel3d: (sel3d) => set({ sel3d }),
    collab: null,
    setCollab: (collab) => set({ collab }),
    commitScene: (label, next) => {
      const s = get();
      if (s.collab) {
        // Collaborative: push the change into the shared doc; the Yjs observer
        // projects it back. No local history stack (Yjs UndoManager owns undo).
        s.collab.commit(s.scene, next);
        set({
          scene: next, // optimistic — makes the edit feel instant
          sel3d: pickExists(next, s.sel3d) ? s.sel3d : null,
          hover3d: pickExists(next, s.hover3d) ? s.hover3d : null,
        });
        return;
      }
      set((st) => ({
        scene: next,
        scenePast: [...st.scenePast.slice(-(HISTORY_CAP - 1)), { label, scene: st.scene }],
        sceneFuture: [],
        sel3d: pickExists(next, st.sel3d) ? st.sel3d : null,
        hover3d: pickExists(next, st.hover3d) ? st.hover3d : null,
      }));
    },
    undoScene: () => {
      const s = get();
      if (s.collab) return void s.collab.undo();
      set((st) => {
        const entry = st.scenePast[st.scenePast.length - 1];
        if (!entry) return st;
        return {
          scene: entry.scene,
          scenePast: st.scenePast.slice(0, -1),
          sceneFuture: [...st.sceneFuture, { label: entry.label, scene: st.scene }],
          sel3d: pickExists(entry.scene, st.sel3d) ? st.sel3d : null,
          hover3d: null,
        };
      });
    },
    redoScene: () => {
      const s = get();
      if (s.collab) return void s.collab.redo();
      set((st) => {
        const entry = st.sceneFuture[st.sceneFuture.length - 1];
        if (!entry) return st;
        return {
          scene: entry.scene,
          scenePast: [...st.scenePast, { label: entry.label, scene: st.scene }],
          sceneFuture: st.sceneFuture.slice(0, -1),
          sel3d: pickExists(entry.scene, st.sel3d) ? st.sel3d : null,
          hover3d: null,
        };
      });
    },
    gestureBase: null,
    dragViz: null,
    frameToken: 0,
    beginGesture: () => {
      const s = get();
      if (!s.gestureBase) set({ gestureBase: s.scene });
    },
    updateGesture: (next, viz = null) => {
      if (!get().gestureBase) return; // no gesture in flight
      set({ scene: next, dragViz: viz });
    },
    endGesture: (label) => {
      const { gestureBase, scene, collab } = get();
      if (!gestureBase) return;
      if (gestureBase === scene) {
        set({ gestureBase: null, dragViz: null }); // click, not a drag
        return;
      }
      if (collab) {
        // One granular commit of the whole drag into the shared doc.
        collab.commit(gestureBase, scene);
        set({ gestureBase: null, dragViz: null });
        return;
      }
      set((s) => ({
        gestureBase: null,
        dragViz: null,
        scenePast: [...s.scenePast.slice(-(HISTORY_CAP - 1)), { label, scene: gestureBase }],
        sceneFuture: [],
      }));
    },
    cancelGesture: () => {
      const { gestureBase } = get();
      if (!gestureBase) return;
      set({ scene: gestureBase, gestureBase: null, dragViz: null });
    },
    doorGestureActive: false,
    setDoorGestureActive: (active) => set({ doorGestureActive: active }),

    focusTarget: null,
    setFocusTarget: (focusTarget) => set({ focusTarget }),

    appMode: "trace",
    wallMode: "full",
    showCeilings: true,
    setAppMode: (appMode) => {
      const s = get();
      if (s.gestureBase) s.cancelGesture();
      // Leaving a mode drops its transient interaction state.
      set({ appMode, placing: null, brush: null, sel3d: null, hover3d: null, buildTool: "select", openingType: "door", replaceTarget: null, eyedropper: false });
    },
    setWallMode: (wallMode) => set({ wallMode }),
    setShowCeilings: (showCeilings) => set({ showCeilings }),
    buildTool: "select",
    setBuildTool: (buildTool) => set({ buildTool }),
    openingType: "door",
    setOpeningType: (openingType) => set({ openingType }),
    dockRequest: null,
    requestDock: (tab) => {
      get().setAppMode("furnish");
      set((s) => ({ dockRequest: { tab, token: (s.dockRequest?.token ?? 0) + 1 } }));
    },
    envPreset: "none",
    timeOfDay: 13,
    weather: "clear",
    setEnvPreset: (envPreset) => set({ envPreset }),
    setTimeOfDay: (timeOfDay) => set({ timeOfDay }),
    setWeather: (weather) => set({ weather }),

    walkthroughActive: false,
    setWalkthroughActive: (walkthroughActive) => set({ walkthroughActive }),

    traceStep: 1,
    importBusy: false,
    importMsg: null,
    projectRestored: false,
    projectSavedAt: null,
    currentProjectId: null,
    projectName: "Untitled plan",
    liveRoomId: null,
    setTraceStep: (traceStep) => set({ traceStep }),
    importPlanFile: async (file) => {
      const { isPdfFile, isImageFile, isDxfFile, isDwgFile, loadImageFile, rasterQualityMsg, MIN_IMAGE_PX } =
        await import("@legacy/trace2d/planImport");
      // A new plan is a CLEAN SLATE. Clear any prior plan's trace, built scene,
      // scale, suggestions, selections and undo history — otherwise they linger
      // on top of the new plan (especially now that projects are restored from
      // disk on load, so "prior plan" can be from a previous session).
      set({
        importBusy: true,
        importMsg: null,
        points: [],
        segments: [],
        openings: [],
        scene: { schemaVersion: 2, units: "meters", nodes: [], walls: [], openings: [], rooms: [], furniture: [] },
        history: [],
        calibrationPts: [],
        metersPerPixel: null,
        sel3d: null,
        placing: null,
      });
      get().setSourcePdfName(file.name);
      try {
        if (isPdfFile(file)) {
          // Runs entirely in the browser (pdf.js). The old server route spawned
          // Python, which has no interpreter on Vercel — see importPdfClient.ts.
          const { importPdf } = await import("@/lib/import/importPdfClient");
          const r = await importPdf(file);
          get().setImage(r.image);
          if (!r.isVector) {
            set({
              importedSegments: [],
              importedArcs: [],
              importedTexts: [],
              imageOpacity: 0.8,
              importMsg: rasterQualityMsg(r.image.width, r.image.height, "Scanned plan loaded"),
            });
          } else {
            set({
              imageOpacity: 0.45,
              importedSegments: r.segments,
              importedArcs: r.arcs,
              importedTexts: r.texts,
              showImport: true,
              importMsg: `✓ Vector PDF — ${r.stats.segments} segments${r.pageCount > 1 ? ` (page 1 of ${r.pageCount})` : ""}`,
            });
          }
        } else if (isDxfFile(file) || isDwgFile(file)) {
          const { importDxf, dxfTextToResult } = await import("@legacy/trace2d/importDxf");
          let r;
          if (isDwgFile(file)) {
            // DWG is proprietary binary — convert to DXF server-side, then parse
            // the returned DXF text exactly like a native .dxf upload.
            const form = new FormData();
            form.append("file", file);
            const res = await fetch("/api/dwg2dxf", { method: "POST", body: form });
            const j = await res.json();
            if (!res.ok || j.error) {
              // The converter is a native desktop binary, so it exists only on a
              // local machine — a hosted deployment can never satisfy this. Say
              // what the user can actually do instead of surfacing a server error.
              if (res.status === 501) {
                throw new Error(
                  "DWG needs a local converter that isn't available here. Export the drawing to DXF from your CAD tool and import that — the DXF path also recovers real-world scale automatically.",
                );
              }
              throw new Error(j.error ? `${j.error}${j.detail ? `: ${j.detail}` : ""}` : `HTTP ${res.status}`);
            }
            r = dxfTextToResult(j.dxf);
            r.summary = r.summary.replace("✓ DXF", "✓ DWG→DXF");
          } else {
            r = await importDxf(file);
          }
          get().setImage(r.image);
          set({
            imageOpacity: 0.45,
            importedSegments: r.segments,
            importedArcs: r.arcs,
            importedTexts: r.texts,
            showImport: true,
            importMsg: r.summary,
          });
          // A DXF with known units gives us real scale for free — no calibration.
          if (r.metersPerPixel != null) set({ metersPerPixel: r.metersPerPixel });
        } else if (isImageFile(file)) {
          const img = await loadImageFile(file);
          if (Math.max(img.width, img.height) < MIN_IMAGE_PX) {
            set({
              importBusy: false,
              importMsg: `✗ Image too small (${img.width}×${img.height}px) — plans need ≥${MIN_IMAGE_PX}px on the long edge.`,
            });
            return;
          }
          get().setImage(img);
          set({
            importedSegments: [],
            importedArcs: [],
            importedTexts: [],
            imageOpacity: 0.8,
            importMsg: rasterQualityMsg(img.width, img.height, "Image loaded"),
          });
        } else {
          set({ importBusy: false, importMsg: "✗ Unsupported file — use an image (PNG/JPG/WebP), a PDF, or a CAD file (DXF/DWG)." });
          return;
        }
        // A fresh plan needs a scale before anything else can happen.
        if (get().metersPerPixel == null) get().setMode("calibrate");
        set({ traceStep: 2 });
      } catch (e) {
        set({ importMsg: "✗ Import failed: " + (e as Error).message });
      } finally {
        set({ importBusy: false });
      }
    },

    placing: null,
    setPlacing: (assetId) =>
      set({ placing: assetId ? { assetId, rotation: 0 } : null, brush: null, sel3d: null, eyedropper: false }),
    brush: null,
    setBrush: (brush) => set({ brush, placing: null, sel3d: null, eyedropper: false }),
    eyedropper: false,
    setEyedropper: (eyedropper) => set({ eyedropper, ...(eyedropper ? { placing: null, brush: null } : {}) }),
    rotatePlacing: (deltaRad) =>
      set((s) =>
        s.placing
          ? { placing: { ...s.placing, rotation: s.placing.rotation + deltaRad } }
          : s,
      ),
    placeFurniture: (x, y, rotation) => {
      const { placing, scene, commitScene } = get();
      if (!placing) return;
      const id = `f${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
      const elevation = CATALOG_BY_ID.get(placing.assetId)?.defaultElevation;
      commitScene("Place furniture", {
        ...scene,
        furniture: [...scene.furniture, { id, assetId: placing.assetId, x, y, rotation, ...(elevation !== undefined ? { elevation } : {}) }],
      });
      // Stay in placing mode - Sims-style repeat placement; Esc exits.
    },
    rotateSelectedFurniture: (deltaRad) => {
      const { sel3d, scene, commitScene } = get();
      if (sel3d?.kind !== "furniture") return;
      commitScene("Rotate furniture", {
        ...scene,
        furniture: scene.furniture.map((f) =>
          f.id === sel3d.id ? { ...f, rotation: f.rotation + deltaRad } : f,
        ),
      });
    },
    duplicateFurniture: (id) => {
      const { scene, commitScene } = get();
      const item = scene.furniture.find((f) => f.id === id);
      if (!item) return;
      const copy = { ...item, id: `f${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, x: item.x + 0.3, y: item.y + 0.3 };
      commitScene("Duplicate furniture", { ...scene, furniture: [...scene.furniture, copy] });
      set({ sel3d: { kind: "furniture", id: copy.id } });
    },
    replaceFurnitureAsset: (id, assetId) => {
      const { scene, commitScene } = get();
      if (!scene.furniture.some((f) => f.id === id)) return;
      commitScene("Replace furniture", {
        ...scene,
        furniture: scene.furniture.map((f) => (f.id === id ? { ...f, assetId } : f)),
      });
    },
    replaceTarget: null,
    setReplaceTarget: (replaceTarget) => set({ replaceTarget }),

    placeFixture: (mount, rotation) => {
      const { placing, scene, commitScene } = get();
      if (!placing) return;
      const id = `fx${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
      commitScene("Place fixture", {
        ...scene,
        fixtures: [...(scene.fixtures ?? []), { id, assetId: placing.assetId, rotation, mount }],
      });
      // Stay in placing mode - Sims-style repeat placement; Esc exits.
    },
    rotateSelectedFixture: (deltaRad) => {
      const { sel3d, scene, commitScene } = get();
      if (sel3d?.kind !== "fixture") return;
      commitScene("Rotate fixture", {
        ...scene,
        fixtures: (scene.fixtures ?? []).map((f) =>
          f.id === sel3d.id ? { ...f, rotation: f.rotation + deltaRad } : f,
        ),
      });
    },

    deleteSelected3d: () => {
      const { sel3d, scene, commitScene } = get();
      if (!sel3d) return;
      if (sel3d.kind === "furniture") {
        commitScene("Delete furniture", {
          ...scene,
          furniture: scene.furniture.filter((f) => f.id !== sel3d.id),
        });
      } else if (sel3d.kind === "wall") {
        commitScene("Delete wall", {
          ...scene,
          walls: scene.walls.filter((w) => w.id !== sel3d.id),
          openings: scene.openings.filter((o) => o.wallId !== sel3d.id),
          fixtures: (scene.fixtures ?? []).filter(
            (f) => f.mount.kind !== "wall" || f.mount.wallId !== sel3d.id,
          ),
        });
      } else if (sel3d.kind === "fixture") {
        commitScene("Delete fixture", {
          ...scene,
          fixtures: (scene.fixtures ?? []).filter((f) => f.id !== sel3d.id),
        });
      } else if (sel3d.kind === "opening") {
        commitScene("Delete opening", {
          ...scene,
          openings: scene.openings.filter((o) => o.id !== sel3d.id),
        });
      } else if (sel3d.kind === "stair") {
        commitScene("Delete stair", {
          ...scene,
          stairs: (scene.stairs ?? []).filter((s) => s.id !== sel3d.id),
        });
      } else if (sel3d.kind === "room") {
        // Explicit rather than a trailing `else`: a kind this doesn't know
        // must delete NOTHING, not fall through to removing a floor.
        commitScene("Delete floor", {
          ...scene,
          rooms: scene.rooms.filter((r) => r.id !== sel3d.id),
        });
      }
    },

    image: null,
    imageOpacity: 0.6,
    // A new image invalidates the cached CV proposal (it's per-image).
    setImage: (image) => set({ image }),
    setImageOpacity: (imageOpacity) => set({ imageOpacity }),

    sourcePdfName: null,
    setSourcePdfName: (sourcePdfName) => set({ sourcePdfName }),

    importedSegments: [],
    importedArcs: [],
    importedTexts: [],
    showImport: true,
    setImportedSegments: (importedSegments) => set({ importedSegments }),
    setImportedArcs: (importedArcs) => set({ importedArcs }),
    setShowImport: (showImport) => set({ showImport }),

    wallSnap: true,
    setWallSnap: (wallSnap) => set({ wallSnap }),

    // Read-only default now that the trace tab's model picker is gone — still
    // consumed by Building Knowledge Layer's understandRooms below.
    vlmModel: "claude-opus-4-8",

    // --- Building Knowledge Layer — VLM escalation for undecided rooms ---
    understandBusy: false,
    understandRooms: async () => {
      const { scene, vlmModel, image, metersPerPixel } = get();
      if (scene.rooms.length === 0) return "No rooms yet — generate a 3D model first.";
      set({ understandBusy: true });
      try {
        const [{ buildRoomGraph }, { classifyRoomsByRules, RULE_CONFIDENCE_GATE }, { functionForType, displayRoomType }] =
          await Promise.all([
            import("@/lib/rooms/semanticGraph"),
            import("@/lib/rooms/roomClassifier"),
            import("@/lib/rooms/roomTaxonomy"),
          ]);

        // Ensure the free layer exists (scenes generated before this feature,
        // or the sample scene, arrive without semantics).
        let cur = scene;
        if (cur.rooms.some((r) => !r.semantics)) {
          const { rooms: sem, building } = classifyRoomsByRules(buildRoomGraph(cur));
          cur = {
            ...cur,
            rooms: cur.rooms.map((r) => ({ ...r, semantics: r.semantics ?? sem.get(r.id) })),
            building: cur.building ?? building,
          };
        }

        const doorSet = new Set(
          cur.openings.filter((o) => o.type === "door").map((o) => o.id),
        );
        const briefs = cur.rooms.map((r) => {
          const s = r.semantics!;
          const status =
            s.type !== "unknown" && s.confidence >= RULE_CONFIDENCE_GATE
              ? ("confident" as const)
              : ("undecided" as const);
          return {
            id: r.id,
            status,
            provisionalType: s.type,
            alternatives: s.alternatives,
            confidence: Math.round(s.confidence * 100) / 100,
            ocr: s.evidence
              .filter((e) => e.source === "ocr")
              .map((e) => String(e.value ?? "")),
            features: {
              areaM2: Math.round(s.features.areaM2 * 10) / 10,
              doorCount: s.features.doorCount,
              windowCount: s.features.windowCount,
              exteriorWallCount: s.features.exteriorWallCount,
              aspectRatio: Math.round(s.features.aspectRatio * 10) / 10,
              hasCloset: s.features.hasCloset,
            },
            adjacentRooms: s.relationships.sharesWallWith,
            doorConnections: s.relationships.connectedVia
              .filter((l) => doorSet.has(l.opening))
              .map((l) => l.room),
            // Rooms this one flows into with no barrier — the open-plan cue.
            // Cheap in tokens and near-definitional for living/dining/kitchen.
            opensInto: s.relationships.opensInto,
          };
        });

        const undecided = cur.rooms.filter(
          (r, i) => briefs[i].status === "undecided",
        );
        if (undecided.length === 0) {
          if (cur !== scene) get().commitScene("Understand rooms", cur);
          return "✓ All rooms already confidently classified by rules — no AI needed.";
        }

        // Image evidence: whole-plan overview + native-res crops of the
        // undecided rooms (fixture symbols + printed labels live there).
        let overview: string | null = null;
        let crops: { roomId: string; image: string }[] = [];
        if (image && metersPerPixel) {
          const { buildRoomCrops } = await import("@legacy/trace2d/roomCrops");
          const built = await buildRoomCrops(image.src, cur, undecided, metersPerPixel);
          overview = built.overview;
          crops = built.crops;
        }

        const res = await fetch("/api/classify-rooms", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rooms: briefs, overview, crops, model: vlmModel }),
        });
        const j = await res.json();
        if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);

        const byId = new Map<string, (typeof j.rooms)[number]>(
          (j.rooms as { id: string }[]).map((v) => [v.id, v]),
        );
        const next: Scene = {
          ...cur,
          rooms: cur.rooms.map((r) => {
            const v = byId.get(r.id);
            if (!v || !r.semantics) return r;
            const evidence = [
              ...r.semantics.evidence.filter((e) => e.source !== "vlm"),
              ...(v.evidence as { feature: string; weight: number }[]).map((e) => ({
                feature: e.feature,
                weight: e.weight,
                source: "vlm" as const,
              })),
            ];
            const confidence = Math.max(0, Math.min(1, v.confidence));
            const name =
              v.type !== "unknown" && confidence >= 0.5
                ? displayRoomType(v.type)
                : r.name;
            return {
              ...r,
              name,
              semantics: {
                ...r.semantics,
                type: v.type,
                alternatives: v.alternatives ?? [],
                function: v.function || functionForType(v.type),
                confidence,
                evidence,
                source: "vlm" as const,
              },
            };
          }),
          building: cur.building
            ? {
                ...cur.building,
                archetype: j.archetype || cur.building.archetype,
                source: "vlm" as const,
              }
            : cur.building,
        };
        get().commitScene("Understand rooms", next);
        return `✓ AI (${j.model}): ${j.rooms.length} room(s) classified · ${j.usage.inputTokens} in / ${j.usage.outputTokens} out tokens`;
      } catch (e) {
        return "Understand rooms failed: " + ((e as Error).message ?? String(e));
      } finally {
        set({ understandBusy: false });
      }
    },

    points: [],
    segments: [],
    openings: [],
    stairs: [],
    stairDraft: null,
    activeLastPointId: null,
    selectedPointId: null,
    selectedOpeningId: null,
    selectedStairId: null,

    metersPerPixel: null,
    calibrationPts: [],

    mode: "wall",
    ortho: true,
    drawKind: "wall",
    drawThickness: DEFAULT_THICKNESS,
    drawHeight: WALL_HEIGHT,
    drawStairWidth: DEFAULT_STAIR.width,
    drawStairRise: DEFAULT_STAIR.rise,

    history: [],

    setMode: (mode) =>
      set({
        mode,
        calibrationPts: mode === "calibrate" ? [] : get().calibrationPts,
        // Leaving stair mode abandons a half-drawn staircase rather than
        // leaving invisible clicks armed for the next time you come back.
        stairDraft: mode === "stair" ? get().stairDraft : null,
      }),

    setOrtho: (ortho) => set({ ortho }),
    setDrawKind: (drawKind) => set({ drawKind }),
    setDrawThickness: (drawThickness) => set({ drawThickness }),
    setDrawHeight: (drawHeight) => set({ drawHeight }),

    addPoint: (x, y) => {
      pushHistory();
      set((st) => {
        const p: TracePoint = { id: newId("p"), x, y };
        const kind = st.drawKind;
        const segments = st.activeLastPointId
          ? [
              ...st.segments,
              {
                id: newId("s"),
                a: st.activeLastPointId,
                b: p.id,
                type: kind,
                thickness: st.drawThickness,
                height: st.drawHeight,
              },
            ]
          : st.segments;
        return {
          points: [...st.points, p],
          segments,
          activeLastPointId: p.id,
          selectedPointId: p.id,
          selectedOpeningId: null,
        };
      });
    },

    connectToNode: (nodeId) => {
      const { activeLastPointId } = get();
      // Idle: start a fresh run FROM this existing point (also select it).
      if (activeLastPointId == null) {
        set({ activeLastPointId: nodeId, selectedPointId: nodeId, selectedOpeningId: null });
        return;
      }
      if (activeLastPointId === nodeId) return;
      pushHistory();
      set((st) => {
        const exists = st.segments.some(
          (s) =>
            (s.a === activeLastPointId && s.b === nodeId) ||
            (s.a === nodeId && s.b === activeLastPointId),
        );
        const kind = st.drawKind;
        const segments = exists
          ? st.segments
          : [
              ...st.segments,
              {
                id: newId("s"),
                a: activeLastPointId,
                b: nodeId,
                type: kind,
                thickness: st.drawThickness,
                height: st.drawHeight,
              },
            ];
        // Joining an existing vertex ends the run (loop closed / network joined).
        return { segments, activeLastPointId: null, selectedPointId: null };
      });
    },

    attachToSegment: (segmentId, x, y) => {
      pushHistory();
      set((st) => {
        const seg = st.segments.find((s) => s.id === segmentId);
        if (!seg) return {};
        const a = st.points.find((p) => p.id === seg.a);
        const b = st.points.find((p) => p.id === seg.b);
        if (!a || !b) return {};

        const P: TracePoint = { id: newId("p"), x, y };
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const len2 = abx * abx + aby * aby || 1;
        const ts = Math.min(1, Math.max(0, ((x - a.x) * abx + (y - a.y) * aby) / len2));

        // Split pieces inherit the split wall's own type/thickness/height; the
        // new run's connecting segment (below) takes the current draw values.
        const s1 = { id: newId("s"), a: seg.a, b: P.id, type: seg.type, thickness: seg.thickness, height: seg.height };
        const s2 = { id: newId("s"), a: P.id, b: seg.b, type: seg.type, thickness: seg.thickness, height: seg.height };
        let segments = st.segments.filter((s) => s.id !== segmentId).concat([s1, s2]);

        // Re-home openings that lived on the split wall onto the correct sub-wall.
        const openings = st.openings.flatMap((o) =>
          o.segmentId === segmentId ? remapOpening(o, ts, s1.id, s2.id) : [o],
        );

        // If a run is active, connect it into the new junction and finish.
        let activeLastPointId: string | null = P.id;
        let selectedPointId: string | null = P.id;
        if (st.activeLastPointId != null && st.activeLastPointId !== P.id) {
          const kind = st.drawKind;
          segments = [
            ...segments,
            {
              id: newId("s"),
              a: st.activeLastPointId,
              b: P.id,
              type: kind,
              thickness: st.drawThickness,
              height: st.drawHeight,
            },
          ];
          activeLastPointId = null;
          selectedPointId = null;
        }

        return {
          points: [...st.points, P],
          segments,
          openings,
          activeLastPointId,
          selectedPointId,
          selectedOpeningId: null,
        };
      });
    },

    beginDrag: () => pushHistory(),

    movePoint: (id, x, y) =>
      set((st) => ({
        points: st.points.map((p) => (p.id === id ? { ...p, x, y } : p)),
      })),

    selectPoint: (selectedPointId) =>
      set({ selectedPointId, selectedOpeningId: null, selectedStairId: null }),

    selectOpening: (selectedOpeningId) =>
      set({ selectedOpeningId, selectedPointId: null, selectedStairId: null }),

    selectStair: (selectedStairId) =>
      set({ selectedStairId, selectedPointId: null, selectedOpeningId: null }),

    addOpeningSpan: (type, segmentId, t0, t1) => {
      const lo = Math.min(1, Math.max(0, Math.min(t0, t1)));
      const hi = Math.min(1, Math.max(0, Math.max(t0, t1)));
      if (hi - lo < 1e-4) return; // ignore zero-length drags
      pushHistory();
      const d = type === "door" ? DEFAULT_DOOR : DEFAULT_WINDOW;
      set((st) => {
        const o: TraceOpening = {
          id: newId("o"),
          type,
          segmentId,
          t0: lo,
          t1: hi,
          height: d.height,
          sill: d.sill,
        };
        return { openings: [...st.openings, o], selectedOpeningId: o.id, selectedPointId: null };
      });
    },

    deleteSelected: () => {
      const { selectedOpeningId, selectedPointId, selectedStairId } = get();
      if (selectedStairId) {
        pushHistory();
        set((st) => ({
          stairs: st.stairs.filter((s) => s.id !== selectedStairId),
          selectedStairId: null,
        }));
        return;
      }
      if (selectedOpeningId) {
        pushHistory();
        set((st) => ({
          openings: st.openings.filter((o) => o.id !== selectedOpeningId),
          selectedOpeningId: null,
        }));
        return;
      }
      if (!selectedPointId) return;
      pushHistory();
      set((st) => {
        const id = selectedPointId;
        const touching = st.segments.filter((s) => s.a === id || s.b === id);
        const removedSegIds = new Set(touching.map((s) => s.id));
        const neighbors = touching.map((s) => (s.a === id ? s.b : s.a));
        let segments = st.segments.filter((s) => !removedSegIds.has(s.id));
        // Rejoin a mid-chain point's two neighbors so the line stays continuous.
        if (neighbors.length === 2 && neighbors[0] !== neighbors[1]) {
          segments = [...segments, { id: newId("s"), a: neighbors[0], b: neighbors[1] }];
        }
        return {
          points: st.points.filter((p) => p.id !== id),
          segments,
          openings: st.openings.filter((o) => !removedSegIds.has(o.segmentId)),
          selectedPointId: null,
          activeLastPointId:
            st.activeLastPointId === id ? null : st.activeLastPointId,
        };
      });
    },

    finishChain: () => {
      // In stair mode "finish" means commit the staircase, not drop the wall
      // chain — one key (Esc) ends whatever gesture is actually in flight.
      if (get().mode === "stair" && get().stairDraft) {
        get().finishStair();
        return;
      }
      set({ activeLastPointId: null, selectedPointId: null, selectedOpeningId: null });
    },

    undo: () => {
      const hist = get().history;
      if (hist.length === 0) return;
      const prev = hist[hist.length - 1];
      set({
        points: prev.points,
        segments: prev.segments,
        openings: prev.openings,
        stairs: prev.stairs,
        stairDraft: prev.stairDraft,
        activeLastPointId: prev.activeLastPointId,
        history: hist.slice(0, -1),
        selectedPointId: null,
        selectedOpeningId: null,
        selectedStairId: null,
      });
    },

    clearTrace: () => {
      pushHistory();
      set({
        points: [],
        segments: [],
        openings: [],
        stairs: [],
        stairDraft: null,
        activeLastPointId: null,
        selectedPointId: null,
        selectedOpeningId: null,
        selectedStairId: null,
      });
    },

    // --- stairs -----------------------------------------------------------

    setDrawStairWidth: (drawStairWidth) => set({ drawStairWidth }),
    setDrawStairRise: (drawStairRise) => set({ drawStairRise }),

    /**
     * The stair gesture, one click at a time:
     *
     *   no draft            -> record the foot
     *   foot set            -> close that flight
     *   flight 1, no width  -> width = 2x the perpendicular distance to its axis
     *   width set, no foot  -> record the foot of the NEXT flight
     *
     * The gap left between two flights becomes the landing downstream, so
     * there is nothing here that places or sizes one.
     */
    stairClick: (x, y) => {
      const st = get();
      const d = st.stairDraft;

      if (!d) {
        pushHistory();
        set({ stairDraft: { flights: [], foot: { x, y }, width: null } });
        return;
      }

      if (d.foot) {
        // Ignore a zero-length flight: two clicks in the same spot is a
        // misclick, and it would divide by zero downstream.
        if (Math.hypot(x - d.foot.x, y - d.foot.y) < 1e-6) return;
        set({
          stairDraft: {
            ...d,
            flights: [...d.flights, { x0: d.foot.x, y0: d.foot.y, x1: x, y1: y }],
            foot: null,
          },
        });
        return;
      }

      if (d.flights.length > 0 && d.width == null) {
        const f = d.flights[0];
        const mpp = st.metersPerPixel;
        if (mpp == null) return; // no scale yet; the canvas gates this too
        if (Math.hypot(f.x1 - f.x0, f.y1 - f.y0) < 1e-6) return;
        // Perpendicular distance only — the click is forgiving ALONG the run
        // and only has to be accurate across it, which is where the plan's
        // parallel edges are. Shared with the canvas preview so what the
        // envelope shows under the cursor is exactly what the click commits.
        const width = clampStairWidth(2 * perpDistanceToFlight(f, x, y) * mpp);
        set({ stairDraft: { ...d, width } });
        return;
      }

      set({ stairDraft: { ...d, foot: { x, y } } });
    },

    finishStair: () => {
      const st = get();
      const d = st.stairDraft;
      if (!d || d.flights.length === 0) {
        set({ stairDraft: null });
        return;
      }
      const width = d.width ?? st.drawStairWidth;
      const stair: TraceStair = {
        id: newId("st"),
        flights: d.flights,
        width,
        rise: st.drawStairRise,
      };
      set({
        stairs: [...st.stairs, stair],
        stairDraft: null,
        selectedStairId: stair.id,
        selectedPointId: null,
        selectedOpeningId: null,
        drawStairWidth: width, // sticky: the next stair starts at this width
      });
    },

    cancelStairDraft: () => set({ stairDraft: null }),

    updateStair: (id, patch) => {
      pushHistory();
      set((st) => ({
        stairs: st.stairs.map((s) => {
          if (s.id !== id) return s;
          const next: TraceStair = { ...s };
          if (patch.width !== undefined) next.width = patch.width;
          if (patch.rise !== undefined) next.rise = patch.rise;
          if (patch.steps === null) delete next.steps; // back to derived
          else if (patch.steps !== undefined) next.steps = patch.steps;
          return next;
        }),
      }));
    },

    addCalibrationPoint: (x, y) =>
      set((st) => {
        if (st.calibrationPts.length >= 2) return { calibrationPts: [{ x, y }] };
        return { calibrationPts: [...st.calibrationPts, { x, y }] };
      }),

    applyCalibration: (realMeters) => {
      const pts = get().calibrationPts;
      if (pts.length < 2 || realMeters <= 0) return;
      const px = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      if (px < 1e-6) return;
      set({ metersPerPixel: realMeters / px, calibrationPts: [], mode: "wall" });
    },

    cancelCalibration: () => set({ calibrationPts: [], mode: "wall" }),
  };
});

// Dev-only: expose the store for debugging (and headless collab tests).
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  (window as unknown as { useSceneStore?: typeof useSceneStore }).useSceneStore = useSceneStore;
}
