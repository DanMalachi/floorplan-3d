"use client";

// The stair's Build-mode inspector: select a staircase in 3D and change what it
// is, without going back to the trace tab.
//
// Everything editable here is a property of the whole staircase — width, total
// climb, step count, how it's built. The FOOTPRINT (where the flights run) stays
// a traced thing: dragging stair geometry in 3D would need the same gesture
// machinery walls have, and is deliberately not part of this pass.
//
// Restyled onto Plan Dock tokens (P5) — was still the pre-overhaul T/glass/chip
// look after the rest of the inspector moved to src/ui/planDock/inspector/;
// same controls, same behavior, just PD-colored via the shared panelKit.

import type { Stair } from "@/schema/scene";
import { DEFAULT_STAIR } from "@/schema/constants";
import { useSceneStore } from "@/store/useSceneStore";
import { PD, pdChip } from "@/ui/planDock/tokens";
import { useHover } from "@/ui/planDock/useHover";
import { Tooltip } from "@/ui/planDock/Tooltip";
import { StairsIcon, StairsSolidIcon, WarnIcon } from "@/ui/planDock/icons";
import {
  pdInspectorPanel,
  PdSectionTitle,
  PdHelpText,
  PdNumField,
} from "@/ui/planDock/inspector/panelKit";
import {
  MAX_STAIR_WIDTH,
  MIN_STAIR_WIDTH,
  stairMetrics,
} from "@/lib/stairs/stairGeometry";

// `label` is the word alone — the ▉ / ▤ that used to lead each string is now a
// drawn icon, so the label can be translated and the two chips match the rest
// of the inspector instead of reflowing with the font.
const STYLES = [
  {
    key: "solid" as const,
    label: "Solid",
    Icon: StairsSolidIcon,
    tip: "Closed stringer — a boxed-in flight sitting on the floor, landings built down with it.",
  },
  {
    key: "open" as const,
    label: "Open",
    Icon: StairsIcon,
    tip: "Open riser — floating treads on two side stringers. You can see through and under it.",
  },
];

/** One of the two style chips, and the Auto button. Its own component so it can
 *  hold a hover flag.
 *
 *  `tip` renders through the shared glass Tooltip rather than a native `title`:
 *  the browser's own tooltip is a white window that matches nothing else here.
 *  Placement is BELOW the chip because this panel is docked at `top: 64`, so a
 *  tooltip above the first rows would be clipped off the top of the window. */
function StairChip({
  active,
  tip,
  onClick,
  extra,
  children,
}: {
  active: boolean;
  tip?: string;
  onClick: () => void;
  extra?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [hovered, hoverBind] = useHover();
  const button = (
    <button {...hoverBind} onClick={onClick} style={{ ...pdChip(active, undefined, hovered), ...extra }}>
      {children}
    </button>
  );
  return tip ? (
    <Tooltip label={tip} placement="bottom">
      {button}
    </Tooltip>
  ) : (
    button
  );
}

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
    <div style={pdInspectorPanel}>
      <PdSectionTitle
        label="Stair"
        meta={`${stair.flights.length} flight${stair.flights.length === 1 ? "" : "s"} · ${m.run.toFixed(2)} m`}
      />

      <div style={{ display: "flex", gap: 4 }}>
        {STYLES.map((s) => (
          <StairChip
            key={s.key}
            active={style === s.key}
            extra={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}
            tip={s.tip}
            onClick={() => style !== s.key && patch(`Stair: ${s.key}`, { style: s.key })}
          >
            <s.Icon size={13} /> {s.label}
          </StairChip>
        ))}
      </div>

      <PdNumField
        label="Width"
        value={stair.width}
        onCommit={(v) => patch("Stair width", { width: Math.min(MAX_STAIR_WIDTH, Math.max(MIN_STAIR_WIDTH, v)) })}
        displayScale={100}
        unit="cm"
      />
      <PdNumField
        label="Rise"
        value={stair.rise}
        onCommit={(v) => patch("Stair rise", { rise: Math.min(6, Math.max(0.1, v)) })}
        displayScale={100}
        unit="cm"
      />

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ flex: 1 }}>
          <PdNumField
            label="Steps"
            value={m.steps}
            unit=""
            onCommit={(v) => patch("Stair steps", { steps: Math.max(1, Math.round(v)) })}
          />
        </div>
        <StairChip
          active={stair.steps == null}
          tip={`Derive the step count from the rise (${DEFAULT_STAIR.rise} m climb ≈ 14 steps)`}
          onClick={setAutoSteps}
        >
          Auto
        </StairChip>
      </div>

      <div style={{ fontSize: 11, color: PD.textSecondary, lineHeight: 1.5 }}>
        riser {Math.round(m.riser * 100)} cm · tread {Math.round(m.going * 100)} cm · {pitchDeg}°
      </div>

      {/* Advisory only — a plan can legitimately show a stair that fails a rule
          of thumb, so nothing here blocks or clamps. */}
      {m.warnings.map((w, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 5,
            fontSize: 10.5,
            color: PD.warnText,
            lineHeight: 1.45,
          }}
        >
          <span style={{ flex: "0 0 auto", lineHeight: 0, paddingTop: 1 }}>
            <WarnIcon size={12} />
          </span>
          <span>{w}</span>
        </div>
      ))}

      <PdHelpText>
        Where it runs is traced — edit the flights in <b style={{ color: PD.textSecondary, fontWeight: 600 }}>Trace</b>.
      </PdHelpText>
    </div>
  );
}
