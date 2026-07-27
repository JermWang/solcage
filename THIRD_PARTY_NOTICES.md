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

The full license text for each package is included in its installed package and
is available from the linked source repository.
