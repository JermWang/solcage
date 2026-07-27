import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  const background = [];

  const response = await worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil(promise) { background.push(promise); },
      passThroughOnException() {},
    },
  );
  await Promise.allSettled(background);
  return response;
}

test("server-renders the SolCage landing experience", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>SolCage — Collateral in\. Game on\.<\/title>/);
  assert.match(html, /Bag locked/);
  assert.match(html, /Tables open/);
  assert.match(html, /LIVE TABLES 03/);
  assert.match(html, /THE CREDIT MARKET/);
  assert.match(html, /Access the liquidity/);
  assert.match(html, /Accepted collateral coins circular carousel/);
  assert.match(html, /seamless-carousel-shell/);
  assert.match(html, /Choose your bag/);
  assert.match(html, /\/coin-art\/jimothy\.webp/);
  assert.match(html, /\/coin-art\/triplet\.webp/);
  assert.match(html, /solcage-logo\.png/);
  assert.match(html, /favicon\.png/);
  assert.doesNotMatch(html, /Animated SolCage casino chip/);
  assert.match(html, /\/game-art\/roulette\.webp/);
  assert.match(html, /href="\/games"/);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/i);
});

test("server-renders the casino lobby and sourced original games", async () => {
  const response = await render("/games");
  assert.equal(response.status, 200);
  const html = await response.text();

  for (const title of ["Cage Roulette", "Neon Dice", "Neon Vault", "Neon Plinko", "Cage Blackjack", "Crystal Mines", "Cage Crash", "Cage Keno"]) {
    assert.match(html, new RegExp(title));
  }
  assert.doesNotMatch(html, /Coin Flip|FLIP THE CHIP/i);
  assert.doesNotMatch(html, /pre-launch|integrating|production play/i);
  assert.match(html, /HMAC-SHA256/i);
  assert.match(html, /PROVABLY FAIR FLOOR/i);
  assert.match(html, /href="\/games\/roulette"/);
  assert.match(html, /href="\/games\/dice"/);
  assert.match(html, /href="\/games\/plinko"/);
  assert.match(html, /href="\/games\/blackjack"/);
  assert.match(html, /href="\/games\/mines"/);
  assert.match(html, /href="\/games\/crash"/);
  assert.match(html, /href="\/games\/keno"/);
  assert.match(html, /href="\/games\/slots"/);
  assert.match(html, /href="\/lending"/);
  assert.match(html, /\/game-art\/plinko\.webp/);
  assert.match(html, /\/game-art\/blackjack\.webp/);
  assert.match(html, /\/game-art\/mines\.webp/);
  assert.match(html, /\/game-art\/crash\.webp/);
  assert.match(html, /\/game-art\/keno\.webp/);
  assert.match(html, /\/game-art\/slots\.webp/);
  assert.match(html, /\/game-art\/dice\.webp/);
});

test("server-renders the dedicated sourced Neon Dice room", async () => {
  const response = await render("/games/dice");
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /Neon Dice/);
  assert.match(html, /PROVABLY FAIR \/ 98% RTP/);
  assert.match(html, /ROLL UNDER/);
  assert.match(html, /ROLL OVER/);
  assert.match(html, /CLIENT SEED/);
  assert.match(html, /SESSION LEDGER/);
  assert.match(html, /SOURCED FOUNDATION/);
  assert.match(html, /PostgreSQL/);
});

test("ships the procedural model, fair games, lending client, protocol source, and interaction hooks", async () => {
  const [scene, games, dice, diceApi, diceEngine, roulette, plinko, blackjack, blackjackApi, mines, minesApi, minesEngine, crash, crashApi, crashEngine, keno, kenoApi, kenoEngine, slots, slotsApi, slotsEngine, fairReveal, lending, lendingClient, protocolApi, readiness, protocolProgram, page, health, css, packageJson, notices] = await Promise.all([
    readFile(new URL("../components/SolCageChipScene.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/games/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/games/dice/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/games/dice/action/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/games/dice.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/games/roulette/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/games/plinko/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/games/blackjack/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/games/blackjack/action/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/games/mines/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/games/mines/action/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/games/mines.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/games/crash/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/games/crash/action/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/games/crash.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/games/keno/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/games/keno/action/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/games/keno.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/games/slots/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/games/slots/action/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/games/slots.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/games/fair/reveal/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lending/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/solana/lendingClient.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/protocol/transactions/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/solana/readiness.ts", import.meta.url), "utf8"),
    readFile(new URL("../programs/solcage_lending/src/lib.rs", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8"),
  ]);

  assert.match(packageJson, /"three":/);
  assert.match(packageJson, /"react-casino-roulette":/);
  assert.match(packageJson, /"@provableio\/provable-core":/);
  assert.match(packageJson, /"@solana\/web3\.js":/);
  assert.match(scene, /sculptRuntime/);
  assert.match(scene, /scrollProgress/);
  assert.match(scene, /prefers-reduced-motion/);
  assert.match(page, /addEventListener\("wheel", captureWheel, \{ passive: false \}\)/);
  assert.match(page, /target\.closest\("\.coin-card"\)/);
  assert.match(health, /database: "connected"/);
  assert.match(health, /readyTables !== 8/);
  assert.match(games, /PROVABLY FAIR FLOOR/);
  assert.match(dice, /SOURCED FOUNDATION/);
  assert.match(dice, /SESSION LEDGER/);
  assert.match(dice, /\/api\/games\/dice\/action/);
  assert.match(diceApi, /FOR UPDATE/);
  assert.match(diceApi, /DICE_ROLL_MAX, 0/);
  assert.match(diceApi, /awardPoints/);
  assert.match(diceEngine, /DICE_RTP_PERCENT = 98/);
  assert.match(diceEngine, /diceTarget/);
  assert.match(roulette, /RouletteWheel/);
  assert.match(roulette, /\/api\/games\/fair\/commit/);
  assert.match(plinko, /VERIFIED PLINKO/);
  assert.match(plinko, /already-settled HMAC path/i);
  assert.match(blackjack, /BLACKJACK PARTY FOUNDATION/);
  assert.match(blackjackApi, /createShuffledDeck/);
  assert.match(blackjackApi, /generator\.ints\(1, max - 1, 0\)/);
  assert.match(mines, /Crystal Mines/);
  assert.match(minesApi, /generateMinePositions/);
  assert.match(minesApi, /awardPoints/);
  assert.match(minesApi, /generator\.ints\(1, max - 1, 0\)/);
  assert.match(minesEngine, /mineMultiplier/);
  assert.match(crash, /SERVER-TIMED ROUND/);
  assert.match(crashApi, /FOR UPDATE/);
  assert.match(crashApi, /awardPoints/);
  assert.match(crashApi, /CRASH_RANDOM_MAX - 1/);
  assert.match(crashEngine, /crashPointFromInt/);
  assert.match(keno, /HMAC DRAW LOCKED/);
  assert.match(kenoApi, /FOR UPDATE/);
  assert.match(kenoApi, /awardPoints/);
  assert.match(kenoApi, /KENO_NUMBER_COUNT, 1/);
  assert.match(kenoEngine, /kenoExpectedReturn/);
  assert.match(slots, /Neon Vault/);
  assert.match(slots, /NINE-LINE VIDEO SLOT/);
  assert.match(slotsApi, /FOR UPDATE/);
  assert.match(slotsApi, /SLOT_STRIP_LENGTH - 1, 0/);
  assert.match(slotsApi, /awardPoints/);
  assert.match(slotsEngine, /SLOT_PAYLINES/);
  assert.match(slotsEngine, /slotExpectedReturn/);
  assert.match(games, /\/game-art\/slots\.webp/);
  assert.match(games, /href: "\/games\/slots"/);
  assert.match(games, /href: "\/games\/dice"/);
  assert.match(fairReveal, /Provable/);
  assert.match(fairReveal, /HMAC-SHA256/);
  assert.match(fairReveal, /plinko/);
  assert.match(fairReveal, /game_fair_rounds/);
  assert.match(fairReveal, /randomInts\(1, 36, 0\)/);
  assert.doesNotMatch(fairReveal, /slotSymbols/);
  assert.match(fairReveal, /randomInts\(11, 1, 0\)/);
  assert.match(lending, /COLLATERAL MARKET/);
  assert.match(lending, /LIVE READINESS PROOF/);
  assert.match(lending, /sendLendingTransaction/);
  assert.match(lendingClient, /findProgramAddressSync/);
  assert.match(lendingClient, /signAndSendTransaction/);
  assert.match(lendingClient, /buildLendingInstruction/);
  assert.match(lendingClient, /"deposit" \| "borrow" \| "repay" \| "withdraw"/);
  assert.match(protocolApi, /getTransaction/);
  assert.match(protocolApi, /protocol_transactions/);
  assert.match(protocolApi, /commitment: "finalized"/);
  assert.match(protocolApi, /instruction\.accounts\.length !== expectedAccounts\.length/);
  assert.match(readiness, /programAccount\?\.executable/);
  assert.match(readiness, /Protocol account type/);
  assert.match(readiness, /collateral vault/);
  assert.match(readiness, /Pyth feed ID/);
  assert.match(protocolProgram, /deposit_collateral/);
  assert.match(protocolProgram, /withdraw_collateral/);
  assert.match(protocolProgram, /get_price_no_older_than/);
  assert.match(protocolProgram, /borrow_token_program/);
  assert.match(protocolProgram, /collateral_token_program/);
  assert.match(notices, /jasonca2023\/Plinko\.rng/);
  assert.match(notices, /sbolel\/blackjack-party/);
  assert.match(notices, /iamThiagoo\/mines-casino/);
  assert.match(notices, /casinocutup\/Solana-Crash-Game/);
  assert.match(notices, /charliegdev\/keno-server/);
  assert.match(notices, /krysits\/casino-client/);
  assert.match(notices, /johakr\/html5-slot-machine/);
  assert.match(notices, /jdleo\/provably-fair-dice/);
  assert.doesNotMatch(games, /SolCageChipScene/);
  assert.doesNotMatch(css, /@keyframes chipFlip/);
  assert.match(css, /\.casino-game-grid/);
  assert.match(css, /\.roulette-room/);
  assert.match(css, /rotateY\(var\(--coin-angle\)\) translateZ\(var\(--ring-radius\)\)/);
  assert.match(css, /True circular 3D coin ring/);
  assert.match(css, /\.seamless-carousel-shell\{[^}]*var\(--paper\);color:var\(--ink\)/);

  await Promise.all([
    access(new URL("../public/game-art/roulette.webp", import.meta.url)),
    access(new URL("../public/game-art/mines.webp", import.meta.url)),
    access(new URL("../public/game-art/crash.webp", import.meta.url)),
    access(new URL("../public/game-art/keno.webp", import.meta.url)),
    access(new URL("../public/game-art/slots.webp", import.meta.url)),
    access(new URL("../public/game-art/dice.webp", import.meta.url)),
    access(new URL("../public/game-art/plinko.webp", import.meta.url)),
    access(new URL("../public/game-art/blackjack.webp", import.meta.url)),
    access(new URL("../public/coin-art/jimothy.webp", import.meta.url)),
    access(new URL("../public/coin-art/kins.webp", import.meta.url)),
    access(new URL("../public/coin-art/wif.jpg", import.meta.url)),
    access(new URL("../public/solcage-logo.png", import.meta.url)),
    access(new URL("../public/favicon.png", import.meta.url)),
    access(new URL("../public/apple-touch-icon.png", import.meta.url)),
    access(new URL("../artifacts/chip-model/chip-sculpt-spec.json", import.meta.url)),
  ]);
});
