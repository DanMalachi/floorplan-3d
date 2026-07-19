import { create } from "zustand";
import type { Scene, FloorStyle } from "@/schema/scene";
import { sampleScene } from "@/schema/sampleScene";
import { DEFAULT_DOOR, DEFAULT_WINDOW } from "@/schema/constants";
import {
  buildPlanarGraph,
  extractWalls,
  scaleExtractParams,
  DEFAULT_PARAMS,
} from "@legacy/trace2d/extractWalls";
import {
  detectOpenings,
  scaleDetectParams,
  traceToCenterlines,
  mapOpeningToSegment,
  DEFAULT_DETECT,
  type SuggestedOpening,
} from "@legacy/trace2d/detectOpenings";
import { generateCandidates, type Candidate } from "@legacy/trace2d/candidates";
import { rasterToCandidates, type RasterProposal } from "@legacy/trace2d/rasterCandidates";
import { proposeRaster } from "@legacy/trace2d/proposeRaster";
import { buildOverlayImage } from "@legacy/trace2d/buildOverlay";
import type { VlmLabel, VlmMissed } from "@legacy/lib/rooms/vlmClassify";
import type { ImportText } from "@legacy/trace2d/importPdf";
import type {
  TracePoint,
  TraceSegment,
  SegmentKind,
  TraceOpening,
  ImportSegment,
  ImportArc,
} from "@legacy/trace2d/types";

export type {
  TracePoint,
  TraceSegment,
  SegmentKind,
  TraceOpening,
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
// only imports them). TraceImage/SuggestedWall stay here — nothing outside
// this store consumes them.
// ---------------------------------------------------------------------------

export type TraceMode = "wall" | "door" | "window" | "calibrate";

export interface TraceImage {
  src: string; // data URL
  width: number; // natural px
  height: number; // natural px
}

// A suggested wall centerline (M2), in background-image px. The user reviews and
// accepts/rejects these; accepted ones weld into the real trace.
export interface SuggestedWall {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  thickness: number; // px
}

interface TraceSnapshot {
  points: TracePoint[];
  segments: TraceSegment[];
  openings: TraceOpening[];
  activeLastPointId: string | null;
}

let _id = 0;
const newId = (prefix: string) => `${prefix}${_id++}`;

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
  kind: "wall" | "opening" | "room" | "furniture";
  id: string;
  // For wall picks: which face the pointer landed on / is targeted for paint.
  // "a" = wall-local +Z face, "b" = -Z face. Absent for non-wall picks.
  side?: "a" | "b";
}

/** The app's top-level modes (Phase 4 M5): what the main stage shows and
 *  which family of objects responds to the pointer. */
export type AppMode = "trace" | "build" | "furnish" | "view";

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

  // --- furniture (Phase 4 M4) ---
  /** Catalog item being placed: ghost follows the cursor until click/Esc. */
  placing: { assetId: string; rotation: number } | null;
  setPlacing: (assetId: string | null) => void;
  rotatePlacing: (deltaRad: number) => void;
  placeFurniture: (x: number, y: number, rotation: number) => void;
  rotateSelectedFurniture: (deltaRad: number) => void;

  // --- materials brush (Decorate mode) ---
  /** Active paint/floor applicator: click surfaces to apply, Esc to stop. */
  brush: Brush | null;
  setBrush: (b: Brush | null) => void;

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

  // --- suggested walls (Phase 2 / M2) ---
  suggestedWalls: SuggestedWall[];
  rejectedSuggestionIds: string[];
  extractionTargets: number[]; // calibrated wall thicknesses (px)
  pickThickness: boolean; // click-a-wall-to-learn-thickness mode
  wallSnap: boolean; // snap traced points to imported-PDF wall centerlines/corners
  setSuggestedWalls: (w: SuggestedWall[]) => void;
  toggleRejectSuggestion: (id: string) => void;
  clearSuggestions: () => void;
  acceptSuggestions: () => void; // weld kept suggestions into the real trace
  setPickThickness: (v: boolean) => void;
  setWallSnap: (v: boolean) => void;
  runWallExtraction: () => Promise<void>;
  addThicknessTarget: (t: number) => void;
  clearThicknessTargets: () => void;

  // --- raster plans (Phase 3 / M3): CV proposer over the loaded image ---
  rasterProposal: RasterProposal | null; // cached — deterministic per image
  extractBusy: boolean; // raster proposal runs server-side python (~seconds)
  extractMsg: string | null; // quality/result note shown under the toolbar

  // --- VLM classification (Phase 2.5 / M3) ---
  vlmModel: string; // Claude model id used by /api/classify (on-the-fly override)
  vlmBusy: boolean;
  vlmMissed: VlmMissed[]; // advisory "check this area" hints from the VLM
  planHint: string; // user's one-line plan description, sent as advisory context
  setVlmModel: (m: string) => void;
  setPlanHint: (h: string) => void;
  aiClassify: () => Promise<string>; // returns a status message for the toolbar

  // --- Building Knowledge Layer (room semantics) ---
  understandBusy: boolean;
  understandRooms: () => Promise<string>; // VLM escalation for undecided rooms

  // --- suggested openings (Phase 2 / doors + windows from wall geometry) ---
  suggestedOpenings: SuggestedOpening[];
  rejectedOpeningIds: string[];
  detectOpeningsOnTrace: () => void; // clean pass over traced/accepted walls
  toggleRejectOpening: (id: string) => void;
  clearOpenings: () => void;
  acceptOpenings: () => void; // map kept openings onto trace segments

  // --- trace draft ---
  points: TracePoint[];
  segments: TraceSegment[];
  openings: TraceOpening[];
  activeLastPointId: string | null; // chain endpoint new clicks connect to
  selectedPointId: string | null;
  selectedOpeningId: string | null;

  // --- scale calibration ---
  metersPerPixel: number | null;
  calibrationPts: { x: number; y: number }[];

  // --- interaction ---
  mode: TraceMode;
  ortho: boolean; // constrain new wall segments to 90° (Shift inverts per-click)
  drawKind: SegmentKind; // in wall mode, what kind of boundary the pen lays down

  // --- undo history (trace only) ---
  history: TraceSnapshot[];

  // --- actions ---
  setMode: (m: TraceMode) => void;
  setOrtho: (v: boolean) => void;
  setDrawKind: (v: SegmentKind) => void;
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

  addCalibrationPoint: (x: number, y: number) => void;
  applyCalibration: (realMeters: number) => void;
  cancelCalibration: () => void;
}

export const useSceneStore = create<StoreState>((set, get) => {
  const snapshot = (): TraceSnapshot => {
    const { points, segments, openings, activeLastPointId } = get();
    return {
      points: points.map((p) => ({ ...p })),
      segments: segments.map((s) => ({ ...s })),
      openings: openings.map((o) => ({ ...o })),
      activeLastPointId,
    };
  };
  const pushHistory = () =>
    set((st) => ({ history: [...st.history, snapshot()].slice(-100) }));

  // Run (or reuse) the server-side CV proposal for the loaded raster plan.
  const ensureProposal = async (): Promise<RasterProposal> => {
    const cached = get().rasterProposal;
    if (cached) return cached;
    const image = get().image;
    if (!image) throw new Error("no plan image loaded");
    const proposal = await proposeRaster(image.src);
    set({ rasterProposal: proposal });
    return proposal;
  };

  // Map raster-pipeline candidates into the reviewable suggestion layers.
  // Only heuristic-kept walls surface (rejects are hundreds of text/noise
  // stubs on thin-stroke plans); gap-openings all surface — they're few and
  // one click rejects a bad one.
  const candidatesToSuggestions = (cands: Candidate[]) => {
    const walls: SuggestedWall[] = [];
    const opens: SuggestedOpening[] = [];
    for (const c of cands) {
      if (c.kind === "wall" && c.keptByHeuristic) {
        walls.push({
          id: `w${walls.length}`,
          x0: c.px[0], y0: c.px[1], x1: c.px[2], y1: c.px[3],
          thickness: c.thicknessPx,
        });
      } else if (c.kind === "opening") {
        opens.push({
          id: `ro${opens.length}`,
          type: "door",
          x0: c.px[0], y0: c.px[1], x1: c.px[2], y1: c.px[3],
          width: c.lengthPx,
          thickness: c.thicknessPx,
          flags: c.flags,
        });
      }
    }
    return { walls, opens };
  };

  return {
    scene: sampleScene,
    // Loading/generating a whole scene is itself an undoable command; it is
    // also the only thing that reframes the 3D camera (frameToken).
    setScene: (scene) => {
      get().commitScene("Replace scene", scene);
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

    appMode: "trace",
    wallMode: "full",
    showCeilings: true,
    setAppMode: (appMode) => {
      const s = get();
      if (s.gestureBase) s.cancelGesture();
      // Leaving a mode drops its transient interaction state.
      set({ appMode, placing: null, brush: null, sel3d: null, hover3d: null });
    },
    setWallMode: (wallMode) => set({ wallMode }),
    setShowCeilings: (showCeilings) => set({ showCeilings }),
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
        suggestedWalls: [],
        rejectedSuggestionIds: [],
        suggestedOpenings: [],
        rejectedOpeningIds: [],
        extractionTargets: [],
        calibrationPts: [],
        metersPerPixel: null,
        rasterProposal: null,
        sel3d: null,
        placing: null,
      });
      get().setSourcePdfName(file.name);
      try {
        if (isPdfFile(file)) {
          const { importPdf } = await import("@legacy/trace2d/importPdf");
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
      set({ placing: assetId ? { assetId, rotation: 0 } : null, brush: null, sel3d: null }),
    brush: null,
    setBrush: (brush) => set({ brush, placing: null, sel3d: null }),
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
      commitScene("Place furniture", {
        ...scene,
        furniture: [...scene.furniture, { id, assetId: placing.assetId, x, y, rotation }],
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
        });
      } else if (sel3d.kind === "opening") {
        commitScene("Delete opening", {
          ...scene,
          openings: scene.openings.filter((o) => o.id !== sel3d.id),
        });
      } else {
        commitScene("Delete floor", {
          ...scene,
          rooms: scene.rooms.filter((r) => r.id !== sel3d.id),
        });
      }
    },

    image: null,
    imageOpacity: 0.6,
    // A new image invalidates the cached CV proposal (it's per-image).
    setImage: (image) => set({ image, rasterProposal: null, extractMsg: null }),
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

    suggestedWalls: [],
    rejectedSuggestionIds: [],
    extractionTargets: [],
    pickThickness: false,
    wallSnap: true,
    setSuggestedWalls: (suggestedWalls) =>
      set({ suggestedWalls, rejectedSuggestionIds: [] }),
    setPickThickness: (pickThickness) => set({ pickThickness }),
    setWallSnap: (wallSnap) => set({ wallSnap }),
    rasterProposal: null,
    extractBusy: false,
    extractMsg: null,
    runWallExtraction: async () => {
      const { importedSegments, importedArcs, extractionTargets, metersPerPixel, image } = get();

      // Raster branch (Phase 3): no vector geometry — propose from pixels.
      if (importedSegments.length === 0) {
        if (!image) return;
        set({ extractBusy: true, extractMsg: null });
        try {
          const proposal = await ensureProposal();
          const gen = rasterToCandidates(proposal, metersPerPixel);
          const { walls, opens } = candidatesToSuggestions(gen.candidates);
          const q = proposal.quality;
          set({
            suggestedWalls: walls,
            rejectedSuggestionIds: [],
            suggestedOpenings: opens,
            rejectedOpeningIds: [],
            extractMsg:
              `✓ Proposed ${walls.length} walls + ${opens.length} possible doors from the image` +
              `${q.verdict !== "good" ? ` — quality ${q.verdict}` : ""}` +
              `${q.notes.length ? ` (${q.notes.join("; ")})` : ""}. Review below: click a suggestion to reject it.`,
          });
        } catch (e) {
          set({ extractMsg: "✗ Wall proposal failed: " + ((e as Error).message ?? String(e)) });
        } finally {
          set({ extractBusy: false });
        }
        return;
      }

      const r = extractWalls(importedSegments, {
        ...scaleExtractParams(DEFAULT_PARAMS, metersPerPixel),
        thicknessTargets: extractionTargets,
        // Reject parallel walls closer than 0.3 m (stairs/hatch) once scaled.
        minWallSepPx: metersPerPixel ? 0.3 / metersPerPixel : 0,
      });
      // Bundled rough opening pass over the freshly extracted centerlines.
      const det = detectOpenings(
        importedSegments,
        r.centerlines,
        importedArcs,
        metersPerPixel,
        scaleDetectParams(DEFAULT_DETECT, metersPerPixel),
      );
      set({
        suggestedWalls: r.centerlines.map((c, i) => ({ id: `w${i}`, ...c })),
        rejectedSuggestionIds: [],
        suggestedOpenings: det.openings,
        rejectedOpeningIds: [],
      });
    },
    addThicknessTarget: (t) => {
      const cur = get().extractionTargets;
      if (cur.some((x) => Math.abs(x - t) <= 3)) return; // de-dupe similar bands
      set({ extractionTargets: [...cur, Math.round(t)] });
      get().runWallExtraction();
    },
    clearThicknessTargets: () => {
      set({ extractionTargets: [] });
      get().runWallExtraction();
    },

    vlmModel: "claude-opus-4-8",
    vlmBusy: false,
    vlmMissed: [],
    planHint: "",
    setVlmModel: (vlmModel) => set({ vlmModel }),
    setPlanHint: (planHint) => set({ planHint }),
    aiClassify: async () => {
      const { importedSegments, importedArcs, metersPerPixel, extractionTargets, image, vlmModel, planHint } =
        get();
      if (!image) return "Load a plan first (upload an image or import a PDF).";
      set({ vlmBusy: true });
      try {
        // Vector plans: candidates from parsed geometry. Raster plans: from the
        // CV proposer over the image (same Candidate contract downstream).
        const gen =
          importedSegments.length > 0
            ? generateCandidates(importedSegments, importedArcs, metersPerPixel, {
                extractionTargets,
              })
            : rasterToCandidates(await ensureProposal(), metersPerPixel);
        if (gen.candidates.length === 0) return "No candidates found in this plan.";
        const overlay = await buildOverlayImage(image.src, gen.candidates);
        const res = await fetch("/api/classify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            image: overlay,
            candidates: gen.candidates,
            metersPerPixel,
            planHint: planHint.trim() || null,
            model: vlmModel,
          }),
        });
        const j = await res.json();
        if (!res.ok || j.error) throw new Error(j.error ?? `HTTP ${res.status}`);

        const byId = new Map<number, VlmLabel>(
          (j.labels as VlmLabel[]).map((l) => [l.id, l]),
        );
        const walls: SuggestedWall[] = [];
        const opens: SuggestedOpening[] = [];
        for (const c of gen.candidates) {
          const l = byId.get(c.id);
          if (!l) continue;
          if (l.label === "wall" && c.kind === "wall") {
            walls.push({
              id: `w${walls.length}`,
              x0: c.px[0],
              y0: c.px[1],
              x1: c.px[2],
              y1: c.px[3],
              thickness: c.thicknessPx,
            });
          } else if (l.label === "door" || l.label === "window") {
            opens.push({
              id: `vo${opens.length}`,
              type: l.label,
              x0: c.px[0],
              y0: c.px[1],
              x1: c.px[2],
              y1: c.px[3],
              width: c.lengthPx,
              thickness: c.thicknessPx,
              flags: [`vlm-${l.confidence}`],
            });
          }
        }
        const missed = (j.missed ?? []) as VlmMissed[];
        set({
          suggestedWalls: walls,
          rejectedSuggestionIds: [],
          suggestedOpenings: opens,
          rejectedOpeningIds: [],
          vlmMissed: missed,
        });
        const doors = opens.filter((o) => o.type === "door").length;
        return `✓ AI (${j.model}): ${walls.length} walls, ${doors} doors, ${opens.length - doors} windows${missed.length ? ` · ${missed.length} area(s) flagged as possibly missed` : ""}`;
      } catch (e) {
        return "AI classify failed: " + ((e as Error).message ?? String(e));
      } finally {
        set({ vlmBusy: false });
      }
    },

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

    suggestedOpenings: [],
    rejectedOpeningIds: [],
    detectOpeningsOnTrace: () => {
      const { points, segments, importedSegments, importedArcs, metersPerPixel } = get();
      const cls = traceToCenterlines(points, segments, importedSegments);
      const det = detectOpenings(
        importedSegments,
        cls,
        importedArcs,
        metersPerPixel,
        scaleDetectParams(DEFAULT_DETECT, metersPerPixel),
      );
      set({ suggestedOpenings: det.openings, rejectedOpeningIds: [] });
    },
    toggleRejectOpening: (id) =>
      set((st) => ({
        rejectedOpeningIds: st.rejectedOpeningIds.includes(id)
          ? st.rejectedOpeningIds.filter((x) => x !== id)
          : [...st.rejectedOpeningIds, id],
      })),
    clearOpenings: () => set({ suggestedOpenings: [], rejectedOpeningIds: [] }),
    acceptOpenings: () => {
      const { suggestedOpenings, rejectedOpeningIds, points, segments } = get();
      const rejected = new Set(rejectedOpeningIds);
      const kept = suggestedOpenings.filter((o) => !rejected.has(o.id));
      if (kept.length === 0) return;
      pushHistory();
      const d = { door: DEFAULT_DOOR, window: DEFAULT_WINDOW };
      set((st) => {
        const openings = [...st.openings];
        for (const op of kept) {
          const m = mapOpeningToSegment(op, points, segments);
          if (!m) continue; // its host wall isn't traced/accepted (yet)
          openings.push({
            id: newId("o"),
            type: op.type,
            segmentId: m.segmentId,
            t0: m.t0,
            t1: m.t1,
            height: d[op.type].height,
            sill: d[op.type].sill,
          });
        }
        return { openings, suggestedOpenings: [], rejectedOpeningIds: [] };
      });
    },
    toggleRejectSuggestion: (id) =>
      set((st) => ({
        rejectedSuggestionIds: st.rejectedSuggestionIds.includes(id)
          ? st.rejectedSuggestionIds.filter((x) => x !== id)
          : [...st.rejectedSuggestionIds, id],
      })),
    clearSuggestions: () => set({ suggestedWalls: [], rejectedSuggestionIds: [] }),
    acceptSuggestions: () => {
      const { suggestedWalls, rejectedSuggestionIds } = get();
      const rejected = new Set(rejectedSuggestionIds);
      const kept = suggestedWalls.filter((w) => !rejected.has(w.id));
      if (kept.length === 0) return;
      pushHistory();
      // Node the kept centerlines into a planar graph (splits T/cross junctions
      // so rooms can close), then weld it into any existing manual trace.
      const graph = buildPlanarGraph(kept, 14);
      set((st) => {
        const WELD = 14;
        const points = st.points.map((p) => ({ ...p }));
        const findOrAdd = (x: number, y: number) => {
          for (const p of points) {
            if (Math.hypot(p.x - x, p.y - y) <= WELD) return p.id;
          }
          const p: TracePoint = { id: newId("p"), x, y };
          points.push(p);
          return p.id;
        };
        const map = new Map<string, string>();
        for (const n of graph.nodes) map.set(n.id, findOrAdd(n.x, n.y));
        const segments = st.segments.map((s) => ({ ...s }));
        for (const g of graph.segments) {
          const a = map.get(g.a);
          const b = map.get(g.b);
          if (!a || !b || a === b) continue;
          if (segments.some((s) => (s.a === a && s.b === b) || (s.a === b && s.b === a))) continue;
          segments.push({ id: newId("s"), a, b });
        }
        return {
          points,
          segments,
          suggestedWalls: [],
          rejectedSuggestionIds: [],
          activeLastPointId: null,
        };
      });
    },

    points: [],
    segments: [],
    openings: [],
    activeLastPointId: null,
    selectedPointId: null,
    selectedOpeningId: null,

    metersPerPixel: null,
    calibrationPts: [],

    mode: "wall",
    ortho: true,
    drawKind: "wall",

    history: [],

    setMode: (mode) =>
      set({
        mode,
        calibrationPts: mode === "calibrate" ? [] : get().calibrationPts,
      }),

    setOrtho: (ortho) => set({ ortho }),
    setDrawKind: (drawKind) => set({ drawKind }),

    addPoint: (x, y) => {
      pushHistory();
      set((st) => {
        const p: TracePoint = { id: newId("p"), x, y };
        const kind = st.drawKind;
        const segments = st.activeLastPointId
          ? [...st.segments, { id: newId("s"), a: st.activeLastPointId, b: p.id, type: kind }]
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
          : [...st.segments, { id: newId("s"), a: activeLastPointId, b: nodeId, type: kind }];
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

        // Split pieces inherit the split wall's own type; the new run's
        // connecting segment (below) takes the current draw kind.
        const s1 = { id: newId("s"), a: seg.a, b: P.id, type: seg.type };
        const s2 = { id: newId("s"), a: P.id, b: seg.b, type: seg.type };
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
          segments = [...segments, { id: newId("s"), a: st.activeLastPointId, b: P.id, type: kind }];
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
      set({ selectedPointId, selectedOpeningId: null }),

    selectOpening: (selectedOpeningId) =>
      set({ selectedOpeningId, selectedPointId: null }),

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
      const { selectedOpeningId, selectedPointId } = get();
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

    finishChain: () =>
      set({ activeLastPointId: null, selectedPointId: null, selectedOpeningId: null }),

    undo: () => {
      const hist = get().history;
      if (hist.length === 0) return;
      const prev = hist[hist.length - 1];
      set({
        points: prev.points,
        segments: prev.segments,
        openings: prev.openings,
        activeLastPointId: prev.activeLastPointId,
        history: hist.slice(0, -1),
        selectedPointId: null,
        selectedOpeningId: null,
      });
    },

    clearTrace: () => {
      pushHistory();
      set({
        points: [],
        segments: [],
        openings: [],
        activeLastPointId: null,
        selectedPointId: null,
        selectedOpeningId: null,
      });
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
