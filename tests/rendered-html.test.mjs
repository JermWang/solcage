import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
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
  assert.doesNotMatch(html, /Animated SolCage casino chip/);
  assert.match(html, /\/game-art\/roulette\.webp/);
  assert.match(html, /href="\/games"/);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/i);
});

test("server-renders all three game experiences without Coin Flip", async () => {
  const response = await render("/games");
  assert.equal(response.status, 200);
  const html = await response.text();

  for (const title of ["Neon Dice", "Crystal Mines", "Sol Spin"]) {
    assert.match(html, new RegExp(title));
  }
  assert.doesNotMatch(html, /Coin Flip|FLIP THE CHIP/i);
  assert.match(html, /practice mode uses local outcomes/i);
  assert.match(html, /production protocol connects collateral, credit, game settlement and loyalty/i);
  assert.match(html, /\/game-art\/mines\.webp/);
  assert.match(html, /\/game-art\/dice\.webp/);
});

test("ships the procedural model, optimized art, and interaction hooks", async () => {
  const [scene, games, css, packageJson] = await Promise.all([
    readFile(new URL("../components/SolCageChipScene.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/games/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(packageJson, /"three":/);
  assert.match(scene, /sculptRuntime/);
  assert.match(scene, /scrollProgress/);
  assert.match(scene, /prefers-reduced-motion/);
  assert.match(games, /kind: "game_round"/);
  assert.match(games, /Array\.from\(\{ length: 25 \}/);
  assert.doesNotMatch(games, /SolCageChipScene/);
  assert.match(games, /games-hero-art/);
  assert.doesNotMatch(css, /@keyframes chipFlip/);
  assert.match(css, /@keyframes rouletteSpin/);

  await Promise.all([
    access(new URL("../public/game-art/roulette.webp", import.meta.url)),
    access(new URL("../public/game-art/mines.webp", import.meta.url)),
    access(new URL("../public/game-art/dice.webp", import.meta.url)),
    access(new URL("../artifacts/chip-model/chip-sculpt-spec.json", import.meta.url)),
  ]);
});
