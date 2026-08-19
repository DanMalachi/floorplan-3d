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
import {
  effectiveSlide,
  isDoubleDoor,
  leafCount,
  leafWidths,
  takesWindowFinish,
  withLeafWidth,
} from "@/render/doorStyle";
import { useEffect, useState } from "react";
import { loadTambourColors, type TambourColor } from "@/lib/tambourColors";
import { pdChip } from "../tokens";
import {
  pdInspectorPanel,
  PdSectionTitle,
  PdHelpText,
  PdNumField,
  PdStepper,
  PdSwatch,
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

const DOOR_MATERIALS: { key: NonNullable<Opening["doorMaterial"]>; label: string }[] = [
  { key: "painted-white", label: "White" },
  { key: "painted-charcoal", label: "Charcoal" },
  { key: "oak", label: "Oak" },
  { key: "walnut", label: "Walnut" },
];

const WINDOW_FRAME_MATERIALS: { key: NonNullable<Opening["frameMaterial"]>; label: string }[] = [
  { key: "aluminum-matte", label: "Matte" },
  { key: "aluminum-glossy", label: "Glossy" },
  { key: "painted", label: "Painted" },
];

/** Open color tint for a window frame (Dan's ruling: any color, not a
 *  restricted swatch list) — reuses the SAME Tambour catalog wall paint
 *  already loads (`loadTambourColors`, `BottomDock.tsx`'s Paint tab), so
 *  frame tinting shares one palette with wall paint rather than inventing a
 *  second color dataset. "Natural" (no tint) is the first swatch. */
function FrameColorSwatches({ opening, patch }: {
  opening: Opening;
  patch: (label: string, p: Partial<Opening>) => void;
}) {
  const [colors, setColors] = useState<TambourColor[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadTambourColors().then((c) => alive && setColors(c));
    return () => {
      alive = false;
    };
  }, []);
  const active = opening.frameColor ?? null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
      <PdSwatch
        hex={null}
        active={active === null}
        title="Natural — the material's own color"
        onClick={() => patch("Frame colour: natural", { frameColor: undefined })}
        size={18}
      />
      {(colors ?? []).slice(0, 20).map((c) => (
        <PdSwatch
          key={c.code}
          hex={c.hex}
          active={active === c.hex}
          title={`${c.code} · ${c.nameEn}`}
          onClick={() => patch(`Frame colour: ${c.nameEn}`, { frameColor: c.hex })}
          size={18}
        />
      ))}
    </div>
  );
}

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
    const base = {
      type,
      slide: undefined,
      swingDeg: undefined,
      hinge: undefined,
      double: undefined,
      leafSplit: undefined,
    };
    patch(
      type === "passage" ? "Remove door" : `Make ${type}`,
      type === "window"
        ? { ...base, sill: opening.sill > 0 ? opening.sill : DEFAULT_WINDOW.sill, mullions: opening.mullions }
        : { ...base, sill: 0, mullions: undefined },
    );
  };
  // The slide gear this door RENDERS with, which for a wide unstyled door is
  // the derived patio slider — so the Patio chip lights up for a door that got
  // there by width alone, and its controls are reachable, instead of the panel
  // claiming "Swing" while the viewport shows glazed panels.
  const slide = effectiveSlide(opening);
  const isDoor = opening.type === "door";
  const isWindow = opening.type === "window";
  const double = isDoubleDoor(opening);
  // A patio door's finish is a window's, so it gets the window controls.
  const glazedDoor = isDoor && takesWindowFinish(opening);
  const leaves = leafCount(opening);
  const widths = leafWidths(opening.width, leaves, opening.leafSplit);
  const setLeafWidth = (k: number, v: number) =>
    patch("Leaf width", {
      leafSplit: withLeafWidth(opening.leafSplit, leaves, opening.width, k, v),
    });

  return (
    <div style={pdInspectorPanel}>
      <PdSectionTitle
        title={double ? "Double door" : glazedDoor ? "Patio door" : opening.type}
        meta={`${opening.width.toFixed(2)} × ${opening.height.toFixed(2)} m`}
      />

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
          {/* A patio door has no solid leaf to finish — its sashes are glass in
              a frame, so it takes the window materials further down instead. */}
          {!glazedDoor && (
            <>
              <div style={pdMicroLabel()}>Material</div>
              <div style={{ display: "flex", gap: 4 }}>
                {DOOR_MATERIALS.map((m) => (
                  <button
                    key={m.key}
                    style={pdChip((opening.doorMaterial ?? "painted-white") === m.key, pdChipFlex)}
                    onClick={() => patch(`Door material: ${m.label}`, { doorMaterial: m.key })}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </>
          )}
          <div style={pdMicroLabel()}>How it opens</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {/* Writing swingDeg (not just clearing `slide`) is what makes this
                an EXPLICIT choice — otherwise a door past PATIO_MIN_WIDTH
                would fall straight back to the derived patio slider and the
                chip would refuse to stick. */}
            <button
              style={pdChip(!slide && !double, pdChipFlex)}
              onClick={() =>
                patch("Swing door", {
                  slide: undefined,
                  double: undefined,
                  swingDeg: opening.swingDeg ?? 0,
                  leafSplit: undefined,
                })
              }
              title="One hinged leaf"
            >
              ↷ Swing
            </button>
            <button
              style={pdChip(double, pdChipFlex)}
              onClick={() =>
                patch("Double doors", {
                  double: true,
                  slide: undefined,
                  hinge: undefined,
                  swingDeg: opening.swingDeg ?? 0,
                  leafSplit: undefined,
                })
              }
              title="A pair of hinged leaves meeting in the middle — French doors"
            >
              ⁘ Double
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
                    double: undefined,
                    leafSplit: undefined,
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
          {/* A double door has no hinge to choose — each leaf hangs on its own
              jamb, and both swing the same way. */}
          {!double && (
            <div style={{ display: "flex", gap: 4 }}>
              {(["start", "end"] as const).map((h) => (
                <button key={h} style={pdChip((opening.hinge ?? "start") === h, pdChipFlex)} onClick={() => patch("Door hinge", { hinge: h })}>
                  Hinge {h}
                </button>
              ))}
            </div>
          )}
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

      {/* Per-leaf widths. Typing one width redistributes what's left across
          the other leaves, so the pair always still fills the opening — an
          uneven double (a 90 cm active leaf beside a 70 cm one) or a slider
          with one wide panel and one narrow fixed light. */}
      {isDoor && leaves > 1 && (
        <>
          <div style={pdMicroLabel()}>{slide ? "Panel widths" : "Leaf widths"}</div>
          {widths.map((w, k) => (
            <PdNumField
              key={k}
              label={`${slide ? "Panel" : "Leaf"} ${k + 1}`}
              value={w}
              onCommit={(v) => setLeafWidth(k, v)}
              displayScale={100}
              unit="cm"
            />
          ))}
          {opening.leafSplit && (
            <button
              style={pdChip(false, { alignSelf: "flex-start", padding: "3px 8px", fontSize: 11 })}
              onClick={() => patch("Even leaves", { leafSplit: undefined })}
            >
              Even them up
            </button>
          )}
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

      {/* Frame finish — windows AND patio doors. A glazed slider is a window's
          construction (frame, sash, pane), so it takes the window materials
          rather than the door ones. The colour swatches below retint every
          window and patio door at once: one house, one glazing colour. */}
      {(isWindow || glazedDoor) && (
        <>
          <div style={pdMicroLabel()}>Frame material</div>
          <div style={{ display: "flex", gap: 4 }}>
            {WINDOW_FRAME_MATERIALS.map((m) => (
              <button
                key={m.key}
                style={pdChip((opening.frameMaterial ?? "aluminum-matte") === m.key, pdChipFlex)}
                onClick={() => patch(`Frame material: ${m.label}`, { frameMaterial: m.key })}
              >
                {m.label}
              </button>
            ))}
          </div>
          <FrameColorSwatches opening={opening} patch={patch} />
        </>
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
