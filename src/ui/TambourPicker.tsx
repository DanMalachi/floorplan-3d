"use client";

import { useEffect, useMemo, useState } from "react";
import {
  loadTambourColors,
  groupByFamily,
  type TambourColor,
  type TambourFamily,
} from "@/lib/tambourColors";
import { T, glass, field, microLabel } from "@/ui/tokens";

// Display order + bilingual labels for the eight fan families.
const FAMILY_META: { slug: TambourFamily; en: string; he: string }[] = [
  { slug: "white", en: "White", he: "לבנים" },
  { slug: "red", en: "Red", he: "אדומים" },
  { slug: "orange", en: "Orange", he: "כתומים" },
  { slug: "yellow", en: "Yellow", he: "צהובים" },
  { slug: "green", en: "Green", he: "ירוקים" },
  { slug: "blue", en: "Blue", he: "כחולים" },
  { slug: "purple", en: "Purple", he: "סגולים" },
  { slug: "neutral", en: "Neutral", he: "נייטרלים" },
];

/**
 * Tambour fan-deck swatch picker, grouped by family. The 1651-shade dataset is
 * lazy-loaded the first time this panel mounts (it's code-split out of the main
 * bundle), so nothing is fetched until the user opens the picker. It's a
 * controlled component: `value` is the currently-applied hex (or null for
 * plaster) and `onPick` fires with a hex — or null to reset — for the caller to
 * apply to whatever it's painting (here, one face of the selected wall).
 */
export function TambourPicker({
  value,
  onPick,
  onClose,
  label,
}: {
  value: string | null;
  onPick: (hex: string | null) => void;
  onClose: () => void;
  /** What's being painted, e.g. "Side A" / "Both sides" — shown in the header. */
  label?: string;
}) {
  const paintColor = value;
  const setPaintColor = onPick;

  const [colors, setColors] = useState<TambourColor[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    loadTambourColors().then((c) => alive && setColors(c));
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!colors) return [];
    const q = query.trim().toLowerCase();
    if (!q) return colors;
    return colors.filter(
      (c) => c.code.toLowerCase().includes(q) || c.nameEn.toLowerCase().includes(q),
    );
  }, [colors, query]);

  const grouped = useMemo(() => groupByFamily(filtered), [filtered]);
  const selected = colors?.find((c) => c.hex === paintColor) ?? null;

  return (
    <div
      style={{
        position: "absolute",
        top: 64,
        left: 14,
        bottom: 14,
        zIndex: 40,
        width: 320,
        display: "flex",
        flexDirection: "column",
        ...glass({ borderRadius: T.radiusL }),
      }}
    >
      {/* header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px 10px",
          borderBottom: `1px solid ${T.panelBorder}`,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
            Tambour paint{label ? ` · ${label}` : ""}
          </span>
          <span style={{ fontSize: 11, color: T.textFaint }}>
            {colors ? `${colors.length} shades` : "loading…"}
          </span>
        </div>
        <button
          onClick={onClose}
          title="Close"
          style={{
            border: "none",
            background: T.inputBg,
            color: T.textDim,
            cursor: "pointer",
            width: 26,
            height: 26,
            borderRadius: 999,
            fontSize: 15,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* current selection + reset */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          borderBottom: `1px solid ${T.panelBorder}`,
        }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            flexShrink: 0,
            background: selected?.hex ?? "#d8d2c4",
            border: `1px solid ${T.panelBorder}`,
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 12.5, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {selected ? selected.nameEn : "Default plaster"}
          </span>
          <span style={{ fontSize: 11, color: T.textFaint }}>
            {selected ? `${selected.code} · ${selected.hex}` : "no paint"}
          </span>
        </div>
        {paintColor && (
          <button
            onClick={() => setPaintColor(null)}
            style={{
              border: `1px solid ${T.panelBorder}`,
              background: T.inputBg,
              color: T.textDim,
              cursor: "pointer",
              fontSize: 11.5,
              padding: "4px 9px",
              borderRadius: T.radiusS,
              fontFamily: T.font,
            }}
          >
            Reset
          </button>
        )}
      </div>

      {/* search */}
      <div style={{ padding: "10px 14px 4px" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search code or name…"
          style={field({ width: "100%", boxSizing: "border-box" })}
        />
      </div>

      {/* swatch families */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px 14px" }}>
        {!colors && <p style={{ fontSize: 12, color: T.textFaint }}>Loading fan deck…</p>}
        {colors && filtered.length === 0 && (
          <p style={{ fontSize: 12, color: T.textFaint }}>No shades match “{query}”.</p>
        )}
        {FAMILY_META.map(({ slug, en, he }) => {
          const items = grouped[slug];
          if (!items || items.length === 0) return null;
          return (
            <section key={slug} style={{ marginTop: 12 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 7,
                }}
              >
                <span style={microLabel(T.textDim)}>
                  {he} · {en}
                </span>
                <span style={{ fontSize: 10, color: T.textFaint }}>{items.length}</span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(26px, 1fr))",
                  gap: 6,
                }}
              >
                {items.map((c) => {
                  const active = c.hex === paintColor;
                  return (
                    <button
                      key={c.code}
                      onClick={() => setPaintColor(c.hex)}
                      title={`${c.code} · ${c.nameEn}`}
                      style={{
                        aspectRatio: "1 / 1",
                        borderRadius: 6,
                        background: c.hex,
                        cursor: "pointer",
                        padding: 0,
                        border: active ? `2px solid ${T.accent}` : "1px solid rgba(0,0,0,0.18)",
                        boxShadow: active ? `0 0 0 2px ${T.accentSoft}` : "none",
                        transition: `transform ${T.dur} ${T.ease}`,
                      }}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
