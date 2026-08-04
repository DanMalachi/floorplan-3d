"use client";

// Shared building blocks for the Plan Dock inspector (Plan Dock P5). Mirrors
// the shapes the old Viewport.tsx inspector used (inspectorPanel/inspectorRow/
// NumField/Stepper from src/ui/tokens.ts + src/ui/NumField.tsx) but on PD
// tokens, so the panel matches the rest of Build/Decorate's dark glass
// instead of reading as a leftover pre-overhaul surface. Every *Section.tsx
// file builds its layout out of these instead of hand-rolling styles.

import { useEffect, useState, type ReactNode } from "react";
import { PD, pdGlass, pdChip } from "../tokens";

/** Docked top-right, same slot the old inspector used — every selection kind
 *  renders inside one of these. */
export const pdInspectorPanel: React.CSSProperties = {
  position: "absolute",
  right: 14,
  top: 64,
  padding: "12px 14px",
  fontSize: 12.5,
  display: "flex",
  flexDirection: "column",
  gap: 9,
  minWidth: 190,
  maxHeight: "calc(100% - 100px)",
  overflowY: "auto",
  overflowX: "hidden",
  ...pdGlass(),
};

export const pdInspectorRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  justifyContent: "space-between",
};

/** "Wall · 3.20 m" / "Sofa · 2.1 × 0.95 m" — the panel's first line. */
export function PdSectionTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <div style={{ fontWeight: 600, fontSize: 13, textTransform: "capitalize" }}>
      {title}
      {meta && (
        <span style={{ color: PD.textTertiary, fontWeight: 400, textTransform: "none" }}> · {meta}</span>
      )}
    </div>
  );
}

/** Faint trailing hint line ("drag to move · R rotates · Delete removes"). */
export function PdHelpText({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 10.5, color: PD.textTertiary, lineHeight: 1.5 }}>{children}</div>;
}

const round = (n: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};

/** Labeled numeric field, commits on Enter/blur/wheel. Same contract as
 *  src/ui/NumField.tsx (value/onCommit always in the field's native unit;
 *  `displayScale` shows/parses a different unit at the input boundary, e.g.
 *  100 for meters-stored/centimeters-shown) — a PD-styled sibling rather than
 *  a restyle of that file, since NumField is still used by StairInspector's
 *  old T-token styling and touching it would ripple there too. */
export function PdNumField({
  label,
  value,
  onCommit,
  disabled,
  unit = "m",
  displayScale = 1,
}: {
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
    <label style={pdInspectorRow}>
      <span style={{ color: PD.textSecondary }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <input
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
          style={{
            width: 58,
            padding: "3px 6px",
            borderRadius: 7,
            border: `1px solid ${PD.hairline}`,
            background: PD.inputBg,
            color: PD.textPrimary,
            fontFamily: PD.fontMono,
            fontSize: 11.5,
            opacity: disabled ? 0.4 : 1,
            textAlign: "right",
          }}
        />
        <span style={{ color: PD.textTertiary, fontSize: 11 }}>{unit}</span>
      </span>
    </label>
  );
}

/** Small integer +/- stepper (mullion grid, slide panel count). */
export function PdStepper({
  label,
  value,
  min = 1,
  max = 6,
  onSet,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onSet: (v: number) => void;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const btn: React.CSSProperties = {
    ...pdChip(false),
    padding: "1px 9px",
    fontSize: 14,
    lineHeight: 1.2,
  };
  return (
    <label style={pdInspectorRow}>
      <span style={{ color: PD.textSecondary }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button style={btn} onClick={() => onSet(clamp(value - 1))}>
          –
        </button>
        <span style={{ minWidth: 14, textAlign: "center", fontVariantNumeric: "tabular-nums", fontFamily: PD.fontMono }}>
          {value}
        </span>
        <button style={btn} onClick={() => onSet(clamp(value + 1))}>
          +
        </button>
      </span>
    </label>
  );
}

/** Plain range input row (fixture lux/K sliders) — same shape as the old
 *  inline `<input type="range">` blocks, just PD-colored. `format` renders
 *  the trailing readout (e.g. "3200 lx", "4200K"). */
export function PdRangeRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <label style={pdInspectorRow}>
      <span style={{ color: PD.textSecondary }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onKeyDown={(e) => e.stopPropagation()}
          style={{ width: 90, accentColor: "oklch(0.62 0.15 258)" }}
        />
        <span style={{ color: PD.textTertiary, minWidth: 46, fontSize: 11, fontFamily: PD.fontMono }}>{format(value)}</span>
      </span>
    </label>
  );
}

/** A row of equal-width PD chips (kind pickers, type pickers). */
export function PdChipGroup({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", gap: 4 }}>{children}</div>;
}

export const pdChipFlex: React.CSSProperties = { flex: 1, textAlign: "center" };

/** Small round color swatch button — paint faces, IKEA variant dots. */
export function PdSwatch({
  hex,
  active,
  title,
  onClick,
  size = 20,
}: {
  hex: string | null;
  active?: boolean;
  title?: string;
  onClick: () => void;
  size?: number;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: hex ?? "#d8d2c4",
        border: active ? `2px solid ${PD.accent}` : `1.5px solid ${PD.hairline}`,
        boxShadow: active ? `0 0 0 2px ${PD.accentTint}` : "none",
        cursor: "pointer",
        padding: 0,
        flex: "0 0 auto",
      }}
    />
  );
}

/** Row of full-width text action buttons (Replace / Duplicate / Delete). */
export function PdActionRow({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", gap: 4, marginTop: 2 }}>{children}</div>;
}

export function PdActionButton({
  label,
  onClick,
  tone = "default",
}: {
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "6px 4px",
        borderRadius: PD.radiusS,
        border: "none",
        background: tone === "danger" ? "oklch(0.32 0.1 25 / 0.35)" : PD.surfaceMuted,
        color: tone === "danger" ? "oklch(0.82 0.1 25)" : PD.textSecondary,
        fontFamily: PD.fontUi,
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
