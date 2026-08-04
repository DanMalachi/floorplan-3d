"use client";

// Opening (door/window/passage) inspector — PD port of Viewport.tsx's RICH
// OpeningInspector (the one actually reachable through MiniInspector; a
// second, dead copy of this component existed later in the same file with
// no way to ever render — see the P5 deletion pass in Viewport.tsx). Ports
// every door/slide/swing/passage control from that reachable version, PLUS
// mullion (glazing-bar grid) controls for windows: WallMesh/buildJoinery
// already render `Opening.mullions`, but the only UI that ever edited it
// lived in that same dead duplicate, so it was real, geometry-backed
// functionality with literally no way to reach it. Restoring it here is the
// "zero lost controls" bar applied honestly — nothing the schema/geometry
// already supports should stay orphaned without a control.

import { useSceneStore } from "@/store/useSceneStore";
import type { Opening, OpeningType, SlideSpec } from "@/schema/scene";
import { DEFAULT_WINDOW } from "@/schema/constants";
import { pdChip } from "../tokens";
import {
  pdInspectorPanel,
  PdSectionTitle,
  PdHelpText,
  PdNumField,
  PdStepper,
  pdChipFlex,
} from "./panelKit";
import { pdMicroLabel } from "../tokens";

// The sliding presets, as the product thinks of them. Each is just a point in
// the one SlideSpec parameterisation — see buildJoinery.
const SLIDE_PRESETS: { key: string; label: string; title: string; spec: SlideSpec }[] = [
  {
    key: "patio",
    label: "Patio",
    title: "Two glazed panels sliding past each other — the balcony door",
    spec: { style: "bypass", panels: 2, glazed: true, open: 0, side: "end" },
  },
  {
    key: "closet",
    label: "Closet",
    title: "Solid panels sliding past each other — wardrobe bypass doors",
    spec: { style: "bypass", panels: 2, glazed: false, open: 0, side: "end" },
  },
  {
    key: "barn",
    label: "Barn",
    title: "One leaf sliding along the face of the wall",
    spec: { style: "surface", panels: 1, glazed: false, open: 0, side: "end" },
  },
];

const matchesPreset = (s: SlideSpec, p: SlideSpec) =>
  s.style === p.style && s.panels === p.panels && (s.glazed ?? false) === (p.glazed ?? false);

export function OpeningSection({ opening }: { opening: Opening }) {
  const patch = (label: string, p: Partial<Opening>) => {
    const s = useSceneStore.getState();
    s.commitScene(label, {
      ...s.scene,
      openings: s.scene.openings.map((o) => (o.id === opening.id ? { ...o, ...p } : o)),
    });
  };
  // Switching type strips the joinery that no longer applies, so a passage
  // can't keep a stale swing angle or a window a door's slide gear.
  const setType = (type: OpeningType) => {
    if (type === opening.type) return;
    const base = { type, slide: undefined, swingDeg: undefined, hinge: undefined };
    patch(
      type === "passage" ? "Remove door" : `Make ${type}`,
      type === "window"
        ? { ...base, sill: opening.sill > 0 ? opening.sill : DEFAULT_WINDOW.sill, mullions: opening.mullions }
        : { ...base, sill: 0, mullions: undefined },
    );
  };
  const slide = opening.slide;
  const isDoor = opening.type === "door";
  const isWindow = opening.type === "window";

  return (
    <div style={pdInspectorPanel}>
      <PdSectionTitle title={opening.type} meta={`${opening.width.toFixed(2)} × ${opening.height.toFixed(2)} m`} />

      <div style={{ display: "flex", gap: 4 }}>
        {(["door", "passage", "window"] as const).map((t) => (
          <button
            key={t}
            style={pdChip(opening.type === t, pdChipFlex)}
            onClick={() => setType(t)}
            title={t === "passage" ? "Keep the opening, lose the door — an open way through a wall" : undefined}
          >
            {t === "door" ? "🚪 Door" : t === "passage" ? "⌷ Open" : "🪟 Window"}
          </button>
        ))}
      </div>

      {isDoor && (
        <>
          <div style={pdMicroLabel()}>How it opens</div>
          <div style={{ display: "flex", gap: 4 }}>
            <button style={pdChip(!slide, pdChipFlex)} onClick={() => patch("Swing door", { slide: undefined })}>
              ↷ Swing
            </button>
            {SLIDE_PRESETS.map((p) => (
              <button
                key={p.key}
                style={pdChip(!!slide && matchesPreset(slide, p.spec), pdChipFlex)}
                onClick={() =>
                  patch(`${p.label} slider`, {
                    slide: { ...p.spec, open: slide?.open ?? 0, side: slide?.side ?? "end" },
                    swingDeg: undefined,
                    hinge: undefined,
                  })
                }
                title={p.title}
              >
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}

      {isDoor && !slide && (
        <>
          <PdNumField
            label="Swing"
            unit="°"
            value={opening.swingDeg ?? 0}
            onCommit={(v) => patch("Door swing", { swingDeg: Math.min(120, Math.max(0, v)) })}
          />
          <div style={{ display: "flex", gap: 4 }}>
            {(["start", "end"] as const).map((h) => (
              <button key={h} style={pdChip((opening.hinge ?? "start") === h, pdChipFlex)} onClick={() => patch("Door hinge", { hinge: h })}>
                Hinge {h}
              </button>
            ))}
          </div>
        </>
      )}

      {isDoor && slide && (
        <>
          <PdNumField
            label="Open"
            unit="%"
            value={Math.round((slide.open ?? 0) * 100)}
            onCommit={(v) => patch("Slide open", { slide: { ...slide, open: Math.min(1, Math.max(0, v / 100)) } })}
          />
          {slide.style === "bypass" && (
            <PdStepper label="Panels" value={slide.panels} min={2} max={3} onSet={(v) => patch("Slide panels", { slide: { ...slide, panels: v } })} />
          )}
          <div style={{ display: "flex", gap: 4 }}>
            {(["start", "end"] as const).map((sd) => (
              <button
                key={sd}
                style={pdChip((slide.side ?? "end") === sd, pdChipFlex)}
                onClick={() => patch("Slide side", { slide: { ...slide, side: sd } })}
                title="Which jamb the panels stack at"
              >
                Slides {sd}
              </button>
            ))}
          </div>
        </>
      )}

      {opening.type === "passage" && (
        <div style={{ display: "flex", gap: 4 }}>
          {([true, false] as const).map((l) => (
            <button
              key={String(l)}
              style={pdChip((opening.lining ?? true) === l, pdChipFlex)}
              onClick={() => patch("Passage lining", { lining: l })}
              title={l ? "Jamb and head casing — a finished cased opening" : "Bare plaster reveal"}
            >
              {l ? "Cased" : "Bare"}
            </button>
          ))}
        </div>
      )}

      <PdNumField label="Width" value={opening.width} onCommit={(v) => patch("Opening width", { width: Math.max(0.4, v) })} displayScale={100} unit="cm" />
      <PdNumField
        label="Height"
        value={opening.height}
        onCommit={(v) => patch("Opening height", { height: Math.max(0.4, v) })}
        displayScale={100}
        unit="cm"
      />
      {isWindow && (
        <PdNumField label="Sill" value={opening.sill} onCommit={(v) => patch("Opening sill", { sill: Math.max(0, v) })} displayScale={100} unit="cm" />
      )}

      {isWindow && (
        <>
          <div style={pdMicroLabel()}>Glazing bars</div>
          <PdStepper
            label="Columns"
            value={opening.mullions?.cols ?? 2}
            onSet={(n) => patch("Mullion columns", { mullions: { cols: n, rows: opening.mullions?.rows ?? 1 } })}
          />
          <PdStepper
            label="Rows"
            value={opening.mullions?.rows ?? 1}
            onSet={(n) => patch("Mullion rows", { mullions: { cols: opening.mullions?.cols ?? 2, rows: n } })}
          />
        </>
      )}

      <PdHelpText>Drag to slide it along the wall · Delete fills the wall back in.</PdHelpText>
    </div>
  );
}
