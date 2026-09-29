// The editor as claude.ai hosts it (scripts/build-reel-editor.mjs): built, served by a plain
// static server (no dev server, no byte ranges), with a stand-in for claude.ai's `db` and
// `downloads` capabilities, and the viewer's light theme stamped on the page.
//   node "Agent Reference/reel-tests/hosttest.mjs"      exits non-zero on any failure
// Checks: the page starts without asking the viewer anything and stays dark; the first save asks,
// lands in the store, and the reload plays it at once; a synth-rack change does the same; Revert
// goes back to the file; a grant from before loads the saved version in a new tab; a slow store
// never holds the start (the saved version is offered when it arrives); a viewer's no turns saves
// into tab drafts; without the capabilities the page still plays and keeps drafts.
// Builds into .local/reel-tests/host/editor and writes a screenshot there.
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import net from 'node:net';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, '.local/reel-tests/host'), SITE = join(OUT, 'editor');
mkdirSync(OUT, { recursive: true });
const RS = createRequire(import.meta.url)(join(ROOT, 'scripts/reel-script.js'));
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const b = spawnSync(process.execPath, [join(ROOT, 'scripts/build-reel-editor.mjs'), `--out=${SITE}`], { encoding: 'utf8' });
ok(b.status === 0, 'the editor builds' + (b.status ? ': ' + b.stderr : ''));
const page0 = readFileSync(join(SITE, 'index.html'), 'utf8');
ok(/^<title>Sizzle Reel Editor<\/title>/.test(page0) && !/<!DOCTYPE|<html|<head>|<body/i.test(page0) && !/\.\.\//.test(page0), 'the page starts with its title, has no document shell of its own, and never climbs above itself');

const port = await new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
// a plain static server, UTF-8 like the page wrapper claude.ai adds, no byte ranges, no /__reel/*
const TYPES = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', txt: 'text/plain', svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4' };
const srv = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  const f = join(SITE, rel);
  if (!f.startsWith(SITE + '/') || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  const ext = f.split('.').pop(), t = TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': /^(text|application\/json|image\/svg)/.test(t) ? t + '; charset=utf-8' : t });
  res.end(readFileSync(f));
}).listen(port, '127.0.0.1');
const URL0 = `http://127.0.0.1:${port}/index.html`;

// A stand-in for the viewer: window.claude.use('db' | 'permissions' | 'downloads'), the store kept
// in localStorage so it outlives the reloads saves cause. Like claude.ai, a store call waits on the
// viewer's consent the first time: the test answers it with window.__answer(yes). The answer is not
// remembered across reloads unless localStorage 'fake-standing' holds one (a grant from before).
// 'fake-slow' makes every read take that many ms. data-theme="light" as a light-theme viewer sets it.
const FAKE = () => {
  const K = 'fake-db:';
  let consent = localStorage.getItem('fake-standing') || 'prompt';
  const waiting = [];
  window.__ask = 0;
  const no = () => ({ code: 'not_granted', message: 'the viewer said no' });
  const gate = () => consent === 'granted' ? Promise.resolve() : consent === 'denied' ? Promise.reject(no())
    : new Promise((res, rej) => { window.__ask++; waiting.push([res, rej]); });
  window.__answer = yes => { consent = yes ? 'granted' : 'denied'; waiting.splice(0).forEach(([res, rej]) => yes ? res() : rej(no())); };
  const slow = +(localStorage.getItem('fake-slow') || 0);
  const doc = path => ({
    async get() {
      await gate(); if (slow) await new Promise(r => setTimeout(r, slow));
      const v = localStorage.getItem(K + path);
      return v ? { exists: true, id: path, data: () => JSON.parse(v) } : { exists: false, id: path, data: () => undefined };
    },
    async set(d) { await gate(); localStorage.setItem(K + path, JSON.stringify(d)); },
    async delete() { await gate(); localStorage.removeItem(K + path); },
  });
  window.__saved = [];
  window.claude = { use: async name => name === 'db' ? { doc }
    : name === 'permissions' ? { state: async n => n === 'db' ? consent : 'unavailable', request: async () => ({ db: consent }) }
    : name === 'downloads' ? { save: async r => { window.__saved.push(r); return { status: 'saved' }; } } : null };
  // an init script can run before <html> exists: stamp the theme as soon as it does
  const light = () => document.documentElement && document.documentElement.setAttribute('data-theme', 'light');
  light(); document.addEventListener('readystatechange', light);
};
const store = (page, f) => page.evaluate(k => localStorage.getItem('fake-db:files/' + k), f).then(v => v && JSON.parse(v));
const SCRIPT = readFileSync(join(ROOT, 'Assets/sizzle-reel-2.script.txt'), 'utf8');
const P0 = RS.parse(SCRIPT), ANSWER = P0.marks.find(m => m.kind === 'scene' && m.obj === P0.edit.scenes[2]).ln;   // the answer runs 4.5 s
const answerTheFirstAsk = async (page, yes) => { await page.waitForFunction(() => window.__ask > 0, null, { timeout: 15000 }); await page.evaluate(y => window.__answer(y), yes); };
const started = page => page.waitForFunction(() => window.REEL_LIVE && window.REEL_RACK && window.REEL_RACK.parsed && !document.getElementById('boot'), null, { timeout: 60000 });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), args: ['--autoplay-policy=no-user-gesture-required'] });
const fresh = async () => { const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } }); await ctx.addInitScript(FAKE); const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); return { ctx, page, errs }; };
try {
  // ── a first visit: nothing asked while it starts, the first save asks ──
  {
    const { page, errs } = await fresh();
    const t0 = Date.now();
    await page.goto(URL0 + '#t=21&pause=1'); await started(page);
    const live = await page.evaluate(() => ({ host: REEL_LIVE.host, dev: REEL_LIVE.dev, hosted: REEL_LIVE.hosted, asked: window.__ask, hello: !!document.getElementById('reel-hello'),
      theme: document.documentElement.getAttribute('data-theme'), ink: getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim(),
      sea: getComputedStyle(document.documentElement).getPropertyValue('--sea-deep').trim() }));
    ok(live.asked === 0, `the reel starts without asking the viewer anything (${((Date.now() - t0) / 1000).toFixed(1)} s to the first frame)`);
    ok(live.host === 'claude.ai' && !live.dev && !live.hosted, `the rig finds its host and no dev server (host ${live.host}, dev ${live.dev})`);
    ok(live.theme === 'light' && live.ink.toLowerCase() === '#b0cedc' && live.sea.toLowerCase() === '#020a12', `a light-theme viewer still gets the dark reel (data-theme ${live.theme}: ink ${live.ink}, sea ${live.sea})`);
    ok(live.hello, 'a first visit shows the how-to card');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(OUT, 'editor.png') });

    // a timeline save: the answer runs 5 s; it waits on the viewer's yes, then lands
    const ln = await page.evaluate(() => REEL_LIVE.parsed.marks.find(m => m.kind === 'scene' && m.obj === REEL_LIVE.parsed.edit.scenes[2]).ln);
    const next = RS.setDur(SCRIPT, ln, 5);
    const nav = page.waitForNavigation();
    await page.evaluate(t => { window.__saving = REEL_LIVE.save(t); }, next);
    await answerTheFirstAsk(page, true);
    await nav; await started(page);
    const after = await page.evaluate(() => ({ hosted: REEL_LIVE.hosted, dur: REEL_LIVE.parsed.edit.scenes[2].dur, total: REEL_LIVE.duration, asked: window.__ask, at: +(new URLSearchParams(location.hash.slice(1)).get('t') || 0) }));
    const kept = await store(page, 'sizzle-reel-2.script.txt');
    ok(kept && kept.text === next, 'the first save asks, and after a yes the whole script lands in the store');
    ok(after.hosted && after.dur === 5 && after.total === 60.5 && after.asked === 0, `the reload plays the saved version at once, asking nothing (answer ${after.dur} s, cut ${after.total} s)`);
    ok(Math.abs(after.at - 21) < 0.6, `and comes back to where it was (${after.at} s)`);

    // a synth-rack change: reverb return 0.62 (this load has not been answered yet, so it asks)
    await page.evaluate(() => REEL_RACK.change(ReelMusic.setArg(REEL_RACK.src, 'FX', 'reverb', 'return', 0, 0.62)));
    await answerTheFirstAsk(page, true);
    await page.waitForTimeout(800);
    const score = await store(page, 'sizzle-reel-2.score.txt');
    ok(score && /\n {2}return {3}0\.62\n/.test(score.text), 'a rack change lands in the store');
    await page.reload(); await started(page);
    ok(await page.evaluate(() => REEL_RACK.parsed.score.fx.reverb.return) === 0.62, 'and the reload plays it');

    // download goes through the viewer's save dialog
    await page.evaluate(() => REEL_LIVE.download());
    ok((await page.evaluate(() => window.__saved.map(r => r.filename))).includes('sizzle-reel-2.script.txt'), 'Download offers the script through the save dialog');

    // revert: back to the file
    const nav2 = page.waitForNavigation();
    await page.evaluate(() => { window.__reverting = REEL_LIVE.discardDraft(); });
    await answerTheFirstAsk(page, true);
    await nav2; await started(page);
    ok(await page.evaluate(() => !REEL_LIVE.hosted && REEL_LIVE.duration === 60) && !(await store(page, 'sizzle-reel-2.script.txt')), 'Revert drops the saved script and plays the file');
    ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  }

  // ── another day, a new tab: a grant from before, and the saved version in the store ──
  {
    const { page, errs } = await fresh();
    await page.goto(URL0); await started(page);
    await page.evaluate(t => { localStorage.setItem('fake-standing', 'granted'); localStorage.setItem('fake-db:files/sizzle-reel-2.script.txt', JSON.stringify({ text: t })); }, RS.setDur(SCRIPT, ANSWER, 5));
    await page.reload(); await started(page);
    const r = await page.evaluate(() => ({ hosted: REEL_LIVE.hosted, total: REEL_LIVE.duration }));
    ok(r.hosted && r.total === 60.5, `a new tab with a grant from before plays the saved version from the store (cut ${r.total} s)`);

    // a slow store: the reel starts on the file, then offers the saved version when it arrives
    await page.evaluate(() => localStorage.setItem('fake-slow', '4000'));
    const t0 = Date.now();
    await page.reload(); await started(page);
    const took = (Date.now() - t0) / 1000, first = await page.evaluate(() => REEL_LIVE.hosted);
    await page.waitForSelector('#reel-late', { timeout: 10000 }).catch(() => null);
    const late = await page.evaluate(() => !!document.getElementById('reel-late'));
    ok(!first && took < 8 && late, `a slow store never holds the reel (started in ${took.toFixed(1)} s on the file), and the saved version is offered when it arrives`);
    ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  }

  // ── a viewer who says no: the save becomes a draft in the tab ──
  {
    const { page, errs } = await fresh();
    await page.goto(URL0); await started(page);
    const nav = page.waitForNavigation();
    await page.evaluate(t => { window.__saving = REEL_LIVE.save(t); }, RS.setDur(SCRIPT, ANSWER, 5));
    await answerTheFirstAsk(page, false);
    await nav; await started(page);
    const r = await page.evaluate(() => ({ draft: REEL_LIVE.draft, hosted: REEL_LIVE.hosted, total: REEL_LIVE.duration }));
    ok(r.draft && !r.hosted && r.total === 60.5, `a no keeps the save as a draft in the tab (draft ${r.draft}, cut ${r.total} s)`);
    ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  }

  // ── no capabilities at all (a saved copy of the page, another host): it plays, and keeps drafts ──
  {
    const bare = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const p2 = await bare.newPage(); const e2 = []; p2.on('pageerror', e => e2.push(e.message));
    await p2.goto(URL0);
    await p2.waitForFunction(() => window.REEL_LIVE && !document.getElementById('boot'), null, { timeout: 60000 });
    const b2 = await p2.evaluate(() => ({ host: REEL_LIVE.host, dev: REEL_LIVE.dev }));
    ok(b2.host === 'claude.ai' && !b2.dev && e2.length === 0, `without claude.ai's capabilities it still plays (${JSON.stringify(b2)}${e2.length ? ', ' + e2.join(' | ') : ''})`);
    const nav = p2.waitForNavigation();
    await p2.evaluate(t => REEL_LIVE.save(t), RS.setDur(SCRIPT, ANSWER, 5));
    await nav; await p2.waitForFunction(() => window.REEL_LIVE && !document.getElementById('boot'), null, { timeout: 60000 });
    ok(await p2.evaluate(() => REEL_LIVE.draft && REEL_LIVE.duration === 60.5), 'and a save there becomes a draft in the tab');
  }
} finally {
  await browser.close();
  srv.close();
}
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
