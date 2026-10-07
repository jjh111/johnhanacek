// swipetest — scripts/swipe-offer.js on the real pages, with real touch input.
//
// Drives CDP Input.dispatchTouchEvent (the same path a phone's finger takes,
// so the engine's own preventDefault'ing listeners run alongside ours) on
// index.html and design.html at 390×844, and asserts:
//   1. two quick upward swipes offer "scroll down" under the last touch point
//   2. tapping it scrolls to the page's content (#about / #intro)
//   3. an untaken offer leaves on its own, and a new stroke dismisses it
//   4. things people draw do not offer: a top-down corridor, a 4-stroke box,
//      a line then a loop, two slow strokes
//   5. a MOUSE never offers (desktop), and nothing throws
// The geometry's false-positive budget lives in swipelab.mjs; this suite proves
// the wiring.
//
//   node "Agent Reference/maze-tests/swipetest.mjs"   (exit 1 on any failure)

import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { serveVerified } from '../../scripts/serve-verified.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, '.local/swipetest');
mkdirSync(OUT, { recursive: true });
const PAGES = [{ file: 'index.html', target: '#about' }, { file: 'design.html', target: '#intro' }];

const srv = await serveVerified(ROOT);
const BASE = `http://127.0.0.1:${srv.port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath() });

let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) failures++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function touchStroke(cdp, pts, { dur = 220, id = 0 } = {}) {
    const step = dur / (pts.length - 1);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0].x, y: pts[0].y, id }] });
    for (let i = 1; i < pts.length; i++) {
        await sleep(step);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pts[i].x, y: pts[i].y, id }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const line = (a, b, n = 14) => Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n }));
const loop = (cx, cy, r) => Array.from({ length: 40 }, (_, i) => { const t = i / 39 * Math.PI * 2.2; return { x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r * 0.6 }; });

const offerState = pg => pg.evaluate(() => {
    const b = document.querySelector('.swipe-offer');
    if (!b) return { exists: false };
    const r = b.getBoundingClientRect();
    return { exists: true, hidden: b.hidden, shown: b.classList.contains('shown'), x: r.left + r.width / 2, y: r.top, w: r.width };
});

// A column where every point of a vertical stroke lands on the drawing canvas
// itself, not the oval, the guide card, or the shape nav.
async function clearColumn(pg, y0, y1) {
    return pg.evaluate(([y0, y1]) => {
        const c = document.getElementById('heroCanvas');
        for (let x = 60; x < document.documentElement.clientWidth - 100; x += 10) {
            let ok = true;
            for (let y = y1; y <= y0 && ok; y += 8) ok = document.elementFromPoint(x, y) === c;
            for (let y = y1; y <= y0 && ok; y += 8) ok = document.elementFromPoint(x + 40, y) === c;
            if (ok) return x;
        }
        return null;
    }, [y0, y1]);
}

for (const { file, target } of PAGES) {
    console.log(`\n${file} — phone, touch`);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on('pageerror', e => errors.push(e.message));
    await pg.goto(`${BASE}/${file}`, { waitUntil: 'domcontentloaded' });
    await pg.waitForFunction(() => window.JHSwipeOffer && window.JHSwipeOffer.offers.length === 1, null, { timeout: 15000 });
    await pg.waitForTimeout(1500);   // let the guide card and engine settle
    // CDP's synthetic touches arrive with cancelable:false, so a page that holds
    // the finger only by preventDefault (design's blueprint) scrolls under it
    // here, where a real phone would not. The engine's tank also sets
    // touch-action:none (index passes untouched); give design's canvas the same
    // so this suite tests the offer, not the emulator.
    await pg.evaluate(() => { document.getElementById('heroCanvas').style.touchAction = 'none'; });
    const cdp = await ctx.newCDPSession(pg);

    const Y0 = 600, Y1 = 380;   // between the oval and the guide card (which takes touch itself, y≈620+ at 390×844)
    const x = await clearColumn(pg, Y0, Y1);
    check(x != null, `found a clear canvas column (x=${x})`);
    if (x == null) { await ctx.close(); continue; }
    const fresh = async () => { await pg.evaluate(() => window.JHSwipeOffer.offers[0].hide()); await sleep(1300); };

    // 1. two quick upward swipes in the same spot
    await touchStroke(cdp, line({ x, y: Y0 }, { x: x + 6, y: Y1 }));
    await sleep(250);
    let s = await offerState(pg);
    check(s.exists && s.hidden, 'one swipe alone does not offer');
    await touchStroke(cdp, line({ x: x + 10, y: Y0 - 10 }, { x: x + 14, y: Y1 + 20 }));
    await sleep(400);
    s = await offerState(pg);
    check(s.exists && !s.hidden && s.shown, 'two quick upward swipes offer "scroll down"');
    const vw = await pg.evaluate(() => document.documentElement.clientWidth);
    const wantX = Math.min(Math.max(x + 14, s.w / 2 + 12), vw - s.w / 2 - 12);
    check(s.exists && Math.abs(s.x - wantX) < 3 && Math.abs(s.y - (Y1 + 20 + 28)) < 3 && s.x + s.w / 2 <= vw, `offer sits under the last touch point, inside the screen (${Math.round(s.x)},${Math.round(s.y)}; want ${Math.round(wantX)}, w ${Math.round(s.w)}, vw ${vw})`);
    await pg.screenshot({ path: resolve(OUT, `${file.replace('.html', '')}-offer.png`) });

    // 2. taking it lands exactly where the page's own "view content" link does
    await pg.tap('.swipe-offer');
    await sleep(2500);
    const viaOffer = await pg.evaluate(() => Math.round(scrollY));
    await pg.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await sleep(400);
    await pg.evaluate(() => document.querySelector('.oval-scroll-btn').click());
    await sleep(2500);
    const viaLink = await pg.evaluate(() => Math.round(scrollY));
    check(viaOffer > 200 && Math.abs(viaOffer - viaLink) <= 2, `tap scrolls to ${target}, same as "view content" (${viaOffer} vs ${viaLink})`);
    s = await offerState(pg);
    check(s.hidden, 'offer is gone after it is taken');

    // 3. leaves on its own; a new stroke dismisses it
    await pg.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await sleep(1300);

    await touchStroke(cdp, line({ x, y: Y0 }, { x, y: Y1 }));
    await sleep(150);
    await touchStroke(cdp, line({ x: x + 30, y: Y0 }, { x: x + 30, y: Y1 }));
    await sleep(300);
    const hit = await pg.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? (e.id || e.className || e.tagName) : null; }, [x, 500]);
    check(!(await offerState(pg)).hidden, `side-by-side pair offers again (under the finger: ${hit}; ${JSON.stringify(await pg.evaluate(() => window.JHSwipeOffer.offers[0].stats))})`);
    await touchStroke(cdp, [{ x: x + 20, y: 500 }, { x: x + 21, y: 501 }, { x: x + 21, y: 502 }], { dur: 40 });
    await sleep(200);
    check((await offerState(pg)).hidden, 'a new stroke (a tap) dismisses the offer');
    await sleep(1300);
    await touchStroke(cdp, line({ x, y: Y0 }, { x, y: Y1 }));
    await sleep(150);
    await touchStroke(cdp, line({ x: x + 5, y: Y0 }, { x: x + 5, y: Y1 }));
    await sleep(5400);
    check((await offerState(pg)).hidden, 'an untaken offer leaves on its own (5 s)');
    await sleep(1300);

    // 4. things people draw
    const none = async (label, strokes) => {
        await fresh();
        for (const [pts, opt] of strokes) { await touchStroke(cdp, pts, opt); await sleep(opt?.gap ?? 250); }
        await sleep(300);
        check((await offerState(pg)).hidden, `no offer: ${label}`);
    };
    await none('top-down corridor', [[line({ x, y: Y1 }, { x, y: Y0 })], [line({ x: x + 40, y: Y1 }, { x: x + 40, y: Y0 })]]);
    await none('box from 4 strokes', [
        [line({ x, y: 400 }, { x: x + 80, y: 400 })], [line({ x: x + 80, y: 400 }, { x: x + 80, y: 520 })],
        [line({ x: x + 80, y: 520 }, { x, y: 520 })], [line({ x, y: 520 }, { x, y: 400 })]]);
    await none('upward line, then a loop', [[line({ x, y: Y0 }, { x, y: Y1 })], [loop(x + 30, 480, 40)]]);
    await none('two upward lines 2 s apart', [[line({ x, y: Y0 }, { x, y: Y1 }), { gap: 2000 }], [line({ x: x + 30, y: Y0 }, { x: x + 30, y: Y1 })]]);
    await none('upward line, then a short parallel tick', [[line({ x, y: Y0 }, { x, y: Y1 })], [line({ x: x + 30, y: Y0 }, { x: x + 30, y: Y0 - 60 })]]);

    // 5. the guide card is its own way down: no CTA, and a swipe ON it scrolls
    // On a fresh load: the strokes above have walked the guide to its end.
    await pg.reload({ waitUntil: 'domcontentloaded' });
    await pg.waitForFunction(() => window.JHSwipeOffer && window.JHSwipeOffer.offers.length === 1, null, { timeout: 15000 });
    await pg.evaluate(() => { document.getElementById('heroCanvas').style.touchAction = 'none'; });
    await sleep(1500);
    const card = await pg.evaluate(() => {
        const g = document.querySelector('.canvas-guide');
        const r = g.getBoundingClientRect();
        return { cta: !!g.querySelector('.guide-cta'), pe: getComputedStyle(g).pointerEvents + (g.classList.contains('hidden') ? ' (hidden)' : ''), x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height };
    });
    check(!card.cta, 'the guide card carries no "tap or swipe" button');
    check(card.pe === 'auto', `the guide card takes touch (pointer-events: ${card.pe})`);
    await touchStroke(cdp, line({ x: card.x, y: card.y + card.h / 3 }, { x: card.x, y: card.y - 160 }), { dur: 180 });
    await sleep(900);
    const y = await pg.evaluate(() => scrollY);
    check(y > 60, `a swipe on the guide card scrolls the page (scrollY ${Math.round(y)})`);

    const st = await pg.evaluate(() => window.JHSwipeOffer.offers[0].stats);
    console.log(`  · ${st.strokes} strokes seen, ${st.offers} offers, ${st.taken} taken`);
    check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
    await ctx.close();

    console.log(`${file} — desktop, mouse`);
    const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const dp = await dctx.newPage();
    await dp.goto(`${BASE}/${file}`, { waitUntil: 'domcontentloaded' });
    await dp.waitForFunction(() => window.JHSwipeOffer && window.JHSwipeOffer.offers.length === 1, null, { timeout: 15000 });
    await dp.waitForTimeout(1200);
    for (const dx of [0, 20]) {
        await dp.mouse.move(300 + dx, 800); await dp.mouse.down();
        for (let i = 1; i <= 14; i++) await dp.mouse.move(300 + dx, 800 - i * 20);
        await dp.mouse.up(); await sleep(200);
    }
    await sleep(300);
    check((await offerState(dp)).hidden, 'two upward mouse drags never offer');
    await dctx.close();
}

await browser.close();
srv.stop();
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL GREEN');
process.exit(failures ? 1 : 0);
