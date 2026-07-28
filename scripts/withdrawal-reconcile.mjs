/**
 * Reconcile withdrawals against the chain.
 *
 *   node scripts/withdrawal-reconcile.mjs            # report only, changes nothing
 *   node scripts/withdrawal-reconcile.mjs --resolve  # settle or refund from chain
 *
 * A withdrawal can be broadcast and then lose its confirmation — a stalled
 * websocket, a killed request — leaving the row in `sending` or, worse, refunded
 * despite the SOL having landed. This walks every unfinished row, finds the
 * matching outgoing transfer in the house wallet's history, and makes the ledger
 * say what actually happened.
 *
 * It never broadcasts anything. A row it cannot match is reported, not guessed at.
 */
import { db, transaction } from "../lib/db.ts";
import { postLedger } from "../lib/bankroll.ts";

const RESOLVE = process.argv.includes("--resolve");
const rpcUrl = process.env.SOLANA_RPC_URL;
const house = process.env.SOLCAGE_HOUSE_WALLET;
if (!rpcUrl || !house) throw new Error("SOLANA_RPC_URL and SOLCAGE_HOUSE_WALLET must be set");

async function rpc(method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

/** Outgoing transfers from the house wallet, newest first, with amounts. */
async function outgoingTransfers(limit = 25) {
  const signatures = await rpc("getSignaturesForAddress", [house, { limit }]);
  const out = [];
  for (const entry of signatures) {
    if (entry.err) continue;
    const tx = await rpc("getTransaction", [entry.signature, { maxSupportedTransactionVersion: 0 }]);
    if (!tx) continue;
    const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === "string" ? k : k.pubkey));
    const index = keys.indexOf(house);
    if (index < 0) continue;
    const delta = BigInt(tx.meta.postBalances[index]) - BigInt(tx.meta.preBalances[index]);
    if (delta < 0n) {
      out.push({ signature: entry.signature, sentRaw: -delta, keys, blockTime: entry.blockTime });
    }
  }
  return out;
}

const unfinished = await db().query(
  `SELECT id, user_id, destination, amount_raw::text AS amount_raw, status, signature
   FROM withdrawals
   WHERE status IN ('sending', 'failed')
   ORDER BY created_at DESC`,
);

if (!unfinished.rowCount) {
  console.log("No unfinished withdrawals. Nothing to reconcile.");
  process.exit(0);
}

const transfers = await outgoingTransfers();
console.log(`${unfinished.rowCount} unfinished withdrawal(s); ${transfers.length} outgoing transfer(s) on chain\n`);

for (const row of unfinished.rows) {
  const amountRaw = BigInt(row.amount_raw);
  const label = `${row.id.slice(0, 8)} ${row.status} ${(Number(amountRaw) / 1e9).toFixed(4)} SOL`;

  // Match on the recorded signature when we have one, otherwise on an outgoing
  // transfer to this destination for this amount (fee makes it slightly larger).
  const match = row.signature
    ? transfers.find((t) => t.signature === row.signature)
    : transfers.find((t) =>
        t.keys.includes(row.destination)
        && t.sentRaw >= amountRaw
        && t.sentRaw <= amountRaw + 10_000n);

  if (!match) {
    console.log(`  ${label} -> no matching transfer on chain; the SOL was not sent`);
    if (RESOLVE && row.status === "sending") {
      console.log("     (left in sending — refund it manually only after checking the wallet yourself)");
    }
    continue;
  }

  if (row.status === "sent") continue;

  console.log(`  ${label} -> LANDED on chain as ${match.signature.slice(0, 16)}…`);

  if (!RESOLVE) {
    console.log("     run with --resolve to record it as sent");
    continue;
  }

  await transaction(async (client) => {
    const current = await client.query("SELECT status FROM withdrawals WHERE id = $1 FOR UPDATE", [row.id]);
    if (current.rows[0].status === "sent") {
      console.log("     already settled");
      return;
    }
    // If it was refunded in error, the player is holding the amount twice: once
    // on chain and once in their balance. Posting it out of USER_AVAILABLE puts
    // the ledger back in step with the chain.
    const wasRefunded = await client.query(
      "SELECT 1 FROM ledger_postings WHERE correlation_id = $1",
      [`withdrawal-refund:${row.id}`],
    );
    const from = wasRefunded.rowCount ? "USER_AVAILABLE" : "WITHDRAWAL_PENDING";

    await postLedger(client, {
      correlationId: `withdrawal-reconciled:${row.id}`,
      reason: "WITHDRAWAL_SENT",
      metadata: { signature: match.signature, reconciled: true, from },
      legs: [
        { account: from, userId: row.user_id, amountRaw: -amountRaw },
        { account: "EXTERNAL", amountRaw },
      ],
    });
    await client.query(
      `UPDATE withdrawals SET status = 'sent', signature = $2, failure_reason = NULL,
              updated_at = NOW() WHERE id = $1`,
      [row.id, match.signature],
    );
    console.log(`     settled as sent (drawn from ${from})`);
  });
}

const accounts = await db().query(
  "SELECT account, SUM(amount_raw)::text AS total FROM ledger_entries GROUP BY account ORDER BY account",
);
console.log("\nLedger:");
for (const account of accounts.rows) {
  console.log(`  ${account.account.padEnd(20)} ${(Number(account.total) / 1e9).toFixed(6)} SOL`);
}
const net = await db().query("SELECT SUM(amount_raw)::text AS net FROM ledger_entries");
console.log(`  net ${net.rows[0].net} (must be 0)`);
process.exit(0);
