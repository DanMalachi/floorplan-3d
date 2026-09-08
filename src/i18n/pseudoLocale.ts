// Dev-only pseudo-localization: `en-XA`-style string mangling for the message
// catalogue, applied at render time rather than routed as a real locale.
//
// ── What it catches ──────────────────────────────────────────────────────
// Every string that goes through `t()` comes out accented, bracketed and
// padded ~40% longer. Two failure modes become instantly visible instead of
// needing a native reader or a 900-key eyeball pass:
//   - An UNEXTRACTED literal (a hardcoded English string that bypassed the
//     catalogue) stays plain ASCII in a sea of accented text — see
//     [[hebrew-i18n]]'s five traps, this is the tool that should have existed
//     before Step 5, not after.
//   - TRUNCATION / overflow: the ~40% pad is exactly the "German runs long"
//     stress case, so a fixed-width button or chip that clips it shows up on
//     the EN build without waiting for a real translation to be long.
//
// ── Why a message transform, not a routed `en-XA` locale ────────────────
// `routing.ts` documents why English URLs are byte-for-byte and locale count
// is not a thing to grow casually: adding `en-XA` to `routing.locales` would
// put it in `generateStaticParams` for every marketing route, `sitemap.ts`,
// `robots.ts` and `alternates.ts` (hreflang) — real production surfaces, all
// of which would need a parallel "but not this locale" carve-out. This does
// the same visual job by pseudoizing the MESSAGES for the existing `en`
// locale on request, gated twice (see `src/proxy.ts` and `src/i18n/
// request.ts`) so it can never reach a production response. No new locale,
// no new route, no sitemap/hreflang entry to accidentally ship.
//
// ── What it deliberately leaves alone ────────────────────────────────────
// ICU placeholders (`{name}`, `{count, plural, one {# plan} other {# plans}}`)
// and next-intl rich-text tags (`<b>…</b>`, `<link>…</link>`) are matched and
// passed through untouched — corrupting either breaks the app rather than
// exercising it. The one gap that follows from that: text INSIDE a plural/
// select form's nested `{…}` arms is opaque along with its punctuation, so
// "# plan" is not accented. Acceptable for a "spot what's missing" tool; not
// a claim of 100% coverage.

type Messages = { [k: string]: string | Messages };

const ACCENT_MAP: Record<string, string> = {
  a: "à", b: "ƀ", c: "ƈ", d: "ð", e: "è", f: "ƒ", g: "ĝ", h: "ĥ", i: "ì",
  j: "ĵ", k: "ķ", l: "ŀ", m: "ɱ", n: "ñ", o: "ò", p: "ƥ", q: "ɋ", r: "ŕ",
  s: "ŝ", t: "ŧ", u: "ù", v: "ṽ", w: "ŵ", x: "ẋ", y: "ý", z: "ź",
  A: "Ȧ", B: "Ɓ", C: "Ƈ", D: "Đ", E: "È", F: "Ƒ", G: "Ĝ", H: "Ĥ", I: "Ì",
  J: "Ĵ", K: "Ķ", L: "Ŀ", M: "Ɯ", N: "Ñ", O: "Ò", P: "Ƥ", Q: "Ɋ", R: "Ŕ",
  S: "Ŝ", T: "Ŧ", U: "Ù", V: "Ṽ", W: "Ŵ", X: "Ẋ", Y: "Ý", Z: "Ź",
};

/** One padding "word" (no Latin letters in it, so it never needs accenting
 *  and can't be mistaken for real copy) repeated to hit the ~40% target. */
const PAD_UNIT = "‿‿";

function accent(run: string): string {
  let out = "";
  for (const ch of run) out += ACCENT_MAP[ch] ?? ch;
  return out;
}

/** Splits on next-intl rich-text tags (`<b>`, `</b>`, `<brand/>`, …), which
 *  must reach `t.rich()`'s parser byte-identical or the tag stops matching
 *  its renderer. Tag content itself still gets pseudoized on the next pass —
 *  only the delimiters are protected. */
const TAG_RE = /(<\/?[a-zA-Z][a-zA-Z0-9]*\/?>)/g;
/** Anchored, non-global twin of `TAG_RE` for identifying a `.split()` piece
 *  as a captured tag rather than surrounding text — `.test()` on a `g`-flag
 *  regex carries `lastIndex` across calls and misfires on alternating
 *  matches, so the stateful one is for `.split()` only. */
const IS_TAG = /^<\/?[a-zA-Z][a-zA-Z0-9]*\/?>$/;

/** Within one tag-free run, splits out balanced `{…}` ICU placeholders
 *  (which may nest one level deep, as plural/select forms do) from literal
 *  text, so only the literal text gets accented. */
function splitIcu(run: string): { text: string; literal: boolean }[] {
  const parts: { text: string; literal: boolean }[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < run.length; i++) {
    const ch = run[i];
    if (ch === "{") {
      if (depth === 0 && i > start) parts.push({ text: run.slice(start, i), literal: true });
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        parts.push({ text: run.slice(start, i + 1), literal: false });
        start = i + 1;
      }
    }
  }
  if (start < run.length) parts.push({ text: run.slice(start), literal: depth === 0 });
  return parts;
}

function pseudoizeString(input: string): string {
  if (input === "") return input; // don't bracket icon-only / empty strings
  const visibleLength = input.replace(/\{[^{}]*\}|<\/?[a-zA-Z][a-zA-Z0-9]*\/?>/g, "").length;

  const chunks = input.split(TAG_RE);
  const rebuilt = chunks
    .map((chunk) => {
      if (IS_TAG.test(chunk)) return chunk; // tag delimiter, untouched
      return splitIcu(chunk)
        .map((p) => (p.literal ? accent(p.text) : p.text))
        .join("");
    })
    .join("");

  const padCount = Math.max(2, Math.ceil(visibleLength * 0.4));
  return `[[${rebuilt} ${PAD_UNIT.repeat(padCount)}]]`;
}

/** Deep-walks a next-intl message tree and pseudoizes every string leaf. */
export function pseudoizeMessages(messages: Messages): Messages {
  const out: Messages = {};
  for (const [k, v] of Object.entries(messages)) {
    out[k] = typeof v === "string" ? pseudoizeString(v) : pseudoizeMessages(v as Messages);
  }
  return out;
}
