/**
 * Turn Poly Pizza's license+style+scene-filtered search results
 * (scripts/polypizza/filter.ts output) into a per-bucket download
 * shortlist, same shape as scripts/sketchfab/shortlist.ts.
 *
 * Run: npx tsx scripts/polypizza/shortlist.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DIR = path.resolve(
  "C:/Users/dandu/AppData/Local/Temp/claude/C--Users-dandu/12e01fd5-7c34-4516-89a9-c5630024de73/scratchpad/furn/polypizza-search",
);

interface Spec {
  category: string;
  bucket: string;
  fCategory: "Seating" | "Tables" | "Beds" | "Storage";
  subtitle: string;
  rooms: string[];
  wallSnap?: boolean;
  limit: number;
}

const SPECS: Spec[] = [
  { category: "beds", bucket: "bed", fCategory: "Beds", subtitle: "bed", rooms: ["bedroom"], wallSnap: true, limit: 150 },
  { category: "office_chairs", bucket: "officeChair", fCategory: "Seating", subtitle: "office chair", rooms: ["office"], limit: 150 },
  { category: "dining_tables", bucket: "diningTable", fCategory: "Tables", subtitle: "dining table", rooms: ["dining", "kitchen"], limit: 150 },
  { category: "sofas", bucket: "sofa", fCategory: "Seating", subtitle: "sofa", rooms: ["living"], wallSnap: true, limit: 60 },
  { category: "armchairs", bucket: "armchair", fCategory: "Seating", subtitle: "armchair", rooms: ["living"], limit: 60 },
  { category: "dining_chairs", bucket: "diningChair", fCategory: "Seating", subtitle: "dining chair", rooms: ["dining", "kitchen"], limit: 60 },
  { category: "coffee_tables", bucket: "coffeeTable", fCategory: "Tables", subtitle: "coffee table", rooms: ["living"], limit: 60 },
  { category: "storage", bucket: "storage", fCategory: "Storage", subtitle: "cabinet", rooms: ["living", "bedroom"], wallSnap: true, limit: 60 },
  { category: "shelving", bucket: "shelving", fCategory: "Storage", subtitle: "shelving unit", rooms: ["living", "office"], wallSnap: true, limit: 60 },
];

function main() {
  const out: Record<string, any[]> = {};
  for (const spec of SPECS) {
    const file = path.join(DIR, `${spec.category}.filtered.json`);
    let items: any[];
    try {
      items = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      out[spec.category] = [];
      continue;
    }
    const kept = items.slice(0, spec.limit).map((it: any) => ({
      id: it.id,
      name: it.name,
      bucket: spec.bucket,
      category: spec.fCategory,
      subtitle: spec.subtitle,
      rooms: spec.rooms,
      wallSnap: spec.wallSnap,
    }));
    out[spec.category] = kept;
    console.log(`${spec.category}: ${items.length} filtered -> ${kept.length} shortlisted`);
  }
  writeFileSync(path.join(__dirname, "shortlist.json"), JSON.stringify(out, null, 2));
  console.log("Wrote scripts/polypizza/shortlist.json");
}

main();
