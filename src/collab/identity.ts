// Anonymous-but-named identity for the alpha: each collaborator gets a friendly
// name + a stable color, no login. (Real accounts can replace this later without
// touching the presence shape.)

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

/** Initials for an avatar chip, e.g. "Swift Fox" -> "SF". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
