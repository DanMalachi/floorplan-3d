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

import type { ComponentType } from "react";
import { useSceneStore } from "@/store/useSceneStore";
import type { Opening, OpeningType, SlideSpec } from "@/schema/scene";
import { DEFAULT_WINDOW } from "@/schema/constants";
import {
  effectiveSlide,
  isDoubleDoor,
  leafCount,
  leafWidths,
  openingDisplayName,
  takesWindowFinish,
  withLeafWidth,
} from "@/render/doorStyle";
import { frameFinishOf, type FrameFinish } from "@/render/frameFinish";
import { DoorIcon, PassageIcon, WindowIcon, PaintIcon } from "../icons";
import {
  pdInspectorPanel,
  PdSectionTitle,
  PdHelpText,
  PdNumField,
  PdStepper,
  PdSwatch,
  PdChip,
  PdChipLabel,
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

/** The three types this panel can switch between, as the user picks them.
 *
 *  "Door / Patio", not "Door": `effectiveSlide()` turns any unstyled door at or
 *  past PATIO_MIN_WIDTH into a glazed patio slider, derived from width alone —
 *  so this one chip genuinely places either, and the old bare "Door" was the
 *  single place the vocabulary misled. (The *element's* own name is contextual
 *  and comes from `openingDisplayName`; this is the name of the TYPE.)
 *
 *  "Passage", not "Open": the Build toolbar has always called this type
 *  Passage, and the tooltip below already reads "an open way through a wall".
 *  Two names for one type was a slip, not a distinction. */
const OPENING_TYPES: {
  type: OpeningType;
  label: string;
  Icon: ComponentType<{ size?: number }>;
  title?: string;
}[] = [
  { type: "door", label: "Door / Patio", Icon: DoorIcon },
  {
    type: "passage",
    label: "Passage",
    Icon: PassageIcon,
    title: "Keep the opening, lose the door — an open way through a wall",
  },
  { type: "window", label: "Window", Icon: WindowIcon },
];

const matchesPreset = (s: SlideSpec, p: SlideSpec) =>
  s.style === p.style && s.panels === p.panels && (s.glazed ?? false) === (p.glazed ?? false);

const DOOR_MATERIALS: { key: NonNullable<Opening["doorMaterial"]>; label: string }[] = [
  { key: "painted-white", label: "White" },
  { key: "painted-charcoal", label: "Charcoal" },
  { key: "oak", label: "Oak" },
  { key: "walnut", label: "Walnut" },
];

// Two finishes, not three: "Painted" was tinted matte under another name, so
// it offered a choice that changed nothing (it survives in the schema for
// saved projects — see `frameFinishOf`). Colour is orthogonal to both and
// comes from the Decorate palette. Like colour, the finish is whole-house.
const WINDOW_FRAME_MATERIALS: { key: FrameFinish; label: string; title: string }[] = [
  { key: "matte", label: "Matte", title: "Powder-coated — fine grain, almost no reflection. Applies to every window and patio door." },
  { key: "glossy", label: "Glossy", title: "Polished anodised aluminium — sharp reflections. Applies to every window and patio door." },
];

/** The frame's current colour, plus the one button that changes it.
 *
 *  The colour list itself lives in the Decorate dock's Paint tab, not here.
 *  Twenty swatches crammed into a 190 px inspector column was the whole reason
 *  this panel read as cluttered, and the dock already has a full, grouped,
 *  scrollable palette built for exactly this. "Paint" arms the frame brush and
 *  opens that tab, so the same colours that paint walls also paint frames —
 *  and every colour in the catalog is reachable, not the first twenty. */
function FramePaintRow({ opening }: { opening: Opening }) {
  const armed = useSceneStore((s) => s.brush?.kind === "frame");
  const openPalette = () => {
    const s = useSceneStore.getState();
    // Order matters: requestDock switches to Decorate, and switching app mode
    // clears the brush — arming first would arm it and immediately drop it.
    s.requestDock("paint");
    useSceneStore.getState().setBrush({ kind: "frame", hex: opening.frameColor ?? null });
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <PdSwatch
        hex={opening.frameColor ?? null}
        title={opening.frameColor ?? "Natural — the finish's own colour"}
        onClick={openPalette}
      />
      <PdChip
        active={armed}
        extra={{ flex: 1, textAlign: "center" }}
        onClick={openPalette}
        title="Pick a colour in the Decorate palette — it applies to every window and patio door"
      >
        {armed ? "Picking…" : <PdChipLabel icon={<PaintIcon size={13} />}>Paint</PdChipLabel>}
      </PdChip>
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
    const fields: Partial<Opening> =
      type === "window"
        ? { ...base, sill: opening.sill > 0 ? opening.sill : DEFAULT_WINDOW.sill, mullions: opening.mullions }
        : { ...base, sill: 0, mullions: undefined };
    // Name the RESULT, never the enum. `Make ${type}` printed the stored
    // lowercase value, which for a wide door is a lie — clearing the style
    // fields hands it straight back to the width rule, so what you actually
    // get is a patio slider. Lower-cased mid-sentence, matching WallSection's
    // own `Make ${KIND_LABEL[next].toLowerCase()}`.
    patch(
      // "Remove door", not "Remove opening": switching to `passage` KEEPS the
      // opening and takes the leaf out of it — which is what the chip's own
      // tooltip says ("Keep the opening, lose the door"). This is the case the
      // naming rule reserves for the word "door", because a door leaf is
      // exactly what is being removed.
      type === "passage" ? "Remove door" : `Make ${openingDisplayName({ ...opening, ...fields }).toLowerCase()}`,
      fields,
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
      {/* One name for this element, shared with the 3D selection badge — the
          two used to disagree, and the fallthrough here printed the raw
          lowercase enum. */}
      <PdSectionTitle
        title={openingDisplayName(opening)}
        meta={`${opening.width.toFixed(2)} × ${opening.height.toFixed(2)} m`}
      />

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {OPENING_TYPES.map(({ type, label, Icon, title }) => (
          <PdChip
            key={type}
            active={opening.type === type}
            extra={pdChipFlex}
            onClick={() => setType(type)}
            title={title}
          >
            <PdChipLabel icon={<Icon size={13} />}>{label}</PdChipLabel>
          </PdChip>
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
                  <PdChip
                    key={m.key}
                    active={(opening.doorMaterial ?? "painted-white") === m.key}
                    extra={pdChipFlex}
                    onClick={() => patch(`Door material: ${m.label}`, { doorMaterial: m.key })}
                  >
                    {m.label}
                  </PdChip>
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
            <PdChip
              active={!slide && !double}
              extra={pdChipFlex}
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
            </PdChip>
            <PdChip
              active={double}
              extra={pdChipFlex}
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
            </PdChip>
            {SLIDE_PRESETS.map((p) => (
              <PdChip
                key={p.key}
                active={!!slide && matchesPreset(slide, p.spec)}
                extra={pdChipFlex}
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
              </PdChip>
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
                <PdChip key={h} active={(opening.hinge ?? "start") === h} extra={pdChipFlex} onClick={() => patch("Door hinge", { hinge: h })}>
                  Hinge {h}
                </PdChip>
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
              <PdChip
                key={sd}
                active={(slide.side ?? "end") === sd}
                extra={pdChipFlex}
                onClick={() => patch("Slide side", { slide: { ...slide, side: sd } })}
                title="Which jamb the panels stack at"
              >
                Slides {sd}
              </PdChip>
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
            <PdChip
              extra={{ alignSelf: "flex-start", padding: "3px 8px", fontSize: 11 }}
              onClick={() => patch("Even leaves", { leafSplit: undefined })}
            >
              Even them up
            </PdChip>
          )}
        </>
      )}

      {opening.type === "passage" && (
        <div style={{ display: "flex", gap: 4 }}>
          {([true, false] as const).map((l) => (
            <PdChip
              key={String(l)}
              active={(opening.lining ?? true) === l}
              extra={pdChipFlex}
              onClick={() => patch("Passage lining", { lining: l })}
              title={l ? "Jamb and head casing — a finished cased opening" : "Bare plaster reveal"}
            >
              {l ? "Cased" : "Bare"}
            </PdChip>
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
          <div style={pdMicroLabel()}>Frame finish · whole house</div>
          <div style={{ display: "flex", gap: 4 }}>
            {WINDOW_FRAME_MATERIALS.map((m) => (
              <PdChip
                key={m.key}
                active={frameFinishOf(opening) === m.key}
                extra={pdChipFlex}
                onClick={() => useSceneStore.getState().setFrameFinish(m.key)}
                title={m.title}
              >
                {m.label}
              </PdChip>
            ))}
          </div>
          <div style={pdMicroLabel()}>Frame colour · whole house</div>
          <FramePaintRow opening={opening} />
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
