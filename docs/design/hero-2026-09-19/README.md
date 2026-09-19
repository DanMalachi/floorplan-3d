# Homepage hero redesign: approved mockup (2026-09-19)

Dan approved this mockup as-is: "save this exact mock-up and we will make it
tomorrow". Nothing in `src/` implements it yet. This folder is the spec.

- Live mockup: https://claude.ai/artifact/P8GG9b6e1LfwF4AhxuL41Z
- `hero-mockup.html` is the built, self-contained page. Open it in a browser.
- `hero-mockup.src.html` + `build-mock.mjs` rebuild it (the build injects `plan/plan.svg`).
- `plan/gen.js` generates `plan/plan.svg`, and `plan/render.js` renders PNGs.
  The plan is our own drawing (generated in code), so there is no third-party licence.

## Decisions

| What | Decision |
| --- | --- |
| Headline | `it starts with` / `the plan.` on two lines; `the plan.` in copper serif italic |
| Hebrew headline | `הכול מתחיל` / `בשרטוט.` |
| English sans | Archivo 800 (headline and hero copy) |
| English serif | Newsreader Italic 500 |
| Hebrew sans | Heebo 900 (Rubik rejected: too rounded) |
| Hebrew serif | Bona Nova Italic, a true Hebrew italic. Hebrew must slant too. Google ships the italic at 400 only; the mockup's 700 was browser-synthesised bold, and the build keeps it that way |
| Background | `plan.svg`, masked: transparent to 44% of the hero, opaque by 84%. Mirrored in RTL, with labels un-mirrored and swapped to `data-he` |
| Rotating slogans | Removed (this also closes WCAG 2.2.2 for the headline) |
| "see how it's done." button | Removed. The trace→build demo moves to its own section and starts when scrolled into view. It MUST show a visible "Skip to the room" control while running (WCAG 2.2.2), and reduced motion shows the finished room straight away |
| Kept | Subhead, copper "Open done." CTA, "No account needed to start." note |
| Small grey text | New `B.label` token (#B3B5BA dark / #4E5157 light), already on this branch |
| Demo title | `B.ink2`, already on this branch |
| Wordmark | `done.` stays Latin; the dot never flips in RTL (use `<Brand />`) |

## Build checklist

1. Fonts via `next/font/google`: Archivo, Newsreader (ital), Heebo, Bona Nova (ital).
   All are OFL; log each one in `docs/DATA_RIGHTS.md` before shipping (CLAUDE.md rule 8).
2. `Hero.tsx`: drop the slogan rotation and the ghost button. Add the plan backdrop
   (static SVG component; labels from `data-en`/`data-he`).
3. New demo section below the hero. Autoplay via IntersectionObserver, once.
   Put the Skip / Watch again control in `DemoToolbar`.
4. `content.*.tsx`: remove `slogans`, add headline strings.
5. Accessibility statement (he + en): remove the "rotating headline" and "contrast"
   items from "not yet accessible". Update `docs/ACCESSIBILITY.md`.
6. Verify: `npm start` + curl the unprefixed routes, axe en + he in both themes,
   and a look at 393px and 1440px.
