#!/usr/bin/env node
/**
 * Publish (or republish) a candidate to the dev review page WITHOUT hand-editing app code:
 * copies the GLB into <worktree>/public/furniture/factory/ and upserts one line in FACTORY_ASSETS of
 * src/app/[locale]/dev/furniture/FurnitureReview.tsx, with the footprint read from <candidate>/exports/audit.json.
 *
 *   node dev-publish.mjs --candidate assets/furniture/seating/x/r001 --worktree <dir> --id factory-x-r001
 *        --name "X (factory r001, ...)" [--category Seating] [--glb exports/x_r001.glb]
 * Footprint = audited bounds (x, z), so normalize() in the app never rescales the piece: re-audit after every geometry change
 * (audit-glb.mjs refuses to overwrite, so rm exports/audit.json first; iterate.mjs does this).
 */
import fs from "fs";
import path from "path";

const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const wtArg = opt("--worktree", process.env.FACTORY_WORKTREE);
const id = opt("--id"), name = opt("--name"), category = opt("--category", "Seating");
if (!opt("--candidate") || !id || !name || !wtArg) { console.error("need --candidate --worktree --id --name"); process.exit(2); }
const cand = path.resolve(opt("--candidate")), wt = path.resolve(wtArg);
const glbArg = opt("--glb") ?? path.join("exports", fs.readdirSync(path.join(cand, "exports")).find((f) => f.endsWith(".glb")));
const glb = path.resolve(cand, glbArg);
const audit = JSON.parse(fs.readFileSync(path.join(cand, "exports", "audit.json"), "utf8"));
const [w, , d] = audit.dimensionsXYZM;
const stem = path.basename(glb, ".glb");
fs.copyFileSync(glb, path.join(wt, "public", "furniture", "factory", stem + ".glb"));
// The dev page reads data/furniture-factory.catalog.json (FACTORY_ASSETS), not a list inside the tsx (changed 2026-10). So a
// review candidate is a catalog entry in the WORKTREE. Promotion later overwrites it by assetId; delete the dev glb then.
const assetId = id.startsWith("factory:") ? id : "factory:" + id.replace(/^factory-/, "").replace(/-r[0-9]+$/, "");
const catPath = path.join(wt, "data", "furniture-factory.catalog.json");
const cat = JSON.parse(fs.readFileSync(catPath, "utf8"));
const entry = { assetId, name, category, footprint: { w: +w.toFixed(3), d: +d.toFixed(3) }, wallSnap: true, realModel: "/furniture/factory/" + stem + ".glb",
  brand: "Done", subtitle: "dev review candidate", rooms: opt("--rooms", "living").split(","), kind: opt("--kind", "furniture") };
const k = cat.findIndex((x) => x.assetId === assetId);
if (k >= 0) cat[k] = { ...cat[k], ...entry }; else cat.push(entry);
fs.writeFileSync(catPath, JSON.stringify(cat, null, 2) + "
");
console.log(`published ${id}: ${stem}.glb, footprint ${w.toFixed(3)} x ${d.toFixed(3)}, sha256 ${audit.sha256.slice(0, 12)}`);
