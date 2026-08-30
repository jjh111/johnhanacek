// Phase 8 QA — action gating, eyebrow, semantic density, Shallows theme
import { chromium } from 'playwright-core';
const CHROMIUM = process.env.CHROMIUM_PATH ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const BASE = 'http://127.0.0.1:4571';
// Unset SHOTDIR used to concatenate as the string "undefined", writing shots
// into a literal ./undefined/ directory. Defaults to temp so a bare run
// never litters the repo — set SHOTDIR to keep the shots.
const SHOTDIR = process.env.SHOTDIR || process.env.TMPDIR || '/tmp';
const failures = [];
function check(name, cond, detail = '') {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures.push(name);
}
const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });

async function freshPage(ctx) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/net::|Failed to fetch|ERR_/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  return { page, errors };
}
const actionsOf = (page) => page.evaluate(() =>
  [...document.querySelectorAll('.cmd-card .cmd-title')].map(e => e.textContent));
const eyebrowsOf = (page) => page.evaluate(() =>
  [...document.querySelectorAll('.cmdbar-group-label')].map(e => e.textContent));
const lodsOf = (page) => page.evaluate(() =>
  [...document.querySelectorAll('.pc-mod')].map(e => e.dataset.lod));

// ───────── 1. action gating + eyebrow + density (index overlay) ─────────
{
  console.log('actions / eyebrow / density:');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 } });   // tall: 9e no-scroll sheds depth on short panels; density needs room for the larger media dossier
  await ctx.route(/(localhost|127\.0\.0\.1):(1234|11434)/, r => r.abort());
  const { page, errors } = await freshPage(ctx);
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  await page.keyboard.press('/');
  await page.waitForTimeout(1200);

  await page.fill('#so-searchInput', "who's john");
  await page.waitForTimeout(700);
  check("who's john shows NO actions", (await actionsOf(page)).length === 0, (await actionsOf(page)).join(','));
  check("and no literal tl;dr eyebrow", !(await eyebrowsOf(page)).includes('tl;dr'), (await eyebrowsOf(page)).join(' | '));

  await page.fill('#so-searchInput', 'scare the fish');
  await page.waitForTimeout(700);
  check('imperative still surfaces its action', (await actionsOf(page)).includes('Scare the fish'));

  await page.fill('#so-searchInput', 'go to services');
  await page.waitForTimeout(700);
  check('nav command still matches', (await actionsOf(page)).includes('Go to Services'));

  await page.fill('#so-searchInput', 'awards');
  await page.waitForTimeout(700);
  check('intent eyebrow still renders', (await eyebrowsOf(page)).some(t => /awards/i.test(t)));

  // density = semantic zoom: same query, compact vs comfortable → different tiers
  await page.fill('#so-searchInput', 'nanome');
  await page.waitForTimeout(700);
  const compactLods = await lodsOf(page);
  await page.locator('.pc-density').click();
  await page.waitForTimeout(500);
  const comfyLods = await lodsOf(page);
  // The lead now ARRIVES at dossier depth in compact (there is no click-to-pin
  // left to reach it), so density can no longer raise the top tier — it is
  // already the ceiling. Density's job is the WORDING inside that tier and the
  // frame scale, asserted just below and in phase10.
  const top = a => Math.max(...a.map(Number));
  check('the lead arrives at dossier depth without being asked',
    top(compactLods) === 3, `${compactLods.join(',')} → ${comfyLods.join(',')}`);
  check('density never COSTS depth (comfortable holds the ceiling)',
    top(comfyLods) >= top(compactLods) || comfyLods.length < compactLods.length,
    `${compactLods.join(',')} → ${comfyLods.join(',')}`);

  // 10e.3 — the wording ladder: micro < tldr < brief < full. LOD is
  // structural; density picks the wording INSIDE a constant structure.
  // The probe chunk needs content LONGER than the ~260ch brief window, or
  // brief === full and no wording flip exists to observe. 'jhana' (chunk 13)
  // stopped qualifying when the deriveBrief split was fixed: its content is
  // short, and the old assertion only passed because the buggy splitter
  // re-spaced "sound.js" into "sound. js" — a difference that WAS the bug.
  // 'fish minigame' stopped qualifying too when chunk 35 regained its demo
  // PIECE (2026-08-30 re-seed): the big-media floor prices its comfy dossier
  // out and the lead sheds to L2 — no constant-lod pair. 'agentic coding'
  // (chunk 25: 446ch, no media, no facts) truncates for real AND holds L3 at
  // both densities (verified live: 25/3/brief → 25/3/full).
  const captureTiers = () => page.evaluate(() => [...document.querySelectorAll('.pc-mod')].map(m => ({
    id: m.dataset.id, lod: m.dataset.lod, txt: m.dataset.txt || '',
    words: (m.querySelector('.pc-tldr, .pc-prose')?.textContent || '').trim(),
  })));
  await page.fill('#so-searchInput', 'agentic coding');
  await page.waitForTimeout(900);
  check('l2+/dossier modules carry a wording-tier stamp',
    (await captureTiers()).every(m => Number(m.lod) < 2 || m.txt.length > 0));
  const compactTiers = await captureTiers();          // compact: dossier shows BRIEF
  await page.locator('.pc-density').click();
  await page.waitForTimeout(600);
  const comfyTiers = await captureTiers();            // comfortable: dossier shows FULL
  const pairs = [];
  for (const c of compactTiers) {
    const k = comfyTiers.find(m => m.id === c.id && m.lod === c.lod && Number(m.lod) >= 3);
    if (k) pairs.push([c, k]);
  }
  check('density flip changes WORDING at constant lod (brief → full)',
    pairs.length > 0 && pairs.some(([c, k]) => c.words !== k.words),
    pairs.length ? `${pairs[0][0].words.slice(0, 40)} ≠ ${pairs[0][1].words.slice(0, 40)}` : 'no constant-lod pair');
  // derived brief is a SELECTION: whole sentences from the start of content —
  // the compact dossier text must prefix the comfortable one
  check('compact dossier wording is a sentence-selection prefix of full',
    pairs.length > 0 && pairs.every(([c, k]) => k.words.startsWith(c.words.slice(0, 30))),
    pairs.length ? `"${pairs[0][0].words.slice(0, 30)}…"` : 'no pair');
  await page.locator('.pc-density').click();  // restore compact
  await page.waitForTimeout(300);

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ───────── 2. Shallows light theme (overlay on index) ─────────
{
  console.log('light theme — overlay:');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 920 } });   // tall: 9e no-scroll sheds depth on short panels
  await ctx.route(/(localhost|127\.0\.0\.1):(1234|11434)/, r => r.abort());
  const { page, errors } = await freshPage(ctx);
  await page.addInitScript(() => { try { localStorage.setItem('jh-theme', 'light'); } catch {} });
  await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  check('light theme is active', await page.evaluate(() =>
    document.documentElement.getAttribute('data-theme') === 'light'));
  await page.keyboard.press('/');
  await page.waitForTimeout(1200);
  await page.fill('#so-searchInput', 'fish maze');
  await page.waitForTimeout(900);

  const probe = await page.evaluate(() => {
    const lum = (c) => { const m = c.match(/[\d.]+/g) || [0,0,0]; return (+m[0] + +m[1] + +m[2]) / 3; };
    const panel = getComputedStyle(document.querySelector('.search-overlay-panel'));
    const title = document.querySelector('.pc-mod .result-title');
    const strip = document.querySelector('.tier-strip .tier');
    return {
      panelBgLum: lum(panel.backgroundColor),
      titleLum: title ? lum(getComputedStyle(title).color) : -1,
      tierLum: strip ? lum(getComputedStyle(strip).color) : -1,
    };
  });
  check('panel glass is light', probe.panelBgLum > 180, String(probe.panelBgLum));
  check('result text is ink-dark', probe.titleLum >= 0 && probe.titleLum < 120, String(probe.titleLum));
  check('tier strip readable on paper', probe.tierLum >= 0 && probe.tierLum < 150, String(probe.tierLum));
  await page.screenshot({ path: SHOTDIR + '/light-overlay.png' });

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ───────── 3. search.html — stylesheet present, themes both ways ─────────
{
  console.log('search.html:');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 920 } });   // tall: 9e no-scroll sheds depth on short panels
  await ctx.route(/(localhost|127\.0\.0\.1):(1234|11434)/, r => r.abort());
  const { page, errors } = await freshPage(ctx);
  await page.goto(`${BASE}/search.html?q=fish+maze`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  check('search-overlay.css now linked', await page.evaluate(() =>
    [...document.styleSheets].some(s => (s.href || '').includes('search-overlay.css'))));
  check('postcard styled (mono font applied)', await page.evaluate(() => {
    const p = document.querySelector('.postcard');
    return p && getComputedStyle(p).fontFamily.includes('JetBrains');
  }));
  await page.screenshot({ path: SHOTDIR + '/dark-searchpage.png' });

  await page.evaluate(() => { localStorage.setItem('jh-theme', 'light'); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const light = await page.evaluate(() => {
    const lum = (c) => { const m = c.match(/[\d.]+/g) || [0,0,0]; return (+m[0] + +m[1] + +m[2]) / 3; };
    const body = getComputedStyle(document.body);
    const t = document.querySelector('.pc-mod .result-title, .result-title');
    return { bodyLum: lum(body.backgroundColor), titleLum: t ? lum(getComputedStyle(t).color) : -1 };
  });
  check('page ground is light', light.bodyLum > 180, String(light.bodyLum));
  check('result text is ink-dark', light.titleLum >= 0 && light.titleLum < 120, String(light.titleLum));
  await page.screenshot({ path: SHOTDIR + '/light-searchpage.png' });

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
console.log(failures.length ? `\nFAILURES (${failures.length}):\n- ` + failures.join('\n- ') : '\nALL PASS');
process.exit(failures.length ? 1 : 0);
