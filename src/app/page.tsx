"use client";

import { useEffect, useRef, useState } from "react";
import { Viewport } from "@/viewport3d/Viewport";
import { TracePanel } from "@legacy/trace2d/TracePanel";
import { ProjectsOverlay } from "@/ui/ProjectsOverlay";
import { AccountMenu } from "@/ui/AccountMenu";
import { GtLab } from "@/dev/GtLab";
import { legacyExtractionEnabled } from "@/lib/featureFlags";
import { useSceneStore, type AppMode } from "@/store/useSceneStore";
import { useSyncStore } from "@/store/useSyncStore";
import { CloudSync } from "@/ui/CloudSync";
import { initProjectPersistence, goLivePersist, getCurrentProjectId, getProjectLiveRole } from "@/store/projectPersistence";
import { enterLiveRoom } from "@/collab/enterLive";
import { T } from "@/ui/tokens";
import { PD, pdGlass, pdChip } from "@/ui/planDock/tokens";
import { PdThemeStyle, ThemeToggle } from "@/ui/planDock/theme";

/** Top-left Projects launcher: the open plan's name + autosave status, and a
 *  button into the Projects gallery. State is persisted to IndexedDB, so a
 *  refresh or reopened tab resumes the same plan. */
function ProjectBar({ onOpenProjects }: { onOpenProjects: () => void }) {
  const savedAt = useSceneStore((s) => s.projectSavedAt);
  const restored = useSceneStore((s) => s.projectRestored);
  const name = useSceneStore((s) => s.projectName);
  const sync = useSyncStore((s) => s.status);
  const local = savedAt ? "Saved" : restored ? "Restored" : "Autosaving…";
  // Signed out, the local wording is the whole truth. Signed in, what matters is
  // whether the work has left this computer yet.
  const status =
    sync === "off"
      ? local
      : sync === "syncing"
        ? "Syncing…"
        : sync === "offline"
          ? "Saved here · offline"
          : sync === "error"
            ? "Saved here · can't reach cloud"
            : sync === "conflict"
              ? "Kept both versions"
              : `${local} · Synced`;
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
        ...pdGlass({ borderRadius: 999 }),
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
          color: PD.textPrimary,
          cursor: "pointer",
          fontSize: 13,
          fontFamily: PD.fontUi,
          padding: "4px 10px",
          borderRadius: 999,
        }}
      >
        <span style={{ fontSize: 14, color: PD.textTertiary }}>▚</span>
        <span style={{ fontWeight: 500, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </span>
      </button>
      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: PD.textTertiary, paddingRight: 10, fontFamily: PD.fontUi }}>
        <span style={{ color: PD.accentText }}>●</span>
        {status}
      </span>
    </div>
  );
}

/** Top-right "Go live" / "Open live". Going live turns the OPEN project into a
 *  permanent shared document: it gets a stable Liveblocks room (persisted as
 *  liveRoomId) that it always reopens into, and edits sync continuously. First
 *  time it seeds the room from this project; afterwards it just rejoins. */
function GoLiveButton() {
  const [busy, setBusy] = useState(false);
  const liveRoomId = useSceneStore((s) => s.liveRoomId);
  const goLive = async () => {
    setBusy(true);
    try {
      const s = useSceneStore.getState();
      // Full UUID, not the first 8 characters. An 8-hex-character id is 32 bits —
      // enumerable, and the room id is what a share link exposes, so a short one
      // let a stranger find rooms to knock on. Existing 8-character rooms keep
      // working; `liveRoomId` is reused whenever it is already set.
      const roomId = s.liveRoomId ?? crypto.randomUUID();
      // Mark live + persist (roomId, ownership) durably before the full reload.
      await goLivePersist(roomId);
      await enterLiveRoom(roomId, getCurrentProjectId(), {
        seed: {
          scene: s.scene,
          envPreset: s.envPreset,
          timeOfDay: s.timeOfDay,
          weather: s.weather,
          wallMode: s.wallMode,
          showCeilings: s.showCeilings,
          title: s.projectName,
        },
      });
    } catch {
      setBusy(false);
    }
  };
  const label = busy ? "Starting…" : liveRoomId ? "◈ Open live" : "◈ Go live";
  return (
    <button
      onClick={goLive}
      disabled={busy}
      title={liveRoomId ? "Reopen this project's live shared room" : "Turn this into a live, shareable document"}
      style={{
        position: "absolute",
        top: 14,
        right: 14,
        zIndex: 30,
        padding: "8px 16px",
        fontSize: 13,
        fontWeight: 600,
        fontFamily: PD.fontUi,
        borderRadius: 999,
        border: "none",
        background: PD.accent,
        color: "#fff",
        cursor: "pointer",
        opacity: busy ? 0.6 : 1,
        boxShadow: "0 8px 20px -10px oklch(0.62 0.15 258 / 0.6)",
      }}
    >
      {label}
    </button>
  );
}

const ALL_MODES: { id: AppMode; label: string; key: string }[] = [
  { id: "trace", label: "Trace", key: "1" },
  { id: "build", label: "Build", key: "2" },
  { id: "furnish", label: "Decorate", key: "3" },
  { id: "view", label: "View", key: "4" },
];

// The Trace mode is the legacy extraction pipeline's UI. Gated so a later
// phase can cut over to the new pipeline's adapter without touching this
// switcher again — see src/lib/featureFlags.ts.
const MODES = legacyExtractionEnabled
  ? ALL_MODES
  : ALL_MODES.filter((m) => m.id !== "trace");

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
        ...pdGlass({ borderRadius: 999 }),
      }}
    >
      {MODES.map((m) => {
        const active = appMode === m.id;
        return (
          <button
            key={m.id}
            onClick={() => setAppMode(m.id)}
            title={`${m.label} (${m.key})`}
            style={pdChip(active, { padding: "6px 18px", fontSize: 13 })}
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
  // StrictMode runs effects twice in dev, and BOTH of this effect's escape
  // hatches are single-use: `?home=1` is consumed by the replaceState below and
  // `live:left` by its removeItem. On a second invocation neither is visible any
  // more, so the "reopen the live room" branch fires despite the user having just
  // asked not to — the room becomes inescapable on the dev server while
  // production (single invocation) behaves correctly. Run the body once per mount.
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    const gt = new URLSearchParams(window.location.search).get("gt");
    if (!gt) {
      (async () => {
        await initProjectPersistence();
        // A live project IS its shared room, so opening it drops straight in —
        // unless we just left that room (guarded so we land on the gallery, not
        // bounce back). `?home=1` also forces the gallery (used by the room's Leave).
        const roomId = useSceneStore.getState().liveRoomId;
        const home = new URLSearchParams(window.location.search).get("home");
        const justLeft = sessionStorage.getItem("live:left");
        if (justLeft) sessionStorage.removeItem("live:left");
        if (home) window.history.replaceState({}, "", "/"); // don't leave it sticky
        if (roomId && !home && justLeft !== roomId) {
          try {
            const projectId = getCurrentProjectId();
            await enterLiveRoom(roomId, projectId, { role: getProjectLiveRole(projectId) });
            return;
          } catch {
            /* couldn't reach the room — fall through to the local editor/gallery */
          }
        }
        // Explicit "go to projects" (room's Leave button) always shows the gallery,
        // even when the restored project isn't itself live (e.g. a link receiver).
        if (home) setProjectsOpen(true);
      })();
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

  const showTrace = appMode === "trace" && legacyExtractionEnabled;

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
      <PdThemeStyle />
      <CloudSync />
      <ModeSwitcher />
      <ProjectBar onOpenProjects={() => setProjectsOpen(true)} />
      <div
        style={{
          position: "absolute",
          top: 14,
          right: showTrace ? 14 : 132,
          zIndex: 30,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <AccountMenu />
        <ThemeToggle />
      </div>
      {!showTrace && <GoLiveButton />}
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
