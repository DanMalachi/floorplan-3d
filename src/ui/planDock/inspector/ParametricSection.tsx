"use client";

// Configurator for placed parametric furniture (parametric-furniture.md P2).
// Sibling to FurnitureSection — Inspector.tsx branches to this one whenever
// item.parametric is present. Every control commits through
// updateFurnitureParametric, which re-sanitizes and re-renders the mesh live.

import type { FurnitureItem, ParametricSpec } from "@/schema/scene";
import { useSceneStore } from "@/store/useSceneStore";
import { GENERATORS } from "@/parametric";
import { pdToast } from "../toast";
import { PD, pdChip } from "../tokens";
import {
  pdInspectorPanel,
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
  "painted-white": "#f4f4f2",
  "painted-charcoal": "#3a3d40",
  oak: "#d6b282",
  walnut: "#5b4632",
  "fabric-linen": "#d8d2c4",
  "fabric-charcoal": "#4a4d52",
  "fabric-sage": "#9aa88f",
  "counter-oak": "#d6b282",
  "counter-white": "#e9e7e2",
  "counter-dark": "#2e2f31",
};

export function ParametricSection({ item }: { item: FurnitureItem }) {
  const spec = item.parametric;
  if (!spec) return null;
  const g = GENERATORS[spec.generator];

  const update = (patch: Partial<ParametricSpec>) => useSceneStore.getState().updateFurnitureParametric(item.id, patch);

  const onDuplicate = () => {
    useSceneStore.getState().duplicateFurniture(item.id);
    pdToast("Duplicated");
  };
  const onDelete = () => useSceneStore.getState().deleteSelected3d();

  return (
    <div style={pdInspectorPanel}>
      <PdSectionTitle title={g.label} meta="Custom" />

      <PdNumField
        label="Width"
        value={spec.dims.w}
        onCommit={(w) => update({ dims: { ...spec.dims, w } })}
        displayScale={100}
        unit="cm"
      />
      <PdNumField
        label="Depth"
        value={spec.dims.d}
        onCommit={(d) => update({ dims: { ...spec.dims, d } })}
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

      {g.modules.map((m) => (
        <PdStepper
          key={m.key}
          label={m.label}
          value={spec.modules[m.key] ?? m.default}
          min={m.min}
          max={m.max}
          onSet={(v) => update({ modules: { [m.key]: v } })}
        />
      ))}

      {g.fronts.length > 1 && (
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

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {g.finishes.map((f) => (
          <PdSwatch key={f} hex={FINISH_HEX[f] ?? null} active={spec.finish === f} title={f} onClick={() => update({ finish: f })} />
        ))}
      </div>

      {g.finishes2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 10.5, color: PD.textTertiary }}>
            {spec.generator === "kitchenRun" ? "Counter" : "Pillows"}
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
        </div>
      )}

      <PdActionRow>
        <PdActionButton label="Duplicate" onClick={onDuplicate} />
        <PdActionButton label="Delete" tone="danger" onClick={onDelete} />
      </PdActionRow>

      <PdHelpText>drag to move · R rotates · Delete removes</PdHelpText>
    </div>
  );
}
