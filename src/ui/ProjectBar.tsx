"use client";

// Top-left "back to your projects" pill: a back chevron + the open plan's
// name, and an optional status line. Shared by the editor (src/app/design/
// page.tsx) and the live room (src/collab/CollabRoom.tsx) so both read as the
// same way back to the projects gallery — they used to be two unrelated top
// bars in two different corners. The status wording (autosave/sync) is the
// EDITOR's concern, not this component's: the room has no sync store to read,
// so it just omits `status`.

import { useState } from "react";
import { PD, pdGlass } from "./planDock/tokens";

export function ProjectBar({
  name,
  status,
  onOpenProjects,
}: {
  name: string;
  status?: string | null;
  onOpenProjects: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{
        position: "absolute",
        top: 14,
        left: 14,
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: 4,
        ...pdGlass({ borderRadius: 999 }),
      }}
    >
      <button
        onClick={onOpenProjects}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title="Back to your projects"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          border: "none",
          background: hover ? PD.surfaceMuted : "transparent",
          color: PD.textPrimary,
          cursor: "pointer",
          fontSize: 13,
          fontFamily: PD.fontUi,
          padding: "4px 10px",
          borderRadius: 999,
          transition: "background 140ms ease",
        }}
      >
        <span style={{ fontSize: 15, lineHeight: 1, color: hover ? PD.textSecondary : PD.textTertiary }}>‹</span>
        <span style={{ fontWeight: 500, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </span>
      </button>
      {status && (
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: PD.textTertiary, paddingRight: 10, fontFamily: PD.fontUi }}>
          <span style={{ color: PD.accentText }}>●</span>
          {status}
        </span>
      )}
    </div>
  );
}
