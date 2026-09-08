// Headless: pseudo-locale message transform. Run: npx tsx src/i18n/pseudoLocale.test.ts

import { pseudoizeMessages } from "./pseudoLocale";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

console.log("\nplain string: accented, bracketed, padded");
{
  const out = pseudoizeMessages({ hello: "Hello" }).hello as string;
  check("wrapped in [[ ]]", out.startsWith("[[") && out.endsWith("]]"), out);
  check("no plain ASCII letters survive", !/[A-Za-z]/.test(out), out);
  check("longer than the source (padding applied)", out.length > "Hello".length, out);
}

console.log("\nICU placeholder survives byte-identical");
{
  const src = "Switch to {language}";
  const out = pseudoizeMessages({ k: src }).k as string;
  check("placeholder present verbatim", out.includes("{language}"), out);
}

console.log("\nnested plural/select form's braces stay balanced");
{
  const src = "{count, plural, one {# plan} other {# plans}}";
  const out = pseudoizeMessages({ k: src }).k as string;
  check("whole ICU block present verbatim", out.includes(src), out);
  const opens = (out.match(/\{/g) || []).length;
  const closes = (out.match(/\}/g) || []).length;
  check("braces balanced", opens === closes, `${opens} vs ${closes}: ${out}`);
}

console.log("\nrich-text tags survive, their content is still pseudoized");
{
  const src = "This app only sets cookies. <link>Privacy Policy</link>.";
  const out = pseudoizeMessages({ k: src }).k as string;
  check("<link> delimiter intact", out.includes("<link>"), out);
  check("</link> delimiter intact", out.includes("</link>"), out);
  check("tag content was accented (no plain ASCII)", !/Privacy Policy/.test(out), out);
}

console.log("\nself-closing tag survives");
{
  const src = "Open <brand/> on a laptop.";
  const out = pseudoizeMessages({ k: src }).k as string;
  check("<brand/> delimiter intact", out.includes("<brand/>"), out);
}

console.log("\nempty string is left alone, not bracketed");
{
  const out = pseudoizeMessages({ k: "" }).k as string;
  check("empty stays empty", out === "", JSON.stringify(out));
}

console.log("\ndeep-walks nested namespaces");
{
  const out = pseudoizeMessages({ editor: { modes: { full: "Full" } } });
  const leaf = (out.editor as Record<string, unknown>);
  const modes = (leaf.modes as Record<string, unknown>);
  check("nested leaf transformed", typeof modes.full === "string" && (modes.full as string).startsWith("[["));
}

console.log("\nidentical input twice gives identical output (deterministic)");
{
  const a = pseudoizeMessages({ k: "Delete removes, Esc deselects" }).k;
  const b = pseudoizeMessages({ k: "Delete removes, Esc deselects" }).k;
  check("deterministic", a === b);
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
