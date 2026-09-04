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
import { PD, pdGhostBtn, pdHoverTransition, pdMicroLabel } from "@/ui/planDock/tokens";
import { useHover } from "@/ui/planDock/useHover";
import { Tooltip } from "@/ui/planDock/Tooltip";
import { CloseIcon, PencilIcon, PlanMapIcon, PlusIcon, TrashIcon } from "@/ui/planDock/icons";
import { Wordmark } from "@/brand/Wordmark";
import { landingEnabled } from "@/lib/featureFlags";

/** The gallery's card surface.
 *
 *  Deliberately NOT `pdGlass()`. That recipe is 38% opacity, which is right for
 *  a small panel floating over the 3D model and wrong here: this is a
 *  full-screen sheet, the cards carry plan names and timestamps, and at 38% the
 *  scrim and the editor behind it read through the text. `PD.panelBg` (72%) is
 *  the same design language at the weight this surface needs — see the surface
 *  note in planDock/tokens.ts. */
const cardSurface = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: PD.panelBg,
  backdropFilter: PD.glassBlur,
  WebkitBackdropFilter: PD.glassBlur,
  border: `1px solid ${PD.hairline}`,
  borderRadius: PD.radiusL,
  boxShadow: PD.glassShadow,
  color: PD.textPrimary,
  fontFamily: PD.fontUi,
  ...extra,
});

/** The green "live" pip on a card badge. A real circle, not the `●` character
 *  it replaces: a text bullet reflows with the font and never matches the drawn
 *  icons beside it, and this is a status light rather than an icon. */
function Pip({ size = 7, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, borderRadius: 999, background: color, flex: "0 0 auto" }}
    />
  );
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
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(9,9,12,0.72)",
        backdropFilter: "blur(24px) saturate(1.3)",
        WebkitBackdropFilter: "blur(24px) saturate(1.3)",
        display: "flex",
        flexDirection: "column",
        fontFamily: PD.fontUi,
      }}
    >
      {/* header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 28px",
          borderBottom: `1px solid ${PD.hairline}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* See BackToSite at the bottom of this file for why this is a plain
              <a> and why it is hidden while landingEnabled is off. */}
          {landingEnabled ? (
            <BackToSite />
          ) : (
            <Wordmark size={20} style={{ color: PD.textPrimary }} />
          )}
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontSize: 19, fontWeight: 600, color: PD.textPrimary }}>Projects</span>
            <span style={{ fontSize: 13, color: PD.textTertiary }}>
              {items.length} {items.length === 1 ? "plan" : "plans"}
            </span>
          </div>
        </div>
        <CloseButton onClose={onClose} />
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
          <NewPlanTile onClick={handleNew} />

          {items.map((m) => {
            const isCurrent = m.id === currentId;
            return (
              <ProjectCard
                key={m.id}
                isCurrent={isCurrent}
                onClick={() => renaming !== m.id && handleOpen(m.id)}
              >
                {/* thumbnail */}
                <div
                  style={{
                    position: "relative",
                    aspectRatio: "4 / 3",
                    background: PD.canvas,
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
                    // No snapshot yet (never opened on this computer). The plan
                    // glyph, not the `▱` character it replaces.
                    <PlanMapIcon size={30} strokeWidth={1.35} style={{ color: PD.textTertiary }} />
                  )}
                  <div style={{ position: "absolute", top: 8, left: 8, display: "flex", gap: 6 }}>
                    {isCurrent && (
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: 999,
                          background: PD.accent,
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
                      // `placement="bottom"`: the badges sit at the top of the
                      // card, inside the gallery's own scroll container, so a
                      // tooltip above them is clipped on the first row.
                      <Tooltip
                        label="Saved to your account — click to bring it onto this computer"
                        placement="bottom"
                      >
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: 999,
                            background: PD.hairline,
                            color: PD.textPrimary,
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: 0.4,
                          }}
                        >
                          {busyId === m.id ? "DOWNLOADING…" : "IN CLOUD"}
                        </span>
                      </Tooltip>
                    )}
                    {m.liveRoomId && (
                      <Tooltip label="Live shared document — opens into its room" placement="bottom">
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: 999,
                            background: PD.ok,
                            color: "#fff",
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: 0.4,
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Pip color="#fff" size={6} /> LIVE
                        </span>
                      </Tooltip>
                    )}
                  </div>
                  <DeleteButton
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(m);
                    }}
                  />
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
                        background: PD.inputBg,
                        border: `1px solid ${PD.accent}`,
                        borderRadius: PD.radiusS,
                        color: PD.textPrimary,
                        padding: "3px 6px",
                        fontSize: 13,
                        fontFamily: PD.fontUi,
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
                          color: PD.textPrimary,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {m.name}
                      </span>
                      <RenameButton
                        onClick={(e) => {
                          e.stopPropagation();
                          startRename(m);
                        }}
                      />
                    </div>
                  )}
                  <span style={pdMicroLabel(PD.textTertiary)}>{ago(m.updatedAt)}</span>
                </div>
              </ProjectCard>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Hover-aware pieces ──────────────────────────────────────────────────────
// The gallery is the app's front door and had no hover feedback anywhere: not
// on the cards, not on their rename/delete buttons, not on Close. Each of these
// is its own component purely so it can hold a `useHover` flag — the cards are
// rendered in a loop, and a hook cannot be called inside one.

/** Close (Esc). `placement="bottom"` — it lives in the sheet's top bar, where a
 *  tooltip above it would sit off the top of the window. */
function CloseButton({ onClose }: { onClose: () => void }) {
  const [hov, bind] = useHover();
  return (
    <Tooltip label="Close (Esc)" placement="bottom">
      <button
        onClick={onClose}
        aria-label="Close projects"
        {...bind}
        style={{
          border: `1px solid ${hov ? PD.surfaceMutedHover : PD.hairline}`,
          background: hov ? PD.surfaceMutedHover : PD.inputBg,
          color: hov ? PD.textPrimary : PD.textSecondary,
          cursor: "pointer",
          width: 30,
          height: 30,
          borderRadius: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: pdHoverTransition(hov),
        }}
      >
        <CloseIcon size={15} />
      </button>
    </Tooltip>
  );
}

/** The dashed "New plan" tile. It already declared a border-color/color
 *  transition and had nothing to trigger it. */
function NewPlanTile({ onClick }: { onClick: () => void }) {
  const [hov, bind] = useHover();
  return (
    <button
      onClick={onClick}
      {...bind}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        aspectRatio: "1 / 1",
        border: `1.5px dashed ${hov ? PD.accent : PD.hairline}`,
        borderRadius: PD.radiusL,
        background: hov ? PD.surfaceMuted : "transparent",
        color: hov ? PD.textPrimary : PD.textSecondary,
        cursor: "pointer",
        fontFamily: PD.fontUi,
        transition: pdHoverTransition(hov),
      }}
    >
      <PlusIcon size={28} strokeWidth={1.4} />
      <span style={{ fontSize: 13 }}>New plan</span>
    </button>
  );
}

/** A project card. The whole tile is the click target, so the whole tile is
 *  what has to answer the cursor. */
function ProjectCard({
  isCurrent,
  onClick,
  children,
}: {
  isCurrent: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [hov, bind] = useHover();
  return (
    <div
      onClick={onClick}
      {...bind}
      style={{
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        transition: `${pdHoverTransition(hov)}, transform ${PD.dur} ${PD.ease}`,
        transform: hov ? "translateY(-2px)" : "none",
        ...cardSurface({
          overflow: "hidden",
          border: `1px solid ${isCurrent ? PD.accent : hov ? PD.surfaceMutedHover : PD.hairline}`,
          boxShadow: hov ? "0 16px 40px oklch(0 0 0 / 0.45)" : PD.glassShadow,
        }),
      }}
    >
      {children}
    </div>
  );
}

/** Delete, over the thumbnail. Red on hover — it is the one destructive
 *  control in the gallery and should say so before it is clicked.
 *
 *  The absolute positioning lives on the WRAPPER, not the button: `Tooltip`
 *  renders a `position: relative` span around its child, so leaving `top/right`
 *  on the button would anchor it to that span instead of to the thumbnail. */
function DeleteButton({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  const [hov, bind] = useHover();
  return (
    <div style={{ position: "absolute", top: 8, right: 8 }}>
      <Tooltip label="Delete plan" placement="bottom">
        <button
          onClick={onClick}
          aria-label="Delete plan"
          {...bind}
          style={{
            width: 24,
            height: 24,
            borderRadius: 999,
            border: "none",
            background: hov ? PD.danger : "oklch(0 0 0 / 0.5)",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            transition: pdHoverTransition(hov),
          }}
        >
          <TrashIcon size={13} />
        </button>
      </Tooltip>
    </div>
  );
}

/** Rename, beside the plan's name. */
function RenameButton({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  const [hov, bind] = useHover();
  return (
    <Tooltip label="Rename">
      <button
        onClick={onClick}
        aria-label="Rename plan"
        {...bind}
        style={pdGhostBtn(hov, {
          justifyContent: "center",
          padding: 3,
          flexShrink: 0,
          color: hov ? PD.textPrimary : PD.textTertiary,
        })}
      >
        <PencilIcon size={13} />
      </button>
    </Tooltip>
  );
}

/** The only way back to the marketing site from inside the editor.
 *
 *  A plain `<a>`, not next/link: a client-side nav would unmount the editor
 *  without firing pagehide, and autosave is debounced
 *  (src/store/projectPersistence.ts:40/:387), so the last edits would never
 *  reach IndexedDB. That is also why the Next rule below is disabled for this
 *  one line — leaving the editor is exactly the case where a full document load
 *  is the point, not an oversight.
 *
 *  Rendered only while `landingEnabled` is on: with the flag off, "/" just
 *  redirects straight back to /design (src/app/(marketing)/layout.tsx:32) and a
 *  link here would only bounce. */
function BackToSite() {
  const [hov, bind] = useHover();
  return (
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a
      href="/"
      aria-label="done. home"
      {...bind}
      style={{ display: "flex", flexDirection: "column", gap: 2, textDecoration: "none" }}
    >
      <Wordmark size={20} style={{ color: PD.textPrimary }} />
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: hov ? PD.textPrimary : PD.textTertiary,
          transition: pdHoverTransition(hov),
        }}
      >
        back to site
      </span>
    </a>
  );
}
