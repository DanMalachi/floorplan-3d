// Merge per-worker i18n fragments into messages/{en,he}.json under editor.<name>.
//
// WHY THIS EXISTS: Step 5 was done by several workers in parallel, and a worker
// must never edit messages/*.json directly — three concurrent read-modify-writes
// on one JSON file silently drop two workers' keys, with no error and no
// conflict. Each worker instead writes {"en": {...}, "he": {...}} to its own
// fragment, and this merges them.
//
// The merge is DEEP on purpose: a shallow spread would drop every sibling key
// already under `editor` the moment one fragment declared that namespace.
//
// It finishes by diffing the en/he key sets, which is the check that actually
// catches a half-translated fragment — a missing Hebrew key renders the English
// fallback and is invisible in a screenshot.
//
// Usage:  node scripts/i18n/merge-fragments.mjs [fragmentDir]
// Fragment shape:  { "en": { ...keys relative to editor.<name>... }, "he": {...} }

// Merge worker fragments into messages/{en,he}.json under editor.<name>.
// DEEP merge: a shallow spread would drop sibling keys already written
// (editor.modes, editor.wallModes, …) the moment one fragment declares editor.
import fs from 'node:fs';
import path from 'node:path';
const DIR = process.argv[2] ?? path.join(process.cwd(), '.i18n-fragments');
const REPO = process.cwd();

const deep = (a, b) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && a?.[k] && typeof a[k] === 'object'
      ? deep(a[k], v) : v;
  }
  return out;
};
const countLeaves = o => Object.values(o).reduce((n, v) => n + (v && typeof v === 'object' ? countLeaves(v) : 1), 0);

const frags = fs.readdirSync(DIR).filter(f => f.endsWith('.json'));
if (!frags.length) { console.log('no fragments yet'); process.exit(0); }

for (const loc of ['en', 'he']) {
  const mp = path.join(REPO, 'messages', `${loc}.json`);
  const raw = fs.readFileSync(mp, 'utf8');
  const crlf = raw.includes('\r\n');
  const msgs = JSON.parse(raw);
  msgs.editor = msgs.editor || {};
  for (const f of frags) {
    const name = path.basename(f, '.json');
    const frag = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    if (!frag[loc]) { console.log(`  ! ${f} has no "${loc}" side, skipped`); continue; }
    msgs.editor[name] = deep(msgs.editor[name] || {}, frag[loc]);
    console.log(`  ${loc}  editor.${name}  +${countLeaves(frag[loc])}`);
  }
  let out = JSON.stringify(msgs, null, 2) + '\n';
  if (crlf) out = out.replace(/\n/g, '\r\n');
  fs.writeFileSync(mp, out);
}

// Parity check: every key present in en must exist in he and vice versa.
const paths = (o, p = '') => Object.entries(o).flatMap(([k, v]) =>
  v && typeof v === 'object' ? paths(v, p + k + '.') : [p + k]);
const en = new Set(paths(JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en.json'), 'utf8')).editor));
const he = new Set(paths(JSON.parse(fs.readFileSync(path.join(REPO, 'messages/he.json'), 'utf8')).editor));
const onlyEn = [...en].filter(k => !he.has(k)), onlyHe = [...he].filter(k => !en.has(k));
console.log(`\neditor keys — en ${en.size}, he ${he.size}`);
console.log('missing in he:', onlyEn.length ? onlyEn : 'none');
console.log('missing in en:', onlyHe.length ? onlyHe : 'none');
