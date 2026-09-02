// Demo contact sheet — screenshots of the states John will show. Writes PNGs
// to $SHOTDIR (default: TMPDIR/demosheet). Not a suite.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const CHROMIUM = process.env.CHROMIUM_PATH ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const BASE = 'http://127.0.0.1:4571';
const DIR = process.env.SHOTDIR || `${process.env.TMPDIR || '/tmp'}/demosheet`;
mkdirSync(DIR, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });

async function shoot(name, { width = 1440, height = 900, theme = 'dark', page: path = 'index.html', query, open = true, settings = false, workspace = false, local = false, mobile = false }) {
  const ctx = await browser.newContext({ colorScheme: theme, viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
  if (!local) await ctx.route(/(localhost|127\.0\.0\.1):(1234|11434)/, r => r.abort());
  const page = await ctx.newPage();
  await page.addInitScript(({ t, ws }) => { try { localStorage.setItem('jh-theme', t); localStorage.setItem('jh-postcard-density', 'compact'); if (ws) localStorage.setItem('jh-search-workspace', '1'); else localStorage.removeItem('jh-search-workspace'); } catch {} }, { t: theme, ws: workspace });
  await page.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  if (open) {
    await page.keyboard.press('/');
    await page.waitForSelector('#so-searchInput', { timeout: 10000 });
    await page.waitForTimeout(700);
    if (local) {
      await page.click('#so-engineInfoBtn'); await page.waitForTimeout(300);
      await page.click('#so-detectLocalBtn'); await page.waitForTimeout(3500);
      await page.evaluate(() => { const sel = document.querySelector('#so-localPicker select.lp-select'); const o = sel && [...sel.options].find(e => /0\.8b-mlx/i.test(e.textContent)); if (o) { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); } });
      await page.waitForTimeout(600);
      await page.click('#so-engineInfoBtn'); await page.waitForTimeout(300);
    }
    if (query) { await page.fill('#so-searchInput', query); await page.waitForTimeout(local ? 7000 : 2600); }
    if (settings) { await page.click('#so-engineInfoBtn'); await page.waitForTimeout(600); }
  }
  await page.screenshot({ path: `${DIR}/${name}.png` });
  await ctx.close();
  console.log('shot', name);
}

await shoot('01-desktop-who-is-john', { query: 'who is john' });
await shoot('02-desktop-badvr-dossier', { query: 'badvr' });
await shoot('03-workspace-fish', { query: 'fish minigame', workspace: true });
await shoot('04-light-awards', { query: 'what awards has he won', theme: 'light' });
await shoot('05-engine-disclosure', { settings: true });
await shoot('06-scene-plan', { query: 'add 3 small fish' });
await shoot('07-mobile-who-is-john', { width: 390, height: 844, mobile: true, query: 'who is john' });
await shoot('08-mobile-contact', { width: 390, height: 844, mobile: true, query: 'contact' });
await shoot('09-local-qwen-answer', { query: 'why should I hire him', local: true });
await shoot('10-local-qwen-tooluse', { query: 'scare the fish', local: true });
await shoot('11-searchpage', { page: 'search.html?q=nanome', open: false });
await browser.close();
console.log('dir:', DIR);
