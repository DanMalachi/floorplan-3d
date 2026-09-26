// Run: npm run test:security
//
// Pass C of the retention sweep deletes closed abuse reports 12 months after
// handling (Privacy Policy §7). What must hold without a real database:
//   - only actioned/dismissed rows with resolved_at before the cutoff are selected,
//   - the delete re-asserts those conditions (a reopened report survives),
//   - a dry run deletes nothing,
//   - a missing table (0006 not applied) is "skipped", not an error,
//   - the pass never throws.

import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { abuseReportCutoff, purgeResolvedAbuseReports } from "./abuseReportsPurge";

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

type Result = { data: unknown; error: { code?: string; message: string } | null };
type Call = [string, ...unknown[]];

/** Records every builder call; resolves select-queries and delete-queries separately. */
function fakeClient(selectResult: Result, deleteResult: Result = { data: [], error: null }) {
  const queries: { kind: "select" | "delete"; calls: Call[] }[] = [];
  const client = {
    from(table: string) {
      const q = { kind: "select" as "select" | "delete", calls: [["from", table]] as Call[] };
      queries.push(q);
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "in", "not", "lt", "order", "limit", "delete"]) {
        builder[m] = (...args: unknown[]) => {
          if (m === "delete") q.kind = "delete";
          q.calls.push([m, ...args]);
          return builder;
        };
      }
      builder.then = (resolve: (r: Result) => void) => resolve(q.kind === "delete" ? deleteResult : selectResult);
      return builder;
    },
  };
  return { admin: client as unknown as SupabaseClient, queries };
}

const NOW = new Date("2027-10-15T03:17:00.000Z");

async function run() {
  console.log("abuseReportsPurge");

  await check("cutoff is 12 calendar months back", () => {
    assert.equal(abuseReportCutoff(NOW), "2026-10-15T03:17:00.000Z");
  });

  await check("selects only closed, resolved, past-cutoff rows, oldest first, within budget", async () => {
    const { admin, queries } = fakeClient({ data: [{ id: "a" }, { id: "b" }], error: null }, { data: [{ id: "a" }, { id: "b" }], error: null });
    const r = await purgeResolvedAbuseReports(admin, { dryRun: false, budget: 7, now: NOW });
    assert.equal(r.count, 2);
    const sel = queries[0].calls;
    assert.deepEqual(sel.find((c) => c[0] === "in"), ["in", "status", ["actioned", "dismissed"]]);
    assert.deepEqual(sel.find((c) => c[0] === "not"), ["not", "resolved_at", "is", null]);
    assert.deepEqual(sel.find((c) => c[0] === "lt"), ["lt", "resolved_at", "2026-10-15T03:17:00.000Z"]);
    assert.deepEqual(sel.find((c) => c[0] === "limit"), ["limit", 7]);
  });

  await check("delete re-asserts status + cutoff, not just ids", async () => {
    const { admin, queries } = fakeClient({ data: [{ id: "a" }], error: null }, { data: [{ id: "a" }], error: null });
    await purgeResolvedAbuseReports(admin, { dryRun: false, budget: 10, now: NOW });
    const del = queries[1];
    assert.equal(del.kind, "delete");
    const ins = del.calls.filter((c) => c[0] === "in");
    assert.deepEqual(ins, [["in", "id", ["a"]], ["in", "status", ["actioned", "dismissed"]]]);
    assert.deepEqual(del.calls.find((c) => c[0] === "lt"), ["lt", "resolved_at", "2026-10-15T03:17:00.000Z"]);
  });

  await check("count is what the delete returned, not what was selected", async () => {
    const { admin } = fakeClient({ data: [{ id: "a" }, { id: "b" }], error: null }, { data: [{ id: "a" }], error: null });
    const r = await purgeResolvedAbuseReports(admin, { dryRun: false, budget: 10, now: NOW });
    assert.equal(r.count, 1);
  });

  await check("dry run counts and deletes nothing", async () => {
    const { admin, queries } = fakeClient({ data: [{ id: "a" }, { id: "b" }], error: null });
    const r = await purgeResolvedAbuseReports(admin, { dryRun: true, budget: 10, now: NOW });
    assert.equal(r.count, 2);
    assert.equal(queries.filter((q) => q.kind === "delete").length, 0);
  });

  await check("missing table is skipped, not an error", async () => {
    for (const error of [{ code: "PGRST205", message: "Could not find the table 'public.abuse_reports'" }, { code: "42P01", message: "relation does not exist" }]) {
      const { admin } = fakeClient({ data: null, error });
      const r = await purgeResolvedAbuseReports(admin, { dryRun: false, budget: 10, now: NOW });
      assert.equal(r.count, 0);
      assert.ok(r.skipped);
      assert.equal(r.error, undefined);
    }
  });

  await check("other select errors are reported as errors", async () => {
    const { admin } = fakeClient({ data: null, error: { code: "42501", message: "permission denied" } });
    const r = await purgeResolvedAbuseReports(admin, { dryRun: false, budget: 10, now: NOW });
    assert.match(r.error ?? "", /permission denied/);
  });

  await check("zero budget does not query at all", async () => {
    const { admin, queries } = fakeClient({ data: [{ id: "a" }], error: null });
    const r = await purgeResolvedAbuseReports(admin, { dryRun: false, budget: 0, now: NOW });
    assert.equal(r.count, 0);
    assert.equal(queries.length, 0);
  });

  await check("a throwing client is caught", async () => {
    const admin = { from() { throw new Error("boom"); } } as unknown as SupabaseClient;
    const r = await purgeResolvedAbuseReports(admin, { dryRun: false, budget: 10, now: NOW });
    assert.match(r.error ?? "", /boom/);
  });

  if (failures) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log("\nall abuseReportsPurge checks passed");
}

void run();
