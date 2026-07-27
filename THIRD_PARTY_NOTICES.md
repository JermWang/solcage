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

## Provably Fair Dice

- Source: https://github.com/jdleo/provably-fair-dice
- Revision reviewed: `4297f223cd1289a40c43ab715ee14ec907666773`
- License: MIT
- Copyright: 2026 John Leonardo

The coupled win-chance, multiplier and target controls, editable client seed,
keyboard controls, roll history, and per-round verification presentation
informed Neon Dice. SolCage replaces the original one-request SHA calculation,
random nonce, browser-only balance and unpersisted history with a prior server
commitment, player seed, deterministic HMAC-SHA256 entropy, exact 10,000-outcome
math, a PostgreSQL row lock, idempotent settlement, persisted receipts, and
atomic loyalty credit.

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

## BlackjackFlask

- Source: https://github.com/thomasthaddeus/BlackjackFlask
- Revision reviewed: `bd96635b2b632e39b7ced3400966660a5377f720`
- License: MIT
- Copyright: Thaddeus Thomas

The semicircular felt table, table lettering, active-seat treatment, chip
controls, status guidance, and responsive presentation informed Cage
Blackjack's upgraded game room. SolCage retains its committed HMAC-SHA256
six-deck shoe, PostgreSQL row lock, idempotent settlement, persisted receipt,
and atomic loyalty credit as the authoritative game and settlement path.

## Probability Prediction using Randomization Algorithms

- Source: https://github.com/namanadlakha3/An-Application-based-on-Probability-Prediction-using-Randomization-Algorithms
- Revision reviewed: `4ed8bd9e8aebdbb7ee9fa4d858a55978afce5d1b`
- License: MIT
- Copyright: 2020 Naman Adlakha

The eight-deck, 416-card Baccarat model informed Cage Baccarat's shoe
structure. SolCage combines that model with the already-approved Blackjack
Party card/table presentation and independently implements regulated Punto
Banco third-card rules. The original simulator RNG and probability-prediction
workflow are replaced with a prior server commitment, player client seed,
deterministic HMAC-SHA256 Fisher-Yates shuffle, PostgreSQL row lock,
idempotent settlement, persisted receipts, and atomic loyalty credit.

## Phaser Video Poker

- Source: https://github.com/pinkkis/phaser-video-poker
- Revision reviewed: `7e5be6ddceca40bd7bf581a4fed9a8ee45b51a23`
- License: MIT
- Copyright: 2019 Kristian Koivisto-Kokko

The five-card deal, card-hold controls, draw phase, keyboard shortcuts, and hand
evaluation test structure informed Neon Draw. SolCage replaces the original
browser game state and random shuffle with a prior server commitment, player
client seed, deterministic HMAC-SHA256 Fisher-Yates shuffle, PostgreSQL row
lock, idempotent two-action settlement, persisted receipts, and atomic loyalty
credit.

## Full Pay Video Poker

- Source: https://github.com/jaredkjar/video-poker
- Revision reviewed: `10946f9d8dcee2c5ab321ad6f01957f8c842ee40`
- License: MIT
- Copyright: 2026 Jared Kjar

The full-pay 9/6 Jacks or Better hand ranking, max-coin paytable, and polished
machine presentation informed Neon Draw. SolCage independently implements the
evaluator and uses the committed server shoe as the only authority for dealt
and replacement cards.

## Mines Casino

- Source: https://github.com/iamThiagoo/mines-casino
- Revision reviewed: `ab33905f8f4b10fdb87d9f0166ba11b6ab5a2c12`
- License: MIT
- Copyright: Thiago Ferreira

The five-by-five board, progressive card flips, crystal and bomb raster assets,
and cashout interaction are incorporated into Crystal Mines under the MIT
license. SolCage reskins that presentation and replaces the original socket and
browser-state flow with a PostgreSQL-backed, row-locked action endpoint,
HMAC-SHA256 board shuffle, hidden server commitment, persisted proof, and
atomic reward settlement.

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

Copyright (c) Thaddeus Thomas

Copyright (c) 2018 Kristaps Ledins

Copyright (c) 2017 Johannes Kronmüller

Copyright (c) 2025 Thiago Ferreira

Copyright (c) 2024 Solana Crash Game

Copyright (c) 2018 Charlie Guan

Copyright (c) 2026 John Leonardo

Copyright (c) 2020 Naman Adlakha

Copyright (c) 2019 Kristian Koivisto-Kokko

Copyright (c) 2026 Jared Kjar

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
