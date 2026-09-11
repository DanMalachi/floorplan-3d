"use client";

// Furniture inspector (Plan Dock P5) — PD port of Viewport.tsx's old
// MiniInspector furniture block (name, footprint, rotation, help text), plus
// what that block never had: a real thumbnail, kind/brand/price, and
// Replace/Duplicate/Delete actions. The variant swatch row is a P6 stub here
// (VariantSwatchRow renders nothing until furniture/variants.ts exists) so
// this file's layout doesn't change shape between phases.

import { useLocale, useTranslations } from "next-intl";
import type { FurnitureItem } from "@/schema/scene";
import { useSceneStore } from "@/store/useSceneStore";
import { specOf } from "@/furniture/spec";
import { useThumbnail } from "@/furniture/thumbnails";
import { PD } from "../tokens";
import { pdToast } from "../toast";
import { pdInspectorPanel, PdHelpText, PdActionRow, PdActionButton } from "./panelKit";
import { VariantSwatchRow } from "./VariantSwatchRow";

export function FurnitureSection({ item }: { item: FurnitureItem }) {
  const locale = useLocale();
  const tp = useTranslations("editor.parametric");
  const tt = useTranslations("editor.toast");
  const spec = specOf(item);
  // `nameKey` for a generator (translatable description), `name` for a real
  // product (a proper noun that must not be translated).
  const specName = spec?.nameKey ? tp(spec.nameKey) : spec?.name;
  const rendered = useThumbnail(spec?.thumbnail ? "" : spec?.model ?? item.assetId);
  const thumb = spec?.thumbnail ?? rendered;
  const deg = Math.round(((item.rotation * 180) / Math.PI) % 360);
  const priceStr = spec?.price?.value != null ? `${spec.price.currency ?? "₪"}${spec.price.value.toLocaleString(locale)}` : null;

  const onDuplicate = () => {
    useSceneStore.getState().duplicateFurniture(item.id);
    pdToast(tt("duplicated"));
  };
  const onReplace = () => {
    const s = useSceneStore.getState();
    const id = item.id;
    s.requestDock("furniture");
    s.setReplaceTarget(id);
    pdToast(tt("pickReplacement"));
  };
  const onDelete = () => useSceneStore.getState().deleteSelected3d();

  return (
    // A labelled region, so the panel that appears on selection is findable by
    // landmark rather than only by tabbing past everything above it.
    <div role="region" aria-label={`Selected: ${spec?.name ?? item.assetId}`} style={pdInspectorPanel}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div
          style={{
            width: 46,
            height: 46,
            flex: "0 0 auto",
            borderRadius: 8,
            background: PD.surfaceMuted,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {thumb ? (
            // Decorative: the item's name is right beside it as real text, so a
            // matching alt would just say it twice.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" width={44} height={44} style={{ objectFit: "contain" }} draggable={false} />
          ) : (
            <span style={{ color: PD.textTertiary, fontSize: 10 }}>…</span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {specName ?? item.assetId}
          </div>
          {spec?.kind && <div style={{ fontSize: 10.5, color: PD.textTertiary }}>{spec.kind}</div>}
          {(spec?.brand || priceStr) && (
            <div style={{ fontSize: 10.5, color: PD.textTertiary }}>
              {spec?.brand}
              {spec?.brand && priceStr ? " · " : ""}
              {priceStr}
            </div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: PD.textSecondary }}>
        {spec ? `${spec.footprint.w} × ${spec.footprint.d} m · ` : ""}
        {deg}°
      </div>

      <VariantSwatchRow item={item} />

      <PdActionRow>
        <PdActionButton label={tp("replace")} onClick={onReplace} />
        <PdActionButton label={tp("duplicate")} onClick={onDuplicate} />
        <PdActionButton label={tp("delete")} tone="danger" onClick={onDelete} />
      </PdActionRow>

      {/* Shares `editor.parametric`'s action and help keys rather than owning a
          second copy: the two panels render the same three buttons and the same
          sentence, and two catalogue entries for one string is how they drift. */}
      <PdHelpText>{tp("helpMoveRotate")}</PdHelpText>
    </div>
  );
}
