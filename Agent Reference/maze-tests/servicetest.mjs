// servicetest.mjs — the services funnel contract (v2.5 "The Funnel").
// Written BEFORE the refactor (plan rule: "Instrument first") so it catches
// regressions instead of describing them.
//
//   node servicetest.mjs            → the contract suite
//   node servicetest.mjs --measure  → chosen-track vs shared-tail pixel table
//
// States live on <html data-track>, written by JS only (the anchor set never
// changes; content forks, anchors don't):
//   (absent)  JS off, or a crawler — the whole page. Never the reverse.
//   chooser   bare load: both tracks folded to equal summary strips, the tail
//             hidden until a door is picked. No remembered choice (URL only).
//   coaching  chosen: the other track's content is display:none (real hiding —
//             assistive tech reads one track), its summary strip waits after
//             the wall instead of interrupting between CTA and proof.
//   design    mirror of coaching.
//   both      ?track=both, or any shared deep link (#testimonials, #fit, #book,
//             legacy #endorsements) — everything shows, doors still there.
// Entry contract: #coaching, #design, ?track=, legacy #design-services and
// #endorsements all land correctly; no anchor ever resolves to nothing.
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

// One snapshot of everything the contract talks about.
const SNAP = () => {
  const vis = el => !!el && el.getClientRects().length > 0;
  const rect = el => { if (!el) return 0; const r = el.getBoundingClientRect(); return Math.round(r.height); };
  const c = document.getElementById('coaching'), d = document.getElementById('design');
  const inBody = sel => vis(document.querySelector(sel));
  return {
    root: document.documentElement.getAttribute('data-track'),
    hash: location.hash,
    coaching: { section: vis(c), body: inBody('#coaching .track-body'), collapsed: c.hasAttribute('data-collapsed'), h: rect(c) },
    design:   { section: vis(d), body: inBody('#design .track-body'),  collapsed: d.hasAttribute('data-collapsed'),  h: rect(d) },
    tail: { testimonials: inBody('#testimonials'), fit: inBody('#fit'), book: inBody('#book') },
    doors: [...document.querySelectorAll('.door')].map(x => ({ track: x.getAttribute('data-door'), vis: vis(x), chosen: x.classList.contains('chosen') })),
    status: { coaching: inBody('#coaching .track-status'), design: inBody('#design .track-status') },
    also: {
      designStrip: inBody('.also-strip[data-for="design"]'),
      coachingStrip: inBody('.also-strip[data-for="coaching"]'),
    },
    toc: [...document.querySelectorAll('.nav-right a')].filter(a => a.getAttribute('aria-current') === 'true').map(a => a.getAttribute('href')),
    ids: (() => { const seen = new Set(), dup = []; document.querySelectorAll('[id]').forEach(e => { if (seen.has(e.id)) dup.push(e.id); seen.add(e.id); }); return dup; })(),
    doc: document.documentElement.scrollHeight,
    hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
};

async function open(path = '', { js = true, theme = 'dark', width = 1280, settle = 800 } = {}) {
  const ctx = await browser.newContext({ javaScriptEnabled: js, colorScheme: theme, viewport: { width, height: 920 } });
  if (theme === 'light') await ctx.addInitScript(() => { try { localStorage.setItem('jh-theme', 'light'); } catch (e) {} });
  const pg = await ctx.newPage();
  await pg.goto(PAGE + path, { waitUntil: 'load' });
  await pg.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await pg.waitForTimeout(settle);
  return { ctx, pg };
}

// ── expected-shape helpers ──────────────────────────────────────────────
function expectChooser(s, label) {
  const bad = [];
  if (s.root !== 'chooser') bad.push('root=' + s.root);
  if (!s.coaching.section || !s.design.section) bad.push('a track strip missing');
  if (s.coaching.body || s.design.body) bad.push('a track body is open pre-choice');
  if (!(s.coaching.collapsed && s.design.collapsed)) bad.push('tracks not both folded');
  if (s.tail.testimonials || s.tail.fit || s.tail.book) bad.push('tail visible pre-choice');
  if (s.doors.filter(d => d.vis).length !== 2) bad.push('doors not all visible');
  if (s.doors.some(d => d.chosen)) bad.push('a door marked chosen pre-choice');
  if (s.also.designStrip || s.also.coachingStrip) bad.push('other-track strip visible pre-choice');
  if (s.status.coaching || s.status.design) bad.push('Viewing status visible pre-choice');
  if (s.toc.length) bad.push('toc aria-current pre-choice');
  bad.length ? fail(label, bad.join('; ')) : ok(label);
}
function expectChosen(s, track, label) {
  const other = track === 'coaching' ? 'design' : 'coaching';
  const bad = [];
  if (s.root !== track) bad.push('root=' + s.root);
  if (!s[track].section || !s[track].body) bad.push(track + ' not open');
  if (s[track].collapsed) bad.push(track + ' still folded');
  if (s[other].section) bad.push(other + ' section visible (must be display:none)');
  if (!s.tail.testimonials || !s.tail.fit || !s.tail.book) bad.push('tail hidden after a choice');
  if (s.also[track + 'Strip']) bad.push('own strip visible');
  if (!s.also[other + 'Strip']) bad.push('other-track strip not after the wall');
  if (!s.status[track]) bad.push('Viewing status missing');
  if (s.status[other]) bad.push('other status visible');
  if (JSON.stringify(s.toc) !== JSON.stringify(['#' + track])) bad.push('toc aria-current=' + JSON.stringify(s.toc));
  const door = s.doors.find(d => d.track === track), od = s.doors.find(d => d.track === other);
  if (!door || !door.vis || !door.chosen) bad.push('chosen door not marked');
  if (!od || !od.vis) bad.push('other door hidden');
  bad.length ? fail(label, bad.join('; ')) : ok(label);
}
function expectBoth(s, label) {
  const bad = [];
  if (s.root !== 'both') bad.push('root=' + s.root);
  if (!s.coaching.body || !s.design.body) bad.push('a track body closed in both-state');
  if (s.coaching.collapsed || s.design.collapsed) bad.push('a track still folded');
  if (!s.tail.testimonials || !s.tail.fit || !s.tail.book) bad.push('tail hidden');
  if (s.also.designStrip || s.also.coachingStrip) bad.push('strip visible in both-state');
  if (s.status.coaching || s.status.design) bad.push('Viewing status in both-state');
  if (s.toc.length) bad.push('toc aria-current in both-state');
  if (s.doors.some(d => d.chosen)) bad.push('a door marked chosen in both-state');
  bad.length ? fail(label, bad.join('; ')) : ok(label);
}

if (!MEASURE) {

section('entry URLs land in the right state');
{
  let { ctx, pg } = await open('');
  expectChooser(await pg.evaluate(SNAP), 'bare services.html → chooser (real choice, no pre-opened track)');
  await ctx.close();

  ({ ctx, pg } = await open('#coaching'));
  let s = await pg.evaluate(SNAP);
  expectChosen(s, 'coaching', '#coaching → coaching chosen'); if (s.hash !== '#coaching') fail('#coaching hash preserved', s.hash);
  await ctx.close();

  ({ ctx, pg } = await open('#design'));
  s = await pg.evaluate(SNAP);
  expectChosen(s, 'design', '#design → design chosen'); if (s.hash !== '#design') fail('#design hash preserved', s.hash);
  await ctx.close();

  ({ ctx, pg } = await open('#design-services'));
  s = await pg.evaluate(SNAP);
  expectChosen(s, 'design', 'legacy #design-services → design chosen'); if (s.hash !== '#design') fail('legacy hash rewritten to #design', s.hash);
  await ctx.close();

  ({ ctx, pg } = await open('#endorsements'));
  s = await pg.evaluate(SNAP);
  expectBoth(s, 'legacy #endorsements → whole page (the promise of the link is kept)');
  if (s.hash !== '#testimonials') fail('#endorsements rewritten to #testimonials', s.hash);
  const at = await pg.evaluate(() => { const r = document.getElementById('testimonials').getBoundingClientRect(); return Math.abs(r.top) < 300; });
  if (!at) fail('#endorsements did not land on the wall');
  await ctx.close();

  for (const [q, want] of [['?track=coaching', 'coaching'], ['?track=design', 'design']]) {
    ({ ctx, pg } = await open(q));
    expectChosen(await pg.evaluate(SNAP), want, `${q} → ${want} chosen`);
    await ctx.close();
  }
  ({ ctx, pg } = await open('?track=both'));
  expectBoth(await pg.evaluate(SNAP), '?track=both → the explicit show-everything escape');
  await ctx.close();
  ({ ctx, pg } = await open('?track=nonsense'));
  expectChooser(await pg.evaluate(SNAP), '?track=nonsense → chooser (unknown param cannot choose)');
  await ctx.close();
}

section('no anchor resolves to nothing');
{
  // Shared anchors on a bare load must show the tail they promise; track
  // anchors must land chosen and scrolled onto the track.
  for (const h of ['#intro', '#proof', '#top']) {
    const { ctx, pg } = await open(h);
    const s = await pg.evaluate(SNAP);
    const vis = await pg.evaluate(a => { const el = document.querySelector(a); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }, h);
    if (!vis) fail(`${h} resolves to nothing (bare)`);
    else ok(`${h} visible on bare load`);
    await ctx.close();
  }
  for (const h of ['#testimonials', '#fit', '#book']) {
    const { ctx, pg } = await open(h);
    const s = await pg.evaluate(SNAP);
    const at = await pg.evaluate(a => { const r = document.querySelector(a).getBoundingClientRect(); return Math.abs(r.top) < 300; }, h);
    if (s.root !== 'both') fail(`${h} did not unhide the tail it promises (root=${s.root})`);
    else if (!at) fail(`${h} did not scroll to the section`);
    else ok(`${h} lands on the section (whole page shown)`);
    await ctx.close();
  }
  for (const h of ['#coaching', '#design']) {
    const { ctx, pg } = await open(h);
    const at = await pg.evaluate(a => { const r = document.querySelector(a).getBoundingClientRect(); return Math.abs(r.top) < 300; }, h);
    if (!at) fail(`${h} did not land on the track head`);
    else ok(`${h} lands on the track head`);
    await ctx.close();
  }
}

section('JS off → the whole page (direction is load-bearing)');
{
  const { ctx, pg } = await open('', { js: false });
  const s = await pg.evaluate(SNAP);
  if (s.root !== null) fail('JS off: root attribute present', String(s.root));
  if (!s.coaching.body || !s.design.body) fail('JS off: a track body closed');
  if (!s.tail.testimonials || !s.tail.fit || !s.tail.book) fail('JS off: tail hidden');
  if (s.coaching.body && s.design.body && s.tail.testimonials && !s.hscroll) ok('JS off shows all content');
  await ctx.close();
  const { ctx: c2, pg: p2 } = await open('#coaching', { js: false });
  const at = await p2.evaluate(() => Math.abs(document.getElementById('coaching').getBoundingClientRect().top) < 300);
  at ? ok('JS off: #coaching native fragment jump works') : fail('JS off: #coaching native jump broken');
  await c2.close();
}

section('the doors are load-bearing (chooser → chosen interactions)');
{
  const { ctx, pg } = await open('');
  await pg.click('.door[data-door="coaching"]');
  await pg.waitForTimeout(500);
  let s = await pg.evaluate(SNAP);
  expectChosen(s, 'coaching', 'clicking a door chooses (bare pre-choice is not sticky)');
  if (s.hash !== '#coaching') fail('door click wrote the URL', s.hash);

  // switch affordances: status link, also-strip, TOC, hash edit
  await pg.click('#coaching .track-status a');
  await pg.waitForTimeout(600);
  s = await pg.evaluate(SNAP);
  expectChosen(s, 'design', '"Viewing: coaching · switch" link switches');
  if (s.hash !== '#design') fail('status switch wrote the URL', s.hash);

  await pg.evaluate(() => document.querySelector('.also-strip[data-for="coaching"] .track-open').click());
  await pg.waitForTimeout(600);
  s = await pg.evaluate(SNAP);
  expectChosen(s, 'coaching', 'the other-track strip (after the wall) switches back');
  const backAtTrack = await pg.evaluate(() => Math.abs(document.getElementById('coaching').getBoundingClientRect().top) < 300);
  if (!backAtTrack) fail('also-strip switch did not travel to the track');

  // the TOC carries the other track and switches on click
  await pg.click('.nav-right a[href="#design"]');
  await pg.waitForTimeout(600);
  s = await pg.evaluate(SNAP);
  expectChosen(s, 'design', 'TOC deep link switches tracks (never hides them)');

  // back/forward follows the URL contract
  await pg.goBack(); await pg.waitForTimeout(500);
  s = await pg.evaluate(SNAP);
  if (s.root !== 'coaching') fail('back button did not restore the previous track', s.root);
  else ok('back button restores the previous track');
  await ctx.close();

  // chooser Open button opens in place and focuses the heading
  const { ctx: c2, pg: p2 } = await open('');
  await p2.click('#design .track-open');
  await p2.waitForTimeout(500);
  s = await p2.evaluate(SNAP);
  expectChosen(s, 'design', 'chooser summary-strip Open chooses');
  const focus = await p2.evaluate(() => document.activeElement && document.activeElement.textContent.trim().slice(0, 30));
  if (!/Founding Design/i.test(focus || '')) fail('chooser Open did not focus the track heading', focus);
  await c2.close();

  // choosing from 'both' narrows again
  const { ctx: c3, pg: p3 } = await open('?track=both');
  await p3.click('.door[data-door="design"]');
  await p3.waitForTimeout(500);
  expectChosen(await p3.evaluate(SNAP), 'design', 'a door narrows the both-state (the funnel resumes)');
  await c3.close();
}

section('chosen-only prints chosen');
{
  const { ctx, pg } = await open('#design');
  await pg.emulateMedia({ media: 'print' });
  const s = await pg.evaluate(SNAP);
  if (s.coaching.section) fail('print shows the other track');
  else if (!s.design.body) fail('print lost the chosen track');
  else ok('print carries the chosen track only');
  await pg.emulateMedia({ media: 'screen' });
  await ctx.close();
}

section('hygiene');
{
  const { ctx, pg } = await open('#coaching');
  const s = await pg.evaluate(SNAP);
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
      // one retry — a busy machine can starve the 30s load window once
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

// ── --measure: the plan's table ─────────────────────────────────────────
// Chosen track  = the chosen track section's height.
// Shared tail   = wall + fit + book + the other-track strip (tail content).
// Document      = scrollHeight. Pre-fork (header + intro + doors + proof +
//                 margins) is the remainder.
if (MEASURE) {
  const rows = { chosen: [], tail: [], doc: [] };
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
      const strip = h('.also-strip[data-for="' + (track === 'coaching' ? 'design' : 'coaching') + '"]');
      return {
        chosen: h('#' + track),
        tail: h('#testimonials') + h('#fit') + h('#book') + strip,
        doc: document.documentElement.scrollHeight,
      };
    }, track);
    rows.chosen.push(m.chosen); rows.tail.push(m.tail); rows.doc.push(m.doc);
    await ctx.close();
  }
  const chooserHeights = {};
  for (const width of [1440, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: 'dark' });
    const pg = await ctx.newPage();
    await pg.goto(PAGE, { waitUntil: 'load' });
    await pg.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
    await pg.waitForTimeout(900);
    chooserHeights[width] = await pg.evaluate(() => document.documentElement.scrollHeight);
    await ctx.close();
  }
  const fmt = (v, col) => { const pct = Math.round(v / rows.doc[col] * 100); return `${v}px (${pct}%)`; };
  console.log('\n| | ' + cols.join(' | ') + ' |');
  console.log('|---|---|---|---|');
  console.log('| Chosen track | ' + rows.chosen.map((v, i) => fmt(v, i)).join(' | ') + ' |');
  console.log('| **Shared tail after it** | ' + rows.tail.map((v, i) => fmt(v, i)).join(' | ') + ' |');
  console.log('| Document | ' + rows.doc.map((v, i) => `${v}px`).join(' | ') + ' |');
  console.log('| Chooser (bare) document | ' + `1440: ${chooserHeights[1440]}px` + ' | ' + `390: ${chooserHeights[390]}px` + ' | — | — |');
}

await browser.close();
if (fails.length) { console.log(`\n${fails.length} FAILURE(S)`); process.exit(1); }
console.log('\nALL GREEN');
