// The client wall's balance, measured: the logos scene played in render mode, the tank hidden, the
// frame shot, and each mark's ink read off the pixels: its box, its mass (how much light it puts
// on the screen) and how far each row and the whole block sit from the panel's centre. Equal ink
// reads as equal weight, so the mark that carries more or less than the rest is named, with the
// k (WALL_K in the rig) that would even it.
//   node scripts/reel-wall.mjs [--format=wide,square,vertical] [--script=Assets/x.script.txt] [--png=dir]
// Exits non-zero when a mark's ink is more than 15% off the wall's mean or a row or the block sits
// more than 6 px off centre (a grid's row by its marks' middles: each sits centred in an equal column).
import { chromium } from 'playwright-core';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { serveVerified } from './serve-verified.mjs';
import { FONT_URLS, fontPin } from './font-pin.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const FORMATS = arg('format', 'wide,square,vertical').split(',');
const SCRIPT = arg('script', null), PNG = arg('png', null);
const FONTS = fontPin({ dir: process.env.REEL_FONT_CACHE || join(ROOT, '.local/reel-tests/fonts') });
const MASS_TOL = 0.15, CENTRE_TOL = 6;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless: true });
const srv = await serveVerified(ROOT);
let bad = 0;
try {
  for (const format of FORMATS) {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1920 } });
    await ctx.route(/\.mp4(\?.*)?$/i, r => r.abort());
    await ctx.route(FONT_URLS, FONTS.route);
    const page = await ctx.newPage();
    const q = new URLSearchParams({ render: '1', format });
    if (SCRIPT) q.set('script', relative(join(ROOT, 'Assets'), resolve(SCRIPT)));
    await page.goto(`http://127.0.0.1:${srv.port}/Assets/sizzle-reel-2.html?${q}`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.REEL || document.getElementById('err'), null, { timeout: 60000, polling: 100 });
    const failed = await page.$eval('#err', e => e.textContent).catch(() => null);
    if (failed) throw new Error(failed.slice(0, 300));
    await page.evaluate(() => window.REEL.ready);
    await page.evaluate(() => document.querySelectorAll('video').forEach(v => Object.defineProperty(v, 'currentTime', {
      get() { return this.__ct || 0; }, set(x) { this.__ct = x; this.dispatchEvent(new Event('seeked')); } })));
    // the wall settled: the logos scene's middle, after every mark has landed
    const t = await page.evaluate(async () => {
      const sc = window.REEL.debug.scenes.find(s => s.type === 'logos');
      if (!sc) return null;
      const t = Math.min(sc.end - 0.6, sc.start + 2.9);
      for (let k = 3; k >= 0; k--) await window.REEL.frame(t - k / 60);
      return t;
    });
    if (t == null) { console.log(`${format}: no logos scene`); await ctx.close(); continue; }
    await page.addStyleTag({ content: 'canvas { visibility: hidden !important; }' });
    const shot = await page.locator('#stage').screenshot();
    if (PNG) { mkdirSync(PNG, { recursive: true }); (await import('node:fs')).writeFileSync(join(PNG, `wall-${format}.png`), shot); }
    const r = await page.evaluate(async b64 => {
      const st = document.getElementById('stage'), k = st.getBoundingClientRect(), [W] = window.REEL.size, s = k.width / W;
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
      const px = img.width / W;                                           // shot px per stage px
      const box = el => { const r = el.getBoundingClientRect(); return { x: (r.left - k.left) / s, y: (r.top - k.top) / s, w: r.width / s, h: r.height / s }; };
      const panel = st.querySelector('#scenes .seg.on .panel');
      const P = box(panel), lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      const marks = [...panel.querySelectorAll('.wall .wm')].map(wm => {
        const b = box(wm), pad = 8, x0 = Math.floor((b.x - pad) * px), y0 = Math.floor((b.y - pad) * px);
        const w = Math.ceil((b.w + 2 * pad) * px), h = Math.ceil((b.h + 2 * pad) * px);
        const d = g.getImageData(x0, y0, w, h).data, L = [];
        for (let i = 0; i < d.length; i += 4) L.push(lum(d, i));
        const bg = [...L].sort((a, b) => a - b)[L.length >> 1];          // the glass behind it: the median
        let mass = 0, X0 = 1e9, X1 = -1, Y0 = 1e9, Y1 = -1;
        L.forEach((v, i) => { const e = Math.max(0, v - bg - 12); if (!e) return; mass += e / 255;
          if (e > 20) { const x = i % w, y = (i / w) | 0; X0 = Math.min(X0, x); X1 = Math.max(X1, x); Y0 = Math.min(Y0, y); Y1 = Math.max(Y1, y); } });
        const name = wm.querySelector('[aria-label]')?.getAttribute('aria-label') || wm.textContent.trim();
        return { name, k: +(getComputedStyle(wm).getPropertyValue('--k') || 1), mass: mass / px / px,
          grid: getComputedStyle(wm.closest('ul')).display === 'grid', ink: { x0: x0 / px + X0 / px, x1: x0 / px + X1 / px, y0: y0 / px + Y0 / px, y1: y0 / px + Y1 / px }, ul: wm.closest('ul').offsetTop, mid: wm.closest('li').offsetTop + wm.closest('li').offsetHeight / 2 };
      });
      const heads = [...panel.querySelectorAll('.lm.eyebrow, .lm.grp')].map(e => box(e.querySelector(':scope > .li') || e));
      return { P, marks, top: Math.min(...heads.map(h => h.y)) };
    }, shot.toString('base64'));
    const { P, marks } = r, cx = P.x + P.w / 2, cy = P.y + P.h / 2;
    const gm = Math.exp(marks.reduce((a, m) => a + Math.log(m.mass), 0) / marks.length);
    console.log(`${format}  (t ${t.toFixed(2)} s; panel ${Math.round(P.x)},${Math.round(P.y)} ${Math.round(P.w)}×${Math.round(P.h)}; ink mean ${Math.round(gm)})`);
    for (const m of marks) {
      const off = m.mass / gm - 1, flag = Math.abs(off) > MASS_TOL;
      if (flag) bad++;
      console.log(`  ${flag ? '✗' : ' '} ${m.name.padEnd(16)} ink ${String(Math.round(m.mass)).padStart(5)} (${off >= 0 ? '+' : ''}${(off * 100).toFixed(0)}%)  ${Math.round(m.ink.x1 - m.ink.x0)}×${Math.round(m.ink.y1 - m.ink.y0)}  k ${m.k.toFixed(2)} → ${(m.k * Math.sqrt(gm / m.mass)).toFixed(2)}`);
    }
    // rows: a list's marks whose middles lie within 12 px of the row's first (a taller mark, Nanome's,
    // sits a few px off its neighbours' middles, and a rounded bucket split its row in two)
    const rows = {}, byUl = {};
    marks.forEach(m => (byUl[m.ul] = byUl[m.ul] || []).push(m));
    Object.values(byUl).forEach(list => list.sort((a, b) => a.mid - b.mid).forEach(m => {
      const key = Object.keys(rows).find(k => rows[k][0].ul === m.ul && Math.abs(rows[k][0].mid - m.mid) <= 12);
      (rows[key || m.ul + '|' + m.mid] = rows[key || m.ul + '|' + m.mid] || []).push(m);
    }));
    Object.values(rows).forEach(row => row.sort((a, b) => a.ink.x0 - b.ink.x0));
    for (const row of Object.values(rows)) {
      // a row's ink, end to end, centred; in a grid each mark is centred in an equal column, so the
      // columns' centres (the marks' own middles, averaged) are what sit either side of the middle
      const a = Math.min(...row.map(m => m.ink.x0)), b = Math.max(...row.map(m => m.ink.x1));
      const off = (row[0].grid ? row.reduce((s, m) => s + (m.ink.x0 + m.ink.x1) / 2, 0) / row.length : (a + b) / 2) - cx;
      const gaps = row.slice(1).map((m, i) => Math.round(m.ink.x0 - row[i].ink.x1));
      const flag = Math.abs(off) > CENTRE_TOL; if (flag) bad++;
      console.log(`  ${flag ? '✗' : ' '} row ${row.map(m => m.name.split(/[ .]/)[0]).join(' · ')}: ink ${Math.round(a)}-${Math.round(b)}, ${off >= 0 ? '+' : ''}${Math.round(off)} px from centre${gaps.length ? `, gaps ${gaps.join(' ')}` : ''}`);
    }
    const bot = Math.max(...marks.map(m => m.ink.y1)), boff = (r.top + bot) / 2 - cy, bflag = Math.abs(boff) > CENTRE_TOL;
    if (bflag) bad++;
    console.log(`  ${bflag ? '✗' : ' '} block ${Math.round(r.top)}-${Math.round(bot)}: ${boff >= 0 ? '+' : ''}${Math.round(boff)} px from the panel's middle`);
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.stop();
}
process.exit(bad ? 1 : 0);
