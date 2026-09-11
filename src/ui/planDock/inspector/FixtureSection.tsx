"use client";

// Lighting fixture inspector (Plan Dock P5) — PD port of Viewport.tsx's old
// MiniInspector fixture block: name, rotation, and the lux/color-temperature
// sliders, unchanged in behavior.

import { useTranslations } from "next-intl";
import type { FixtureItem } from "@/schema/scene";
import { useSceneStore } from "@/store/useSceneStore";
import { FIXTURE_CATALOG_BY_ID } from "@/fixtures/catalog";
import { pathLength } from "@/fixtures/linear";
import { DEFAULT_FIXTURE_COLOR_K, DEFAULT_FIXTURE_LUX, FIXTURE_LUX_MAX, FIXTURE_LUX_MIN } from "@/render/lightPresets";
import { PD } from "../tokens";
import { pdInspectorPanel, PdHelpText, PdRangeRow } from "./panelKit";

export function FixtureSection({ item }: { item: FixtureItem }) {
  const t = useTranslations("editor.inspector.fixture");
  // RESOLVED: the catalogue now carries `nameKey` beside `name`, the same split
  // `FurnitureAsset` uses, so the three generic fixture names translate here.
  // `name` stays as the fallback and is what the Build-mode fixture picker in
  // `src/viewport3d/FixtureCatalog.tsx` still renders — that file lives in the
  // protected tree, so it is a separate ask.
  //
  // (Original note, kept for the reasoning: it came from
  // src/fixtures/catalog.ts's plain `name: string` field (no `nameKey`,
  // unlike the furniture spec pattern) — that file was outside the worker's
  // assigned files, so the fixture catalog's 3 generic names ("Flush ceiling
  // light" etc.) were left as English pending a leader-owned follow-up.)
  const spec = FIXTURE_CATALOG_BY_ID.get(item.assetId);
  const specName = spec ? t(`names.${spec.nameKey}`) : item.assetId;
  const deg = Math.round(((item.rotation * 180) / Math.PI) % 360);
  const lux = item.targetLux ?? DEFAULT_FIXTURE_LUX;
  const colorK = item.colorK ?? DEFAULT_FIXTURE_COLOR_K;

  const patch = (label: string, p: Partial<FixtureItem>) => {
    const s = useSceneStore.getState();
    s.commitScene(label, {
      ...s.scene,
      fixtures: (s.scene.fixtures ?? []).map((f) => (f.id === item.id ? { ...f, ...p } : f)),
    });
  };

  return (
    <div style={pdInspectorPanel}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>{specName}</div>
      <div style={{ fontSize: 11.5, color: PD.textSecondary }}>{deg}°</div>
      {item.assetId === "fx:linear" && <PdHelpText>{t("stripDimensions", { length: pathLength(item.path ?? []).toFixed(2) })}</PdHelpText>}
      <PdRangeRow
        label={t("strength")}
        min={FIXTURE_LUX_MIN}
        max={FIXTURE_LUX_MAX}
        step={200}
        value={lux}
        onChange={(v) => patch("Fixture strength", { targetLux: v })}
        format={(v) => `${v} lx`}
      />
      <PdRangeRow
        label={t("color")}
        min={2000}
        max={6500}
        step={100}
        value={colorK}
        onChange={(v) => patch("Fixture color", { colorK: v })}
        format={(v) => `${v}K`}
      />
      <PdHelpText>{t("help")}</PdHelpText>
    </div>
  );
}
