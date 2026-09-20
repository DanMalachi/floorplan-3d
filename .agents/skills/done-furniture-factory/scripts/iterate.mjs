#!/usr/bin/env node
/**
 * One command per design revision: build, audit, publish to the dev page, screenshot it in the app viewer.
 * Replaces about 8 hand-typed calls per round (build, rm audit, audit, cp glb, edit footprint, write a playwright script, run it).
 *
 *   node .agents/skills/done-furniture-factory/scripts/iterate.mjs --candidate assets/furniture/seating/x/r001 \
 *        --worktree C:/Users/dandu/.codex/worktrees/dev-main/floorplan-3d --id factory-x-r001 --name "X (factory r001)" \
 *        --stem x_r001 [--category Storage] [--script build_sofa.py] [--build-args "--width 2.8"] [--shot-name "X"] [--views front,left] [--no-shot]
 * Run from the floorplan-3d repo root (audit-glb needs its node_modules). Env: BLENDER overrides the Blender path,
 * FACTORY_WORKTREE replaces --worktree. Prints BOUNDS, size, triangles, MB and sha256; read the screenshots in <candidate>/renders/app/.
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const argv = process.argv.slice(2);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const wt = opt("--worktree", process.env.FACTORY_WORKTREE);
const id = opt("--id"), name = opt("--name");
if (!opt("--candidate") || !wt || !id || !name) { console.error("need --candidate --worktree --id --name"); process.exit(2); }
const cand = path.resolve(opt("--candidate"));
const scripts = path.dirname(fileURLToPath(import.meta.url));
const blender = process.env.BLENDER || "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe";
const script = path.join(cand, opt("--script", "build_sofa.py"));
const stem = opt("--stem", path.basename(path.dirname(cand)) + "_" + path.basename(cand));
const glb = path.join(cand, "exports", stem + ".glb");
const run = (cmd, args, tag) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 26 });
  if (tag === "build") for (const l of (r.stdout + r.stderr).split("\n")) if (/BOUNDS|Error|Traceback|line \d+, in/.test(l)) console.log(l.trim());
  if (r.status !== 0) { console.error(`${tag} failed`, (r.stdout + r.stderr).slice(-1500)); process.exit(1); }
  return r.stdout;
};
fs.mkdirSync(path.join(cand, "exports"), { recursive: true });
const buildArgs = opt("--build-args", "") ? opt("--build-args").split(/\s+/) : [];
run(blender, ["-b", "-P", script, "--", ...buildArgs, "--out", glb], "build");
fs.rmSync(path.join(cand, "exports", "audit.json"), { force: true });
run("node", [path.join(scripts, "audit-glb.mjs"), glb, "--json", path.join(cand, "exports", "audit.json")], "audit");
const a = JSON.parse(fs.readFileSync(path.join(cand, "exports", "audit.json"), "utf8"));
console.log(`size ${a.dimensionsXYZM.map((x) => x.toFixed(3)).join(" x ")}  tris ${a.triangles}  ${(a.fileBytes / 1e6).toFixed(1)} MB  sha256 ${a.sha256.slice(0, 12)}`);
console.log(run("node", [path.join(scripts, "dev-publish.mjs"), "--candidate", cand, "--worktree", wt, "--id", id, "--name", name, "--glb", glb, "--category", opt("--category", "Seating")], "publish").trim());
if (!argv.includes("--no-shot")) {
  const out = path.join(cand, "renders", "app");
  console.log(run("node", [path.join(scripts, "app-shot.mjs"), "--worktree", wt, "--name", opt("--shot-name", name.split(" (")[0]), "--out", out, "--views", opt("--views", "front")], "shot").trim());
}
