import { webkit, chromium } from 'playwright-core';

// The nav bar must SETTLE at every viewport width. initNavFit() measures the
// bar and toggles .nav-compact; the ResizeObservers watch the halves it
// resizes by toggling, so any width where the two states disagree about
// fitting becomes a feedback loop — the header visibly flickering between UI
// types, forever. Reproduced at 0125985: ~25 class flips per 300ms on
// design.html across 1224–1260px. The fix is the cached needFull + 24px
// hysteresis band in initNavFit; this suite exists so that fix can't be
// silently unpicked. A screenshot cannot catch this — only counting flips can.
//
// Method: per page, sweep the viewport coarsely from wide to narrow and back,
// counting class mutations at each stop after the swap settles. Wherever the
// class CHANGED between coarse stops (a real boundary — compact, hamburger,
// or hysteresis release), re-sweep that interval at 5px steps, since a
// boundary parked exactly on the oscillation width is the whole failure mode.
// Any stop with more than 2 mutations in the window is a loop.

const BASE = process.env.BASE || 'http://127.0.0.1:1337';
const PAGES = ['index.html', 'design.html', 'art.html', 'about.html', 'services.html', 'openprose.html'];
const COARSE = []; for (let w = 1400; w >= 340; w -= 40) COARSE.push(w);
const SETTLE_MS = 600;   // repro showed 25 flips in 300ms — 600ms cannot miss a loop
const MAX_MUTATIONS = 2; // one legitimate toggle, plus one for late font settle

async function sweep(pg, widths) {
  const failures = [];
  const states = [];
  for (const w of widths) {
    await pg.setViewportSize({ width: w, height: 900 });
    await pg.evaluate(() => { window.__navLog.length = 0; });
    await pg.waitForTimeout(SETTLE_MS);
    const log = await pg.evaluate(() => window.__navLog.slice());
    const cls = await pg.evaluate(() => document.getElementById('nav').className);
    states.push({ w, compact: cls.includes('nav-menu') });
    if (log.length > MAX_MUTATIONS) failures.push({ w, flips: log.length, tail: log.slice(0, 6) });
  }
  return { failures, states };
}

// Where the compact class flipped between adjacent coarse stops, walk that
// interval finely — in the same direction, so hysteresis is exercised as a
// user resizing would exercise it.
function boundaries(states) {
  const out = [];
  for (let i = 1; i < states.length; i++) {
    if (states[i].compact !== states[i - 1].compact) {
      const a = Math.min(states[i].w, states[i - 1].w) - 10;
      const b = Math.max(states[i].w, states[i - 1].w) + 10;
      const fine = [];
      if (states[i].w < states[i - 1].w) { for (let w = b; w >= a; w -= 5) fine.push(w); }
      else { for (let w = a; w <= b; w += 5) fine.push(w); }
      out.push(fine);
    }
  }
  return out;
}

async function runEngine(name, launch) {
  const browser = await launch();
  let bad = 0;
  for (const page of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const pg = await ctx.newPage();
    await pg.goto(`${BASE}/${page}`, { waitUntil: 'load' });
    await pg.evaluate(() => {
      window.__navLog = [];
      const nav = document.getElementById('nav');
      new MutationObserver(() => {
        window.__navLog.push({ t: Math.round(performance.now()), cls: nav.className });
        if (window.__navLog.length > 200) window.__navLog.length = 200;
      }).observe(nav, { attributes: true, attributeFilter: ['class'] });
      window.scrollTo(0, 3000); // past the hero, so .visible settles before counting
    });
    await pg.evaluate(() => document.fonts && document.fonts.ready);
    await pg.waitForTimeout(400);

    const down = await sweep(pg, COARSE);
    const up = await sweep(pg, [...COARSE].reverse());
    const failures = [...down.failures, ...up.failures];
    for (const fine of [...boundaries(down.states), ...boundaries(up.states)]) {
      failures.push(...(await sweep(pg, fine)).failures);
    }

    if (failures.length) {
      bad++;
      console.log(`FAIL  [${name}] ${page}`);
      for (const f of failures) console.log(`      ${f.w}px: ${f.flips} class flips  ${JSON.stringify(f.tail)}`);
    } else {
      const bs = [...boundaries(down.states)].map(f => `${Math.min(...f)}–${Math.max(...f)}`).join(', ') || 'none';
      console.log(`ok    [${name}] ${page}  (boundaries swept fine: ${bs})`);
    }
    await ctx.close();
  }
  await browser.close();
  return bad;
}

let bad = 0;
bad += await runEngine('webkit', () => webkit.launch());
if (process.env.CHROMIUM_PATH) {
  bad += await runEngine('chromium', () => chromium.launch({ executablePath: process.env.CHROMIUM_PATH }));
} else {
  console.log('(chromium skipped — set CHROMIUM_PATH to sweep it too)');
}
process.exit(bad ? 1 : 0);
