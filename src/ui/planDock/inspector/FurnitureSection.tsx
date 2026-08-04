"use client";

// Furniture inspector (Plan Dock P5) — PD port of Viewport.tsx's old
// MiniInspector furniture block (name, footprint, rotation, help text), plus
// what that block never had: a real thumbnail, kind/brand/price, and
// Replace/Duplicate/Delete actions. The variant swatch row is a P6 stub here
// (VariantSwatchRow renders nothing until furniture/variants.ts exists) so
// this file's layout doesn't change shape between phases.

import type { FurnitureItem } from "@/schema/scene";
import { useSceneStore } from "@/store/useSceneStore";
import { CATALOG_BY_ID } from "@/furniture/catalog";
import { useThumbnail } from "@/furniture/thumbnails";
import { PD } from "../tokens";
import { pdToast } from "../toast";
import { pdInspectorPanel, PdHelpText, PdActionRow, PdActionButton } from "./panelKit";
import { VariantSwatchRow } from "./VariantSwatchRow";

export function FurnitureSection({ item }: { item: FurnitureItem }) {
  const spec = CATALOG_BY_ID.get(item.assetId);
  const rendered = useThumbnail(spec?.thumbnail ? "" : spec?.model ?? item.assetId);
  const thumb = spec?.thumbnail ?? rendered;
  const deg = Math.round(((item.rotation * 180) / Math.PI) % 360);
  const priceStr = spec?.price?.value != null ? `${spec.price.currency ?? "₪"}${spec.price.value.toLocaleString()}` : null;

  const onDuplicate = () => {
    useSceneStore.getState().duplicateFurniture(item.id);
    pdToast("Duplicated");
  };
  const onReplace = () => {
    const s = useSceneStore.getState();
    const id = item.id;
    s.requestDock("furniture");
    s.setReplaceTarget(id);
    pdToast("Pick a replacement in the Furniture tab");
  };
  const onDelete = () => useSceneStore.getState().deleteSelected3d();

  return (
    <div style={pdInspectorPanel}>
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
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt={spec?.name ?? item.assetId} width={44} height={44} style={{ objectFit: "contain" }} draggable={false} />
          ) : (
            <span style={{ color: PD.textTertiary, fontSize: 10 }}>…</span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {spec?.name ?? item.assetId}
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
        <PdActionButton label="Replace" onClick={onReplace} />
        <PdActionButton label="Duplicate" onClick={onDuplicate} />
        <PdActionButton label="Delete" tone="danger" onClick={onDelete} />
      </PdActionRow>

      <PdHelpText>drag to move · R rotates · Delete removes</PdHelpText>
    </div>
  );
}
