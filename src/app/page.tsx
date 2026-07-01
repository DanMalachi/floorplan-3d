import { Viewport } from "@/viewport3d/Viewport";
import { TracePanel } from "@/trace2d/TracePanel";

export default function Home() {
  return (
    <main style={{ display: "flex", height: "100vh", width: "100vw" }}>
      <section style={{ flex: 1, minWidth: 0, borderRight: "1px solid #333" }}>
        <TracePanel />
      </section>
      <section style={{ flex: 1, minWidth: 0 }}>
        <Viewport />
      </section>
    </main>
  );
}
