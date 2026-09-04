"use client";

// Secret tool — the "GT Lab". Press Shift+G to summon it, then drag in as many
// ground-truth .json files as you like. Each one is imported as its own SAVED
// project (named after the file) and added to your gallery, so it survives closing
// and reopening — not just a throwaway preview. Your currently-open plan is left
// untouched; opening a GT switches to it like any other project.
//
// This is fully client-side (it reads the files YOU drop — it never touches the
// repo), so it ships in production too. That's deliberate: it's how you import GT
// on the deployed app the same way as on localhost. The repo-reading `?gt=` /
// /api/dev-gt path stays dev-only; only this drag-and-drop importer is enabled.

import { useCallback, useEffect, useRef, useState } from "react";
import { useSceneStore } from "@/store/useSceneStore";
import { importProject, openProject } from "@/store/projectPersistence";
import { gtFileToProject } from "./gtFileToScene";
import { T, glass, chip, microLabel } from "@/ui/tokens";
import { tChipHover, useHover } from "@/ui/hoverT";
import { CloseIcon, FlaskIcon, UploadIcon } from "@/ui/planDock/icons";

interface Model {
  name: string; // source file name (de-dupe key)
  projectId: string; // the saved project it became
  stats: string;
}
interface LoadError {
  name: string;
  message: string;
}

export function GtLab() {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [errors, setErrors] = useState<LoadError[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentProjectId = useSceneStore((s) => s.currentProjectId);

  // Latest models, readable inside async ingest without a stale closure.
  const modelsRef = useRef(models);
  // The "latest ref" idiom: assigning during render is the point — it keeps the
  // ref current for async work without re-subscribing. Deliberate, not a slip.
  // eslint-disable-next-line react-hooks/refs
  modelsRef.current = models;

  // Secret handshake: Shift+G toggles the Lab (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.shiftKey && (e.key === "G" || e.key === "g")) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const openModel = useCallback(async (m: Model) => {
    await openProject(m.projectId); // saves the current project first, then switches
    setOpen(false);
  }, []);

  const ingest = useCallback(
    async (files: FileList | File[]) => {
      const alreadyImported = new Set(modelsRef.current.map((m) => m.name));
      const created: Model[] = [];
      const errs: LoadError[] = [];
      for (const file of Array.from(files)) {
        if (alreadyImported.has(file.name)) continue; // don't create a duplicate project
        try {
          const { name, stats, overrides } = gtFileToProject(JSON.parse(await file.text()), file.name);
          const meta = await importProject(name, overrides);
          created.push({ name: file.name, projectId: meta.id, stats });
          alreadyImported.add(file.name);
        } catch (e) {
          errs.push({ name: file.name, message: e instanceof Error ? e.message : String(e) });
        }
      }
      if (created.length) setModels((prev) => [...prev, ...created]);
      setErrors(errs);
      if (created[0]) await openModel(created[0]); // auto-open the first import
    },
    [openModel],
  );

  if (!open) return null;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length) void ingest(e.dataTransfer.files);
      }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 50,
        background: "rgba(6,6,8,0.6)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: T.font,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false); // click backdrop to close
      }}
    >
      <div style={glass({ width: 560, maxWidth: "92vw", maxHeight: "86vh", padding: 20, display: "flex", flexDirection: "column", gap: 14, borderRadius: T.radiusL })}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 16, fontWeight: 600, color: T.text }}>
              <span style={{ lineHeight: 0, color: T.warn }}>
                <FlaskIcon size={16} />
              </span>
              GT Lab
            </div>
            <div style={{ fontSize: 12, color: T.textDim, marginTop: 3 }}>
              Drag ground-truth <code>.json</code> files here — each is saved as its own project.
            </div>
          </div>
          <LabChip
            onClick={() => setOpen(false)}
            title="Close (Esc)"
            extra={{ padding: "5px 9px", display: "flex", alignItems: "center" }}
          >
            <CloseIcon size={13} />
          </LabChip>
        </div>

        {/* dropzone */}
        <DropZoneButton dragOver={dragOver} onClick={() => inputRef.current?.click()} />
        <input
          ref={inputRef}
          type="file"
          accept=".json,application/json"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void ingest(e.target.files);
            e.target.value = "";
          }}
        />

        {/* imported this session */}
        {models.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
            <div style={microLabel()}>{models.length} imported · saved to your projects</div>
            {models.map((m) => (
              <ModelRow
                key={m.projectId}
                active={m.projectId === currentProjectId}
                name={m.name.replace(/\.gt\.json$|\.json$/i, "")}
                stats={m.stats}
                onClick={() => void openModel(m)}
              />
            ))}
          </div>
        )}

        {/* parse errors */}
        {errors.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={microLabel(T.danger)}>couldn’t open</div>
            {errors.map((er) => (
              <div key={er.name} style={{ fontSize: 11.5, color: T.danger }}>
                <b>{er.name}</b> — {er.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Hover-aware pieces ──────────────────────────────────────────────────────
// Dev-only chrome, but it shares the app's tokens, so it follows the same rule:
// each of these is its own component only so it can hold a `useHover` flag.

function LabChip({
  onClick,
  title,
  extra,
  children,
}: {
  onClick: () => void;
  title?: string;
  extra?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [hov, bind] = useHover();
  return (
    <button onClick={onClick} title={title} {...bind} style={chip(false, { ...extra, ...tChipHover(hov) })}>
      {children}
    </button>
  );
}

function DropZoneButton({ dragOver, onClick }: { dragOver: boolean; onClick: () => void }) {
  const [hov, bind] = useHover();
  return (
    <button
      onClick={onClick}
      {...bind}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        border: `1.5px dashed ${dragOver || hov ? T.accent : T.panelBorder}`,
        background: dragOver ? T.accentSoft : hov ? "rgba(255,255,255,0.09)" : T.inputBg,
        borderRadius: T.radiusM,
        color: hov ? T.text : T.textDim,
        padding: "22px 16px",
        cursor: "pointer",
        fontFamily: T.font,
        fontSize: 13,
        transition: `background ${T.dur} ${T.ease}, border-color ${T.dur} ${T.ease}, color ${T.dur} ${T.ease}`,
      }}
    >
      <UploadIcon size={22} strokeWidth={1.4} />
      Drop GT files — or click to browse. Drop as many as you like.
    </button>
  );
}

/** One imported GT. The open one used to be marked with a `● ` in the label; it
 *  is a drawn pip now, so the name stays a plain string. */
function ModelRow({
  active,
  name,
  stats,
  onClick,
}: {
  active: boolean;
  name: string;
  stats: string;
  onClick: () => void;
}) {
  const [hov, bind] = useHover();
  return (
    <button
      onClick={onClick}
      {...bind}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        textAlign: "left",
        padding: "8px 12px",
        borderRadius: T.radiusS,
        border: `1px solid ${active ? T.accent : hov ? "rgba(255,255,255,0.18)" : T.panelBorder}`,
        background: active ? T.accentSoft : hov ? "rgba(255,255,255,0.11)" : T.inputBg,
        color: T.text,
        cursor: "pointer",
        fontFamily: T.font,
        transition: `background ${T.dur} ${T.ease}, border-color ${T.dur} ${T.ease}`,
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {active && (
          <span
            aria-hidden
            style={{ width: 6, height: 6, borderRadius: 999, background: T.accent, flex: "0 0 auto" }}
          />
        )}
        {name}
      </span>
      <span style={{ fontSize: 11, color: T.textFaint, flexShrink: 0 }}>{stats}</span>
    </button>
  );
}
