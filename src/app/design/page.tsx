"use client";

import { useEffect, useRef, useState } from "react";
import { Viewport } from "@/viewport3d/Viewport";
import { TracePanel } from "@legacy/trace2d/TracePanel";
import { ProjectsOverlay } from "@/ui/ProjectsOverlay";
import { AccountMenu } from "@/ui/AccountMenu";
import { GtLab } from "@/dev/GtLab";
import { devToolsEnabled, legacyExtractionEnabled } from "@/lib/featureFlags";
import { useSceneStore, type AppMode } from "@/store/useSceneStore";
import { useSyncStore } from "@/store/useSyncStore";
import { CloudSync } from "@/ui/CloudSync";
import { initProjectPersistence, goLivePersist, getCurrentProjectId, getProjectLiveRole } from "@/store/projectPersistence";
import { enterLiveRoom } from "@/collab/enterLive";
import { T } from "@/ui/tokens";
import { PD, pdGlass, pdChip } from "@/ui/planDock/tokens";
import { PdThemeStyle, ThemeToggle } from "@/ui/planDock/theme";
import { ProjectBar } from "@/ui/ProjectBar";

/** Top-left Projects launcher: the open plan's name + autosave status, and a
 *  button into the Projects gallery. State is persisted to IndexedDB, so a
 *  refresh or reopened tab resumes the same plan. The status wording lives
 *  here (not in the shared ProjectBar) because it reads the editor's own
 *  sync store — the live room has no such store, so it renders no status. */
function EditorProjectBar({ onOpenProjects }: { onOpenProjects: () => void }) {
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
  return <ProjectBar name={name} status={status} onOpenProjects={onOpenProjects} />;
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

/**
 * `/design?hero=1` — furnish the marketing hero's apartment.
 *
 * The hero's room is authored by hand in `src/landing/demoScene.ts`, which is a
 * terrible way to place furniture: you are typing coordinates at a room you
 * cannot see. This opens that exact scene in the real editor, in Decorate mode,
 * so it can be furnished by dragging — then hands the result back as the
 * literal array to paste into that file.
 *
 * It deliberately SKIPS project persistence, the same way `?gt=` does, so a
 * furnishing session can never overwrite a real project. That also means
 * nothing here is saved: the copy button is the only way out, which is why it
 * says so on screen rather than hoping.
 */
function HeroFurnishBar() {
  const [msg, setMsg] = useState("Copy furniture →");
  const copy = async () => {
    const furniture = useSceneStore.getState().scene.furniture;
    const text = JSON.stringify(furniture, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setMsg(`Copied ${furniture.length} pieces`);
    } catch {
      console.log("[hero] furniture:\n" + text);
      setMsg("Clipboard blocked — logged to console");
    }
    setTimeout(() => setMsg("Copy furniture →"), 2600);
  };
  return (
    <div
      style={{
        // Top-left, under the wall-mode row. Bottom-left is where the Plan Dock
        // and the dev overlay's badge both live, and this bar has to stay
        // readable — it is the only thing telling you the session is unsaved.
        position: "absolute",
        top: 112,
        left: 14,
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        gap: 12,
        ...pdGlass({ borderRadius: 10 }),
        padding: "10px 12px",
      }}
    >
      <span style={{ fontFamily: PD.fontMono ?? PD.fontUi, fontSize: 11, letterSpacing: "0.1em", color: PD.textSecondary }}>
        HERO SCENE · NOT SAVED
      </span>
      <button onClick={copy} style={pdChip(true, { padding: "6px 14px", fontSize: 12 })}>
        {msg}
      </button>
    </div>
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
  const [heroFurnish, setHeroFurnish] = useState(false);

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
    const params = new URLSearchParams(window.location.search);

    // Furnishing the marketing hero. Checked FIRST and returns without ever
    // calling initProjectPersistence, so this session has no project attached
    // and cannot autosave over one — see HeroFurnishBar.
    if (devToolsEnabled && params.get("hero")) {
      setHeroFurnish(true);
      (async () => {
        const { heroDressedScene } = await import("@/landing/demoScene");
        useSceneStore.getState().setScene(heroDressedScene());
        useSceneStore.getState().setAppMode("furnish");
        // Ceilings off so the room can be seen into while it is furnished, and
        // a name that admits what this is — the project bar would otherwise sit
        // there claiming "Autosaving…" over a scene nothing is saving.
        //
        // `frameToken` is the load-bearing one. Opening a project bumps it so
        // the viewport reframes onto that model (see `loadIntoStore`), and this
        // route skips persistence entirely — so without it the camera keeps its
        // default bounds, the hero's plan sits off-origin, and the viewport is
        // simply black. It looks like the scene failed to load; it has loaded
        // and nothing is pointing at it.
        // `top` wall mode, not the default `full`. Two reasons, and the first
        // is not cosmetic: this plan spans x -1.8..6, so its centre is nowhere
        // near the origin the editor's environment is built around, and in
        // `full` the framed camera lands somewhere that renders black — the
        // scene is there, nothing is looking at it. `top` frames it correctly.
        // It is also simply the right mode for the job: furniture is placed
        // from above.
        useSceneStore.setState({
          showCeilings: false,
          wallMode: "top",
          projectName: "Hero scene (unsaved)",
        });
      })();
      return;
    }

    // Dev-only, and this one is not merely untidy in production: the `?gt=`
    // branch skips project restore, and the store it leaves behind then
    // autosaves into whatever project is current. Off the dev server it must
    // read as an ordinary visit — see `devToolsEnabled`.
    const gt = devToolsEnabled ? params.get("gt") : null;
    if (!gt) {
      (async () => {
        await initProjectPersistence();
        // A live project IS its shared room, so opening it drops straight in —
        // unless we just left that room (guarded so we land on the gallery, not
        // bounce back). `?home=1` also forces the gallery (used by the room's Leave).
        const roomId = useSceneStore.getState().liveRoomId;
        const home = params.get("home");
        const justLeft = sessionStorage.getItem("live:left");
        if (justLeft) sessionStorage.removeItem("live:left");
        if (home) window.history.replaceState({}, "", "/design"); // don't leave it sticky
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
      <EditorProjectBar onOpenProjects={() => setProjectsOpen(true)} />
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
      {heroFurnish && <HeroFurnishBar />}
    </main>
  );
}
