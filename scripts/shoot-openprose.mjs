// The OpenProse finalists as stills for the sizzle reel (Assets/openprose-finalists/*.webp).
//
//   node scripts/shoot-openprose.mjs                  → every shot below
//   node scripts/shoot-openprose.mjs --only=a,b       → those shots, by name
//   KECAL_DIR=<dir> node scripts/shoot-openprose.mjs  → Kecal's web fonts from a folder
//
// The finalists are the canonical set that openprose.html's Distillation (#finalists) names
// and embeds: the logo collection, the styleguide that pins the defaults, and the homepage
// concept that lands it. Each page is served from openprose/canvas-display/brand/ and shot
// at 1440×810 CSS px (1920×1080 pixels), then saved 1280×720 webp. Dark is the page's own:
// the homepage follows the device, the styleguide its Surface switch (`sg-theme`).
//
// The pages' fixed corner chrome (the styleguide's Surface switch, the homepage's disc, mode
// toggle and scroll bar) is left out: the reel's page chip sits on that corner, and a sliver
// of it peeking out from under the chip read as a glitch.
//
// Kecal, the accent face, loads from jsDelivr. Where that host is refused (a cloud session),
// KECAL_DIR answers its requests from local copies of the OFL web fonts
// (Kecal-<Weight>-web.woff2, from github.com/FungiType/Kecal export/Web). Never commit them.
//
// Each shot prints its heading's ink as fractions of the frame (left, top, right, bottom): the
// reel's square frame shows 47% of a still's width, and a beat's `focus` x is chosen from it so
// the heading's left edge stays inside (visible from 0.531 × focus to that + 0.469, less the push).
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveVerified } from './serve-verified.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'Assets/openprose-finalists');
const TMP = resolve(ROOT, '.local/shoot-openprose');
const flag = (name, dflt) => (process.argv.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1] || dflt;
const ONLY = flag('only', '').split(',').filter(Boolean);

// page: the brand page's name; y, or sel/text: where to scroll (dy: then this much further);
// measure: the heading whose ink is printed.
const SHOTS = [
  { name: 'logo-collection', page: 'logo-collection', measure: 'h1' },
  { name: 'logo-style-family', page: 'logo-collection', text: 'Family · Style', dy: -50, measure: 'img[alt="OpenProse Style mark on light"]' },
  { name: 'styleguide-cover', page: 'direction-styleguide', measure: '.sg-cover-title' },
  { name: 'styleguide-cover-dark', page: 'direction-styleguide', dark: true, measure: '.sg-cover-title' },
  { name: 'styleguide-typography-dark', page: 'direction-styleguide', sel: '#typography', dy: -30, dark: true, measure: '#typography h2' },
  { name: 'homepage-hero', page: 'direction-canonical-homepage' },
  { name: 'homepage-responsibilities', page: 'direction-canonical-homepage', sel: '#paradigms', dy: -50, measure: '#paradigms h2' },
  { name: 'homepage-responsibilities-dark', page: 'direction-canonical-homepage', sel: '#paradigms', dy: -50, dark: true, measure: '#paradigms h2' },
  { name: 'homepage-runtime', page: 'direction-canonical-homepage', sel: '#runtime', dy: -50, measure: '#runtime h2' },
  { name: 'homepage-runtime-dark', page: 'direction-canonical-homepage', sel: '#runtime', dy: -50, dark: true, measure: '#runtime h2' },
  { name: 'homepage-get-started-dark', page: 'direction-canonical-homepage', sel: '#cta', dy: -30, dark: true, measure: '#cta h2' },
].filter(s => !ONLY.length || ONLY.includes(s.name));
if (!SHOTS.length) throw new Error(`no shot named ${ONLY.join(', ')}`);

const KECAL = process.env.KECAL_DIR;
const HIDE = '.sg-surface-switch, .brand-logo, .mode-toggle, .scroll-progress { display: none !important; }';

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });
const srv = await serveVerified(ROOT);
// Google Fonts through the proxy where outbound HTTPS needs one; the local server stays direct.
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  args: proxy ? [`--proxy-server=https=${new URL(proxy).host}`] : [] });
try {
  for (const s of SHOTS) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3, colorScheme: s.dark ? 'dark' : 'light' });
    await ctx.addInitScript(d => { try { localStorage.setItem('sg-theme', d ? 'dark' : 'light'); localStorage.setItem('openprose-canonical-mode', d ? 'dark' : 'light'); } catch { /* storage refused */ } }, !!s.dark);
    if (KECAL) await ctx.route(/cdn\.jsdelivr\.net\/gh\/FungiType\/Kecal@main\/export\/Web\/(Kecal-[A-Za-z]+-web\.woff2)/, route => {
      const file = route.request().url().match(/(Kecal-[A-Za-z]+-web\.woff2)/)[1];
      route.fulfill({ status: 200, contentType: 'font/woff2', body: readFileSync(join(KECAL, file)), headers: { 'access-control-allow-origin': '*' } });
    });
    const page = await ctx.newPage();
    const failed = [];
    page.on('response', r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
    await page.goto(`http://127.0.0.1:${srv.port}/openprose/canvas-display/brand/${s.page}.html`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1500);
    const found = await page.evaluate(s => {
      let y = s.y || 0;
      if (s.sel || s.text) {
        const el = s.sel ? document.querySelector(s.sel)
          : [...document.querySelectorAll('h1, h2, h3, div, span, p')].find(e => e.textContent.trim().replace(/\s+/g, ' ').startsWith(s.text));
        if (!el) return false;
        y = el.getBoundingClientRect().top + window.scrollY + (s.dy || 0);
      }
      window.scrollTo(0, y);                     // the pages scroll smoothly: the wait below lets it land
      return true;
    }, s);
    if (!found) throw new Error(`${s.name}: nothing matches ${s.sel || s.text} on ${s.page}`);
    await page.addStyleTag({ content: HIDE });
    await page.waitForTimeout(1500);
    const ink = s.measure ? await page.evaluate(sel => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const range = document.createRange(); range.selectNodeContents(el);       // the ink, not the block
      const r = el.tagName === 'IMG' ? el.getBoundingClientRect() : range.getBoundingClientRect();
      return [r.left / innerWidth, r.top / innerHeight, r.right / innerWidth, r.bottom / innerHeight].map(v => +v.toFixed(3));
    }, s.measure) : null;
    const png = join(TMP, `${s.name}.png`), webp = join(OUT, `${s.name}.webp`);
    await page.screenshot({ path: png });
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-vf', 'scale=1280:720:flags=lanczos', '-c:v', 'libwebp', '-quality', '82', '-compression_level', '6', webp]);
    console.log(`${s.name.padEnd(32)} ${ink ? 'ink ' + ink.join(' ') : ''}${failed.length ? '  FAILED: ' + failed.join(' | ') : ''}`);
    if (failed.length && !KECAL && failed.some(f => /Kecal/.test(f))) console.log('  Kecal did not load: set KECAL_DIR (see the header)');
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.stop();
  rmSync(TMP, { recursive: true, force: true });
}
