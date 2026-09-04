"use client";

// Shared building blocks for the Plan Dock inspector (Plan Dock P5). Mirrors
// the shapes the old Viewport.tsx inspector used (inspectorPanel/inspectorRow/
// NumField/Stepper from src/ui/tokens.ts + src/ui/NumField.tsx) but on PD
// tokens, so the panel matches the rest of Build/Decorate's dark glass
// instead of reading as a leftover pre-overhaul surface. Every *Section.tsx
// file builds its layout out of these instead of hand-rolling styles.

import { useEffect, useState, type ReactNode } from "react";
import { PD, pdGlass, pdChip } from "../tokens";
import { useHover } from "../useHover";

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

// Why `meta` and the help text are textSECONDARY, not textTertiary:
//
// `PD.textTertiary` is oklch(0.55 …) — a colour picked against a SOLID ground.
// Every inspector section renders on `pdGlass()`, which is translucent, so the
// scene shows through and eats most of the remaining contrast. The result was
// that the two lines carrying actual measurements (a room's m², a wall's
// length) and every hint line in the panel were the least readable text in the
// app. These are shared primitives, so moving them up one step fixes the same
// bug in all nine sections at once rather than nine times.

/** "Wall · 3.20 m" / "Sofa · 2.1 × 0.95 m" — the panel's first line. */
export function PdSectionTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <div style={{ fontWeight: 600, fontSize: 13, textTransform: "capitalize" }}>
      {title}
      {meta && (
        <span style={{ color: PD.textSecondary, fontWeight: 400, textTransform: "none" }}> · {meta}</span>
      )}
    </div>
  );
}

/** Faint trailing hint line ("drag to move · R rotates · Delete removes"). */
export function PdHelpText({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 10.5, color: PD.textSecondary, lineHeight: 1.5 }}>{children}</div>;
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

/** A chip-styled `<button>` with hover feedback.
 *
 *  The reason this is a component and not a style helper: `pdChip()` takes
 *  `hovered` as an argument, and the hover state has to come from a hook —
 *  which cannot be called inside the `.map()` callbacks that render most chip
 *  rows (a variable number of hooks per render). Wrapping the button is the
 *  only way to give a mapped chip its own state, and doing it here means every
 *  section inherits hover instead of nine files each growing a local copy.
 *
 *  `extra` is forwarded to `pdChip`, which deliberately DROPS it today (see
 *  the note in tokens.ts — spreading it would silently restyle ~26 call sites).
 *  Forwarding rather than spreading keeps each call site's intent on record, so
 *  the one-line fix in tokens.ts lights all of them up at once. */
export function PdChip({
  active = false,
  extra,
  title,
  disabled,
  onClick,
  children,
}: {
  active?: boolean;
  extra?: React.CSSProperties;
  title?: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const [hovered, hoverBind] = useHover();
  return (
    <button
      {...hoverBind}
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={pdChip(active, extra, hovered && !disabled)}
    >
      {children}
    </button>
  );
}

/** Icon + label inside a chip, on one baseline. Chips carry no `display`, so
 *  an SVG dropped straight into one sits on the text baseline and rides low. */
export function PdChipLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      {icon}
      {children}
    </span>
  );
}

/** One +/- key of a stepper. Its own component so it can hold hover state. */
function PdStepBtn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  const [hovered, hoverBind] = useHover();
  return (
    <button
      {...hoverBind}
      onClick={onClick}
      style={{
        ...pdChip(false, undefined, hovered),
        padding: "1px 9px",
        fontSize: 14,
        lineHeight: 1.2,
      }}
    >
      {children}
    </button>
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
  return (
    <label style={pdInspectorRow}>
      <span style={{ color: PD.textSecondary }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <PdStepBtn onClick={() => onSet(clamp(value - 1))}>–</PdStepBtn>
        <span style={{ minWidth: 14, textAlign: "center", fontVariantNumeric: "tabular-nums", fontFamily: PD.fontMono }}>
          {value}
        </span>
        <PdStepBtn onClick={() => onSet(clamp(value + 1))}>+</PdStepBtn>
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
  img,
  active,
  title,
  onClick,
  size = 20,
}: {
  hex: string | null;
  /** An image to show INSIDE the swatch instead of a flat tone. A wall-art
   *  finish is a painting, and a dot the average colour of a Hokusai is a
   *  choice nobody can make — you have to see which picture you are picking. */
  img?: string;
  active?: boolean;
  title?: string;
  onClick: () => void;
  size?: number;
}) {
  const [hovered, hoverBind] = useHover();
  return (
    <button
      {...hoverBind}
      onClick={onClick}
      title={title}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: img ? `center / cover no-repeat url(${img})` : (hex ?? "#d8d2c4"),
        // A swatch IS its colour, so hover cannot recolour it — it lifts the
        // ring instead, and the active ring stays the accent so "selected" and
        // "under the cursor" never look like the same thing.
        border: active
          ? `2px solid ${PD.accent}`
          : `1.5px solid ${hovered ? PD.textSecondary : PD.hairline}`,
        boxShadow: active
          ? `0 0 0 2px ${PD.accentTint}`
          : hovered
            ? `0 0 0 2px ${PD.surfaceMutedHover}`
            : "none",
        transition: "border-color 140ms ease, box-shadow 140ms ease",
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
  const [hovered, hoverBind] = useHover();
  return (
    <button
      {...hoverBind}
      onClick={onClick}
      style={{
        flex: 1,
        padding: "6px 4px",
        borderRadius: PD.radiusS,
        border: "none",
        // Danger keeps its own red family on hover — deepened, not swapped for
        // the neutral grey, or the destructive button would stop reading as one
        // at the exact moment the cursor is on it.
        background:
          tone === "danger"
            ? hovered
              ? "oklch(0.32 0.1 25 / 0.55)"
              : "oklch(0.32 0.1 25 / 0.35)"
            : hovered
              ? PD.surfaceMutedHover
              : PD.surfaceMuted,
        color:
          tone === "danger"
            ? hovered
              ? "oklch(0.9 0.09 25)"
              : "oklch(0.82 0.1 25)"
            : hovered
              ? PD.textPrimary
              : PD.textSecondary,
        fontFamily: PD.fontUi,
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        transition: "background 140ms ease, color 140ms ease",
      }}
    >
      {label}
    </button>
  );
}
