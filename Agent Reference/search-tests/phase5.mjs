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
  const ctx = await browser.newContext();
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
  await page.waitForTimeout(500);
  const labels2 = await page.locator('#so-searchResults .cmdbar-group-label').allTextContents();
  check('"fish" on index keeps earned local group', labels2.some(l => /on this page/i.test(l)), labels2.join(','));

  // ───────── overview slot ─────────
  console.log('overview slot:');
  await page.fill('#so-searchInput', 'why should I hire him');
  await page.waitForTimeout(500);
  const ovVisible = await page.evaluate(() => {
    const a = document.getElementById('so-aiAnswer');
    return a.style.display !== 'none' && a.dataset.overview === 'true' ? a.dataset.model : null;
  });
  check('intent query composes an overview', ovVisible === 'composed from sources', String(ovVisible));
  check('overview carries related chips', await page.locator('#so-aiAnswer .related-chip').count() > 0);

  await page.fill('#so-searchInput', 'design');
  await page.waitForTimeout(500);
  const ovGone = await page.evaluate(() => document.getElementById('so-aiAnswer').dataset.overview !== 'true'
    || document.getElementById('so-aiAnswer').style.display === 'none');
  check('low-confidence query shows no overview', ovGone);

  await page.fill('#so-searchInput', 'book a call with him');
  await page.waitForTimeout(500);
  const cardNoOv = await page.evaluate(() => ({
    card: !!document.querySelector('#so-searchResults .intent-card'),
    ov: document.getElementById('so-aiAnswer').dataset.overview === 'true',
  }));
  check('intent card suppresses overview', cardNoOv.card && !cardNoOv.ov, JSON.stringify(cardNoOv));

  // ───────── media + related on cards ─────────
  console.log('media cards:');
  await page.fill('#so-searchInput', 'nanome');
  await page.waitForTimeout(500);
  check('nanome result has click-to-play poster', await page.locator('#so-searchResults [data-video]').count() > 0);
  check('nanome card has a related chip', await page.locator('#so-searchResults .card-related').count() > 0);
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
  await page.waitForTimeout(600);
  const ov = await page.evaluate(() => {
    const a = document.getElementById('aiAnswer');
    return { shown: a.style.display !== 'none', model: a.dataset.model, overview: a.dataset.overview };
  });
  check('overview renders on search page', ov.shown && ov.overview === 'true', JSON.stringify(ov));
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
console.log(failures.length ? `\nFAILURES (${failures.length}):\n- ` + failures.join('\n- ') : '\nALL PASS');
process.exit(failures.length ? 1 : 0);
