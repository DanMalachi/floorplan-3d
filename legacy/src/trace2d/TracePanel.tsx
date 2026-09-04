"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSceneStore } from "@/store/useSceneStore";
import { PD, pdGlass, pdHoverTransition } from "@/ui/planDock/tokens";
import { useHover } from "@/ui/planDock/useHover";
import { PlanMapIcon } from "@/ui/planDock/icons";
import { TraceRail } from "./TraceRail";

// Konva touches `window`/`canvas`, so the Stage must never render on the server.
const TraceCanvas = dynamic(() => import("./TraceCanvas"), {
  ssr: false,
  loading: () => (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: PD.textTertiary }}>
      Loading canvas…
    </div>
  ),
});

/** Empty state: the plan starts with a drop, not a toolbar. */
function DropZone() {
  const importBusy = useSceneStore((s) => s.importBusy);
  const importMsg = useSceneStore((s) => s.importMsg);
  const importStatus = useSceneStore((s) => s.importStatus);
  const importPlanFile = useSceneStore((s) => s.importPlanFile);
  const [over, setOver] = useState(false);
  const [hov, hoverBind] = useHover();
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
        {...hoverBind}
        style={{
          ...pdGlass({ borderRadius: PD.radiusL }),
          borderStyle: over ? "dashed" : "solid",
          borderColor: over || hov ? PD.accent : PD.hairline,
          padding: "44px 56px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          cursor: "pointer",
          transition: `${pdHoverTransition(hov)}, transform ${PD.dur} ${PD.ease}`,
          transform: over ? "scale(1.02)" : hov ? "scale(1.01)" : "none",
        }}
      >
        {/* The empty state's one illustration, at 34px rather than the 16px the
            icon set is drawn for. The stroke is set locally because the 24px
            viewBox scales UP by 34/24, which would render the shared 1.6 at an
            apparent ~2.3px and read as chunky beside the 15px type; 1.4 lands
            at ~2.0px, which has presence at this size without going heavy. */}
        <PlanMapIcon size={34} strokeWidth={1.4} style={{ color: hov ? PD.textPrimary : PD.textSecondary }} />
        <span style={{ fontSize: 15, fontWeight: 600, color: PD.textPrimary }}>
          {importBusy ? "Importing…" : "Drop a floor plan"}
        </span>
        <span style={{ fontSize: 12, color: PD.textSecondary }}>
          image, PDF, or CAD (DXF/DWG) — or click to browse
        </span>
        {importMsg && importStatus !== "ok" && (
          <span style={{ fontSize: 12, color: PD.warnText, maxWidth: 360 }}>{importMsg}</span>
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
