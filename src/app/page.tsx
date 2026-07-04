"use client";

import { useEffect } from "react";
import { Viewport } from "@/viewport3d/Viewport";
import { TracePanel } from "@/trace2d/TracePanel";
import { useSceneStore, type AppMode } from "@/store/useSceneStore";
import { T, glass } from "@/ui/tokens";

const MODES: { id: AppMode; label: string; key: string }[] = [
  { id: "trace", label: "Trace", key: "1" },
  { id: "build", label: "Build", key: "2" },
  { id: "furnish", label: "Furnish", key: "3" },
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
      {/* Trace keeps its own pane; the three 3D modes share one live viewport
          so the camera never resets between Build / Furnish / View. */}
      <div style={{ position: "absolute", inset: 0, display: showTrace ? "block" : "none" }}>
        <TracePanel />
      </div>
      <div style={{ position: "absolute", inset: 0, display: showTrace ? "none" : "block" }}>
        <Viewport />
      </div>
    </main>
  );
}
