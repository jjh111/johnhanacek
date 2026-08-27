// Phase 10b QA — session memory & the collapsed search
// Needs mock-llm.mjs running on :9911.
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

// ───────── 1. answer kept across a command navigation ─────────
{
  console.log('answer continuity:');
  const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1280, height: 920 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('jh-local-llm-optin', 'true');
    localStorage.setItem('searchCustomEndpoint', 'http://127.0.0.1:9911/v1');
  });
  await ctx.route('**://localhost:1234/**', r => r.abort());
  await ctx.route('**://localhost:11434/**', r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.keyboard.press('/');
  await page.waitForTimeout(7000);   // local probes time out before custom endpoint lands

  await page.fill('#so-searchInput', 'who is john');
  await page.waitForTimeout(2800);
  const ans = await page.locator('#so-aiAnswer').textContent();
  check('mock answer generated', ans.length > 30, ans.slice(0, 40));
  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem('jh-search-session') || 'null'));
  check('answer saved to the session', !!stored && stored.query === 'who is john' && stored.answer.length > 30,
    stored ? `${stored.query} / ${stored.answer.slice(0, 30)}` : 'null');

  // navigate via a nav command → strip on the next page
  await page.fill('#so-searchInput', 'who is john');   // keep query current
  await page.waitForTimeout(400);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.evaluate(() => window.JHSearch.executeCommand('goto:design')),
  ]);
  await page.waitForTimeout(1500);
  check('landed on design', /design\.html/.test(page.url()), page.url());
  const strip = page.locator('.so-continuity');
  check('continuity strip appears', await strip.count() === 1);
  check('strip shows the query and the kept answer', /who is john/.test(await strip.textContent())
    && /answer kept/.test(await strip.textContent()), (await strip.textContent()).trim());

  // reopen restored
  await page.locator('.so-continuity-open').click();
  await page.waitForTimeout(2500);
  const restored = await page.evaluate(() => ({
    open: document.getElementById('searchOverlay')?.getAttribute('aria-hidden') === 'false',
    input: document.getElementById('so-searchInput')?.value,
    answer: document.getElementById('so-aiAnswer')?.textContent || '',
    restoredFlag: !!document.getElementById('so-aiAnswer')?.dataset.restored,
    byline: getComputedStyle(document.getElementById('so-aiAnswer'), '::before').content,
    postcard: !!document.querySelector('#so-searchResults .pc-mod'),
  }));
  check('overlay reopens restored', restored.open && restored.input === 'who is john');
  check('the KEPT answer is re-attached (not regenerated)', restored.answer.includes(ans.slice(0, 25)));
  check('honest byline: "from your last search"', restored.restoredFlag && /last search/.test(restored.byline), restored.byline);
  check('postcard re-derived deterministically', restored.postcard);
  check('strip gone once reopened', await strip.count() === 0);

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ───────── 2. query-only continuity + one-shot + TTL ─────────
{
  console.log('query-only / one-shot / TTL:');
  const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1280, height: 920 } });
  await ctx.route(/(localhost|127\.0\.0\.1):(1234|11434)/, r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/net::|ERR_/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.keyboard.press('/');
  await page.waitForTimeout(1200);

  // no engine: query-only navigation still collapses the search
  await page.fill('#so-searchInput', 'nanome case study');
  await page.waitForTimeout(800);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.keyboard.press('Enter'),
  ]);
  await page.waitForTimeout(1200);
  const strip = page.locator('.so-continuity');
  check('query-only strip appears after Enter-navigation', await strip.count() === 1);
  const t = await strip.textContent();
  check('strip carries the query, no false "answer kept"', /nanome case study/.test(t) && !/answer kept/.test(t), t.trim());

  // dismiss is one-shot: a plain reload shows no strip
  await page.locator('.so-continuity-x').click();
  check('dismiss removes the strip', await strip.count() === 0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  check('the flag is one-shot — no strip on plain reload', await page.locator('.so-continuity').count() === 0);

  // TTL: a stale session never resurfaces
  await page.evaluate(() => {
    const s = JSON.parse(sessionStorage.getItem('jh-search-session'));
    s.ts = Date.now() - 31 * 60 * 1000;
    sessionStorage.setItem('jh-search-session', JSON.stringify(s));
    sessionStorage.setItem('jh-search-continue', '1');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  check('expired session shows no strip', await page.locator('.so-continuity').count() === 0);

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ───────── 3. 10c — pieces: the site's widgets as search material ─────────
{
  console.log('pieces:');
  const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1280, height: 920 } });
  await ctx.route(/(localhost|127\.0\.0\.1):(1234|11434)/, r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  // framed demos emit benign policy notices (compute-pressure) — not ours
  page.on('console', m => { if (m.type() === 'error' && !/net::|ERR_|Failed to load resource|Permissions policy/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/about.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.keyboard.press('/');
  await page.waitForTimeout(1200);

  // the rail: piece intent collects the top results' pieces
  await page.fill('#so-searchInput', 'interactive demos');
  await page.waitForTimeout(900);
  const rail = await page.evaluate(() => ({
    hint: document.querySelector('.pc-head .cmdbar-group-label')?.textContent || '',
    demos: document.querySelectorAll('.pc-piece-rail .pc-piece--demo').length,
    links: document.querySelectorAll('.pc-piece-rail .pc-piece--link').length,
    framedExternals: [...document.querySelectorAll('.pc-piece--link iframe')].length,
  }));
  check('piece intent fires the rail', /pieces/i.test(rail.hint) && rail.demos >= 3, JSON.stringify(rail));
  check('off-origin pieces are doorways, never frames', rail.framedExternals === 0
    && rail.links >= 1);

  // wake budget: ONE live iframe, ever
  const srcs = await page.evaluate(() =>
    [...document.querySelectorAll('.pc-piece-rail .pc-piece--demo')].map(p => p.dataset.pieceSrc));
  await page.evaluate((s) => document.querySelector(`[data-piece-src="${s}"]`).click(), srcs[0]);
  await page.waitForTimeout(700);
  await page.evaluate((s) => document.querySelector(`[data-piece-src="${s}"]`).click(), srcs[1]);
  await page.waitForTimeout(700);
  const budget = await page.evaluate(() => ({
    iframes: document.querySelectorAll('.pc-piece iframe').length,
    woken: [...document.querySelectorAll('.pc-piece--woken')].map(p => p.dataset.pieceSrc),
  }));
  check('waking a second sleeps the first (budget of one)', budget.iframes === 1 && budget.woken[0] === srcs[1],
    JSON.stringify(budget));

  // closing the overlay sleeps the live piece
  await page.keyboard.press('Escape');   // clear query
  await page.keyboard.press('Escape');   // close
  await page.waitForTimeout(400);
  check('closing the overlay sleeps the demo', await page.evaluate(() =>
    document.querySelectorAll('.pc-piece iframe').length === 0));

  // zoom-and-wake: a small piece click promotes its module AND wakes the demo
  await page.keyboard.press('/');
  await page.waitForTimeout(500);
  await page.fill('#so-searchInput', 'fish minigame');
  await page.waitForTimeout(900);
  check('specific query is NOT hijacked by the piece sweep', await page.evaluate(() =>
    document.querySelector('.pc-mod')?.dataset.id === '35'));
  await page.click('.pc-mod[data-id="35"] .pc-piece--demo');
  await page.waitForTimeout(2200);
  const woven = await page.evaluate(() => ({
    lod: document.querySelector('.pc-mod[data-id="35"]')?.dataset.lod,
    live: !!document.querySelector('.pc-mod[data-id="35"] .pc-piece--woken iframe'),
    wrapped: document.querySelectorAll('.pc-mod[data-id="35"] .pretext-line').length,
    tipStuck: (() => { const t = document.querySelector('.pc-tip'); return !!t && t.style.display !== 'none'; })(),
  }));
  check('small piece click zooms the module and wakes the demo IN the dossier',
    woven.lod === '3' && woven.live, JSON.stringify(woven));
  check('prose stays pretext-wrapped around the LIVE demo', woven.wrapped > 3, String(woven.wrapped));
  check('no stale tooltip after the gesture', !woven.tipStuck);

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
console.log(failures.length ? `\nFAILURES (${failures.length}):\n- ` + failures.join('\n- ') : '\nALL PASS');
process.exit(failures.length ? 1 : 0);
