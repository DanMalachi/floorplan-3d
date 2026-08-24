# Testing

`npm test` runs every automated test in this repo. `npm run test:coverage` does
the same and enforces the coverage gate. That is the whole surface.

| Command | What it does |
|---|---|
| `npm test` | Run all 29 suites once. ~13s. |
| `npm run test:watch` | Same, re-running on change. |
| `npm run test:coverage` | All suites + coverage report + threshold gate. |
| `node --import tsx path/to/one.test.ts` | Run a single suite directly. |

The per-suite npm scripts (`test:kitchen`, `test:camera`, `test:persist`, …)
still work and were not touched. They are now a convenience, not the only way
in.

## How this is put together, and why

Vitest is the **runner**. It is not the format the tests are written in, and
this is the one thing worth understanding before changing anything here.

Every suite in this repo predates any framework. Each is a standalone `tsx`
script that keeps its own `failures` counter, prints `ok` / `FAIL` lines, and
ends with `process.exit(failures === 0 ? 0 : 1)`. That shape cannot be imported
into a test framework:

- a file with no `it()` / `test()` call is an error to vitest ("No test suite
  found in file"), and
- a `process.exit()` inside a vitest worker kills the worker mid-run.

Rewriting them into `describe`/`it` is not available either:
`src/viewport3d/geometry/*.test.ts` is listed in `docs/PROTECTED_PATHS.md`,
which `CLAUDE.md` rule 1 freezes.

So rather than convert some suites and special-case the frozen ones, **every
suite is treated identically — as an executable whose exit code is the
assertion.** `test/suites.test.ts` discovers each `*.test.ts` in `src/` and
`scripts/`, runs it via `node --import tsx` as a child process, and asserts it
exited 0. The suites are never imported, never edited, and never see vitest.
They stay byte-for-byte identical, protected files included.

`node --import tsx` rather than `npx tsx`: no shell, no `.cmd` shim, no `PATH`
lookup, so it behaves the same on Windows and on CI's Linux runners.

### Discovery is dynamic, deliberately

Before this existed, 17 of the 29 suites were wired into an npm script and the
other 12 were reachable only by typing the path by hand — so in practice they
were never run. CI ran none of them at all: it gated on typecheck, lint, and
build, so the pipeline could be fully green with every test in the repo
failing.

`test/suites.test.ts` globs the tree instead of listing files, so a new
`*.test.ts` is picked up the moment it lands and cannot silently rot. A floor
assertion (`>= 29 suites discovered`) fails loudly if a whole tree stops being
scanned.

## Coverage

Coverage is measured by **c8** (`.c8rc.json`), not by vitest's own provider.

This is not a preference. Vitest's v8 provider instruments the worker process,
and every suite here runs in a *child* process, so it reports a flat **0% over
16,070 statements** — technically true, completely useless. c8 sets
`NODE_V8_COVERAGE` for the whole process tree, so it sees the children.

`all: true` is set so files no test ever loads are counted as uncovered. Without
it c8 reports only files that were loaded, which flatters the number badly:
**67.93%** loaded-only versus **36.21%** repo-wide, from the same run. The
gate uses the honest one.

### The baseline, measured 2026-08-24

```
Statements   : 36.21% ( 16199/44734 )
Branches     : 77.33% ( 2695/3485 )
Functions    : 62.68% ( 1124/1793 )
Lines        : 36.21% ( 16199/44734 )
```

Thresholds in `.c8rc.json` are set just *under* that (35 / 75 / 60), so the gate
ratchets rather than failing on arrival. The gate was verified to actually bite:
raising it to 90 fails the run with a non-zero exit, so it is a real check and
not decoration.

The branch number being far higher than the line number is the expected shape
here — the suites cover a few subsystems (parametric furniture, kitchen,
geometry, camera, persistence) very thoroughly and never load large parts of
the app at all.

**Raise the thresholds as coverage improves. Never lower them to make a red
build green** — if a change drops coverage, that is the gate working.

## Adding a test

Write it in whichever style fits:

- **A new `tsx` script** matching the existing suites — put it anywhere under
  `src/` or `scripts/` named `*.test.ts`, exit non-zero on failure, and the
  runner picks it up with no wiring.
- **A native vitest suite** using `describe`/`it` — put it in `test/`. The `@/`
  alias is configured in `vitest.config.mts`.

New tests should prefer the second form. The adapter exists to keep 29 existing
suites running unmodified, not as the pattern to grow.

## Known gaps

- **No browser or end-to-end tests.** Playwright is a dependency but drives no
  test; nothing exercises the app through a real browser. The 3D viewer,
  walkthrough, auth, and cloud sync have no automated coverage of their runtime
  behavior — only of their pure helper functions.
- **No component/DOM tests.** No jsdom environment is configured, so React
  components are untested.
- **Suites have never run on Linux.** They pass on Windows locally; CI is
  `ubuntu-latest` and this has not been observed there yet. Path-separator and
  image-fixture assumptions are the likely first failures if any appear.
