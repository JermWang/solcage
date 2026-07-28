/**
 * Devnet round trip for the cashier's on-chain code, importing the REAL
 * functions the deposit and withdrawal APIs call — verifyIncomingSol and
 * sendHouseSol from lib/house-solana.ts — rather than inline copies.
 *
 * Mirrors the new one-click flow:
 *   deposit  : player sends a plain SOL transfer to the house (what the browser
 *              builds), then the server verifies it on-chain.
 *   withdraw : the house sends SOL back out to the player.
 *
 * Runs entirely on devnet with an ephemeral house wallet. The mainnet house
 * key is never touched.
 */
import fs from "node:fs";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const PLAYER_PATH = process.env.SOLCAGE_DEVNET_DEPLOYER_KEYPAIR
  ?? "tmp/solcage-devnet-deployer-keypair.json";
const DEPOSIT_LAMPORTS = 80_000_000n; // 0.08 SOL
const WITHDRAW_LAMPORTS = 30_000_000n; // 0.03 SOL

const player = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(PLAYER_PATH, "utf8"))),
);
const house = Keypair.generate();

// The real lib functions read these at call time, so set them before import.
process.env.SOLANA_RPC_URL = RPC_URL;
process.env.SOLCAGE_HOUSE_WALLET = house.publicKey.toBase58();
process.env.SOLCAGE_HOUSE_SECRET_KEY = JSON.stringify(Array.from(house.secretKey));

const { verifyIncomingSol, sendHouseSol, houseTreasuryOnChain, HOUSE_RESERVE_LAMPORTS } =
  await import("../lib/house-solana.ts");

const connection = new Connection(RPC_URL, "confirmed");
const checks = [];
const check = (label, pass, detail = "") => {
  checks.push({ label, pass, detail });
  if (!pass) throw new Error(`FAILED: ${label} ${detail}`);
};

const playerStart = BigInt(await connection.getBalance(player.publicKey, "confirmed"));
if (playerStart < DEPOSIT_LAMPORTS + 20_000_000n) {
  throw new Error(`Devnet player needs more SOL (has ${Number(playerStart) / LAMPORTS_PER_SOL})`);
}

// --- DEPOSIT: player -> house, exactly what the browser builds ------------
const depositTx = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: player.publicKey,
    toPubkey: house.publicKey,
    lamports: Number(DEPOSIT_LAMPORTS),
  }),
);
const depositSig = await sendAndConfirmTransaction(connection, depositTx, [player], {
  commitment: "finalized",
});

// The real server verifier accepts it.
const verified = await verifyIncomingSol({
  signature: depositSig,
  owner: player.publicKey.toBase58(),
  destination: house.publicKey.toBase58(),
  lamports: DEPOSIT_LAMPORTS,
});
check("deposit verified by the real server function", Boolean(verified.slot), JSON.stringify(verified));

// The real verifier rejects a claimed amount that does not match the chain.
let rejectedAmount = false;
try {
  await verifyIncomingSol({
    signature: depositSig,
    owner: player.publicKey.toBase58(),
    destination: house.publicKey.toBase58(),
    lamports: DEPOSIT_LAMPORTS + 1n,
  });
} catch {
  rejectedAmount = true;
}
check("verifier rejects a mismatched amount", rejectedAmount);

// And rejects a different claimed sender.
let rejectedOwner = false;
try {
  await verifyIncomingSol({
    signature: depositSig,
    owner: house.publicKey.toBase58(),
    destination: house.publicKey.toBase58(),
    lamports: DEPOSIT_LAMPORTS,
  });
} catch {
  rejectedOwner = true;
}
check("verifier rejects a mismatched sender", rejectedOwner);

// --- WITHDRAW: house -> player, via the real send function ----------------
const treasuryBefore = await houseTreasuryOnChain();
check(
  "house treasury reads its spendable balance",
  treasuryBefore.spendable === DEPOSIT_LAMPORTS - HOUSE_RESERVE_LAMPORTS,
  `spendable ${treasuryBefore.spendable}`,
);

const playerBeforeWithdraw = BigInt(await connection.getBalance(player.publicKey, "confirmed"));
const sent = await sendHouseSol({ destination: player.publicKey.toBase58(), lamports: WITHDRAW_LAMPORTS });
check("withdrawal broadcast by the real send function", Boolean(sent.signature), sent.signature ?? "");

// The real function refuses to overdraw the reserve.
let refusedOverdraw = false;
try {
  await sendHouseSol({ destination: player.publicKey.toBase58(), lamports: 10_000_000_000n });
} catch {
  refusedOverdraw = true;
}
check("send refuses to spend into the reserve", refusedOverdraw);

const playerAfter = BigInt(await connection.getBalance(player.publicKey, "confirmed"));
check(
  "player received the withdrawal",
  playerAfter - playerBeforeWithdraw === WITHDRAW_LAMPORTS,
  `delta ${playerAfter - playerBeforeWithdraw}`,
);

const treasuryAfter = await houseTreasuryOnChain();
check(
  "house kept its rent/fee reserve",
  treasuryAfter.lamports >= HOUSE_RESERVE_LAMPORTS,
  `lamports ${treasuryAfter.lamports}`,
);

console.log(JSON.stringify({
  ok: true,
  network: "devnet",
  player: player.publicKey.toBase58(),
  house: house.publicKey.toBase58(),
  depositSignature: depositSig,
  withdrawSignature: sent.signature,
  checks: checks.map((c) => c.label),
}, null, 2));
