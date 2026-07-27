/**
 * One-off repair for the smoke test's residue.
 *
 * ledger_entries.user_id was ON DELETE CASCADE, so removing the test account
 * deleted its legs and left the system-side counterparts orphaned — half of
 * every posting. Removes those postings (cascading their legs) and reports the
 * invariant before and after.
 *
 * Refuses to touch anything that is not the smoke test's own correlation ids.
 */
import { db, transaction } from "../lib/db.ts";
import { ledgerIsBalanced } from "../lib/bankroll.ts";

const SMOKE_PREFIXES = ["smoke-", "deposit:smoke-", "rake-sweep:smoke"];

const before = await db().query(
  `SELECT COALESCE(SUM(amount_raw), 0)::text AS net, count(*)::int AS entries FROM ledger_entries`,
);
console.log("before:", before.rows[0]);

const doomed = await db().query(
  `SELECT id, correlation_id FROM ledger_postings
   WHERE ${SMOKE_PREFIXES.map((_, i) => `correlation_id LIKE $${i + 1}`).join(" OR ")}`,
  SMOKE_PREFIXES.map((p) => `${p}%`),
);
console.log(`matched ${doomed.rowCount} smoke postings`);

const stray = await db().query(
  `SELECT count(*)::int AS count FROM ledger_postings
   WHERE NOT (${SMOKE_PREFIXES.map((_, i) => `correlation_id LIKE $${i + 1}`).join(" OR ")})`,
  SMOKE_PREFIXES.map((p) => `${p}%`),
);
if (stray.rows[0].count > 0) {
  throw new Error(`Refusing to run: ${stray.rows[0].count} non-smoke postings present`);
}

await transaction(async (client) => {
  for (const row of doomed.rows) {
    await client.query("DELETE FROM ledger_postings WHERE id = $1", [row.id]);
  }
});

const after = await db().query(
  `SELECT COALESCE(SUM(amount_raw), 0)::text AS net, count(*)::int AS entries FROM ledger_entries`,
);
const balanced = await transaction((c) => ledgerIsBalanced(c));
console.log("after:", after.rows[0], "| balanced:", balanced);
await db().end();
