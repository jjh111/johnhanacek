/**
 * latchtest.mjs — the blueprint canvas must never latch itself to 0×0.
 *
 * `resizeCanvas()` used to write the measured rect back as an inline
 * width/height. That inline value overrides shared.css's
 * `#heroCanvas { width:100%; height:100% }`, so ONE zero measurement — page
 * laid out while hidden, backgrounded, or mid-transition — pinned the canvas at
 * 0×0 permanently: every later resize re-measured its own 0 and rewrote 0. The
 * blueprint layer (grid, strokes, walls, labels) went invisible while the fish
 * layer, which sizes itself independently, kept rendering. Only a reload fixed it.
 *
 * This reproduces that condition and asserts the canvas comes back.
 */
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await page.goto('http://127.0.0.1:1337/design.html', { waitUntil: 'load' });
await page.waitForTimeout(1000);

const r = await page.evaluate(async () => {
  const el = document.getElementById('heroCanvas');
  const wait = ms => new Promise(r2 => setTimeout(r2, ms));
  const snap = () => ({
    rect: Math.round(el.getBoundingClientRect().width),
    backing: el.width,
    inline: el.getAttribute('style') || null
  });

  const onLoad = snap();

  // Force the failure condition: hero collapsed to zero, then a resize —
  // exactly what a hidden/backgrounded first layout produces.
  const hero = el.parentElement;
  const prevDisplay = hero.style.display;
  hero.style.display = 'none';
  window.dispatchEvent(new Event('resize'));
  await wait(50);
  const whileCollapsed = snap();

  // Restore layout and let the normal resize path run.
  hero.style.display = prevDisplay;
  window.dispatchEvent(new Event('resize'));
  await wait(100);
  const afterRestore = snap();

  return { onLoad, whileCollapsed, afterRestore };
});

const pass =
  r.onLoad.backing > 0 &&
  r.afterRestore.backing > 0 &&
  r.afterRestore.rect > 0 &&
  !r.afterRestore.inline;   // must never pin an inline size

console.log(JSON.stringify({
  ...r,
  errs,
  note: 'afterRestore.backing must be > 0 and inline must be null — under the old code it stayed 0 with inline "width:0px;height:0px"',
  ALL_PASS: pass && !errs.length
}, null, 1));
await b.close();
process.exit(pass && !errs.length ? 0 : 1);
