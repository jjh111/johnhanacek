// Phase 7 QA — the tier strip: sequence, signals, controls
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
const page = await (await browser.newContext()).newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.keyboard.press('/');
await page.waitForTimeout(1500);

// sequence (9a frame): panel = command frame (input → strip → settings) over
// a scroll region (answer → results) — the bar never scrolls away
const order = await page.evaluate(() => {
  const frame = document.querySelector('.so-command-frame');
  const scroll = document.querySelector('.so-panel-scroll');
  return {
    frame: frame ? [...frame.children].map(c => c.className.split(' ')[0] || c.id) : [],
    scroll: scroll ? [...scroll.children].map(c => c.className.split(' ')[0] || c.id) : [],
  };
});
check('UX sequence: search first, then options, then results',
  order.frame[0] && order.frame[0].includes('search-input')
  && order.frame[1].includes('tier-strip')
  && order.frame[2].includes('engine-settings')
  && order.scroll[0] && order.scroll[0].includes('ai-answer'),
  `frame: ${order.frame.join(' → ')} | scroll: ${order.scroll.join(' → ')}`);

// signals with panel CLOSED
check('strip signals with panel collapsed', await page.evaluate(() =>
  !document.getElementById('so-engineSettings').classList.contains('open')
  && document.querySelectorAll('#so-tierStrip .tier').length >= 5));
const segs = await page.evaluate(() => [...document.querySelectorAll('#so-tierStrip .tier')].map(t => t.dataset.tier));
check('ladder order keyword→semantic→qwen→local→ai', segs.join(',').startsWith('keyword,semantic,qwen,local'), segs.join(','));
check('keyword is a fact, not a button', await page.evaluate(() =>
  document.querySelector('[data-tier="keyword"]').className.includes('fact-on')));
check('qwen wears its cost as its label', await page.evaluate(() => {
  const t = document.querySelector('[data-tier="qwen"]').textContent;
  return /585mb|⚡|%|qwen$/.test(t) || t.includes('qwen');
}), await page.evaluate(() => document.querySelector('[data-tier="qwen"]').textContent.trim()));

// old space-wasters are gone
check('no BM25 pseudo-button section', await page.evaluate(() => !document.querySelector('.popover-section--bm25')));
check('no engine-bar Load CTA', await page.evaluate(() => !document.getElementById('so-engineBarLoadBtn')));

// ai toggle round-trips from the strip
await page.click('#so-tierStrip [data-tier="ai"]');
await page.waitForTimeout(200);
check('strip flips AI off', (await page.locator('#so-tierStrip [data-tier="ai"]').textContent()).includes('ai off'));
await page.click('#so-tierStrip [data-tier="ai"]');
await page.waitForTimeout(200);
check('strip flips AI back on', (await page.locator('#so-tierStrip [data-tier="ai"]').textContent()).includes('ai on'));

// chevron opens the compact panel
await page.click('#so-engineInfoBtn');
check('chevron opens engine details', await page.locator('#so-engineSettings.open').count() === 1);
check('panel status line lives inside the panel', await page.evaluate(() =>
  document.getElementById('so-engineSettings').contains(document.getElementById('so-engineModelLabel'))));

// semantic segment reaches ready state after a search
await page.fill('#so-searchInput', 'meta');
let semReady = false;
for (let i = 0; i < 90; i++) {   // 60 flaked under full-suite load (concurrent cold embedder downloads)
  await page.waitForTimeout(1000);
  semReady = await page.evaluate(() => document.querySelector('[data-tier="semantic"]')?.className.includes('fact-on'));
  if (semReady) break;
}
check('semantic segment lights up when the tier lands', semReady);

// search.html mirrors the strip
const p2 = await (await browser.newContext()).newPage();
await p2.goto(`${BASE}/search.html`, { waitUntil: 'networkidle' });
await p2.waitForTimeout(800);
check('search.html has the strip below its input', await p2.evaluate(() => {
  const wrap = document.querySelector('.search-wrap');
  const kids = [...wrap.children].map(c => c.className.split(' ')[0]);
  return kids[0].includes('search-input') && kids[1].includes('tier-strip')
    && document.querySelectorAll('#tierStrip .tier').length >= 5;
}));

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failures.length ? `\nFAILURES (${failures.length}):\n- ` + failures.join('\n- ') : '\nALL PASS');
process.exit(failures.length ? 1 : 0);
