// Phase 2 QA — semantic tier: lazy embedder load, hybrid upgrade in place
import { chromium } from 'playwright-core';

const CHROMIUM = process.env.CHROMIUM_PATH ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const BASE = 'http://127.0.0.1:4571';

const failures = [];
function check(name, cond, detail = '') {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures.push(name);
}

const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
const logs = [];
page.on('console', m => logs.push(m.text()));

await page.goto(`${BASE}/search.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

check('chunks load with vectors', logs.some(l => l.includes('with vectors')), logs.find(l => l.includes('chunks')));
check('embedder NOT loading before first search', await page.evaluate(() => !document.body.dataset.searchSemantic));

// Canary: regex intents don't match "prizes", BM25 has no keyword overlap.
const t0 = Date.now();
await page.fill('#searchInput', 'prizes he has been given');
await page.waitForTimeout(600);
const bm25Top = await page.locator('#searchResults .result .result-title').first().textContent().catch(() => '(none)');
console.log(`  · BM25-only top result: ${bm25Top}`);

// Wait for the semantic tier (24MB download + WASM init in a cold context)
let ready = false;
for (let i = 0; i < 120; i++) {
  await page.waitForTimeout(1000);
  ready = await page.evaluate(() => document.body.dataset.searchSemantic === 'ready');
  if (ready) break;
}
check('semantic tier becomes ready', ready, `${((Date.now() - t0) / 1000).toFixed(0)}s (cold download, headless CPU)`);

if (ready) {
  await page.waitForTimeout(1500); // allow in-place refine of the live query
  const refined = await page.locator('#searchResults .result .result-title').allTextContents();
  check('live query upgraded in place → Awards in top 3', refined.slice(0, 3).some(t => t.includes('Awards')), refined.slice(0, 3).join(' | '));

  // Keyword queries must still win on exact hits
  await page.fill('#searchInput', 'nanome');
  await page.waitForTimeout(1500);
  const kwTop = await page.locator('#searchResults .result .result-title').first().textContent();
  check('exact keyword still ranks first', kwTop.toLowerCase().includes('nanome'), kwTop);

  // Another paraphrase, post-ready (immediate hybrid path)
  await page.fill('#searchInput', 'music and visuals performance');
  await page.waitForTimeout(1500);
  const t2 = await page.locator('#searchResults .result .result-title').allTextContents();
  check('paraphrase hits via hybrid (top 3)', t2.slice(0, 3).some(t => t.includes('Influence') || t.includes('Installations')), t2.slice(0, 3).join(' | '));

  // Intent-expanded query still works through hybrid
  await page.fill('#searchInput', 'what did he study in grad school');
  await page.waitForTimeout(1500);
  const eduTitles = await page.locator('#searchResults .result .result-title').allTextContents();
  check('grad-school query surfaces Georgetown (regex+BM25 covers semantic miss)',
    eduTitles.slice(0, 3).some(t => t.includes('Georgetown')), eduTitles.slice(0, 3).join(' | '));
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failures.length ? `\nFAILURES (${failures.length}):\n- ` + failures.join('\n- ') : '\nALL PASS');
process.exit(failures.length ? 1 : 0);
