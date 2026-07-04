"use client";

import dynamic from "next/dynamic";
import { Toolbar } from "./Toolbar";

// Konva touches `window`/`canvas`, so the Stage must never render on the server.
const TraceCanvas = dynamic(() => import("./TraceCanvas"), {
  ssr: false,
  loading: () => (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>
      Loading canvas…
    </div>
  ),
});

export function TracePanel() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0, background: "#131316" }}>
      <Toolbar />
      <div style={{ flex: 1, minHeight: 0 }}>
        <TraceCanvas />
      </div>
    </div>
  );
}
