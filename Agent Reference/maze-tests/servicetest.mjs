// servicetest.mjs — the services tab contract (v2.5 "The Funnel", re-cut as tabs).
//
// State lives on <html data-track>, written by JS only (the anchor set never
// changes; content forks, anchors don't):
//   (absent)  JS off, or a crawler — the whole page and NO tab bar. A control
//             that cannot switch is worse than no control; never the reverse.
//   coaching  coaching tab active: the design track is display:none — real
//             hiding, assistive tech reads one track.
//   design    the bare-load default (John's ruling 2026-09-10). Mirror.
//   both      ?track=both — the hidden show-everything escape. No tab
//             selected; nothing in the UI links to it.
// Entry contract: #coaching, #design, ?track=coaching|design, legacy
// #design-services, and shared deep links (#testimonials, #fit, #book,
// #endorsements) land correctly; no anchor resolves to nothing.
// Sticky contract: once scrolled past, the bar pins directly under #nav
// (40px + env(safe-area-inset-top)) and stays pinned through the content.
//
// Env: BASE (default http://127.0.0.1:4571), CHROMIUM_PATH (optional).
import { chromium } from 'playwright-core';

const BASE = process.env.BASE || 'http://127.0.0.1:4571';
const CHROMIUM = process.env.CHROMIUM_PATH || chromium.executablePath();
const PAGE = BASE + '/services.html';
const MEASURE = process.argv.includes('--measure');
const SWEEP_WIDTHS = [390, 768, 1440];

const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true });
const fails = [];
const fail = (what, detail = '') => { fails.push(what + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + what + (detail ? ' — ' + detail : '')); };
const ok = (what) => console.log('  ok   ' + what);
const section = (t) => console.log('\n— ' + t);

// Who vouches for which track. Untagged voices serve both tabs.
const VOUCH = {
  benS: 'Ben S', sheila: 'Sheila Zipfel', tommy: 'Tommy Kronmark', dan: 'Dan Barrett',
  inga: 'Inga Petryaevskaya', hurriyet: 'Dr. Hurriyet Ok', benReed: 'Ben Reed',
};
const EXPECT_VOUCH = {
  coaching: { benS: true, sheila: false, tommy: false, dan: false, inga: true, hurriyet: true, benReed: true },
  design:   { benS: false, sheila: true,  tommy: true,  dan: true,  inga: true, hurriyet: true, benReed: true },
};

const SNAP = (VOUCH) => {
  const vis = el => !!el && el.getClientRects().length > 0;
  const shown = el => !!el && getComputedStyle(el).display !== 'none';
  const c = document.getElementById('coaching'), d = document.getElementById('design');
  const tabOf = t => document.querySelector('.track-tab[data-tab="' + t + '"]');
  const vouchers = {};
  for (const [k, name] of Object.entries(VOUCH)) {
    const card = [...document.querySelectorAll('#testimonials .endorsement')].find(x => x.textContent.includes(name));
    vouchers[k] = !!card && vis(card);
  }
  const tabState = t => {
    const el = tabOf(t);
    return {
      vis: vis(el),
      sel: !!el && el.getAttribute('aria-selected') === 'true',
      full: !!el && shown(el.querySelector('.track-tab-full')),
      short: !!el && shown(el.querySelector('.track-tab-short')),
    };
  };
  return {
    root: document.documentElement.getAttribute('data-track'),
    hash: location.hash,
    bar: { vis: vis(document.querySelector('.track-tabs')) },
    coaching: { section: vis(c), body: vis(document.getElementById('coaching-body')) },
    design: { section: vis(d), body: vis(document.getElementById('design-body')) },
    tabs: { coaching: tabState('coaching'), design: tabState('design') },
    tail: {
      testimonials: vis(document.getElementById('testimonials')),
      fit: vis(document.getElementById('fit')),
      book: vis(document.getElementById('book')),
    },
    vouchers,
    ids: (() => { const seen = new Set(), dup = []; document.querySelectorAll('[id]').forEach(e => { if (seen.has(e.id)) dup.push(e.id); seen.add(e.id); }); return dup; })(),
    hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
};

async function open(path = '', { js = true, theme = 'dark', width = 1280, settle = 800 } = {}) {
  const ctx = await browser.newContext({ javaScriptEnabled: js, colorScheme: theme, viewport: { width, height: 920 } });
  if (theme === 'light') await ctx.addInitScript(() => { try { localStorage.setItem('jh-theme', 'light'); } catch (e) {} });
  const pg = await ctx.newPage();
  await pg.goto(PAGE + path, { waitUntil: 'load' }).catch(async () => {
    // one retry — a busy machine can starve the 30s load window once
    await pg.goto(PAGE + path, { waitUntil: 'load', timeout: 60000 });
  });
  await pg.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await pg.waitForTimeout(settle);
  return { ctx, pg };
}

// ── expected-shape helpers ──────────────────────────────────────────────
function expectTrack(s, track, label, withVouch = true) {
  const other = track === 'coaching' ? 'design' : 'coaching';
  const bad = [];
  if (s.root !== track) bad.push('root=' + s.root);
  if (!s.bar.vis) bad.push('tab bar hidden');
  if (!s[track].section || !s[track].body) bad.push(track + ' not visible');
  if (s[other].section) bad.push(other + ' track visible (must be display:none)');
  if (!s.tabs[track].sel) bad.push(track + ' tab not selected');
  if (s.tabs[other].sel) bad.push(other + ' tab selected');
  if (!s.tabs[track].vis || !s.tabs[other].vis) bad.push('a tab control hidden');
  if (!s.tail.testimonials || !s.tail.fit || !s.tail.book) bad.push('a tail section hidden');
  if (withVouch) for (const [k, want] of Object.entries(EXPECT_VOUCH[track])) if (s.vouchers[k] !== want) bad.push('voucher ' + k + '=' + s.vouchers[k] + ' want ' + want);
  bad.length ? fail(label, bad.join('; ')) : ok(label);
}
function expectBoth(s, label) {
  const bad = [];
  if (s.root !== 'both') bad.push('root=' + s.root);
  if (!s.coaching.body || !s.design.body) bad.push('a track hidden in both-state');
  if (s.tabs.coaching.sel || s.tabs.design.sel) bad.push('a tab selected in both-state');
  if (!s.tail.testimonials || !s.tail.fit || !s.tail.book) bad.push('a tail section hidden');
  for (const k of Object.keys(VOUCH)) if (!s.vouchers[k]) bad.push('voucher ' + k + ' hidden');
  bad.length ? fail(label, bad.join('; ')) : ok(label);
}

if (!MEASURE) {

section('entry URLs land in the right state');
{
  let { ctx, pg } = await open('');
  expectTrack(await pg.evaluate(SNAP, VOUCH), 'design', 'bare services.html → design (the default tab), bar visible');
  await ctx.close();

  ({ ctx, pg } = await open('#coaching'));
  let s = await pg.evaluate(SNAP, VOUCH);
  expectTrack(s, 'coaching', '#coaching → coaching selected');
  if (s.hash !== '#coaching') fail('#coaching hash preserved', s.hash);
  await ctx.close();

  ({ ctx, pg } = await open('#design'));
  s = await pg.evaluate(SNAP, VOUCH);
  expectTrack(s, 'design', '#design → design selected');
  if (s.hash !== '#design') fail('#design hash preserved', s.hash);
  await ctx.close();

  ({ ctx, pg } = await open('#design-services'));
  s = await pg.evaluate(SNAP, VOUCH);
  expectTrack(s, 'design', 'legacy #design-services → design selected');
  if (s.hash !== '#design') fail('legacy hash rewritten to #design', s.hash);
  await ctx.close();

  for (const [q, want] of [['?track=coaching', 'coaching'], ['?track=design', 'design']]) {
    ({ ctx, pg } = await open(q));
    expectTrack(await pg.evaluate(SNAP, VOUCH), want, q + ' → ' + want + ' selected');
    await ctx.close();
  }
  ({ ctx, pg } = await open('?track=both'));
  expectBoth(await pg.evaluate(SNAP, VOUCH), '?track=both → hidden show-everything escape');
  await ctx.close();
  ({ ctx, pg } = await open('?track=nonsense'));
  expectTrack(await pg.evaluate(SNAP, VOUCH), 'design', '?track=nonsense → the default tab (unknown cannot choose)');
  await ctx.close();
}

section('no anchor resolves to nothing');
{
  for (const h of ['#intro', '#proof', '#top']) {
    const { ctx, pg } = await open(h);
    const vis = await pg.evaluate(a => { const el = document.querySelector(a); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }, h);
    vis ? ok(`${h} visible on a bare load`) : fail(`${h} resolves to nothing (bare)`);
    await ctx.close();
  }
  for (const h of ['#testimonials', '#fit', '#book']) {
    const { ctx, pg } = await open(h);
    const s = await pg.evaluate(SNAP, VOUCH);
    const at = await pg.evaluate(a => { const r = document.querySelector(a).getBoundingClientRect(); return Math.abs(r.top) < 300; }, h);
    if (s.root !== 'design') fail(`${h} changed the default track (root=${s.root})`);
    else if (!at) fail(`${h} did not scroll to the section`);
    else ok(`${h} lands on the section (default tab)`);
    await ctx.close();
  }
  let { ctx, pg } = await open('#endorsements');
  let s = await pg.evaluate(SNAP, VOUCH);
  if (s.hash !== '#testimonials') fail('#endorsements rewritten to #testimonials', s.hash);
  const at = await pg.evaluate(() => Math.abs(document.getElementById('testimonials').getBoundingClientRect().top) < 300);
  if (!at) fail('#endorsements did not land on the wall');
  else ok('#endorsements lands on the wall (default tab)');
  await ctx.close();

  for (const h of ['#coaching', '#design']) {
    ({ ctx, pg } = await open(h));
    const landed = await pg.evaluate(a => Math.abs(document.querySelector(a).getBoundingClientRect().top) < 300, h);
    landed ? ok(`${h} lands on the track head`) : fail(`${h} did not land on the track head`);
    await ctx.close();
  }
}

section('JS off → the whole page, and no dead control');
{
  const { ctx, pg } = await open('', { js: false });
  const s = await pg.evaluate(SNAP, VOUCH);
  if (s.root !== null) fail('JS off: root attribute present', String(s.root));
  if (s.bar.vis) fail('JS off: tab bar visible (a control that cannot switch)');
  if (!s.coaching.body || !s.design.body) fail('JS off: a track body closed');
  if (!s.tail.testimonials || !s.tail.fit || !s.tail.book) fail('JS off: tail hidden');
  if (!s.hscroll && !s.bar.vis && s.coaching.body && s.design.body) ok('JS off shows all content, no bar');
  await ctx.close();
  const { ctx: c2, pg: p2 } = await open('#coaching', { js: false });
  const native = await p2.evaluate(() => Math.abs(document.getElementById('coaching').getBoundingClientRect().top) < 300);
  native ? ok('JS off: #coaching native fragment jump works') : fail('JS off: #coaching native jump broken');
  await c2.close();
}

section('the tabs are load-bearing');
{
  const { ctx, pg } = await open('');
  await pg.click('.track-tab[data-tab="coaching"]');
  await pg.waitForTimeout(500);
  let s = await pg.evaluate(SNAP, VOUCH);
  expectTrack(s, 'coaching', 'clicking the coaching tab selects it');
  if (s.hash !== '#coaching') fail('tab click wrote the URL', s.hash);

  await pg.goBack(); await pg.waitForTimeout(500);
  s = await pg.evaluate(SNAP, VOUCH);
  if (s.root !== 'design') fail('back button did not restore the default tab', s.root);
  else ok('back button restores the previous tab');
  await ctx.close();

  // keyboard: arrows move selection with wrapping
  const { ctx: c2, pg: p2 } = await open('');
  await p2.focus('.track-tab[data-tab="design"]');
  await p2.keyboard.press('ArrowRight');
  await p2.waitForTimeout(400);
  s = await p2.evaluate(SNAP, VOUCH);
  expectTrack(s, 'coaching', 'ArrowRight wraps the selection to coaching');
  const focus = await p2.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-tab'));
  if (focus !== 'coaching') fail('ArrowRight moved selection but not focus', String(focus));
  await c2.close();

  // the TOC switches tracks
  const { ctx: c3, pg: p3 } = await open('');
  await p3.click('.nav-right a[href="#coaching"]');
  await p3.waitForTimeout(600);
  s = await p3.evaluate(SNAP, VOUCH);
  expectTrack(s, 'coaching', 'TOC deep link switches tracks (never hides them)');
  await c3.close();

  // a tab narrows the hidden both-state
  const { ctx: c4, pg: p4 } = await open('?track=both');
  await p4.click('.track-tab[data-tab="coaching"]');
  await p4.waitForTimeout(500);
  expectTrack(await p4.evaluate(SNAP, VOUCH), 'coaching', 'a tab narrows the both-state (the funnel resumes)');
  await c4.close();
}

section('the bar pins under the header and stays');
{
  for (const w of [1280, 390]) {
    const { ctx, pg } = await open('#coaching', { width: w });
    for (const frac of [0.45, 0.75]) {
      await pg.evaluate(f => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * f)), frac);
      await pg.waitForTimeout(400);
      const m = await pg.evaluate(() => {
        const nav = document.getElementById('nav');
        return {
          navH: nav.getBoundingClientRect().height,
          navVis: nav.classList.contains('visible'),
          barTop: document.querySelector('.track-tabs').getBoundingClientRect().top,
          barVis: document.querySelector('.track-tabs').getClientRects().length > 0,
        };
      });
      if (!m.navVis) fail(`${w}px: nav not visible at ${frac}`);
      else if (!m.barVis) fail(`${w}px: bar not visible at ${frac}`);
      else if (Math.abs(m.barTop - m.navH) > 1.5) fail(`${w}px: bar not pinned at ${frac} (top=${m.barTop.toFixed(1)}, nav=${m.navH})`);
      else ok(`${w}px: bar pinned at ${m.barTop.toFixed(1)}px at ${frac} scroll`);
    }
    await ctx.close();
  }
}

section('labels: full-word at desktop, short at phone');
{
  const { ctx, pg } = await open('#design', { width: 1280 });
  const s = await pg.evaluate(SNAP, VOUCH);
  if (!s.tabs.design.full || s.tabs.design.short) fail('desktop labels not full-word', JSON.stringify(s.tabs));
  else ok('desktop shows the full labels');
  await ctx.close();
  const { ctx: c2, pg: p2 } = await open('#design', { width: 390 });
  const s2 = await p2.evaluate(SNAP, VOUCH);
  if (!s2.tabs.design.short || s2.tabs.design.full) fail('phone labels not short', JSON.stringify(s2.tabs));
  else ok('phone shows the short labels');
  await c2.close();
}

section('chosen-only prints chosen');
{
  const { ctx, pg } = await open('#design');
  await pg.emulateMedia({ media: 'print' });
  const s = await pg.evaluate(SNAP, VOUCH);
  if (s.coaching.section) fail('print shows the other track');
  else if (!s.design.body) fail('print lost the chosen track');
  else if (s.bar.vis) fail('print shows the tab bar');
  else ok('print carries the chosen track only, no bar');
  await pg.emulateMedia({ media: 'screen' });
  await ctx.close();
}

section('hygiene');
{
  const { ctx, pg } = await open('#coaching');
  const s = await pg.evaluate(SNAP, VOUCH);
  s.ids.length ? fail('duplicate ids', s.ids.join(', ')) : ok('no duplicate ids');
  if (s.hscroll > 0) fail('horizontal scroll at 1280', s.hscroll + 'px');
  await ctx.close();
}

section('viewport × theme sweep — no horizontal scroll, no console errors');
{
  let checked = 0, errs = 0;
  for (const w of SWEEP_WIDTHS) for (const theme of ['dark', 'light']) for (const entry of ['', '#coaching', '#design', '?track=both']) {
    const ctx = await browser.newContext({ colorScheme: theme, viewport: { width: w, height: 844 } });
    if (theme === 'light') await ctx.addInitScript(() => { try { localStorage.setItem('jh-theme', 'light'); } catch (e) {} });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on('pageerror', e => errors.push(String(e).slice(0, 120)));
    pg.on('console', m => { if (m.type() === 'error' && !/net::|ERR_|Failed to fetch|Permissions|font-size:0|401/i.test(m.text())) errors.push(m.text().slice(0, 120)); });
    await pg.goto(PAGE + entry, { waitUntil: 'load' }).catch(async () => {
      await pg.goto(PAGE + entry, { waitUntil: 'load', timeout: 60000 });
    });
    await pg.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
    await pg.waitForTimeout(500);
    const hs = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (hs > 1) fail(`${w}px ${theme} "${entry || 'bare'}" horizontal scroll`, hs + 'px');
    if (errors.length) { errs++; fail(`${w}px ${theme} "${entry || 'bare'}" console errors`, errors.join(' | ')); }
    checked++;
    await ctx.close();
  }
  if (!errs) ok(`${checked} page loads, zero console errors`);
}

} // !MEASURE

// ── --measure: per-tab proportions ──────────────────────────────────────
if (MEASURE) {
  const rows = { track: [], tail: [], doc: [] };
  const cols = [];
  for (const width of [1440, 390]) for (const track of ['coaching', 'design']) {
    cols.push(`${width}px #${track}`);
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: 'dark' });
    const pg = await ctx.newPage();
    await pg.goto(`${PAGE}#${track}`, { waitUntil: 'load' });
    await pg.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
    await pg.waitForTimeout(900);
    const m = await pg.evaluate((track) => {
      const h = sel => { const el = document.querySelector(sel); return el ? Math.round(el.getBoundingClientRect().height) : 0; };
      return {
        track: h('#' + track),
        tail: h('#testimonials') + h('#fit') + h('#book'),
        doc: document.documentElement.scrollHeight,
      };
    }, track);
    rows.track.push(m.track); rows.tail.push(m.tail); rows.doc.push(m.doc);
    await ctx.close();
  }
  const fmt = (v, col) => { const pct = Math.round(v / rows.doc[col] * 100); return `${v}px (${pct}%)`; };
  console.log('\n| | ' + cols.join(' | ') + ' |');
  console.log('|---|---|---|---|');
  console.log('| Track content | ' + rows.track.map((v, i) => fmt(v, i)).join(' | ') + ' |');
  console.log('| **Tail after it** | ' + rows.tail.map((v, i) => fmt(v, i)).join(' | ') + ' |');
  console.log('| Document | ' + rows.doc.map(v => `${v}px`).join(' | ') + ' |');
}

await browser.close();
if (fails.length) { console.log(`\n${fails.length} FAILURE(S)`); process.exit(1); }
console.log('\nALL GREEN');
