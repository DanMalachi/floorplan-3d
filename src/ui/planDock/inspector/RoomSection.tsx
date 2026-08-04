"use client";

// Room inspector (Plan Dock P5) — PD port of Viewport.tsx's old MiniInspector
// room block: area, semantics verdict + evidence, door/window/exterior-wall
// counts, and the "Understand rooms" Building Knowledge Layer trigger.

import { useState } from "react";
import type { Room } from "@/schema/scene";
import { useSceneStore } from "@/store/useSceneStore";
import { roomArea, nodeMap } from "@/lib/rooms/roomArea";
import { displayRoomType } from "@/lib/rooms/roomTaxonomy";
import { PD, pdChip } from "../tokens";
import { pdInspectorPanel, PdSectionTitle, PdHelpText } from "./panelKit";

/** Building Knowledge Layer trigger — escalates undecided rooms to the VLM.
 *  Free rule verdicts are already on the scene; this button spends API
 *  budget, so it stays an explicit user action. */
function UnderstandRoomsButton() {
  const busy = useSceneStore((s) => s.understandBusy);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <button
        style={{ ...pdChip(false), opacity: busy ? 0.6 : 1, textAlign: "center" }}
        disabled={busy}
        onClick={async () => {
          setMsg(null);
          setMsg(await useSceneStore.getState().understandRooms());
        }}
      >
        {busy ? "🧠 Understanding…" : "🧠 Understand rooms (AI)"}
      </button>
      {msg && <div style={{ color: PD.textTertiary, fontSize: 10.5 }}>{msg}</div>}
    </div>
  );
}

export function RoomSection({ room }: { room: Room }) {
  const scene = useSceneStore((s) => s.scene);
  const area = roomArea(room.loop, nodeMap(scene.nodes));
  const sem = room.semantics;
  return (
    <div style={pdInspectorPanel}>
      <PdSectionTitle title={room.name ?? "Room"} meta={`${area.toFixed(1)} m²`} />
      {sem && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={pdChip(true, { textTransform: "capitalize" })}>{displayRoomType(sem.type)}</span>
            <span style={{ color: PD.textTertiary, fontSize: 11 }}>
              {Math.round(sem.confidence * 100)}% · {sem.source}
              {sem.function ? ` · ${sem.function.replace(/_/g, " ")}` : ""}
            </span>
          </div>
          {sem.evidence.length > 0 && (
            <div style={{ color: PD.textTertiary, fontSize: 11, lineHeight: 1.5 }}>
              {sem.evidence.slice(0, 4).map((e, i) => (
                <div key={i}>
                  · {e.feature}
                  {e.value !== undefined && e.value !== true ? `: ${e.value}` : ""}
                  <span style={{ opacity: 0.6 }}> ({e.source})</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ color: PD.textTertiary, fontSize: 11 }}>
            {sem.features.doorCount} door{sem.features.doorCount === 1 ? "" : "s"} · {sem.features.windowCount} window
            {sem.features.windowCount === 1 ? "" : "s"} · {sem.features.exteriorWallCount} ext wall
            {sem.features.exteriorWallCount === 1 ? "" : "s"}
            {sem.features.hasCloset ? " · closet" : ""}
          </div>
        </>
      )}
      <UnderstandRoomsButton />
      <PdHelpText>
        Change the floor in <b style={{ color: PD.textSecondary, fontWeight: 600 }}>Decorate</b>: pick a material, click the floor.
      </PdHelpText>
    </div>
  );
}
