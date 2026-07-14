"use client";

// Dev-only secret tool — the "GT Lab". Press Shift+G to summon it, then drag in
// as many ground-truth .json files as you like. Each one is imported as its own
// SAVED project (named after the file) and added to your gallery, so it survives
// closing and reopening — not just a throwaway preview. Your currently-open plan
// is left untouched; opening a GT switches to it like any other project. Gated
// out of production builds.

import { useCallback, useEffect, useRef, useState } from "react";
import { useSceneStore } from "@/store/useSceneStore";
import { importProject, openProject } from "@/store/projectPersistence";
import { gtFileToProject } from "./gtFileToScene";
import { T, glass, chip, microLabel } from "@/ui/tokens";

interface Model {
  name: string; // source file name (de-dupe key)
  projectId: string; // the saved project it became
  stats: string;
}
interface LoadError {
  name: string;
  message: string;
}

const isDev = process.env.NODE_ENV !== "production";

export function GtLab() {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [errors, setErrors] = useState<LoadError[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentProjectId = useSceneStore((s) => s.currentProjectId);

  // Latest models, readable inside async ingest without a stale closure.
  const modelsRef = useRef(models);
  modelsRef.current = models;

  // Secret handshake: Shift+G toggles the Lab (ignored while typing in a field).
  useEffect(() => {
    if (!isDev) return;
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

  if (!isDev) return null;
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
            <div style={{ fontSize: 16, fontWeight: 600, color: T.text }}>
              <span style={{ color: T.warn }}>⚗</span> GT Lab
            </div>
            <div style={{ fontSize: 12, color: T.textDim, marginTop: 3 }}>
              Drag ground-truth <code>.json</code> files here — each is saved as its own project.
            </div>
          </div>
          <button onClick={() => setOpen(false)} style={{ ...chip(false), padding: "3px 9px" }} title="Close (Esc)">
            ✕
          </button>
        </div>

        {/* dropzone */}
        <button
          onClick={() => inputRef.current?.click()}
          style={{
            border: `1.5px dashed ${dragOver ? T.accent : T.panelBorder}`,
            background: dragOver ? T.accentSoft : T.inputBg,
            borderRadius: T.radiusM,
            color: T.textDim,
            padding: "22px 16px",
            cursor: "pointer",
            fontFamily: T.font,
            fontSize: 13,
            transition: `background ${T.dur} ${T.ease}, border-color ${T.dur} ${T.ease}`,
          }}
        >
          <div style={{ fontSize: 22, marginBottom: 6 }}>⇪</div>
          Drop GT files — or click to browse. Drop as many as you like.
        </button>
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
            {models.map((m) => {
              const active = m.projectId === currentProjectId;
              return (
                <button
                  key={m.projectId}
                  onClick={() => void openModel(m)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    textAlign: "left",
                    padding: "8px 12px",
                    borderRadius: T.radiusS,
                    border: `1px solid ${active ? T.accent : T.panelBorder}`,
                    background: active ? T.accentSoft : T.inputBg,
                    color: T.text,
                    cursor: "pointer",
                    fontFamily: T.font,
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {active && <span style={{ color: T.accent }}>● </span>}
                    {m.name.replace(/\.gt\.json$|\.json$/i, "")}
                  </span>
                  <span style={{ fontSize: 11, color: T.textFaint, flexShrink: 0 }}>{m.stats}</span>
                </button>
              );
            })}
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
