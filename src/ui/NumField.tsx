"use client";

import { useEffect, useState } from "react";
import { PD } from "@/ui/planDock/tokens";

// On PD tokens (2026-09-04). This is the Trace rail's numeric field — the last
// thing in that panel still wearing the `T` set, which filled an active control
// solid #0a84ff while every Build/Decorate control used a soft tint of
// oklch(0.62 .15 258). Two token sets meant two design languages in one app, so
// everything reads from PD now and `src/ui/tokens.ts` goes away.
//
// There is no `pdField()` helper to swap `field()` for, and inventing one for a
// single input would be a third recipe rather than a second. The three lines it
// contributed are composed inline from the same tokens `PdNumField` uses
// (inspector/panelKit.tsx), which is the shape this one is a sibling of.
const field = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: PD.inputBg,
  border: `1px solid ${PD.hairline}`,
  borderRadius: PD.radiusS,
  color: PD.textPrimary,
  padding: "4px 8px",
  fontSize: 12.5,
  fontFamily: PD.fontUi,
  outline: "none",
  ...extra,
});

const inspectorRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" };

/** A labeled numeric field for the 3D inspector panels. `value`/`onCommit` are
 *  always in the field's native unit (meters, degrees, percent...). Pass
 *  `displayScale` to show/edit a different unit at the input boundary — e.g.
 *  100 shows/parses centimeters while onCommit still only ever emits meters,
 *  so every consumer's clamping and downstream geometry stay untouched. */
// Kills binary floating-point dust (e.g. 2.7 * 100 = 269.99999999999994)
// without truncating any precision a user would actually type.
const round = (n: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};

export function NumField({ label, value, onCommit, disabled, unit = "m", displayScale = 1 }: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  disabled?: boolean;
  unit?: string;
  displayScale?: number;
}) {
  const displayValue = round(value * displayScale, 4);
  const [raw, setRaw] = useState(String(displayValue));
  useEffect(() => setRaw(String(displayValue)), [displayValue]);
  const commit = () => {
    const v = Number(raw);
    if (Number.isFinite(v)) onCommit(round(v / displayScale, 6));
    else setRaw(String(displayValue));
  };
  return (
    <label style={inspectorRow}>
      <span style={{ color: PD.textSecondary }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <input
          style={field({ width: 58, opacity: disabled ? 0.4 : 1 })}
          value={raw}
          disabled={disabled}
          onChange={(e) => setRaw(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            e.stopPropagation();
          }}
          onWheel={(e) => {
            if (disabled) return;
            e.preventDefault();
            const dir = e.deltaY < 0 ? 1 : -1;
            onCommit(round((displayValue + dir) / displayScale, 6));
          }}
        />
        <span style={{ color: PD.textTertiary }}>{unit}</span>
      </span>
    </label>
  );
}
