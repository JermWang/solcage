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
mint, Pyth price-update account, Pyth feed ID, decimal count, LTV limits, and
token program all pass validation. The web transaction button stays disabled
unless both a valid program ID and at least one enabled market exist.

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

`Anchor.toml` contains a non-deployed placeholder public key for reproducible
source builds. Generate the actual program keypair outside source control, run
`anchor keys sync`, then commit the resulting public program ID before a
deployment. Program keypairs are gitignored.

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
