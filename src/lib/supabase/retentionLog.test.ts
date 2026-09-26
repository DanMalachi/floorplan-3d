// Run: npm run test:security
//
// /api/account/retention (the nightly retention sweep) persists an audit row
// via this module so a run is still provable after Vercel's ~12h log window
// has rotated away. Two things matter enough to test without a real database:
//   1. summaryToRunRow's mapping — in particular that it REDACTS the parts of
//      Summary that carry ids/paths (wouldDelete, and the free-text
//      errors/skipped arrays) down to counts, per the migration's privacy note.
//   2. persistRetentionRun never throws — a logging failure must not turn a
//      completed sweep into a 500 the caller didn't cause.

import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { persistRetentionRun, retentionTrigger, summaryToRunRow, type RetentionSummary } from "./retentionLog";

let failures = 0;
function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`  ok   ${name}`))
    .catch((e) => {
      failures += 1;
      console.error(`  FAIL ${name}\n       ${(e as Error).message}`);
    });
}

const baseSummary: RetentionSummary = {
  ok: true,
  dryRun: false,
  windows: { purgeAfterDays: 30, orphanGraceHours: 48 },
  purged: { projects: 3, files: 7 },
  orphans: { files: 2, bytes: 4096 },
  foreignRooms: 1,
  skipped: ["bucket plans: listing timed out"],
  errors: ["purge 11111111-1111-1111-1111-111111111111: could not verify room ownership"],
  wouldDelete: ["plans/22222222-2222-2222-2222-222222222222/photo.png", "purge project 333…"],
  capped: true,
};

async function run() {
  console.log("summaryToRunRow");

  await check("maps counters and booleans straight through", () => {
    const started = new Date("2026-09-26T03:17:00.000Z");
    const finished = new Date("2026-09-26T03:17:42.000Z");
    const row = summaryToRunRow(baseSummary, started, finished, "cron");
    assert.equal(row.started_at, started.toISOString());
    assert.equal(row.finished_at, finished.toISOString());
    assert.equal(row.dry_run, false);
    assert.equal(row.ok, true);
    assert.equal(row.capped, true);
    assert.equal(row.trigger, "cron");
    assert.equal(row.purged_projects, 3);
    assert.equal(row.purged_files, 7);
    assert.equal(row.orphan_files, 2);
    assert.equal(row.orphan_bytes, 4096);
    assert.equal(row.foreign_rooms, 1);
  });

  await check("collapses errors/skipped to counts, never keeps the free text", () => {
    const row = summaryToRunRow(baseSummary, new Date(), new Date(), "manual");
    assert.equal(row.errors_count, 1);
    assert.equal(row.skipped_count, 1);
    assert.equal((row.summary as Record<string, unknown>).errorsCount, 1);
    assert.equal((row.summary as Record<string, unknown>).skippedCount, 1);
    const serialized = JSON.stringify(row.summary);
    assert.ok(!serialized.includes("11111111-1111-1111-1111-111111111111"), "no project id from `errors` leaked into summary");
    assert.ok(!serialized.includes("listing timed out"), "no free text from `skipped` leaked into summary");
  });

  await check("drops wouldDelete entirely — it is the concrete id/path list", () => {
    const row = summaryToRunRow(baseSummary, new Date(), new Date(), "manual");
    assert.equal((row.summary as Record<string, unknown>).wouldDelete, undefined);
    const serialized = JSON.stringify(row.summary);
    assert.ok(!serialized.includes("22222222-2222-2222-2222-222222222222"));
    assert.ok(!serialized.includes("photo.png"));
  });

  await check("defaults capped to false when Summary omits it", () => {
    const row = summaryToRunRow({ ...baseSummary, capped: undefined }, new Date(), new Date(), "manual");
    assert.equal(row.capped, false);
    assert.equal((row.summary as Record<string, unknown>).capped, false);
  });

  console.log("retentionTrigger");

  await check("recognizes Vercel Cron's own User-Agent", () => {
    const req = new Request("https://done.design/api/account/retention", {
      headers: { "user-agent": "vercel-cron/1.0" },
    });
    assert.equal(retentionTrigger(req), "cron");
  });

  await check("treats anything else, including no header, as manual", () => {
    assert.equal(retentionTrigger(new Request("https://done.design/api/account/retention")), "manual");
    assert.equal(
      retentionTrigger(new Request("https://done.design/api/account/retention", { headers: { "user-agent": "curl/8.0" } })),
      "manual",
    );
  });

  console.log("persistRetentionRun");

  const okRow = summaryToRunRow(baseSummary, new Date(), new Date(), "manual");

  await check("inserts and prunes on a healthy client", async () => {
    const calls: string[] = [];
    const fakeAdmin = {
      from(table: string) {
        assert.equal(table, "retention_runs");
        return {
          insert: async () => {
            calls.push("insert");
            return { error: null };
          },
          delete: () => ({
            lt: async () => {
              calls.push("prune");
              return { error: null };
            },
          }),
        };
      },
    } as unknown as SupabaseClient;

    const result = await persistRetentionRun(fakeAdmin, okRow);
    assert.equal(result.ok, true);
    assert.deepEqual(calls, ["insert", "prune"]);
  });

  await check("a failing insert is reported, never thrown", async () => {
    const fakeAdmin = {
      from() {
        return {
          insert: async () => ({ error: { message: "connection refused" } }),
          delete: () => ({ lt: async () => ({ error: null }) }),
        };
      },
    } as unknown as SupabaseClient;

    const result = await persistRetentionRun(fakeAdmin, okRow);
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /connection refused/);
  });

  await check("a failing prune still reports ok — the new row is already written", async () => {
    const fakeAdmin = {
      from() {
        return {
          insert: async () => ({ error: null }),
          delete: () => ({ lt: async () => ({ error: { message: "prune boom" } }) }),
        };
      },
    } as unknown as SupabaseClient;

    const result = await persistRetentionRun(fakeAdmin, okRow);
    assert.equal(result.ok, true);
  });

  await check("a throwing client is swallowed, not propagated", async () => {
    const fakeAdmin = {
      from() {
        throw new Error("network down");
      },
    } as unknown as SupabaseClient;

    const result = await persistRetentionRun(fakeAdmin, okRow);
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /network down/);
  });

  console.log(failures === 0 ? "\nAll retentionLog checks passed." : `\n${failures} check(s) FAILED.`);
  if (failures > 0) process.exit(1);
}

void run();
