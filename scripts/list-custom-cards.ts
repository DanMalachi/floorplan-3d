/** Lists the browsable "Custom" cards each room tab shows — one per variant.
 *  Prints translation KEYS, not display words: display text now lives in the
 *  i18n catalogue (editor.parametric), not on the generator/variant objects
 *  themselves (Hebrew i18n step 5) — resolve a key against messages/en.json
 *  or messages/he.json to see the actual caption.
 *  npx tsx scripts/list-custom-cards.ts */
import { GENERATORS } from "../src/parametric";

const rooms = [...new Set(Object.values(GENERATORS).flatMap((g) => g.rooms))].sort();
for (const room of rooms) {
  const gens = Object.values(GENERATORS).filter((g) => g.rooms.includes(room));
  const cards = gens.flatMap((g) =>
    g.variants && g.variants.length > 1
      ? g.variants.map((v) => v.cardLabelKey ?? `${g.labelKey} · ${v.labelKey}`)
      : [g.labelKey],
  );
  console.log(`\n${room} — ${cards.length} card(s)`);
  for (const c of cards) console.log(`   ${c}`);
}
