import { ImageResponse } from "next/og";

// Link-preview card for a shared plan (unfurls in chat/email). Branded, no model
// render needed — the funnel win is any rich card vs a bare URL. (A future step
// can draw the actual plan by reading the room's Yjs doc server-side.)
//
// The two `#DF7940` fills below used to be `#0a84ff`, the pre-naming blue
// accent — the one src/brand/tokens.ts's own header comment calls out as
// still needing this exact swap ("Both still carry the pre-naming blue
// accent... which the brand book replaces with copper"). Now COPPER, matching
// the shipped identity; nothing else in the card changed.
export const runtime = "nodejs";
export const alt = "A live shared home design — done.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #17171b 0%, #131316 60%, #0e1420 100%)",
          color: "#f2f2f5",
          padding: 80,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "#DF7940" }} />
          <div style={{ fontSize: 30, color: "#9a9aa3", letterSpacing: 1 }}>done.</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 66, fontWeight: 700, lineHeight: 1.1 }}>A live shared home design</div>
          <div style={{ fontSize: 30, color: "#9a9aa3" }}>Open the link to explore it in 3D — and design your own.</div>
        </div>
        <div style={{ display: "flex" }}>
          <div style={{ background: "#DF7940", color: "#fff", fontSize: 26, fontWeight: 600, padding: "12px 24px", borderRadius: 999 }}>
            ● Live · collaborative
          </div>
        </div>
      </div>
    ),
    size,
  );
}
