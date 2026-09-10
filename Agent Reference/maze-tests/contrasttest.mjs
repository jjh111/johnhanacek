/**
 * contrastsweep.mjs — WCAG AA text-contrast sweep, both themes, both paths.
 *
 * Two paths matter and they fail differently:
 *   load   — open the page with the theme already set (localStorage)
 *   toggle — open in the other theme, then CLICK the real .jh-theme-btn
 *
 * The toggle path is the one that caught the stuck-transition bug: an element
 * with a transition on `color` keeps the previous theme's resolved color when
 * data-theme flips, so it strands in the other palette's ink.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:1337';
const PAGES = (process.env.PAGES || 'index,design,art,about,services,search,writing,playground,nanome2,404').split(',');

const SWEEP = () => {
  const L = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const Y = (r, g, b) => 0.2126 * L(r) + 0.7152 * L(g) + 0.0722 * L(b);
  const P = s => { const m = (s || '').match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const p = m[1].split(',').map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const B = el => { let n = el;
    while (n && n !== document.documentElement) { const c = P(getComputedStyle(n).backgroundColor); if (c && c.a > 0.5) return c; n = n.parentElement; }
    const c = P(getComputedStyle(document.body).backgroundColor); return c && c.a > 0.5 ? c : { r: 255, g: 255, b: 255, a: 1 }; };
  const out = [];
  document.querySelectorAll('body *').forEach(el => {
    if (el.children.length && ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return;
    const t = el.textContent.trim(); if (!t || t.length < 2) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.15) return;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
    const f = P(cs.color); if (!f) return;
    const b = B(el); const a = f.a == null ? 1 : f.a;
    const cr = f.r * a + b.r * (1 - a), cg = f.g * a + b.g * (1 - a), cb = f.b * a + b.b * (1 - a);
    const l1 = Y(cr, cg, cb), l2 = Y(b.r, b.g, b.b);
    const R = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700;
    const need = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5;
    if (R < need) out.push({ cls: (el.className || '').toString().slice(0, 34) || el.tagName.toLowerCase(),
                             txt: t.slice(0, 30), ratio: +R.toFixed(2), need, color: cs.color });
  });
  const seen = new Set();
  return out.filter(o => { const k = o.cls + o.ratio; if (seen.has(k)) return false; seen.add(k); return true; })
            .sort((a, b) => a.ratio - b.ratio);
};

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
// NAVIGATION: domcontentloaded, not load.
// 'load' waits for every third-party iframe to finish, and art.html frames
// nine of them (YouTube x6, Vimeo, Sketchfab, jhana.zone) while playground
// frames a boardful. Under the contention of a full sweep that blew the 30s
// budget on a different page every run — art.html one time, playground.html
// the next — so the one guard CLAUDE.md tells you to run after any colour,
// weight or size change was failing for reasons that had nothing to do with
// colour. Measured alone, playground.html reaches 'load' in 12.4s and
// 'domcontentloaded' in 226ms.
// Nothing is lost: SWEEP reads computed styles, which need the stylesheet and
// the inline theme bootstrap, both settled at DOMContentLoaded, and every
// navigation here is already followed by an explicit 1400-1600ms settle.

const results = [];
let total = 0;

for (const name of PAGES) {
  const url = `${BASE}/${name}.html`;
  for (const theme of ['dark', 'light']) {
    // ── path 1: loaded straight into the theme ──────────────────────
    let page = await b.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.evaluate(t => { try { localStorage.setItem('jh-theme', t); } catch (e) {} }, theme);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);
    const loadFails = await page.evaluate(SWEEP);
    await page.close();

    // ── path 2: loaded in the OTHER theme, then the real toggle clicked ──
    const other = theme === 'light' ? 'dark' : 'light';
    page = await b.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.evaluate(t => { try { localStorage.setItem('jh-theme', t); } catch (e) {} }, other);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1400);
    const hasBtn = await page.evaluate(() => !!document.querySelector('.jh-theme-btn'));
    let toggleFails = [];
    if (hasBtn) {
      await page.evaluate(() => document.querySelector('.jh-theme-btn').click());
      await page.waitForTimeout(1400);
      toggleFails = await page.evaluate(SWEEP);
    }
    await page.close();

    total += loadFails.length + toggleFails.length;
    results.push({ page: name + '.html', theme, hasToggle: hasBtn,
                   load: loadFails.length, toggle: toggleFails.length,
                   worstLoad: loadFails.slice(0, 4), worstToggle: toggleFails.slice(0, 4) });
  }
}

await b.close();

console.log('\n  PAGE                THEME   LOADED   TOGGLED');
console.log('  ' + '─'.repeat(48));
for (const r of results) {
  const f = n => (n === 0 ? '   ok' : String(n).padStart(5));
  console.log(`  ${r.page.padEnd(18)} ${r.theme.padEnd(7)} ${f(r.load)}    ${r.hasToggle ? f(r.toggle) : '    –'}`);
}
console.log('  ' + '─'.repeat(48));
console.log(`  TOTAL AA FAILURES: ${total}\n`);

const bad = results.filter(r => r.load || r.toggle);
if (bad.length) {
  console.log('  DETAIL');
  for (const r of bad) {
    for (const [via, list] of [['loaded', r.worstLoad], ['toggled', r.worstToggle]]) {
      for (const f of list) console.log(`   ${r.page} ${r.theme}/${via}  ${String(f.ratio).padStart(5)}:1 (needs ${f.need})  .${f.cls}  ${f.color}  "${f.txt}"`);
    }
  }
  console.log('');
}
process.exit(total === 0 ? 0 : 1);
