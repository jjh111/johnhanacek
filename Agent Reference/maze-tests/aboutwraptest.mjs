// aboutwraptest — index.html's About card: prose wrapped around the portrait's
// ellipse by pretext (scripts/pretext-wrap.js), at every width and in the
// states a first visit can actually be in.
//
// Per state it measures, from the rendered line layer:
//   wrapped    the card says data-wrap="pretext" (or, in the fallback state, does not)
//   words      every word of each paragraph is on a line, in order, once
//   ellipse    no line's box enters the photo's ellipse (reports the closest approach)
//   inside     no line runs outside its paragraph
//   tips       no line sits right of the photo (the sliver between tip and edge)
//   contained  the card holds the photo and the text; the proof strip starts below it
//   overflow   the page does not scroll sideways
// States: 18 widths (phones emulated as touch), one page resized live through
// six widths, the photo held back 2.5 s, the webfonts held back 2.5 s, the
// wrap module failing (float + shape-outside fallback), a landscape phone,
// and the light theme.
//
//   node "Agent Reference/maze-tests/aboutwraptest.mjs"   (exit 1 on any failure)

import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { serveVerified } from '../../scripts/serve-verified.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, '.local/aboutwrap');
mkdirSync(OUT, { recursive: true });
const SHOTS = process.argv.includes('--shots');

const srv = await serveVerified(ROOT);
const BASE = `http://127.0.0.1:${srv.port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath() });

let failures = 0;
const fail = msg => { failures++; console.log(`  ✗ ${msg}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Everything measured in the page, in one pass.
const MEASURE = () => {
    const card = document.querySelector('#about .content-card.about');
    const img = card.querySelector('.about-portrait img');
    const ir = img.getBoundingClientRect();
    const cx = ir.left + ir.width / 2, cy = ir.top + ir.height / 2, rx = ir.width / 2, ry = ir.height / 2;
    const norm = s => s.replace(/\s+/g, ' ').trim();
    const out = { wrapped: card.dataset.wrap === 'pretext', paras: [], clearance: Infinity, tips: 0, outside: 0, lines: 0 };
    let textBottom = 0;
    for (const p of card.querySelectorAll(':scope > p')) {
        const pr = p.getBoundingClientRect();
        const src = p.querySelector('.pretext-source');
        const lines = [...p.querySelectorAll('.pretext-line')].filter(d => d.style.display !== 'none');
        if (!src) {   // not wrapped: the paragraph is ordinary prose
            textBottom = Math.max(textBottom, pr.bottom);
            out.paras.push({ ok: norm(p.textContent).length > 0 });
            continue;
        }
        const got = norm(lines.map(d => [...d.querySelectorAll('[data-text]')].map(r => r.dataset.text).join('')).join(' '));
        out.paras.push({ ok: got === norm(src.textContent), got: got.slice(0, 60), want: norm(src.textContent).slice(0, 60) });
        for (const d of lines) {
            const r = d.getBoundingClientRect();
            if (!r.width) continue;
            out.lines++;
            textBottom = Math.max(textBottom, r.bottom);
            if (r.left < pr.left - 1 || r.right > pr.right + 1) out.outside++;
            if (r.left > cx) out.tips++;
            // Closest horizontal approach of this line to the ellipse across its band.
            const top = Math.max(r.top, cy - ry), bot = Math.min(r.bottom, cy + ry);
            if (top < bot) {
                const minDy = (cy >= top && cy <= bot) ? 0 : Math.min(Math.abs(top - cy), Math.abs(bot - cy));
                const dx = rx * Math.sqrt(Math.max(0, 1 - (minDy / ry) ** 2));
                const gap = r.right <= cx ? (cx - dx) - r.right : r.left - (cx + dx);
                out.clearance = Math.min(out.clearance, gap);
            }
        }
    }
    const cr = card.getBoundingClientRect();
    const strip = document.querySelector('#about .proof-strip');
    out.contained = ir.bottom <= cr.bottom + 0.5 && textBottom <= cr.bottom + 0.5 && (!strip || strip.getBoundingClientRect().top >= cr.bottom - 0.5);
    out.overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    out.photo = Math.round(ir.width);
    out.card = Math.round(cr.width);
    out.textH = Math.round(textBottom - cr.top);
    out.imgH = Math.round(ir.bottom - cr.top);
    return out;
};

function judge(label, m, { expectWrap = true } = {}) {
    const bad = [];
    if (m.wrapped !== expectWrap) bad.push(expectWrap ? 'not wrapped' : 'wrapped when it should have fallen back');
    m.paras.forEach((p, i) => { if (!p.ok) bad.push(`para ${i + 1} words differ ("${p.got}…" vs "${p.want}…")`); });
    if (expectWrap && m.clearance < 6) bad.push(`a line comes within ${m.clearance.toFixed(1)}px of the ellipse`);
    if (m.outside) bad.push(`${m.outside} line(s) outside the paragraph`);
    if (m.tips) bad.push(`${m.tips} line(s) right of the photo`);
    if (!m.contained) bad.push('card does not contain photo + text, or the strip overlaps it');
    if (m.overflow > 0) bad.push(`page scrolls sideways by ${m.overflow}px`);
    const summary = `photo ${m.photo}/${m.card}px · ${m.lines} lines · closest ${m.clearance === Infinity ? '—' : m.clearance.toFixed(0) + 'px'} · text ${m.textH} / photo ${m.imgH}px`;
    if (bad.length) { failures++; console.log(`  ✗ ${label}: ${bad.join('; ')}  [${summary}]`); }
    else console.log(`  ✓ ${label}  [${summary}]`);
}

async function open(w, h, { mobile = w < 768, theme = 'dark', route } = {}) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2, colorScheme: theme });
    if (route) await route(ctx);
    const pg = await ctx.newPage();
    const errors = [];
    pg.on('pageerror', e => errors.push(e.message));
    await pg.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    return { ctx, pg, errors };
}
const settle = async pg => {
    await pg.waitForFunction(() => document.querySelector('#about .content-card.about')?.dataset.wrap === 'pretext', null, { timeout: 15000 }).catch(() => {});
    await pg.evaluate(() => document.fonts.ready);
    await sleep(500);
};
async function shot(pg, name) {
    if (!SHOTS) return;
    const card = await pg.$('#about .content-card.about');
    await card.scrollIntoViewIfNeeded();
    await sleep(200);
    await card.screenshot({ path: resolve(OUT, `${name}.png`) });
}

console.log('widths');
for (const w of [320, 360, 375, 390, 414, 430, 480, 540, 600, 601, 700, 767, 820, 1024, 1025, 1280, 1440, 1920]) {
    const { ctx, pg, errors } = await open(w, 900);
    await settle(pg);
    judge(`${w}px${w < 768 ? ' touch' : ''}`, await pg.evaluate(MEASURE));
    if (errors.length) fail(`${w}px page errors: ${errors.join(' | ')}`);
    await shot(pg, `w${w}`);
    await ctx.close();
}

console.log('\nresized live (one page, no reload)');
{
    const { ctx, pg } = await open(1440, 900, { mobile: false });
    await settle(pg);
    for (const w of [390, 1024, 600, 320, 820, 1440]) {
        await pg.setViewportSize({ width: w, height: 900 });
        await sleep(700);
        judge(`→ ${w}px`, await pg.evaluate(MEASURE));
    }
    await ctx.close();
}

console.log('\nthe photo held back 2.5 s');
{
    const { ctx, pg } = await open(390, 844, {
        route: c => c.route(/headshot/, async r => { await sleep(2500); await r.continue(); }),
    });
    await settle(pg);
    const early = await pg.evaluate(MEASURE);
    judge('before the photo arrives', early);
    await pg.evaluate(() => document.querySelector('#about').scrollIntoView());
    await sleep(3200);
    const late = await pg.evaluate(MEASURE);
    judge('after it arrives', late);
    if (early.lines !== late.lines || early.photo !== late.photo) fail(`layout moved when the photo landed (${early.lines}→${late.lines} lines, ${early.photo}→${late.photo}px)`);
    await ctx.close();
}

console.log('\nthe webfonts held back 2.5 s');
{
    const { ctx, pg } = await open(390, 844, {
        route: c => c.route(/fonts\.gstatic\.com/, async r => { await sleep(2500); await r.continue(); }),
    });
    await pg.waitForFunction(() => document.querySelector('#about .content-card.about')?.dataset.wrap === 'pretext', null, { timeout: 15000 }).catch(() => {});
    judge('on the fallback face', await pg.evaluate(MEASURE));
    await pg.evaluate(() => document.fonts.ready);
    await sleep(800);
    judge('after the webfont lands', await pg.evaluate(MEASURE));
    await ctx.close();
}

console.log('\nthe wrap module fails (fallback)');
for (const w of [390, 1280]) {
    const { ctx, pg } = await open(w, 900, { route: c => c.route(/pretext-wrap\.js/, r => r.fulfill({ status: 404, body: '' })) });
    await sleep(2000);
    judge(`${w}px float + shape-outside`, await pg.evaluate(MEASURE), { expectWrap: false });
    await shot(pg, `fallback-${w}`);
    await ctx.close();
}

console.log('\nlandscape phone, light theme');
{
    const { ctx, pg } = await open(844, 390, { mobile: true });
    await settle(pg);
    judge('844×390 landscape touch', await pg.evaluate(MEASURE));
    await ctx.close();
}
for (const w of [390, 1440]) {
    const { ctx, pg } = await open(w, 900, { theme: 'light' });
    await settle(pg);
    judge(`${w}px light`, await pg.evaluate(MEASURE));
    await shot(pg, `light-${w}`);
    await ctx.close();
}

await browser.close();
srv.stop();
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL GREEN');
process.exit(failures ? 1 : 0);
