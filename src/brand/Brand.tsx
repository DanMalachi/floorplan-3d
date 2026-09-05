/**
 * `<Brand />` — the one way `done.` is allowed to appear inside translated
 * running text (Step 3, slice 2 of docs/HEBREW-HANDOFF.md — read that file's
 * Step 4 entry on Wordmark.tsx for the full bidi background before touching
 * this).
 *
 * ── The bug this fixes ───────────────────────────────────────────────────────
 * Dan's decision is that the `done.` wordmark stays Latin even in the Hebrew
 * build; everything around it translates. Inside an RTL paragraph the Unicode
 * bidi algorithm treats a trailing full stop after a Latin run as a neutral
 * character and resolves it toward the PARAGRAPH direction, not the run it
 * follows — so the period lands on the left of the word instead of the right.
 * Confirmed on screen at /he 2026-09-04: the CTA read ".Open done", the ghost
 * button ".see how it's done", the footnote ".No account needed to start."
 *
 * Only half of that is a real bug. Ordinary English prose flipping its own
 * period the same way is bidi working CORRECTLY on copy that is about to be
 * translated away, and it stops happening the moment Step 3 replaces that copy
 * with Hebrew — don't wrap that in this component, you'd be fighting the
 * algorithm on text that is about to stop existing. `done.` itself never
 * resolves, because it stays Latin forever by decision, so every occurrence of
 * the name in running text has to render through here instead of being typed
 * inline as a string.
 *
 * ── Why it takes no props ────────────────────────────────────────────────────
 * This renders the literal name and nothing else — no text prop, no children
 * rendered even if a caller passes them. A caller passing "done" without the
 * stop, or a future translated variant of the name, is exactly the drift this
 * component exists to prevent, so there is no prop through which that drift
 * could enter.
 *
 * ── Why the props still fit a next-intl rich-text tag ───────────────────────
 * Most occurrences sit mid-sentence in a translated catalogue value, e.g.
 * `"פתחו את <brand></brand>"`. Checked against the installed next-intl
 * (use-intl's TranslationValues.d.ts): a rich-text tag has the shape
 * `RichTagsFunction = (chunks: ReactNode) => ReactNode`, so the call site is
 * `t.rich("key", { brand: () => <Brand /> })`. A zero-argument arrow function
 * is assignable to that one-argument type — TypeScript lets a callback ignore
 * parameters it doesn't need — and since the catalogue tag above is
 * self-closing there are no chunks for next-intl to pass through anyway.
 *
 * ── Why no colour, font or layout of its own ─────────────────────────────────
 * tokens.ts reserves copper for exactly two objects — the wordmark's period
 * and CTA fills — and says outright that a third copper object on a page is
 * that rule failing. This is running text standing in for the name, not the
 * graphic mark, so it paints nothing and inherits colour, font and size from
 * whatever paragraph it sits in; the isolation below cannot change how it
 * looks, only how its period resolves. `unicodeBidi: "isolate"` alone would
 * already stop the period escaping the run; `direction: "ltr"` is added so the
 * isolated run also reads left-to-right internally, matching the fix already
 * specified for the graphic mark in Wordmark.tsx (left untouched here — see
 * that file's own header comment for why its `marginLeft` offset is a
 * different problem).
 */
export function Brand() {
  return <span style={{ direction: "ltr", unicodeBidi: "isolate" }}>done.</span>;
}
