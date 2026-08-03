"use client";

import { useState } from "react";
import { T } from "@/ui/tokens";
import { useSceneStore } from "@/store/useSceneStore";
import { FIXTURE_CATALOG, type FixtureAsset } from "@/fixtures/catalog";

/** A flat icon per shape — no GLB thumbnail machinery here (that's furniture-
 *  specific, coupled to CATALOG_BY_ID/spec.model): these are procedural
 *  primitives, not downloaded models. */
const SHAPE_ICON: Record<FixtureAsset["shape"], string> = {
  flushDisc: "●", // ●
  pendant: "☀",   // ☀ — stands in for a shade + bulb glow
  sconce: "◨",    // ◨ — a plate on a wall
};

function FixtureTile({ asset }: { asset: FixtureAsset }) {
  const placing = useSceneStore((s) => s.placing);
  const [hover, setHover] = useState(false);
  const active = placing?.assetId === asset.assetId;
  return (
    <button
      title={asset.name}
      onClick={() => useSceneStore.getState().setPlacing(active ? null : asset.assetId)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        padding: "6px 3px 5px",
        borderRadius: T.radiusS + 2,
        border: `1.5px solid ${active ? T.accent : "transparent"}`,
        background: active ? T.accentSoft : hover ? "rgba(255,255,255,0.07)" : "transparent",
        cursor: "pointer",
        transition: `background ${T.dur} ${T.ease}, border-color ${T.dur} ${T.ease}, transform ${T.dur} ${T.ease}`,
        transform: hover && !active ? "translateY(-1px)" : "none",
      }}
    >
      <div
        style={{
          width: 58,
          height: 58,
          borderRadius: T.radiusS,
          background: "rgba(255,255,255,0.05)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
          color: "#ffddb0",
        }}
      >
        {SHAPE_ICON[asset.shape]}
      </div>
      <span
        style={{
          fontSize: 10,
          lineHeight: 1.15,
          color: active ? T.text : T.textDim,
          textAlign: "center",
          maxWidth: 62,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {asset.name}
      </span>
    </button>
  );
}

/** Lighting sub-catalog for the Decorate "Lighting" tab — mirrors
 *  FurnitureCatalog's tile grid, without the room-section chips (there's only
 *  one section worth of assets so far). */
export function FixtureCatalog() {
  const placing = useSceneStore((s) => s.placing);
  return (
    <>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 10,
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 4,
          alignContent: "start",
        }}
      >
        {FIXTURE_CATALOG.map((asset) => (
          <FixtureTile key={asset.assetId} asset={asset} />
        ))}
      </div>
      {placing && (
        <div style={{ padding: "8px 14px 12px", color: T.textFaint, fontSize: 11.5, borderTop: `1px solid ${T.panelBorder}` }}>
          click to place · R rotates · Esc done
        </div>
      )}
    </>
  );
}
