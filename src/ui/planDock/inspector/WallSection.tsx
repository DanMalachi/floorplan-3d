"use client";

// Wall/rail/portal inspector (Plan Dock P5) — PD port of Viewport.tsx's old
// WallInspector, plus one new control the old one never had: painted-face
// swatch chips that RE-ARM the paint brush with that face's current color,
// so touching up or extending a paint job doesn't require reopening the
// Paint tab and hunting for the exact shade again.

import { useTranslations } from "next-intl";
import { useSceneStore } from "@/store/useSceneStore";
import type { Wall } from "@/schema/scene";
import { WALL_HEIGHT, DEFAULT_THICKNESS } from "@/schema/constants";
import { PD } from "../tokens";
import { pdToast } from "../toast";
import {
  pdInspectorPanel,
  PdSectionTitle,
  PdHelpText,
  PdNumField,
  PdChip,
  pdChipFlex,
  PdSwatch,
  PdActionButton,
  PdActionRow,
} from "./panelKit";

// `labelKey`, not English text — module scope cannot call `useTranslations()`.
// Same convention as DOCK_TABS/ROOM_SCENES (BottomDock.tsx).
const KIND_LABEL_KEY = { wall: "kindWall", rail: "kindRail", portal: "kindPortal" } as const;

export function WallSection({ wall }: { wall: Wall }) {
  const t = useTranslations("editor.inspector.wall");
  const te = useTranslations("editor");
  const tu = useTranslations("editor.units");
  const scene = useSceneStore((s) => s.scene);
  const a = scene.nodes.find((n) => n.id === wall.a);
  const b = scene.nodes.find((n) => n.id === wall.b);
  const len = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  const kind = wall.kind ?? "wall";
  const isPortal = kind === "portal";

  const patch = (label: string, p: Partial<Wall>) => {
    const s = useSceneStore.getState();
    s.commitScene(label, {
      ...s.scene,
      walls: s.scene.walls.map((w) => (w.id === wall.id ? { ...w, ...p } : w)),
    });
  };
  // Converting DROPS the openings on this edge: a rail or an open boundary has
  // nothing to cut a hole in, so leaving them would strand doors in mid-air.
  const setKind = (next: "wall" | "rail" | "portal") => {
    if (next === kind) return;
    const s = useSceneStore.getState();
    // History label only — Viewport.tsx never renders it (see
    // useSceneStore's commitScene call sites), so it stays untranslated.
    s.commitScene(`Set kind: ${next}`, {
      ...s.scene,
      walls: s.scene.walls.map((w) => (w.id === wall.id ? { ...w, kind: next } : w)),
      openings: next === "wall" ? s.scene.openings : s.scene.openings.filter((o) => o.wallId !== wall.id),
    });
  };

  // Re-arm the paint brush with a face's CURRENT color (undefined -> plaster)
  // so extending an existing paint job to another wall doesn't need the Paint
  // tab reopened and the shade rediscovered.
  const armPaint = (hex: string | undefined, faceLabel: string) => {
    const s = useSceneStore.getState();
    s.setAppMode("furnish");
    s.setBrush({ kind: "paint", hex: hex ?? null });
    pdToast(t("facePaintArmed", { face: faceLabel }));
  };

  // Roll one colour over the whole plan in a single commit (one undo step), so
  // a scheme decided on one wall doesn't have to be clicked onto every face.
  // BOTH faces of every wall: side A is a wall's own local +Z, which flips with
  // the direction it happens to have been drawn in, so it carries no shared
  // inside/outside meaning — mapping A->A across the plan would paint some
  // rooms' interiors and some rooms' exteriors. Rails and portals are skipped:
  // neither has a painted face.
  const paintAllWalls = (hex: string | undefined) => {
    const s = useSceneStore.getState();
    const targets = s.scene.walls.filter((w) => (w.kind ?? "wall") === "wall");
    s.commitScene("Paint all walls", {
      ...s.scene,
      walls: s.scene.walls.map((w) =>
        (w.kind ?? "wall") === "wall" ? { ...w, paintA: hex, paintB: hex } : w,
      ),
    });
    pdToast(
      hex
        ? t("paintedHex", { count: targets.length, color: hex })
        : t("paintedPlaster", { count: targets.length }),
    );
  };
  // One button when both faces already agree; otherwise one per face, since
  // there is no way to guess which of the two the "all" is meant to spread.
  const allButtons =
    wall.paintA === wall.paintB
      ? [{ hex: wall.paintA, label: t("paintAllOne") }]
      : [
          // Worded rather than arrowed: "← A" put a directional glyph inside a
          // user-facing label, which reads as decoration and would have to
          // mirror under RTL in wave 2.
          { hex: wall.paintA, label: t("paintAllFromFace", { face: t("faceLabel", { letter: "A" }) }) },
          { hex: wall.paintB, label: t("paintAllFromFace", { face: t("faceLabel", { letter: "B" }) }) },
        ];

  return (
    <div role="region" aria-label={te("selectedRegionLabel", { name: t(KIND_LABEL_KEY[kind]) })} style={pdInspectorPanel}>
      <PdSectionTitle label={t(KIND_LABEL_KEY[kind])} meta={<bdi dir="ltr">{`${len.toFixed(2)} ${tu("m")}`}</bdi>} />
      <div role="group" aria-label={t("boundaryKindLabel")} style={{ display: "flex", gap: 4 }}>
        {(["wall", "rail", "portal"] as const).map((k) => (
          <PdChip
            key={k}
            active={kind === k}
            extra={pdChipFlex}
            onClick={() => setKind(k)}
            tip={
              k === "portal"
                ? t("tipPortal")
                : k === "rail"
                  ? t("tipRail")
                  : t("tipWall")
            }
          >
            <span aria-hidden>{k === "portal" ? "⇿" : k === "rail" ? "▭" : "▉"} </span>
            {k === "portal" ? t("chipOpen") : k === "rail" ? t(KIND_LABEL_KEY.rail) : t(KIND_LABEL_KEY.wall)}
          </PdChip>
        ))}
      </div>
      {isPortal ? (
        <PdHelpText>{t("portalHelp")}</PdHelpText>
      ) : (
        <>
          <PdNumField
            label={t("height")}
            value={wall.height ?? WALL_HEIGHT}
            onCommit={(v) => patch("Wall height", { height: Math.min(6, Math.max(0.5, v)) })}
            displayScale={100}
            unit={tu("cm")}
          />
          <PdNumField
            label={t("thickness")}
            value={wall.thickness ?? DEFAULT_THICKNESS}
            onCommit={(v) => patch("Wall thickness", { thickness: Math.min(1, Math.max(0.05, v)) })}
            displayScale={100}
            unit={tu("cm")}
          />
          {kind === "wall" && (
            <>
              <div role="group" aria-label={t("facesLabel")} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: PD.textSecondary, fontSize: 11.5 }}>{t("facesLabel")}</span>
                <PdSwatch
                  hex={wall.paintA ?? null}
                  tip={t("faceTip", { face: t("faceLabel", { letter: "A" }) })}
                  onClick={() => armPaint(wall.paintA, t("faceLabel", { letter: "A" }))}
                />
                <PdSwatch
                  hex={wall.paintB ?? null}
                  tip={t("faceTip", { face: t("faceLabel", { letter: "B" }) })}
                  onClick={() => armPaint(wall.paintB, t("faceLabel", { letter: "B" }))}
                />
              </div>
              <PdActionRow>
                {allButtons.map((b) => (
                  <PdActionButton key={b.label} label={b.label} onClick={() => paintAllWalls(b.hex)} />
                ))}
              </PdActionRow>
              <PdHelpText>
                {t.rich("paintHelp", {
                  b: (chunks) => <b style={{ color: PD.textSecondary, fontWeight: 600 }}>{chunks}</b>,
                })}
              </PdHelpText>
            </>
          )}
        </>
      )}
    </div>
  );
}
