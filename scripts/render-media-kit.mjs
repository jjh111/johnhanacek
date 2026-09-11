// Renders Assets/media-kit.html boards to PNG at 2x, and records the tank boards as video.
//   node scripts/render-media-kit.mjs                → Assets/media-kit/*.png (dark)
//   node scripts/render-media-kit.mjs --light        → adds *-light.png
//   node scripts/render-media-kit.mjs --only=clients,offer
//   node scripts/render-media-kit.mjs --video        → Assets/media-kit/video/*.mp4 (12 s, fish fed twice)
//   node scripts/render-media-kit.mjs --video --only=offer --format=wide --light
// Serves the repo itself on a probed ephemeral port (the rig loads ../styles and ../scripts,
// so it needs http, not file://). The port is proven OURS before anything renders: a stale
// server that steals the bind would otherwise paint its 404 into every PNG/MP4 (that bug
// shipped a 404 as the live resume via build-resume on 2026-09-10). ffmpeg is required
// for --video (webm → mp4).
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { serveVerified } from './serve-verified.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'Assets/media-kit');
const args = process.argv.slice(2);
const flag = (k) => (args.find(a => a.startsWith(`--${k}=`)) || '').slice(k.length + 3);
const only = flag('only').split(',').filter(Boolean);
const formats = flag('format') ? flag('format').split(',') : ['square', 'portrait', 'wide'];
const themes = args.includes('--light') ? (args.includes('--video') ? ['light'] : ['dark', 'light']) : ['dark'];
const VIDEO = args.includes('--video');
const SIZE = { square: [1080, 1080], portrait: [1080, 1350], wide: [1600, 900] };
const CHROMIUM = process.env.CHROMIUM_PATH || chromium.executablePath();

mkdirSync(OUT, { recursive: true });
const srv = await serveVerified(ROOT);           // proves we own the port before anything renders
const PORT = srv.port;
const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
const url = (format, theme, board) => `http://127.0.0.1:${PORT}/Assets/media-kit.html?format=${format}${theme === 'light' ? '&theme=light' : ''}${board ? `&board=${board}` : ''}`;
let n = 0;
try {
  if (!VIDEO) {
    for (const theme of themes) for (const format of formats) {
      const ctx = await browser.newContext({ viewport: { width: 1800, height: 1500 }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await page.goto(url(format, theme), { waitUntil: 'load', timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(2200);                       // let the fish spread out
      await page.evaluate(() => window.JH_FEED && window.JH_FEED(2));
      await page.waitForTimeout(900);                        // a fish turns toward the food
      const boards = await page.$$('.board:not([hidden])');
      if (!boards.length) throw new Error(`no boards on ${format}/${theme} — the rig did not load. Nothing was written; the PNGs on disk are still the old ones.`);
      for (const board of boards) {
        const name = await board.getAttribute('data-name');
        if (only.length && !only.includes(name)) continue;
        const file = `${OUT}/${name}--${format}${theme === 'light' ? '-light' : ''}.png`;
        await board.screenshot({ path: file });
        console.log('wrote', file.replace(ROOT + '/', '')); n++;
      }
      await ctx.close();
    }
  } else {
    const VOUT = `${OUT}/video`; mkdirSync(VOUT, { recursive: true });
    const names = only.length ? only : ['offer', 'endorsement-dan-barrett', 'clients', 'outcomes'];
    for (const theme of themes) for (const format of formats) for (const name of names) {
      const [w, h] = SIZE[format];
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1,
        recordVideo: { dir: VOUT, size: { width: w, height: h } } });
      const t0 = Date.now();                                   // recording starts with the context
      const page = await ctx.newPage();
      await page.goto(url(format, theme, name), { waitUntil: 'load', timeout: 60000 });
      const shown = await page.$eval('.board:not([hidden])', b => b.dataset.name).catch(() => null);
      if (shown !== name) { console.log('skip', name, format, '(not in this format)'); await ctx.close(); rmSync(await page.video().path(), { force: true }); continue; }
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      const lead = (Date.now() - t0) / 1000 + 0.3;             // everything before this is the blank page
      await page.waitForTimeout(2600);
      await page.evaluate(() => window.JH_FEED(2)); await page.waitForTimeout(4500);
      await page.evaluate(() => window.JH_FEED(2)); await page.waitForTimeout(6500);   // tail covers the trimmed lead
      const webm = await page.video().path();
      await ctx.close();
      const mp4 = `${VOUT}/${name}--${format}${theme === 'light' ? '-light' : ''}.mp4`;
      // trim the page paint and encode for every player
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(lead), '-i', webm, '-t', '12', '-an',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
      rmSync(webm, { force: true });
      console.log('wrote', mp4.replace(ROOT + '/', '')); n++;
    }
  }
} finally {
  await browser.close();
  srv.stop();
}
console.log(`${n} files`);
