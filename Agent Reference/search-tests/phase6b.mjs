// Phase 6b QA — scene language: grammar, plan card, materialization, census, verify
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

// ───────── index: compound add, caps, census ─────────
{
  console.log('index scene:');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.keyboard.press('/');
  await page.waitForTimeout(1200);

  await page.fill('#so-searchInput', 'add 3 small fish and 2 coral');
  await page.waitForTimeout(600);
  const steps = await page.evaluate(() => [...document.querySelectorAll('.pc-plan-step')].map(s => s.textContent));
  check('compound utterance parses to a 2-step plan', steps.length === 2 && steps[0].includes('3 small fish') && steps[1].includes('2 coral'), steps.join(' | '));

  const before = await page.evaluate(() => window.heroFish.state.fish.length);
  await page.click('[data-scene-run]');
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => ({ f: window.heroFish.state.fish.length, c: window.heroFish.state.coral.length }));
  check('running the plan spawns the fish', after.f >= before + 3, `${before} → ${after.f}`);
  check('and the coral', after.c >= 2, String(after.c));
  const receipts = await page.evaluate(() => [...document.querySelectorAll('.pc-plan-step')].map(s => s.textContent));
  check('receipts render', receipts.every(r => r.startsWith('✓')), receipts.join(' | '));
  await page.waitForTimeout(1700);
  check('overlay closes to show the canvas', await page.evaluate(() =>
    document.getElementById('searchOverlay').getAttribute('aria-hidden') === 'true'));

  // caps: "add 20 small fish" clamps with an honest receipt
  await page.keyboard.press('/');
  await page.waitForTimeout(500);
  await page.fill('#so-searchInput', 'add 20 small fish');
  await page.waitForTimeout(500);
  await page.click('[data-scene-run]');
  await page.waitForTimeout(3000);
  const capNote = await page.evaluate(() => [...document.querySelectorAll('.pc-plan-step')].map(s => s.textContent).join(' '));
  check('cap-aware receipt', /tank limit/.test(capNote), capNote);
  await page.waitForTimeout(1700);

  // census reads live state, no model involved
  await page.keyboard.press('/');
  await page.waitForTimeout(500);
  await page.fill('#so-searchInput', 'how many fish are there?');
  await page.waitForTimeout(600);
  const census = await page.locator('.pc-census-row').textContent().catch(() => '');
  check('census renders from the canvas', /small/.test(census) && /fish/.test(census), census.trim().slice(0, 60));
  check('census bylined honestly', (await page.locator('.pc-census .cmdbar-group-label').textContent()).includes('read from the canvas'));

  // grammar never bluffs: non-scene queries fall through to search
  await page.fill('#so-searchInput', 'nanome');
  await page.waitForTimeout(500);
  check('non-scene query falls through to postcard', await page.locator('.pc-plan').count() === 0
    && await page.locator('.pc-mod').count() > 0);

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ───────── design: composition + reference + verified enclosure ─────────
{
  console.log('design scene:');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/design.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.keyboard.press('/');
  await page.waitForTimeout(1200);

  await page.fill('#so-searchInput', 'draw a circle and put two fish inside the circle');
  await page.waitForTimeout(600);
  await page.click('[data-scene-run]');
  await page.waitForTimeout(4500);
  const receipts = await page.evaluate(() => [...document.querySelectorAll('.pc-plan-step')].map(s => s.textContent));
  check('circle materializes through the recognizer', receipts.some(r => r.includes('✓ 1 circle')), receipts.join(' | '));
  check('fish verified enclosed by the physics predicate', receipts.some(r => /2\/2 enclosed/.test(r)), receipts.join(' | '));
  const c1 = await page.evaluate(() => window.JH_SCENE.census());
  check('canvas census agrees', c1.shapes.some(s => s.type === 'circle') && c1.enclosed >= 2,
    `shapes=${c1.shapes.map(s => s.type)} enclosed=${c1.enclosed}`);
  await page.waitForTimeout(1700);

  // cross-utterance reference: "the circle" = the one already on canvas
  await page.keyboard.press('/');
  await page.waitForTimeout(500);
  await page.fill('#so-searchInput', 'add two intersecting lines and a square near the circle');
  await page.waitForTimeout(900);
  const plan2 = await page.evaluate(() => [...document.querySelectorAll('.pc-plan-step')].map(s => s.textContent));
  check('mutual-relation clause parses', plan2.some(s => s.includes('2 lines, intersecting')), plan2.join(' | '));
  await page.click('[data-scene-run]');
  await page.waitForTimeout(4000);
  const shapes = await page.evaluate(() => window.JH_SCENE.census().shapes.map(s => s.type).sort());
  check('lines + square land beside the referenced circle',
    shapes.filter(t => t === 'line').length >= 2 && shapes.includes('rectangle') && shapes.includes('circle'),
    shapes.join(','));

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
console.log(failures.length ? `\nFAILURES (${failures.length}):\n- ` + failures.join('\n- ') : '\nALL PASS');
process.exit(failures.length ? 1 : 0);
