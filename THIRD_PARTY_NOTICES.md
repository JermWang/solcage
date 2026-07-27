# Third-party notices

SolCage includes the following permissively licensed foundations.

## React Casino Roulette

- Source: https://github.com/IvanAdmaers/react-casino-roulette
- Package: `react-casino-roulette` 1.1.2
- License: MIT
- Copyright: Ivan Admaers

The roulette wheel presentation is reskinned by SolCage. Game outcomes and
settlement do not use the package's random helpers.

## Provable.IO Core

- Source: https://github.com/provableio/provable-core
- Package: `@provableio/provable-core` 1.0.1
- License: MIT

SolCage uses the HMAC-SHA256 byte generator for deterministic, reproducible
roulette, dice, and slot outcomes.

## Casino Client

- Source: https://github.com/krysits/casino-client
- Revision reviewed: `776ed64062f40d3acda88769328bfc60dff81638`
- License: MIT
- Copyright: 2018 Kristaps Ledins

The five-reel, three-row matrix, nine win-line vectors, configurable line bet,
and winning-cell highlight structure informed Neon Vault. SolCage replaces the
original MD5 demo hash, browser credit state, and count-only award calculation
with fixed weighted reel strips, symbol-specific wild substitution, scatter
awards, exact return analysis, committed HMAC-SHA256 stops, a PostgreSQL row
lock, idempotent settlement, and atomic loyalty credit.

## HTML5 Slot Machine

- Source: https://github.com/johakr/html5-slot-machine
- Revision reviewed: `347fc31ddd227674d8dc93e238d6664784e1872d`
- License: MIT
- Copyright: 2017 Johannes Kronmüller

The responsive cabinet, staggered reel-stop motion, spin lifecycle, and Web
Animations presentation informed Neon Vault's dedicated game room. SolCage
renders original branded symbols and uses the server result as the only source
of reel stops and payouts.

## Plinko.rng

- Source: https://github.com/jasonca2023/Plinko.rng
- Revision reviewed: `064db87de2dee4f49c70d34ae88698260852f427`
- License: MIT

The peg-board layout and animated ball-drop presentation informed the SolCage
Plinko implementation. Browser-controlled outcome generation was replaced with
SolCage's server commitment, player-supplied client seed, HMAC-SHA256 path
generation, and persisted proof.

## Blackjack Party

- Source: https://github.com/sbolel/blackjack-party
- Revision reviewed: `a81996993ea78f6bb8103f236fc5916d26bcef33`
- License: MIT

The typed blackjack state machine, hand evaluation rules, and cinematic
table/card presentation are being adapted for SolCage. Randomness and settlement
are replaced by the server-commitment and client-seed verification model used by
SolCage Originals.

## Mines Casino

- Source: https://github.com/iamThiagoo/mines-casino
- Revision reviewed: `ab33905f8f4b10fdb87d9f0166ba11b6ab5a2c12`
- License: MIT
- Copyright: Thiago Ferreira

The five-by-five board, progressive crystal reveals, and cashout interaction
informed Crystal Mines. SolCage replaces the original socket and browser-state
flow with a PostgreSQL-backed, row-locked action endpoint, HMAC-SHA256 board
shuffle, hidden server commitment, persisted proof, and atomic reward settlement.

## Solana Crash Game

- Source: https://github.com/casinocutup/Solana-Crash-Game
- Revision reviewed: `4035f3d76c525f9a211f29727d55fc6efd7a9320`
- License: MIT
- Copyright: 2024 Solana Crash Game

The Solana-native multiplier flight and cashout presentation informed Cage
Crash. SolCage replaces client-timed multiplier and settlement behavior with a
PostgreSQL-backed row lock, committed HMAC-SHA256 crash point, server clock,
idempotent persisted settlement, proof reveal, and atomic loyalty credit.

## Keno Server

- Source: https://github.com/charliegdev/keno-server
- Revision reviewed: `48557c9f754430e89ddb82c219847185132641f5`
- License: MIT
- Copyright: 2018 Charlie Guan

The pick, draw, hit, reward, and 80-number game structure informed Cage Keno.
SolCage replaces `Math.random()`, the original approximately 67–71% return
tables, and stateless Express response with a committed HMAC-SHA256 draw,
approximately 96% paytables, a PostgreSQL row lock, idempotent settlement,
proof reveal, and atomic loyalty credit.

## MIT license text for adapted game foundations

Copyright (c) 2026 Jason Guo

Copyright (c) 2026 Sinan Bolel

Copyright (c) 2018 Kristaps Ledins

Copyright (c) 2017 Johannes Kronmüller

Copyright (c) 2025 Thiago Ferreira

Copyright (c) 2024 Solana Crash Game

Copyright (c) 2018 Charlie Guan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
