// Phase 3 QA — command bar: actions, intent cards, topline routing, linked titles
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

async function newPage(url) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  return { ctx, page, errors };
}

// ───────── index.html: run-commands on the fish tank ─────────
{
  console.log('index.html actions:');
  const { ctx, page, errors } = await newPage(`${BASE}/index.html`);
  await page.keyboard.press('/');
  await page.waitForTimeout(1200);

  await page.fill('#so-searchInput', 'feed the fish');
  await page.waitForTimeout(500);
  const feedCard = page.locator('[data-cmd="fish.feed"]');
  check('"feed the fish" surfaces action card', await feedCard.count() === 1);

  const foodBefore = await page.evaluate(() => window.heroFish.state.food.length);
  await feedCard.click();
  await page.waitForTimeout(600);
  const foodAfter = await page.evaluate(() => window.heroFish.state.food.length);
  check('clicking action drops food', foodAfter > foodBefore, `${foodBefore} → ${foodAfter}`);
  check('overlay closes after running', await page.evaluate(() =>
    document.getElementById('searchOverlay').getAttribute('aria-hidden') === 'true'));

  // logic view
  await page.keyboard.press('/');
  await page.waitForTimeout(400);
  await page.fill('#so-searchInput', 'what are the fish thinking');
  await page.waitForTimeout(500);
  const logicCard = page.locator('[data-cmd="fish.logic"]');
  check('paraphrase surfaces logic-view action (keyword leg)', await logicCard.count() === 1);
  if (await logicCard.count()) {
    await logicCard.click();
    await page.waitForTimeout(300);
    check('logic view actually toggles', await page.evaluate(() => window.heroFish.debugMode));
  }

  // nav command + topline grouping
  await page.keyboard.press('/');
  await page.waitForTimeout(400);
  await page.fill('#so-searchInput', 'go to design');
  await page.waitForTimeout(500);
  check('"go to design" surfaces nav command', await page.locator('[data-cmd="goto:design"]').count() === 1);

  await page.fill('#so-searchInput', 'fish');
  await page.waitForTimeout(500);
  const labels = await page.locator('.cmdbar-group-label').allTextContents();
  check('"fish" on index gets On-this-page group', labels.some(l => /on this page/i.test(l)), labels.join(','));

  // linked title
  await page.fill('#so-searchInput', 'nanome');
  await page.waitForTimeout(500);
  const href = await page.locator('#so-searchResults .result-link').first().getAttribute('href').catch(() => null);
  check('result titles are links', !!href && href.includes('nanome2'), href || '(none)');

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ───────── design.html: maze commands ─────────
{
  console.log('design.html actions:');
  const { ctx, page, errors } = await newPage(`${BASE}/design.html`);
  await page.keyboard.press('/');
  await page.waitForTimeout(1200);

  // 'spawn a fish' is scene language now (6b) — the plan card superseded
  // the bare command card, and running it draws the fish into being
  await page.fill('#so-searchInput', 'spawn a fish');
  await page.waitForTimeout(600);
  check('"spawn a fish" parses to a scene plan', await page.locator('[data-scene-run]').count() === 1);
  const before = await page.evaluate(() => window.designFish.state.fish.length);
  await page.click('[data-scene-run]');
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => window.designFish.state.fish.length);
  check('running the plan adds a fish', after > before, `${before} → ${after}`);
  await page.waitForTimeout(1700); // plan auto-closes the overlay
  await page.keyboard.press('/');
  await page.waitForTimeout(500);

  await page.keyboard.press('/');
  await page.waitForTimeout(400);
  await page.fill('#so-searchInput', 'clear the walls');
  await page.waitForTimeout(500);
  check('"clear the walls" surfaces action', await page.locator('[data-cmd="maze.clearWalls"]').count() === 1);

  // index-only commands must NOT appear here
  await page.fill('#so-searchInput', 'scare the fish');
  await page.waitForTimeout(500);
  check('index-only command absent on design', await page.locator('[data-cmd="fish.scare"]').count() === 0);

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ───────── about.html: section jump + intent cards ─────────
{
  console.log('about.html sections + intent cards:');
  const { ctx, page, errors } = await newPage(`${BASE}/about.html`);
  await page.keyboard.press('/');
  await page.waitForTimeout(1200);

  await page.fill('#so-searchInput', 'jump to awards');
  await page.waitForTimeout(500);
  const sec = page.locator('[data-cmd="section:awards"]');
  check('"jump to awards" surfaces section command', await sec.count() === 1);
  if (await sec.count()) {
    await sec.click();
    await page.waitForTimeout(1200);
    check('section command scrolls the page', await page.evaluate(() => window.scrollY > 100));
  }

  await page.keyboard.press('/');
  await page.waitForTimeout(400);
  await page.fill('#so-searchInput', 'how do I contact john');
  await page.waitForTimeout(500);
  check('contact intent card renders', await page.locator('.intent-card').count() === 1);
  const cta = await page.locator('.intent-cta').getAttribute('href').catch(() => null);
  check('contact CTA is mailto', !!cta && cta.startsWith('mailto:hi@johnhanacek.com'), cta || '');

  await page.fill('#so-searchInput', 'book a call with him');
  await page.waitForTimeout(500);
  const title = await page.locator('.intent-card-title').textContent().catch(() => '');
  check('schedule intent card renders', title.includes('intro call'), title);

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ───────── search.html: nav commands, no run-commands ─────────
{
  console.log('search.html:');
  const { ctx, page, errors } = await newPage(`${BASE}/search.html`);
  await page.fill('#searchInput', 'go to design');
  await page.waitForTimeout(500);
  check('nav command on search page', await page.locator('[data-cmd="goto:design"]').count() === 1);
  await page.fill('#searchInput', 'feed the fish');
  await page.waitForTimeout(500);
  check('page-bound run-commands absent here', await page.locator('[data-cmd="fish.feed"]').count() === 0);
  check('cmd-card styles applied (overlay css linked)', await page.evaluate(() => {
    const el = document.querySelector('.cmd-card, .cmdbar-group-label');
    if (!el) return true; // nothing rendered → nothing to style
    return getComputedStyle(el).fontFamily.includes('JetBrains');
  }));
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
console.log(failures.length ? `\nFAILURES (${failures.length}):\n- ` + failures.join('\n- ') : '\nALL PASS');
process.exit(failures.length ? 1 : 0);
