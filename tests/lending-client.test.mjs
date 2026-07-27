import assert from "node:assert/strict";
import test from "node:test";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  buildLendingInstruction,
  decimalToBaseUnits,
  deriveAssociatedTokenAddress,
  deriveLendingAccounts,
} from "../lib/solana/lendingClient.ts";
import {
  isSupportedTokenProgram,
  SPL_TOKEN_2022_PROGRAM_ID,
  SPL_TOKEN_PROGRAM_ID,
} from "../lib/solana/markets.ts";

const CLASSIC_TOKEN_PROGRAM = new PublicKey(SPL_TOKEN_PROGRAM_ID);
const TOKEN_2022_PROGRAM = new PublicKey(SPL_TOKEN_2022_PROGRAM_ID);

function key(fill) {
  return new PublicKey(new Uint8Array(32).fill(fill)).toBase58();
}

const programId = key(1);
const owner = key(2);
const collateralMint = key(3);
const borrowMint = key(4);
const priceFeedAccount = key(5);
const market = {
  symbol: "MEME",
  mint: collateralMint,
  decimals: 6,
  tokenProgram: TOKEN_2022_PROGRAM.toBase58(),
  priceFeedAccount,
  enabled: true,
};

test("decimal amounts convert exactly and reject unsafe values", () => {
  assert.equal(decimalToBaseUnits("12.3456", 6), 12_345_600n);
  assert.equal(decimalToBaseUnits("1", 0), 1n);
  assert.throws(() => decimalToBaseUnits("0", 6), /greater than zero/);
  assert.throws(() => decimalToBaseUnits("1.0000001", 6), /6 decimal places/);
  assert.throws(() => decimalToBaseUnits("1e6", 6), /valid collateral amount/);
  assert.throws(() => decimalToBaseUnits("18446744073709551616", 0), /protocol limit/);
});

test("only canonical SPL token programs can be configured", () => {
  assert.equal(isSupportedTokenProgram(SPL_TOKEN_PROGRAM_ID), true);
  assert.equal(isSupportedTokenProgram(SPL_TOKEN_2022_PROGRAM_ID), true);
  assert.equal(isSupportedTokenProgram(key(9)), false);
});

test("Token-2022 collateral deposit uses its own vault and token program", () => {
  const instruction = buildLendingInstruction({
    action: "deposit",
    amount: 1_500_000n,
    programId,
    owner,
    borrowMint,
    borrowTokenProgram: CLASSIC_TOKEN_PROGRAM.toBase58(),
    market,
  });
  const derived = deriveLendingAccounts(programId, collateralMint, owner);
  const expectedOwnerAta = deriveAssociatedTokenAddress(
    new PublicKey(collateralMint),
    new PublicKey(owner),
    TOKEN_2022_PROGRAM,
  );
  const expectedVault = deriveAssociatedTokenAddress(
    new PublicKey(collateralMint),
    derived.market,
    TOKEN_2022_PROGRAM,
  );
  assert.equal(instruction.keys.length, 9);
  assert.deepEqual(instruction.keys.map((entry) => entry.pubkey.toBase58()), [
    owner,
    derived.protocol.toBase58(),
    collateralMint,
    derived.market.toBase58(),
    derived.position.toBase58(),
    expectedOwnerAta.toBase58(),
    expectedVault.toBase58(),
    TOKEN_2022_PROGRAM.toBase58(),
    SystemProgram.programId.toBase58(),
  ]);
  assert.deepEqual([...instruction.data.subarray(0, 8)], [156, 131, 142, 116, 146, 247, 162, 120]);
  assert.equal(Buffer.from(instruction.data).readBigUInt64LE(8), 1_500_000n);
});

test("USDC borrow stays on the classic token program with Token-2022 collateral", () => {
  const instruction = buildLendingInstruction({
    action: "borrow",
    amount: 750_000n,
    programId,
    owner,
    borrowMint,
    borrowTokenProgram: CLASSIC_TOKEN_PROGRAM.toBase58(),
    market,
  });
  const derived = deriveLendingAccounts(programId, collateralMint, owner);
  const expectedOwnerBorrowAta = deriveAssociatedTokenAddress(
    new PublicKey(borrowMint),
    new PublicKey(owner),
    CLASSIC_TOKEN_PROGRAM,
  );
  const expectedLiquidityVault = deriveAssociatedTokenAddress(
    new PublicKey(borrowMint),
    derived.protocol,
    CLASSIC_TOKEN_PROGRAM,
  );
  assert.equal(instruction.keys.length, 10);
  assert.equal(instruction.keys[7].pubkey.toBase58(), expectedLiquidityVault.toBase58());
  assert.equal(instruction.keys[8].pubkey.toBase58(), expectedOwnerBorrowAta.toBase58());
  assert.equal(instruction.keys[9].pubkey.toBase58(), CLASSIC_TOKEN_PROGRAM.toBase58());
  assert.notEqual(instruction.keys[9].pubkey.toBase58(), market.tokenProgram);
});

test("withdraw and repay use exact Anchor account order", () => {
  const withdraw = buildLendingInstruction({
    action: "withdraw",
    amount: 1n,
    programId,
    owner,
    borrowMint,
    borrowTokenProgram: CLASSIC_TOKEN_PROGRAM.toBase58(),
    market,
  });
  const repay = buildLendingInstruction({
    action: "repay",
    amount: 1n,
    programId,
    owner,
    borrowMint,
    borrowTokenProgram: CLASSIC_TOKEN_PROGRAM.toBase58(),
    market,
  });
  assert.equal(withdraw.keys.length, 8);
  assert.equal(withdraw.keys[7].pubkey.toBase58(), TOKEN_2022_PROGRAM.toBase58());
  assert.equal(repay.keys.length, 8);
  assert.equal(repay.keys[2].pubkey.toBase58(), borrowMint);
  assert.equal(repay.keys[7].pubkey.toBase58(), CLASSIC_TOKEN_PROGRAM.toBase58());
  assert.deepEqual([...withdraw.data.subarray(0, 8)], [115, 135, 168, 106, 139, 214, 138, 150]);
  assert.deepEqual([...repay.data.subarray(0, 8)], [234, 103, 67, 82, 208, 234, 219, 166]);
});
