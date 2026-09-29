// The editor as claude.ai hosts it (scripts/build-reel-editor.mjs): built, served by a plain
// static server (no dev server, no byte ranges), with a stand-in for claude.ai's `db` and
// `downloads` capabilities, and the viewer's light theme stamped on the page.
//   node "Agent Reference/reel-tests/hosttest.mjs"      exits non-zero on any failure
// Checks: the page plays with no errors and stays dark; a timeline save lands in the store and
// the reload plays it; a synth-rack change lands in the store and survives a reload; Revert goes
// back to the file; without the capabilities the page still plays and keeps drafts.
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

// a stand-in for the viewer: window.claude.use('db' | 'downloads'), the store kept in localStorage
// so it outlives the reloads saves cause; data-theme="light" as a light-theme viewer sets it
const FAKE = () => {
  const K = 'fake-db:';
  const doc = path => ({
    async get() { const v = localStorage.getItem(K + path); return v ? { exists: true, id: path, data: () => JSON.parse(v) } : { exists: false, id: path, data: () => undefined }; },
    async set(d) { localStorage.setItem(K + path, JSON.stringify(d)); },
    async delete() { localStorage.removeItem(K + path); },
  });
  window.__saved = [];
  window.claude = { use: async name => name === 'db' ? { doc } : name === 'downloads' ? { save: async r => { window.__saved.push(r); return { status: 'saved' }; } } : null };
  // an init script can run before <html> exists: stamp the theme as soon as it does
  const light = () => document.documentElement && document.documentElement.setAttribute('data-theme', 'light');
  light(); document.addEventListener('readystatechange', light);
};
const store = (page, f) => page.evaluate(k => localStorage.getItem('fake-db:files/' + k), f).then(v => v && JSON.parse(v));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await ctx.addInitScript(FAKE);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const ready = () => page.waitForFunction(() => window.REEL_LIVE && window.REEL_RACK && window.REEL_RACK.parsed, null, { timeout: 60000 });
  await page.goto(URL0 + '#t=21&pause=1'); await ready();
  const live = await page.evaluate(() => ({ host: REEL_LIVE.host, dev: REEL_LIVE.dev, hosted: REEL_LIVE.hosted, hello: !!document.getElementById('reel-hello'),
    theme: document.documentElement.getAttribute('data-theme'), ink: getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim(),
    sea: getComputedStyle(document.documentElement).getPropertyValue('--sea-deep').trim() }));
  ok(live.host === 'claude.ai' && !live.dev && !live.hosted, `the rig finds its host and no dev server (host ${live.host}, dev ${live.dev})`);
  ok(live.theme === 'light' && live.ink.toLowerCase() === '#b0cedc' && live.sea.toLowerCase() === '#020a12', `a light-theme viewer still gets the dark reel (data-theme ${live.theme}: ink ${live.ink}, sea ${live.sea})`);
  ok(live.hello, 'a first visit shows the how-to card');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, 'editor.png') });

  // a timeline save: the answer runs 5 s
  const ln = await page.evaluate(() => REEL_LIVE.parsed.marks.find(m => m.kind === 'scene' && m.obj === REEL_LIVE.parsed.edit.scenes[2]).ln);
  const next = RS.setDur(readFileSync(join(ROOT, 'Assets/sizzle-reel-2.script.txt'), 'utf8'), ln, 5);
  await Promise.all([page.waitForNavigation(), page.evaluate(t => REEL_LIVE.save(t), next)]);
  await ready();
  const after = await page.evaluate(() => ({ hosted: REEL_LIVE.hosted, dur: REEL_LIVE.parsed.edit.scenes[2].dur, total: REEL_LIVE.duration, at: +(new URLSearchParams(location.hash.slice(1)).get('t') || 0) }));
  const kept = await store(page, 'sizzle-reel-2.script.txt');
  ok(kept && kept.text === next, 'a timeline save lands in the store, the whole script');
  ok(after.hosted && after.dur === 5 && after.total === 60.5, `the reload plays the saved version (answer ${after.dur} s, cut ${after.total} s)`);
  ok(Math.abs(after.at - 21) < 0.6, `and comes back to where it was (${after.at} s)`);

  // a synth-rack change: reverb return 0.62
  await page.evaluate(() => REEL_RACK.change(ReelMusic.setArg(REEL_RACK.src, 'FX', 'reverb', 'return', 0, 0.62)));
  await page.waitForTimeout(1200);
  const score = await store(page, 'sizzle-reel-2.score.txt');
  ok(score && /\n {2}return {3}0\.62\n/.test(score.text), 'a rack change lands in the store');
  await page.reload(); await ready();
  ok(await page.evaluate(() => REEL_RACK.parsed.score.fx.reverb.return) === 0.62, 'and the reload plays it');

  // download goes through the viewer's save dialog
  await page.evaluate(() => REEL_LIVE.download());
  const dl = await page.evaluate(() => window.__saved.map(r => r.filename));
  ok(dl.includes('sizzle-reel-2.script.txt'), 'Download offers the script through the save dialog');

  // revert: back to the file
  await Promise.all([page.waitForNavigation(), page.evaluate(() => REEL_LIVE.discardDraft())]);
  await ready();
  ok(await page.evaluate(() => !REEL_LIVE.hosted && REEL_LIVE.duration === 60) && !(await store(page, 'sizzle-reel-2.script.txt')), 'Revert drops the saved script and plays the file');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));

  // no capabilities at all (a saved copy of the page, another host): it plays, and keeps drafts
  const bare = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p2 = await bare.newPage(); const e2 = []; p2.on('pageerror', e => e2.push(e.message));
  await p2.goto(URL0);
  await p2.waitForFunction(() => window.REEL_LIVE, null, { timeout: 60000 });
  const b2 = await p2.evaluate(() => ({ host: REEL_LIVE.host, dev: REEL_LIVE.dev }));
  ok(b2.host === null && !b2.dev && e2.length === 0, `without claude.ai's capabilities it plays and falls back to drafts (${JSON.stringify(b2)}${e2.length ? ', ' + e2.join(' | ') : ''})`);
} finally {
  await browser.close();
  srv.close();
}
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
