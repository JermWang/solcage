import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import { db, transaction as dbTransaction } from "@/lib/db";
import { authRequired, isAuthRequired, json, requireIdentity } from "@/lib/identity";
import {
  collateralMarketsFromEnvironment,
  isSolanaPublicKey,
  SPL_TOKEN_PROGRAM_ID,
  type CollateralMarket,
} from "@/lib/solana/markets";
import { cachedProtocolReadiness } from "@/lib/solana/readiness";

export const dynamic = "force-dynamic";

const DEPOSIT_DISCRIMINATOR = new Uint8Array([156, 131, 142, 116, 146, 247, 162, 120]);
const BORROW_DISCRIMINATOR = new Uint8Array([228, 253, 131, 202, 207, 116, 89, 18]);
const REPAY_DISCRIMINATOR = new Uint8Array([234, 103, 67, 82, 208, 234, 219, 166]);
const WITHDRAW_DISCRIMINATOR = new Uint8Array([115, 135, 168, 106, 139, 214, 138, 150]);
const POSITION_DISCRIMINATOR = new Uint8Array([170, 188, 143, 228, 122, 64, 247, 208]);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";

type RpcResponse<T> = { result?: T; error?: { message?: string } };
type ParsedInstruction = { programId?: string; accounts?: string[]; data?: string };
type ParsedTransaction = {
  slot: number;
  blockTime: number | null;
  meta: { err: unknown; fee?: number; computeUnitsConsumed?: number } | null;
  transaction: {
    message: {
      accountKeys: Array<string | { pubkey: string; signer?: boolean }>;
      instructions: ParsedInstruction[];
    };
  };
};

function rpcUrl() {
  return process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
}

async function rpc<T>(method: string, params: unknown[]) {
  const response = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method, params }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Solana RPC returned HTTP ${response.status}`);
  const payload = await response.json() as RpcResponse<T>;
  if (payload.error || payload.result === undefined) {
    throw new Error(payload.error?.message ?? "Solana RPC did not return a result");
  }
  return payload.result;
}

function matches(left: Uint8Array, right: Uint8Array) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function instructionAction(data: Uint8Array) {
  const discriminator = data.slice(0, 8);
  if (matches(discriminator, DEPOSIT_DISCRIMINATOR)) return "deposit" as const;
  if (matches(discriminator, BORROW_DISCRIMINATOR)) return "borrow" as const;
  if (matches(discriminator, REPAY_DISCRIMINATOR)) return "repay" as const;
  if (matches(discriminator, WITHDRAW_DISCRIMINATOR)) return "withdraw" as const;
  return null;
}

function lendingAccounts(programId: PublicKey, market: CollateralMarket, owner: PublicKey) {
  const mint = new PublicKey(market.mint);
  const [protocol] = PublicKey.findProgramAddressSync([Buffer.from("protocol")], programId);
  const [marketAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), mint.toBuffer()],
    programId,
  );
  const [position] = PublicKey.findProgramAddressSync(
    [Buffer.from("position"), marketAddress.toBuffer(), owner.toBuffer()],
    programId,
  );
  return { protocol, marketAddress, position };
}

function associatedTokenAddress(mint: PublicKey, owner: PublicKey, tokenProgram: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

async function verifiedWallet(userId: string) {
  const result = await db().query(
    `SELECT wallet_address FROM users
     WHERE id = $1 AND wallet_verified_at IS NOT NULL`,
    [userId],
  );
  return result.rows[0]?.wallet_address as string | undefined;
}

async function currentPositions(wallet: string, programIdValue: string, markets: CollateralMarket[]) {
  if (!isSolanaPublicKey(wallet) || !isSolanaPublicKey(programIdValue) || !markets.length) return [];
  const owner = new PublicKey(wallet);
  const programId = new PublicKey(programIdValue);
  const addresses = markets.map((market) => lendingAccounts(programId, market, owner).position.toBase58());
  const accounts = await rpc<Array<{
    data: [string, "base64"];
    owner: string;
  } | null>>("getMultipleAccounts", [
    addresses,
    { encoding: "base64", commitment: "finalized" },
  ]);

  return accounts.flatMap((account, index) => {
    if (!account || account.owner !== programIdValue) return [];
    const data = Buffer.from(account.data[0], "base64");
    if (data.length < 89 || !matches(data.subarray(0, 8), POSITION_DISCRIMINATOR)) return [];
    const collateralAmount = data.readBigUInt64LE(72);
    const debtAmount = data.readBigUInt64LE(80);
    if (collateralAmount === 0n && debtAmount === 0n) return [];
    return [{
      symbol: markets[index].symbol,
      mint: markets[index].mint,
      decimals: markets[index].decimals,
      collateralAmount: collateralAmount.toString(),
      debtAmount: debtAmount.toString(),
      positionAddress: addresses[index],
    }];
  });
}

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity(request);
    const wallet = await verifiedWallet(identity.userId);
    const programId = process.env.SOLCAGE_LENDING_PROGRAM_ID ?? "";
    const borrowMint = process.env.SOLCAGE_BORROW_MINT ?? "";
    const borrowDecimals = Number(process.env.SOLCAGE_BORROW_DECIMALS ?? "6");
    const borrowTokenProgram = process.env.SOLCAGE_BORROW_TOKEN_PROGRAM ?? SPL_TOKEN_PROGRAM_ID;
    const markets = collateralMarketsFromEnvironment().filter((market) => market.enabled);
    const history = await db().query(
      `SELECT signature, action, asset_symbol, mint_address, raw_amount::text,
              slot::text, block_time, status, created_at
       FROM protocol_transactions
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [identity.userId],
    );

    let positions: Awaited<ReturnType<typeof currentPositions>> = [];
    const readiness = await cachedProtocolReadiness({
      rpcUrl: rpcUrl(),
      programId,
      borrowMint,
      borrowDecimals,
      borrowTokenProgram,
      markets,
    });
    let reconciliationStatus: "connected" | "configuration-required" | "rpc-unavailable" | "on-chain-mismatch" =
      readiness.ready && wallet ? "connected" : readiness.state;
    if (readiness.ready && wallet) {
      try {
        positions = await currentPositions(wallet, programId, markets);
      } catch {
        reconciliationStatus = "rpc-unavailable";
      }
    }

    return json({ history: history.rows, positions, reconciliationStatus }, 200, identity);
  } catch (error) {
    if (isAuthRequired(error)) return authRequired();
    return json({ error: error instanceof Error ? error.message : "Unable to load protocol history" }, 400);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireIdentity(request);
    const wallet = await verifiedWallet(identity.userId);
    if (!wallet || !isSolanaPublicKey(wallet)) {
      return json({ error: "Verify the submitting Solana wallet first" }, 403, identity);
    }

    const body = await request.json() as { signature?: unknown };
    if (typeof body.signature !== "string" || body.signature.length > 96) {
      return json({ error: "Invalid transaction signature" }, 400, identity);
    }
    try {
      if (bs58.decode(body.signature).length !== 64) throw new Error("invalid");
    } catch {
      return json({ error: "Invalid transaction signature" }, 400, identity);
    }

    const programIdValue = process.env.SOLCAGE_LENDING_PROGRAM_ID ?? "";
    const borrowMint = process.env.SOLCAGE_BORROW_MINT ?? "";
    const borrowDecimals = Number(process.env.SOLCAGE_BORROW_DECIMALS ?? "6");
    const borrowTokenProgram = process.env.SOLCAGE_BORROW_TOKEN_PROGRAM ?? SPL_TOKEN_PROGRAM_ID;
    if (!isSolanaPublicKey(programIdValue)) {
      return json({ error: "The production lending program is not configured" }, 503, identity);
    }
    if (!isSolanaPublicKey(borrowMint)) {
      return json({ error: "The production borrow mint is not configured" }, 503, identity);
    }
    const markets = collateralMarketsFromEnvironment().filter((market) => market.enabled);
    if (!markets.length) {
      return json({ error: "No production collateral markets are configured" }, 503, identity);
    }
    const readiness = await cachedProtocolReadiness({
      rpcUrl: rpcUrl(),
      programId: programIdValue,
      borrowMint,
      borrowDecimals,
      borrowTokenProgram,
      markets,
    });
    if (!readiness.ready) {
      return json({
        error: "The configured lending deployment did not pass on-chain readiness checks",
        readiness: readiness.state,
      }, 503, identity);
    }

    const chainTransaction = await rpc<ParsedTransaction | null>("getTransaction", [
      body.signature,
      {
        encoding: "jsonParsed",
        commitment: "finalized",
        maxSupportedTransactionVersion: 0,
      },
    ]);
    if (!chainTransaction || !chainTransaction.meta || chainTransaction.meta.err) {
      return json({ error: "Transaction is missing, unconfirmed, or failed" }, 422, identity);
    }

    const signerKeys = chainTransaction.transaction.message.accountKeys
      .filter((key) => typeof key !== "string" && key.signer)
      .map((key) => typeof key === "string" ? key : key.pubkey);
    if (!signerKeys.includes(wallet)) {
      return json({ error: "The verified wallet did not sign this transaction" }, 403, identity);
    }

    const lendingInstructions = chainTransaction.transaction.message.instructions.filter(
      (candidate) => candidate.programId === programIdValue && typeof candidate.data === "string",
    );
    if (lendingInstructions.length !== 1) {
      return json({ error: "Transaction must contain exactly one SolCage lending instruction" }, 422, identity);
    }
    const instruction = lendingInstructions[0];
    if (!instruction?.data || !instruction.accounts || instruction.accounts.length < 8) {
      return json({ error: "No supported SolCage lending instruction was found" }, 422, identity);
    }
    const instructionBytes = bs58.decode(instruction.data);
    if (instructionBytes.length !== 16) {
      return json({ error: "Malformed lending instruction" }, 422, identity);
    }
    const action = instructionAction(instructionBytes);
    if (!action) return json({ error: "Unsupported lending instruction" }, 422, identity);
    const rawAmount = Buffer.from(instructionBytes).readBigUInt64LE(8);
    if (rawAmount === 0n) return json({ error: "Malformed lending amount" }, 422, identity);

    const programId = new PublicKey(programIdValue);
    const owner = new PublicKey(wallet);
    const market = action === "repay"
      ? markets.find((candidate) => (
          lendingAccounts(programId, candidate, owner).marketAddress.toBase58() === instruction.accounts?.[3]
        ))
      : markets.find((candidate) => candidate.mint === instruction.accounts?.[2]);
    if (!market) return json({ error: "Transaction uses an unsupported collateral mint" }, 422, identity);
    const expected = lendingAccounts(programId, market, owner);
    const collateralMint = new PublicKey(market.mint);
    const collateralTokenProgram = new PublicKey(market.tokenProgram);
    const borrowMintKey = new PublicKey(borrowMint);
    const borrowTokenProgramKey = new PublicKey(borrowTokenProgram);
    const ownerCollateralAccount = associatedTokenAddress(collateralMint, owner, collateralTokenProgram);
    const collateralVault = associatedTokenAddress(collateralMint, expected.marketAddress, collateralTokenProgram);
    const ownerBorrowAccount = associatedTokenAddress(borrowMintKey, owner, borrowTokenProgramKey);
    const liquidityVault = associatedTokenAddress(borrowMintKey, expected.protocol, borrowTokenProgramKey);
    const expectedAccounts = action === "deposit"
      ? [
          wallet,
          expected.protocol.toBase58(),
          market.mint,
          expected.marketAddress.toBase58(),
          expected.position.toBase58(),
          ownerCollateralAccount.toBase58(),
          collateralVault.toBase58(),
          market.tokenProgram,
          SYSTEM_PROGRAM_ID,
        ]
      : action === "withdraw"
        ? [
            wallet,
            expected.protocol.toBase58(),
            market.mint,
            expected.marketAddress.toBase58(),
            expected.position.toBase58(),
            ownerCollateralAccount.toBase58(),
            collateralVault.toBase58(),
            market.tokenProgram,
          ]
      : action === "borrow"
        ? [
            wallet,
            expected.protocol.toBase58(),
            market.mint,
            borrowMint,
            expected.marketAddress.toBase58(),
            expected.position.toBase58(),
            market.priceFeedAccount,
            liquidityVault.toBase58(),
            ownerBorrowAccount.toBase58(),
            borrowTokenProgram,
          ]
        : [
            wallet,
            expected.protocol.toBase58(),
            borrowMint,
            expected.marketAddress.toBase58(),
            expected.position.toBase58(),
            ownerBorrowAccount.toBase58(),
            liquidityVault.toBase58(),
            borrowTokenProgram,
          ];
    if (
      instruction.accounts.length !== expectedAccounts.length
      || !expectedAccounts.every((address, index) => instruction.accounts?.[index] === address)
    ) {
      return json({ error: "Transaction accounts do not match the configured lending market" }, 422, identity);
    }
    const settledSymbol = action === "borrow" || action === "repay" ? "USDC" : market.symbol;
    const settledMint = action === "borrow" || action === "repay" ? borrowMint : market.mint;

    const inserted = await dbTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO protocol_transactions
         (id, user_id, signature, action, asset_symbol, mint_address, raw_amount, slot, block_time, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
         ON CONFLICT (signature) DO NOTHING
         RETURNING signature`,
        [
          crypto.randomUUID(),
          identity.userId,
          body.signature,
          action,
          settledSymbol,
          settledMint,
          rawAmount.toString(),
          chainTransaction.slot,
          chainTransaction.blockTime ? new Date(chainTransaction.blockTime * 1_000) : null,
          JSON.stringify({
            fee: chainTransaction.meta?.fee ?? null,
            computeUnitsConsumed: chainTransaction.meta?.computeUnitsConsumed ?? null,
            position: expected.position.toBase58(),
            collateralSymbol: market.symbol,
            collateralMint: market.mint,
          }),
        ],
      );

      if (result.rowCount && action === "deposit") {
        const deposits = await client.query(
          `SELECT COUNT(*)::int AS count FROM protocol_transactions
           WHERE user_id = $1 AND mint_address = $2 AND action = 'deposit'`,
          [identity.userId, market.mint],
        );
        if (deposits.rows[0].count === 1) {
          const referrer = await client.query("SELECT referred_by FROM users WHERE id = $1", [identity.userId]);
          const multiplier = referrer.rows[0]?.referred_by ? 1.25 : 1;
          const points = Math.round(50 * multiplier);
          await client.query(
            `INSERT INTO reward_ledger
             (id, user_id, kind, base_points, multiplier, points, description, event_key, metadata)
             VALUES ($1, $2, 'lending_position', 50, $3, $4, $5, $6, $7::jsonb)
             ON CONFLICT (event_key) DO NOTHING`,
            [
              crypto.randomUUID(),
              identity.userId,
              multiplier,
              points,
              `Opened first verified ${market.symbol} collateral position`,
              `protocol:${body.signature}`,
              JSON.stringify({ signature: body.signature, mint: market.mint }),
            ],
          );
        }
      }
      return Boolean(result.rowCount);
    });

    return json({
      recorded: inserted,
      signature: body.signature,
      action,
      symbol: settledSymbol,
      rawAmount: rawAmount.toString(),
      slot: chainTransaction.slot,
    }, inserted ? 201 : 200, identity);
  } catch (error) {
    if (isAuthRequired(error)) return authRequired();
    return json({ error: error instanceof Error ? error.message : "Unable to verify transaction" }, 400);
  }
}
