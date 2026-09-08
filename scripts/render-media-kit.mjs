// Renders Assets/media-kit.html boards to PNG at 2x. Dev-time only.
//   node scripts/render-media-kit.mjs            → Assets/media-kit/*.png (dark)
//   node scripts/render-media-kit.mjs --light     → adds -light variants
//   node scripts/render-media-kit.mjs --only=clients,offer
// Serves the repo itself on an ephemeral port (the rig loads ../styles/jh-chrome.css
// and Google Fonts, so it needs http, not file://).
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'Assets/media-kit');
const PORT = 4593;
const args = process.argv.slice(2);
const only = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const themes = args.includes('--light') ? ['dark', 'light'] : ['dark'];
const CHROMIUM = process.env.CHROMIUM_PATH ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

mkdirSync(OUT, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 700));
const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
let n = 0;
try {
  for (const theme of themes) {
    for (const format of ['square', 'portrait', 'wide']) {
      const ctx = await browser.newContext({ viewport: { width: 1800, height: 1500 }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await page.goto(`http://127.0.0.1:${PORT}/Assets/media-kit.html?format=${format}`, { waitUntil: 'networkidle' });
      if (theme === 'light') await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      for (const board of await page.$$('.board:not([hidden])')) {
        const name = await board.getAttribute('data-name');
        if (only.length && !only.includes(name)) continue;
        const file = `${OUT}/${name}--${format}${theme === 'light' ? '-light' : ''}.png`;
        await board.screenshot({ path: file });
        console.log('wrote', file.replace(ROOT + '/', '')); n++;
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(`${n} images`);
