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
const tsx = path.join(wt, "src", "app", "[locale]", "dev", "furniture", "FurnitureReview.tsx");
let s = fs.readFileSync(tsx, "utf8");
const line = `  { assetId: "${id}", name: ${JSON.stringify(name)}, category: "${category}", footprint: { w: ${w.toFixed(3)}, d: ${d.toFixed(3)} }, wallSnap: true, model: "factory/${stem}" },`;
const re = new RegExp(`^ *\\{ *assetId: "${id}".*$`, "m");
if (re.test(s)) s = s.replace(re, line);
else {
  const end = s.indexOf("];", s.indexOf("const FACTORY_ASSETS"));
  s = s.slice(0, end) + line + "\n" + s.slice(end);
}
fs.writeFileSync(tsx, s);
console.log(`published ${id}: ${stem}.glb, footprint ${w.toFixed(3)} x ${d.toFixed(3)}, sha256 ${audit.sha256.slice(0, 12)}`);
