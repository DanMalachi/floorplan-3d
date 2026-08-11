/** Lists the browsable "Custom" cards each room tab shows — one per variant.
 *  npx tsx scripts/list-custom-cards.ts */
import { GENERATORS } from "../src/parametric";

const rooms = [...new Set(Object.values(GENERATORS).flatMap((g) => g.rooms))].sort();
for (const room of rooms) {
  const gens = Object.values(GENERATORS).filter((g) => g.rooms.includes(room));
  const cards = gens.flatMap((g) =>
    g.variants && g.variants.length > 1
      ? g.variants.map((v) => v.cardLabel ?? `${g.label} · ${v.label}`)
      : [g.label],
  );
  console.log(`\n${room} — ${cards.length} card(s)`);
  for (const c of cards) console.log(`   ${c}`);
}
