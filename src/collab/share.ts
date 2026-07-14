// Client-safe share primitives (no secret). A share link carries a signed grant
// in ?g=; the role inside decides which modes the viewer may use. The grant is
// verified server-side in /api/liveblocks-auth (this file only READS the role for
// UI gating — it is not the security boundary).

import type { AppMode } from "@/store/useSceneStore";

export type ShareRole = "view" | "decorate" | "build";

/** App modes each role may use (View is always allowed). */
export const ROLE_MODES: Record<ShareRole, AppMode[]> = {
  view: ["view"],
  decorate: ["view", "furnish"],
  build: ["build", "furnish", "view"],
};

export const ROLE_LABEL: Record<ShareRole, string> = {
  view: "Can view",
  decorate: "Can view + decorate",
  build: "Can edit everything",
};

/** Liveblocks room id for a share id. */
export const lbRoom = (id: string) => `floorplan-${id}`;

/** Read the role out of a grant for UI gating. No grant = full (host/dev). */
export function roleFromGrant(grant: string | null | undefined): ShareRole {
  if (!grant) return "build";
  try {
    const body = grant.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    const role = JSON.parse(atob(body)).role;
    return role === "view" || role === "decorate" || role === "build" ? role : "build";
  } catch {
    return "build";
  }
}

/** POST /api/share to mint a signed grant for (room, role). */
export async function mintGrant(room: string, role: ShareRole): Promise<string> {
  const res = await fetch("/api/share", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ room, role }),
  });
  if (!res.ok) throw new Error("share failed");
  return (await res.json()).grant as string;
}
