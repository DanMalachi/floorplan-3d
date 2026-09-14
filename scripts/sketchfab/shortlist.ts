/**
 * Turn the license+style+downloadable-filtered Sketchfab search results
 * (scripts/sketchfab/filter.ts output) into a download shortlist per
 * category, additionally excluding names that read as a whole scene/room/
 * furniture-set (their bbox would measure the whole scene, not one piece —
 * they'd just fail the dimension audit anyway, but skipping them up front
 * saves API calls against Sketchfab's per-token rate limit).
 *
 * Run: npx tsx scripts/sketchfab/shortlist.ts
 * Writes scripts/sketchfab/shortlist.json (gitignored-scratch-style, but
 * kept in scripts/ since it's small and documents exactly what was tried).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DIR = path.resolve(
  "C:/Users/dandu/AppData/Local/Temp/claude/C--Users-dandu/12e01fd5-7c34-4516-89a9-c5630024de73/scratchpad/furn/sketchfab-search",
);

const SCENE_WORDS = [
  "bedroom", "room", "house", "cabin", "station", "apartment", "pack",
  "with materials", "assets", "interior", "hovercraft", "spongebob",
  "hospital", "neon", "kitchen -", "kitchen assets", "corner kitchen",
  "school", "gaming", "sci-fi", "egyptian", "renaissance", "aged",
  "well used", "low poly kitchen",
];

interface Spec {
  category: string;
  bucket: string;
  fCategory: "Seating" | "Tables" | "Beds" | "Storage";
  subtitle: string;
  rooms: string[];
  wallSnap?: boolean;
  limit: number;
  excludeExtra?: string[]; // extra name-based exclusions, category specific
  requireNameMatch?: RegExp; // keep only names that look like the target item
}

const SPECS: Spec[] = [
  {
    category: "beds", bucket: "bed", fCategory: "Beds", subtitle: "bed",
    rooms: ["bedroom"], wallSnap: true, limit: 90,
    excludeExtra: ["set", "cart", "sofa"],
  },
  {
    category: "office_chairs", bucket: "officeChair", fCategory: "Seating", subtitle: "office chair",
    rooms: ["office"], limit: 150,
    excludeExtra: ["desk set", "desk and chair", "desk chair set"],
  },
  {
    category: "dining_tables", bucket: "diningTable", fCategory: "Tables", subtitle: "dining table",
    rooms: ["dining", "kitchen"], limit: 150,
    excludeExtra: ["set", "buffet", "cabinet", "dining room", "kitchen"],
  },
];

function looksLikeScene(name: string, extra: string[]): boolean {
  const n = name.toLowerCase();
  return [...SCENE_WORDS, ...extra].some((w) => n.includes(w));
}

function main() {
  const out: Record<string, any[]> = {};
  for (const spec of SPECS) {
    const items = JSON.parse(readFileSync(path.join(DIR, `${spec.category}.filtered.json`), "utf8"));
    const kept = items
      .filter((it: any) => !looksLikeScene(it.name, spec.excludeExtra ?? []))
      .slice(0, spec.limit)
      .map((it: any) => ({
        uid: it.uid,
        name: it.name,
        bucket: spec.bucket,
        category: spec.fCategory,
        subtitle: spec.subtitle,
        rooms: spec.rooms,
        wallSnap: spec.wallSnap,
        likeCount: it.likeCount,
      }));
    out[spec.category] = kept;
    console.log(`${spec.category}: ${items.length} filtered -> ${kept.length} shortlisted (scene-name exclusion)`);
  }
  writeFileSync(path.join(__dirname, "shortlist.json"), JSON.stringify(out, null, 2));
  console.log("Wrote scripts/sketchfab/shortlist.json");
}

main();
