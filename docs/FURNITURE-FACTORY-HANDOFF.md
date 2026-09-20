# Furniture factory handoff (updated 2026-09-20, end of the two-TV-cabinet session)

**No task is queued.** Ask the owner what to build next. Start a FRESH session (every tool call re-reads the whole history; see `references/efficiency.md`).

## State
- Shipped + approved, all in `data/furniture-factory.catalog.json`: `factory:oak-platform-bed`, six sofas, `factory:walnut-tv-console`, and NEW this session
  `factory:black-travertine-tv-console` (sha256 `eb6d95e8f0d3…`, 2.00 x 0.40 x 0.50, 208 triangles) and `factory:walnut-mesh-tv-console` (sha256 `5e67c87a38d3…`, 2.00 x 0.42 x 0.52, 3,468 triangles).
  Candidate folders: `assets/furniture/storage/{walnut-tv-console,black-travertine-tv-console,walnut-glass-tv-console}/r001` (the walnut-glass folder is the mesh console: the slug changed at promotion, the folder name did not).
- Branch `codex/furniture-addition`. A `git push origin main` is a production deploy: do not push unless asked. Never `git add -A`.
- The skill (repo `.agents/skills/done-furniture-factory/` AND installed `~/.claude/skills/done-furniture-factory/`) has lessons-learned 7i, an efficiency row and two new examples
  (`black_travertine_console.py`, `walnut_mesh_console.py`). **Read SKILL.md, lessons 7h + 7i and 7g rule 10 (tool traps) before building.**
- Dev server (leave running): `http://localhost:3105/dev/furniture`, from the Codex worktree `C:\Users\dandu\.codex\worktrees\dev-main\floorplan-3d` (if dead: `cd` there, `npx next dev -p 3105`).
- Blender: `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`. No system Python. Node needs `C:/...` paths (Git Bash `/tmp` is invisible to Node: use `cygpath -m`).
- Traps: a Bash `cd` changes later calls' directory; write files with the Write tool; `audit-glb.mjs` and `promote-candidate.mjs` run from the repo root only; NEVER rebuild an approved candidate
  (sha256 changes); check `BOUNDS` from `iterate.mjs` before any image; foreground zoom shots take ~60 s each, batch them.

## Weak spots accepted, never built
Sofa scatter cushions, 154244 (headrest back pads), 154228 (charcoal corner sectional on a plinth), console oak variant (`--wood oak`, try `oak_veneer_02..04`), the small cable cutout beside the walnut
mesh console's cubby, glass/transparency is alpha-only (not used any more).

## Rules
1. Rights: screenshots are inspiration-only; record borrowed vs changed in brief.json. Only CC0 textures (Poly Haven / ambientCG) or self-authored maps, logged in sources.json and `docs/DATA_RIGHTS.md` (repo CLAUDE.md rule 8).
2. Pick the material at room distance first before building the rest.
3. State known weak spots and ambiguous readings of low-resolution references up front; the owner decides with the facts.
4. If the owner approves with fixes, fix, re-hash, promote the NEW hash (and say the hash changed).
