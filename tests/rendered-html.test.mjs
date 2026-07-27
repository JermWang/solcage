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

  for (const title of ["Cage Roulette", "Cage Baccarat", "Neon Draw", "Neon Dice", "Neon Vault", "Neon Plinko", "Cage Blackjack", "Crystal Mines", "Cage Crash", "Cage Keno"]) {
    assert.match(html, new RegExp(title));
  }
  assert.doesNotMatch(html, /Coin Flip|FLIP THE CHIP/i);
  assert.doesNotMatch(html, /pre-launch|integrating|production play/i);
  assert.match(html, /HMAC-SHA256/i);
  assert.match(html, /PROVABLY FAIR FLOOR/i);
  assert.match(html, /LIVE WINS/i);
  assert.match(html, /VERIFIED ROUNDS/i);
  assert.match(html, /Recent bets/i);
  assert.match(html, /HIGH ROLLERS/i);
  assert.match(html, /FULL FLOOR/i);
  assert.match(html, /href="\/games\/roulette"/);
  assert.match(html, /href="\/games\/baccarat"/);
  assert.match(html, /href="\/games\/video-poker"/);
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
  assert.match(html, /\/game-art\/baccarat\.webp/);
  assert.match(html, /\/game-art\/video-poker\.webp/);
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
  // "BASE" is load-bearing: the displayed figure is the game's own return
  // before the house rake, which is disclosed separately.
  assert.match(html, /PROVABLY FAIR \/ 98% BASE RTP/);
  assert.match(html, /ROLL UNDER/);
  assert.match(html, /ROLL OVER/);
  assert.match(html, /CLIENT SEED/);
  assert.match(html, /SESSION LEDGER/);
  assert.match(html, /SOURCED FOUNDATION/);
  assert.match(html, /PostgreSQL/);
});

test("server-renders the dedicated sourced Cage Baccarat room", async () => {
  const response = await render("/games/baccarat");
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /Cage Baccarat/);
  assert.match(html, /EIGHT-DECK PUNTO BANCO/);
  assert.match(html, /PLAYER/);
  assert.match(html, /BANKER/);
  assert.match(html, /TIE/);
  assert.match(html, /BEAD ROAD/);
  assert.match(html, /HMAC-SHA256/);
  assert.match(html, /416 CARDS/);
});

test("server-renders the dedicated sourced Neon Draw machine", async () => {
  const response = await render("/games/video-poker");
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /Neon Draw/);
  assert.match(html, /9\/6 JACKS OR BETTER/);
  assert.match(html, /99\.54%/);
  assert.match(html, /ROYAL FLUSH/);
  assert.match(html, /JACKS OR BETTER/);
  assert.match(html, /COMMITTED DECK/);
  assert.match(html, /HMAC-SHA256/);
});

test("ships row-locked Video Poker deal, hold, draw, and source notices", async () => {
  const [page, api, engine, notices] = await Promise.all([
    readFile(new URL("../app/games/video-poker/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/games/video-poker/action/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/games/videoPoker.ts", import.meta.url), "utf8"),
    readFile(new URL("../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8"),
  ]);
  assert.match(page, /KEYS 1—5 TO HOLD/);
  assert.match(page, /\/api\/games\/video-poker\/action/);
  assert.match(api, /FOR UPDATE/);
  assert.match(api, /status = 'active'/);
  assert.match(api, /drawVideoPokerHand/);
  assert.match(api, /awardPoints/);
  assert.match(engine, /multiplier: 800/);
  assert.match(engine, /VIDEO_POKER_MAX_HOLD_MASK = 31/);
  assert.match(notices, /pinkkis\/phaser-video-poker/);
  assert.match(notices, /jaredkjar\/video-poker/);
  await access(new URL("../public/game-art/video-poker.webp", import.meta.url));
});

test("ships a database-backed live casino activity floor", async () => {
  const [lobby, activityApi, css] = await Promise.all([
    readFile(new URL("../app/games/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/games/activity/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(lobby, /casino-live-wins/);
  assert.match(lobby, /casino-floor-pulse/);
  assert.match(lobby, /casino-bets-board/);
  assert.match(lobby, /setInterval/);
  assert.match(lobby, /HIGH ROLLERS/);
  assert.match(lobby, /studio: "SOLCAGE ORIGINALS"/);
  assert.doesNotMatch(lobby, /PINKKIS|JARED KJAR|JDLEO FOUNDATION|BLACKJACK PARTY", tag/);
  assert.match(activityApi, /FROM game_history/);
  assert.match(activityApi, /SUM\(bet\)/);
  assert.match(activityApi, /COUNT\(DISTINCT user_id\)/);
  assert.match(activityApi, /LIMIT 40/);
  assert.match(css, /\.casino-game-rail\{display:flex/);
  assert.match(css, /\.casino-bets-board/);
  assert.match(css, /\.casino-promo-dots\{[^}]*height:auto[^}]*background:transparent/);
  assert.match(css, /@media\(max-width:1050px\)\{\.roulette-room,\.original-room/);
});

test("ships the procedural model, fair games, custodial liquidity flow, and interaction hooks", async () => {
  const [scene, games, dice, diceApi, diceEngine, baccarat, baccaratApi, baccaratEngine, roulette, plinko, blackjack, blackjackApi, mines, minesApi, minesEngine, crash, crashApi, crashEngine, keno, kenoApi, kenoEngine, slots, slotsApi, slotsEngine, fairReveal, lending, custodyClient, custodyDeposit, custodyClaim, custodySwap, page, health, css, packageJson, notices] = await Promise.all([
    readFile(new URL("../components/SolCageChipScene.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/games/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/games/dice/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/games/dice/action/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/games/dice.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/games/baccarat/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/games/baccarat/action/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/games/baccarat.ts", import.meta.url), "utf8"),
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
    readFile(new URL("../lib/solana/custodyClient.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/custody/deposits/confirm/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/custody/claims/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/custody/swap.ts", import.meta.url), "utf8"),
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
  assert.match(baccarat, /EIGHT-DECK PUNTO BANCO/);
  assert.match(baccarat, /BEAD ROAD/);
  assert.match(baccaratApi, /FOR UPDATE/);
  assert.match(baccaratApi, /createBaccaratShoe/);
  assert.match(baccaratApi, /awardPoints/);
  assert.match(baccaratEngine, /BACCARAT_DECK_COUNT = 8/);
  assert.match(baccaratEngine, /shouldBankerDraw/);
  assert.match(baccaratEngine, /settleBaccarat/);
  assert.match(roulette, /RouletteWheel/);
  assert.match(roulette, /\/api\/games\/fair\/commit/);
  assert.match(plinko, /VERIFIED PLINKO/);
  assert.match(plinko, /already-settled HMAC path/i);
  assert.match(blackjack, /BLACKJACK PARTY FOUNDATION/);
  assert.match(blackjack, /blackjack-double/);
  assert.match(blackjack, /ACTIVE SEAT/);
  assert.match(blackjackApi, /createShuffledDeck/);
  assert.match(blackjackApi, /BLACKJACK_DECK_COUNT/);
  assert.match(blackjackApi, /generator\.ints\(1, max - 1, 0\)/);
  assert.match(mines, /Crystal Mines/);
  assert.match(mines, /aria-hidden="true"/);
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
  assert.match(games, /href: "\/games\/baccarat"/);
  assert.match(fairReveal, /Provable/);
  assert.match(fairReveal, /HMAC-SHA256/);
  assert.match(fairReveal, /plinko/);
  assert.match(fairReveal, /game_fair_rounds/);
  assert.match(fairReveal, /randomInts\(1, 36, 0\)/);
  assert.doesNotMatch(fairReveal, /slotSymbols/);
  assert.match(fairReveal, /randomInts\(11, 1, 0\)/);
  assert.match(lending, /CUSTODY MARKET/);
  assert.match(lending, /LIVE READINESS PROOF/);
  assert.match(lending, /sendCustodyDeposit/);
  assert.match(lending, /\/api\/custody\/claims/);
  assert.match(custodyClient, /findProgramAddressSync/);
  assert.match(custodyClient, /signAndSendTransaction/);
  assert.match(custodyClient, /transferChecked/);
  assert.match(custodyDeposit, /verifyIncomingTransfer/);
  assert.match(custodyDeposit, /collateral_sold/);
  assert.match(custodyDeposit, /advance_sent/);
  assert.match(custodyClaim, /buyCollateral/);
  assert.match(custodyClaim, /collateral_claimed/);
  assert.match(custodySwap, /api\.jup\.ag\/swap\/v2/);
  assert.match(custodySwap, /\/order\?/);
  assert.match(custodySwap, /simulated/);
  assert.match(notices, /jasonca2023\/Plinko\.rng/);
  assert.match(notices, /sbolel\/blackjack-party/);
  assert.match(notices, /thomasthaddeus\/BlackjackFlask/);
  assert.match(notices, /iamThiagoo\/mines-casino/);
  assert.match(notices, /crystal and bomb raster assets/);
  assert.match(notices, /casinocutup\/Solana-Crash-Game/);
  assert.match(notices, /charliegdev\/keno-server/);
  assert.match(notices, /krysits\/casino-client/);
  assert.match(notices, /johakr\/html5-slot-machine/);
  assert.match(notices, /jdleo\/provably-fair-dice/);
  assert.match(notices, /namanadlakha3\/An-Application-based-on-Probability-Prediction-using-Randomization-Algorithms/);
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
    access(new URL("../public/game-assets/mines/gem.png", import.meta.url)),
    access(new URL("../public/game-assets/mines/bomb.png", import.meta.url)),
    access(new URL("../public/game-art/crash.webp", import.meta.url)),
    access(new URL("../public/game-art/keno.webp", import.meta.url)),
    access(new URL("../public/game-art/slots.webp", import.meta.url)),
    access(new URL("../public/game-art/dice.webp", import.meta.url)),
    access(new URL("../public/game-art/plinko.webp", import.meta.url)),
    access(new URL("../public/game-art/blackjack.webp", import.meta.url)),
    access(new URL("../public/game-art/baccarat.webp", import.meta.url)),
    access(new URL("../public/game-art/video-poker.webp", import.meta.url)),
    access(new URL("../public/coin-art/jimothy.webp", import.meta.url)),
    access(new URL("../public/coin-art/kins.webp", import.meta.url)),
    access(new URL("../public/coin-art/wif.jpg", import.meta.url)),
    access(new URL("../public/solcage-logo.png", import.meta.url)),
    access(new URL("../public/favicon.png", import.meta.url)),
    access(new URL("../public/apple-touch-icon.png", import.meta.url)),
    access(new URL("../artifacts/chip-model/chip-sculpt-spec.json", import.meta.url)),
  ]);
});
