"use client";

import { useEffect, useRef, useState } from "react";
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
import { captureViewportThumb } from "@/viewport3d/viewportCapture";
import { enterLiveRoom } from "@/collab/enterLive";
import { T, glass, microLabel } from "@/ui/tokens";

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
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // What had focus before the gallery covered the editor, so it can be handed
  // back on close instead of dumping the user at the top of the document.
  const restoreRef = useRef<HTMLElement | null>(null);

  const refresh = () => setItems(listProjects());

  // Cloud sync pulls projects in the background, so the gallery can't be a
  // one-shot read any more — it has to hear about cards that arrive while open.
  useEffect(() => subscribeProjects(refresh), []);

  // Snapshot the open project's 3D view, then list everything.
  useEffect(() => {
    let alive = true;
    const cur = getCurrentProjectId();
    const thumb = captureViewportThumb();
    (async () => {
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

  // A11y: this covers the whole editor but was a plain <div> — so it had no
  // dialog semantics, focus stayed wherever it was in the editor underneath,
  // and Tab walked straight out of the gallery into chrome the user cannot
  // see or use. Move focus in on open, keep it inside while open, and give it
  // back on close. Pointer behaviour is untouched.
  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      restoreRef.current?.focus?.();
    };
  }, []);

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
    onClose();
  }
  async function handleNew() {
    await createProject();
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
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fp-projects-title"
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
          {/* h2 rather than span: it is the dialog's title and now names it.
              Every default heading margin/size is overridden below, so it
              renders exactly as the span did. */}
          <h2 id="fp-projects-title" style={{ fontSize: 19, fontWeight: 600, color: T.text, margin: 0 }}>
            Projects
          </h2>
          <span style={{ fontSize: 13, color: T.textFaint }}>
            {items.length} {items.length === 1 ? "plan" : "plans"}
          </span>
        </div>
        <button
          ref={closeRef}
          onClick={onClose}
          title="Close (Esc)"
          aria-label="Close projects"
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
          <span aria-hidden>×</span>
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
            <span aria-hidden style={{ fontSize: 30, lineHeight: 1 }}>+</span>
            <span style={{ fontSize: 13 }}>New plan</span>
          </button>

          {items.map((m) => {
            const isCurrent = m.id === currentId;
            return (
              <div
                key={m.id}
                onClick={() => renaming !== m.id && handleOpen(m.id)}
                // A11y: the card was a plain div with an onClick, so opening a
                // project was impossible without a pointer — and this is the
                // gallery, the only way to reach any saved plan. It cannot be
                // a <button> because it contains its own buttons (delete,
                // rename) and a text input, so role="button" plus a key
                // handler is the correct shape here.
                role="button"
                tabIndex={renaming === m.id ? -1 : 0}
                aria-label={`Open ${m.name}${isCurrent ? " (currently open)" : ""}${m.cloudOnly ? " — in cloud, will download first" : ""}${m.liveRoomId ? " — live shared document" : ""}, last edited ${ago(m.updatedAt)}`}
                onKeyDown={(e) => {
                  if (renaming === m.id) return;
                  if (e.key !== "Enter" && e.key !== " ") return;
                  // Only the card itself; a key press inside the delete or
                  // rename button belongs to that button.
                  if (e.target !== e.currentTarget) return;
                  e.preventDefault();
                  void handleOpen(m.id);
                }}
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
                    // Decorative: a snapshot of the 3D view. The card's own
                    // label already names the plan, and describing the picture
                    // would mean describing the model, which this cannot do.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.thumb}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span aria-hidden style={{ fontSize: 30, color: T.textFaint }}>▱</span>
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
                        <span aria-hidden>●</span> LIVE
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(m);
                    }}
                    title="Delete plan"
                    aria-label={`Delete ${m.name}`}
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
                    <span aria-hidden>🗑</span>
                  </button>
                </div>

                {/* meta */}
                <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 3 }}>
                  {renaming === m.id ? (
                    <input
                      autoFocus
                      aria-label={`Rename ${m.name}`}
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
                        aria-label={`Rename ${m.name}`}
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
                        <span aria-hidden>✎</span>
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
