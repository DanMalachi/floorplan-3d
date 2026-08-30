"use client";

import { useEffect, useState } from "react";
import {
  listProjects,
  openProject,
  createProject,
  deleteProject,
  renameProject,
  setProjectThumb,
  getCurrentProjectId,
  subscribeProjects,
  type ProjectMeta,
} from "@/store/projectPersistence";
import { ensureDownloaded } from "@/store/syncEngine";
import { requestViewportThumb } from "@/render/viewportThumb";
import { enterLiveRoom } from "@/collab/enterLive";
import { T, glass, microLabel } from "@/ui/tokens";

/** The room id when the gallery is open ON a live-room route (`/v/<id>`), else
 *  null. Opening or creating a NON-live project from inside a room has to leave
 *  the room first: `CollabRoom`'s observer keeps writing the room's own scene
 *  into the store, so the project being opened would be overwritten on the next
 *  update and never actually appear. */
function roomIdInPath(): string | null {
  const m = /^\/v\/([^/?#]+)/.exec(window.location.pathname);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Leave the live room back to the plain editor, landing on the project that
 *  was just made current. Mirrors `CollabRoom`'s Leave button — the `live:left`
 *  flag stops the home page bouncing straight back into the room — but omits
 *  `?home=1`, because the caller has already chosen a project and does not want
 *  the gallery reopened on top of it. */
function leaveRoomTo(roomId: string): void {
  try {
    sessionStorage.setItem("live:left", roomId);
  } catch {
    /* private mode: the redirect guard is best-effort, the navigation still works */
  }
  window.location.href = "/";
}

function ago(ts: number): string {
  const s = (Date.now() - ts) / 1000;
  if (s < 45) return "just now";
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h ago`;
  const d = h / 24;
  if (d < 7) return `${Math.floor(d)}d ago`;
  return new Date(ts).toLocaleDateString();
}

/**
 * Full-screen Projects gallery. Slides over the editor (which stays mounted, so
 * the 3D viewport never resets). On open it snapshots the current project's 3D
 * view as its card thumbnail; other cards show the snapshot from when they were
 * last visited.
 */
export function ProjectsOverlay({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<ProjectMeta[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const currentId = getCurrentProjectId();

  const refresh = () => setItems(listProjects());

  // Cloud sync pulls projects in the background, so the gallery can't be a
  // one-shot read any more — it has to hear about cards that arrive while open.
  useEffect(() => subscribeProjects(refresh), []);

  // Snapshot the open project's 3D view, then list everything.
  //
  // The snapshot is awaited now rather than read synchronously: it is served
  // from inside the render loop (`<ThumbCaptureRig>`) on the next frame, which
  // is what lets the WebGL context drop `preserveDrawingBuffer` and stop paying
  // for a readable buffer on every frame of the app's life. It resolves null if
  // no viewport is mounted or the tab is backgrounded, which is the same
  // "fall back to a placeholder" case the old path already had.
  useEffect(() => {
    let alive = true;
    const cur = getCurrentProjectId();
    (async () => {
      const thumb = await requestViewportThumb();
      if (cur && thumb) await setProjectThumb(cur, thumb);
      if (alive) refresh();
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleOpen(id: string) {
    // A card that came from the account but has never been on this computer:
    // fetch it before opening, so the editor never loads an empty project.
    if (items.find((x) => x.id === id)?.cloudOnly) {
      setBusyId(id);
      const ok = await ensureDownloaded(id);
      setBusyId(null);
      if (!ok) return; // stay in the gallery; the status line says why
      refresh();
    }
    if (id !== getCurrentProjectId()) await openProject(id);
    // A live project IS its shared room, so opening it drops straight into the room
    // (openProject above persists it as current, so leaving returns here).
    const m = items.find((x) => x.id === id);
    if (m?.liveRoomId) {
      await enterLiveRoom(m.liveRoomId, id, { role: m.liveRole ?? "build" });
      return;
    }
    // Opening a non-live project while standing in a live room: leave the room,
    // or its observer overwrites the project we just opened.
    const room = roomIdInPath();
    if (room) {
      leaveRoomTo(room);
      return;
    }
    onClose();
  }
  async function handleNew() {
    await createProject();
    // Same trap as handleOpen, and the one that actually bit: a project created
    // from inside a live room is written to IndexedDB but never reachable — the
    // room keeps rendering its own scene over it.
    const room = roomIdInPath();
    if (room) {
      leaveRoomTo(room);
      return;
    }
    onClose();
  }
  async function handleDelete(m: ProjectMeta) {
    if (!window.confirm(`Delete “${m.name}”? This can't be undone.`)) return;
    await deleteProject(m.id);
    refresh();
  }
  function startRename(m: ProjectMeta) {
    setRenaming(m.id);
    setDraft(m.name);
  }
  async function commitRename() {
    if (renaming) await renameProject(renaming, draft);
    setRenaming(null);
    refresh();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(9,9,12,0.72)",
        backdropFilter: "blur(24px) saturate(1.3)",
        WebkitBackdropFilter: "blur(24px) saturate(1.3)",
        display: "flex",
        flexDirection: "column",
        fontFamily: T.font,
      }}
    >
      {/* header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 28px",
          borderBottom: `1px solid ${T.panelBorder}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontSize: 19, fontWeight: 600, color: T.text }}>Projects</span>
          <span style={{ fontSize: 13, color: T.textFaint }}>
            {items.length} {items.length === 1 ? "plan" : "plans"}
          </span>
        </div>
        <button
          onClick={onClose}
          title="Close (Esc)"
          style={{
            border: `1px solid ${T.panelBorder}`,
            background: T.inputBg,
            color: T.textDim,
            cursor: "pointer",
            width: 30,
            height: 30,
            borderRadius: 999,
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* grid */}
      <div style={{ flex: 1, overflowY: "auto", padding: 28 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
            gap: 18,
            maxWidth: 1200,
            margin: "0 auto",
          }}
        >
          {/* new-plan tile */}
          <button
            onClick={handleNew}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              aspectRatio: "1 / 1",
              border: `1.5px dashed ${T.panelBorder}`,
              borderRadius: T.radiusL,
              background: "transparent",
              color: T.textDim,
              cursor: "pointer",
              fontFamily: T.font,
              transition: `border-color ${T.dur} ${T.ease}, color ${T.dur} ${T.ease}`,
            }}
          >
            <span style={{ fontSize: 30, lineHeight: 1 }}>+</span>
            <span style={{ fontSize: 13 }}>New plan</span>
          </button>

          {items.map((m) => {
            const isCurrent = m.id === currentId;
            return (
              <div
                key={m.id}
                onClick={() => renaming !== m.id && handleOpen(m.id)}
                style={{
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  ...glass({
                    borderRadius: T.radiusL,
                    overflow: "hidden",
                    border: `1px solid ${isCurrent ? T.accent : T.panelBorder}`,
                  }),
                }}
              >
                {/* thumbnail */}
                <div
                  style={{
                    position: "relative",
                    aspectRatio: "4 / 3",
                    background: T.bgCanvas,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {m.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.thumb}
                      alt={m.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span style={{ fontSize: 30, color: T.textFaint }}>▱</span>
                  )}
                  <div style={{ position: "absolute", top: 8, left: 8, display: "flex", gap: 6 }}>
                    {isCurrent && (
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: 999,
                          background: T.accent,
                          color: "#fff",
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: 0.4,
                        }}
                      >
                        OPEN
                      </span>
                    )}
                    {m.cloudOnly && (
                      <span
                        title="Saved to your account — click to bring it onto this computer"
                        style={{
                          padding: "3px 8px",
                          borderRadius: 999,
                          background: T.panelBorder,
                          color: T.text,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: 0.4,
                        }}
                      >
                        {busyId === m.id ? "DOWNLOADING…" : "IN CLOUD"}
                      </span>
                    )}
                    {m.liveRoomId && (
                      <span
                        title="Live shared document — opens into its room"
                        style={{
                          padding: "3px 8px",
                          borderRadius: 999,
                          background: T.ok,
                          color: "#fff",
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: 0.4,
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        ● LIVE
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(m);
                    }}
                    title="Delete plan"
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      border: "none",
                      background: "rgba(0,0,0,0.5)",
                      color: "#fff",
                      cursor: "pointer",
                      fontSize: 12,
                      lineHeight: 1,
                    }}
                  >
                    🗑
                  </button>
                </div>

                {/* meta */}
                <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 3 }}>
                  {renaming === m.id ? (
                    <input
                      autoFocus
                      value={draft}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      style={{
                        background: T.inputBg,
                        border: `1px solid ${T.accent}`,
                        borderRadius: T.radiusS,
                        color: T.text,
                        padding: "3px 6px",
                        fontSize: 13,
                        fontFamily: T.font,
                        outline: "none",
                        width: "100%",
                        boxSizing: "border-box",
                      }}
                    />
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                      <span
                        style={{
                          fontSize: 13.5,
                          fontWeight: 500,
                          color: T.text,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {m.name}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startRename(m);
                        }}
                        title="Rename"
                        style={{
                          border: "none",
                          background: "transparent",
                          color: T.textFaint,
                          cursor: "pointer",
                          fontSize: 12,
                          padding: 0,
                          flexShrink: 0,
                        }}
                      >
                        ✎
                      </button>
                    </div>
                  )}
                  <span style={microLabel(T.textFaint)}>{ago(m.updatedAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
