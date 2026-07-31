"use client";

import { useEffect, useState } from "react";
import { T, field } from "@/ui/tokens";

const inspectorRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" };

/** A labeled numeric field for the 3D inspector panels. `value`/`onCommit` are
 *  always in the field's native unit (meters, degrees, percent...). Pass
 *  `displayScale` to show/edit a different unit at the input boundary — e.g.
 *  100 shows/parses centimeters while onCommit still only ever emits meters,
 *  so every consumer's clamping and downstream geometry stay untouched. */
export function NumField({ label, value, onCommit, disabled, unit = "m", displayScale = 1 }: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  disabled?: boolean;
  unit?: string;
  displayScale?: number;
}) {
  const displayValue = value * displayScale;
  const [raw, setRaw] = useState(String(displayValue));
  useEffect(() => setRaw(String(displayValue)), [displayValue]);
  const commit = () => {
    const v = Number(raw);
    if (Number.isFinite(v)) onCommit(v / displayScale);
    else setRaw(String(displayValue));
  };
  return (
    <label style={inspectorRow}>
      <span style={{ color: T.textDim }}>{label}</span>
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
            onCommit(value + dir / displayScale);
          }}
        />
        <span style={{ color: T.textFaint }}>{unit}</span>
      </span>
    </label>
  );
}
