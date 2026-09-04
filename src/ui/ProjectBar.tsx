"use client";

// Top-left "back to your projects" pill: a back chevron + the open plan's
// name, and an optional status line. Shared by the editor (src/app/design/
// page.tsx) and the live room (src/collab/CollabRoom.tsx) so both read as the
// same way back to the projects gallery — they used to be two unrelated top
// bars in two different corners. The status wording (autosave/sync) is the
// EDITOR's concern, not this component's: the room has no sync store to read,
// so it just omits `status`.

import { PD, pdGlass } from "./planDock/tokens";
import { useHover } from "./planDock/useHover";
import { Tooltip } from "./planDock/Tooltip";
import { ChevronLeftIcon } from "./planDock/icons";

export function ProjectBar({
  name,
  status,
  onOpenProjects,
}: {
  name: string;
  status?: string | null;
  onOpenProjects: () => void;
}) {
  // This button's hand-rolled hover was the only one in the product; it is now
  // the shared `useHover` hook, and every other control follows it.
  const [hover, hoverBind] = useHover();
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
      {/* `placement="bottom"`: this pill is pinned at top:14, so a tooltip above
          it would be clipped off the top of the window. */}
      <Tooltip label="Back to your projects" placement="bottom">
        <button
          onClick={onOpenProjects}
          {...hoverBind}
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
          <span style={{ lineHeight: 0, color: hover ? PD.textSecondary : PD.textTertiary, transition: "color 140ms ease" }}>
            <ChevronLeftIcon size={14} />
          </span>
          <span style={{ fontWeight: 500, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name}
          </span>
        </button>
      </Tooltip>
      {status && (
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: PD.textTertiary, paddingRight: 10, fontFamily: PD.fontUi }}>
          {/* A status light, so it is a drawn circle rather than the `●`
              character it replaces — a text bullet reflows with the font. */}
          <span
            aria-hidden
            style={{ width: 6, height: 6, borderRadius: 999, background: PD.accentText, flex: "0 0 auto" }}
          />
          {status}
        </span>
      )}
    </div>
  );
}
