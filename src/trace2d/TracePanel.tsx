"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSceneStore } from "@/store/useSceneStore";
import { T, glass } from "@/ui/tokens";
import { TraceRail } from "./TraceRail";

// Konva touches `window`/`canvas`, so the Stage must never render on the server.
const TraceCanvas = dynamic(() => import("./TraceCanvas"), {
  ssr: false,
  loading: () => (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: T.textFaint }}>
      Loading canvas…
    </div>
  ),
});

/** Empty state: the plan starts with a drop, not a toolbar. */
function DropZone() {
  const importBusy = useSceneStore((s) => s.importBusy);
  const importMsg = useSceneStore((s) => s.importMsg);
  const importPlanFile = useSceneStore((s) => s.importPlanFile);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) importPlanFile(f);
      }}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10,
      }}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp,application/pdf,.pdf,.dxf,.dwg"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importPlanFile(f);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={importBusy}
        style={{
          ...glass({ borderRadius: T.radiusL }),
          borderStyle: over ? "dashed" : "solid",
          borderColor: over ? T.accent : T.panelBorder,
          padding: "44px 56px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          cursor: "pointer",
          transition: `border-color ${T.dur} ${T.ease}, transform ${T.dur} ${T.ease}`,
          transform: over ? "scale(1.02)" : "none",
        }}
      >
        <span style={{ fontSize: 34 }}>🗺</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>
          {importBusy ? "Importing…" : "Drop a floor plan"}
        </span>
        <span style={{ fontSize: 12, color: T.textDim }}>
          image, PDF, or CAD (DXF/DWG) — or click to browse
        </span>
        {importMsg && !importMsg.startsWith("✓") && (
          <span style={{ fontSize: 12, color: T.warn, maxWidth: 360 }}>{importMsg}</span>
        )}
      </button>
    </div>
  );
}

export function TracePanel() {
  const image = useSceneStore((s) => s.image);
  return (
    <div style={{ position: "relative", height: "100%", minWidth: 0, background: "#131316" }}>
      <div style={{ position: "absolute", inset: 0 }}>
        <TraceCanvas />
      </div>
      {image ? <TraceRail /> : <DropZone />}
    </div>
  );
}
