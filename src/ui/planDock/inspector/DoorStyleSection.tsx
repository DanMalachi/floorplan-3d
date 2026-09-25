"use client";

// Door style: what a solid door looks like (design, material, hardware,
// glass, trim). One look for the whole house per kind (interior / entry), any
// door can override it, and any door's look can be pushed to the whole house.
// See src/doors/look.ts for the model; the renderer is src/doors/.

import { useEffect, useState, type CSSProperties } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSceneStore } from "@/store/useSceneStore";
import type { Opening } from "@/schema/scene";
import {
  applyLookToKind,
  doorKinds,
  houseLooks,
  lookKey,
  GLAZED_DESIGNS,
  resolveDoorLook,
  type DoorDesign,
  type DoorLook,
  type DoorSurface,
  type GlassId,
  type HandleId,
  type MetalId,
  type PolymerId,
  type Sheen,
  type TrimId,
  type VeneerId,
} from "@/doors/look";
import { LOOK_PRESETS } from "@/doors/presets";
import { loadHomeColours, localizedColourName, type ColourSwatch } from "@/lib/homeColours";
import { PdChip, PdSwatch, PdActionRow, PdActionButton, pdChipFlex } from "./panelKit";
import { pdMicroLabel, PD } from "../tokens";

const DESIGNS: DoorDesign[] = [
  "flush", "flush-grooves", "flush-inlay", "planked", "shaker", "shaker-3", "panel-2", "panel-5", "raised-4",
  "glass-full", "glass-grid", "glass-lites", "glass-slot", "french",
  "entry-slab", "entry-grooves", "entry-lines", "entry-slot", "entry-grille",
];
const SPECIES: VeneerId[] = [
  "white-oak", "natural-oak", "rift-oak", "smoked-oak", "grey-oak", "black-oak",
  "american-walnut", "european-walnut", "figured-walnut", "ash", "white-maple",
  "cherry", "teak", "sapele", "flamed-black",
];
const POLYMERS: PolymerId[] = ["hpl", "supermatte", "upvc", "fibreglass"];
const HANDLES: HandleId[] = ["lever-round", "lever-square", "lever-plate", "knob", "pull-bar", "pull-bar-long", "pull-recessed", "none"];
const METALS: MetalId[] = [
  "stainless-brushed", "stainless-polished", "chrome", "nickel-satin", "brass-satin",
  "brass-polished", "bronze", "copper", "aluminium-anodised", "black-matte", "gunmetal",
];
const GLASSES: GlassId[] = ["clear", "frosted", "fluted", "reeded", "textured", "bronze", "grey"];
const TRIMS: TrimId[] = ["flat", "stepped", "classic", "minimal"];
const SHEENS: Sheen[] = ["matte", "satin", "gloss"];
type SurfaceKind = DoorSurface["kind"];
const KINDS: SurfaceKind[] = ["paint", "wood", "powder", "polymer", "metal"];

/** A curated row from the done. Home Colours fan (ids resolve exactly). */
const DOOR_COLOUR_IDS = [
  "done-whites-clean-neutral-white-02", "done-whites-chalk-white-02", "done-whites-warm-ivory-03",
  "done-whites-warm-ivory-08", "done-neutrals-olive-taupe-04", "done-neutrals-neutral-grey-07",
  "done-neutrals-mineral-plaster-12", "done-neutrals-smoke-grey-12", "done-blacks-neutral-near-black-03",
  "done-blacks-neutral-near-black-06", "done-greens-grey-sage-07", "done-greens-grey-sage-11",
  "done-whites-chalk-white-07", "done-neutrals-sand-grey-10", "done-blues-slate-blue-09",
  "done-blues-architectural-blue-grey-07", "done-blues-architectural-blue-grey-12",
  "done-warm_earth-heritage-clay-08", "done-reds-burgundy-08",
];

const selectStyle: CSSProperties = {
  width: "100%",
  padding: "5px 6px",
  borderRadius: PD.radiusS,
  border: `1px solid ${PD.hairline}`,
  background: PD.surfaceMuted,
  color: PD.textPrimary,
  font: "inherit",
  fontSize: 12,
};

function Select<T extends string>({ label, value, options, name, onChange }: {
  label: string;
  value: T;
  options: readonly T[];
  name: (v: T) => string;
  onChange: (v: T) => void;
}) {
  return (
    <label style={{ display: "grid", gap: 3 }}>
      <span style={pdMicroLabel()}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} style={selectStyle}>
        {options.map((o) => (
          <option key={o} value={o} style={{ color: "#111" }}>{name(o)}</option>
        ))}
      </select>
    </label>
  );
}

/** Carry a colour across material kinds where it means something. */
function surfaceOfKind(kind: SurfaceKind, prev: DoorSurface): DoorSurface {
  const color = "color" in prev ? prev.color : "#f4efea";
  const sheen: Sheen = "sheen" in prev ? prev.sheen : "satin";
  switch (kind) {
    case "wood": return { kind, species: prev.kind === "wood" ? prev.species : "natural-oak", sheen };
    case "paint": return { kind, color, sheen };
    case "powder": return { kind, color: prev.kind === "wood" ? "#242424" : color, sheen };
    case "polymer": return { kind, color, polymer: prev.kind === "polymer" ? prev.polymer : "hpl" };
    case "metal": return { kind, metal: prev.kind === "metal" ? prev.metal : "stainless-brushed" };
  }
}

export function DoorStyleSection({ opening }: { opening: Opening }) {
  const t = useTranslations("editor.opening.doorStyle");
  const locale = useLocale();
  const scene = useSceneStore((s) => s.scene);
  const { look, kind } = resolveDoorLook(scene, opening);
  // "Own" = differs from the house look. After "use on all doors" every door
  // carries the look itself, and still IS the house style.
  const own = lookKey(look) !== lookKey(houseLooks(scene)[kind]);
  // doorKinds is cached per scene object, so this is a map walk, not a solve.
  let sameKind = 0;
  for (const k of doorKinds(scene).values()) if (k === kind) sameKind++;

  const [colours, setColours] = useState<ColourSwatch[]>([]);
  useEffect(() => {
    let live = true;
    void loadHomeColours().then((all) => {
      if (!live) return;
      const byId = new Map(all.map((s) => [s.id, s]));
      setColours(DOOR_COLOUR_IDS.map((id) => byId.get(id)).filter((s): s is ColourSwatch => !!s));
    });
    return () => {
      live = false;
    };
  }, []);

  // Every edit here is THIS door's: it takes the whole resolved look with the
  // one change, so the door keeps reading the same whatever the house does.
  const setLook = (label: string, next: DoorLook) => {
    const s = useSceneStore.getState();
    s.commitScene(label, {
      ...s.scene,
      openings: s.scene.openings.map((o) => {
        if (o.id !== opening.id) return o;
        const n: Opening = { ...o, door: next };
        delete n.doorMaterial;
        return n;
      }),
    });
  };
  const edit = (label: string, p: Partial<DoorLook>) => setLook(label, { ...look, ...p });
  const editSurface = (label: string, surface: DoorSurface) => edit(label, { surface });

  const applyToHouse = () => {
    const s = useSceneStore.getState();
    s.commitScene(`Door style: all ${kind} doors`, applyLookToKind(s.scene, kind, look));
  };
  const useHouse = () => {
    const s = useSceneStore.getState();
    s.commitScene("Door style: house", {
      ...s.scene,
      openings: s.scene.openings.map((o) => {
        if (o.id !== opening.id) return o;
        const n: Opening = { ...o };
        delete n.door;
        delete n.doorMaterial;
        return n;
      }),
    });
  };

  const surf = look.surface;
  const presetNow = Object.entries(LOOK_PRESETS).find(([, l]) => lookKey(l) === lookKey(look))?.[0] ?? "custom";
  const hasColour = surf.kind === "paint" || surf.kind === "powder" || surf.kind === "polymer";

  return (
    <div style={{ display: "grid", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
        <span style={pdMicroLabel()}>{t("title")}</span>
        <span style={{ fontSize: 11, color: PD.textSecondary }}>
          {own ? t("thisDoor") : kind === "entry" ? t("houseEntry") : t("houseInterior")}
        </span>
      </div>

      <Select
        label={t("style")}
        value={presetNow}
        options={["custom", ...Object.keys(LOOK_PRESETS)]}
        name={(v) => t(`presets.${v}`)}
        onChange={(v) => v !== "custom" && setLook(`Door style: ${v}`, LOOK_PRESETS[v])}
      />
      <Select label={t("design")} value={look.design} options={DESIGNS} name={(v) => t(`designs.${v}`)} onChange={(v) => edit("Door design", { design: v })} />

      <span style={pdMicroLabel()}>{t("material")}</span>
      <div role="group" aria-label={t("material")} style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {KINDS.map((k) => (
          <PdChip key={k} active={surf.kind === k} extra={pdChipFlex} tip={t(`kinds.${k}Tip`)} onClick={() => editSurface("Door material", surfaceOfKind(k, surf))}>
            {t(`kinds.${k}`)}
          </PdChip>
        ))}
      </div>

      {surf.kind === "wood" && (
        <Select label={t("species")} value={surf.species} options={SPECIES} name={(v) => t(`species.${v}`)} onChange={(v) => editSurface("Door wood", { ...surf, species: v })} />
      )}
      {surf.kind === "polymer" && (
        <Select label={t("polymer")} value={surf.polymer} options={POLYMERS} name={(v) => t(`polymers.${v}`)} onChange={(v) => editSurface("Door laminate", { ...surf, polymer: v })} />
      )}
      {surf.kind === "metal" && (
        <Select label={t("metal")} value={surf.metal} options={METALS} name={(v) => t(`metals.${v}`)} onChange={(v) => editSurface("Door metal", { ...surf, metal: v })} />
      )}
      {hasColour && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {colours.map((c) => (
            <PdSwatch
              key={c.id}
              hex={c.hex}
              size={18}
              active={"color" in surf && surf.color.toLowerCase() === c.hex.toLowerCase()}
              tip={localizedColourName(c, locale)}
              onClick={() => editSurface("Door colour", { ...surf, color: c.hex })}
            />
          ))}
        </div>
      )}
      {(surf.kind === "wood" || surf.kind === "paint" || surf.kind === "powder") && (
        <div role="group" aria-label={t("sheen")} style={{ display: "flex", gap: 4 }}>
          {SHEENS.map((sh) => (
            <PdChip key={sh} active={surf.sheen === sh} extra={pdChipFlex} onClick={() => editSurface("Door sheen", { ...surf, sheen: sh })}>
              {t(`sheens.${sh}`)}
            </PdChip>
          ))}
        </div>
      )}

      {surf.kind === "powder" && (
        <PdChip
          active={!!surf.metallic}
          tip={t("metallicTip")}
          onClick={() => editSurface("Door metallic", { ...surf, metallic: !surf.metallic })}
        >
          {t("metallic")}
        </PdChip>
      )}

      <Select label={t("handle")} value={look.handle} options={HANDLES} name={(v) => t(`handles.${v}`)} onChange={(v) => edit("Door handle", { handle: v })} />
      <Select label={t("hardware")} value={look.hardware} options={METALS} name={(v) => t(`metals.${v}`)} onChange={(v) => edit("Door hardware", { hardware: v })} />
      {GLAZED_DESIGNS.has(look.design) && (
        <Select label={t("glass")} value={look.glass} options={GLASSES} name={(v) => t(`glass.${v}`)} onChange={(v) => edit("Door glass", { glass: v })} />
      )}
      {kind === "entry" && (
        <PdChip active={!!look.sidelight} tip={t("sidelightTip")} onClick={() => edit("Door sidelight", { sidelight: !look.sidelight })}>
          {t("sidelight")}
        </PdChip>
      )}
      <Select label={t("trim")} value={look.trim} options={TRIMS} name={(v) => t(`trims.${v}`)} onChange={(v) => edit("Door trim", { trim: v })} />

      <PdActionRow>
        <PdActionButton label={kind === "entry" ? t("applyEntry", { n: sameKind }) : t("applyInterior", { n: sameKind })} onClick={applyToHouse} />
      </PdActionRow>
      {own && (
        <PdActionRow>
          <PdActionButton label={t("useHouse")} onClick={useHouse} />
        </PdActionRow>
      )}
    </div>
  );
}
