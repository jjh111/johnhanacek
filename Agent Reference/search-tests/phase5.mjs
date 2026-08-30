// Phase 5 QA — explorer: topline gating, overview slot, related chips, media
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 920 } });   // tall: 9e no-scroll sheds depth on short panels
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  return { ctx, page, errors };
}

// ───────── topline gating (the reported bug) ─────────
{
  console.log('topline gating on index:');
  const { ctx, page, errors } = await newPage(`${BASE}/index.html`);
  await page.keyboard.press('/');
  await page.waitForTimeout(1200);
  check('model-viewer CDN NOT loaded before any 3D card renders', await page.evaluate(() =>
    !document.querySelector('script[src*="model-viewer"]')));

  await page.fill('#so-searchInput', 'awards');
  await page.waitForTimeout(500);
  const labels1 = await page.locator('#so-searchResults .cmdbar-group-label').allTextContents();
  check('"awards" on index gets NO local group', !labels1.some(l => /on this page/i.test(l)), labels1.join(',') || '(none)');
  const first = await page.locator('#so-searchResults .result .result-title').first().textContent();
  check('"awards" first result is the real answer', first.includes('Awards'), first);

  await page.fill('#so-searchInput', 'fish');
  await page.waitForTimeout(900);   // 500 flaked under full-suite load (embedder contention)
  const labels2 = await page.locator('#so-searchResults .cmdbar-group-label').allTextContents();
  check('"fish" on index keeps earned local group', labels2.some(l => /on this page/i.test(l)), labels2.join(','));

  // ───────── postcard lead (replaced the overview slot in 6a) ─────────
  console.log('postcard lead:');
  await page.fill('#so-searchInput', 'why should I hire him');
  await page.waitForTimeout(600);
  const eyebrow = await page.locator('#so-searchResults .postcard .cmdbar-group-label').first().textContent();
  check('intent hint becomes the postcard eyebrow', /expertise|unique/i.test(eyebrow), eyebrow);
  check('postcard carries related chips', await page.locator('#so-searchResults .related-chip').count() > 0);

  await page.fill('#so-searchInput', 'design');
  await page.waitForTimeout(600);
  // Contract updated with the one-surface change (ad80c55): nothing expands
  // on click any more, so the LEAD arrives at dossier depth even on a broad
  // query — exactly ONE dossier, never a wall of them. (The old "no L3 when
  // broad" assertion survived only while the fit loop happened to flatten the
  // lead at this viewport — the leadCap fix ended that accident.)
  check('broad query: exactly one dossier (the lead), not a wall of them',
    await page.locator('#so-searchResults [data-lod="3"]').count() <= 1);

  await page.fill('#so-searchInput', 'book a call with him');
  await page.waitForTimeout(500);
  check('intent card renders above postcard', await page.locator('#so-searchResults .intent-card').count() === 1);

  // ───────── media + related on cards ─────────
  // 'badvr', not 'nanome': chunk 37 gained a live demo PIECE (2026-08-30
  // re-seed) and pieces outrank the video in pcMediaHtml — interactive-first
  // is the doctrine, so the probe moves to a chunk whose video still leads.
  console.log('media cards:');
  await page.fill('#so-searchInput', 'badvr');
  await page.waitForTimeout(500);
  check('badvr result has click-to-play poster', await page.locator('#so-searchResults [data-video]').count() > 0);
  check('badvr card has a related chip', await page.locator('#so-searchResults .card-related').count() > 0);
  await page.locator('#so-searchResults [data-video]').first().click();
  await page.waitForTimeout(400);
  const vidSrc = await page.locator('#so-searchResults video.result-video').first().getAttribute('src').catch(() => null);
  check('click swaps poster for playing video', !!vidSrc && vidSrc.includes('.mp4'), vidSrc || '(none)');

  await page.fill('#so-searchInput', 'awards and recognition');
  await page.waitForTimeout(600);
  check('awards result renders live model-viewer', await page.locator('#so-searchResults model-viewer').count() > 0);
  check('model-viewer CDN injected on demand', await page.evaluate(() =>
    !!document.querySelector('script[src*="model-viewer"]')));

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ───────── search.html smoke ─────────
{
  console.log('search.html:');
  const { ctx, page, errors } = await newPage(`${BASE}/search.html`);
  await page.fill('#searchInput', 'what makes him unique');
  await page.waitForTimeout(700);
  check('postcard renders on search page', await page.locator('#searchResults .postcard .pc-mod').count() > 0);
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
console.log(failures.length ? `\nFAILURES (${failures.length}):\n- ` + failures.join('\n- ') : '\nALL PASS');
process.exit(failures.length ? 1 : 0);
