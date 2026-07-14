"use client";

import { useEffect, useState } from "react";
import { Viewport } from "@/viewport3d/Viewport";
import { TracePanel } from "@/trace2d/TracePanel";
import { ProjectsOverlay } from "@/ui/ProjectsOverlay";
import { GtLab } from "@/dev/GtLab";
import { useSceneStore, type AppMode } from "@/store/useSceneStore";
import { initProjectPersistence } from "@/store/projectPersistence";
import { T, glass } from "@/ui/tokens";

/** Top-left Projects launcher: the open plan's name + autosave status, and a
 *  button into the Projects gallery. State is persisted to IndexedDB, so a
 *  refresh or reopened tab resumes the same plan. */
function ProjectBar({ onOpenProjects }: { onOpenProjects: () => void }) {
  const savedAt = useSceneStore((s) => s.projectSavedAt);
  const restored = useSceneStore((s) => s.projectRestored);
  const name = useSceneStore((s) => s.projectName);
  const status = savedAt ? "Saved" : restored ? "Restored" : "Autosaving…";
  return (
    <div
      style={{
        position: "absolute",
        top: 14,
        left: 14,
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: 4,
        fontFamily: T.font,
        ...glass({ borderRadius: 999 }),
      }}
    >
      <button
        onClick={onOpenProjects}
        title="Browse projects"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          border: "none",
          background: "transparent",
          color: T.text,
          cursor: "pointer",
          fontSize: 13,
          fontFamily: T.font,
          padding: "4px 10px",
          borderRadius: 999,
        }}
      >
        <span style={{ fontSize: 14, color: T.textDim }}>▚</span>
        <span style={{ fontWeight: 500, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </span>
      </button>
      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: T.textDim, paddingRight: 10 }}>
        <span style={{ color: T.accent }}>●</span>
        {status}
      </span>
    </div>
  );
}

const MODES: { id: AppMode; label: string; key: string }[] = [
  { id: "trace", label: "Trace", key: "1" },
  { id: "build", label: "Build", key: "2" },
  { id: "furnish", label: "Decorate", key: "3" },
  { id: "view", label: "View", key: "4" },
];

/** Top-center segmented mode switcher — the app's primary navigation. */
function ModeSwitcher() {
  const appMode = useSceneStore((s) => s.appMode);
  const setAppMode = useSceneStore((s) => s.setAppMode);
  return (
    <div
      style={{
        position: "absolute",
        top: 14,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        gap: 3,
        padding: 4,
        ...glass({ borderRadius: 999 }),
      }}
    >
      {MODES.map((m) => {
        const active = appMode === m.id;
        return (
          <button
            key={m.id}
            onClick={() => setAppMode(m.id)}
            title={`${m.label} (${m.key})`}
            style={{
              padding: "6px 18px",
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              fontFamily: T.font,
              borderRadius: 999,
              border: "none",
              background: active ? T.accent : "transparent",
              color: active ? "#fff" : T.textDim,
              cursor: "pointer",
              transition: `background ${T.dur} ${T.ease}, color ${T.dur} ${T.ease}`,
            }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

export default function Home() {
  const appMode = useSceneStore((s) => s.appMode);
  const [projectsOpen, setProjectsOpen] = useState(false);

  // Restore the saved project (if any) and start autosaving. Runs once.
  // Dev escape hatch: `?gt=<name>` loads a hand-authored ground-truth plan from
  // floorplan-gt/ straight into the 3D view. It deliberately SKIPS persistence
  // so viewing a GT never overwrites the user's autosaved working plan.
  useEffect(() => {
    const gt = new URLSearchParams(window.location.search).get("gt");
    if (!gt) {
      initProjectPersistence();
      return;
    }
    (async () => {
      try {
        const [{ gtToScene }, res] = await Promise.all([
          import("@/dev/gtToScene"),
          fetch(`/api/dev-gt?name=${encodeURIComponent(gt)}`),
        ]);
        if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
        useSceneStore.getState().setScene(gtToScene(await res.json()));
        useSceneStore.getState().setAppMode("view");
      } catch (e) {
        console.error(`[dev-gt] failed to load "${gt}":`, e);
      }
    })();
  }, []);

  // 1-4 switch modes from anywhere (except while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const m = MODES.find((x) => x.key === e.key);
      if (m) useSceneStore.getState().setAppMode(m.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showTrace = appMode === "trace";

  return (
    <main
      style={{
        position: "relative",
        height: "100vh",
        width: "100vw",
        background: T.bg,
        fontFamily: T.font,
        overflow: "hidden",
      }}
    >
      <ModeSwitcher />
      <ProjectBar onOpenProjects={() => setProjectsOpen(true)} />
      {/* Trace keeps its own pane; the three 3D modes share one live viewport
          so the camera never resets between Build / Furnish / View. */}
      <div style={{ position: "absolute", inset: 0, display: showTrace ? "block" : "none" }}>
        <TracePanel />
      </div>
      <div style={{ position: "absolute", inset: 0, display: showTrace ? "none" : "block" }}>
        <Viewport />
      </div>
      {projectsOpen && <ProjectsOverlay onClose={() => setProjectsOpen(false)} />}
      {/* Secret dev tool: Shift+G to drop GT files and save each as a project. */}
      <GtLab />
    </main>
  );
}
