// Phase 6a QA — the microdense postcard: adaptive density, LOD interactions
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
const page = await (await browser.newContext({ viewport: { width: 1280, height: 920 } })).newPage();   // tall: 9e no-scroll sheds depth on short panels
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.keyboard.press('/');
await page.waitForTimeout(1500);

// empty state
check('empty state renders suggestion chips', await page.locator('.pc-suggest-chip').count() >= 3);
const chipText = await page.locator('.pc-suggest-chip').nth(2).textContent();
await page.locator('.pc-suggest-chip').nth(2).click();
await page.waitForTimeout(600);
check('chip click runs the query', (await page.locator('#so-searchInput').inputValue()) === chipText, chipText);

// density adaptation: decisive → dossier
await page.fill('#so-searchInput', 'meta');
await page.waitForTimeout(700);
check('"meta": exactly one dossier', await page.locator('[data-lod="3"]').count() === 1);
const l3title = await page.locator('[data-lod="3"] .result-title').textContent();
check('dossier is MetaMedium', l3title.includes('MetaMedium'), l3title);
check('dossier prose is pretext-wrapped', await page.locator('[data-lod="3"] .pretext-line').count() > 3);
check('graded field below (L1s present)', await page.locator('[data-lod="1"]').count() >= 1);
check('tail run present', await page.locator('.pc-tail').count() === 1);

// broad → waterfall, no dossier
await page.fill('#so-searchInput', 'design');
await page.waitForTimeout(600);
check('"design": no dossier, waterfall of modules', await page.locator('[data-lod="3"]').count() === 0
  && await page.locator('.pc-mod').count() >= 3);

// hover tooltip (one shared node)
await page.fill('#so-searchInput', 'meta');
await page.waitForTimeout(600);
const l1 = page.locator('[data-lod="1"]').first();
await l1.hover();
await page.waitForTimeout(200);
const tip = await page.locator('.pc-tip').textContent().catch(() => '');
check('hover shows next-LOD tooltip', (await page.locator('.pc-tip').isVisible()) && tip.length > 10, tip.slice(0, 40));

// click-to-pin expands to dossier. Target the micro/prose TEXT, not edge
// coordinates: the title (left) navigates and since 9c the page badge
// (right) is a link too — the right-edge click used here before 9c would
// now leave the page.
const l1id = await l1.getAttribute('data-id');
await l1.locator('.pc-micro').click();
await page.waitForTimeout(500);
check('click pins module to dossier', await page.locator(`[data-id="${l1id}"][data-lod="3"]`).count() === 1);
await page.evaluate((id) => {
  const n = document.querySelector(`[data-id="${id}"]`);
  (n.querySelector('.pc-prose') || n).dispatchEvent(new MouseEvent('click', { bubbles: true }));
}, l1id);
await page.waitForTimeout(500);
check('click again unpins', await page.locator(`[data-id="${l1id}"][data-lod="3"]`).count() === 0);

// density toggle persists
await page.locator('.pc-density').click();
await page.waitForTimeout(400);
check('density toggles to comfortable', await page.locator('.postcard[data-density="comfortable"]').count() === 1);
check('density persisted', await page.evaluate(() => localStorage.getItem('jh-postcard-density')) === 'comfortable');
await page.locator('.pc-density').click();
await page.waitForTimeout(300);

// L2 uses tldr (not full content) and L1 shows micro
await page.fill('#so-searchInput', 'nanome');
await page.waitForTimeout(600);
const l2text = await page.locator('.pc-l2 .pc-tldr').first().textContent().catch(() => '');
check('L2 renders the tldr line', l2text.length > 0 && l2text.length < 200, `${l2text.length} chars`);
check('L1 shows micro line', (await page.locator('.pc-micro').first().textContent().catch(() => '')).length > 5);

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failures.length ? `\nFAILURES (${failures.length}):\n- ` + failures.join('\n- ') : '\nALL PASS');
process.exit(failures.length ? 1 : 0);
