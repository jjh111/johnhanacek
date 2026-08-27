// 10f — capture departure-card posters: one screenshot per external
// destination → Assets/posters/<host>.webp. Dev-time only; run from the repo
// root:  node scripts/capture-posters.mjs
// Posters are CLAIMS: dated in CHUNK_AUDIT §G, refreshed when John says the
// destination changed. A destination that refuses to load keeps its old
// poster (or gets none — the card renders fine without one).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';

const CHROMIUM = process.env.CHROMIUM_PATH ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const OUT = new URL('../Assets/posters/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

// Every external the pieces registry + intent cards can depart to.
const TARGETS = [
  'https://jhana.zone',
  'https://jjh111.github.io/MetaMedium/',
  'https://earthstar.space',
  'https://fractalfuture.substack.com',
  'https://johnhanacek.smugmug.com',
];

const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
for (const url of TARGETS) {
  const host = new URL(url).hostname;
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(2500);   // let fonts/settling animations land
    await page.screenshot({ path: `${OUT}${host}.webp`, type: 'jpeg', quality: 80 });
    console.log(`✓ ${host}`);
  } catch (e) {
    console.log(`✗ ${host} — ${String(e).slice(0, 80)} (keeps old poster / renders without)`);
  }
  await page.close();
}
await browser.close();
