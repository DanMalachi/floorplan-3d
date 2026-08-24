"use client";

// Configurator for placed parametric furniture (parametric-furniture.md P2).
// Sibling to FurnitureSection — Inspector.tsx branches to this one whenever
// item.parametric is present. Every control commits through
// updateFurnitureParametric, which re-sanitizes and re-renders the mesh live.

import { useState } from "react";
import type { FurnitureItem, ParametricSpec } from "@/schema/scene";
import { useSceneStore } from "@/store/useSceneStore";
import { GENERATORS, elevationOf } from "@/parametric";
import { WALL_HEIGHT } from "@/schema/constants";
import { isColorable } from "@/parametric/materials";
import { nearestLinkableBase } from "@/parametric/kitchenAttach";
import { ARTWORKS } from "@/parametric/wallArtParts";
import { pdToast } from "../toast";
import { PD, pdChip } from "../tokens";
import {
  pdInspectorPanel,
  pdInspectorRow,
  PdSectionTitle,
  PdNumField,
  PdStepper,
  PdChipGroup,
  pdChipFlex,
  PdSwatch,
  PdActionRow,
  PdActionButton,
  PdHelpText,
} from "./panelKit";

const FRONT_LABEL: Record<ParametricSpec["front"], string> = {
  slab: "Slab",
  shaker: "Shaker",
  farmhouse: "Farmhouse",
};

const HANDLE_LABEL: Record<ParametricSpec["handle"], string> = {
  bar: "Bar",
  knob: "Knob",
  none: "None",
};

// Representative swatch colors — a flat UI stand-in for the actual procedural/
// photo finish, not the finish itself. Extend alongside new finish ids.
const FINISH_HEX: Record<string, string> = {
  painted: "#f4f4f2",
  "painted-white": "#f4f4f2",
  "painted-charcoal": "#3a3d40",
  "laminate-matte": "#e8e6e1",
  "laminate-gloss": "#e8e6e1",
  oak: "#d6b282",
  walnut: "#5b4632",
  "wood-walnut-dark": "#3f2a1f",
  "wood-plank-pale": "#d9c7a8",
  fabric: "#d8d2c4",
  "fabric-linen": "#d8d2c4",
  "fabric-charcoal": "#4a4d52",
  "fabric-sage": "#9aa88f",
  "fabric-boucle": "#e3ded2",
  velvet: "#5a4a6a",
  leather: "#6b4a35",
  "counter-oak": "#d6b282",
  "counter-white": "#e9e7e2",
  "counter-dark": "#2e2f31",
  ceramic: "#f6f6f4",
  acrylic: "#f4f5f4",
  steel: "#c6c8ca",
  "glass-black": "#101113",
};

// Color-wheel presets — the old hardcoded finish colors (painted-charcoal,
// fabric-linen/sage, etc.) live on here now instead of as separate finish ids.
const COLOR_PRESETS = ["#f4f4f2", "#3a3d40", "#d8d2c4", "#9aa88f", "#5a4a6a", "#6b4a35"];

/** Native color input (26px round) + preset swatches. Commits on blur, not
 *  onChange — the browser's picker fires input continuously while dragging
 *  inside it, and onChange would be a store commit (one undo step) per tick. */
function ColorControl({ value, onCommit }: { value: string; onCommit: (hex: string) => void }) {
  const [pending, setPending] = useState<string | null>(null);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        type="color"
        value={pending ?? value}
        onChange={(e) => setPending(e.target.value)}
        onBlur={() => {
          if (pending && pending !== value) onCommit(pending);
          setPending(null);
        }}
        style={{
          width: 26,
          height: 26,
          padding: 0,
          border: `1px solid ${PD.hairline}`,
          borderRadius: "50%",
          overflow: "hidden",
          background: "none",
          cursor: "pointer",
        }}
      />
      {COLOR_PRESETS.map((hex) => (
        <PdSwatch key={hex} hex={hex} active={value === hex} title={hex} onClick={() => onCommit(hex)} size={16} />
      ))}
    </div>
  );
}

export function ParametricSection({ item }: { item: FurnitureItem }) {
  const spec = item.parametric;
  if (!spec) return null;
  const g = GENERATORS[spec.generator];

  const update = (patch: Partial<ParametricSpec>) => useSceneStore.getState().updateFurnitureParametric(item.id, patch);

  // "Match run below" (kitchenWall only): read imperatively, same convention
  // every other handler in this file uses (`.getState()`, not a subscribed
  // hook) — Inspector.tsx already re-renders this component on every scene
  // change, so a second subscription here would just be a redundant one.
  const isWallRun = spec.generator === "kitchenWall";
  const linkHost = isWallRun ? nearestLinkableBase(item, useSceneStore.getState().scene) : null;
  const isLinked = isWallRun && !!item.attach;

  const onDuplicate = () => {
    useSceneStore.getState().duplicateFurniture(item.id);
    pdToast("Duplicated");
  };
  const onDelete = () => useSceneStore.getState().deleteSelected3d();

  return (
    <div style={pdInspectorPanel}>
      <PdSectionTitle title={g.label} meta="Custom" />

      {/* A television is sold by its screen diagonal, and its width and height
          are that one number at 16:9 — so it gets inches and the standard
          sizes, not two centimetre fields that can disagree with each other. */}
      {g.sizeInches ? (
        <>
          <PdNumField
            label={g.sizeInches.label}
            value={g.sizeInches.of(spec)}
            onCommit={(inches) => update({ dims: g.sizeInches!.dims(spec, inches) })}
            unit={'"'}
          />
          <PdChipGroup>
            {g.sizeInches.presets.map((p) => (
              <button
                key={p}
                style={pdChip(Math.abs(g.sizeInches!.of(spec) - p) < 0.6, pdChipFlex)}
                onClick={() => update({ dims: g.sizeInches!.dims(spec, p) })}
              >
                {p}&quot;
              </button>
            ))}
          </PdChipGroup>
        </>
      ) : (
        <>
          <PdNumField
            label="Width"
            value={spec.dims.w}
            onCommit={(w) => update({ dims: { ...spec.dims, w } })}
            displayScale={100}
            unit="cm"
          />
          <PdNumField
            label="Height"
            value={spec.dims.h}
            onCommit={(h) => update({ dims: { ...spec.dims, h } })}
            displayScale={100}
            unit="cm"
          />
        </>
      )}
      <PdNumField
        label="Depth"
        value={spec.dims.d}
        onCommit={(d) => update({ dims: { ...spec.dims, d } })}
        displayScale={100}
        unit="cm"
      />

      {g.modules.map((m) => {
        // A control that does nothing for this variant is worse than a missing
        // one: burner count on a fridge teaches people the inspector lies.
        if (m.appliesTo && !m.appliesTo(spec)) return null;
        const value = spec.modules[m.key] ?? m.default;
        // Two-state modules read as words, not counts — a stepper offering
        // "0" and "1" for an open/closed lid is a number pretending to be a
        // choice.
        if (m.toggle) {
          return (
            <PdChipGroup key={m.key}>
              {([1, 0] as const).map((v) => (
                <button
                  key={v}
                  style={pdChip(value >= 1 === (v === 1), pdChipFlex)}
                  onClick={() => update({ modules: { [m.key]: v } })}
                >
                  {v === 1 ? m.toggle!.on : m.toggle!.off}
                </button>
              ))}
            </PdChipGroup>
          );
        }
        return (
          <PdStepper
            key={m.key}
            label={m.label}
            value={value}
            min={m.min}
            max={m.max}
            onSet={(v) => update({ modules: { [m.key]: v } })}
          />
        );
      })}

      {g.variants && g.variants.length > 1 && !g.variantIsProduct && (
        <PdChipGroup>
          {g.variants.map((v) => (
            <button
              key={v.id}
              style={pdChip((spec.variant ?? g.variants![0].id) === v.id, pdChipFlex)}
              onClick={() => update({ variant: v.id })}
            >
              {v.label}
            </button>
          ))}
        </PdChipGroup>
      )}

      {g.fronts.length > 1 && (g.showFronts?.(spec) ?? true) && (
        <PdChipGroup>
          {g.fronts.map((f) => (
            <button key={f} style={pdChip(spec.front === f, pdChipFlex)} onClick={() => update({ front: f })}>
              {FRONT_LABEL[f]}
            </button>
          ))}
        </PdChipGroup>
      )}

      {g.handles.length > 1 && (
        <PdChipGroup>
          {g.handles.map((h) => (
            <button key={h} style={pdChip(spec.handle === h, pdChipFlex)} onClick={() => update({ handle: h })}>
              {HANDLE_LABEL[h]}
            </button>
          ))}
        </PdChipGroup>
      )}

      {g.finishesLabel && <span style={{ fontSize: 10.5, color: PD.textTertiary }}>{g.finishesLabel}</span>}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {g.finishes.map((f) => {
          // Wall art's finishes ARE pictures: the swatch shows the painting,
          // because a dot in its average colour is a choice made blind.
          const art = ARTWORKS.find((a) => a.id === f);
          return (
            <PdSwatch
              key={f}
              hex={FINISH_HEX[f] ?? null}
              img={art?.url}
              active={spec.finish === f}
              title={art?.label ?? f}
              onClick={() => update({ finish: f })}
            />
          );
        })}
      </div>
      {isColorable(spec.finish) && (
        <ColorControl value={spec.color ?? FINISH_HEX[spec.finish] ?? "#ffffff"} onCommit={(color) => update({ color })} />
      )}

      {g.finishes2 && (g.showFinishes2?.(spec) ?? true) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 10.5, color: PD.textTertiary }}>
            {g.finishes2Label ?? (spec.generator === "kitchenRun" || spec.generator === "kitchenBase" ? "Counter" : "Pillows")}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {g.finishes2.map((f) => (
              <PdSwatch
                key={f}
                hex={FINISH_HEX[f] ?? null}
                active={spec.finish2 === f}
                title={f}
                onClick={() => update({ finish2: f })}
              />
            ))}
          </div>
          {isColorable(spec.finish2 ?? g.finishes2[0]) && (
            <ColorControl
              value={spec.color2 ?? FINISH_HEX[spec.finish2 ?? g.finishes2[0]] ?? "#ffffff"}
              onCommit={(color2) => update({ color2 })}
            />
          )}
        </div>
      )}

      {/* Opt-in: uppers only follow a base run if the user asks. Disabled
          rather than hidden when no base run qualifies, per the same "the
          absence is legible" rule the dead-control comments elsewhere in
          this file follow — an invisible control reads as "not offered",
          a disabled one reads as "not right now, here's why". */}
      {isWallRun && (
        <label style={pdInspectorRow}>
          <span style={{ color: PD.textSecondary }}>Match run below</span>
          <button
            disabled={!isLinked && !linkHost}
            onClick={() => {
              const store = useSceneStore.getState();
              if (isLinked) store.setKitchenWallLink(item.id, null);
              else if (linkHost) store.setKitchenWallLink(item.id, linkHost.id);
            }}
            style={{
              ...pdChip(isLinked),
              opacity: !isLinked && !linkHost ? 0.4 : 1,
              cursor: !isLinked && !linkHost ? "default" : "pointer",
            }}
          >
            {isLinked ? "On" : "Off"}
          </button>
        </label>
      )}

      {/* Anything that hangs needs its height editable, not just wall
          cabinets: dragging a hood or a mirror slides it ALONG its wall, so
          this field is the only way to change how high it hangs. */}
      {(spec.generator === "kitchenWall" || (g.wallMounted?.(spec) ?? false)) && (
        <PdNumField
          label="Height off floor"
          value={item.elevation ?? elevationOf(spec) ?? 1.45}
          onCommit={(m) => {
            // Wall cabinets keep their original worktop-to-ceiling range; other
            // wall items use the same limits the placement ghost enforces, so a
            // height you could point at can't be rejected when you retype it.
            // The ghost's own clamp (RunDrawGhost.tsx, wallCabElev) uses this
            // SAME pair of numbers — a run's cabinets can now stand up to 1.4m
            // tall, so a fixed 2.1m ceiling stopped being high enough to hang
            // one flush under a 2.4m ceiling; deriving hi from the item's own
            // height keeps both in sync as dimLimits change.
            const isRun = spec.generator === "kitchenWall";
            const lo = isRun ? 0.8 : 0.1;
            const hi = isRun
              ? Math.max(WALL_HEIGHT - spec.dims.h, lo)
              : Math.max(WALL_HEIGHT - spec.dims.h, 0.1);
            useSceneStore.getState().setFurnitureElevation(item.id, Math.min(hi, Math.max(lo, m)));
          }}
          displayScale={100}
          unit="cm"
        />
      )}

      <PdActionRow>
        <PdActionButton label="Duplicate" onClick={onDuplicate} />
        <PdActionButton label="Delete" tone="danger" onClick={onDelete} />
      </PdActionRow>

      <PdHelpText>
        {spec.generator === "kitchenBase" || spec.generator === "kitchenWall"
          ? "drag to move along walls · drag end arrows to resize · Delete removes"
          : spec.generator === "sink" || spec.generator === "cooktop"
            ? "drag to slide along the counter · Delete removes"
            : "drag to move · R rotates · Delete removes"}
      </PdHelpText>
    </div>
  );
}
