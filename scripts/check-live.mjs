// Post-deploy proof for the live site. There is no CI and GitHub Pages deploys
// straight from main, so the only verifier of what the world actually sees is a
// fetch. Two failures lived through pushes on 2026-09-10 and were found by hand:
// the resume PDF shipped a 404 page (6KB of HTML that renders like a document),
// and pages kept ?v=2.09 refs after the token CSS changed, so every returning
// visitor's cached jh-chrome.css resolved var(--font-mono) to nothing. Both are
// one request away from being caught. Run after a push:
//
//   node scripts/check-live.mjs                                  # live site
//   node scripts/check-live.mjs --base http://127.0.0.1:1337     # a local server
//
// Exits non-zero when the deployed site disagrees with the repo it came from.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const BASE = (arg('base') || 'https://www.johnhanacek.com').replace(/\/+$/, '');

const version = readFileSync(resolve(ROOT, 'scripts/jh-chrome.js'), 'utf8').match(/version:\s*'([^']+)'/)[1];
const pages = [...readFileSync(resolve(ROOT, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map(m => new URL(m[1]).pathname);

const failures = [];
const ok = (name, detail = '') => console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
const bad = (name, detail = '') => { console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); failures.push(name); };

const get = url => fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });

console.log(`check-live — repo version ${version} vs ${BASE}\n\npages`);

await Promise.all(pages.map(async path => {
  try {
    const r = await get(BASE + path);
    if (!r.ok) return bad(path, `HTTP ${r.status}`);
    const html = await r.text();
    const refs = [...html.matchAll(/[A-Za-z0-9_./-]+\.(?:css|js)\?v=([0-9.]+)/g)].map(m => m[1]);
    const stale = [...new Set(refs.filter(v => v !== version))];
    if (stale.length) return bad(path, `stale ?v=${stale.join(', ')} (repo is ${version})`);
    if (!refs.length) return bad(path, 'no ?v= refs — is this the right document?');
    ok(path, `HTTP 200 · ${refs.length} refs at v${version}`);
  } catch (e) { bad(path, e.name === 'TimeoutError' ? 'timeout' : e.message); }
}));

console.log('\nassets');

// The resume must be a real PDF — the incident shipped an HTML 404 under this
// name, and an error page renders, paginates and downloads exactly like one.
try {
  const r = await get(`${BASE}/Assets/JH_Resume_2026_onepage.pdf`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (!r.ok) bad('JH_Resume_2026_onepage.pdf', `HTTP ${r.status}`);
  else if (!buf.subarray(0, 5).equals(Buffer.from('%PDF-'))) bad('JH_Resume_2026_onepage.pdf', `not a PDF (${buf.length}b, starts ${JSON.stringify(buf.subarray(0, 15).toString('latin1'))})`);
  else if (buf.length < 100_000) bad('JH_Resume_2026_onepage.pdf', `${buf.length}b — too small to be the built resume`);
  else ok('JH_Resume_2026_onepage.pdf', `${Math.round(buf.length / 1024)}KB PDF · ${r.headers.get('content-type')}`);
} catch (e) { bad('JH_Resume_2026_onepage.pdf', e.message); }

// A truncated JSON deploy parses as an error page only when you ask it to.
for (const [name, url] of [['john-hanacek.json', `${BASE}/john-hanacek.json`], ['Assets/search-chunks.json', `${BASE}/Assets/search-chunks.json`]]) {
  try {
    const r = await get(url);
    if (!r.ok) { bad(name, `HTTP ${r.status}`); continue; }
    const j = JSON.parse(await r.text());
    const n = Array.isArray(j) ? j.length : j.chunks ? j.chunks.length : Object.keys(j).length;
    ok(name, `parsed · ${n} ${Array.isArray(j) || j.chunks ? 'entries' : 'keys'}`);
  } catch (e) { bad(name, `parse failed — ${e.message}`); }
}

console.log(`\n${failures.length ? `${failures.length} FAILURE${failures.length > 1 ? 'S' : ''}: ${failures.join(' · ')}` : 'ALL PASS'}`);
process.exit(failures.length ? 1 : 0);
