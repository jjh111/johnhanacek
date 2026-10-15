#!/usr/bin/env node
// check-traces-cut.mjs: the gate the OpenProse traces cut passes before it ships.
//
// The traces case study (Agent Reference/OPENPROSE_TRACES_CASE_STUDY_PLAN.md) shows
// ten visualization views running on SYNTHETIC traces. The views and their data
// arrive from another agent as a folder (default: openprose-traces/) shaped like
// jh-deng-template/traces:
//
//   viz/<page>.html     the view, code only
//   lib/data-slot.js    TraceSlot.require(): draws #trace-slot-notice and halts
//                       the page when a required dataset key is missing
//   data/<page>.js      window.TRACE_DATA = { ... } for that view
//
// Checks, in order; any FAIL exits 1:
//   1. structure   every viz page has its data file; lib/data-slot.js exists
//   2. firewall    design-iteration's trace-firewall.mjs finds no client-derived
//                  content (slugs, run ids, passages). It fingerprints the private
//                  corpus in memory and prints only hit kinds, so it is safe to run
//                  here. Not on this machine → FAIL unless --no-firewall.
//   3. render      each view, headless at 1440×900 and 390×844: no slot notice,
//                  no page errors, something drawn (canvas or svg with content)
//   4. weight      data file sizes; WARN past 1 MB (the page loads them on tap)
//   5. synthetic   WARN when a view's rendered text never says "synthetic"; the
//                  case-study page must say it either way
//
//   node scripts/check-traces-cut.mjs [--dir openprose-traces] [--firewall <path>]
//                                     [--no-firewall] [--only <page,page>]
import { chromium } from 'playwright-core';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { serveVerified } from './serve-verified.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const DIR = resolve(ROOT, opt('--dir', 'openprose-traces'));
const FIREWALL = resolve(ROOT, opt('--firewall', '../design-iteration/JHWorking/scripts/trace-firewall.mjs'));
const ONLY = (opt('--only', '') || '').split(',').filter(Boolean);
const NO_FIREWALL = args.includes('--no-firewall');

let fails = 0, warns = 0;
const fail = (m) => { fails++; console.log(`  FAIL  ${m}`); };
const warn = (m) => { warns++; console.log(`  warn  ${m}`); };
const ok = (m) => console.log(`  ok    ${m}`);

console.log(`traces cut: ${relative(ROOT, DIR) || '.'}`);

// 1. structure
console.log('1. structure');
if (!existsSync(join(DIR, 'viz'))) { fail(`no viz/ folder in ${DIR}`); finish(); }
const pages = readdirSync(join(DIR, 'viz')).filter(f => f.endsWith('.html')).map(f => f.replace(/\.html$/, ''))
  .filter(p => !ONLY.length || ONLY.includes(p));
if (!existsSync(join(DIR, 'lib/data-slot.js'))) fail('lib/data-slot.js missing'); else ok('lib/data-slot.js');
for (const p of pages) existsSync(join(DIR, 'data', `${p}.js`)) ? ok(`data/${p}.js`) : fail(`data/${p}.js missing (viz/${p}.html has no dataset)`);

// 2. firewall
console.log('2. firewall');
if (NO_FIREWALL) warn('firewall skipped (--no-firewall): run it before anything ships');
else if (!existsSync(FIREWALL)) fail(`trace-firewall.mjs not found at ${FIREWALL} (pass --firewall <path>, or --no-firewall for a local dry run)`);
else {
  const allow = join(DIR, '.firewall-allow.txt');
  const r = spawnSync('node', [FIREWALL, DIR, '--allow', existsSync(allow) ? allow : '/dev/null'],
    { cwd: dirname(dirname(FIREWALL)), encoding: 'utf8', maxBuffer: 64 << 20 });
  const lines = (r.stdout + r.stderr).split('\n').filter(l => /^(FAIL|WARN)\b|hard hit|PASS|corpus/.test(l));
  lines.forEach(l => console.log('        ' + l.trim()));
  r.status === 0 ? ok('firewall clean') : fail(`firewall exit ${r.status}: no client-derived content may ship`);
}

// 3. render, 4. weight, 5. synthetic
console.log('3–5. render · weight · synthetic');
for (const p of pages) {
  const f = join(DIR, 'data', `${p}.js`);
  if (existsSync(f)) { const kb = statSync(f).size / 1024; (kb > 1024 ? warn : ok)(`data/${p}.js ${kb.toFixed(0)} KB`); }
}
const srv = await serveVerified(dirname(DIR));   // the cut's parent, so a folder outside the repo can be gated too
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(), headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const p of pages) {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      const errs = [];
      page.on('pageerror', e => errs.push(String(e).split('\n')[0].slice(0, 140)));
      const url = `http://127.0.0.1:${srv.port}/${DIR.split('/').pop()}/viz/${p}.html`;
      try {
        const resp = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
        if (!resp || !resp.ok()) { fail(`${p} @${w}: HTTP ${resp ? resp.status() : 'none'}`); await page.close(); continue; }
        await page.waitForTimeout(2500);
        const r = await page.evaluate(() => {
          const notice = document.getElementById('trace-slot-notice');
          const canvases = [...document.querySelectorAll('canvas')].filter(c => c.width > 0 && c.height > 0).length;
          const svgShapes = document.querySelectorAll('svg path, svg rect, svg circle, svg line, svg text').length;
          const text = document.body ? document.body.innerText : '';
          return { notice: notice ? notice.innerText.slice(0, 160) : null, canvases, svgShapes, chars: text.length, synthetic: /synthetic/i.test(text) };
        });
        if (r.notice) fail(`${p} @${w}: slot notice — ${r.notice}`);
        else if (errs.length) fail(`${p} @${w}: ${errs.length} page error(s) — ${errs[0]}`);
        else if (!r.canvases && r.svgShapes < 5 && r.chars < 200) fail(`${p} @${w}: rendered nothing (no canvas, ${r.svgShapes} svg marks, ${r.chars} chars)`);
        else ok(`${p} @${w}: ${r.canvases} canvas, ${r.svgShapes} svg marks, ${r.chars} chars`);
        if (w === 1440 && !r.notice && !r.synthetic) warn(`${p}: the view never says "synthetic" (the case-study page must label it)`);
      } catch (e) { fail(`${p} @${w}: ${String(e).split('\n')[0].slice(0, 140)}`); }
      await page.close();
    }
  }
} finally { await browser.close(); srv.stop && srv.stop(); }
finish();

function finish() {
  console.log(fails ? `\n${fails} FAIL, ${warns} warn — the cut does not ship` : `\nPASS (${warns} warn)`);
  process.exit(fails ? 1 : 0);
}
