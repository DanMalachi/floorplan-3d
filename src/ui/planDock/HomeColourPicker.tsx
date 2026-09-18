"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSceneStore } from "@/store/useSceneStore";
import {
  COLOUR_FAMILIES,
  colourNeighbours,
  filterColours,
  loadHomeColours,
  localizedColourName,
  type ColourFamily,
  type ColourFilters,
  type ColourSwatch,
  type LightnessBand,
  type SaturationBand,
  type Warmth,
} from "@/lib/homeColours";
import { PD } from "./tokens";
import styles from "./HomeColourPicker.module.css";

const FAMILY_COLOURS: Record<ColourFamily, string> = {
  whites: "#eeeae0",
  neutrals: "#aaa59d",
  blacks: "#292929",
  beiges: "#c6aa7b",
  greens: "#788c6b",
  blues: "#69829d",
  warm_earth: "#a96c59",
  yellows: "#b99a4f",
  reds: "#8d4b49",
  purples: "#735b72",
};

const initialFilters: ColourFilters = { family: "all", warmth: "all", lightness: "all", saturation: "all", use: "all", query: "" };

function FilterMenu<T extends string>({ label, value, values, onChange, text }: { label: string; value: T; values: T[]; onChange: (value: T) => void; text: (value: T) => string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeFromOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={styles.filterWrap}>
      <button
        type="button"
        className={styles.filterButton}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span><span className={styles.filterLabel}>{label}</span> · <span className={styles.filterValue}>{text(value)}</span></span>
        <span aria-hidden className={styles.chevron}>⌄</span>
      </button>
      {open && (
        <div className={styles.filterMenu} role="listbox" aria-label={label}>
          {values.map((item) => (
            <button
              key={item}
              type="button"
              role="option"
              aria-selected={item === value}
              className={styles.filterOption}
              onClick={() => { onChange(item); setOpen(false); }}
            >
              {text(item)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Swatch({ swatch, selected, label, onPick, size = 26 }: { swatch: ColourSwatch; selected: boolean; label: string; onPick: (swatch: ColourSwatch) => void; size?: number }) {
  return (
    <button
      type="button"
      className={styles.swatch}
      aria-label={label}
      aria-pressed={selected}
      onClick={() => onPick(swatch)}
      style={{
        width: size,
        height: size,
        flex: "0 0 auto",
        borderRadius: size > 28 ? 8 : 6,
        border: selected ? `2px solid ${PD.accent}` : "1px solid oklch(1 0 0 / 0.16)",
        outline: selected ? "1px solid oklch(1 0 0 / 0.72)" : "none",
        outlineOffset: -3,
        background: swatch.hex,
        cursor: "pointer",
        padding: 0,
      }}
    />
  );
}

export function HomeColourPicker() {
  const t = useTranslations("editor.dock.paint");
  const locale = useLocale();
  const brush = useSceneStore((state) => state.brush);
  const forFrames = brush?.kind === "frame";
  const activeHex = brush?.kind === "paint" || brush?.kind === "frame" ? brush.hex : undefined;
  const [swatches, setSwatches] = useState<ColourSwatch[] | null>(null);
  const [filters, setFilters] = useState<ColourFilters>(initialFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadHomeColours().then((items) => {
      if (!alive) return;
      setSwatches(items);
      const active = items.find((item) => item.hex.toLowerCase() === activeHex?.toLowerCase());
      setSelectedId((current) => current ?? active?.id ?? items[0]?.id ?? null);
    });
    return () => { alive = false; };
  }, [activeHex]);

  const selected = useMemo(() => swatches?.find((item) => item.id === selectedId) ?? null, [selectedId, swatches]);
  const visible = useMemo(() => swatches ? filterColours(swatches, filters, locale) : [], [filters, locale, swatches]);
  const neighbours = useMemo(() => selected && swatches ? colourNeighbours(selected, swatches) : null, [selected, swatches]);
  const setFilter = <K extends keyof ColourFilters>(key: K, value: ColourFilters[K]) => setFilters((current) => ({ ...current, [key]: value }));
  const apply = (swatch: ColourSwatch) => {
    setSelectedId(swatch.id);
    if (forFrames) useSceneStore.getState().setFrameColor(swatch.hex);
    else useSceneStore.getState().setBrush({ kind: "paint", hex: swatch.hex });
  };
  const clear = () => {
    setSelectedId(null);
    if (forFrames) useSceneStore.getState().setFrameColor(null);
    else useSceneStore.getState().setBrush({ kind: "paint", hex: null });
  };

  const filterStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 5, minHeight: 26 };
  const familyButton = (active: boolean): CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 5, flex: "0 0 auto", height: 24, padding: "0 7px", borderRadius: 999,
    border: `1px solid ${active ? PD.accent : PD.hairline}`, background: active ? PD.accentTint : PD.surfaceMuted,
    color: active ? PD.accentText : PD.textSecondary, fontFamily: PD.fontUi, fontSize: 9.5, cursor: "pointer", whiteSpace: "nowrap",
  });

  return (
    <div dir={locale === "he" ? "rtl" : "ltr"} style={{ flex: 1, minHeight: 0, display: "flex", gap: 10, overflow: "hidden", fontFamily: PD.fontUi }}>
      <section aria-label={t("preview")} style={{ width: 200, flex: "0 0 200px", display: "flex", flexDirection: "column", gap: 5, minHeight: 0 }}>
        <div
          className={styles.preview}
          style={{
            flex: "1 1 76px", minHeight: 54, borderRadius: 10, border: `1px solid ${PD.hairline}`, overflow: "hidden", position: "relative",
            background: selected?.hex ?? "#f3ece1",
          }}
        >
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(115deg, oklch(1 0 0 / .22), transparent 45%, oklch(0 0 0 / .14))" }} />
          <div style={{ position: "absolute", insetInline: 8, bottom: 7, color: (selected?.lightness ?? 90) < 52 ? "white" : "#171717", textShadow: (selected?.lightness ?? 90) < 52 ? "0 1px 3px #000" : "0 1px 2px #fff" }}>
            <div style={{ fontSize: 11, fontWeight: 700 }}>{selected ? localizedColourName(selected, locale) : t(forFrames ? "tipNatural" : "tipPlaster")}</div>
            {selected && <code dir="ltr" style={{ fontSize: 8.5, opacity: 0.8 }}>{selected.id}</code>}
          </div>
        </div>
        {selected && neighbours && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {(["lighter", "darker", "warmer", "cooler"] as const).map((kind) => {
              const item = neighbours[kind];
              return item ? <Swatch key={kind} swatch={item} selected={false} label={`${t(`neighbours.${kind}`)}: ${localizedColourName(item, locale)}`} onPick={apply} size={24} /> : null;
            })}
            <span style={{ fontSize: 8.5, color: PD.textTertiary }}>{t("neighbours.similar")}</span>
            {neighbours.similar.slice(0, 3).map((item) => <Swatch key={item.id} swatch={item} selected={false} label={`${t("neighbours.similar")}: ${localizedColourName(item, locale)}`} onPick={apply} size={20} />)}
          </div>
        )}
        <p style={{ margin: 0, fontSize: 8.5, lineHeight: 1.25, color: PD.textTertiary }}>{t("disclaimer")}</p>
      </section>

      <section style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ ...filterStyle, overflow: "visible" }}>
          <input
            className={styles.search}
            value={filters.query}
            onChange={(event) => setFilter("query", event.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
            style={{ width: 145, height: 24, boxSizing: "border-box", border: `1px solid ${PD.hairline}`, borderRadius: 7, background: PD.inputBg, color: PD.textPrimary, fontSize: 9.5, paddingInline: 7 }}
          />
          <FilterMenu label={t("filters.warmth.label")} value={filters.warmth} values={["all", "warm", "neutral", "cool"] as Warmth[]} onChange={(value) => setFilter("warmth", value)} text={(value) => t(`filters.warmth.${value}`)} />
          <FilterMenu label={t("filters.lightness.label")} value={filters.lightness} values={["all", "light", "mid", "dark"] as LightnessBand[]} onChange={(value) => setFilter("lightness", value)} text={(value) => t(`filters.lightness.${value}`)} />
          <FilterMenu label={t("filters.saturation.label")} value={filters.saturation} values={["all", "low", "medium", "high"] as SaturationBand[]} onChange={(value) => setFilter("saturation", value)} text={(value) => t(`filters.saturation.${value}`)} />
        </div>
        <div className={styles.scroller} style={{ ...filterStyle, overflowX: "auto" }}>
          <button className={styles.familyButton} type="button" onClick={() => setFilter("family", "all")} style={familyButton(filters.family === "all")}>{t("allHomeColours")}</button>
          {COLOUR_FAMILIES.map((family) => (
            <button className={styles.familyButton} key={family} type="button" onClick={() => setFilter("family", family)} style={familyButton(filters.family === family)}>
              <span aria-hidden style={{ width: 9, height: 9, borderRadius: "50%", background: FAMILY_COLOURS[family], border: "1px solid oklch(1 0 0 / .25)" }} />
              {t(`families.${family}`)}
            </button>
          ))}
          {(filters.family !== "all" || filters.warmth !== "all" || filters.lightness !== "all" || filters.saturation !== "all" || filters.query) && (
            <button className={styles.familyButton} type="button" onClick={() => setFilters(initialFilters)} style={familyButton(false)}>{t("clearFilters")}</button>
          )}
        </div>
        <div role="status" style={{ fontSize: 8.5, color: PD.textTertiary }}>{swatches ? t("resultCount", { count: visible.length }) : t("loading")}</div>
        <div className={styles.scroller} style={{ flex: 1, minHeight: 0, display: "flex", flexWrap: "wrap", gap: 4, overflowY: "auto", alignContent: "flex-start", paddingBlockEnd: 3 }}>
          <button
            type="button"
            className={styles.resetSwatch}
            aria-label={t(forFrames ? "tipNatural" : "tipPlaster")}
            aria-pressed={selectedId === null && activeHex === null}
            onClick={clear}
            style={{ width: 26, height: 26, flex: "0 0 auto", borderRadius: 6, border: selectedId === null && activeHex === null ? `2px solid ${PD.accent}` : `1px solid ${PD.hairline}`, background: "linear-gradient(135deg, #f3ece1 46%, #9b958e 48%, #9b958e 52%, #f3ece1 54%)", cursor: "pointer" }}
          />
          {visible.map((swatch) => <Swatch key={swatch.id} swatch={swatch} selected={selected?.id === swatch.id} label={`${localizedColourName(swatch, locale)} · ${swatch.id}`} onPick={apply} />)}
          {swatches && visible.length === 0 && <div style={{ padding: 6, color: PD.textTertiary, fontSize: 10 }}>{t("noResults")}</div>}
        </div>
      </section>
    </div>
  );
}
