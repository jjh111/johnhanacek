import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });

const NEW = { paper: 'rgb(247, 242, 235)', ink: '#26211d', body: '1.1rem', caption: '0.68rem' };
const OLD = { paper: 'rgb(245, 240, 232)', ink: '#2a2520', body: '1rem',   caption: '0.62rem' };

const pages = [
  ['direction-canonical-homepage', 'should be NEW'],
  ['direction-styleguide',         'should be NEW'],
  ['direction-mu-bloom',           'should be OLD (historical)'],
  ['direction-beta-tufte-mono-kecal','should be OLD (historical)'],
];
const rows = [];
for (const [name, expect] of pages) {
  const ctx = await b.newContext({ viewport:{width:1280,height:900} });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const r404 = [];
  p.on('response', res => { if (res.status() >= 400) r404.push(res.url().split('/').pop()); });
  await p.goto(`http://localhost:1337/openprose/canvas-display/brand/${name}.html`, { waitUntil:'load', timeout:30000 });
  await p.waitForTimeout(500);
  const v = await p.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const t = n => cs.getPropertyValue(n).trim();
    return { paper: getComputedStyle(document.body).backgroundColor,
             ink: t('--ink'), body: t('--fs-body'), caption: t('--fs-caption') };
  });
  // Ink is NOT a shared value — the exploration palettes each define their own
  // (rust #221408, mono #111111, …). Only the type scale and the paper moved,
  // so those are what "unchanged" is measured against.
  const isNew = v.body === NEW.body && v.caption === NEW.caption && v.paper === NEW.paper && v.ink === NEW.ink;
  const isOld = v.body === OLD.body && v.caption === OLD.caption && v.paper === OLD.paper;
  const want = expect.includes('NEW');
  const ok = (want ? isNew : isOld) && errs.length === 0 && r404.length === 0;
  rows.push({ name, expect, ...v, verdict: ok ? 'ok' : 'FAIL', errs: errs.length, http4xx: r404 });
  await ctx.close();
}
rows.forEach(r => console.log(
  `${r.verdict.padEnd(5)} ${r.name.padEnd(34)} ink=${r.ink}  body=${r.body}  cap=${r.caption}  bg=${r.paper}  ${r.http4xx.length?('4xx:'+r.http4xx):''}`));
const bad = rows.filter(r => r.verdict !== 'ok').length;
console.log(bad ? `\n${bad} FAILED` : '\nall as intended');
await b.close();
process.exit(bad ? 1 : 0);
