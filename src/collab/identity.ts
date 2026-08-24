// Who a collaborator appears as in a live room. Signed-in people show their real
// name and a colour keyed to their account (identityForUser); guests still get a
// friendly random one, because a share link has to work without an account.

const ADJECTIVES = [
  "Swift", "Cosy", "Bright", "Calm", "Bold", "Warm", "Quiet", "Lucky",
  "Sunny", "Clever", "Gentle", "Merry", "Brave", "Snug", "Keen",
];
const ANIMALS = [
  "Fox", "Otter", "Heron", "Lynx", "Wren", "Hare", "Finch", "Marten",
  "Robin", "Ibis", "Vole", "Egret", "Stoat", "Sable", "Pika",
];
// Distinct, legible on the dark UI.
const COLORS = [
  "#ff6b6b", "#f7b731", "#20bf6b", "#0fb9b1", "#2d98da",
  "#8854d0", "#eb3b5a", "#fa8231", "#3867d6", "#a55eea",
];

const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

export interface Identity {
  name: string;
  color: string;
}

/** A fresh random identity for this browser session. */
export function randomIdentity(): Identity {
  return { name: `${pick(ADJECTIVES)} ${pick(ANIMALS)}`, color: pick(COLORS) };
}

/**
 * A signed-in person's identity in a room: their own name, and a colour derived
 * from their user id so it is the SAME colour every session and on every device.
 * Collaborators learn "blue is Dan"; a colour that shuffled on each visit would
 * make presence cursors unreadable.
 */
export function identityForUser(name: string, userId: string): Identity {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  return { name, color: COLORS[Math.abs(h) % COLORS.length] };
}

/** Initials for an avatar chip, e.g. "Swift Fox" -> "SF". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
