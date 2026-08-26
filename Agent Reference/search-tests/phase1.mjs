// Phase 1 QA — search-core extraction parity on both surfaces
import { chromium } from 'playwright-core';

const CHROMIUM = process.env.CHROMIUM_PATH ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const BASE = 'http://127.0.0.1:4571';

const failures = [];
function check(name, cond, detail = '') {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures.push(name + (detail ? ` (${detail})` : ''));
}

const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });

async function newPage() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  return { ctx, page, errors };
}

// ───────────────────────── search.html (page shell) ─────────────────────────
{
  console.log('search.html:');
  const { ctx, page, errors } = await newPage();
  await page.goto(`${BASE}/search.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  check('core loaded', await page.evaluate(() => !!window.JHSearchCore));
  const chunkCount = await page.evaluate(() =>
    new Promise(r => { let n = 0; const t = setInterval(() => { n += 100;
      const el = document.getElementById('searchResults'); if (el || n > 3000) { clearInterval(t); r(true); } }, 100); }));
  // type a query that goes through intent expansion
  await page.fill('#searchInput', 'can he code');
  await page.waitForTimeout(500);
  const resultCount = await page.locator('#searchResults .result').count();
  check('intent query returns results', resultCount > 0, `${resultCount} cards`);
  const firstTitle = await page.locator('#searchResults .result .result-title').first().textContent();
  check('result has title', !!firstTitle, firstTitle?.slice(0, 40));

  // plain keyword query
  await page.fill('#searchInput', 'nanome');
  await page.waitForTimeout(500);
  check('keyword query returns results', await page.locator('#searchResults .result').count() > 0);

  // clear button → empty state renders try-these suggestion chips
  await page.click('#clearBtn');
  await page.waitForTimeout(300);
  check('clear shows suggestion chips', await page.locator('#searchResults .pc-suggest-chip').count() > 0);

  // engine bar state (headless has no WebGPU adapter usually → Search only)
  const label = await page.locator('#engineModelLabel').textContent();
  check('engine bar has resting label', ['Search only', ''].includes(label.trim()) || label.includes('AI off'), JSON.stringify(label));

  // popover opens
  await page.click('#engineInfoBtn');
  check('popover opens', await page.locator('#enginePopover.open').count() === 1);
  await page.click('body', { position: { x: 5, y: 5 } });
  check('popover closes on outside click', await page.locator('#enginePopover.open').count() === 0);

  // ?q= deep link
  const p2 = await ctx.newPage();
  const p2errors = [];
  p2.on('pageerror', e => p2errors.push(String(e)));
  await p2.goto(`${BASE}/search.html?q=awards`, { waitUntil: 'networkidle' });
  await p2.waitForTimeout(1200);
  check('?q= autosearches', await p2.locator('#searchResults .result').count() > 0);

  // AI toggle exercisable without engine
  await page.click('#engineInfoBtn');
  await page.click('#aiToggle');
  const toggled = await page.locator('#aiToggleText').textContent();
  check('AI toggle flips', toggled.trim() === 'off');

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('no console errors (?q page)', p2errors.length === 0, p2errors.slice(0, 3).join(' | '));
  check('body broadcasts engine state', !!(await page.evaluate(() => document.body.dataset.searchEngine)));
  await ctx.close();
}

// ───────────────────────── overlay on index.html ─────────────────────────
{
  console.log('index.html overlay:');
  const { ctx, page, errors } = await newPage();
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  check('core NOT loaded before open (lazy)', await page.evaluate(() => !window.JHSearchCore));

  // '/' opens the overlay
  await page.keyboard.press('/');
  await page.waitForTimeout(1200);
  check('overlay opens on /', await page.evaluate(() =>
    document.getElementById('searchOverlay')?.getAttribute('aria-hidden') === 'false'));
  check('core loaded after open', await page.evaluate(() => !!window.JHSearchCore));

  await page.fill('#so-searchInput', 'why should I hire him');
  await page.waitForTimeout(500);
  const n = await page.locator('#so-searchResults .result').count();
  check('overlay intent query returns results', n > 0, `${n} cards`);
  check('has-results class set', await page.evaluate(() =>
    document.getElementById('searchOverlay').classList.contains('has-results')));

  // settings expand + collapse via info button
  await page.click('#so-engineInfoBtn');
  check('settings expand', await page.locator('#so-engineSettings.open').count() === 1);
  await page.focus('#so-searchInput');
  check('settings close on input focus', await page.locator('#so-engineSettings.open').count() === 0);

  // Escape closes — through the 9c ladder: with a query in the input, Esc
  // clears it first; the close is the LAST rung. Clear first so one Esc
  // deterministically closes. (The full ladder is phase9's to assert.)
  await page.fill('#so-searchInput', '');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('Escape closes overlay', await page.evaluate(() =>
    document.getElementById('searchOverlay')?.getAttribute('aria-hidden') === 'true'));

  // Cmd+K reopens
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(300);
  check('⌘K reopens', await page.evaluate(() =>
    document.getElementById('searchOverlay')?.getAttribute('aria-hidden') === 'false'));

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ───────────────────────── overlay on about.html + ?q= ─────────────────────────
{
  console.log('about.html overlay (?q= deep link):');
  const { ctx, page, errors } = await newPage();
  await page.goto(`${BASE}/about.html?q=education`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  check('?q= auto-opens overlay', await page.evaluate(() =>
    document.getElementById('searchOverlay')?.getAttribute('aria-hidden') === 'false'));
  check('?q= results render', await page.locator('#so-searchResults .result').count() > 0);
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
console.log(failures.length ? `\nFAILURES (${failures.length}):\n- ` + failures.join('\n- ') : '\nALL PASS');
process.exit(failures.length ? 1 : 0);
