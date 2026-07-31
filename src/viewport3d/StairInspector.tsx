"use client";

// The stair's Build-mode inspector: select a staircase in 3D and change what it
// is, without going back to the trace tab.
//
// Everything editable here is a property of the whole staircase — width, total
// climb, step count, how it's built. The FOOTPRINT (where the flights run) stays
// a traced thing: dragging stair geometry in 3D would need the same gesture
// machinery walls have, and is deliberately not part of this pass.

import type { Stair } from "@/schema/scene";
import { DEFAULT_STAIR } from "@/schema/constants";
import { useSceneStore } from "@/store/useSceneStore";
import { T, glass, chip } from "@/ui/tokens";
import { NumField } from "@/ui/NumField";
import {
  MAX_STAIR_WIDTH,
  MIN_STAIR_WIDTH,
  stairMetrics,
} from "@/lib/stairs/stairGeometry";

// Mirrors `inspectorPanel` in Viewport.tsx (which is protected and doesn't
// export it) so a selected stair's panel sits exactly where every other
// inspector does.
const inspectorPanel: React.CSSProperties = {
  position: "absolute",
  right: 14,
  top: 64,
  padding: "12px 14px",
  fontSize: 12.5,
  display: "flex",
  flexDirection: "column",
  gap: 9,
  minWidth: 170,
  ...glass(),
};

const STYLES = [
  {
    key: "solid" as const,
    label: "▉ Solid",
    title: "Closed stringer — a boxed-in flight sitting on the floor, landings built down with it.",
  },
  {
    key: "open" as const,
    label: "▤ Open",
    title: "Open riser — floating treads on two side stringers. You can see through and under it.",
  },
];

export function StairInspector({ stair }: { stair: Stair }) {
  const m = stairMetrics(stair);
  const style = stair.style ?? "solid";
  const pitchDeg = Math.round((Math.atan2(m.riser, m.going) * 180) / Math.PI);

  // Every edit is one undoable command, exactly like the wall inspector's.
  const patch = (label: string, p: Partial<Stair>) => {
    const s = useSceneStore.getState();
    s.commitScene(label, {
      ...s.scene,
      stairs: (s.scene.stairs ?? []).map((x) => (x.id === stair.id ? { ...x, ...p } : x)),
    });
  };
  // `steps` absent means "derive it from the rise", so clearing the override has
  // to DELETE the key rather than set a number.
  const setAutoSteps = () => {
    const s = useSceneStore.getState();
    s.commitScene("Stair steps: auto", {
      ...s.scene,
      stairs: (s.scene.stairs ?? []).map((x) => {
        if (x.id !== stair.id) return x;
        const { steps: _drop, ...rest } = x;
        return rest;
      }),
    });
  };

  return (
    <div style={inspectorPanel}>
      <div style={{ fontWeight: 600 }}>
        Stair{" "}
        <span style={{ color: T.textDim, fontWeight: 400 }}>
          · {stair.flights.length} flight{stair.flights.length === 1 ? "" : "s"} ·{" "}
          {m.run.toFixed(2)} m
        </span>
      </div>

      <div style={{ display: "flex", gap: 4 }}>
        {STYLES.map((s) => (
          <button
            key={s.key}
            style={chip(style === s.key, { flex: 1, textAlign: "center" })}
            title={s.title}
            onClick={() => style !== s.key && patch(`Stair: ${s.key}`, { style: s.key })}
          >
            {s.label}
          </button>
        ))}
      </div>

      <NumField
        label="Width"
        value={stair.width}
        onCommit={(v) =>
          patch("Stair width", {
            width: Math.min(MAX_STAIR_WIDTH, Math.max(MIN_STAIR_WIDTH, v)),
          })
        }
        displayScale={100}
        unit="cm"
      />
      <NumField
        label="Rise"
        value={stair.rise}
        onCommit={(v) => patch("Stair rise", { rise: Math.min(6, Math.max(0.1, v)) })}
        displayScale={100}
        unit="cm"
      />

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ flex: 1 }}>
          <NumField
            label="Steps"
            value={m.steps}
            unit=""
            onCommit={(v) => patch("Stair steps", { steps: Math.max(1, Math.round(v)) })}
          />
        </div>
        <button
          style={chip(stair.steps == null)}
          title={`Derive the step count from the rise (${DEFAULT_STAIR.rise} m climb ≈ 14 steps)`}
          onClick={setAutoSteps}
        >
          Auto
        </button>
      </div>

      <div style={{ fontSize: 11, color: T.textDim, lineHeight: 1.5 }}>
        riser {Math.round(m.riser * 100)} cm · tread {Math.round(m.going * 100)} cm · {pitchDeg}°
      </div>

      {/* Advisory only — a plan can legitimately show a stair that fails a rule
          of thumb, so nothing here blocks or clamps. */}
      {m.warnings.map((w, i) => (
        <div key={i} style={{ fontSize: 10.5, color: T.warn, lineHeight: 1.45 }}>
          ⚠ {w}
        </div>
      ))}

      <div style={{ fontSize: 10.5, color: T.textFaint }}>
        Where it runs is traced — edit the flights in <b style={{ color: T.textDim, fontWeight: 600 }}>Trace</b>.
      </div>
    </div>
  );
}
