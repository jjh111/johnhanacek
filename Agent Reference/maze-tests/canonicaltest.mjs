import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath() });

const BASE = process.env.BASE || 'http://localhost:1337';

const NEW = { paper: 'rgb(247, 242, 235)', ink: '#26211d', body: '1.1rem', caption: '0.68rem' };
const OLD = {                                              body: '1rem',   caption: '0.62rem' };

// What "historical" means here is the TYPE SCALE — that is the thing the
// canonical move changed across the board, so that is what is shared. The
// PALETTE is not shared and never was: each exploration sets its own ground
// as well as its own ink, written down in the file itself (mu-bloom's warm
// bloom paper; the Tufte direction's #fffff8, which its own spec block names
// three times). Asserting one OLD paper against them failed both pages for
// being what they were designed to be — the same mistake the note below
// already corrected for ink, left standing for the background.
const pages = [
  ['direction-canonical-homepage',   { scale: NEW, paper: NEW.paper, ink: NEW.ink }],
  ['direction-styleguide',           { scale: NEW, paper: NEW.paper, ink: NEW.ink }],
  ['direction-mu-bloom',             { scale: OLD, paper: 'rgb(247, 241, 227)' }],
  ['direction-beta-tufte-mono-kecal',{ scale: OLD, paper: 'rgb(255, 255, 248)' }],
];
const rows = [];
for (const [name, want] of pages) {
  const ctx = await b.newContext({ viewport:{width:1280,height:900} });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const r404 = [];
  p.on('response', res => { if (res.status() >= 400) r404.push(res.url().split('/').pop()); });
  await p.goto(`${BASE}/openprose/canvas-display/brand/${name}.html`, { waitUntil:'load', timeout:30000 });
  await p.waitForTimeout(500);
  const v = await p.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const t = n => cs.getPropertyValue(n).trim();
    return { paper: getComputedStyle(document.body).backgroundColor,
             ink: t('--ink'), body: t('--fs-body'), caption: t('--fs-caption') };
  });
  // Ink is NOT a shared value — the exploration palettes each define their own
  // (rust #221408, mono #111111, …), and neither is the paper. The type scale
  // is shared; the ground each page stands on is asserted per page, so this
  // still catches drift without demanding they all look alike.
  const scaleOk = v.body === want.scale.body && v.caption === want.scale.caption;
  const paperOk = v.paper === want.paper;
  const inkOk   = !want.ink || v.ink === want.ink;
  const ok = scaleOk && paperOk && inkOk && errs.length === 0 && r404.length === 0;
  const expect = want.scale === NEW ? 'should be NEW' : 'should be OLD (historical)';
  rows.push({ name, expect, ...v, verdict: ok ? 'ok' : 'FAIL', errs: errs.length, http4xx: r404,
              why: ok ? '' : [!scaleOk && 'type scale', !paperOk && 'paper', !inkOk && 'ink',
                              errs.length && 'js errors', r404.length && '4xx'].filter(Boolean).join(', ') });
  await ctx.close();
}
rows.forEach(r => console.log(
  `${r.verdict.padEnd(5)} ${r.name.padEnd(34)} ink=${r.ink}  body=${r.body}  cap=${r.caption}  bg=${r.paper}  ${r.why ? '← ' + r.why : ''}${r.http4xx.length?('  4xx:'+r.http4xx):''}`));
const bad = rows.filter(r => r.verdict !== 'ok').length;
console.log(bad ? `\n${bad} FAILED` : '\nall as intended');
await b.close();
process.exit(bad ? 1 : 0);
