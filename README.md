# SolCage

SolCage combines a Solana casino lobby, provably fair game rounds, wallet-owned
profiles, loyalty rewards, referrals, and a non-custodial memecoin lending
protocol.

## Product surfaces

- Casino lobby with Roulette, Dice, Slots, Plinko, and Blackjack
- Server commit/reveal settlement using HMAC-SHA256 and player client seeds
- PostgreSQL-backed profiles, avatars, verified Solana wallets, game history,
  rewards, referral multipliers, and a global leaderboard
- Dedicated lending terminal with configured collateral markets, Phantom
  transaction signing, program-derived token vaults, and transaction
  reconciliation from Solana RPC
- Anchor lending program with collateral deposits, USDC borrowing and
  repayment, debt-free withdrawals, Pyth pricing, and permissionless
  liquidation

Game foundations and exact reviewed commits are documented in
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).

## Local application

Requirements:

- Node.js 22.13 or newer
- PostgreSQL

```bash
npm ci
npm run dev
npm run build
npm test
```

The application creates its PostgreSQL tables idempotently at runtime.

## Runtime configuration

Copy `.env.example` to `.env.local` for development. `DATABASE_URL` is
required for profiles, sessions, rewards, games, and protocol history.

`SOLCAGE_COLLATERAL_MARKETS` is a JSON array. A market is ignored unless its
mint, fixed Pyth price-feed PDA, shard, feed ID, decimal count, LTV limits, and
token program all pass validation. `config/collateral-markets.mainnet.json`
contains the reviewed mainnet manifest; only its enabled entries should be
serialized into the environment. `SOLCAGE_BORROW_TOKEN_PROGRAM` identifies
the token program used by the borrow mint independently of each collateral
mint, so Token-2022 collateral can borrow classic SPL USDC safely.

The web transaction button stays disabled until a finalized RPC attestation
proves that the program is executable, the protocol and market PDAs contain the
configured mints, Pyth feed IDs, risk limits, and enabled state, the Pyth update
is fully verified, fresh, positive, and inside its confidence bound, both mint
accounts have the configured decimals and token programs, and the
program-controlled associated-token vaults exist with the expected authorities.
Environment strings alone cannot enable deposits or withdrawals.

Before enabling or retaining any mainnet collateral, run:

```bash
npm run protocol:verify-markets
```

This checks each enabled manifest entry against finalized mint state, its exact
Pyth shard/feed PDA, full verification, freshness and confidence, plus the
$10M market-cap and minimum DEX-liquidity gates. Watch-list assets stay disabled
until they pass the same oracle and liquidity requirements.

Never configure an upgradeable production program until its upgrade authority,
auditor report, oracle feeds, liquidity vault, monitoring, and liquidator
operations have been independently verified.

## On-chain program

The Anchor workspace is under `programs/solcage_lending`.

```bash
cargo fmt --all --check
cargo test --workspace --lib
anchor build
anchor keys sync
anchor test
```

The controlled devnet program identity is
`3UmM2kDDvyJMNXULcH2m7ACfSLURWtQKmvW17S97U4At`. Its deployment keypairs are
encrypted GitHub Actions secrets and never committed to source. CI builds and
retains a deployable SBF artifact, while the manual devnet workflow restores
the protected key material only for the duration of a deployment. Production
must use a separate program identity and secured authority; the devnet
authority must never be reused for mainnet.

Program state:

- `protocol` PDA: administrator, borrow mint, pause control
- `market` PDA: collateral mint, risk parameters, oracle feed, aggregate state
- `position` PDA: wallet owner, collateral amount, debt amount
- market-owned associated token account: collateral vault
- protocol-owned associated token account: borrow-liquidity vault

There is no server hot-wallet withdrawal path. A collateral withdrawal is
signed by the position owner and currently requires zero outstanding debt.

## Deployment

The production web service runs on Railway with managed PostgreSQL. The same
validated source is also published through OpenAI Sites using the existing
project ID in `.openai/hosting.json`.

Every release should pass:

```bash
npm run lint
npm test
npm audit --omit=dev
```

The protocol workflow in `.github/workflows/protocol-ci.yml` independently
checks Rust formatting, unit tests, and Clippy on Linux.
