"use client";

// Lighting fixture inspector (Plan Dock P5) — PD port of Viewport.tsx's old
// MiniInspector fixture block: name, rotation, and the lux/color-temperature
// sliders, unchanged in behavior.

import type { FixtureItem } from "@/schema/scene";
import { useSceneStore } from "@/store/useSceneStore";
import { FIXTURE_CATALOG_BY_ID } from "@/fixtures/catalog";
import { DEFAULT_FIXTURE_COLOR_K, DEFAULT_FIXTURE_LUX, FIXTURE_LUX_MAX, FIXTURE_LUX_MIN } from "@/render/lightPresets";
import { PD } from "../tokens";
import { pdInspectorPanel, PdHelpText, PdRangeRow } from "./panelKit";

export function FixtureSection({ item }: { item: FixtureItem }) {
  const spec = FIXTURE_CATALOG_BY_ID.get(item.assetId);
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
    <div role="region" aria-label={`Selected: ${spec?.name ?? item.assetId}`} style={pdInspectorPanel}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>{spec?.name ?? item.assetId}</div>
      <div style={{ fontSize: 11.5, color: PD.textSecondary }}>{deg}°</div>
      <PdRangeRow
        label="Strength"
        min={FIXTURE_LUX_MIN}
        max={FIXTURE_LUX_MAX}
        step={200}
        value={lux}
        onChange={(v) => patch("Fixture strength", { targetLux: v })}
        format={(v) => `${v} lx`}
      />
      <PdRangeRow
        label="Color"
        min={2000}
        max={6500}
        step={100}
        value={colorK}
        onChange={(v) => patch("Fixture color", { colorK: v })}
        format={(v) => `${v}K`}
      />
      <PdHelpText>drag to move · R rotates · Delete removes</PdHelpText>
    </div>
  );
}
